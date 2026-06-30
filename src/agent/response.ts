import type { AgentExecutionPlan } from "./planning";

export interface AgentResponse {
  id: string;
  content: string;
  plan?: AgentExecutionPlan;
  status: "success" | "failure";
  error?: {
    code: string;
    message: string;
  };
}
