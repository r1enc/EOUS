import { invoke } from "@tauri-apps/api/core";

import type { RuntimeProviderId } from "../intelligence/provider-runtime/registerRuntimeProviders";
import { getSqliteConnection } from "./database/connection";
import {
  validateProviderSettings,
  type ProviderConfigurationStorage,
  type ProviderCredential,
  type ProviderSettings
} from "./provider-configuration";

type SqliteConnection = Awaited<ReturnType<typeof getSqliteConnection>>;
type Dependencies = {
  getConnection: () => Promise<SqliteConnection>;
  invokeCommand: typeof invoke;
};

const SETTINGS_KEY = "provider_settings.v1";
const selectSettings = "SELECT value FROM app_settings WHERE key = $1";
const upsertSettings =
  "INSERT INTO app_settings (key, value, updated_at) VALUES ($1, $2, $3) " +
  "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at";

type SettingRow = { value: unknown };

export function createPersistentProviderConfigurationStorage(
  dependencies: Dependencies = {
    getConnection: getSqliteConnection,
    invokeCommand: invoke
  }
): ProviderConfigurationStorage {
  return {
    async loadSettings(): Promise<unknown | null> {
      const database = await dependencies.getConnection();
      const rows = await database.select<SettingRow[]>(selectSettings, [
        SETTINGS_KEY
      ]);
      if (rows.length === 0) return null;
      if (rows.length !== 1 || typeof rows[0]?.value !== "string") return {};
      try {
        return JSON.parse(rows[0].value);
      } catch {
        // A present but corrupt row must be invalid, never missing.
        return {};
      }
    },

    async replaceSettings(settings: ProviderSettings): Promise<void> {
      const validated = validateProviderSettings(settings);
      if (!validated.success) throw new Error("Provider settings are invalid");
      const clean = {
        providers: validated.value.providers,
        preference: validated.value.preference
      };
      const database = await dependencies.getConnection();
      await database.execute(upsertSettings, [
        SETTINGS_KEY,
        JSON.stringify(clean),
        Date.now()
      ]);
    },

    async loadCredential(
      providerId: RuntimeProviderId
    ): Promise<unknown | null> {
      const result: unknown = await dependencies.invokeCommand(
        "get_provider_credential",
        { providerId }
      );
      if (typeof result !== "object" || result === null) return {};
      const response = result as Record<string, unknown>;
      if (response.state === "missing") return null;
      if (response.state !== "found") return {};
      if (response.kind === "apiKey") return { apiKey: response.value };
      if (response.kind === "token") return { token: response.value };
      return {};
    },

    async replaceCredential(
      providerId: RuntimeProviderId,
      credential: ProviderCredential
    ): Promise<void> {
      const kind = "apiKey" in credential ? "apiKey" : "token";
      const value = kind === "apiKey" ? credential.apiKey : credential.token;
      await dependencies.invokeCommand("set_provider_credential", {
        providerId,
        kind,
        value
      });
    },

    async removeCredential(providerId: RuntimeProviderId): Promise<void> {
      await dependencies.invokeCommand("remove_provider_credential", {
        providerId
      });
    }
  };
}
