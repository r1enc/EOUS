import type { AgentContext } from "./context";

export interface AgentRequest {
  id: string;
  prompt: string;
  context?: AgentContext;
}
