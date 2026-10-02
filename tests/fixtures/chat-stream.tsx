// Development-only browser checks for the Presentation streaming boundary.
import { act } from "react";
import { createRoot } from "react-dom/client";
import App from "../../src/App";
import type {
  ConversationMessage,
  ConversationRequest,
  ConversationStreamEvent,
  PersistedConversationSession
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

type Step =
  | { kind: "event"; value: ConversationStreamEvent }
  | { kind: "end" }
  | { kind: "throw" };

function channel() {
  const queued: Step[] = [];
  const waiting: Array<(step: Step) => void> = [];
  let closed = false;
  function push(step: Step) {
    const next = waiting.shift();
    if (next) next(step);
    else queued.push(step);
  }
  async function* stream(): AsyncGenerator<ConversationStreamEvent> {
    try {
      while (true) {
        const step =
          queued.shift() ??
          (await new Promise<Step>((resolve) => waiting.push(resolve)));
        if (step.kind === "end") return;
        if (step.kind === "throw") throw new Error("private stream exception");
        yield step.value;
      }
    } finally {
      closed = true;
    }
  }
  return {
    push,
    stream,
    get closed() {
      return closed;
    }
  };
}

const history: ConversationMessage[] = [];
const requests: ConversationRequest[] = [];
const channels: ReturnType<typeof channel>[] = [];
let executeCalls = 0;
let historyReads = 0;
let streamCreationThrows = false;
const workspace: Workspace = {
  id: "streaming",
  title: "Streaming conversation",
  getHistory() {
    historyReads++;
    return structuredClone(history);
  },
  getPermissionHistory: () => [],
  async execute() {
    executeCalls++;
    throw new Error("Streaming Workspace must not use execute");
  },
  executeStream(request) {
    requests.push(request);
    if (streamCreationThrows) throw new Error("private creation exception");
    const current = channel();
    channels.push(current);
    return current.stream();
  }
};
const sessions: PersistedConversationSession[] = [
  {
    id: "streaming",
    title: "Streaming conversation",
    createdAt: 1,
    updatedAt: 1
  },
  { id: "other", title: "Other conversation", createdAt: 2, updatedAt: 2 }
];
let opens = 0;
let creates = 0;
const navigation: ConversationNavigation = {
  async listConversations() {
    return { status: "success", value: sessions };
  },
  async createConversation() {
    creates++;
    return { status: "success", value: workspace };
  },
  async openConversation() {
    opens++;
    return { status: "success", value: workspace };
  }
};

const text = () => document.body.textContent ?? "";
const textarea = () => document.querySelector<HTMLTextAreaElement>("textarea")!;
const send = () =>
  document.querySelector<HTMLButtonElement>('button[type="submit"]')!;
const messages = () => [...document.querySelectorAll<HTMLElement>(".message")];
const provisional = () =>
  document.querySelector<HTMLElement>(".message-streaming");
const entries = () => [
  ...document.querySelectorAll<HTMLButtonElement>(".conversation-entry")
];
const create = () =>
  document.querySelector<HTMLButtonElement>(
    ".conversation-navigation > button"
  )!;
let scrolls = 0;
Element.prototype.scrollIntoView = function () {
  scrolls++;
};

async function input(value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLTextAreaElement.prototype,
      "value"
    )!.set!.call(textarea(), value);
    textarea().dispatchEvent(new Event("input", { bubbles: true }));
  });
}
async function submit(value: string) {
  await input(value);
  await act(async () => {
    send().click();
    send().click();
  });
  return { request: requests.at(-1)!, output: channels.at(-1)! };
}
async function emit(
  output: ReturnType<typeof channel>,
  event: ConversationStreamEvent
) {
  await act(async () => output.push({ kind: "event", value: event }));
}
async function end(output: ReturnType<typeof channel>, kind: "end" | "throw") {
  await act(async () => output.push({ kind }));
}
function content(delta: string): ConversationStreamEvent {
  return { type: "content", delta };
}
function failure(id: string, code = "FAILED"): ConversationStreamEvent {
  return {
    type: "failure",
    response: {
      id,
      status: "failure",
      content: "",
      error: { code, message: "private details" }
    }
  };
}
function complete(id: string, content: string): ConversationStreamEvent {
  return { type: "complete", response: { id, status: "success", content } };
}
function save(request: ConversationRequest, final: string) {
  history.push(
    {
      id: `${request.id}:user`,
      role: "user",
      content: request.prompt,
      timestamp: "2026-10-02T00:00:00Z"
    },
    {
      id: `${request.id}:assistant`,
      role: "assistant",
      content: final,
      timestamp: "2026-10-02T00:00:01Z"
    }
  );
}
function unlocked() {
  return (
    !textarea().readOnly &&
    !create().disabled &&
    entries().every((entry) => !entry.disabled)
  );
}

async function run() {
  await act(async () => root.render(<App navigation={navigation} />));
  await act(async () => entries()[0].click());
  check(opens === 1 && textarea(), "Streaming conversation opens");

  const first = await submit("Stream <script>prompt</script>");
  check(
    requests.length === 1 && executeCalls === 0,
    "executeStream preferred and duplicate submit blocked"
  );
  check(
    first.request.context?.conversationId === workspace.id,
    "Workspace conversation context retained"
  );
  check(
    messages().length === 1 && !provisional(),
    "No empty assistant bubble before content"
  );
  check(
    textarea().readOnly && send().disabled && create().disabled,
    "Composer and navigation locked"
  );
  const priorScrolls = scrolls;
  await emit(first.output, content(""));
  check(
    !provisional() && scrolls === priorScrolls,
    "Empty delta has no visible effect"
  );
  await emit(first.output, content("**Hel"));
  check(
    provisional()?.textContent?.includes("**Hel") &&
      !provisional()?.querySelector("strong") &&
      messages().length === 2,
    "Incomplete Markdown is visible before terminal"
  );
  await act(async () => {
    first.output.push({ kind: "event", value: content("lo** ") });
    first.output.push({
      kind: "event",
      value: content('<script>alert("unsafe")</script>')
    });
  });
  check(
    document.querySelectorAll(".message-streaming").length === 1,
    "Rapid deltas retain one assistant bubble"
  );
  check(
    provisional()?.querySelector("strong")?.textContent === "Hello",
    "Later delta completes Markdown in the same assistant bubble"
  );
  check(
    !provisional()?.querySelector("script") && scrolls > priorScrolls,
    "Literal HTML stays escaped and scroll follows content"
  );
  check(
    messages()[0].classList.contains("message-pending") &&
      messages()[1].classList.contains("message-streaming"),
    "Pending user precedes provisional assistant"
  );
  const beforeNavigation = opens;
  await act(async () => {
    entries()[1].click();
    create().click();
  });
  check(
    opens === beforeNavigation && creates === 0 && create().disabled,
    "Navigation remains locked through deltas"
  );
  const beforeHistory = historyReads;
  save(first.request, "**Authoritative saved answer**");
  await emit(
    first.output,
    complete(first.request.id, "Different terminal text")
  );
  check(
    first.output.closed && historyReads === beforeHistory + 1,
    "Terminal reconciles once from Workspace history"
  );
  check(
    messages().length === 2 &&
      !provisional() &&
      !document.querySelector(".message-pending"),
    "One final user and assistant replace provisional pair"
  );
  check(
    messages()[1].querySelector("strong")?.textContent ===
      "Authoritative saved answer",
    "Final UI formats authoritative history"
  );
  check(
    !text().includes("Different terminal text") &&
      !text().includes("Hello alert"),
    "Neither terminal nor provisional text is retained"
  );
  check(
    unlocked() && text().includes("Ready for your next goal"),
    "Success releases lock and status"
  );
  first.output.push({ kind: "event", value: content("late") });
  check(!text().includes("late"), "Event after terminal does not mutate UI");

  const before = await submit("Fail before content");
  await emit(before.output, failure(before.request.id));
  check(
    !provisional() && textarea().value === "Fail before content" && unlocked(),
    "Failure before delta is safe and unlocks"
  );
  check(
    Boolean(document.querySelector('[role="alert"]')) &&
      !text().includes("private details"),
    "Failure details stay hidden"
  );
  const retry = await submit("Fail before content");
  check(
    retry.request.id === before.request.id,
    "Unchanged retry keeps request ID"
  );
  await emit(retry.output, content("```ts\nconst x ="));
  check(
    Boolean(provisional()?.querySelector("pre code")) &&
      provisional()?.textContent?.includes("const x ="),
    "Incomplete code fence renders during retry"
  );
  await emit(retry.output, failure(retry.request.id));
  check(
    !provisional() &&
      messages().length === 2 &&
      textarea().value === "Fail before content",
    "Failed partial output disappears without history change"
  );
  await input("Edited retry");
  const edited = await submit("Edited retry");
  check(edited.request.id !== retry.request.id, "Edited retry gets new ID");
  await emit(edited.output, failure(edited.request.id, "PERMISSION_DENIED"));
  check(
    text().includes("The requested action was not approved"),
    "Permission denial retains distinct safe feedback"
  );

  const thrown = await submit("Throw during iteration");
  await emit(thrown.output, content("Partial throw"));
  await end(thrown.output, "throw");
  check(
    !provisional() &&
      unlocked() &&
      !text().includes("private stream exception"),
    "Iteration throw becomes generic safe failure"
  );
  const missing = await submit("Missing terminal");
  await emit(missing.output, content("Partial missing"));
  await end(missing.output, "end");
  check(
    !provisional() &&
      unlocked() &&
      Boolean(document.querySelector('[role="alert"]')),
    "Missing terminal becomes generic failure"
  );
  const malformedContent = await submit("Malformed content");
  await emit(malformedContent.output, {
    type: "content",
    delta: 7
  } as unknown as ConversationStreamEvent);
  check(
    !provisional() &&
      unlocked() &&
      Boolean(document.querySelector('[role="alert"]')),
    "Malformed content fails safely"
  );
  const malformedTerminal = await submit("Malformed terminal");
  await emit(malformedTerminal.output, {
    type: "complete",
    response: {
      id: malformedTerminal.request.id,
      status: "failure",
      content: "bad"
    }
  } as unknown as ConversationStreamEvent);
  check(
    !provisional() &&
      unlocked() &&
      Boolean(document.querySelector('[role="alert"]')),
    "Malformed terminal fails safely"
  );
  streamCreationThrows = true;
  await submit("Throw on creation");
  check(
    unlocked() && !text().includes("private creation exception"),
    "Creation throw becomes generic safe failure"
  );
  streamCreationThrows = false;

  const abandoned = await submit("Unmount during stream");
  await emit(abandoned.output, content("Abandoned partial"));
  await act(async () => root.render(<App />));
  await emit(abandoned.output, complete(abandoned.request.id, "Late final"));
  check(
    text().includes("Chat is currently unavailable") &&
      !text().includes("Abandoned partial") &&
      !text().includes("Late final"),
    "Unmount ignores late Presentation updates"
  );

  await act(async () => root.render(<App workspace={workspace} />));
  const replacing = await submit("Replace Workspace during stream");
  await emit(replacing.output, content("Old Workspace partial"));
  const replacement: Workspace = {
    id: workspace.id,
    title: "Replacement Workspace",
    getHistory: () => [],
    getPermissionHistory: () => [],
    execute: async () => ({ id: "unused", status: "failure", content: "" })
  };
  await act(async () => root.render(<App workspace={replacement} />));
  check(
    text().includes("Replacement Workspace") &&
      !provisional() &&
      !document.querySelector(".message-pending") &&
      !textarea().readOnly,
    "Same-ID Workspace replacement clears transient state"
  );
  await emit(
    replacing.output,
    complete(replacing.request.id, "Old late answer")
  );
  await end(replacing.output, "end");
  check(
    !text().includes("Old late answer") &&
      !text().includes("Old Workspace partial"),
    "Old stream cannot update replacement Workspace"
  );
  checks.textContent = `TASK-053 browser checks passed (${assertions} assertions)`;
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: false });
}

run().catch((error: unknown) => {
  checks.textContent = `TASK-053 browser checks FAILED: ${error instanceof Error ? error.message : "Unknown failure"}`;
});
