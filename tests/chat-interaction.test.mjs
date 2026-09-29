import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom"
});
after(() => vite.close());
const { chatReducer, initialChatState, prepareAttempt } =
  await vite.ssrLoadModule("/src/components/chat/chat-state.ts");
const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
const { MessageList } = await vite.ssrLoadModule(
  "/src/components/chat/MessageList.tsx"
);
const message = (role, content, id = role) => ({
  id,
  role,
  content,
  timestamp: "2026-09-29T00:00:00Z"
});
function workspace(history = []) {
  return {
    id: "active",
    title: "Current goal",
    getHistory: () => history,
    execute: () => {
      throw new Error("Rendering must not execute");
    }
  };
}
function edit(state, draft) {
  return chatReducer(state, { type: "edit", draft });
}

test("blank input is blocked without generating an ID; meaningful whitespace is preserved", () => {
  const state = initialChatState([]);
  const mustNotGenerate = () => assert.fail("No ID should be generated");
  for (const draft of ["", " \n\t "]) {
    assert.equal(prepareAttempt(edit(state, draft), mustNotGenerate), null);
  }
  assert.deepEqual(
    prepareAttempt(edit(state, "  goal\nnext  "), () => "new"),
    {
      id: "new",
      prompt: "  goal\nnext  "
    }
  );
});

test("pending attempts are separate from completed history and block edits/submissions", () => {
  const history = [message("assistant", "Earlier response")];
  const drafted = edit(initialChatState(history), "Next goal");
  const attempt = prepareAttempt(drafted, () => "request");
  const pending = chatReducer(drafted, { type: "start", attempt });
  assert.equal(pending.history, history);
  assert.equal(
    prepareAttempt(pending, () => assert.fail("Pending ID")),
    null
  );
  assert.equal(edit(pending, "accidental edit"), pending);
  assert.equal(chatReducer(pending, { type: "start", attempt }), pending);
});

test("failed unchanged drafts reuse an ID; any edit invalidates it, including edit then undo", () => {
  const draft = edit(initialChatState([]), "Goal");
  const attempt = prepareAttempt(draft, () => "original");
  const failed = chatReducer(chatReducer(draft, { type: "start", attempt }), {
    type: "failure"
  });
  assert.equal(failed.draft, "Goal");
  assert.equal(failed.failed, true);
  assert.equal(failed.pending, null);
  assert.deepEqual(
    prepareAttempt(failed, () => assert.fail("Retry ID")),
    attempt
  );
  assert.equal(edit(failed, "Goal"), failed);
  const edited = edit(failed, "Goal edited");
  assert.equal(edited.retryId, null);
  assert.equal(edited.failed, false);
  assert.equal(prepareAttempt(edit(edited, "Goal"), () => "new").id, "new");
});

test("success replaces the snapshot with authoritative history and clears transient state", () => {
  const draft = edit(initialChatState([]), "Goal");
  const pending = chatReducer(draft, {
    type: "start",
    attempt: { id: "old", prompt: "Goal" }
  });
  const history = [
    message("user", "Goal"),
    message("assistant", "Saved result")
  ];
  const completed = chatReducer(pending, { type: "success", history });
  assert.deepEqual(completed, initialChatState(history));
  assert.equal(completed.history, history);
  assert.equal(
    prepareAttempt(edit(completed, "Next"), () => "next").id,
    "next"
  );
});

test("App without Workspace is deliberate and has no active composer", () => {
  const html = renderToStaticMarkup(createElement(App));
  assert.match(html, /Chat is currently unavailable/);
  assert.doesNotMatch(html, /textarea|foundation|API key/i);
});

test("an empty injected Workspace renders a usable labeled composer without executing", () => {
  const html = renderToStaticMarkup(
    createElement(App, { workspace: workspace() })
  );
  assert.match(html, /What would you like to accomplish/);
  assert.match(html, /Message the Agent/);
  assert.match(html, /textarea/);
  assert.match(html, /Shift\+Enter/);
  assert.match(html, /type="submit" disabled/);
});

test("existing roles and untrusted multiline text render through escaped React content", () => {
  const content = '<script>alert("unsafe")</script>\nsecond line';
  const history = ["user", "assistant", "system", "tool"].map((role) =>
    message(role, content)
  );
  const html = renderToStaticMarkup(
    createElement(App, { workspace: workspace(history) })
  );
  for (const label of ["You", "Agent", "System", "Tool"])
    assert.ok(html.includes(label));
  assert.equal((html.match(/class="message-content"/g) ?? []).length, 4);
  assert.match(
    html,
    /&lt;script&gt;alert\(&quot;unsafe&quot;\)&lt;\/script&gt;\nsecond line/
  );
  assert.doesNotMatch(html, /<script>|What would you like/);
});

test("pending prompt has an explicit transient label and does not duplicate history", () => {
  const history = [message("assistant", "Saved")];
  const html = renderToStaticMarkup(
    createElement(MessageList, {
      history,
      pending: { id: "pending", prompt: "New request" }
    })
  );
  assert.match(html, /Pending/);
  assert.equal((html.match(/New request/g) ?? []).length, 1);
  assert.equal(history.length, 1);
});
