import { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { WebSearchSettingsScreen } from "../../src/components/settings/WebSearchSettingsScreen";
import type {
  WebSearchCredentialStatus,
  WebSearchSettingsBoundary
} from "../../src/infrastructure/web-search";
import "../../src/styles.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const checks = document.getElementById("checks")!;
const root = createRoot(document.getElementById("root")!);
let assertions = 0;
let stored = false;
let fail = false;
let statusFailure = false;
let writes = 0;
let reads = 0;
let pendingSave: Promise<void> | null = null;
const boundary: WebSearchSettingsBoundary = {
  async status(): Promise<WebSearchCredentialStatus> {
    reads++;
    return statusFailure
      ? "unavailable"
      : stored
        ? "configured"
        : "not_configured";
  },
  async save(key) {
    writes++;
    if (key !== "synthetic-secret" && key !== "replacement-secret")
      throw new Error("unexpected key");
    if (fail) throw new Error("native-secret stack trace");
    if (pendingSave) await pendingSave;
    stored = true;
  },
  async remove() {
    if (fail) throw new Error("native-secret stack trace");
    stored = false;
  }
};

function check(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
  assertions++;
}
const text = () => document.getElementById("root")!.textContent ?? "";
const input = () =>
  document.querySelector<HTMLInputElement>('input[type="password"]')!;
const button = (name: string) =>
  [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    (item) => item.textContent?.trim() === name
  )!;
async function mount() {
  await act(async () =>
    root.render(
      <StrictMode>
        <WebSearchSettingsScreen boundary={boundary} />
      </StrictMode>
    )
  );
}
async function submit() {
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function run() {
  await mount();
  check(
    text().includes("Not configured") && !text().includes("synthetic-secret"),
    "Initial status is safe"
  );
  check(reads >= 1 && writes === 0, "StrictMode reads status only");
  check(
    input().type === "password" && input().value === "",
    "Password starts empty"
  );
  check(
    !!document.querySelector(`label[for="${input().id}"]`),
    "Visible label is associated"
  );
  check(
    input().tabIndex >= 0 && !!button("Save key").textContent?.trim(),
    "Keyboard accessible controls"
  );
  await submit();
  check(
    !!document.querySelector('[role="alert"]') && writes === 0,
    "Blank key rejected"
  );
  fail = true;
  input().value = "synthetic-secret";
  await submit();
  check(
    !!document.querySelector('[role="alert"]') &&
      !text().includes("native-secret"),
    "Native error sanitized"
  );
  fail = false;
  await submit();
  check(
    text().includes("Configured") && input().value === "",
    "Save updates status and clears password"
  );
  check(
    !document.getElementById("root")!.outerHTML.includes("synthetic-secret"),
    "Saved secret is absent from DOM markup"
  );
  input().value = "replacement-secret";
  await submit();
  check(
    !!button("Replace key") && input().value === "",
    "Replacement clears password"
  );
  let releasePending: () => void = () => {};
  pendingSave = new Promise<void>((resolve) => {
    releasePending = resolve;
  });
  input().value = "synthetic-secret";
  await act(async () => {
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  check(writes === 4, "Duplicate submission starts one write");
  await act(async () => {
    releasePending();
  });
  pendingSave = null;
  statusFailure = true;
  input().value = "synthetic-secret";
  await submit();
  check(
    text().includes("Unavailable"),
    "Status read failure has fixed feedback"
  );
  await act(async () => button("Retry status").click());
  check(text().includes("Unavailable"), "Unavailable status is recoverable");
  statusFailure = false;
  await act(async () => button("Retry status").click());
  check(text().includes("Configured"), "Retry restores status");
  await act(async () => button("Remove key").click());
  check(text().includes("Not configured"), "Removal updates status");
  check(
    !text().includes("synthetic-secret"),
    "Secret never appears in feedback"
  );
  const width = getComputedStyle(
    document.querySelector<HTMLElement>(".provider-settings")!
  ).width;
  check(!!width, "Responsive settings layout computed");
  check(
    document.documentElement.scrollWidth <= window.innerWidth,
    "No horizontal overflow at the fixture viewport"
  );
  checks.textContent = `TASK-064 browser checks passed (${assertions} assertions)`;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
}
run().catch((error: unknown) => {
  checks.textContent = `TASK-064 browser checks FAILED: ${error instanceof Error ? error.message : "Unknown failure"}`;
});
