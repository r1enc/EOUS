export interface AgentExecutionStep {
  id: string;
  action: string;
  input: Record<string, unknown>;
  status: "pending" | "running" | "completed" | "failed";
  output?: unknown;
  error?: string;
}

export interface AgentExecutionPlan {
  id: string;
  steps: AgentExecutionStep[];
  status: "planned" | "executing" | "completed" | "failed";
  createdAt: string;
  updatedAt: string;
}
