export type ConversationErrorCategory =
  "session" | "history" | "validation" | "unknown";

export interface ConversationError {
  code: string;
  message: string;
  category: ConversationErrorCategory;
}
