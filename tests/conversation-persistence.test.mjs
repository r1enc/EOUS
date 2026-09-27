import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, sep } from "node:path";
import { DatabaseSync } from "node:sqlite";
import { after, test } from "node:test";
import { URL } from "node:url";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom"
});
after(async () => vite.close());

const { DefaultConversation } = await vite.ssrLoadModule(
  "/src/conversation/runtime.ts"
);
const { ConversationSessionOperations } = await vite.ssrLoadModule(
  "/src/conversation/session-operations.ts"
);
const { SqliteConversationStorage } = await vite.ssrLoadModule(
  "/src/infrastructure/database/conversation-storage.ts"
);
const { createWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createWorkspace.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/index.ts"
);
const migration = readFileSync(
  new URL("../drizzle/0000_amusing_kylun.sql", import.meta.url),
  "utf8"
);

function fakeStorage(initial = []) {
  const rows = [...initial];
  const writes = [];
  return {
    rows,
    writes,
    async getConversation(id) {
      return { id, title: "Test", createdAt: 0, updatedAt: 0 };
    },
    async getMessages(id) {
      return rows.filter((row) => row.conversationId === id);
    },
    async insertCompletedTurn(user, assistant) {
      writes.push([user, assistant]);
      if (rows.some((row) => row.id === user.id || row.id === assistant.id)) {
        throw new Error("SQL duplicate at C:\\private\\test.db");
      }
      rows.push(user, assistant);
    }
  };
}

function makeAgent(response = "Answer") {
  const calls = [];
  return {
    id: "agent",
    name: "Agent",
    calls,
    async execute(request) {
      calls.push(request);
      return response === null
        ? {
            id: request.id,
            content: "",
            status: "failure",
            error: { code: "AGENT_FAILED", message: "Agent failed" }
          }
        : { id: request.id, content: response, status: "success" };
    }
  };
}

function expectFailure(result, code) {
  assert.equal(result.status, "failure");
  assert.equal(result.error.code, code);
  assert.doesNotMatch(result.error.message, /SQL|database|private/i);
}

test("loads ordered history with validated roles, timestamps, and public IDs", async () => {
  const store = fakeStorage([
    {
      id: '["eous-turn-v1","c","r:user"]',
      conversationId: "c",
      role: "user",
      content: "Hello",
      createdAt: 1000
    },
    {
      id: '["eous-turn-v1","c","r:assistant"]',
      conversationId: "c",
      role: "assistant",
      content: "Hi",
      createdAt: 1000
    },
    {
      id: "legacy",
      conversationId: "c",
      role: "system",
      content: "Note",
      createdAt: 2000
    }
  ]);
  const sessions = new ConversationSessionOperations(store);
  const loaded = await sessions.loadHistory("c");
  assert.equal(loaded.status, "success");
  assert.deepEqual(
    loaded.value.map(({ id, role, timestamp }) => [id, role, timestamp]),
    [
      ["r:user", "user", "1970-01-01T00:00:01.000Z"],
      ["r:assistant", "assistant", "1970-01-01T00:00:01.000Z"],
      ["legacy", "system", "1970-01-01T00:00:02.000Z"]
    ]
  );
  const agent = makeAgent();
  const conversation = new DefaultConversation("c", "Test", agent, {
    initialHistory: loaded.value
  });
  loaded.value[0].content = "Changed";
  const exposed = conversation.getHistory();
  exposed[1].content = "Changed";
  assert.deepEqual(
    conversation.getHistory().map((item) => item.content),
    ["Hello", "Hi", "Note"]
  );
});

test("rejects corrupt persisted history and sanitizes load failures", async () => {
  const row = {
    id: "bad",
    conversationId: "c",
    role: "alien",
    content: "x",
    createdAt: 1
  };
  const store = fakeStorage([row]);
  const sessions = new ConversationSessionOperations(store);
  expectFailure(await sessions.loadHistory("c"), "invalid_persisted_history");
  row.role = "user";
  row.createdAt = Number.MAX_SAFE_INTEGER;
  expectFailure(await sessions.loadHistory("c"), "invalid_persisted_history");
  row.createdAt = 1;
  row.id = '["eous-turn-v1","other","r:user"]';
  expectFailure(await sessions.loadHistory("c"), "invalid_persisted_history");
  row.id = "duplicate";
  store.rows.push({ ...row });
  expectFailure(await sessions.loadHistory("c"), "invalid_persisted_history");
  store.getMessages = async () => {
    throw new Error("SQL at C:\\private\\test.db");
  };
  expectFailure(await sessions.loadHistory("c"), "session_storage_failed");
  expectFailure(await sessions.loadHistory(" "), "invalid_session_id");
});

test("persistent success writes one completed pair and preserves context override", async () => {
  const store = fakeStorage();
  const agent = makeAgent("Reply");
  const conversation = new DefaultConversation("c", "Test", agent, {
    persistence: store,
    now: () => 1500
  });
  const supplied = {
    messages: [
      { id: "outside", role: "system", content: "Provided", timestamp: "now" }
    ]
  };
  const response = await conversation.execute({
    id: "r",
    prompt: "Question",
    context: { conversationId: "c", history: supplied }
  });
  assert.equal(response.status, "success");
  assert.deepEqual(
    agent.calls[0].context.history.map(({ content }) => content),
    ["Provided"]
  );
  assert.equal(store.writes.length, 1);
  assert.deepEqual(
    store.rows.map(({ role, content, createdAt }) => [
      role,
      content,
      createdAt
    ]),
    [
      ["user", "Question", 1500],
      ["assistant", "Reply", 1500]
    ]
  );
  assert.deepEqual(
    conversation.getHistory().map(({ id, timestamp }) => [id, timestamp]),
    [
      ["r:user", "1970-01-01T00:00:01.500Z"],
      ["r:assistant", "1970-01-01T00:00:01.500Z"]
    ]
  );
  assert.equal(
    store.rows.some(({ content }) => content === "Provided"),
    false
  );
});

test("Agent failure leaves persistent and in-memory completed history empty", async () => {
  const store = fakeStorage();
  const conversation = new DefaultConversation("c", "Test", makeAgent(null), {
    persistence: store
  });
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Question" }),
    "AGENT_FAILED"
  );
  assert.deepEqual(store.rows, []);
  assert.deepEqual(conversation.getHistory(), []);
});

test("failed and uncertain writes preserve coherent memory and retry", async () => {
  const store = fakeStorage();
  const agent = makeAgent("Reply");
  const conversation = new DefaultConversation("c", "Test", agent, {
    persistence: store,
    now: () => 1500
  });
  const original = store.insertCompletedTurn;
  store.insertCompletedTurn = async () => {
    throw new Error("SQL failed");
  };
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Question" }),
    "TURN_PERSISTENCE_FAILED"
  );
  assert.deepEqual(conversation.getHistory(), []);
  assert.deepEqual(store.rows, []);
  store.insertCompletedTurn = async (...args) => {
    await original(...args);
    throw new Error("connection lost after commit");
  };
  const recovered = await conversation.execute({ id: "r", prompt: "Question" });
  assert.equal(recovered.status, "success");
  assert.equal(conversation.getHistory().length, 2);
  const retried = await conversation.execute({ id: "r", prompt: "Question" });
  assert.equal(retried.status, "success");
  assert.equal(agent.calls.length, 2);
  assert.equal(conversation.getHistory().length, 2);
  assert.equal(store.rows.length, 2);
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Changed" }),
    "TURN_INTEGRITY_FAILED"
  );
  assert.equal(agent.calls.length, 2);
});

test("partial or conflicting stored pairs fail before invoking Agent", async () => {
  const store = fakeStorage([
    {
      id: '["eous-turn-v1","c","r:user"]',
      conversationId: "c",
      role: "user",
      content: "Question",
      createdAt: 1
    }
  ]);
  const agent = makeAgent();
  const conversation = new DefaultConversation("c", "Test", agent, {
    persistence: store
  });
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Question" }),
    "TURN_INTEGRITY_FAILED"
  );
  assert.equal(agent.calls.length, 0);
  store.rows[0].role = "assistant";
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Question" }),
    "TURN_INTEGRITY_FAILED"
  );
});

test("a partial result after an uncertain write is an integrity failure", async () => {
  const store = fakeStorage();
  store.insertCompletedTurn = async (user) => {
    store.rows.push(user);
    throw new Error("connection failed");
  };
  const conversation = new DefaultConversation("c", "Test", makeAgent(), {
    persistence: store,
    now: () => 1
  });
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Question" }),
    "TURN_INTEGRITY_FAILED"
  );
  assert.deepEqual(conversation.getHistory(), []);
});

test("an unreadable uncertain result cannot create a completed memory turn", async () => {
  const store = fakeStorage();
  let reads = 0;
  store.getMessages = async () => {
    reads += 1;
    if (reads === 1) return [];
    throw new Error("SQL read failed");
  };
  store.insertCompletedTurn = async () => {
    throw new Error("commit outcome unknown");
  };
  const conversation = new DefaultConversation("c", "Test", makeAgent(), {
    persistence: store
  });
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Question" }),
    "TURN_PERSISTENCE_FAILED"
  );
  assert.deepEqual(conversation.getHistory(), []);
});

test("conflicting initial history prevents a persisted write", async () => {
  const store = fakeStorage();
  const agent = makeAgent();
  const conversation = new DefaultConversation("c", "Test", agent, {
    persistence: store,
    initialHistory: [
      { id: "r:user", role: "user", content: "Different", timestamp: "now" }
    ]
  });
  expectFailure(
    await conversation.execute({ id: "r", prompt: "Question" }),
    "TURN_INTEGRITY_FAILED"
  );
  assert.equal(agent.calls.length, 0);
  assert.deepEqual(store.rows, []);
});

test("separate conversations can persist the same request ID", async () => {
  const store = fakeStorage();
  const first = new DefaultConversation("first", "One", makeAgent("One"), {
    persistence: store,
    now: () => 1
  });
  const second = new DefaultConversation("second", "Two", makeAgent("Two"), {
    persistence: store,
    now: () => 1
  });
  assert.equal(
    (await first.execute({ id: "same", prompt: "Hello" })).status,
    "success"
  );
  assert.equal(
    (await second.execute({ id: "same", prompt: "Hello" })).status,
    "success"
  );
  assert.equal(new Set(store.rows.map(({ id }) => id)).size, 4);
  assert.deepEqual(
    first.getHistory().map(({ id }) => id),
    ["same:user", "same:assistant"]
  );
  assert.deepEqual(
    second.getHistory().map(({ id }) => id),
    ["same:user", "same:assistant"]
  );
});

test("concurrent same-ID attempts cannot persist conflicting completed pairs", async () => {
  const store = fakeStorage();
  let started = 0;
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const agent = {
    id: "agent",
    name: "Agent",
    async execute(request) {
      started += 1;
      if (started === 2) release();
      await gate;
      return { id: request.id, content: request.prompt, status: "success" };
    }
  };
  const first = new DefaultConversation("c", "Test", agent, {
    persistence: store,
    now: () => 1
  });
  const second = new DefaultConversation("c", "Test", agent, {
    persistence: store,
    now: () => 1
  });
  const outcomes = await Promise.all([
    first.execute({ id: "same", prompt: "One" }),
    second.execute({ id: "same", prompt: "Two" })
  ]);
  assert.deepEqual(outcomes.map(({ status }) => status).sort(), [
    "failure",
    "success"
  ]);
  assert.equal(
    outcomes.find(({ status }) => status === "failure").error.code,
    "TURN_INTEGRITY_FAILED"
  );
  assert.equal(store.rows.length, 2);
});

test("nonpersistent Conversation and synchronous Workspace construction remain usable", async () => {
  const agent = makeAgent();
  const conversation = new DefaultConversation("c", "Test", agent);
  assert.equal(
    (await conversation.execute({ id: "r", prompt: "Hello" })).status,
    "success"
  );
  assert.deepEqual(
    conversation.getHistory().map(({ id }) => id),
    ["r:user", "r:assistant"]
  );
  const registry = makeRegistry([]);
  const workspace = createWorkspace({
    providerRegistry: registry,
    providerId: "provider",
    model: "model",
    conversationId: "c",
    conversationTitle: "Test"
  });
  assert.equal(workspace.id, "c");
  assert.equal(
    (await workspace.execute({ id: "x", prompt: "Hi" })).status,
    "success"
  );
});

function makeRegistry(calls) {
  const registry = new DefaultProviderRegistry();
  registry.registerProvider({
    id: "provider",
    name: "Provider",
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
  return registry;
}

test("create, converse, reopen, resume, and continue through Workspace", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "eous-completed-turn-"));
  const path = join(directory, "test.db");
  let database = new DatabaseSync(path);
  database.exec(migration);
  database.exec("PRAGMA foreign_keys = ON");
  t.after(() => {
    database.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  });
  const storage = new SqliteConversationStorage(async () => ({
    async execute(query, values = []) {
      return database.prepare(query.replace(/\$\d+/g, "?")).run(...values);
    },
    async select(query, values = []) {
      return database
        .prepare(query.replace(/\$\d+/g, "?"))
        .all(...values)
        .map((row) => ({ ...row }));
    }
  }));
  const sessions = new ConversationSessionOperations(storage, () => 1000);
  assert.equal(
    (await sessions.createSession({ id: "c", title: null })).status,
    "success"
  );
  const providerCalls = [];
  const registry = makeRegistry(providerCalls);
  const first = createWorkspace({
    providerRegistry: registry,
    providerId: "provider",
    model: "model",
    conversationId: "c",
    conversationTitle: "",
    conversationPersistence: storage
  });
  assert.equal(
    (await first.execute({ id: "one", prompt: "First" })).status,
    "success"
  );
  assert.equal(
    (await sessions.createSession({ id: "other", title: "Other" })).status,
    "success"
  );
  const other = createWorkspace({
    providerRegistry: registry,
    providerId: "provider",
    model: "model",
    conversationId: "other",
    conversationTitle: "Other",
    conversationPersistence: storage
  });
  assert.equal(
    (await other.execute({ id: "one", prompt: "Separate" })).status,
    "success"
  );
  database.close();
  database = new DatabaseSync(path);
  database.exec("PRAGMA foreign_keys = ON");
  const resumed = await sessions.resumeSession("c");
  const history = await sessions.loadHistory("c");
  assert.equal(resumed.status, "success");
  assert.equal(resumed.value.title, null);
  assert.equal(history.status, "success");
  const second = createWorkspace({
    providerRegistry: registry,
    providerId: "provider",
    model: "model",
    conversationId: resumed.value.id,
    conversationTitle: resumed.value.title ?? "",
    initialHistory: history.value,
    conversationPersistence: storage
  });
  assert.deepEqual(
    second.getHistory().map(({ content }) => content),
    ["First", "Reply 1"]
  );
  assert.equal(
    (await second.execute({ id: "two", prompt: "Continue" })).status,
    "success"
  );
  assert.deepEqual(
    providerCalls[2].messages.map(({ content }) => content),
    ["First", "Reply 1", "Continue"]
  );
  const final = await sessions.loadHistory("c");
  assert.equal(final.status, "success");
  assert.deepEqual(
    final.value.map(({ content }) => content),
    ["First", "Reply 1", "Continue", "Reply 3"]
  );
  assert.deepEqual(second.getHistory(), final.value);
  assert.equal((await sessions.loadSession("c")).value.title, null);
});
