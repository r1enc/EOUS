export type AgentErrorCategory =
  "execution" | "planning" | "validation" | "context" | "timeout" | "unknown";

export interface AgentError {
  code: string;
  message: string;
  category: AgentErrorCategory;
}
