import type { Agent, AgentMessage } from "../agent";
import type { Conversation } from "./conversation";
import type { ConversationMessage } from "./history";
import type { ConversationRequest } from "./request";
import type { ConversationResponse } from "./response";
import { validateConversationRequest } from "./validation";

export class DefaultConversation implements Conversation {
  private readonly messages: ConversationMessage[] = [];

  constructor(
    readonly id: string,
    readonly title: string,
    private readonly agent: Agent
  ) {}

  getHistory(): ConversationMessage[] {
    return this.messages.map((message) => ({ ...message }));
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

      const now = new Date().toISOString();
      this.messages.push(
        {
          id: `${request.id}:user`,
          role: "user",
          content: request.prompt,
          timestamp: now
        },
        {
          id: `${request.id}:assistant`,
          role: "assistant",
          content: result.content,
          timestamp: now
        }
      );
      return { id: request.id, content: result.content, status: "success" };
    } catch (error) {
      return failure(
        request?.id ?? "",
        "CONVERSATION_FAILED",
        error instanceof Error ? error.message : "Conversation failed"
      );
    }
  }
}

function failure(
  id: string,
  code: string,
  message: string
): ConversationResponse {
  return { id, content: "", status: "failure", error: { code, message } };
}
