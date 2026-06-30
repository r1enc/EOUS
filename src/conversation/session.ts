import type { ConversationHistory } from "./history";
import type { ConversationContext } from "./context";

export interface ConversationSession {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  history: ConversationHistory;
  context: ConversationContext;
  metadata?: Record<string, unknown>;
}
