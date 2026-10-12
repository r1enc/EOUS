import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom"
});
after(async () => vite.close());
const { WebSearchTool, normalizeWebSearchResponse } = await vite.ssrLoadModule(
  "/src/tools/builtin/web-search/web-search.ts"
);
const { createBuiltInTools } = await vite.ssrLoadModule(
  "/src/tools/builtin/index.ts"
);
const { createTauriWebSearchBackend, createWebSearchSettingsBoundary } =
  await vite.ssrLoadModule("/src/infrastructure/web-search.ts");
const { DefaultToolSdkRuntime } = await vite.ssrLoadModule(
  "/src/execution/tool-sdk/runtime.ts"
);
const { createWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createWorkspace.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/index.ts"
);

const request = (query) => ({ toolId: "web-search", input: { query } });

test("query validation happens before backend and unavailable never fabricates results", async () => {
  let calls = 0;
  const tool = new WebSearchTool({
    search: async () => {
      calls++;
      return { results: [] };
    }
  });
  for (const query of ["  ", "x".repeat(401), "a\nb", "a\u0000b"]) {
    const result = await tool.execute(request(query));
    assert.equal(result.success, false);
    assert.equal(result.error.category, "validation");
  }
  assert.equal(calls, 0);
  const unavailable = await new WebSearchTool().execute(request("topic"));
  assert.equal(unavailable.success, false);
  assert.equal(unavailable.error.code, "search_unavailable");
  assert.equal(createBuiltInTools().length, 4);
  assert.deepEqual(
    createBuiltInTools().map((item) => item.manifest.id),
    ["calculator", "text-reader", "pdf-reader", "web-search"]
  );
});

test("normalization keeps order, caps five, and excludes unsafe and unrelated data", () => {
  const entries = [
    {
      title: "<b>First</b>",
      url: "https://one.test/a",
      content: "<p>One</p>",
      raw_content: "secret"
    },
    { title: "Unsafe", url: "javascript:alert(1)", content: "No" },
    { title: "Invalid URL", url: "https://example.test/\n", content: "No" },
    ...Array.from({ length: 7 }, (_, index) => ({
      title: `Result ${index}`,
      url: `https://r${index}.test/`,
      content: `Snippet ${index}`
    }))
  ];
  const output = normalizeWebSearchResponse({
    results: entries,
    answer: "ignored"
  });
  assert.equal(output.results.length, 5);
  assert.deepEqual(output.results[0], {
    title: "First",
    url: "https://one.test/a",
    snippet: "One"
  });
  assert.equal(output.results[1].title, "Result 0");
  assert.ok(!JSON.stringify(output).includes("secret"));
  assert.ok(!JSON.stringify(output).includes("answer"));
  assert.deepEqual(normalizeWebSearchResponse({ results: [] }), {
    results: []
  });
  assert.equal(normalizeWebSearchResponse({ wrong: [] }), null);
  assert.deepEqual(
    normalizeWebSearchResponse({
      results: [null, { title: "", url: "data:text/html,x", content: "x" }]
    }),
    { results: [] }
  );
});

test("SDK permission denial calls backend zero times; approval calls it once", async () => {
  let calls = 0;
  const backend = {
    search: async (query) => {
      calls++;
      assert.equal(query, "exact words");
      return { results: [{ title: "A", url: "https://a.test", content: "B" }] };
    }
  };
  const denied = new DefaultToolSdkRuntime(() => false);
  denied.register(new WebSearchTool(backend));
  assert.deepEqual(denied.listManifests()[0].requiredPermissions, ["network"]);
  assert.equal(
    (await denied.execute(request("exact words"))).error.code,
    "PERMISSION_REQUIRED"
  );
  assert.equal(calls, 0);
  const approved = new DefaultToolSdkRuntime(() => true);
  approved.register(new WebSearchTool(backend));
  const result = await approved.execute(request("  exact words  "));
  assert.equal(result.success, true);
  assert.equal(result.output.results.length, 1);
  assert.equal(calls, 1);
});

test("Workspace injection preserves Agent and permission flow", async () => {
  let backendCalls = 0;
  const registry = new DefaultProviderRegistry();
  registry.registerProvider({
    id: "web-search-test",
    name: "Web Search Test",
    capabilities: {
      contextWindow: 4096,
      supportsSystemInstructions: true,
      supportsFunctionCalling: false,
      supportsVision: false
    },
    async generateCompletion() {
      return { success: true, role: "assistant", content: "Search complete" };
    }
  });
  const planner = {
    async plan() {
      const now = new Date().toISOString();
      return {
        id: "search-plan",
        status: "planned",
        createdAt: now,
        updatedAt: now,
        steps: [
          {
            id: "search-step",
            action: "web-search",
            input: { query: "exact words" },
            status: "pending"
          }
        ]
      };
    }
  };
  const backend = {
    async search(query) {
      backendCalls++;
      assert.equal(query, "exact words");
      return { results: [{ title: "A", url: "https://a.test", content: "B" }] };
    }
  };
  const configuration = {
    providerRegistry: registry,
    providerId: "web-search-test",
    model: "test-model",
    conversationTitle: "Search test",
    planner,
    webSearchBackend: backend
  };
  const denied = createWorkspace({
    ...configuration,
    conversationId: "search-denied"
  });
  assert.equal(
    (await denied.execute({ id: "denied", prompt: "Search" })).error.code,
    "PERMISSION_REQUIRED"
  );
  assert.equal(backendCalls, 0);
  const allowed = createWorkspace({
    ...configuration,
    conversationId: "search-allowed",
    approvePermission: async (request) => ({
      requestId: request.id,
      decision: "granted"
    })
  });
  assert.equal(
    (await allowed.execute({ id: "allowed", prompt: "Search" })).status,
    "success"
  );
  assert.equal(backendCalls, 1);
});

test("native adapter maps fixed errors and never includes upstream detail", async () => {
  const calls = [];
  const backend = createTauriWebSearchBackend(async (command, args) => {
    calls.push({ command, args });
    return { results: [] };
  });
  assert.deepEqual(await backend.search("topic"), { results: [] });
  assert.deepEqual(calls, [
    { command: "search_web", args: { query: "topic" } }
  ]);
  for (const [native, code] of [
    ["SEARCH_NOT_CONFIGURED", "not_configured"],
    ["SEARCH_CREDENTIAL_UNAVAILABLE", "credential_unavailable"],
    ["SEARCH_INVALID_RESPONSE", "invalid_response"]
  ]) {
    const failing = createTauriWebSearchBackend(async () => {
      throw native;
    });
    await assert.rejects(
      failing.search("topic"),
      (error) => error.code === code && !error.message.includes(native)
    );
  }
  const unknown = createTauriWebSearchBackend(async () => {
    throw new Error("synthetic-key stack trace");
  });
  await assert.rejects(
    unknown.search("topic"),
    (error) =>
      error.code === "transport_failed" &&
      !error.message.includes("synthetic-key")
  );
});

test("settings boundary requests status only and never reads a key", async () => {
  const calls = [];
  const settings = createWebSearchSettingsBoundary(async (command, args) => {
    calls.push({ command, args });
    if (command === "get_web_search_credential_status") return "configured";
  });
  assert.equal(await settings.status(), "configured");
  await settings.save("synthetic-key");
  await settings.remove();
  assert.deepEqual(
    calls.map((call) => call.command),
    [
      "get_web_search_credential_status",
      "set_web_search_credential",
      "remove_web_search_credential"
    ]
  );
  assert.deepEqual(calls[1].args, { key: "synthetic-key" });
  assert.equal(
    await createWebSearchSettingsBoundary(async () => {
      throw "native-secret";
    }).status(),
    "unavailable"
  );
});
