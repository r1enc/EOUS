import type { ProviderRequest } from "./request";
import type { ProviderResponse } from "./response";

export interface ProviderAuth {
  apiKey?: string;
  token?: string;
}

export interface ProviderConfig {
  baseUrl?: string;
  auth?: ProviderAuth;
  timeoutMs?: number;
}

export interface ProviderCapabilities {
  contextWindow: number;
  supportsSystemInstructions: boolean;
  supportsFunctionCalling: boolean;
  supportsVision: boolean;
  maxOutputTokens?: number;
}

export interface Provider {
  id: string;
  name: string;
  capabilities: ProviderCapabilities;
  config?: ProviderConfig;
  generateCompletion(request: ProviderRequest): Promise<ProviderResponse>;
}
