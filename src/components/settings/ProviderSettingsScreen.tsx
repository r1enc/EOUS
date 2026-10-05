import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type { RuntimeProviderId } from "../../intelligence/provider-runtime/registerRuntimeProviders";
import type {
  ProviderConfigurationBoundary,
  ProviderConfigurationResult,
  ProviderCredential,
  ProviderRuntimeSettings,
  ProviderSettings
} from "../../infrastructure/provider-configuration";
import { Button } from "../ui/button";

export interface ProviderDefinition {
  id: RuntimeProviderId;
  name: string;
  runtimeSettings: ProviderRuntimeSettings;
}

export interface ProviderSettingsView {
  boundary: ProviderConfigurationBoundary;
  providers: readonly ProviderDefinition[];
}

type Phase = "loading" | "ready" | "invalid" | "unavailable";
type CredentialKind = "apiKey" | "token";
type Feedback = { kind: "error" | "status"; message: string } | null;
type Draft = { kind: CredentialKind; value: string };
type Drafts = Record<RuntimeProviderId, Draft>;

const emptySettings = (): ProviderSettings => ({
  providers: {},
  preference: null
});
const emptyDrafts = (): Drafts => ({
  openai: { kind: "apiKey", value: "" },
  gemini: { kind: "apiKey", value: "" },
  groq: { kind: "apiKey", value: "" }
});

interface ScreenState {
  source: ProviderSettingsView;
  phase: Phase;
  settings: ProviderSettings;
  selected: RuntimeProviderId | "";
  model: string;
  drafts: Drafts;
  pending: string | null;
  feedback: Feedback;
}

function initialState(source: ProviderSettingsView): ScreenState {
  return {
    source,
    phase: "loading",
    settings: emptySettings(),
    selected: "",
    model: "",
    drafts: emptyDrafts(),
    pending: null,
    feedback: null
  };
}

function isFailure<T>(
  result: ProviderConfigurationResult<T>
): result is Extract<ProviderConfigurationResult<T>, { success: false }> {
  return !result.success;
}

function failureMessage(code: string): string {
  return code === "CONFIG_INVALID"
    ? "The information entered is invalid. Check the fields and try again."
    : "Provider settings could not be saved. Please try again.";
}

function hasCatalog(providers: readonly ProviderDefinition[]): boolean {
  return (
    providers.length === 3 &&
    new Set(providers.map(({ id }) => id)).size === 3 &&
    ["openai", "gemini", "groq"].every((id) =>
      providers.some((provider) => provider.id === id && !!provider.name.trim())
    )
  );
}

export function ProviderSettingsScreen({
  view
}: {
  view: ProviderSettingsView;
}) {
  const prefix = useId();
  const [state, setState] = useState(() => initialState(view));
  if (state.source !== view) setState(initialState(view));
  const control = useRef({
    source: view,
    mounted: false,
    generation: 0,
    request: 0,
    busy: false
  });

  const load = useCallback(() => {
    const current = control.current;
    if (!current.mounted || current.source !== view) return;
    const generation = current.generation;
    const request = ++current.request;
    const valid = () =>
      current.mounted &&
      current.source === view &&
      current.generation === generation &&
      current.request === request;
    void Promise.resolve()
      .then(() => view.boundary.loadSettings())
      .then((result) => {
        if (!valid()) return;
        if (result.success || result.error.code === "CONFIG_MISSING") {
          const settings = result.success ? result.value : emptySettings();
          setState((previous) => ({
            ...previous,
            phase: "ready",
            settings,
            selected: settings.preference?.providerId ?? "",
            model: settings.preference?.model ?? "",
            feedback: null
          }));
        } else {
          setState((previous) => ({
            ...previous,
            phase:
              result.error.code === "CONFIG_INVALID"
                ? "invalid"
                : "unavailable",
            feedback: null
          }));
        }
      })
      .catch(() => {
        if (valid())
          setState((previous) => ({
            ...previous,
            phase: "unavailable",
            feedback: null
          }));
      });
  }, [view]);

  useEffect(() => {
    const current = control.current;
    current.source = view;
    current.mounted = true;
    current.busy = false;
    current.generation++;
    load();
    return () => {
      current.mounted = false;
      current.generation++;
    };
  }, [view, load]);

  const active = (generation: number) => {
    const current = control.current;
    return (
      current.mounted &&
      current.source === view &&
      current.generation === generation
    );
  };

  async function reconcile(generation: number): Promise<boolean> {
    try {
      const result = await view.boundary.loadSettings();
      if (!active(generation)) return false;
      if (result.success || result.error.code === "CONFIG_MISSING") {
        const settings = result.success ? result.value : emptySettings();
        setState((previous) => ({
          ...previous,
          settings,
          selected: settings.preference?.providerId ?? "",
          model: settings.preference?.model ?? ""
        }));
        return true;
      }
    } catch {
      // Boundary failures never contribute native text to feedback.
    }
    return false;
  }

  async function mutate(
    pending: string,
    operation: (generation: number) => Promise<string | null>
  ) {
    const current = control.current;
    if (
      !current.mounted ||
      current.source !== view ||
      current.busy ||
      state.phase !== "ready"
    )
      return;
    current.busy = true;
    const generation = current.generation;
    setState((previous) => ({ ...previous, pending, feedback: null }));
    try {
      const message = await operation(generation);
      if (active(generation) && message)
        setState((previous) => ({
          ...previous,
          feedback: { kind: "status", message }
        }));
    } catch {
      if (active(generation))
        setState((previous) => ({
          ...previous,
          feedback: {
            kind: "error",
            message: failureMessage("CONFIG_STORAGE_FAILURE")
          }
        }));
    } finally {
      if (active(generation)) {
        current.busy = false;
        setState((previous) => ({ ...previous, pending: null }));
      }
    }
  }

  function reportFailure(code: string) {
    setState((previous) => ({
      ...previous,
      feedback: { kind: "error", message: failureMessage(code) }
    }));
  }

  function updateDraft(id: RuntimeProviderId, patch: Partial<Draft>) {
    setState((previous) => ({
      ...previous,
      drafts: {
        ...previous.drafts,
        [id]: { ...previous.drafts[id], ...patch }
      },
      feedback: null
    }));
  }

  function saveProvider(
    event: FormEvent<HTMLFormElement>,
    provider: ProviderDefinition
  ) {
    event.preventDefault();
    const id = provider.id;
    const configured = state.settings.providers[id] !== undefined;
    const draft = state.drafts[id];
    if (!draft.value) {
      if (!configured) reportFailure("CONFIG_INVALID");
      else
        setState((previous) => ({
          ...previous,
          feedback: {
            kind: "status",
            message: "Enter a new credential to replace the stored one."
          }
        }));
      return;
    }
    if (!draft.value.trim() || /[\r\n]/.test(draft.value)) {
      reportFailure("CONFIG_INVALID");
      return;
    }
    void mutate(`save:${id}`, async (generation) => {
      const credential: ProviderCredential =
        draft.kind === "apiKey"
          ? { apiKey: draft.value }
          : { token: draft.value };
      const written = await view.boundary.replaceCredential(id, credential);
      if (!active(generation)) return null;
      if (isFailure(written)) {
        setState((previous) => ({
          ...previous,
          drafts: {
            ...previous.drafts,
            [id]: { ...previous.drafts[id], value: "" }
          }
        }));
        reportFailure(written.error.code);
        return null;
      }
      setState((previous) => ({
        ...previous,
        drafts: {
          ...previous.drafts,
          [id]: { ...previous.drafts[id], value: "" }
        }
      }));
      if (!configured) {
        const next: ProviderSettings = {
          providers: {
            ...state.settings.providers,
            [id]: provider.runtimeSettings
          },
          preference: state.settings.preference
        };
        const saved = await view.boundary.replaceSettings(next);
        if (!active(generation)) return null;
        if (isFailure(saved)) {
          await reconcile(generation);
          if (active(generation))
            setState((previous) => ({
              ...previous,
              feedback: {
                kind: "error",
                message:
                  "The credential was saved, but provider settings were not. Retry configuration."
              }
            }));
          return null;
        }
      }
      const loaded = await reconcile(generation);
      if (!loaded) {
        if (active(generation)) reportFailure("CONFIG_STORAGE_FAILURE");
        return null;
      }
      return configured
        ? `${provider.name} credential updated.`
        : `${provider.name} configured.`;
    });
  }

  function removeProvider(id: RuntimeProviderId, name: string) {
    void mutate(`remove:${id}`, async (generation) => {
      const removed = await view.boundary.removeCredential(id);
      if (!active(generation)) return null;
      if (isFailure(removed)) {
        reportFailure(removed.error.code);
        return null;
      }
      const providers = { ...state.settings.providers };
      delete providers[id];
      const next: ProviderSettings = {
        providers,
        preference:
          state.settings.preference?.providerId === id
            ? null
            : state.settings.preference
      };
      const saved = await view.boundary.replaceSettings(next);
      if (!active(generation)) return null;
      if (isFailure(saved)) {
        await reconcile(generation);
        if (active(generation))
          setState((previous) => ({
            ...previous,
            feedback: {
              kind: "error",
              message:
                "The credential was removed, but provider settings were not. Retry removal."
            }
          }));
        return null;
      }
      const loaded = await reconcile(generation);
      if (!loaded) {
        if (active(generation)) reportFailure("CONFIG_STORAGE_FAILURE");
        return null;
      }
      return `${name} configuration removed.`;
    });
  }

  function savePreference(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      state.selected &&
      (!state.model.trim() || !state.settings.providers[state.selected])
    ) {
      reportFailure("CONFIG_INVALID");
      return;
    }
    const next: ProviderSettings = {
      providers: state.settings.providers,
      preference: state.selected
        ? { providerId: state.selected, model: state.model }
        : null
    };
    void mutate("preference", async (generation) => {
      const saved = await view.boundary.replaceSettings(next);
      if (!active(generation)) return null;
      if (isFailure(saved)) {
        reportFailure(saved.error.code);
        return null;
      }
      const loaded = await reconcile(generation);
      if (!loaded) {
        if (active(generation)) reportFailure("CONFIG_STORAGE_FAILURE");
        return null;
      }
      return state.selected
        ? "Preferred provider and model saved."
        : "Preference cleared.";
    });
  }

  const usableCatalog = hasCatalog(view.providers);
  const configured = view.providers.filter(
    (provider) => state.settings.providers[provider.id] !== undefined
  );
  const disabled = state.pending !== null;

  return (
    <section className="provider-settings" aria-labelledby={`${prefix}-title`}>
      <header className="settings-header">
        <p className="eyebrow">EOUS settings</p>
        <h1 id={`${prefix}-title`}>AI providers</h1>
        <p>Manage provider credentials and choose the model you prefer.</p>
      </header>

      {!usableCatalog ? (
        <p className="settings-feedback settings-error" role="alert">
          Provider settings are unavailable. Please try again.
        </p>
      ) : state.phase === "loading" ? (
        <p className="settings-feedback" role="status">
          Loading provider settings…
        </p>
      ) : state.phase === "invalid" || state.phase === "unavailable" ? (
        <div className="settings-recovery" role="alert">
          <p>
            {state.phase === "invalid"
              ? "Saved provider settings are invalid. You can start a new configuration."
              : "Provider settings are unavailable. Please try again."}
          </p>
          <div className="settings-actions">
            <Button
              variant="outline"
              onClick={() => {
                setState((previous) => ({ ...previous, phase: "loading" }));
                load();
              }}
            >
              Retry loading
            </Button>
            {state.phase === "invalid" && (
              <Button
                onClick={() =>
                  setState((previous) => ({
                    ...previous,
                    phase: "ready",
                    settings: emptySettings(),
                    selected: "",
                    model: "",
                    feedback: {
                      kind: "status",
                      message:
                        "New configuration started. Changes save only when you submit a form."
                    }
                  }))
                }
              >
                Start a new configuration
              </Button>
            )}
          </div>
        </div>
      ) : (
        <>
          <div className="settings-provider-list">
            {view.providers.map((provider) => {
              const id = provider.id;
              const isConfigured = state.settings.providers[id] !== undefined;
              const draft = state.drafts[id];
              return (
                <section
                  className="settings-card"
                  key={id}
                  aria-labelledby={`${prefix}-${id}-heading`}
                >
                  <div className="settings-card-header">
                    <h2 id={`${prefix}-${id}-heading`}>{provider.name}</h2>
                    <span
                      className={
                        isConfigured
                          ? "settings-configured"
                          : "settings-unconfigured"
                      }
                    >
                      {isConfigured ? "Configured" : "Not configured"}
                    </span>
                  </div>
                  {isConfigured && (
                    <p className="settings-hint">
                      A credential is stored. Enter a new value only to replace
                      it.
                    </p>
                  )}
                  <form onSubmit={(event) => saveProvider(event, provider)}>
                    <div className="settings-fields">
                      <div>
                        <label htmlFor={`${prefix}-${id}-kind`}>
                          {provider.name} credential type
                        </label>
                        <select
                          id={`${prefix}-${id}-kind`}
                          value={draft.kind}
                          onChange={(event) =>
                            updateDraft(id, {
                              kind: event.target.value as CredentialKind
                            })
                          }
                          disabled={disabled}
                        >
                          <option value="apiKey">API key</option>
                          <option value="token">Token</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor={`${prefix}-${id}-credential`}>
                          {provider.name}{" "}
                          {isConfigured ? "new credential" : "credential"}
                        </label>
                        <input
                          id={`${prefix}-${id}-credential`}
                          type="password"
                          autoComplete="new-password"
                          value={draft.value}
                          onChange={(event) =>
                            updateDraft(id, { value: event.target.value })
                          }
                          disabled={disabled}
                        />
                      </div>
                    </div>
                    <div className="settings-actions">
                      <Button type="submit" disabled={disabled}>
                        {state.pending === `save:${id}`
                          ? "Saving…"
                          : isConfigured
                            ? `Update ${provider.name} credential`
                            : `Configure ${provider.name}`}
                      </Button>
                      {isConfigured && (
                        <Button
                          type="button"
                          variant="outline"
                          disabled={disabled}
                          onClick={() => removeProvider(id, provider.name)}
                        >
                          Remove {provider.name} configuration
                        </Button>
                      )}
                    </div>
                  </form>
                </section>
              );
            })}
          </div>

          <section
            className="settings-card settings-preference"
            aria-labelledby={`${prefix}-preference-heading`}
          >
            <h2 id={`${prefix}-preference-heading`}>Preferred provider</h2>
            <p className="settings-hint">
              Choose a configured provider and enter its model identifier. This
              choice is saved for later workspace use.
            </p>
            {configured.length === 0 && (
              <p className="settings-hint">
                Configure a provider first to set a preference.
              </p>
            )}
            <form onSubmit={savePreference}>
              <div className="settings-fields">
                <div>
                  <label htmlFor={`${prefix}-preferred-provider`}>
                    Preferred provider
                  </label>
                  <select
                    id={`${prefix}-preferred-provider`}
                    value={state.selected}
                    onChange={(event) =>
                      setState((previous) => ({
                        ...previous,
                        selected: event.target.value as RuntimeProviderId | "",
                        feedback: null
                      }))
                    }
                    disabled={disabled || configured.length === 0}
                  >
                    <option value="">No preference</option>
                    {configured.map((provider) => (
                      <option key={provider.id} value={provider.id}>
                        {provider.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${prefix}-preferred-model`}>
                    Preferred model identifier
                  </label>
                  <input
                    id={`${prefix}-preferred-model`}
                    type="text"
                    value={state.model}
                    onChange={(event) =>
                      setState((previous) => ({
                        ...previous,
                        model: event.target.value,
                        feedback: null
                      }))
                    }
                    disabled={disabled || !state.selected}
                  />
                </div>
              </div>
              <Button
                type="submit"
                disabled={disabled || configured.length === 0}
              >
                {state.pending === "preference" ? "Saving…" : "Save preference"}
              </Button>
            </form>
          </section>

          {state.feedback && (
            <p
              className={`settings-feedback ${state.feedback.kind === "error" ? "settings-error" : ""}`}
              role={state.feedback.kind === "error" ? "alert" : "status"}
            >
              {state.feedback.message}
            </p>
          )}
        </>
      )}
    </section>
  );
}
