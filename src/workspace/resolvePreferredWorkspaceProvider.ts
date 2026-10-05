import type { ProviderConfigurationBoundary } from "../infrastructure/provider-configuration";
import type { RuntimeProviderId } from "../intelligence/provider-runtime/registerRuntimeProviders";
import type { ProviderRegistry } from "../intelligence/provider-sdk/registry";

export interface PreferredWorkspaceProvider {
  providerId: RuntimeProviderId;
  model: string;
}

export type PreferredWorkspaceProviderResult =
  | { status: "success"; value: PreferredWorkspaceProvider }
  | {
      status: "failure";
      error: {
        code:
          | "configuration_unavailable"
          | "preference_missing"
          | "provider_unavailable";
        message: string;
      };
    };

const configurationUnavailable = {
  status: "failure",
  error: {
    code: "configuration_unavailable",
    message: "Provider configuration is unavailable"
  }
} as const;
const preferenceMissing = {
  status: "failure",
  error: {
    code: "preference_missing",
    message: "Preferred provider is not configured"
  }
} as const;
const providerUnavailable = {
  status: "failure",
  error: {
    code: "provider_unavailable",
    message: "Preferred provider is unavailable"
  }
} as const;

const providerIds: readonly string[] = ["openai", "gemini", "groq"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** Resolve once at composition time, then pass the value into WorkspaceConfig. */
export async function resolvePreferredWorkspaceProvider(
  configuration: Pick<ProviderConfigurationBoundary, "loadSettings">,
  registry: Pick<ProviderRegistry, "getProvider">
): Promise<PreferredWorkspaceProviderResult> {
  try {
    const loaded = await configuration.loadSettings();
    if (!loaded.success)
      return loaded.error.code === "CONFIG_MISSING"
        ? preferenceMissing
        : configurationUnavailable;

    const settings: unknown = loaded.value;
    if (!isRecord(settings) || !isRecord(settings.providers))
      return configurationUnavailable;
    if (settings.preference === null) return preferenceMissing;
    if (!isRecord(settings.preference)) return configurationUnavailable;

    const { providerId, model } = settings.preference;
    if (
      typeof providerId !== "string" ||
      !providerIds.includes(providerId) ||
      typeof model !== "string" ||
      !model.trim()
    )
      return configurationUnavailable;
    if (
      !Object.prototype.hasOwnProperty.call(settings.providers, providerId) ||
      !isRecord(settings.providers[providerId])
    )
      return providerUnavailable;

    let provider;
    try {
      provider = registry.getProvider(providerId);
    } catch {
      return providerUnavailable;
    }
    if (
      !provider ||
      provider.id !== providerId ||
      typeof provider.generateCompletion !== "function"
    )
      return providerUnavailable;

    return {
      status: "success",
      value: { providerId: providerId as RuntimeProviderId, model }
    };
  } catch {
    return configurationUnavailable;
  }
}
