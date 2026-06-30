import type { AgentRequest } from "./request";
import type { AgentResponse } from "./response";

export interface Agent {
  id: string;
  name: string;
  execute(request: AgentRequest): Promise<AgentResponse>;
}
