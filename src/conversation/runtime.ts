import type {
  Agent,
  AgentMessage,
  AgentResponse,
  AgentStreamEvent
} from "../agent";
import type {
  ConversationStorage,
  StoredConversationMessage
} from "../infrastructure/database/conversation-storage";
import type { Conversation } from "./conversation";
import type { ConversationMessage } from "./history";
import {
  findCompletedTurn,
  persistedMessageId,
  toConversationHistory
} from "./persisted-history";
import type { ConversationRequest } from "./request";
import type { ConversationResponse } from "./response";
import type { ConversationStreamEvent } from "./stream";
import { validateConversationRequest } from "./validation";

export type ConversationTurnPersistence = Pick<
  ConversationStorage,
  "getMessages" | "insertCompletedTurn"
>;

export interface ConversationRuntimeOptions {
  initialHistory?: ConversationMessage[];
  persistence?: ConversationTurnPersistence;
  now?: () => number;
}

export class DefaultConversation implements Conversation {
  private readonly messages: ConversationMessage[];

  constructor(
    readonly id: string,
    readonly title: string,
    private readonly agent: Agent,
    private readonly options: ConversationRuntimeOptions = {}
  ) {
    this.messages = structuredClone(options.initialHistory ?? []);
  }

  getHistory(): ConversationMessage[] {
    return structuredClone(this.messages);
  }

  async execute(request: ConversationRequest): Promise<ConversationResponse> {
    for await (const event of this.run(request, false)) {
      if (event.type !== "content") return event.response;
    }
    return failure(
      request?.id ?? "",
      "CONVERSATION_FAILED",
      "Conversation failed"
    );
  }

  executeStream(
    request: ConversationRequest
  ): AsyncIterable<ConversationStreamEvent> {
    return this.run(request, true);
  }

  private async *run(
    request: ConversationRequest,
    stream: boolean
  ): AsyncGenerator<ConversationStreamEvent> {
    try {
      const errors = validateConversationRequest(request);
      if (errors.length > 0) {
        yield {
          type: "failure",
          response: failure(
            request?.id ?? "",
            errors[0].code,
            errors[0].message
          )
        };
        return;
      }
      if (request.context && request.context.conversationId !== this.id) {
        yield {
          type: "failure",
          response: failure(
            request.id,
            "INVALID_CONVERSATION",
            "Conversation ID does not match"
          )
        };
        return;
      }

      let storedRows: StoredConversationMessage[] = [];
      if (this.options.persistence) {
        try {
          storedRows = await this.options.persistence.getMessages(this.id);
        } catch {
          yield {
            type: "failure",
            response: failure(
              request.id,
              "TURN_PERSISTENCE_FAILED",
              "Conversation persistence failed"
            )
          };
          return;
        }
        if (!toConversationHistory(storedRows, this.id)) {
          yield {
            type: "failure",
            response: failure(
              request.id,
              "INVALID_PERSISTED_HISTORY",
              "Stored conversation history is invalid"
            )
          };
          return;
        }
        const existing = findCompletedTurn(
          storedRows,
          this.id,
          request.id,
          request.prompt
        );
        if (existing.kind === "conflict") {
          yield {
            type: "failure",
            response: failure(
              request.id,
              "TURN_INTEGRITY_FAILED",
              "Stored conversation turn conflicts with this request"
            )
          };
          return;
        }
        if (existing.kind === "complete") {
          if (!this.rememberTurn(existing.user, existing.assistant)) {
            yield {
              type: "failure",
              response: failure(
                request.id,
                "TURN_INTEGRITY_FAILED",
                "Conversation history conflicts with stored turn"
              )
            };
            return;
          }
          yield {
            type: "complete",
            response: success(request.id, existing.assistant.content)
          };
          return;
        }
        if (
          this.messages.some(
            (message) =>
              message.id === `${request.id}:user` ||
              message.id === `${request.id}:assistant`
          )
        ) {
          yield {
            type: "failure",
            response: failure(
              request.id,
              "TURN_INTEGRITY_FAILED",
              "Conversation history conflicts with stored turn"
            )
          };
          return;
        }
      }

      const history: AgentMessage[] = (
        request.context?.history?.messages ?? this.messages
      ).map(({ role, content, timestamp }) => ({ role, content, timestamp }));
      const agentRequest = {
        id: request.id,
        prompt: request.prompt,
        context: {
          conversationId: this.id,
          metadata: request.context?.metadata,
          history
        }
      };
      let result: AgentResponse;
      if (stream && typeof this.agent.executeStream === "function") {
        let terminal: AgentResponse | undefined;
        for await (const event of this.agent.executeStream(agentRequest)) {
          if (!validAgentStreamEvent(event, request.id) || terminal) {
            throw new Error("Invalid agent stream");
          }
          if (event.type === "content") {
            yield { type: "content", delta: event.delta };
          } else {
            terminal = event.response;
          }
        }
        if (!terminal) throw new Error("Agent stream ended without a result");
        result = terminal;
      } else {
        result = await this.agent.execute(agentRequest);
      }
      if (result.status === "failure") {
        yield {
          type: "failure",
          response: failure(
            request.id,
            result.error?.code ?? "AGENT_FAILED",
            result.error?.message ?? "Agent execution failed"
          )
        };
        return;
      }

      const latestStored = storedRows.reduce(
        (latest, row) => Math.max(latest, row.createdAt),
        Number.MIN_SAFE_INTEGER
      );
      const timestamp = Math.max(
        this.options.now?.() ?? Date.now(),
        latestStored
      );
      const now = new Date(timestamp).toISOString();
      const user: ConversationMessage = {
        id: `${request.id}:user`,
        role: "user",
        content: request.prompt,
        timestamp: now
      };
      const assistant: ConversationMessage = {
        id: `${request.id}:assistant`,
        role: "assistant",
        content: result.content,
        timestamp: now
      };

      if (this.options.persistence) {
        try {
          await this.options.persistence.insertCompletedTurn(
            {
              id: persistedMessageId(this.id, user.id),
              conversationId: this.id,
              role: user.role,
              content: user.content,
              createdAt: timestamp
            },
            {
              id: persistedMessageId(this.id, assistant.id),
              conversationId: this.id,
              role: assistant.role,
              content: assistant.content,
              createdAt: timestamp
            }
          );
        } catch {
          let outcome;
          try {
            const rows = await this.options.persistence.getMessages(this.id);
            outcome = findCompletedTurn(
              rows,
              this.id,
              request.id,
              request.prompt,
              result.content,
              timestamp
            );
          } catch {
            yield {
              type: "failure",
              response: failure(
                request.id,
                "TURN_PERSISTENCE_FAILED",
                "Conversation persistence failed"
              )
            };
            return;
          }
          if (outcome.kind === "none") {
            yield {
              type: "failure",
              response: failure(
                request.id,
                "TURN_PERSISTENCE_FAILED",
                "Conversation persistence failed"
              )
            };
            return;
          }
          if (outcome.kind === "conflict") {
            yield {
              type: "failure",
              response: failure(
                request.id,
                "TURN_INTEGRITY_FAILED",
                "Stored conversation turn conflicts with this request"
              )
            };
            return;
          }
        }
      }
      if (this.options.persistence) {
        if (!this.rememberTurn(user, assistant)) {
          yield {
            type: "failure",
            response: failure(
              request.id,
              "TURN_INTEGRITY_FAILED",
              "Conversation history conflicts with stored turn"
            )
          };
          return;
        }
      } else {
        this.messages.push(user, assistant);
      }
      yield { type: "complete", response: success(request.id, result.content) };
    } catch {
      yield {
        type: "failure",
        response: failure(
          request?.id ?? "",
          "CONVERSATION_FAILED",
          "Conversation failed"
        )
      };
    }
  }

  private rememberTurn(
    user: ConversationMessage,
    assistant: ConversationMessage
  ): boolean {
    const matches = this.messages.filter(
      (message) => message.id === user.id || message.id === assistant.id
    );
    if (matches.length === 0) {
      this.messages.push(user, assistant);
      return true;
    }
    return (
      matches.length === 2 &&
      matches[0].id === user.id &&
      matches[1].id === assistant.id &&
      matches[0].role === "user" &&
      matches[1].role === "assistant" &&
      matches[0].content === user.content &&
      matches[1].content === assistant.content &&
      matches[0].timestamp === user.timestamp &&
      matches[1].timestamp === assistant.timestamp
    );
  }
}

function validAgentStreamEvent(
  value: unknown,
  requestId: string
): value is AgentStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (event.type === "content") return typeof event.delta === "string";
  if (event.type !== "complete" && event.type !== "failure") return false;
  const response = event.response;
  if (!response || typeof response !== "object") return false;
  const fields = response as Record<string, unknown>;
  return (
    fields.id === requestId &&
    typeof fields.content === "string" &&
    fields.status === (event.type === "complete" ? "success" : "failure")
  );
}

function success(
  id: string,
  content: string
): ConversationResponse & { status: "success" } {
  return { id, content, status: "success" };
}

function failure(
  id: string,
  code: string,
  message: string
): ConversationResponse & { status: "failure" } {
  return { id, content: "", status: "failure", error: { code, message } };
}
