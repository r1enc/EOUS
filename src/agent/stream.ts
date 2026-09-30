import type { AgentResponse } from "./response";

export type AgentStreamEvent =
  | { type: "content"; delta: string }
  | { type: "complete"; response: AgentResponse & { status: "success" } }
  | { type: "failure"; response: AgentResponse & { status: "failure" } };
