import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(async () => vite.close());
const {
  createProviderConfigurationBoundary,
  validateProviderSettings,
  validateProviderCredential
} = await vite.ssrLoadModule("/src/infrastructure/provider-configuration.ts");
const { registerRuntimeProviders } = await vite.ssrLoadModule(
  "/src/intelligence/provider-runtime/registerRuntimeProviders.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/index.ts"
);

const capabilities = {
  contextWindow: 4096,
  supportsSystemInstructions: true,
  supportsFunctionCalling: false,
  supportsVision: false
};
const runtime = {
  capabilities,
  baseUrl: "https://proxy.example/openai/v1",
  timeoutMs: 100
};
const settings = (
  preference = { providerId: "openai", model: "configured-model" }
) => ({
  providers: { openai: { ...runtime, capabilities: { ...capabilities } } },
  preference
});
const secrets = [
  "api-key-secret",
  "token-secret",
  "exception-secret",
  "sql-secret",
  "path-secret"
];
const safe = (value) => {
  const publicValue = JSON.stringify(value);
  for (const secret of secrets)
    assert.equal(publicValue.includes(secret), false);
  assert.equal(publicValue.includes("stack"), false);
};

function mockStorage(initialSettings = null) {
  const state = {
    settings: initialSettings,
    credentials: new Map(),
    calls: []
  };
  const storage = {
    async loadSettings() {
      state.calls.push("loadSettings");
      return state.settings;
    },
    async replaceSettings(value) {
      state.calls.push("replaceSettings");
      state.settings = value;
    },
    async loadCredential(id) {
      state.calls.push(`loadCredential:${id}`);
      return state.credentials.get(id) ?? null;
    },
    async replaceCredential(id, value) {
      state.calls.push(`replaceCredential:${id}`);
      state.credentials.set(id, value);
    },
    async removeCredential(id) {
      state.calls.push(`removeCredential:${id}`);
      state.credentials.delete(id);
    }
  };
  return {
    state,
    storage,
    boundary: createProviderConfigurationBoundary(storage)
  };
}

test("valid preference and runtime settings are copied and remain nonsecret", () => {
  const original = settings();
  const result = validateProviderSettings(original);
  assert.equal(result.success, true);
  assert.deepEqual(result.value, original);
  assert.notEqual(result.value, original);
  assert.notEqual(result.value.providers.openai.capabilities, capabilities);
  assert.deepEqual(Object.keys(result.value), ["providers", "preference"]);
  safe(result.value);
  const empty = validateProviderSettings({ providers: {}, preference: null });
  assert.deepEqual(empty, {
    success: true,
    value: { providers: {}, preference: null }
  });
});

test("nonsecret settings operations discard unrecognized credential fields", async () => {
  const input = settings();
  input.providers.openai.auth = { apiKey: "api-key-secret" };
  input.providers.openai.capabilities.apiKey = "api-key-secret";
  input.preference.token = "token-secret";
  input.credential = "exception-secret";
  const { state, boundary } = mockStorage();
  assert.equal((await boundary.replaceSettings(input)).success, true);
  safe(state.settings);
  safe(await boundary.loadSettings());
});

test("inconsistent or unsupported preferred selection is rejected safely", () => {
  for (const value of [
    { providers: { openai: runtime }, preference: { providerId: "openai" } },
    {
      providers: { openai: runtime },
      preference: { model: "configured-model" }
    },
    {
      providers: { openai: runtime },
      preference: { providerId: "openai", model: "  " }
    },
    {
      providers: { openai: runtime },
      preference: { providerId: "other", model: "configured-model" }
    },
    {
      providers: {},
      preference: { providerId: "openai", model: "configured-model" }
    },
    { providers: { openai: runtime }, preference: undefined }
  ]) {
    const result = validateProviderSettings(value);
    assert.equal(result.success, false);
    assert.equal(result.error.code, "CONFIG_INVALID");
    safe(result);
  }
});

test("malformed runtime settings, base URLs, timeouts, and capabilities are rejected", () => {
  for (const provider of [
    null,
    {},
    { capabilities, baseUrl: "javascript:api-key-secret" },
    { capabilities, baseUrl: "https://user:api-key-secret@host.example/v1" },
    { capabilities, baseUrl: "https://host.example/v1?token=token-secret" },
    { capabilities, baseUrl: "https://host.example/v1#path-secret" },
    { capabilities, timeoutMs: 0 },
    { capabilities, timeoutMs: NaN },
    { capabilities: { ...capabilities, contextWindow: 0 } },
    { capabilities: { ...capabilities, supportsVision: "false" } },
    { capabilities: { ...capabilities, maxOutputTokens: 9999 } }
  ]) {
    const value =
      provider === null
        ? { providers: { openai: null }, preference: null }
        : { providers: { openai: provider }, preference: null };
    const result = validateProviderSettings(value);
    assert.equal(result.success, false);
    safe(result);
  }
  const unsupported = validateProviderSettings({
    providers: { other: runtime },
    preference: null
  });
  assert.equal(unsupported.success, false);
  safe(unsupported);
});

test("credential validation accepts one key or token and rejects ambiguity, blanks, CR/LF, and unsupported IDs", () => {
  assert.deepEqual(
    validateProviderCredential("openai", { apiKey: "api-key-secret" }),
    { success: true, value: { apiKey: "api-key-secret" } }
  );
  assert.deepEqual(
    validateProviderCredential("groq", { token: "token-secret" }),
    { success: true, value: { token: "token-secret" } }
  );
  for (const [id, credential] of [
    ["openai", { apiKey: "api-key-secret", token: "token-secret" }],
    ["openai", { apiKey: " " }],
    ["openai", { token: "token-secret\nexception-secret" }],
    ["openai", { apiKey: "api-key-secret\r" }],
    ["openai", {}],
    ["other", { apiKey: "api-key-secret" }]
  ]) {
    const result = validateProviderCredential(id, credential);
    assert.equal(result.success, false);
    assert.equal(result.error.code, "CONFIG_INVALID");
    safe(result);
  }
});

test("malformed objects with throwing getters yield fixed safe validation errors", () => {
  const corruptSettings = {
    providers: {
      openai: {
        get capabilities() {
          throw new Error("api-key-secret stack");
        }
      }
    },
    preference: null
  };
  const corruptCredential = {
    get apiKey() {
      throw new Error("token-secret stack");
    }
  };
  const settingsResult = validateProviderSettings(corruptSettings);
  const credentialResult = validateProviderCredential(
    "openai",
    corruptCredential
  );
  assert.equal(settingsResult.error.code, "CONFIG_INVALID");
  assert.equal(credentialResult.error.code, "CONFIG_INVALID");
  safe(settingsResult);
  safe(credentialResult);
});

test("missing settings and credentials are recoverable; normal settings load never reads secrets", async () => {
  const { state, boundary } = mockStorage();
  const missingSettings = await boundary.loadSettings();
  assert.equal(missingSettings.error.code, "CONFIG_MISSING");
  const missingCredential = await boundary.loadCredential("openai");
  assert.equal(missingCredential.error.code, "CONFIG_MISSING");
  assert.deepEqual(state.calls, ["loadSettings", "loadCredential:openai"]);
  safe(missingSettings);
  safe(missingCredential);
});

test("settings replace supports preference, model update, and clear without credential reads", async () => {
  const { state, boundary } = mockStorage();
  assert.deepEqual(await boundary.replaceSettings(settings()), {
    success: true,
    value: undefined
  });
  assert.deepEqual((await boundary.loadSettings()).value.preference, {
    providerId: "openai",
    model: "configured-model"
  });
  assert.deepEqual(
    await boundary.replaceSettings(
      settings({ providerId: "openai", model: "second-model" })
    ),
    { success: true, value: undefined }
  );
  assert.equal(
    (await boundary.loadSettings()).value.preference.model,
    "second-model"
  );
  assert.deepEqual(await boundary.replaceSettings(settings(null)), {
    success: true,
    value: undefined
  });
  assert.equal((await boundary.loadSettings()).value.preference, null);
  assert.equal(
    state.calls.some((call) => call.startsWith("loadCredential")),
    false
  );
});

test("credential replacement and removal require explicit secret operations", async () => {
  const { state, boundary } = mockStorage(settings());
  assert.deepEqual(
    await boundary.replaceCredential("openai", { apiKey: "api-key-secret" }),
    { success: true, value: undefined }
  );
  assert.deepEqual((await boundary.loadCredential("openai")).value, {
    apiKey: "api-key-secret"
  });
  assert.deepEqual(
    await boundary.replaceCredential("openai", { token: "token-secret" }),
    { success: true, value: undefined }
  );
  assert.deepEqual((await boundary.loadCredential("openai")).value, {
    token: "token-secret"
  });
  assert.deepEqual(await boundary.removeCredential("openai"), {
    success: true,
    value: undefined
  });
  assert.equal(
    (await boundary.loadCredential("openai")).error.code,
    "CONFIG_MISSING"
  );
  assert.equal(state.calls.includes("loadSettings"), false);
  assert.deepEqual((await boundary.loadSettings()).value.preference, {
    providerId: "openai",
    model: "configured-model"
  });
});

test("loaded and saved values are defensively copied from mock storage state", async () => {
  const source = settings();
  const { state, boundary } = mockStorage();
  await boundary.replaceSettings(source);
  source.providers.openai.capabilities.contextWindow = 1;
  source.preference.model = "mutated source";
  assert.equal(
    state.settings.providers.openai.capabilities.contextWindow,
    4096
  );
  assert.equal(state.settings.preference.model, "configured-model");
  const loaded = await boundary.loadSettings();
  loaded.value.providers.openai.capabilities.contextWindow = 2;
  loaded.value.preference.model = "mutated load";
  assert.equal(
    state.settings.providers.openai.capabilities.contextWindow,
    4096
  );
  assert.equal(state.settings.preference.model, "configured-model");
  const secret = { apiKey: "api-key-secret" };
  await boundary.replaceCredential("openai", secret);
  secret.apiKey = "changed";
  assert.equal(state.credentials.get("openai").apiKey, "api-key-secret");
  const loadedSecret = await boundary.loadCredential("openai");
  loadedSecret.value.apiKey = "changed again";
  assert.equal(state.credentials.get("openai").apiKey, "api-key-secret");
});

test("invalid updates do not call storage or partially change state", async () => {
  const { state, boundary } = mockStorage(settings());
  const before = state.settings;
  const invalidPreference = await boundary.replaceSettings(
    settings({ providerId: "openai", model: " " })
  );
  const invalidCredential = await boundary.replaceCredential("openai", {
    apiKey: "api-key-secret",
    token: "token-secret"
  });
  const invalidRemoval = await boundary.removeCredential("other");
  assert.equal(invalidPreference.error.code, "CONFIG_INVALID");
  assert.equal(invalidCredential.error.code, "CONFIG_INVALID");
  assert.equal(invalidRemoval.error.code, "CONFIG_INVALID");
  assert.equal(state.settings, before);
  assert.deepEqual(state.calls, []);
  safe(invalidPreference);
  safe(invalidCredential);
});

test("storage exceptions are normalized without secrets or native details", async () => {
  const broken = {
    async loadSettings() {
      throw new Error("sql-secret api-key-secret");
    },
    async replaceSettings() {
      throw new Error("path-secret token-secret");
    },
    async loadCredential() {
      throw new Error("exception-secret api-key-secret");
    },
    async replaceCredential() {
      throw new Error("sql-secret token-secret");
    },
    async removeCredential() {
      throw new Error("path-secret");
    }
  };
  const boundary = createProviderConfigurationBoundary(broken);
  const results = [
    await boundary.loadSettings(),
    await boundary.replaceSettings(settings()),
    await boundary.loadCredential("openai"),
    await boundary.replaceCredential("openai", { apiKey: "api-key-secret" }),
    await boundary.removeCredential("openai")
  ];
  for (const result of results) {
    assert.deepEqual(result, {
      success: false,
      error: {
        code: "CONFIG_STORAGE_FAILURE",
        message: "Provider configuration storage is unavailable"
      }
    });
    safe(result);
  }
});

test("malformed storage dependency throws only a fixed safe message", () => {
  const malformed = {
    get loadSettings() {
      throw new Error("api-key-secret stack");
    }
  };
  assert.throws(() => createProviderConfigurationBoundary(malformed), {
    message: "Provider configuration storage is invalid"
  });
});

test("nonsecret settings plus explicit credential can later feed TASK-059 registration", async () => {
  const { boundary } = mockStorage();
  await boundary.replaceSettings(settings());
  await boundary.replaceCredential("openai", { apiKey: "api-key-secret" });
  const loadedSettings = await boundary.loadSettings();
  const loadedCredential = await boundary.loadCredential("openai");
  assert.equal(loadedSettings.success, true);
  assert.equal(loadedCredential.success, true);
  const registry = new DefaultProviderRegistry();
  let networkCalls = 0;
  const {
    baseUrl,
    timeoutMs,
    capabilities: loadedCapabilities
  } = loadedSettings.value.providers.openai;
  const result = registerRuntimeProviders(
    registry,
    {
      openai: {
        config: { baseUrl, timeoutMs, auth: loadedCredential.value },
        capabilities: loadedCapabilities
      }
    },
    async () => {
      networkCalls++;
      throw new Error("network should not run during registration");
    }
  );
  assert.deepEqual(result, {
    openai: "registered",
    gemini: "skipped",
    groq: "skipped"
  });
  assert.equal(registry.getProvider("openai")?.id, "openai");
  assert.equal(networkCalls, 0);
  safe(result);
});
