import type {
  Provider,
  ProviderCapabilities,
  ProviderConfig
} from "./provider";
import type { ProviderError } from "./error";

export class ProviderValidationError extends Error implements ProviderError {
  code: string;
  category: "validation";

  constructor(message: string, code: string = "validation_error") {
    super(message);
    this.name = "ProviderValidationError";
    this.code = code;
    this.category = "validation";
  }
}

export function validateProviderCapabilities(
  capabilities: ProviderCapabilities
): void {
  if (!capabilities) {
    throw new ProviderValidationError(
      "Provider capabilities are required",
      "missing_capabilities"
    );
  }
  if (capabilities.contextWindow <= 0) {
    throw new ProviderValidationError(
      "contextWindow must be greater than 0",
      "invalid_context_window"
    );
  }
  if (
    capabilities.maxOutputTokens !== undefined &&
    capabilities.maxOutputTokens <= 0
  ) {
    throw new ProviderValidationError(
      "maxOutputTokens must be greater than 0",
      "invalid_max_output_tokens"
    );
  }
  if (
    capabilities.maxOutputTokens !== undefined &&
    capabilities.maxOutputTokens > capabilities.contextWindow
  ) {
    throw new ProviderValidationError(
      "maxOutputTokens cannot exceed contextWindow",
      "max_output_tokens_exceeded"
    );
  }
}

export function validateProviderConfig(config?: ProviderConfig): void {
  if (!config) {
    return;
  }
  if (config.baseUrl !== undefined) {
    try {
      new URL(config.baseUrl);
    } catch {
      throw new ProviderValidationError(
        "baseUrl must be a valid URL",
        "invalid_base_url"
      );
    }
  }
  if (config.timeoutMs !== undefined && config.timeoutMs <= 0) {
    throw new ProviderValidationError(
      "timeoutMs must be greater than 0",
      "invalid_timeout"
    );
  }
}

export function validateProvider(provider: Provider): void {
  if (!provider) {
    throw new ProviderValidationError(
      "Provider is required",
      "missing_provider"
    );
  }
  if (
    !provider.id ||
    typeof provider.id !== "string" ||
    provider.id.trim() === ""
  ) {
    throw new ProviderValidationError(
      "Provider id must be a non-empty string",
      "invalid_provider_id"
    );
  }
  if (
    !provider.name ||
    typeof provider.name !== "string" ||
    provider.name.trim() === ""
  ) {
    throw new ProviderValidationError(
      "Provider name must be a non-empty string",
      "invalid_provider_name"
    );
  }
  validateProviderCapabilities(provider.capabilities);
  validateProviderConfig(provider.config);
}

export function checkProviderCompatibility(
  capabilities: ProviderCapabilities,
  requirements: Partial<ProviderCapabilities>
): boolean {
  if (
    requirements.contextWindow !== undefined &&
    capabilities.contextWindow < requirements.contextWindow
  ) {
    return false;
  }
  if (
    requirements.supportsSystemInstructions !== undefined &&
    requirements.supportsSystemInstructions &&
    !capabilities.supportsSystemInstructions
  ) {
    return false;
  }
  if (
    requirements.supportsFunctionCalling !== undefined &&
    requirements.supportsFunctionCalling &&
    !capabilities.supportsFunctionCalling
  ) {
    return false;
  }
  if (
    requirements.supportsVision !== undefined &&
    requirements.supportsVision &&
    !capabilities.supportsVision
  ) {
    return false;
  }
  return true;
}
