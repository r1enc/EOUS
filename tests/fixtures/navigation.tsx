// Development-only DOM integration checks. All fake capabilities stay here.
import { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import type {
  ConversationMessage,
  ConversationRequest,
  ConversationResponse,
  PersistedConversationSession,
  SessionResult
} from "../../src/conversation";
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
function deferred<T>() {
  let resolve!: (result: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
const fail = {
  status: "failure",
  error: {
    code: "test_failure",
    category: "session",
    message: "private SQL path and provider secret"
  }
} as const;
const session = (
  id: string,
  title: string | null
): PersistedConversationSession => ({
  id,
  title,
  createdAt: 1000,
  updatedAt: 1000
});
const sessions = [session("z", "Study plan"), session("a", null)];
const histories = new Map<string, ConversationMessage[]>([
  [
    "z",
    [
      {
        id: "prior",
        role: "assistant",
        content: "Prior ordered response\n<script>literal text</script>",
        timestamp: "2026-09-29T00:00:00Z"
      }
    ]
  ],
  ["a", []]
]);
const requests: ConversationRequest[] = [];
const opens: string[] = [];
let creates = 0;
let execution = deferred<ConversationResponse>();
let listOverride:
  (() => Promise<SessionResult<PersistedConversationSession[]>>) | undefined;
let openOverride:
  ((id: string) => Promise<SessionResult<Workspace>>) | undefined;
let createOverride: (() => Promise<SessionResult<Workspace>>) | undefined;
function workspace(id: string): Workspace {
  const metadata = sessions.find((item) => item.id === id)!;
  const history = structuredClone(histories.get(id) ?? []);
  return {
    id,
    title: metadata.title ?? "Untitled conversation",
    getHistory: () => structuredClone(history),
    getPermissionHistory: () => [],
    async execute(request) {
      requests.push(request);
      execution = deferred<ConversationResponse>();
      const response = await execution.promise;
      if (response.status === "success") {
        history.push(
          {
            id: `${request.id}:user`,
            role: "user",
            content: request.prompt,
            timestamp: "2026-09-29T00:00:00Z"
          },
          {
            id: `${request.id}:assistant`,
            role: "assistant",
            content: "Completed response",
            timestamp: "2026-09-29T00:00:01Z"
          }
        );
        histories.set(id, structuredClone(history));
      }
      return response;
    }
  };
}
const navigation: ConversationNavigation = {
  async listConversations() {
    return listOverride
      ? listOverride()
      : { status: "success", value: structuredClone(sessions) };
  },
  async createConversation() {
    creates++;
    if (createOverride) return createOverride();
    const id = `new-${creates}`;
    sessions.push(session(id, null));
    return { status: "success", value: workspace(id) };
  },
  async openConversation(id) {
    opens.push(id);
    return openOverride
      ? openOverride(id)
      : { status: "success", value: workspace(id) };
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
const textarea = () => document.querySelector("textarea")!;
const send = () =>
  document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const selected = () =>
  document.querySelector(".conversation-entry[aria-current='true']");
async function input(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(textarea(), value);
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function enter() {
  textarea().dispatchEvent(
    new KeyboardEvent("keydown", {
      key: "Enter",
      bubbles: true,
      cancelable: true
    })
  );
}
async function settle(status: "success" | "failure" | "throw") {
  await act(async () => {
    if (status === "throw")
      execution.reject(new Error("private execution exception"));
    else
      execution.resolve({
        id: requests[requests.length - 1].id,
        status,
        content: status === "success" ? "Completed response" : "",
        error:
          status === "failure"
            ? { code: "test", message: "private execution details" }
            : undefined
      });
  });
}
async function mount(source = navigation) {
  await act(async () =>
    root.render(
      <StrictMode>
        <App navigation={source} />
      </StrictMode>
    )
  );
}

async function run() {
  await mount();
  check(
    text().includes("No conversation is active") && !textarea(),
    "No active conversation distinct from unavailable"
  );
  check(creates === 0, "Mount does not create persisted sessions");
  check(
    entries()[0].textContent === "Study plan" &&
      entries()[1].textContent === "Untitled conversation",
    "Metadata order and null title fallback"
  );
  await act(async () => entries()[0].click());
  check(
    text().includes("Prior ordered response") &&
      !document.querySelector(".message-content script"),
    "Prior history is shown safely"
  );
  check(
    selected()?.textContent?.includes("Active"),
    "Selection is labeled beyond color"
  );
  await input("Unsent draft");
  const alreadyOpened = opens.length;
  await act(async () => entries()[0].click());
  check(
    opens.length === alreadyOpened && textarea().value === "Unsent draft",
    "Active selection is a no-op"
  );
  openOverride = async () => fail;
  await act(async () => entries()[1].click());
  check(
    selected()?.textContent?.includes("Study plan") &&
      textarea().value === "Unsent draft",
    "Failed open preserves active chat and draft"
  );
  check(
    text().includes("Could not open") && !text().includes("private SQL"),
    "Open failure is sanitized"
  );
  openOverride = async () => {
    throw new Error("private open exception");
  };
  await act(async () => entries()[1].click());
  check(
    !create().disabled && !send().disabled && !text().includes("private open"),
    "Thrown open error releases navigation lock"
  );
  openOverride = undefined;
  await act(async () => entries()[1].click());
  check(
    textarea().value === "" &&
      !text().includes("Prior ordered response") &&
      !document.querySelector('[role="alert"]'),
    "Switch clears transient draft, error and previous history"
  );
  check(
    sessions[1].title === null,
    "Display fallback does not rewrite metadata"
  );

  for (const outcome of ["success", "failure", "throw"] as const) {
    await input(`Request ${outcome}`);
    const beforeOpen = opens.length;
    const beforeCreate = creates;
    await act(async () => {
      enter();
      entries()[0].click();
      create().click();
    });
    check(
      create().disabled && entries().every((entry) => entry.disabled),
      `Navigation disabled during ${outcome} execution`
    );
    check(
      opens.length === beforeOpen && creates === beforeCreate,
      "Immediate chat lock prevents same-event navigation"
    );
    check(
      requests[requests.length - 1].context?.conversationId === "a",
      "Continuation stays in selected Workspace"
    );
    await settle(outcome);
    check(
      !create().disabled && entries().every((entry) => !entry.disabled),
      `Chat ${outcome} always releases navigation lock`
    );
    if (outcome !== "success")
      check(
        textarea().value === `Request ${outcome}` &&
          !text().includes("private execution"),
        "Failed execution preserves draft and hides details"
      );
  }
  const failedRequestId = requests[requests.length - 1].id;
  await act(async () => entries()[0].click());
  check(
    textarea().value === "" && !document.querySelector('[role="alert"]'),
    "Failure/retry state clears on switch"
  );
  await input("Request throw");
  await act(async () => enter());
  check(
    requests[requests.length - 1].id !== failedRequestId,
    "Retry ID does not leak across conversations"
  );
  await settle("success");

  await input("Outgoing draft");
  const pendingOpen = deferred<SessionResult<Workspace>>();
  openOverride = () => pendingOpen.promise;
  const requestCount = requests.length;
  const openCount = opens.length;
  await act(async () => {
    entries()[1].click();
    enter();
    entries()[1].click();
    create().click();
  });
  check(
    opens.length === openCount + 1,
    "Duplicate open actions are serialized"
  );
  check(
    requests.length === requestCount && textarea().readOnly && send().disabled,
    "Chat blocked immediately during navigation replacement"
  );
  await act(async () => pendingOpen.resolve(fail));
  check(
    textarea().value === "Outgoing draft" && !send().disabled,
    "Failed deferred open restores outgoing chat"
  );
  openOverride = undefined;

  const pendingCreate = deferred<SessionResult<Workspace>>();
  createOverride = () => pendingCreate.promise;
  const createCount = creates;
  const entryCount = entries().length;
  await act(async () => {
    create().click();
    create().click();
    enter();
  });
  check(
    creates === createCount + 1 && requests.length === requestCount,
    "Duplicate create and concurrent chat are guarded"
  );
  check(
    entries().length === entryCount,
    "No optimistic metadata during creation"
  );
  sessions.push(session("created", null));
  await act(async () =>
    pendingCreate.resolve({ status: "success", value: workspace("created") })
  );
  check(
    textarea().value === "" &&
      entries().length === entryCount + 1 &&
      selected()?.textContent?.includes("Untitled conversation"),
    "Creation activates and refreshes authoritative list"
  );
  check(!create().disabled, "Create lock releases on success");
  createOverride = async () => fail;
  await act(async () => create().click());
  check(
    text().includes("Could not create") &&
      selected() !== null &&
      !create().disabled,
    "Create failure preserves active chat and releases lock"
  );
  createOverride = async () => {
    throw new Error("private creation exception");
  };
  await act(async () => create().click());
  check(
    !create().disabled && !text().includes("private creation"),
    "Thrown creation failure is safe and releases lock"
  );
  createOverride = undefined;

  listOverride = async () => fail;
  await act(async () => create().click());
  check(
    text().includes("Could not load conversations") && textarea(),
    "List failure retains usable active chat"
  );
  listOverride = undefined;
  await act(async () =>
    [...document.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent === "Retry list")!
      .click()
  );
  check(
    !text().includes("Could not load conversations"),
    "List retry recovers"
  );

  const staleOpen = deferred<SessionResult<Workspace>>();
  openOverride = () => staleOpen.promise;
  await act(async () => entries()[0].click());
  const replacement: ConversationNavigation = {
    ...navigation,
    listConversations: async () => ({
      status: "success",
      value: [session("a", null)]
    }),
    openConversation: async () => ({ status: "success", value: workspace("a") })
  };
  await mount(replacement);
  check(
    text().includes("No conversation is active") &&
      !text().includes("Opening conversation"),
    "Dependency replacement resets transient selection and locks"
  );
  await act(async () => entries()[0].click());
  await act(async () =>
    staleOpen.resolve({ status: "success", value: workspace("z") })
  );
  check(
    selected()?.textContent?.includes("Untitled conversation") &&
      !text().includes("Study plan"),
    "Stale open cannot replace newer valid state"
  );
  openOverride = undefined;

  const unmountedOpen = deferred<SessionResult<Workspace>>();
  await mount(navigation);
  openOverride = () => unmountedOpen.promise;
  await act(async () => entries()[0].click());
  await act(async () => root.render(<App />));
  await act(async () =>
    unmountedOpen.resolve({ status: "success", value: workspace("z") })
  );
  check(
    text().includes("Chat is currently unavailable") && !textarea(),
    "Unmount invalidates pending navigation results"
  );
  openOverride = undefined;

  const oldList = deferred<SessionResult<PersistedConversationSession[]>>();
  listOverride = () => oldList.promise;
  await mount();
  check(
    text().includes("Loading conversations"),
    "Pending persisted-list loading state"
  );
  listOverride = undefined;
  await act(async () => create().click());
  const authoritativeLength = entries().length;
  await act(async () => oldList.resolve({ status: "success", value: [] }));
  check(
    entries().length === authoritativeLength && authoritativeLength > 0,
    "Superseded list results cannot overwrite refreshed metadata"
  );
  const empty: ConversationNavigation = {
    ...navigation,
    listConversations: async () => ({ status: "success", value: [] })
  };
  await mount(empty);
  check(
    text().includes("No saved conversations yet") &&
      text().includes("No conversation is active"),
    "Empty persisted list has a New conversation path"
  );
  await mount(navigation);
  check(
    !selected() && !textarea() && entries().length === sessions.length,
    "Remounted shell rediscovers metadata without restoring selection"
  );
  await act(async () => entries()[0].click());
  checks.textContent = `TASK-049 browser checks passed (${assertions} assertions)`;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
}
run().catch((error: unknown) => {
  checks.textContent = `TASK-049 browser checks FAILED: ${error instanceof Error ? error.message : "Unknown failure"}`;
});
