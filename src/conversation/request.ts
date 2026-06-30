import type { ConversationContext } from "./context";

export interface ConversationRequest {
  id: string;
  prompt: string;
  context?: ConversationContext;
}
