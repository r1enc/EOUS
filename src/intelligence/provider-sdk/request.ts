export type ProviderMessageRole = "system" | "user" | "assistant";

export interface ProviderMessage {
  role: ProviderMessageRole;
  content: string;
}

export interface ProviderRequestOptions {
  temperature?: number;
  maxTokens?: number;
  topP?: number;
}

export interface ProviderRequest {
  model: string;
  messages: ProviderMessage[];
  options?: ProviderRequestOptions;
}
