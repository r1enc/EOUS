// Development-only interaction checks use the real Workspace and Permission Manager.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import { DefaultProviderRegistry } from "../../src/intelligence/provider-sdk";
import type { PersistedConversationSession } from "../../src/conversation";
import { createInteractiveWorkspace } from "../../src/workspace";
import type { ConversationNavigation, Workspace } from "../../src/workspace";
import "../../src/styles.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const root = createRoot(document.getElementById("root")!);
const checks = document.getElementById("checks")!;
let assertions = 0;
function check(value: unknown, description: string) {
  if (!value) throw new Error(description);
  assertions++;
}
const providerCalls: unknown[] = [];
const registry = new DefaultProviderRegistry();
registry.registerProvider({
  id: "fixture-provider",
  name: "Fixture provider",
  capabilities: {
    contextWindow: 4096,
    supportsSystemInstructions: true,
    supportsFunctionCalling: false,
    supportsVision: false
  },
  async generateCompletion(request) {
    providerCalls.push(request);
    return { success: true, role: "assistant", content: "Completed response" };
  }
});
const planner = {
  async plan() {
    const now = new Date().toISOString();
    return {
      id: "plan",
      status: "planned" as const,
      createdAt: now,
      updatedAt: now,
      steps: [
        {
          id: "step",
          action: "pdf-reader",
          input: { filePath: "report.pdf", credential: "hidden credential" },
          status: "pending" as const
        }
      ]
    };
  }
};
const sessions: PersistedConversationSession[] = [
  { id: "alpha", title: "Alpha", createdAt: 1, updatedAt: 1 },
  { id: "beta", title: "Beta", createdAt: 2, updatedAt: 2 }
];
const workspaces = new Map<string, Workspace>();
function workspace(id: string) {
  const existing = workspaces.get(id);
  if (existing) return existing;
  const created = createInteractiveWorkspace({
    providerRegistry: registry,
    providerId: "fixture-provider",
    model: "fixture-model",
    conversationId: id,
    conversationTitle: id === "alpha" ? "Alpha" : "Beta",
    planner
  });
  workspaces.set(id, created);
  return created;
}
let creates = 0;
let opens = 0;
const navigation: ConversationNavigation = {
  async listConversations() {
    return { status: "success", value: sessions };
  },
  async createConversation() {
    creates++;
    return { status: "success", value: workspace("new") };
  },
  async openConversation(id) {
    opens++;
    return { status: "success", value: workspace(id) };
  }
};
const text = () => document.body.textContent ?? "";
const entries = () => [
  ...document.querySelectorAll<HTMLButtonElement>(".conversation-entry")
];
const create = () =>
  document.querySelector<HTMLButtonElement>(
    ".conversation-navigation > button"
  )!;
const textarea = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
const send = () =>
  document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const dialog = () =>
  document.querySelector<HTMLDialogElement>(".permission-dialog")!;
const reject = () =>
  [...dialog().querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Reject"
  )!;
const approve = () =>
  [...dialog().querySelectorAll("button")].find(
    (button) => button.textContent?.trim() === "Approve"
  )!;
async function input(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(textarea(), value);
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function sendRequest(value: string) {
  await input(value);
  await act(async () => send().click());
  check(dialog().open, "Actual permission request opens the dialog");
}

async function run() {
  await act(async () =>
    root.render(
      <StrictMode>
        <App navigation={navigation} />
      </StrictMode>
    )
  );
  check(
    text().includes("No conversation is active"),
    "Navigation starts with no active conversation"
  );
  await act(async () => entries()[0].click());
  check(
    workspaces.get("alpha")?.permissionInteraction,
    "Active Workspace owns an interaction"
  );
  await sendRequest("Read my report");
  check(
    text().includes("Awaiting your approval"),
    "Status reflects actual permission wait"
  );
  check(
    dialog().getAttribute("aria-labelledby") === "permission-dialog-title",
    "Dialog has an accessible title"
  );
  check(
    dialog().getAttribute("aria-describedby") ===
      "permission-dialog-description",
    "Dialog has an accessible description"
  );
  check(
    dialog().textContent?.includes("read_file") &&
      dialog().textContent?.includes("pdf-reader"),
    "Permission and tool IDs are visible"
  );
  check(
    dialog().textContent?.includes("report.pdf"),
    "Audited file detail is visible"
  );
  check(
    !dialog().textContent?.includes("hidden credential") &&
      !dialog().textContent?.includes("conversationId"),
    "Arbitrary input and context are hidden"
  );
  check(
    document.activeElement === reject(),
    "Focus enters the dialog on Reject"
  );
  check(
    create().disabled &&
      entries().every((item) => item.disabled) &&
      send().disabled,
    "Navigation and composer remain locked"
  );
  check(
    !approve().disabled && !reject().disabled,
    "Decision controls remain usable"
  );
  const beforeOpen = opens;
  const beforeCreate = creates;
  await act(async () => {
    entries()[1].click();
    create().click();
  });
  check(
    opens === beforeOpen && creates === beforeCreate,
    "Disabled navigation cannot replace active Workspace"
  );
  const cancel = new Event("cancel", { cancelable: true });
  await act(async () => {
    dialog().dispatchEvent(cancel);
  });
  check(
    cancel.defaultPrevented && dialog().open,
    "Escape dismissal cannot approve or orphan the request"
  );
  await act(async () => approve().click());
  check(
    !dialog().open && text().includes("Ready for your next goal"),
    "Approval settles execution and closes dialog"
  );
  check(
    text().includes("Last permission: read_file — granted"),
    "Granted lifecycle appears from Workspace"
  );
  check(
    workspaces.get("alpha")!.getPermissionHistory()[0].response?.decision ===
      "granted",
    "Permission Manager records grant"
  );
  check(
    workspaces.get("alpha")!.getHistory().length === 2 &&
      providerCalls.length === 2,
    "Tool execution completes through the real runtime"
  );
  check(
    !create().disabled && entries().every((item) => !item.disabled),
    "Approved execution releases navigation"
  );
  check(
    document.activeElement === textarea(),
    "Focus returns to composer after settlement"
  );

  await sendRequest("Read another report");
  const beforeDenial = providerCalls.length;
  await act(async () => reject().click());
  check(
    !dialog().open && text().includes("The requested action was not approved"),
    "Rejection has safe distinct feedback"
  );
  check(
    text().includes("Last permission: read_file — denied"),
    "Denied lifecycle appears from Workspace"
  );
  check(
    workspaces.get("alpha")!.getPermissionHistory()[1].response?.decision ===
      "denied",
    "Permission Manager records denial"
  );
  check(
    providerCalls.length === beforeDenial &&
      workspaces.get("alpha")!.getHistory().length === 2,
    "Denied tool does not execute or append a completed turn"
  );
  check(
    textarea().value === "Read another report" && !send().disabled,
    "Denied draft remains usable"
  );
  check(
    !create().disabled && entries().every((item) => !item.disabled),
    "Denied execution releases navigation"
  );

  await sendRequest("Request during teardown");
  const oldWorkspace = workspaces.get("alpha")!;
  await act(async () => root.render(<App />));
  await act(async () => {
    await Promise.resolve();
  });
  check(
    oldWorkspace.getPermissionHistory()[2].response?.decision === "denied",
    "Unmount fails pending approval closed"
  );
  check(
    text().includes("Chat is currently unavailable"),
    "Unmounted workspace cannot present an old request"
  );
  checks.textContent = `TASK-050 browser checks passed (${assertions} assertions)`;
}
async function preview() {
  await act(async () =>
    root.render(
      <StrictMode>
        <App navigation={navigation} />
      </StrictMode>
    )
  );
  await act(async () => entries()[0].click());
  await sendRequest("Read my report");
  checks.textContent = "TASK-050 permission dialog preview";
}

const task = new URLSearchParams(location.search).has("preview")
  ? preview()
  : run();
task.catch((error) => {
  checks.textContent = `TASK-050 browser checks failed: ${error instanceof Error ? error.message : String(error)}`;
  throw error;
});
