/* global Response */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(async () => vite.close());
const { registerRuntimeProviders } = await vite.ssrLoadModule(
  "/src/intelligence/provider-runtime/registerRuntimeProviders.ts"
);
const { DefaultProviderRegistry, providerRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/index.ts"
);
const { createWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createWorkspace.ts"
);

const capabilities = {
  contextWindow: 4096,
  supportsSystemInstructions: true,
  supportsFunctionCalling: false,
  supportsVision: false
};
const settings = (id) => ({
  config: { auth: { apiKey: `${id}-secret` }, timeoutMs: 100 },
  capabilities
});
const configured = {
  openai: settings("openai"),
  gemini: settings("gemini"),
  groq: settings("groq")
};
const request = {
  model: "configured-model",
  messages: [{ role: "user", content: "Hello" }]
};
const expected = (registered = []) =>
  Object.fromEntries(
    ["openai", "gemini", "groq"].map((id) => [
      id,
      registered.includes(id) ? "registered" : "skipped"
    ])
  );
const openAiResponse = {
  status: "completed",
  output: [
    {
      type: "message",
      role: "assistant",
      content: [{ type: "output_text", text: "openai answer" }]
    }
  ]
};
const geminiResponse = {
  candidates: [
    {
      content: { role: "model", parts: [{ text: "gemini answer" }] },
      finishReason: "STOP"
    }
  ]
};
const groqResponse = {
  choices: [
    {
      message: { role: "assistant", content: "groq answer" },
      finish_reason: "stop"
    }
  ]
};
const json = (value) =>
  new Response(JSON.stringify(value), {
    headers: { "Content-Type": "application/json" }
  });
const groqFrame = (value) => `data: ${JSON.stringify(value)}\n\n`;
const openAiFrame = (type, value) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...value })}\n\n`;
const mockedFetch = async (url, init) => {
  const body = JSON.parse(init.body);
  if (url.includes("api.openai.com")) {
    assert.equal(init.headers.Authorization, "Bearer openai-secret");
    return body.stream
      ? new Response(
          openAiFrame("response.output_text.delta", { delta: "openai part" }) +
            openAiFrame("response.completed", { response: openAiResponse })
        )
      : json(openAiResponse);
  }
  if (url.includes("generativelanguage.googleapis.com")) {
    assert.equal(init.headers["x-goog-api-key"], "gemini-secret");
    return url.includes("streamGenerateContent")
      ? new Response(
          groqFrame({
            candidates: [
              { content: { role: "model", parts: [{ text: "gemini part" }] } }
            ]
          }) + groqFrame(geminiResponse)
        )
      : json(geminiResponse);
  }
  if (url.includes("api.groq.com")) {
    assert.equal(init.headers.Authorization, "Bearer groq-secret");
    return body.stream
      ? new Response(
          groqFrame({
            choices: [{ delta: { content: "groq part" }, finish_reason: null }]
          }) +
            groqFrame({ choices: [{ delta: {}, finish_reason: "stop" }] }) +
            "data: [DONE]\n\n"
        )
      : json(groqResponse);
  }
  throw new Error("unexpected URL");
};

test("module import has no global registration side effect", () => {
  assert.equal(providerRegistry.getProvider("openai"), undefined);
  assert.equal(providerRegistry.getProvider("gemini"), undefined);
  assert.equal(providerRegistry.getProvider("groq"), undefined);
});

test("none and each provider-only configuration register exactly the expected IDs", () => {
  for (const ids of [
    [],
    ["openai"],
    ["gemini"],
    ["groq"],
    ["openai", "gemini", "groq"]
  ]) {
    const registry = new DefaultProviderRegistry();
    const entries = Object.fromEntries(ids.map((id) => [id, configured[id]]));
    const result = registerRuntimeProviders(registry, entries, mockedFetch);
    assert.deepEqual(result, expected(ids));
    assert.deepEqual(
      registry.listProviders().map((provider) => provider.id),
      ids
    );
    for (const id of ["openai", "gemini", "groq"]) {
      assert.equal(
        registry.getProvider(id)?.id,
        ids.includes(id) ? id : undefined
      );
    }
    assert.equal(registry.getProvider("unknown"), undefined);
  }
});

test("invalid provider settings are isolated and never exposed as placeholders", () => {
  const registry = new DefaultProviderRegistry();
  const result = registerRuntimeProviders(
    registry,
    {
      openai: configured.openai,
      gemini: {
        ...configured.gemini,
        config: { auth: { apiKey: "gemini-secret", token: "token-secret" } }
      },
      groq: configured.groq
    },
    mockedFetch
  );
  assert.deepEqual(result, {
    openai: "registered",
    gemini: "invalid",
    groq: "registered"
  });
  assert.deepEqual(
    registry.listProviders().map((provider) => provider.id),
    ["openai", "groq"]
  );
  assert.equal(registry.getProvider("gemini"), undefined);
  assert.equal(JSON.stringify(result).includes("secret"), false);
});

test("missing credentials, ambiguous auth, invalid URL, capabilities, and malformed entries are isolated", () => {
  const invalid = [
    null,
    {},
    { config: {}, capabilities },
    { config: { auth: { apiKey: " " } }, capabilities },
    {
      config: { auth: { apiKey: "openai-secret", token: "token-secret" } },
      capabilities
    },
    {
      config: {
        auth: { apiKey: "openai-secret" },
        baseUrl: "https://user:password@host.example/v1?token=url-secret"
      },
      capabilities
    },
    {
      config: {
        auth: { apiKey: "openai-secret" },
        baseUrl: "javascript:url-secret"
      },
      capabilities
    },
    {
      config: { auth: { apiKey: "openai-secret" }, timeoutMs: NaN },
      capabilities
    },
    {
      config: { auth: { apiKey: "openai-secret" } },
      capabilities: { ...capabilities, contextWindow: 0 }
    },
    {
      config: { auth: { apiKey: "openai-secret" } },
      capabilities: { ...capabilities, supportsVision: "false" }
    },
    {
      config: { auth: { apiKey: "openai-secret" } },
      capabilities: { ...capabilities, maxOutputTokens: 5000 }
    }
  ];
  for (const entry of invalid) {
    const registry = new DefaultProviderRegistry();
    const result = registerRuntimeProviders(
      registry,
      { openai: entry, gemini: configured.gemini },
      mockedFetch
    );
    assert.deepEqual(result, {
      openai: "invalid",
      gemini: "registered",
      groq: "skipped"
    });
    assert.equal(registry.getProvider("openai"), undefined);
    assert.equal(registry.getProvider("gemini")?.id, "gemini");
    for (const secret of [
      "openai-secret",
      "token-secret",
      "url-secret",
      "password"
    ]) {
      assert.equal(JSON.stringify(result).includes(secret), false);
    }
  }
});

test("structurally invalid registration input fails with a fixed safe error", () => {
  const registry = new DefaultProviderRegistry();
  assert.throws(() => registerRuntimeProviders(registry, null, mockedFetch), {
    message: "Runtime provider registration input is invalid"
  });
  assert.deepEqual(registry.listProviders(), []);
});

test("registered Providers work for sync and stream after registry lookup", async () => {
  const registry = new DefaultProviderRegistry();
  assert.deepEqual(
    registerRuntimeProviders(registry, configured, mockedFetch),
    expected(["openai", "gemini", "groq"])
  );
  for (const id of ["openai", "gemini", "groq"]) {
    const provider = registry.getProvider(id);
    const sync = await provider.generateCompletion(request);
    assert.deepEqual(sync, {
      success: true,
      role: "assistant",
      content: `${id} answer`
    });
    const events = [];
    for await (const event of provider.streamCompletion(request))
      events.push(event);
    assert.deepEqual(events[0], { type: "content", delta: `${id} part` });
    assert.equal(events.at(-1).type, "complete");
    assert.equal(
      events.filter((event) => ["complete", "failure"].includes(event.type))
        .length,
      1
    );
    assert.equal(events.at(-1).response.success, true);
  }
});

test("runtime-populated registry works through unchanged Workspace", async () => {
  const registry = new DefaultProviderRegistry();
  registerRuntimeProviders(registry, configured, mockedFetch);
  const workspace = createWorkspace({
    providerRegistry: registry,
    providerId: "groq",
    model: request.model,
    conversationId: "runtime-test",
    conversationTitle: "Test"
  });
  const sync = await workspace.execute({ id: "sync", prompt: "Hello" });
  assert.equal(sync.content, "groq answer");
  const streamed = [];
  for await (const event of workspace.executeStream({
    id: "stream",
    prompt: "Again"
  }))
    streamed.push(event);
  assert.equal(
    streamed.find((event) => event.type === "content")?.delta,
    "groq part"
  );
  assert.equal(streamed.at(-1).response.content, "groq part");
});

test("custom Provider remains usable, unrelated entries survive, and replacement works", async () => {
  const registry = new DefaultProviderRegistry();
  const custom = {
    id: "custom",
    name: "Custom",
    capabilities,
    async generateCompletion() {
      return { success: true, role: "assistant", content: "custom answer" };
    }
  };
  registry.registerProvider(custom);
  const oldOpenAi = { ...custom, id: "openai", name: "Old OpenAI" };
  registry.registerProvider(oldOpenAi);
  const result = registerRuntimeProviders(
    registry,
    { openai: configured.openai },
    mockedFetch
  );
  assert.deepEqual(result, expected(["openai"]));
  assert.equal(registry.getProvider("custom"), custom);
  assert.notEqual(registry.getProvider("openai"), oldOpenAi);
  assert.deepEqual(
    await registry.getProvider("custom").generateCompletion(request),
    { success: true, role: "assistant", content: "custom answer" }
  );
  assert.equal(registry.listProviders().length, 2);
  registry.registerProvider(oldOpenAi);
  assert.equal(registry.getProvider("openai"), oldOpenAi);
});
