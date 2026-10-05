import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(async () => vite.close());

const { createPersistentProviderConfigurationStorage } = await vite.ssrLoadModule(
  "/src/infrastructure/provider-configuration-storage.ts"
);
const { createProviderConfigurationBoundary } = await vite.ssrLoadModule(
  "/src/infrastructure/provider-configuration.ts"
);

const settings = (model = "model-one") => ({
  providers: {
    openai: {
      capabilities: {
        contextWindow: 4096,
        supportsSystemInstructions: true,
        supportsFunctionCalling: false,
        supportsVision: false
      },
      timeoutMs: 100
    }
  },
  preference: model === null ? null : { providerId: "openai", model }
});

function backends() {
  const rows = new Map();
  const credentials = new Map();
  const queries = [];
  const calls = [];
  let sqlFailure = false;
  let nativeFailure = false;
  const database = {
    async select(query, parameters) {
      queries.push([query, parameters]);
      if (sqlFailure) throw new Error("sql-native token-secret");
      return rows.has(parameters[0]) ? [{ value: rows.get(parameters[0]) }] : [];
    },
    async execute(query, parameters) {
      queries.push([query, parameters]);
      if (sqlFailure) throw new Error("sql-native api-key-secret");
      rows.set(parameters[0], parameters[1]);
    }
  };
  const invokeCommand = async (command, parameters) => {
    calls.push([command, parameters]);
    if (nativeFailure) throw new Error("native-stack api-key-secret token-secret");
    if (command === "get_provider_credential") {
      return credentials.get(parameters.providerId) ?? { state: "missing" };
    }
    if (command === "set_provider_credential") {
      credentials.set(parameters.providerId, {
        state: "found",
        kind: parameters.kind,
        value: parameters.value
      });
    }
    if (command === "remove_provider_credential") {
      credentials.delete(parameters.providerId);
    }
  };
  const instance = () =>
    createProviderConfigurationBoundary(
      createPersistentProviderConfigurationStorage({
        getConnection: async () => database,
        invokeCommand
      })
    );
  return {
    rows,
    credentials,
    queries,
    calls,
    instance,
    failSql: () => (sqlFailure = true),
    failNative: () => (nativeFailure = true)
  };
}

test("settings use a parameterized fixed key and survive a new storage instance", async () => {
  const state = backends();
  const first = state.instance();
  assert.equal((await first.loadSettings()).error.code, "CONFIG_MISSING");
  assert.equal((await first.replaceSettings(settings())).success, true);
  assert.equal((await first.replaceSettings(settings("model-two"))).success, true);
  const second = state.instance();
  assert.deepEqual((await second.loadSettings()).value.preference, {
    providerId: "openai",
    model: "model-two"
  });
  assert.equal((await second.replaceSettings(settings(null))).success, true);
  assert.equal((await first.loadSettings()).value.preference, null);
  assert.equal(state.rows.size, 1);
  assert.ok(state.queries.every(([, values]) => values[0] === "provider_settings.v1"));
  assert.ok(state.queries.some(([query]) => query.includes("ON CONFLICT(key)")));
  assert.equal(state.calls.length, 0);
});

test("credentials stay out of every SQLite bound value and load explicitly", async () => {
  const state = backends();
  const first = state.instance();
  assert.equal((await first.replaceSettings(settings())).success, true);
  assert.equal(
    (await first.replaceCredential("openai", { apiKey: "api-key-secret" })).success,
    true
  );
  assert.equal((await first.loadSettings()).success, true);
  assert.deepEqual(state.calls.map(([name]) => name), ["set_provider_credential"]);
  const second = state.instance();
  assert.deepEqual((await second.loadCredential("openai")).value, {
    apiKey: "api-key-secret"
  });
  assert.equal(
    (await second.replaceCredential("openai", { token: "token-secret" })).success,
    true
  );
  assert.deepEqual((await first.loadCredential("openai")).value, {
    token: "token-secret"
  });
  assert.equal((await second.removeCredential("openai")).success, true);
  assert.equal((await first.loadCredential("openai")).error.code, "CONFIG_MISSING");
  const sql = JSON.stringify(state.queries);
  for (const secret of ["api-key-secret", "token-secret", "apiKey", "token"]) {
    assert.equal(sql.includes(secret), false);
  }
  assert.deepEqual(state.calls.map(([name]) => name), [
    "set_provider_credential",
    "get_provider_credential",
    "set_provider_credential",
    "get_provider_credential",
    "remove_provider_credential",
    "get_provider_credential"
  ]);
});

test("present but corrupt settings and credentials remain invalid", async () => {
  const state = backends();
  state.rows.set("provider_settings.v1", "{bad-json");
  assert.equal((await state.instance().loadSettings()).error.code, "CONFIG_INVALID");
  state.rows.set("provider_settings.v1", JSON.stringify({ providers: {} }));
  assert.equal((await state.instance().loadSettings()).error.code, "CONFIG_INVALID");
  state.credentials.set("openai", { state: "invalid" });
  assert.equal((await state.instance().loadCredential("openai")).error.code, "CONFIG_INVALID");
  assert.equal(state.rows.get("provider_settings.v1"), JSON.stringify({ providers: {} }));
});

test("storage and invoke failures expose only TASK-060 safe errors", async () => {
  const sql = backends();
  sql.failSql();
  for (const result of [
    await sql.instance().loadSettings(),
    await sql.instance().replaceSettings(settings())
  ]) {
    assert.equal(result.error.code, "CONFIG_STORAGE_FAILURE");
    assert.equal(JSON.stringify(result).includes("sql-native"), false);
  }
  const native = backends();
  native.failNative();
  for (const result of [
    await native.instance().loadCredential("openai"),
    await native.instance().replaceCredential("openai", { apiKey: "api-key-secret" }),
    await native.instance().replaceCredential("openai", { token: "token-secret" }),
    await native.instance().removeCredential("openai")
  ]) {
    assert.equal(result.error.code, "CONFIG_STORAGE_FAILURE");
    assert.equal(/api-key-secret|token-secret|native-stack/.test(JSON.stringify(result)), false);
  }
});

test("invalid caller input is rejected before invoking native storage", async () => {
  const state = backends();
  const boundary = state.instance();
  assert.equal(
    (await boundary.replaceCredential("openai", { apiKey: "bad\nvalue" })).error.code,
    "CONFIG_INVALID"
  );
  assert.equal((await boundary.loadCredential("other")).error.code, "CONFIG_INVALID");
  assert.equal(state.calls.length, 0);
});
