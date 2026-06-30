import type { ProviderError } from "./error";

export interface ProviderUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export type ProviderResponse =
  | {
      success: true;
      content: string;
      role: "assistant";
      usage?: ProviderUsage;
    }
  | {
      success: false;
      error: ProviderError;
    };
