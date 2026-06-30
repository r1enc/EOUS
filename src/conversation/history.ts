export type ConversationMessageRole = "user" | "assistant" | "system" | "tool";

export interface ConversationMessage {
  id: string;
  role: ConversationMessageRole;
  content: string;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

export interface ConversationHistory {
  messages: ConversationMessage[];
}
