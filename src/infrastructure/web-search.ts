import { invoke } from "@tauri-apps/api/core";
import {
  WebSearchBackendError,
  type WebSearchBackend
} from "../tools/builtin/web-search/web-search";

type InvokeCommand = typeof invoke;

export type WebSearchCredentialStatus =
  "configured" | "not_configured" | "invalid" | "unavailable";

export interface WebSearchSettingsBoundary {
  status(): Promise<WebSearchCredentialStatus>;
  save(key: string): Promise<void>;
  remove(): Promise<void>;
}

export function createTauriWebSearchBackend(
  invokeCommand: InvokeCommand = invoke
): WebSearchBackend {
  return {
    async search(query) {
      try {
        return await invokeCommand<unknown>("search_web", { query });
      } catch (error) {
        if (error === "SEARCH_NOT_CONFIGURED")
          throw new WebSearchBackendError("not_configured");
        if (error === "SEARCH_CREDENTIAL_UNAVAILABLE")
          throw new WebSearchBackendError("credential_unavailable");
        if (error === "SEARCH_INVALID_RESPONSE")
          throw new WebSearchBackendError("invalid_response");
        throw new WebSearchBackendError("transport_failed");
      }
    }
  };
}

export function createWebSearchSettingsBoundary(
  invokeCommand: InvokeCommand = invoke
): WebSearchSettingsBoundary {
  return {
    async status() {
      try {
        const state: unknown = await invokeCommand(
          "get_web_search_credential_status"
        );
        if (
          state === "configured" ||
          state === "not_configured" ||
          state === "invalid"
        )
          return state;
      } catch {
        // Never display a native credential error.
      }
      return "unavailable";
    },
    async save(key) {
      if (!key.trim() || /[\r\n]/u.test(key))
        throw new Error("Web search credential is invalid");
      try {
        await invokeCommand("set_web_search_credential", { key });
      } catch {
        throw new Error("Web search credential could not be saved");
      }
    },
    async remove() {
      try {
        await invokeCommand("remove_web_search_credential");
      } catch {
        throw new Error("Web search credential could not be removed");
      }
    }
  };
}
