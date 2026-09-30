import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(() => vite.close());
const { createPermissionInteraction } = await vite.ssrLoadModule(
  "/src/workspace/permission-interaction.ts"
);
const { createInteractiveWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createInteractiveWorkspace.ts"
);
const { createWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createWorkspace.ts"
);
const { createConversationNavigation } = await vite.ssrLoadModule(
  "/src/workspace/createConversationNavigation.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/registry.ts"
);

function request(id = "permission-1", toolId = "pdf-reader", input = {}) {
  return {
    id,
    permission: {
      id: "read_file",
      name: "read_file",
      category: "tool",
      context: {
        requestId: "internal-turn-secret",
        conversationId: "internal-conversation-secret",
        stepId: "internal-step-secret",
        toolId,
        input
      }
    }
  };
}
function config(planner, providerCalls = []) {
  const providerRegistry = new DefaultProviderRegistry();
  providerRegistry.registerProvider({
    id: "test-provider",
    name: "Test provider",
    capabilities: {
      contextWindow: 4096,
      supportsSystemInstructions: true,
      supportsFunctionCalling: false,
      supportsVision: false
    },
    async generateCompletion(input) {
      providerCalls.push(input);
      return {
        success: true,
        role: "assistant",
        content: "Completed response"
      };
    }
  });
  return {
    providerRegistry,
    providerId: "test-provider",
    model: "test-model",
    conversationId: "conversation-1",
    conversationTitle: "Test",
    planner
  };
}
function planner(action = "pdf-reader", input = { filePath: "sample.pdf" }) {
  return {
    async plan() {
      const now = new Date().toISOString();
      return {
        id: "plan",
        status: "planned",
        createdAt: now,
        updatedAt: now,
        steps: [{ id: "step", action, input, status: "pending" }]
      };
    }
  };
}
function nextRequest(interaction) {
  return new Promise((resolve) => {
    const stop = interaction.subscribe(() => {
      const pending = interaction.getPending();
      if (pending) {
        resolve({ pending, stop });
      }
    });
  });
}

test("bridge exposes only audited fields and settles each request exactly once", async () => {
  const interaction = createPermissionInteraction();
  const seen = [];
  const stop = interaction.subscribe(() => seen.push(interaction.getPending()));
  const first = interaction.handle(
    request("one", "pdf-reader", {
      filePath: "sample.pdf",
      token: "hidden-input-secret"
    })
  );
  const view = interaction.getPending();
  assert.deepEqual(view, {
    token: 1,
    permission: "read_file",
    tool: "pdf-reader",
    resource: "sample.pdf"
  });
  assert.doesNotMatch(
    JSON.stringify(view),
    /secret|requestId|conversationId|stepId|token.*hidden/
  );
  assert.equal(interaction.decide(view.token, "granted"), true);
  assert.equal(interaction.decide(view.token, "denied"), false);
  assert.deepEqual(await first, { requestId: "one", decision: "granted" });
  const second = interaction.handle(
    request("two", "web-search", {
      query: "hidden-query-secret"
    })
  );
  const next = interaction.getPending();
  assert.deepEqual(next, {
    token: 2,
    permission: "read_file",
    tool: "web-search"
  });
  assert.equal(interaction.decide(view.token, "granted"), false);
  assert.equal(interaction.decide(next.token, "denied"), true);
  assert.equal(interaction.decide(next.token, "granted"), false);
  assert.deepEqual(await second, { requestId: "two", decision: "denied" });
  const third = interaction.handle(
    request("three", "pdf-reader", { filePath: "C:\\private\\token.pdf" })
  );
  assert.equal(interaction.getPending().resource, undefined);
  interaction.decide(interaction.getPending().token, "denied");
  await third;
  assert.equal(interaction.getPending(), null);
  assert.equal(seen.length, 6);
  stop();
});

test("missing consumer and overlapping unresolved requests fail closed", async () => {
  const interaction = createPermissionInteraction();
  assert.deepEqual(await interaction.handle(request("unobserved")), {
    requestId: "unobserved",
    decision: "denied"
  });
  const stop = interaction.subscribe(() => {});
  const first = interaction.handle(request("first"));
  assert.deepEqual(await interaction.handle(request("overlap")), {
    requestId: "overlap",
    decision: "denied"
  });
  assert.equal(interaction.getPending().token, 1);
  interaction.decide(1, "granted");
  assert.deepEqual(await first, { requestId: "first", decision: "granted" });
  stop();
});

test("a failing UI subscriber cannot leave an approval unresolved", async () => {
  const interaction = createPermissionInteraction();
  const stop = interaction.subscribe(() => {
    throw new Error("subscriber failed");
  });
  assert.deepEqual(await interaction.handle(request("broken-ui")), {
    requestId: "broken-ui",
    decision: "denied"
  });
  assert.equal(interaction.getPending(), null);
  stop();
});

test("StrictMode replay reattachment preserves pending request; real detach denies it", async () => {
  const interaction = createPermissionInteraction();
  const stop = interaction.subscribe(() => {});
  const waiting = interaction.handle(request("replay"));
  stop();
  const reattached = interaction.subscribe(() => {});
  await Promise.resolve();
  assert.equal(interaction.getPending().token, 1);
  reattached();
  await Promise.resolve();
  assert.deepEqual(await waiting, { requestId: "replay", decision: "denied" });
  assert.equal(interaction.getPending(), null);
  reattached();
});

test("an old detach cannot decide a newer request", async () => {
  const interaction = createPermissionInteraction();
  const stop = interaction.subscribe(() => {});
  const first = interaction.handle(request("old"));
  stop();
  interaction.decide(1, "granted");
  assert.equal((await first).decision, "granted");
  const reattached = interaction.subscribe(() => {});
  const second = interaction.handle(request("new"));
  await Promise.resolve();
  assert.equal(interaction.getPending().token, 2);
  interaction.decide(2, "denied");
  assert.equal((await second).decision, "denied");
  reattached();
});

test("real Workspace approval reaches Permission Manager and Tool SDK, then records lifecycle", async () => {
  const providerCalls = [];
  const workspace = createInteractiveWorkspace(
    config(planner(), providerCalls)
  );
  const requested = nextRequest(workspace.permissionInteraction);
  const execution = workspace.execute({
    id: "approved-turn",
    prompt: "Read PDF"
  });
  const { pending, stop } = await requested;
  assert.deepEqual(
    workspace.getPermissionHistory().map((entry) => entry.response),
    [undefined]
  );
  assert.equal(providerCalls.length, 1);
  assert.equal(
    workspace.permissionInteraction.decide(pending.token, "granted"),
    true
  );
  const result = await execution;
  stop();
  assert.equal(result.status, "success");
  assert.equal(providerCalls.length, 2);
  assert.deepEqual(
    workspace.getPermissionHistory().map((entry) => entry.response.decision),
    ["granted"]
  );
  assert.equal(workspace.getHistory().length, 2);
});

test("real rejection prevents Tool SDK execution and a completed persisted turn", async () => {
  const calls = [];
  let inserts = 0;
  const workspace = createInteractiveWorkspace({
    ...config(planner(), calls),
    conversationPersistence: {
      async getMessages() {
        return [];
      },
      async insertCompletedTurn() {
        inserts++;
      }
    }
  });
  const requested = nextRequest(workspace.permissionInteraction);
  const execution = workspace.execute({
    id: "denied-turn",
    prompt: "Read PDF"
  });
  const { pending, stop } = await requested;
  workspace.permissionInteraction.decide(pending.token, "denied");
  const result = await execution;
  stop();
  assert.equal(result.status, "failure");
  assert.equal(result.error.code, "PERMISSION_DENIED");
  assert.equal(calls.length, 1);
  assert.equal(inserts, 0);
  assert.equal(workspace.getHistory().length, 0);
  assert.deepEqual(
    workspace.getPermissionHistory().map((entry) => entry.response.decision),
    ["denied"]
  );
});

test("real Agent steps request sequential decisions without reusing a resolver", async () => {
  const calls = [];
  const twoSteps = {
    async plan() {
      const now = new Date().toISOString();
      return {
        id: "two-step-plan",
        status: "planned",
        createdAt: now,
        updatedAt: now,
        steps: [
          {
            id: "first",
            action: "pdf-reader",
            input: { filePath: "first.pdf" },
            status: "pending"
          },
          {
            id: "second",
            action: "pdf-reader",
            input: { filePath: "second.pdf" },
            status: "pending"
          }
        ]
      };
    }
  };
  const workspace = createInteractiveWorkspace(config(twoSteps, calls));
  const firstRequested = nextRequest(workspace.permissionInteraction);
  const execution = workspace.execute({
    id: "sequential",
    prompt: "Read two PDFs"
  });
  const first = await firstRequested;
  assert.equal(first.pending.resource, "first.pdf");
  const secondRequested = nextRequest(workspace.permissionInteraction);
  workspace.permissionInteraction.decide(first.pending.token, "granted");
  first.stop();
  const second = await secondRequested;
  assert.equal(second.pending.resource, "second.pdf");
  assert.notEqual(second.pending.token, first.pending.token);
  assert.equal(
    workspace.permissionInteraction.decide(first.pending.token, "granted"),
    false
  );
  workspace.permissionInteraction.decide(second.pending.token, "denied");
  second.stop();
  assert.equal((await execution).error.code, "PERMISSION_DENIED");
  assert.deepEqual(
    workspace.getPermissionHistory().map((entry) => entry.response.decision),
    ["granted", "denied"]
  );
  assert.equal(calls.length, 1);
  assert.equal(workspace.getHistory().length, 0);
});

test("plain static Workspace stays compatible and sensitive actions fail closed", async () => {
  const workspace = createWorkspace(config(planner()));
  assert.equal(workspace.permissionInteraction, undefined);
  const result = await workspace.execute({ id: "static", prompt: "Read PDF" });
  assert.equal(result.error.code, "PERMISSION_REQUIRED");
  assert.equal(workspace.getPermissionHistory()[0].response, undefined);
});

test("interactive composition rejects conflicting approval ownership", () => {
  const conflicted = {
    ...config(),
    approvePermission: async (item) => ({
      requestId: item.id,
      decision: "granted"
    })
  };
  assert.throws(() => createInteractiveWorkspace(conflicted), /conflicts/);
  assert.throws(
    () =>
      createConversationNavigation({
        storage: {},
        workspaceConfig: conflicted
      }),
    /conflicts/
  );
});

test("navigation creates a distinct interaction for each returned Workspace", async () => {
  const rows = new Map();
  const storage = {
    async getConversation(id) {
      return rows.get(id);
    },
    async insertConversation(value) {
      rows.set(value.id, value);
    },
    async listConversations() {
      return [...rows.values()];
    },
    async getMessages() {
      return [];
    },
    async insertCompletedTurn() {},
    async insertMessage() {}
  };
  const navigation = createConversationNavigation({
    storage,
    workspaceConfig: config(planner()),
    createId: () => "conversation-1"
  });
  const created = await navigation.createConversation();
  const opened = await navigation.openConversation("conversation-1");
  assert.equal(created.status, "success");
  assert.equal(opened.status, "success");
  assert.notEqual(
    created.value.permissionInteraction,
    opened.value.permissionInteraction
  );
  const requested = nextRequest(created.value.permissionInteraction);
  const execution = created.value.execute({ id: "one", prompt: "Read PDF" });
  const { pending, stop } = await requested;
  assert.equal(opened.value.permissionInteraction.getPending(), null);
  created.value.permissionInteraction.decide(pending.token, "denied");
  assert.equal((await execution).error.code, "PERMISSION_DENIED");
  stop();
});
