import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { URL } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(() => vite.close());
const { createConversationNavigation } = await vite.ssrLoadModule(
  "/src/workspace/createConversationNavigation.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/registry.ts"
);
const { SqliteConversationStorage } = await vite.ssrLoadModule(
  "/src/infrastructure/database/conversation-storage.ts"
);
const { default: App } = await vite.ssrLoadModule("/src/App.tsx");
const { ConversationNavigation } = await vite.ssrLoadModule(
  "/src/components/conversations/ConversationNavigation.tsx"
);
const migration = readFileSync(
  new URL("../drizzle/0000_amusing_kylun.sql", import.meta.url),
  "utf8"
);
const meta = (id, title = null) => ({
  id,
  title,
  createdAt: 1000,
  updatedAt: 1000
});
const row = (id, role, content, conversationId = "saved") => ({
  id,
  role,
  content,
  conversationId,
  createdAt: 1000
});

function fakeStorage(initial = [], messages = []) {
  const conversations = new Map(
    initial.map((session) => [session.id, session])
  );
  const rows = [...messages];
  return {
    conversations,
    rows,
    async getConversation(id) {
      return conversations.get(id);
    },
    async insertConversation(session) {
      assert.ok(!conversations.has(session.id));
      conversations.set(session.id, { ...session });
    },
    async listConversations() {
      return [...conversations.values()];
    },
    async getMessages(id) {
      return rows.filter((message) => message.conversationId === id);
    },
    async insertMessage() {
      assert.fail("Navigation must not insert individual messages");
    },
    async insertCompletedTurn(user, assistant) {
      rows.push(user, assistant);
    }
  };
}
function providerConfig(calls = []) {
  const registry = new DefaultProviderRegistry();
  registry.registerProvider({
    id: "test-provider",
    name: "Test provider",
    capabilities: {
      contextWindow: 4096,
      supportsSystemInstructions: true,
      supportsFunctionCalling: false,
      supportsVision: false
    },
    async generateCompletion(request) {
      calls.push(request);
      return {
        success: true,
        role: "assistant",
        content: `Reply ${calls.length}`
      };
    }
  });
  return {
    providerRegistry: registry,
    providerId: "test-provider",
    model: "test-model"
  };
}
function navigation(storage, overrides = {}) {
  return createConversationNavigation({
    storage,
    workspaceConfig: providerConfig(),
    createId: () => "new",
    ...overrides
  });
}
function failure(result, code) {
  assert.equal(result.status, "failure");
  assert.equal(result.error.code, code);
  assert.doesNotMatch(
    result.error.message,
    /secret|SQL|private|test-provider|stack/i
  );
}

test("lists persisted metadata in supplied order, including nullable titles and empty lists", async () => {
  const sessions = [meta("z", "Last alphabetically"), meta("a")];
  assert.deepEqual(
    await navigation(fakeStorage(sessions)).listConversations(),
    { status: "success", value: sessions }
  );
  assert.deepEqual(await navigation(fakeStorage()).listConversations(), {
    status: "success",
    value: []
  });
});

test("list storage failures are sanitized", async () => {
  const storage = fakeStorage();
  storage.listConversations = async () => {
    throw new Error("SQL secret path");
  };
  failure(
    await navigation(storage).listConversations(),
    "session_storage_failed"
  );
});

test("creation uses an injected ID, persists null title, and constructs once without execution side effects", async () => {
  const calls = [];
  const storage = fakeStorage();
  const config = providerConfig(calls);
  let constructions = 0;
  const lookup = config.providerRegistry.getProvider.bind(
    config.providerRegistry
  );
  config.providerRegistry.getProvider = (id) => {
    constructions++;
    return lookup(id);
  };
  const result = await navigation(storage, {
    workspaceConfig: config
  }).createConversation();
  assert.equal(result.status, "success");
  assert.equal(result.value.id, "new");
  assert.equal(result.value.title, "Untitled conversation");
  assert.deepEqual(result.value.getHistory(), []);
  assert.deepEqual(result.value.getPermissionHistory(), []);
  assert.equal(storage.conversations.get("new").title, null);
  assert.equal(constructions, 1);
  assert.deepEqual(calls, []);
  assert.deepEqual(storage.rows, []);
  assert.equal(
    (
      await result.value.execute({
        id: "turn",
        prompt: "Hello",
        context: { conversationId: "new" }
      })
    ).status,
    "success"
  );
  assert.equal(storage.rows.length, 2);
  assert.equal(storage.rows[0].conversationId, "new");
});

test("duplicate and uncertain creation failures neither overwrite nor automatically create another session", async () => {
  const storage = fakeStorage([meta("new", "Original")]);
  let ids = 0;
  const service = navigation(storage, {
    createId: () => {
      ids++;
      return "new";
    }
  });
  failure(await service.createConversation(), "session_already_exists");
  assert.equal(storage.conversations.get("new").title, "Original");
  assert.equal(ids, 1);
  const uncertain = fakeStorage();
  uncertain.insertConversation = async (session) => {
    uncertain.conversations.set(session.id, session);
    throw new Error("secret uncertain insert");
  };
  failure(
    await navigation(uncertain).createConversation(),
    "session_storage_failed"
  );
  assert.equal(uncertain.conversations.size, 1);
  assert.equal(uncertain.conversations.get("new").title, null);
});

test("configuration and ID-generation exceptions fail safely before session insertion", async () => {
  for (const overrides of [
    { workspaceConfig: { ...providerConfig(), model: " " } },
    { workspaceConfig: { ...providerConfig(), providerId: "secret-provider" } },
    {
      createId: () => {
        throw new Error("secret ID failure");
      }
    }
  ]) {
    const storage = fakeStorage();
    failure(
      await navigation(storage, overrides).createConversation(),
      "workspace_unavailable"
    );
    assert.equal(storage.conversations.size, 0);
    assert.equal(storage.rows.length, 0);
  }
});

test("opening hydrates validated history in supplied order and continues using it", async () => {
  const storage = fakeStorage(
    [meta("saved")],
    [row("u", "user", "Earlier"), row("a", "assistant", "Previous response")]
  );
  const calls = [];
  const service = navigation(storage, {
    workspaceConfig: providerConfig(calls)
  });
  const opened = await service.openConversation("saved");
  assert.equal(opened.status, "success");
  assert.equal(opened.value.id, "saved");
  assert.equal(opened.value.title, "Untitled conversation");
  assert.deepEqual(
    opened.value.getHistory().map(({ content }) => content),
    ["Earlier", "Previous response"]
  );
  assert.equal(storage.conversations.get("saved").title, null);
  assert.equal(
    (await opened.value.execute({ id: "next", prompt: "Continue" })).status,
    "success"
  );
  assert.deepEqual(
    calls[0].messages.map(({ content }) => content),
    ["Earlier", "Previous response", "Continue"]
  );
  assert.equal(storage.rows.length, 4);
  assert.equal(storage.conversations.get("saved").title, null);
});

test("opening preserves existing titles and rejects invalid IDs, absent sessions and corrupt history", async () => {
  const storage = fakeStorage([meta("saved", "Existing title")]);
  const service = navigation(storage);
  assert.equal(
    (await service.openConversation("saved")).value.title,
    "Existing title"
  );
  failure(await service.openConversation(" "), "invalid_session_id");
  failure(await service.openConversation("missing"), "session_not_found");
  storage.rows.push(row("bad", "unknown", "Bad"));
  failure(await service.openConversation("saved"), "invalid_persisted_history");
  assert.equal(storage.conversations.get("saved").title, "Existing title");
});

test("opening sanitizes history and Workspace-construction failures without rewriting storage", async () => {
  const storage = fakeStorage([meta("saved")]);
  failure(
    await navigation(storage, {
      workspaceConfig: { ...providerConfig(), model: "" }
    }).openConversation("saved"),
    "workspace_unavailable"
  );
  storage.getMessages = async () => {
    throw new Error("SQL secret path");
  };
  failure(
    await navigation(storage).openConversation("saved"),
    "session_storage_failed"
  );
  assert.equal(storage.conversations.get("saved").title, null);
  assert.deepEqual(storage.rows, []);
});

test("navigation renders supplied order, escaped titles, and selection beyond color", () => {
  const html = renderToStaticMarkup(
    createElement(ConversationNavigation, {
      sessions: [meta("z", "<script>Title</script>"), meta("a")],
      activeId: "a",
      loading: false,
      failed: false,
      disabled: false,
      onCreate() {},
      onSelect() {},
      onRetry() {}
    })
  );
  assert.ok(
    html.indexOf("&lt;script&gt;") < html.indexOf("Untitled conversation")
  );
  assert.match(html, /aria-current="true"/);
  assert.match(html, /Active/);
  assert.doesNotMatch(html, /<script>/);
});

test("App navigation, static and unavailable modes remain distinct; conflicting injection fails closed", () => {
  const service = navigation(fakeStorage());
  const shell = renderToStaticMarkup(
    createElement(App, { navigation: service })
  );
  assert.match(shell, /New conversation/);
  assert.match(shell, /No conversation is active/);
  assert.doesNotMatch(shell, /Chat is currently unavailable/);
  const workspace = { id: "static", title: "Static", getHistory: () => [] };
  assert.match(
    renderToStaticMarkup(createElement(App, { workspace })),
    /Message the Agent/
  );
  assert.match(
    renderToStaticMarkup(createElement(App)),
    /Chat is currently unavailable/
  );
  const conflict = renderToStaticMarkup(
    createElement(App, { navigation: service, workspace })
  );
  assert.match(conflict, /Check your workspace configuration/);
  assert.doesNotMatch(conflict, /New conversation|textarea/);
});

test("create, converse, reconstruct composition, rediscover, open and continue in isolated SQLite", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "eous-navigation-"));
  const file = join(directory, "test.db");
  let database = new DatabaseSync(file);
  database.exec(migration);
  database.exec("PRAGMA foreign_keys = ON");
  t.after(() => {
    database.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  function makeStorage() {
    return new SqliteConversationStorage(async () => ({
      async execute(query, values = []) {
        return database.prepare(query.replace(/\$\d+/g, "?")).run(...values);
      },
      async select(query, values = []) {
        return database
          .prepare(query.replace(/\$\d+/g, "?"))
          .all(...values)
          .map((value) => ({ ...value }));
      }
    }));
  }
  let service = navigation(makeStorage());
  const created = await service.createConversation();
  assert.equal(created.status, "success");
  assert.equal(
    (await created.value.execute({ id: "one", prompt: "First" })).status,
    "success"
  );
  database.close();
  database = new DatabaseSync(file);
  database.exec("PRAGMA foreign_keys = ON");
  // New adapter, session operations, provider registry and navigation capability.
  service = navigation(makeStorage());
  const listed = await service.listConversations();
  assert.equal(listed.status, "success");
  assert.deepEqual(
    listed.value.map(({ id, title }) => ({ id, title })),
    [{ id: "new", title: null }]
  );
  const resumed = await service.openConversation(listed.value[0].id);
  assert.equal(resumed.status, "success");
  assert.deepEqual(
    resumed.value.getHistory().map(({ content }) => content),
    ["First", "Reply 1"]
  );
  assert.equal(
    (await resumed.value.execute({ id: "two", prompt: "Continue" })).status,
    "success"
  );
  const reopened = await service.openConversation("new");
  assert.deepEqual(
    reopened.value.getHistory().map(({ content }) => content),
    ["First", "Reply 1", "Continue", "Reply 1"]
  );
  assert.equal((await service.listConversations()).value[0].title, null);
  assert.equal(
    database
      .prepare("SELECT COUNT(*) AS count FROM conversation_messages")
      .get().count,
    4
  );
});
