import type { AgentRequest } from "./request";
import type { AgentResponse } from "./response";
import type { AgentStreamEvent } from "./stream";

export interface Agent {
  id: string;
  name: string;
  execute(request: AgentRequest): Promise<AgentResponse>;
  executeStream?(request: AgentRequest): AsyncIterable<AgentStreamEvent>;
}
