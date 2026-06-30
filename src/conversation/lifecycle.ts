export type ConversationLifecycleState =
  | "idle"
  | "initializing"
  | "waiting_for_input"
  | "processing"
  | "generating"
  | "completed"
  | "failed";

export interface ConversationLifecycleEvent {
  state: ConversationLifecycleState;
  timestamp: string;
  message?: string;
  details?: Record<string, unknown>;
}
