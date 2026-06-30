export type ProviderErrorCategory =
  | "api_error"
  | "rate_limit"
  | "authentication"
  | "validation"
  | "timeout"
  | "unknown";

export interface ProviderError {
  code: string;
  message: string;
  category: ProviderErrorCategory;
}
