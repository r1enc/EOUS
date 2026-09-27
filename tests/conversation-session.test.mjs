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

const { ConversationSessionOperations } = await vite.ssrLoadModule(
  "/src/conversation/session-operations.ts"
);
const { SqliteConversationStorage } = await vite.ssrLoadModule(
  "/src/infrastructure/database/conversation-storage.ts"
);
const migration = readFileSync(
  new URL("../drizzle/0000_amusing_kylun.sql", import.meta.url),
  "utf8"
);

function fakeStorage(initial = []) {
  const conversations = new Map(initial.map((item) => [item.id, item]));
  return {
    async insertConversation(conversation) {
      if (conversations.has(conversation.id))
        throw new Error("internal insert error");
      conversations.set(conversation.id, { ...conversation });
    },
    async getConversation(id) {
      return conversations.get(id);
    },
    async listConversations() {
      return [...conversations.values()];
    },
    async insertMessage() {
      throw new Error("Messages are outside TASK-046");
    },
    async getMessages() {
      throw new Error("Messages are outside TASK-046");
    }
  };
}

function expectFailure(result, code, category) {
  assert.equal(result.status, "failure");
  assert.equal(result.error.code, code);
  assert.equal(result.error.category, category);
  assert.ok(result.error.message);
  assert.doesNotMatch(result.error.message, /internal|SQL|database path/i);
}

test("creates, loads, lists, and resumes metadata through injected storage", async () => {
  const storage = fakeStorage();
  const sessions = new ConversationSessionOperations(storage, () => 1234);
  assert.deepEqual(await sessions.listSessions(), {
    status: "success",
    value: []
  });

  const first = { id: "first", title: " First " };
  const created = await sessions.createSession(first);
  assert.deepEqual(created, {
    status: "success",
    value: { ...first, createdAt: 1234, updatedAt: 1234 }
  });
  assert.deepEqual(await storage.getConversation("first"), created.value);
  assert.deepEqual(await sessions.loadSession("first"), created);
  assert.deepEqual(await sessions.resumeSession("first"), created);

  const second = await sessions.createSession({ id: "second", title: null });
  assert.equal(second.status, "success");
  assert.deepEqual(await sessions.listSessions(), {
    status: "success",
    value: [created.value, second.value]
  });
});

test("preserves storage-provided order and nullable stored titles", async () => {
  const later = { id: "later", title: null, createdAt: 1, updatedAt: 3 };
  const earlier = { id: "earlier", title: "Old", createdAt: 1, updatedAt: 2 };
  const sessions = new ConversationSessionOperations(
    fakeStorage([later, earlier])
  );
  assert.deepEqual(await sessions.listSessions(), {
    status: "success",
    value: [later, earlier]
  });
});

test("rejects invalid input, reports missing and duplicate sessions", async () => {
  const sessions = new ConversationSessionOperations(fakeStorage(), () => 1);
  for (const id of ["", "   ", undefined, null, 7]) {
    expectFailure(
      await sessions.loadSession(id),
      "invalid_session_id",
      "validation"
    );
    expectFailure(
      await sessions.resumeSession(id),
      "invalid_session_id",
      "validation"
    );
    expectFailure(
      await sessions.createSession({ id, title: "Valid" }),
      "invalid_session_id",
      "validation"
    );
  }
  for (const title of ["", "  ", undefined, 7]) {
    expectFailure(
      await sessions.createSession({ id: "valid", title }),
      "invalid_session_title",
      "validation"
    );
  }
  expectFailure(
    await sessions.createSession(undefined),
    "invalid_session_id",
    "validation"
  );
  expectFailure(
    await sessions.loadSession("missing"),
    "session_not_found",
    "session"
  );
  expectFailure(
    await sessions.resumeSession("missing"),
    "session_not_found",
    "session"
  );
  await sessions.createSession({ id: "same", title: "One" });
  expectFailure(
    await sessions.createSession({ id: "same", title: "Two" }),
    "session_already_exists",
    "session"
  );
});

test("sanitizes storage failures without misclassifying ambiguous insert failures", async () => {
  const storage = fakeStorage();
  const sessions = new ConversationSessionOperations(storage, () => 1);
  storage.insertConversation = async () => {
    throw new Error("SQL INSERT failed at C:\\private\\database.db");
  };
  expectFailure(
    await sessions.createSession({ id: "new", title: "New" }),
    "session_storage_failed",
    "session"
  );
  storage.getConversation = async () => {
    throw new Error("internal read error");
  };
  expectFailure(
    await sessions.loadSession("new"),
    "session_storage_failed",
    "session"
  );
  expectFailure(
    await sessions.createSession({ id: "new", title: "New" }),
    "session_storage_failed",
    "session"
  );
  storage.listConversations = async () => {
    throw new Error("internal list error");
  };
  expectFailure(
    await sessions.listSessions(),
    "session_storage_failed",
    "session"
  );
});

test("persists session operations across an isolated SQLite close and reopen", async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "eous-session-"));
  const path = join(directory, "test.db");
  let database = new DatabaseSync(path);
  database.exec(migration);
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
  const first = await sessions.createSession({ id: "a", title: "First" });
  const second = await sessions.createSession({ id: "b", title: null });
  assert.equal(first.status, "success");
  assert.equal(second.status, "success");
  database.close();
  database = new DatabaseSync(path);

  assert.deepEqual(await sessions.loadSession("a"), first);
  assert.deepEqual(await sessions.resumeSession("b"), second);
  assert.deepEqual(await sessions.listSessions(), {
    status: "success",
    value: [first.value, second.value]
  });
});
