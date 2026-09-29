// Development-only browser integration checks using the existing React runtime.
import { act } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import type { Workspace } from "../../src/workspace";
import type {
  ConversationMessage,
  ConversationRequest,
  ConversationResponse
} from "../../src/conversation";
import "../../src/styles.css";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const root = createRoot(document.getElementById("root")!);
const checks = document.getElementById("checks")!;
let assertions = 0;
function check(condition: unknown, description: string) {
  if (!condition) throw new Error(description);
  assertions++;
}
const history: ConversationMessage[] = [];
const requests: ConversationRequest[] = [];
let resolveRequest: (response: ConversationResponse) => void;
let rejectRequest: (error: Error) => void;
const workspace: Workspace = {
  id: "browser-conversation",
  title: "Plan a focused study session",
  getHistory: () => structuredClone(history),
  getPermissionHistory: () => [],
  execute: (request) => {
    requests.push(request);
    return new Promise((resolve, reject) => {
      resolveRequest = resolve;
      rejectRequest = reject;
    });
  }
};
const textarea = () => document.querySelector("textarea")!;
const send = () =>
  document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
async function input(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(textarea(), value);
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function key(options: KeyboardEventInit = {}) {
  return textarea().dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true,
      ...options
    })
  );
}
async function success() {
  const request = requests.at(-1)!;
  history.push(
    {
      id: `${request.id}-user`,
      role: "user",
      content: request.prompt,
      timestamp: "2026-09-29T00:00:00Z"
    },
    {
      id: `${request.id}-assistant`,
      role: "assistant",
      content: "A saved response.\n<script>plain text</script>",
      timestamp: "2026-09-29T00:00:01Z"
    }
  );
  await act(async () =>
    resolveRequest({
      id: request.id,
      status: "success",
      content: "This response must never be appended directly"
    })
  );
}

async function run() {
  await act(async () => root.render(<App />));
  check(
    document.body.textContent?.includes("Chat is currently unavailable"),
    "Unavailable state"
  );
  await act(async () => root.render(<App workspace={workspace} />));
  check(
    document.body.textContent?.includes("What would you like to accomplish"),
    "Empty state"
  );
  check(document.activeElement === textarea(), "Initial composer focus");
  await input(" \n  ");
  await act(async () => {
    key();
    document
      .querySelector("form")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  check(requests.length === 0 && send().disabled, "Blank submission blocked");
  await input("  Study\nwith examples  ");
  let newlineAllowed = false;
  await act(async () => {
    newlineAllowed = key({ shiftKey: true });
  });
  check(
    newlineAllowed && requests.length === 0,
    "Shift+Enter preserves native newline behavior"
  );
  await act(async () => {
    key({ isComposing: true });
  });
  check(requests.length === 0, "IME native composition blocks submission");
  await act(async () => {
    textarea().dispatchEvent(
      new CompositionEvent("compositionstart", { bubbles: true })
    );
    key();
    textarea().dispatchEvent(
      new CompositionEvent("compositionend", { bubbles: true })
    );
    key({ keyCode: 229 });
  });
  check(
    requests.length === 0,
    "Composition tracking and keyCode 229 block submission"
  );
  await act(async () => {
    key();
    key();
    send().click();
  });
  check(requests.length === 1, "Same-batch duplicate events execute once");
  check(
    requests[0].prompt === "  Study\nwith examples  ",
    "Original meaningful text preserved"
  );
  check(
    requests[0].context?.conversationId === workspace.id,
    "Workspace conversation context"
  );
  check(/^[a-f0-9-]{36}$/.test(requests[0].id), "Runtime randomUUID supported");
  check(send().disabled && textarea().readOnly, "Pending composer guarded");
  check(
    history.length === 0 &&
      document.querySelectorAll(".message-pending").length === 1,
    "Pending prompt separate from history"
  );
  await success();
  check(
    document.querySelectorAll(".message").length === 2 &&
      !document.querySelector(".message-pending"),
    "Authoritative history replaces pending without duplicates"
  );
  check(
    textarea().value === "" &&
      !textarea().readOnly &&
      document.activeElement === textarea(),
    "Success resets and restores composer focus"
  );
  check(
    !document.body.textContent?.includes("must never be appended"),
    "Response content is not a second history source"
  );
  check(
    !document.querySelector(".message-content script") &&
      document
        .querySelector(".message-assistant")
        ?.textContent?.includes("<script>plain text</script>"),
    "Safe plain text in browser"
  );
  check(
    getComputedStyle(document.querySelector(".message-content")!).whiteSpace ===
      "pre-wrap",
    "Readable line breaks"
  );
  await input("Retry this");
  await act(async () => send().click());
  const failedId = requests.at(-1)!.id;
  check(failedId !== requests[0].id, "Next turn gets a new ID");
  await act(async () =>
    resolveRequest({
      id: failedId,
      status: "failure",
      content: "",
      error: { code: "INTERNAL", message: "private API key and SQL path" }
    })
  );
  check(
    textarea().value === "Retry this" &&
      !send().disabled &&
      Boolean(document.querySelector('[role="alert"]')),
    "Failure preserves usable draft and feedback"
  );
  check(
    !document.body.textContent?.includes("private API key"),
    "Failure details hidden"
  );
  check(
    document.querySelectorAll(".message").length === 2,
    "Failure adds no completed messages"
  );
  await act(async () => key());
  check(requests.at(-1)!.id === failedId, "Unchanged retry retains ID");
  await act(async () => rejectRequest(new Error("secret exception stack")));
  check(
    !document.body.textContent?.includes("secret exception") &&
      textarea().value === "Retry this" &&
      !send().disabled,
    "Thrown error safe and recoverable"
  );
  await input("Edited retry");
  await act(async () => send().click());
  check(requests.at(-1)!.id !== failedId, "Edited prompt invalidates retry ID");
  await success();
  check(
    document.querySelectorAll(".message").length === 4,
    "Continued history has one pair per success"
  );
  checks.textContent = `TASK-048 browser checks passed (${assertions} assertions)`;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
}

run().catch((error: unknown) => {
  checks.textContent = `TASK-048 browser checks FAILED: ${error instanceof Error ? error.message : "Unknown failure"}`;
});
