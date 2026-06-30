export type AgentLifecycleState =
  | "idle"
  | "intent_analyzing"
  | "reasoning"
  | "planning"
  | "verifying_permissions"
  | "executing_tools"
  | "generating_response"
  | "completed"
  | "failed";

export interface AgentLifecycleEvent {
  state: AgentLifecycleState;
  timestamp: string;
  message?: string;
  details?: Record<string, unknown>;
}
