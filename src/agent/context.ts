export type AgentMessageRole = "user" | "assistant" | "system" | "tool";

export interface AgentMessage {
  role: AgentMessageRole;
  content: string;
  timestamp: string;
}

export interface AgentContext {
  conversationId: string;
  metadata?: Record<string, unknown>;
  memory?: Record<string, unknown>;
  history?: AgentMessage[];
}
