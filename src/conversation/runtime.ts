import type { Agent, AgentMessage } from "../agent";
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
    try {
      const errors = validateConversationRequest(request);
      if (errors.length > 0) {
        return failure(request?.id ?? "", errors[0].code, errors[0].message);
      }
      if (request.context && request.context.conversationId !== this.id) {
        return failure(
          request.id,
          "INVALID_CONVERSATION",
          "Conversation ID does not match"
        );
      }

      let storedRows: StoredConversationMessage[] = [];
      if (this.options.persistence) {
        try {
          storedRows = await this.options.persistence.getMessages(this.id);
        } catch {
          return failure(
            request.id,
            "TURN_PERSISTENCE_FAILED",
            "Conversation persistence failed"
          );
        }
        if (!toConversationHistory(storedRows, this.id)) {
          return failure(
            request.id,
            "INVALID_PERSISTED_HISTORY",
            "Stored conversation history is invalid"
          );
        }
        const existing = findCompletedTurn(
          storedRows,
          this.id,
          request.id,
          request.prompt
        );
        if (existing.kind === "conflict") {
          return failure(
            request.id,
            "TURN_INTEGRITY_FAILED",
            "Stored conversation turn conflicts with this request"
          );
        }
        if (existing.kind === "complete") {
          if (!this.rememberTurn(existing.user, existing.assistant)) {
            return failure(
              request.id,
              "TURN_INTEGRITY_FAILED",
              "Conversation history conflicts with stored turn"
            );
          }
          return {
            id: request.id,
            content: existing.assistant.content,
            status: "success"
          };
        }
        if (
          this.messages.some(
            (message) =>
              message.id === `${request.id}:user` ||
              message.id === `${request.id}:assistant`
          )
        ) {
          return failure(
            request.id,
            "TURN_INTEGRITY_FAILED",
            "Conversation history conflicts with stored turn"
          );
        }
      }

      const history: AgentMessage[] = (
        request.context?.history?.messages ?? this.messages
      ).map(({ role, content, timestamp }) => ({
        role,
        content,
        timestamp
      }));
      const result = await this.agent.execute({
        id: request.id,
        prompt: request.prompt,
        context: {
          conversationId: this.id,
          metadata: request.context?.metadata,
          history
        }
      });
      if (result.status === "failure") {
        return failure(
          request.id,
          result.error?.code ?? "AGENT_FAILED",
          result.error?.message ?? "Agent execution failed"
        );
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
            return failure(
              request.id,
              "TURN_PERSISTENCE_FAILED",
              "Conversation persistence failed"
            );
          }
          if (outcome.kind === "none") {
            return failure(
              request.id,
              "TURN_PERSISTENCE_FAILED",
              "Conversation persistence failed"
            );
          }
          if (outcome.kind === "conflict") {
            return failure(
              request.id,
              "TURN_INTEGRITY_FAILED",
              "Stored conversation turn conflicts with this request"
            );
          }
        }
      }
      if (this.options.persistence) {
        if (!this.rememberTurn(user, assistant)) {
          return failure(
            request.id,
            "TURN_INTEGRITY_FAILED",
            "Conversation history conflicts with stored turn"
          );
        }
      } else {
        this.messages.push(user, assistant);
      }
      return { id: request.id, content: result.content, status: "success" };
    } catch {
      return failure(
        request?.id ?? "",
        "CONVERSATION_FAILED",
        "Conversation failed"
      );
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

function failure(
  id: string,
  code: string,
  message: string
): ConversationResponse {
  return { id, content: "", status: "failure", error: { code, message } };
}
