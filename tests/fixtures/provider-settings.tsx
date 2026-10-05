// Development-only DOM checks; capabilities and credentials here are synthetic.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import type { ProviderSettingsView } from "../../src/components/settings/ProviderSettingsScreen";
import type {
  ProviderConfigurationBoundary,
  ProviderConfigurationErrorCode,
  ProviderCredential,
  ProviderSettings
} from "../../src/infrastructure/provider-configuration";
import type { RuntimeProviderId } from "../../src/intelligence/provider-runtime/registerRuntimeProviders";
import "../../src/styles.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const root = createRoot(document.getElementById("root")!);
const checks = document.getElementById("checks")!;
let assertions = 0;
function check(value: unknown, description: string) {
  if (!value) throw new Error(description);
  assertions++;
}
const fail = (code: ProviderConfigurationErrorCode) => ({
  success: false as const,
  error: { code, message: "native-secret sql-secret stack-secret" }
});
const ok = <T,>(value: T) => ({ success: true as const, value });
const capabilities = {
  contextWindow: 100,
  maxOutputTokens: 10,
  supportsSystemInstructions: true,
  supportsFunctionCalling: false,
  supportsVision: false
};
const providers: ProviderSettingsView["providers"] = [
  { id: "openai", name: "OpenAI", runtimeSettings: { capabilities } },
  { id: "gemini", name: "Gemini", runtimeSettings: { capabilities } },
  { id: "groq", name: "Groq", runtimeSettings: { capabilities } }
];
let stored: ProviderSettings | null = null;
const credentials: Partial<Record<RuntimeProviderId, ProviderCredential>> = {};
const calls = {
  load: 0,
  secretLoad: 0,
  settingsWrite: 0,
  secretWrite: 0,
  remove: 0
};
let loadFailure: ProviderConfigurationErrorCode | null = null;
let credentialFailure = false;
let settingsFailure = false;
let removeFailure = false;
let throwSave = false;
let pendingLoad: Promise<ReturnType<typeof ok<ProviderSettings>>> | null = null;
let pendingCredential: Promise<ReturnType<typeof ok<void>>> | null = null;
const boundary: ProviderConfigurationBoundary = {
  async loadSettings() {
    calls.load++;
    if (pendingLoad) return pendingLoad;
    if (loadFailure) return fail(loadFailure);
    return stored ? ok(structuredClone(stored)) : fail("CONFIG_MISSING");
  },
  async replaceSettings(value) {
    calls.settingsWrite++;
    if (throwSave) throw new Error("native-secret");
    if (settingsFailure) return fail("CONFIG_STORAGE_FAILURE");
    stored = structuredClone(value);
    return ok(undefined);
  },
  async loadCredential(id) {
    calls.secretLoad++;
    return credentials[id] ? ok(credentials[id]) : fail("CONFIG_MISSING");
  },
  async replaceCredential(id, value) {
    calls.secretWrite++;
    if (pendingCredential) return pendingCredential;
    if (credentialFailure) return fail("CONFIG_STORAGE_FAILURE");
    credentials[id] = value;
    return ok(undefined);
  },
  async removeCredential(id) {
    calls.remove++;
    if (removeFailure) return fail("CONFIG_STORAGE_FAILURE");
    delete credentials[id];
    return ok(undefined);
  }
};
const view = { boundary, providers };
const text = () => document.getElementById("root")!.textContent ?? "";
const html = () => document.getElementById("root")!.innerHTML;
const card = (name: string) =>
  [...document.querySelectorAll<HTMLElement>(".settings-card")].find(
    (section) => section.querySelector("h2")?.textContent?.includes(name)
  )!;
const field = (section: HTMLElement, type: string) =>
  section.querySelector<HTMLInputElement>(type)!;
const button = (name: string, scope: ParentNode = document) =>
  [...scope.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === name
  )!;
const submit = async (form: HTMLFormElement) =>
  act(async () =>
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }))
  );
async function change(
  element: HTMLInputElement | HTMLSelectElement,
  value: string
) {
  await act(async () => {
    const prototype =
      element instanceof HTMLSelectElement
        ? HTMLSelectElement.prototype
        : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(
      element,
      value
    );
    element.dispatchEvent(
      new Event(element instanceof HTMLSelectElement ? "change" : "input", {
        bubbles: true
      })
    );
  });
}
async function mount(next: ProviderSettingsView = view) {
  await act(async () =>
    root.render(
      <StrictMode>
        <App providerSettings={next} />
      </StrictMode>
    )
  );
}
async function configure(
  name: string,
  secret: string,
  kind: "apiKey" | "token" = "apiKey"
) {
  const section = card(name);
  if (kind === "token") await change(field(section, "select"), kind);
  await change(field(section, 'input[type="password"]'), secret);
  await submit(section.querySelector("form")!);
}
function safe() {
  for (const secret of [
    "api-key-secret",
    "token-secret",
    "native-secret",
    "sql-secret",
    "stack-secret"
  ])
    check(
      !text().includes(secret) && !html().includes(secret),
      `No secret in rendered UI: ${secret}`
    );
}

async function run() {
  await mount();
  check(
    text().includes("Not configured") && !text().includes("Configured"),
    "Missing settings show empty state"
  );
  check(
    calls.settingsWrite === 0 &&
      calls.secretWrite === 0 &&
      calls.secretLoad === 0,
    "StrictMode mount reads only nonsecret settings"
  );
  check(
    field(card("OpenAI"), 'input[type="password"]').value === "",
    "Password starts blank"
  );
  check(document.querySelectorAll("h1").length === 1, "One primary heading");
  check(
    document.querySelectorAll(".settings-card[aria-labelledby]").length === 4,
    "All groups have accessible headings"
  );
  check(
    [
      ...document.querySelectorAll(
        ".settings-fields input, .settings-fields select"
      )
    ].every(
      (input) =>
        !!input.id && !!document.querySelector(`label[for="${input.id}"]`)
    ),
    "All fields have associated visible labels"
  );
  check(
    [...document.querySelectorAll('input[type="password"]')].length === 3,
    "Credential inputs use password type"
  );
  check(
    [...document.querySelectorAll<HTMLButtonElement>("button")].every(
      (item) => !!item.textContent?.trim()
    ),
    "Buttons have meaningful names"
  );
  check(
    field(card("OpenAI"), 'input[type="password"]').tabIndex >= 0,
    "Credential is keyboard focusable"
  );
  check(
    button("Save preference").disabled,
    "Preference disabled before configuration"
  );
  await submit(card("OpenAI").querySelector("form")!);
  check(
    !!document.querySelector('[role="alert"]') && calls.secretWrite === 0,
    "Blank first credential rejected accessibly"
  );

  credentialFailure = true;
  await configure("OpenAI", "api-key-secret");
  check(
    !stored && !text().includes("configured."),
    "Credential failure does not configure"
  );
  safe();
  credentialFailure = false;
  settingsFailure = true;
  await configure("OpenAI", "api-key-secret");
  check(
    !stored &&
      text().includes("credential was saved") &&
      text().includes("Retry configuration"),
    "Partial configuration reports safe failure"
  );
  safe();
  settingsFailure = false;
  await configure("OpenAI", "api-key-secret");
  check(
    !!stored?.providers.openai && text().includes("OpenAI configured."),
    "OpenAI configured after both writes"
  );
  check(
    field(card("OpenAI"), 'input[type="password"]').value === "",
    "Secret cleared after save"
  );
  await configure("Gemini", "token-secret", "token");
  await configure("Groq", "third-secret");
  check(
    !!stored?.providers.gemini && !!stored?.providers.groq,
    "All three providers configurable"
  );
  check("token" in credentials.gemini!, "Token kind persisted");
  safe();

  const writesBeforeReload = { ...calls };
  await act(async () => root.render(<App />));
  await mount();
  check(
    text().includes("Configured") &&
      field(card("OpenAI"), 'input[type="password"]').value === "",
    "Reload retains status with empty credential field"
  );
  check(
    calls.secretLoad === 0 &&
      calls.settingsWrite === writesBeforeReload.settingsWrite &&
      calls.secretWrite === writesBeforeReload.secretWrite,
    "Reload does not read secrets or write"
  );
  safe();

  const preference = document.querySelector<HTMLElement>(
    ".settings-preference"
  )!;
  const providerSelect = field(preference, "select");
  const model = field(preference, "input");
  check(
    providerSelect.querySelectorAll("option").length === 4 &&
      model.value === "",
    "Only configured providers selectable, no model default"
  );
  await change(providerSelect, "gemini");
  await submit(preference.querySelector("form")!);
  check(
    !!document.querySelector('[role="alert"]') && stored?.preference === null,
    "Blank model rejected"
  );
  await change(model, "  model-exact  ");
  const beforePreference = calls.secretWrite;
  await submit(preference.querySelector("form")!);
  check(
    stored?.preference?.providerId === "gemini" &&
      stored.preference.model === "  model-exact  ",
    "Exact model and explicit provider persisted"
  );
  check(
    calls.secretWrite === beforePreference && calls.remove === 0,
    "Preference does not touch credentials"
  );
  await act(async () => root.render(<App />));
  await mount();
  check(
    field(
      document.querySelector<HTMLElement>(".settings-preference")!,
      "select"
    ).value === "gemini" &&
      field(
        document.querySelector<HTMLElement>(".settings-preference")!,
        "input"
      ).value === "  model-exact  ",
    "Preference reloads"
  );
  safe();

  const oldSettings = JSON.stringify(stored?.providers.openai);
  await submit(card("OpenAI").querySelector("form")!);
  check(
    calls.secretWrite === beforePreference,
    "Blank existing credential keeps stored value"
  );
  await configure("OpenAI", "replacement-secret");
  check(
    calls.secretWrite === beforePreference + 1 &&
      JSON.stringify(stored?.providers.openai) === oldSettings,
    "Credential replacement preserves runtime settings"
  );
  check(
    field(card("OpenAI"), 'input[type="password"]').value === "",
    "Replacement input cleared"
  );
  removeFailure = true;
  await act(async () => button("Remove Gemini configuration").click());
  check(
    !!stored?.providers.gemini && !!document.querySelector('[role="alert"]'),
    "Failed removal preserves status and alerts"
  );
  safe();
  removeFailure = false;
  settingsFailure = true;
  await act(async () => button("Remove Gemini configuration").click());
  check(
    !!stored?.providers.gemini &&
      text().includes("credential was removed") &&
      text().includes("Retry removal"),
    "Partial removal reports safe failure"
  );
  settingsFailure = false;
  await act(async () => button("Remove Gemini configuration").click());
  check(
    !stored?.providers.gemini && stored?.preference === null,
    "Removal clears provider and selected preference"
  );
  check(
    field(
      document.querySelector<HTMLElement>(".settings-preference")!,
      "select"
    ).value === "",
    "No automatic fallback selection"
  );
  check(
    field(
      document.querySelector<HTMLElement>(".settings-preference")!,
      "select"
    ).querySelectorAll("option").length === 3,
    "Removed provider is not selectable"
  );

  settingsFailure = true;
  await change(
    field(
      document.querySelector<HTMLElement>(".settings-preference")!,
      "select"
    ),
    "openai"
  );
  await change(
    field(
      document.querySelector<HTMLElement>(".settings-preference")!,
      "input"
    ),
    "new-model"
  );
  await submit(
    document.querySelector<HTMLElement>(
      ".settings-preference form"
    )! as HTMLFormElement
  );
  check(
    stored?.preference === null && !!document.querySelector('[role="alert"]'),
    "Preference save failure is safe"
  );
  safe();
  settingsFailure = false;
  throwSave = true;
  await submit(
    document.querySelector<HTMLElement>(
      ".settings-preference form"
    )! as HTMLFormElement
  );
  check(
    !text().includes("native-secret") &&
      !!document.querySelector('[role="alert"]'),
    "Thrown dependency error is sanitized"
  );
  throwSave = false;

  loadFailure = "CONFIG_STORAGE_FAILURE";
  await act(async () => root.render(<App />));
  await mount();
  check(
    text().includes("Provider settings are unavailable") &&
      !!button("Retry loading"),
    "Load failure has retry"
  );
  safe();
  loadFailure = null;
  await act(async () => button("Retry loading").click());
  check(!!card("OpenAI"), "Retry restores settings");
  loadFailure = "CONFIG_INVALID";
  await act(async () => root.render(<App />));
  await mount();
  check(
    text().includes("Saved provider settings are invalid") &&
      !!button("Start a new configuration"),
    "Invalid settings need explicit recovery"
  );
  const beforeRecovery = calls.settingsWrite;
  await act(async () => button("Start a new configuration").click());
  check(
    calls.settingsWrite === beforeRecovery && text().includes("Not configured"),
    "Recovery does not write on mount"
  );
  loadFailure = null;

  let resolveCredential!: (result: ReturnType<typeof ok<void>>) => void;
  pendingCredential = new Promise((resolve) => {
    resolveCredential = resolve;
  });
  await mount();
  await change(
    field(card("Gemini"), 'input[type="password"]'),
    "pending-secret"
  );
  const settingsWritesBeforeStaleMutation = calls.settingsWrite;
  await act(async () => {
    card("Gemini")
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  check(
    button("Save preference").disabled,
    "Pending write disables other settings actions"
  );
  const writesDuringPending = calls.secretWrite;
  await act(async () => {
    card("Gemini")
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  check(
    calls.secretWrite === writesDuringPending,
    "Duplicate submit cannot start another write"
  );
  const newBoundary: ProviderConfigurationBoundary = {
    ...boundary,
    loadSettings: async () => ok({ providers: {}, preference: null })
  };
  await mount({ boundary: newBoundary, providers });
  await act(async () => resolveCredential(ok(undefined)));
  check(
    calls.settingsWrite === settingsWritesBeforeStaleMutation &&
      card("Gemini").textContent?.includes("Not configured"),
    "Stale credential completion cannot write settings or update replacement view"
  );
  pendingCredential = null;

  let resolvePending!: (
    result: ReturnType<typeof ok<ProviderSettings>>
  ) => void;
  pendingLoad = new Promise((resolve) => {
    resolvePending = resolve;
  });
  const originalView = { boundary, providers };
  await act(async () => root.render(<App />));
  await mount(originalView);
  const secondBoundary: ProviderConfigurationBoundary = {
    ...boundary,
    loadSettings: async () => ok({ providers: {}, preference: null })
  };
  await mount({ boundary: secondBoundary, providers });
  await act(async () =>
    resolvePending(
      ok({ providers: { openai: { capabilities } }, preference: null })
    )
  );
  check(
    card("OpenAI").textContent?.includes("Not configured"),
    "Stale load cannot replace new dependency state"
  );
  pendingLoad = null;
  await act(async () => root.render(<App />));
  check(
    text().includes("Chat is currently unavailable"),
    "Unmount leaves App unavailable"
  );
  await mount();
  check(
    !!card("OpenAI") && !!card("Groq"),
    "Settings remain usable after remount"
  );
  safe();
  checks.textContent = `TASK-062 browser checks passed (${assertions} assertions)`;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
}
run().catch((error: unknown) => {
  checks.textContent = `TASK-062 browser checks FAILED: ${error instanceof Error ? error.message : "Unknown failure"}`;
});
