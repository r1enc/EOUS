import type { ProviderRequest } from "./request";
import type { ProviderResponse } from "./response";

export interface Provider {
  id: string;
  name: string;
  generateCompletion(request: ProviderRequest): Promise<ProviderResponse>;
}
