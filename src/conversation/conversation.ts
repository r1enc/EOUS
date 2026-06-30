import type { ConversationRequest } from "./request";
import type { ConversationResponse } from "./response";

export interface Conversation {
  id: string;
  title: string;
  execute(request: ConversationRequest): Promise<ConversationResponse>;
}
