import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { FormEvent } from "react";
import type {
  WebSearchCredentialStatus,
  WebSearchSettingsBoundary
} from "../../infrastructure/web-search";
import { Button } from "../ui/button";

type Feedback = { kind: "error" | "status"; message: string } | null;

export function WebSearchSettingsScreen({
  boundary
}: {
  boundary: WebSearchSettingsBoundary;
}) {
  const inputId = useId();
  const keyInput = useRef<HTMLInputElement>(null);
  const control = useRef({ generation: 0, busy: false });
  const [status, setStatus] = useState<WebSearchCredentialStatus | "loading">(
    "loading"
  );
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback>(null);

  const load = useCallback(
    async (generation: number) => {
      let next: WebSearchCredentialStatus = "unavailable";
      try {
        next = await boundary.status();
      } catch {
        // Do not render native error details.
      }
      if (control.current.generation === generation) setStatus(next);
      return next;
    },
    [boundary]
  );

  useEffect(() => {
    const current = control.current;
    const generation = ++current.generation;
    current.busy = false;
    void load(generation);
    return () => {
      current.generation++;
    };
  }, [load]);

  async function run(operation: () => Promise<void>, success: string) {
    if (control.current.busy || status === "loading") return;
    control.current.busy = true;
    const generation = control.current.generation;
    setPending(true);
    setFeedback(null);
    try {
      await operation();
      if (control.current.generation !== generation) return;
      if (keyInput.current) keyInput.current.value = "";
      const next = await load(generation);
      if (control.current.generation === generation)
        setFeedback(
          next === "unavailable" || next === "invalid"
            ? {
                kind: "error",
                message:
                  "Web search credential status is unavailable. Retry status."
              }
            : { kind: "status", message: success }
        );
    } catch {
      if (control.current.generation === generation)
        setFeedback({
          kind: "error",
          message: "Web search settings could not be changed. Please try again."
        });
    } finally {
      if (control.current.generation === generation) {
        control.current.busy = false;
        setPending(false);
      }
    }
  }

  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const key = keyInput.current?.value ?? "";
    if (!key.trim() || /[\r\n]/u.test(key)) {
      setFeedback({ kind: "error", message: "Enter a valid Tavily API key." });
      return;
    }
    void run(() => boundary.save(key), "Tavily API key saved.");
  }

  function retry() {
    const generation = control.current.generation;
    setStatus("loading");
    setFeedback(null);
    void load(generation);
  }

  return (
    <section
      className="provider-settings"
      aria-labelledby="web-search-settings-title"
    >
      <header className="settings-header">
        <p className="eyebrow">Settings</p>
        <h1 id="web-search-settings-title">Web Search</h1>
        <p>
          Tavily is the Version 1 search service. Use your personal Tavily API
          key to enable searches after network permission approval.
        </p>
      </header>
      <div className="settings-card" aria-labelledby="tavily-settings-title">
        <div className="settings-card-header">
          <h2 id="tavily-settings-title">Tavily</h2>
          <span
            className={
              status === "configured"
                ? "settings-configured"
                : "settings-unconfigured"
            }
          >
            {status === "configured"
              ? "Configured"
              : status === "not_configured"
                ? "Not configured"
                : status === "loading"
                  ? "Loading status…"
                  : "Unavailable"}
          </span>
        </div>
        <p className="settings-hint">
          The key is stored in Windows Credential Manager. Existing keys are
          never shown here.
        </p>
        {status === "invalid" || status === "unavailable" ? (
          <div className="settings-recovery" role="alert">
            <p>
              Web search credential status is unavailable. You can retry or
              replace the key.
            </p>
            <Button type="button" onClick={retry} disabled={pending}>
              Retry status
            </Button>
          </div>
        ) : null}
        <form onSubmit={save}>
          <div className="settings-fields">
            <div>
              <label htmlFor={inputId}>Tavily API key</label>
              <input
                id={inputId}
                ref={keyInput}
                type="password"
                autoComplete="new-password"
                spellCheck={false}
                disabled={pending || status === "loading"}
              />
            </div>
          </div>
          <div className="settings-actions">
            <Button type="submit" disabled={pending || status === "loading"}>
              {status === "configured" ? "Replace key" : "Save key"}
            </Button>
            <Button
              type="button"
              disabled={
                pending || status === "loading" || status === "not_configured"
              }
              onClick={() =>
                void run(() => boundary.remove(), "Tavily API key removed.")
              }
            >
              Remove key
            </Button>
          </div>
        </form>
        {feedback && (
          <p
            className={`settings-feedback ${feedback.kind === "error" ? "settings-error" : ""}`}
            role={feedback.kind === "error" ? "alert" : "status"}
          >
            {feedback.message}
          </p>
        )}
      </div>
    </section>
  );
}
