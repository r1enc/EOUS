import type { ProviderCapabilities } from "../intelligence/provider-sdk/provider";
import type { RuntimeProviderId } from "../intelligence/provider-runtime/registerRuntimeProviders";

export interface ProviderRuntimeSettings {
  capabilities: ProviderCapabilities;
  baseUrl?: string;
  timeoutMs?: number;
}

export interface ProviderPreference {
  providerId: RuntimeProviderId;
  model: string;
}

export interface ProviderSettings {
  providers: Partial<Record<RuntimeProviderId, ProviderRuntimeSettings>>;
  preference: ProviderPreference | null;
}

export type ProviderCredential =
  { apiKey: string; token?: never } | { token: string; apiKey?: never };

export type ProviderConfigurationErrorCode =
  "CONFIG_MISSING" | "CONFIG_INVALID" | "CONFIG_STORAGE_FAILURE";

export interface ProviderConfigurationError {
  code: ProviderConfigurationErrorCode;
  message: string;
}

export type ProviderConfigurationResult<T> =
  | { success: true; value: T }
  | { success: false; error: ProviderConfigurationError };

// TASK-061 supplies a persistence implementation. Nonsecret and secret methods
// are separate so an ordinary settings read cannot retrieve credentials.
export interface ProviderConfigurationStorage {
  loadSettings(): Promise<unknown | null>;
  replaceSettings(settings: ProviderSettings): Promise<void>;
  loadCredential(providerId: RuntimeProviderId): Promise<unknown | null>;
  replaceCredential(
    providerId: RuntimeProviderId,
    credential: ProviderCredential
  ): Promise<void>;
  removeCredential(providerId: RuntimeProviderId): Promise<void>;
}

export interface ProviderConfigurationBoundary {
  loadSettings(): Promise<ProviderConfigurationResult<ProviderSettings>>;
  replaceSettings(
    settings: ProviderSettings
  ): Promise<ProviderConfigurationResult<void>>;
  loadCredential(
    providerId: RuntimeProviderId
  ): Promise<ProviderConfigurationResult<ProviderCredential>>;
  replaceCredential(
    providerId: RuntimeProviderId,
    credential: ProviderCredential
  ): Promise<ProviderConfigurationResult<void>>;
  removeCredential(
    providerId: RuntimeProviderId
  ): Promise<ProviderConfigurationResult<void>>;
}

const missing: ProviderConfigurationError = {
  code: "CONFIG_MISSING",
  message: "Provider configuration is missing"
};
const invalid: ProviderConfigurationError = {
  code: "CONFIG_INVALID",
  message: "Provider configuration is invalid"
};
const storageFailure: ProviderConfigurationError = {
  code: "CONFIG_STORAGE_FAILURE",
  message: "Provider configuration storage is unavailable"
};

const providerIds: RuntimeProviderId[] = ["openai", "gemini", "groq"];
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const isProviderId = (value: unknown): value is RuntimeProviderId =>
  typeof value === "string" && providerIds.includes(value as RuntimeProviderId);

function validCapabilities(value: unknown): value is ProviderCapabilities {
  if (!isRecord(value)) return false;
  return (
    Number.isSafeInteger(value.contextWindow) &&
    (value.contextWindow as number) > 0 &&
    (value.maxOutputTokens === undefined ||
      (Number.isSafeInteger(value.maxOutputTokens) &&
        (value.maxOutputTokens as number) > 0 &&
        (value.maxOutputTokens as number) <=
          (value.contextWindow as number))) &&
    typeof value.supportsSystemInstructions === "boolean" &&
    typeof value.supportsFunctionCalling === "boolean" &&
    typeof value.supportsVision === "boolean"
  );
}

function validBaseUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const url = new URL(value);
    return (
      ["http:", "https:"].includes(url.protocol) &&
      !url.username &&
      !url.password &&
      !url.href.includes("?") &&
      !url.href.includes("#")
    );
  } catch {
    return false;
  }
}

function validRuntimeSettings(
  value: unknown
): value is ProviderRuntimeSettings {
  if (!isRecord(value) || !validCapabilities(value.capabilities)) return false;
  if (value.baseUrl !== undefined && !validBaseUrl(value.baseUrl)) return false;
  if (
    value.timeoutMs !== undefined &&
    (typeof value.timeoutMs !== "number" ||
      !Number.isFinite(value.timeoutMs) ||
      value.timeoutMs <= 0)
  )
    return false;
  return true;
}

function parseProviderSettings(
  value: unknown
): ProviderConfigurationResult<ProviderSettings> {
  if (!isRecord(value) || !isRecord(value.providers)) {
    return { success: false, error: invalid };
  }
  const providers: ProviderSettings["providers"] = {};
  for (const id of Object.keys(value.providers)) {
    if (!isProviderId(id) || !validRuntimeSettings(value.providers[id])) {
      return { success: false, error: invalid };
    }
    const settings = value.providers[id];
    providers[id] = {
      capabilities: {
        contextWindow: settings.capabilities.contextWindow,
        supportsSystemInstructions:
          settings.capabilities.supportsSystemInstructions,
        supportsFunctionCalling: settings.capabilities.supportsFunctionCalling,
        supportsVision: settings.capabilities.supportsVision,
        ...(settings.capabilities.maxOutputTokens !== undefined
          ? { maxOutputTokens: settings.capabilities.maxOutputTokens }
          : {})
      },
      ...(settings.baseUrl !== undefined ? { baseUrl: settings.baseUrl } : {}),
      ...(settings.timeoutMs !== undefined
        ? { timeoutMs: settings.timeoutMs }
        : {})
    };
  }

  if (value.preference === null) {
    return { success: true, value: { providers, preference: null } };
  }
  if (
    !isRecord(value.preference) ||
    !isProviderId(value.preference.providerId) ||
    typeof value.preference.model !== "string" ||
    !value.preference.model.trim() ||
    providers[value.preference.providerId] === undefined
  )
    return { success: false, error: invalid };
  return {
    success: true,
    value: {
      providers,
      preference: {
        providerId: value.preference.providerId,
        model: value.preference.model
      }
    }
  };
}

export function validateProviderSettings(
  value: unknown
): ProviderConfigurationResult<ProviderSettings> {
  try {
    return parseProviderSettings(value);
  } catch {
    return { success: false, error: invalid };
  }
}

function parseProviderCredential(
  providerId: unknown,
  value: unknown
): ProviderConfigurationResult<ProviderCredential> {
  if (!isProviderId(providerId) || !isRecord(value)) {
    return { success: false, error: invalid };
  }
  const hasKey = Object.prototype.hasOwnProperty.call(value, "apiKey");
  const hasToken = Object.prototype.hasOwnProperty.call(value, "token");
  if (hasKey === hasToken) return { success: false, error: invalid };
  const secret = hasKey ? value.apiKey : value.token;
  if (typeof secret !== "string" || !secret.trim() || /[\r\n]/.test(secret))
    return { success: false, error: invalid };
  return {
    success: true,
    value: hasKey ? { apiKey: secret } : { token: secret }
  };
}

export function validateProviderCredential(
  providerId: unknown,
  value: unknown
): ProviderConfigurationResult<ProviderCredential> {
  try {
    return parseProviderCredential(providerId, value);
  } catch {
    return { success: false, error: invalid };
  }
}

export function createProviderConfigurationBoundary(
  storage: ProviderConfigurationStorage
): ProviderConfigurationBoundary {
  let validStorage = false;
  try {
    validStorage =
      !!storage &&
      typeof storage.loadSettings === "function" &&
      typeof storage.replaceSettings === "function" &&
      typeof storage.loadCredential === "function" &&
      typeof storage.replaceCredential === "function" &&
      typeof storage.removeCredential === "function";
  } catch {
    // Malformed injected storage never contributes its native error text.
  }
  if (!validStorage)
    throw new TypeError("Provider configuration storage is invalid");

  return {
    async loadSettings() {
      try {
        const stored = await storage.loadSettings();
        if (stored === null) return { success: false, error: missing };
        return validateProviderSettings(stored);
      } catch {
        return { success: false, error: storageFailure };
      }
    },
    async replaceSettings(settings) {
      const validated = validateProviderSettings(settings);
      if (!validated.success) return validated;
      try {
        await storage.replaceSettings(validated.value);
        return { success: true, value: undefined };
      } catch {
        return { success: false, error: storageFailure };
      }
    },
    async loadCredential(providerId) {
      if (!isProviderId(providerId)) return { success: false, error: invalid };
      try {
        const stored = await storage.loadCredential(providerId);
        if (stored === null) return { success: false, error: missing };
        return validateProviderCredential(providerId, stored);
      } catch {
        return { success: false, error: storageFailure };
      }
    },
    async replaceCredential(providerId, credential) {
      const validated = validateProviderCredential(providerId, credential);
      if (!validated.success) return validated;
      try {
        await storage.replaceCredential(providerId, validated.value);
        return { success: true, value: undefined };
      } catch {
        return { success: false, error: storageFailure };
      }
    },
    async removeCredential(providerId) {
      if (!isProviderId(providerId)) return { success: false, error: invalid };
      try {
        await storage.removeCredential(providerId);
        return { success: true, value: undefined };
      } catch {
        return { success: false, error: storageFailure };
      }
    }
  };
}
