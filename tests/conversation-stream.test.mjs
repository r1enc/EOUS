import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(async () => vite.close());

const { DefaultConversation } = await vite.ssrLoadModule(
  "/src/conversation/index.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/index.ts"
);
const { createWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createWorkspace.ts"
);

const request = { id: "turn", prompt: "Hello" };

function storage(onInsert) {
  const rows = [];
  const writes = [];
  return {
    rows,
    writes,
    async getMessages() {
      return [...rows];
    },
    async insertCompletedTurn(user, assistant) {
      writes.push([user, assistant]);
      if (onInsert) return onInsert(rows, user, assistant);
      rows.push(user, assistant);
    }
  };
}

function streamingAgent(events) {
  const calls = { execute: 0, stream: 0 };
  return {
    id: "agent",
    name: "Agent",
    calls,
    async execute(input) {
      calls.execute++;
      return { id: input.id, status: "success", content: "Sync answer" };
    },
    async *executeStream(input) {
      calls.stream++;
      for (const event of events(input)) yield event;
    }
  };
}

const content = (delta) => ({ type: "content", delta });
const complete = (id, answer) => ({
  type: "complete",
  response: { id, status: "success", content: answer }
});
const failure = (id) => ({
  type: "failure",
  response: {
    id,
    status: "failure",
    content: "",
    error: { code: "AGENT_FAILED", message: "Agent failed" }
  }
});

async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

function workspace(source, store, options = {}) {
  const registry = new DefaultProviderRegistry();
  registry.registerProvider(source);
  return createWorkspace({
    providerRegistry: registry,
    providerId: source.id,
    model: "model",
    conversationId: "conversation",
    conversationTitle: "Test",
    conversationPersistence: store,
    ...options
  });
}

test("Workspace propagates deltas, then persists only authoritative final content", async () => {
  const calls = { stream: 0, completion: 0 };
  const source = {
    id: "provider",
    name: "Provider",
    capabilities: {
      contextWindow: 4096,
      supportsSystemInstructions: true,
      supportsFunctionCalling: false,
      supportsVision: false
    },
    async generateCompletion() {
      calls.completion++;
      return { success: true, role: "assistant", content: "Sync answer" };
    },
    async *streamCompletion() {
      calls.stream++;
      yield content("Hel");
      yield content("lo");
      yield {
        type: "complete",
        response: { success: true, role: "assistant", content: "Hello!" }
      };
    }
  };
  const store = storage();
  const active = workspace(source, store);
  assert.equal(typeof active.executeStream, "function");
  const iterator = active.executeStream(request)[Symbol.asyncIterator]();
  assert.deepEqual((await iterator.next()).value, content("Hel"));
  assert.deepEqual(active.getHistory(), []);
  assert.equal(store.writes.length, 0);
  assert.deepEqual((await iterator.next()).value, content("lo"));
  const terminal = (await iterator.next()).value;
  assert.equal(terminal.type, "complete");
  assert.equal(terminal.response.content, "Hello!");
  assert.equal((await iterator.next()).done, true);
  assert.equal(store.writes.length, 1);
  assert.deepEqual(
    store.writes[0].map((row) => row.content),
    ["Hello", "Hello!"]
  );
  assert.deepEqual(
    active.getHistory().map((row) => row.content),
    ["Hello", "Hello!"]
  );
  assert.equal(calls.stream, 1);
  assert.equal(calls.completion, 0);

  const retry = await collect(active.executeStream(request));
  assert.deepEqual(
    retry.map((event) => event.type),
    ["complete"]
  );
  assert.equal(retry[0].response.content, "Hello!");
  assert.equal(store.writes.length, 1);
  assert.equal(calls.stream, 1);
  assert.equal(active.getHistory().length, 2);

  const sync = await active.execute({ id: "sync", prompt: "Again" });
  assert.equal(sync.content, "Sync answer");
  assert.equal(calls.completion, 1);
  assert.equal(calls.stream, 1);
});

test("Workspace streaming keeps permission and Tool SDK gates", async () => {
  for (const decision of ["granted", "denied"]) {
    let providerCalls = 0;
    const source = {
      id: "provider",
      name: "Provider",
      capabilities: {
        contextWindow: 4096,
        supportsSystemInstructions: true,
        supportsFunctionCalling: false,
        supportsVision: false
      },
      async generateCompletion() {
        throw new Error("Stream mode must not use synchronous completion");
      },
      async *streamCompletion(input) {
        providerCalls++;
        if (providerCalls === 1) {
          yield content("Private plan text");
          yield {
            type: "complete",
            response: { success: true, role: "assistant", content: "Plan" }
          };
        } else {
          assert.match(input.messages.at(-1).content, /Simulated PDF Content/);
          yield content("Final draft");
          yield {
            type: "complete",
            response: {
              success: true,
              role: "assistant",
              content: "Final answer"
            }
          };
        }
      }
    };
    const store = storage();
    const active = workspace(source, store, {
      planner: {
        async plan() {
          const now = new Date().toISOString();
          return {
            id: "plan",
            status: "planned",
            createdAt: now,
            updatedAt: now,
            steps: [
              {
                id: "step",
                action: "pdf-reader",
                input: { filePath: "document.pdf" },
                status: "pending"
              }
            ]
          };
        }
      },
      approvePermission: async (approval) => ({
        requestId: approval.id,
        decision
      })
    });
    const events = await collect(active.executeStream(request));
    assert.equal(active.getPermissionHistory()[0].response.decision, decision);
    assert.equal(
      events.some((event) => event.delta === "Private plan text"),
      false
    );
    if (decision === "granted") {
      assert.deepEqual(
        events.map((event) => event.type),
        ["content", "complete"]
      );
      assert.equal(events[1].response.content, "Final answer");
      assert.equal(store.writes.length, 1);
      assert.equal(providerCalls, 2);
    } else {
      assert.deepEqual(
        events.map((event) => event.type),
        ["failure"]
      );
      assert.equal(events[0].response.error.code, "PERMISSION_DENIED");
      assert.equal(store.writes.length, 0);
      assert.equal(providerCalls, 1);
    }
  }
});

test("Agent failure after deltas creates no completed turn", async () => {
  const store = storage();
  const agent = streamingAgent((input) => [
    content("Partial"),
    failure(input.id)
  ]);
  const conversation = new DefaultConversation("conversation", "Test", agent, {
    persistence: store
  });
  const events = await collect(conversation.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["content", "failure"]
  );
  assert.equal(events[1].response.error.code, "AGENT_FAILED");
  assert.equal(store.writes.length, 0);
  assert.deepEqual(conversation.getHistory(), []);
});

test("malformed Agent stream after deltas is sanitized before persistence", async () => {
  for (const eventsForTurn of [
    () => [content("Partial")],
    (input) => [
      content("Partial"),
      complete(input.id, "Final"),
      content("Late")
    ],
    (input) => [
      content("Partial"),
      complete(input.id, "Final"),
      complete(input.id, "Again")
    ]
  ]) {
    const store = storage();
    const agent = streamingAgent(eventsForTurn);
    const conversation = new DefaultConversation(
      "conversation",
      "Test",
      agent,
      {
        persistence: store
      }
    );
    const events = await collect(conversation.executeStream(request));
    assert.equal(events.at(-1).type, "failure");
    assert.equal(events.at(-1).response.error.code, "CONVERSATION_FAILED");
    assert.equal(events.filter((event) => event.type === "complete").length, 0);
    assert.equal(store.writes.length, 0);
    assert.deepEqual(conversation.getHistory(), []);
  }
});

test("persistence failure after deltas is terminal and does not remember content", async () => {
  const store = storage(() => {
    throw new Error("private database path");
  });
  const agent = streamingAgent((input) => [
    content("Draft"),
    complete(input.id, "Final")
  ]);
  const conversation = new DefaultConversation("conversation", "Test", agent, {
    persistence: store
  });
  const events = await collect(conversation.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["content", "failure"]
  );
  assert.equal(events[1].response.error.code, "TURN_PERSISTENCE_FAILED");
  assert.doesNotMatch(
    events[1].response.error.message,
    /private|database path/i
  );
  assert.equal(store.writes.length, 1);
  assert.deepEqual(store.rows, []);
  assert.deepEqual(conversation.getHistory(), []);
});

test("uncertain writes reconcile matching content; conflicting writes fail integrity", async () => {
  for (const conflict of [false, true]) {
    const store = storage((rows, user, assistant) => {
      rows.push(
        user,
        conflict ? { ...assistant, content: "Different" } : assistant
      );
      throw new Error("uncertain write");
    });
    const agent = streamingAgent((input) => [
      content("Draft"),
      complete(input.id, "Final")
    ]);
    const conversation = new DefaultConversation(
      "conversation",
      "Test",
      agent,
      {
        persistence: store
      }
    );
    const events = await collect(conversation.executeStream(request));
    assert.deepEqual(
      events.map((event) => event.type),
      ["content", conflict ? "failure" : "complete"]
    );
    assert.equal(events.at(-1).response.content, conflict ? "" : "Final");
    if (conflict) {
      assert.equal(events.at(-1).response.error.code, "TURN_INTEGRITY_FAILED");
      assert.deepEqual(conversation.getHistory(), []);
    } else {
      assert.deepEqual(
        conversation.getHistory().map((row) => row.content),
        ["Hello", "Final"]
      );
    }
    assert.equal(store.writes.length, 1);
  }
});

test("invalid persisted history and conflicting request IDs block Agent", async () => {
  for (const rows of [
    [
      {
        id: "bad",
        conversationId: "conversation",
        role: "bad",
        content: "x",
        createdAt: 1000
      }
    ],
    [
      {
        id: '["eous-turn-v1","conversation","turn:user"]',
        conversationId: "conversation",
        role: "user",
        content: "Different",
        createdAt: 1000
      }
    ]
  ]) {
    const store = storage();
    store.rows.push(...rows);
    const agent = streamingAgent((input) => [
      complete(input.id, "Should not run")
    ]);
    const conversation = new DefaultConversation(
      "conversation",
      "Test",
      agent,
      {
        persistence: store
      }
    );
    const events = await collect(conversation.executeStream(request));
    assert.deepEqual(
      events.map((event) => event.type),
      ["failure"]
    );
    assert.equal(agent.calls.stream, 0);
    assert.equal(store.writes.length, 0);
  }
});

test("stopping iteration before terminal content prevents persistence", async () => {
  const store = storage();
  const agent = streamingAgent((input) => [
    content("Partial"),
    complete(input.id, "Final")
  ]);
  const conversation = new DefaultConversation("conversation", "Test", agent, {
    persistence: store
  });
  const iterator = conversation.executeStream(request)[Symbol.asyncIterator]();
  assert.deepEqual((await iterator.next()).value, content("Partial"));
  await iterator.return();
  assert.equal(store.writes.length, 0);
  assert.deepEqual(conversation.getHistory(), []);
});

test("streaming Conversation falls back to injected synchronous Agent", async () => {
  const agent = {
    id: "agent",
    name: "Agent",
    async execute(input) {
      return { id: input.id, status: "success", content: "Fallback" };
    }
  };
  const conversation = new DefaultConversation("conversation", "Test", agent);
  const events = await collect(conversation.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["complete"]
  );
  assert.equal(events[0].response.content, "Fallback");
  assert.deepEqual(
    conversation.getHistory().map((row) => row.content),
    ["Hello", "Fallback"]
  );
});
