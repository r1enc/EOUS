import type {
  Provider,
  ProviderCapabilities,
  ProviderConfig
} from "../provider-sdk/provider";
import type { ProviderRegistry } from "../provider-sdk/registry";
import { createGeminiProvider } from "../providers/gemini";
import { createGroqProvider } from "../providers/groq";
import { createOpenAiProvider } from "../providers/openai";

export type RuntimeProviderId = "openai" | "gemini" | "groq";

export interface RuntimeProviderConfiguration {
  config: ProviderConfig;
  capabilities: ProviderCapabilities;
}

export type RuntimeProviderConfigurations = Partial<
  Record<RuntimeProviderId, RuntimeProviderConfiguration>
>;

export type RuntimeProviderRegistrationResult = Record<
  RuntimeProviderId,
  "registered" | "skipped" | "invalid"
>;

const providerIds: RuntimeProviderId[] = ["openai", "gemini", "groq"];
const factories: Record<
  RuntimeProviderId,
  (
    config: ProviderConfig,
    capabilities: ProviderCapabilities,
    fetcher: typeof fetch
  ) => Provider
> = {
  openai: createOpenAiProvider,
  gemini: createGeminiProvider,
  groq: createGroqProvider
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

function validConfiguration(
  value: unknown
): value is RuntimeProviderConfiguration {
  if (!isRecord(value) || !isRecord(value.config)) return false;
  const { config, capabilities } = value;
  if (!isRecord(capabilities)) return false;
  if (
    !Number.isSafeInteger(capabilities.contextWindow) ||
    (capabilities.contextWindow as number) <= 0 ||
    (capabilities.maxOutputTokens !== undefined &&
      (!Number.isSafeInteger(capabilities.maxOutputTokens) ||
        (capabilities.maxOutputTokens as number) <= 0 ||
        (capabilities.maxOutputTokens as number) >
          (capabilities.contextWindow as number))) ||
    typeof capabilities.supportsSystemInstructions !== "boolean" ||
    typeof capabilities.supportsFunctionCalling !== "boolean" ||
    typeof capabilities.supportsVision !== "boolean"
  )
    return false;

  if (
    !isRecord(config.auth) ||
    (config.auth.apiKey !== undefined &&
      typeof config.auth.apiKey !== "string") ||
    (config.auth.token !== undefined &&
      typeof config.auth.token !== "string") ||
    (config.auth.apiKey !== undefined && config.auth.token !== undefined)
  )
    return false;
  const credential = config.auth.apiKey ?? config.auth.token;
  if (
    typeof credential !== "string" ||
    !credential.trim() ||
    /[\r\n]/.test(credential)
  )
    return false;
  if (
    config.timeoutMs !== undefined &&
    (typeof config.timeoutMs !== "number" ||
      !Number.isFinite(config.timeoutMs) ||
      config.timeoutMs <= 0)
  )
    return false;

  if (config.baseUrl !== undefined) {
    if (typeof config.baseUrl !== "string") return false;
    try {
      const base = new URL(config.baseUrl);
      if (
        !["http:", "https:"].includes(base.protocol) ||
        base.username ||
        base.password ||
        base.href.includes("?") ||
        base.href.includes("#")
      )
        return false;
    } catch {
      return false;
    }
  }
  return true;
}

// Registration is explicit; importing this module does not mutate providerRegistry.
export function registerRuntimeProviders(
  registry: ProviderRegistry,
  configurations: RuntimeProviderConfigurations,
  fetcher: typeof fetch = globalThis.fetch
): RuntimeProviderRegistrationResult {
  if (
    !registry ||
    typeof registry.registerProvider !== "function" ||
    !isRecord(configurations) ||
    typeof fetcher !== "function"
  )
    throw new TypeError("Runtime provider registration input is invalid");

  const result: RuntimeProviderRegistrationResult = {
    openai: "skipped",
    gemini: "skipped",
    groq: "skipped"
  };
  for (const id of providerIds) {
    try {
      if (
        !Object.prototype.hasOwnProperty.call(configurations, id) ||
        configurations[id] === undefined
      )
        continue;
      const entry: unknown = configurations[id];
      if (!validConfiguration(entry)) {
        result[id] = "invalid";
        continue;
      }
      registry.registerProvider(
        factories[id](entry.config, entry.capabilities, fetcher)
      );
      result[id] = "registered";
    } catch {
      // A malformed entry or one registry rejection must not block its peers.
      result[id] = "invalid";
    }
  }
  return result;
}
