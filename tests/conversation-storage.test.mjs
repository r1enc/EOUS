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

const { SqliteConversationStorage } = await vite.ssrLoadModule(
  "/src/infrastructure/database/conversation-storage.ts"
);
const migration = readFileSync(
  new URL("../drizzle/0000_amusing_kylun.sql", import.meta.url),
  "utf8"
);

function createFixture(t) {
  const directory = mkdtempSync(join(tmpdir(), "eous-conversation-storage-"));
  const path = join(directory, "test.db");
  let database = new DatabaseSync(path);
  database.exec(migration);
  database.exec("PRAGMA foreign_keys = ON");
  assert.equal(database.prepare("PRAGMA foreign_keys").get().foreign_keys, 1);

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

  t.after(() => {
    database.close();
    assert.ok(resolve(directory).startsWith(resolve(tmpdir()) + sep));
    rmSync(directory, { recursive: true, force: true });
  });

  return {
    storage,
    reopen() {
      database.close();
      database = new DatabaseSync(path);
      database.exec("PRAGMA foreign_keys = ON");
      assert.equal(
        database.prepare("PRAGMA foreign_keys").get().foreign_keys,
        1
      );
    }
  };
}

const firstConversation = {
  id: "conversation-1",
  title: "First",
  createdAt: 1000,
  updatedAt: 2000
};
const secondConversation = {
  id: "conversation-2",
  title: null,
  createdAt: 3000,
  updatedAt: 4000
};

test("stores and retrieves distinct conversation metadata", async (t) => {
  const { storage } = createFixture(t);
  await storage.insertConversation(firstConversation);
  await storage.insertConversation(secondConversation);

  assert.deepEqual(
    await storage.getConversation("conversation-1"),
    firstConversation
  );
  assert.deepEqual(
    await storage.getConversation("conversation-2"),
    secondConversation
  );
  assert.equal(await storage.getConversation("missing"), undefined);
  assert.deepEqual(await storage.listConversations(), [
    secondConversation,
    firstConversation
  ]);
});

test("keeps messages in their conversations and orders equal timestamps by insertion", async (t) => {
  const { storage } = createFixture(t);
  await storage.insertConversation(firstConversation);
  await storage.insertConversation(secondConversation);

  const user = {
    id: "turn:user",
    conversationId: firstConversation.id,
    role: "user",
    content: "It's a test",
    createdAt: 1000
  };
  const assistant = {
    id: "turn:assistant",
    conversationId: firstConversation.id,
    role: "assistant",
    content: "Response",
    createdAt: 1000
  };
  const later = {
    id: "later:user",
    conversationId: firstConversation.id,
    role: "user",
    content: "Later",
    createdAt: 2000
  };
  const other = {
    id: "other:user",
    conversationId: secondConversation.id,
    role: "user",
    content: "Other",
    createdAt: 1000
  };
  for (const message of [user, assistant, other, later]) {
    await storage.insertMessage(message);
  }

  assert.deepEqual(await storage.getMessages(firstConversation.id), [
    user,
    assistant,
    later
  ]);
  assert.deepEqual(await storage.getMessages(secondConversation.id), [other]);
  assert.deepEqual(await storage.getMessages("missing"), []);
});

test("surfaces key and foreign-key violations without changing stored rows", async (t) => {
  const { storage } = createFixture(t);
  await storage.insertConversation(firstConversation);
  await assert.rejects(storage.insertConversation(firstConversation));

  const message = {
    id: "message-1",
    conversationId: firstConversation.id,
    role: "user",
    content: "Hello",
    createdAt: 1000
  };
  await storage.insertMessage(message);
  await assert.rejects(storage.insertMessage(message));
  await assert.rejects(
    storage.insertMessage({
      ...message,
      id: "orphan",
      conversationId: "missing"
    })
  );

  assert.deepEqual(await storage.getMessages(firstConversation.id), [message]);
  assert.equal(await storage.getConversation("missing"), undefined);
  await assert.rejects(
    storage.insertConversation({ ...firstConversation, id: "" })
  );
});

test("retrieves previously written data after database close and reopen", async (t) => {
  const { storage, reopen } = createFixture(t);
  const first = {
    id: "turn:user",
    conversationId: firstConversation.id,
    role: "user",
    content: "Persisted",
    createdAt: 1000
  };
  const second = {
    id: "turn:assistant",
    conversationId: firstConversation.id,
    role: "assistant",
    content: "Still ordered",
    createdAt: 1000
  };
  await storage.insertConversation(firstConversation);
  await storage.insertMessage(first);
  await storage.insertMessage(second);
  reopen();

  assert.deepEqual(
    await storage.getConversation(firstConversation.id),
    firstConversation
  );
  assert.deepEqual(await storage.getMessages(firstConversation.id), [
    first,
    second
  ]);
});
