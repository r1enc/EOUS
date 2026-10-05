import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(() => vite.close());
const {
  resolvePreferredWorkspaceProvider,
  createWorkspace,
  createConversationNavigation
} = await vite.ssrLoadModule("/src/workspace/index.ts");
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/registry.ts"
);
const { createProviderConfigurationBoundary } = await vite.ssrLoadModule(
  "/src/infrastructure/provider-configuration.ts"
);

const capabilities = {
  contextWindow: 4096,
  supportsSystemInstructions: true,
  supportsFunctionCalling: false,
  supportsVision: false
};
const ids = ["openai", "gemini", "groq"];
const clone = (value) => JSON.parse(JSON.stringify(value));
const settings = (providerId = "gemini", model = "  chosen-model  ") => ({
  providers: Object.fromEntries(ids.map((id) => [id, { capabilities }])),
  preference: { providerId, model }
});
const success = (value) => ({ success: true, value });
const failure = (code) => ({
  success: false,
  error: { code, message: "native-secret sql-secret stack-secret" }
});
function boundary(value = settings()) {
  const calls = { loads: 0, credentialLoads: 0, writes: 0 };
  return {
    calls,
    source: {
      async loadSettings() {
        calls.loads++;
        return success(value);
      },
      async loadCredential() {
        calls.credentialLoads++;
        throw new Error("api-key-secret must never load");
      },
      async replaceSettings() {
        calls.writes++;
        throw new Error("Resolution must not write settings");
      },
      async replaceCredential() {
        calls.writes++;
        throw new Error("Resolution must not write credentials");
      },
      async removeCredential() {
        calls.writes++;
        throw new Error("Resolution must not remove credentials");
      }
    }
  };
}
function registry() {
  const calls = Object.fromEntries(
    ids.map((id) => [id, { sync: [], stream: [] }])
  );
  const value = new DefaultProviderRegistry();
  for (const id of ids) {
    value.registerProvider({
      id,
      name: id,
      capabilities,
      async generateCompletion(request) {
        calls[id].sync.push(request);
        return { success: true, role: "assistant", content: `${id} reply` };
      },
      async *streamCompletion(request) {
        calls[id].stream.push(request);
        yield { type: "content", delta: "first" };
        yield { type: "content", delta: " second" };
        yield {
          type: "complete",
          response: {
            success: true,
            role: "assistant",
            content: `${id} complete`
          }
        };
      }
    });
  }
  return { value, calls };
}
function assertSafeFailure(result, code) {
  assert.equal(result.status, "failure");
  assert.equal(result.error.code, code);
  assert.doesNotMatch(
    JSON.stringify(result),
    /secret|SQL|stack|private|api-key/i
  );
}
function conversations() {
  const sessions = new Map();
  const messages = new Map();
  return {
    async getConversation(id) {
      return sessions.get(id);
    },
    async insertConversation(session) {
      sessions.set(session.id, session);
    },
    async listConversations() {
      return [...sessions.values()];
    },
    async getMessages(id) {
      return messages.get(id) ?? [];
    },
    async insertCompletedTurn(user, assistant) {
      const rows = messages.get(user.conversationId) ?? [];
      rows.push(user, assistant);
      messages.set(user.conversationId, rows);
    },
    async insertMessage() {
      assert.fail("A completed turn is written atomically");
    }
  };
}

test("each persisted provider resolves exactly, preserving the model and reading no secrets", async () => {
  for (const id of ids) {
    const loadedSettings = settings(id);
    const injected = boundary(loadedSettings);
    const active = registry();
    const before = active.value.listProviders();
    const snapshot = clone(loadedSettings);
    const result = await resolvePreferredWorkspaceProvider(
      injected.source,
      active.value
    );
    assert.deepEqual(result, {
      status: "success",
      value: { providerId: id, model: "  chosen-model  " }
    });
    assert.deepEqual(injected.calls, {
      loads: 1,
      credentialLoads: 0,
      writes: 0
    });
    assert.deepEqual(loadedSettings, snapshot);
    assert.deepEqual(active.value.listProviders(), before);
    assert.deepEqual(Object.keys(result.value).sort(), ["model", "providerId"]);
    assert.doesNotMatch(JSON.stringify(result), /secret|auth|credential/i);
  }
});

test("missing, invalid, unavailable and thrown configuration failures are recoverable and redacted", async () => {
  const active = registry();
  for (const code of [
    "CONFIG_MISSING",
    "CONFIG_INVALID",
    "CONFIG_STORAGE_FAILURE"
  ]) {
    const result = await resolvePreferredWorkspaceProvider(
      { loadSettings: async () => failure(code) },
      active.value
    );
    assertSafeFailure(
      result,
      code === "CONFIG_MISSING"
        ? "preference_missing"
        : "configuration_unavailable"
    );
  }
  assertSafeFailure(
    await resolvePreferredWorkspaceProvider(
      {
        loadSettings: async () => {
          throw new Error("native-secret stack-secret");
        }
      },
      active.value
    ),
    "configuration_unavailable"
  );
  assertSafeFailure(
    await resolvePreferredWorkspaceProvider(
      boundary({ providers: settings().providers, preference: null }).source,
      active.value
    ),
    "preference_missing"
  );
});

test("malformed preferences and inconsistent configuration fail closed", async () => {
  const active = registry();
  for (const malformed of [
    null,
    {},
    { providers: null, preference: { providerId: "openai", model: "model" } },
    { providers: {}, preference: { providerId: "unknown", model: "model" } },
    { providers: {}, preference: { providerId: "openai", model: 12 } },
    { providers: {}, preference: { providerId: "openai", model: " \t " } }
  ]) {
    const result = await resolvePreferredWorkspaceProvider(
      boundary(malformed).source,
      active.value
    );
    assertSafeFailure(result, "configuration_unavailable");
  }
  for (const providers of [{}, { openai: undefined }, { openai: null }]) {
    const result = await resolvePreferredWorkspaceProvider(
      boundary({
        providers,
        preference: { providerId: "openai", model: "model" }
      }).source,
      active.value
    );
    assertSafeFailure(result, "provider_unavailable");
  }
});

test("an unregistered selected provider never falls back or writes a replacement", async () => {
  const chosen = settings("openai", "exact-model");
  const injected = boundary(chosen);
  const active = registry();
  active.value.unregisterProvider("openai");
  const before = clone(chosen);
  const result = await resolvePreferredWorkspaceProvider(
    injected.source,
    active.value
  );
  assertSafeFailure(result, "provider_unavailable");
  assert.deepEqual(chosen, before);
  assert.deepEqual(injected.calls, { loads: 1, credentialLoads: 0, writes: 0 });
  assert.equal(active.value.listProviders().length, 2);
  assert.deepEqual(active.calls.gemini.sync, []);
  assert.deepEqual(active.calls.groq.sync, []);
});

test("registry exceptions and mismatched providers produce safe unavailable selection", async () => {
  const injected = boundary(settings("openai", "model"));
  for (const getProvider of [
    () => {
      throw new Error("registry native-secret stack-secret");
    },
    () => ({ ...registry().value.getProvider("groq"), id: "groq" }),
    () => ({ id: "openai" })
  ]) {
    assertSafeFailure(
      await resolvePreferredWorkspaceProvider(injected.source, { getProvider }),
      "provider_unavailable"
    );
  }
});

test("resolved preference reaches only the selected Provider through sync and stream Workspace execution", async () => {
  const active = registry();
  const chosen = await resolvePreferredWorkspaceProvider(
    boundary().source,
    active.value
  );
  assert.equal(chosen.status, "success");
  const workspace = createWorkspace({
    providerRegistry: active.value,
    ...chosen.value,
    conversationId: "selected",
    conversationTitle: "Selected"
  });
  const response = await workspace.execute({ id: "sync", prompt: "Hello" });
  assert.equal(response.status, "success");
  assert.equal(response.content, "gemini reply");
  assert.equal(active.calls.gemini.sync.length, 1);
  assert.equal(active.calls.gemini.sync[0].model, "  chosen-model  ");
  for (const id of ["openai", "groq"])
    assert.equal(active.calls[id].sync.length, 0);

  const events = [];
  for await (const event of workspace.executeStream({
    id: "stream",
    prompt: "Continue"
  }))
    events.push(event);
  assert.deepEqual(
    events.map((event) => event.type),
    ["content", "content", "complete"]
  );
  assert.equal(events[0].delta + events[1].delta, "first second");
  assert.equal(events[2].response.content, "gemini complete");
  assert.equal(active.calls.gemini.stream.length, 1);
  assert.equal(active.calls.gemini.stream[0].model, "  chosen-model  ");
  for (const id of ["openai", "groq"])
    assert.equal(active.calls[id].stream.length, 0);
});

test("ConversationNavigation creates and opens workspaces with the resolved provider and model", async () => {
  const active = registry();
  const chosen = await resolvePreferredWorkspaceProvider(
    boundary(settings("groq", "groq-model")).source,
    active.value
  );
  assert.equal(chosen.status, "success");
  const navigation = createConversationNavigation({
    storage: conversations(),
    workspaceConfig: { providerRegistry: active.value, ...chosen.value },
    createId: () => "new-conversation"
  });
  const created = await navigation.createConversation();
  assert.equal(created.status, "success");
  assert.equal(
    (await created.value.execute({ id: "turn-1", prompt: "Start" })).status,
    "success"
  );
  const opened = await navigation.openConversation("new-conversation");
  assert.equal(opened.status, "success");
  assert.equal(
    (await opened.value.execute({ id: "turn-2", prompt: "Continue" })).status,
    "success"
  );
  assert.deepEqual(
    active.calls.groq.sync.map((request) => request.model),
    ["groq-model", "groq-model"]
  );
  assert.equal(
    active.calls.openai.sync.length + active.calls.gemini.sync.length,
    0
  );
});

test("a new boundary and registry after restart resolve persisted preference without writing or reading secrets", async () => {
  const shared = { stored: null, loads: 0, secretLoads: 0, writes: 0 };
  const storage = () => ({
    async loadSettings() {
      shared.loads++;
      return clone(shared.stored);
    },
    async replaceSettings(value) {
      shared.writes++;
      shared.stored = clone(value);
    },
    async loadCredential() {
      shared.secretLoads++;
      throw new Error("token-secret");
    },
    async replaceCredential() {
      throw new Error("Unexpected credential write");
    },
    async removeCredential() {
      throw new Error("Unexpected credential removal");
    }
  });
  const first = createProviderConfigurationBoundary(storage());
  assert.equal(
    (await first.replaceSettings(settings("openai", " persisted-exact ")))
      .success,
    true
  );
  const writesBeforeRestart = shared.writes;
  const second = createProviderConfigurationBoundary(storage());
  const active = registry();
  const resolved = await resolvePreferredWorkspaceProvider(
    second,
    active.value
  );
  assert.deepEqual(resolved, {
    status: "success",
    value: { providerId: "openai", model: " persisted-exact " }
  });
  const workspace = createWorkspace({
    providerRegistry: active.value,
    ...resolved.value,
    conversationId: "after-restart",
    conversationTitle: "After restart"
  });
  assert.equal(
    (await workspace.execute({ id: "after", prompt: "Hello again" })).status,
    "success"
  );
  assert.equal(active.calls.openai.sync[0].model, " persisted-exact ");
  assert.equal(shared.writes, writesBeforeRestart);
  assert.equal(shared.secretLoads, 0);
  assert.equal(shared.loads, 1);
});
