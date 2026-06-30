import type { ConversationHistory } from "./history";

export interface ConversationContext {
  conversationId: string;
  metadata?: Record<string, unknown>;
  history?: ConversationHistory;
}
