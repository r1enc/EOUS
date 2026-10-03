/* global Response, ReadableStream, TextEncoder */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(async () => vite.close());
const { createGeminiProvider } = await vite.ssrLoadModule("/src/intelligence/providers/gemini.ts");
const { DefaultProviderRegistry } = await vite.ssrLoadModule("/src/intelligence/provider-sdk/index.ts");
const { createWorkspace } = await vite.ssrLoadModule("/src/workspace/createWorkspace.ts");

const capabilities = { contextWindow: 4096, supportsSystemInstructions: true, supportsFunctionCalling: false, supportsVision: false };
const config = { auth: { apiKey: "api-key-secret" }, timeoutMs: 100 };
const input = {
  model: "configured-model",
  messages: [
    { role: "system", content: "Rule one" },
    { role: "system", content: "Rule two" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Again" },
  ],
  options: { maxTokens: 25, temperature: 0, topP: 0.7 },
};
const candidate = (parts = [{ text: "answer" }], finishReason = "STOP") => ({ content: { role: "model", parts }, finishReason });
const partial = (parts) => ({ content: { role: "model", parts } });
const completed = (parts, usage) => ({ candidates: [candidate(parts)], ...(usage ? { usageMetadata: usage } : {}) });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const frame = (value, newline = "\n") => `data: ${JSON.stringify(value)}${newline}${newline}`;
const clean = (value) => {
  const publicValue = JSON.stringify(value);
  for (const secret of ["api-key-secret", "token-secret", "body-secret", "stack-secret", "url-secret", "request-secret"]) {
    assert.equal(publicValue.includes(secret), false);
  }
};

test("Gemini Provider shape, registry, endpoint, auth, transcript, and options", async () => {
  const provider = createGeminiProvider(config, capabilities, async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/configured-model:generateContent");
    assert.equal(init.method, "POST");
    assert.equal(init.headers["x-goog-api-key"], "api-key-secret");
    assert.deepEqual(JSON.parse(init.body), {
      systemInstruction: { parts: [{ text: "Rule one" }, { text: "Rule two" }] },
      contents: [
        { role: "user", parts: [{ text: "Hello" }] },
        { role: "model", parts: [{ text: "Hi" }] },
        { role: "user", parts: [{ text: "Again" }] },
      ],
      generationConfig: { maxOutputTokens: 25, temperature: 0, topP: 0.7 },
    });
    return json(completed());
  });
  assert.equal(provider.id, "gemini");
  assert.equal(provider.name, "Gemini");
  assert.equal(provider.capabilities, capabilities);
  assert.equal(typeof provider.streamCompletion, "function");
  new DefaultProviderRegistry().registerProvider(provider);
  assert.deepEqual(await provider.generateCompletion(input), { success: true, role: "assistant", content: "answer" });
});

test("token alias, base URL override, and omitted optional fields", async () => {
  const provider = createGeminiProvider({ baseUrl: "https://proxy.example/v1beta", auth: { token: "token-secret" } }, capabilities, async (url, init) => {
    assert.equal(url, "https://proxy.example/v1beta/models/configured-model:generateContent");
    assert.equal(init.headers["x-goog-api-key"], "token-secret");
    assert.deepEqual(JSON.parse(init.body), {
      contents: [{ role: "user", parts: [{ text: "Hello" }] }],
    });
    return json(completed([]));
  });
  assert.deepEqual(await provider.generateCompletion({ model: input.model, messages: [{ role: "user", content: "Hello" }] }), { success: true, role: "assistant", content: "" });
});

test("visible text parts stay ordered; thoughts/signatures and nontext stay hidden; usage maps", async () => {
  const parts = [
    { text: "private thought", thought: true, thoughtSignature: "body-secret" },
    { text: "A", thoughtSignature: "body-secret" },
    { inlineData: { data: "body-secret" } },
    { text: "B" },
  ];
  const provider = createGeminiProvider(config, capabilities, async () => json(completed(parts, { promptTokenCount: 2, candidatesTokenCount: 3, totalTokenCount: 8, thoughtsTokenCount: 3 })));
  assert.deepEqual(await provider.generateCompletion(input), { success: true, role: "assistant", content: "AB", usage: { promptTokens: 2, completionTokens: 3, totalTokens: 8 } });
});

test("missing or malformed usage is omitted", async () => {
  for (const usage of [undefined, { promptTokenCount: "2", candidatesTokenCount: 3, totalTokenCount: 5 }]) {
    const provider = createGeminiProvider(config, capabilities, async () => json(completed([], usage)));
    assert.deepEqual(await provider.generateCompletion(input), { success: true, role: "assistant", content: "" });
  }
});

test("blocked, truncated, or malformed responses fail safely", async () => {
  const cases = [
    [{ promptFeedback: { blockReason: "SAFETY", details: "body-secret" } }, "api_error"],
    [{ candidates: [] }, "api_error"],
    [{ candidates: [candidate([{ text: "partial" }], "MAX_TOKENS")] }, "api_error"],
    [{ candidates: [candidate([], "SAFETY")] }, "api_error"],
    [{ candidates: [candidate([], "RECITATION")] }, "api_error"],
    [{ candidates: [{ content: { role: "user", parts: [{ text: "body-secret" }] }, finishReason: "STOP" }] }, "validation"],
    [{ candidates: [{ content: { parts: [{ text: 5 }] }, finishReason: "STOP" }] }, "validation"],
    [{ candidates: [{ content: { parts: [] } }] }, "validation"],
    [{ candidates: "body-secret" }, "validation"],
  ];
  for (const [payload, category] of cases) {
    const provider = createGeminiProvider(config, capabilities, async () => json(payload));
    const result = await provider.generateCompletion(input);
    assert.equal(result.success, false);
    assert.equal(result.error.category, category);
    clean(result);
  }
  const malformed = createGeminiProvider(config, capabilities, async () => new Response("{body-secret"));
  const result = await malformed.generateCompletion(input);
  assert.equal(result.error.category, "validation");
  clean(result);
});

for (const [status, category] of [[401, "authentication"], [403, "authentication"], [429, "rate_limit"], [500, "api_error"]]) {
  test(`HTTP ${status} normalizes safely`, async () => {
    const provider = createGeminiProvider(config, capabilities, async () => new Response("body-secret", { status }));
    const result = await provider.generateCompletion(input);
    assert.equal(result.error.category, category);
    clean(result);
  });
}

test("timeout and network failures omit credentials and native error details", async () => {
  const timeout = createGeminiProvider({ ...config, timeoutMs: 5 }, capabilities, async () => new Promise(() => {}));
  const timed = await timeout.generateCompletion(input);
  assert.equal(timed.error.category, "timeout");
  clean(timed);
  const network = createGeminiProvider(config, capabilities, async () => { const error = new Error("api-key-secret request-secret url-secret"); error.stack = "stack-secret"; throw error; });
  const failed = await network.generateCompletion(input);
  assert.equal(failed.error.category, "unknown");
  clean(failed);
});

test("invalid credentials, model, transcript, options, and URL avoid network", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return json(completed()); };
  const cases = [
    [{}, input],
    [{ auth: { apiKey: "api-key-secret", token: "token-secret" } }, input],
    [{ auth: { apiKey: 5 } }, input],
    [{ ...config, baseUrl: "https://user:pass@proxy.example/v1beta?key=url-secret" }, input],
    [config, { ...input, model: "../other?key=url-secret" }],
    [config, { ...input, model: "" }],
    [config, { ...input, messages: [] }],
    [config, { ...input, messages: [{ role: "system", content: "Only system" }] }],
    [config, { ...input, messages: [{ role: "user", content: "Hi" }, { role: "system", content: "Interleaved" }] }],
    [config, { ...input, messages: [{ role: "user", content: "Hi" }, { role: "assistant", content: "Model last" }] }],
    [config, { ...input, messages: [{ role: "tool", content: "Invalid" }] }],
    [config, { ...input, messages: [{ role: "user", content: " " }] }],
    [config, { ...input, options: { maxTokens: 0 } }],
    [config, { ...input, options: { temperature: -1 } }],
    [config, { ...input, options: { topP: 2 } }],
  ];
  for (const [settings, request] of cases) {
    const result = await createGeminiProvider(settings, capabilities, fetcher).generateCompletion(request);
    assert.equal(result.success, false);
    clean(result);
  }
  assert.equal(calls, 0);
});

test("SSE handles split UTF-8, CRLF, multiple frames, thoughts, final usage, and cleanup", async () => {
  const payload = ": comment\r\n\r\n" +
    frame({ candidates: [partial([{ text: "hé" }, { text: "thought", thought: true, thoughtSignature: "body-secret" }])] }, "\r\n") +
    frame({ candidates: [partial([{ text: "llo" }, { text: "" }])] }) +
    frame({ candidates: [candidate([{ text: "!" }], "STOP")] }) +
    frame({ usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 2, totalTokenCount: 5, thoughtsTokenCount: 2 } });
  const bytes = new TextEncoder().encode(payload);
  const split = bytes.indexOf(0xc3) + 1;
  let signal;
  let response;
  const provider = createGeminiProvider({ ...config, timeoutMs: 100 }, capabilities, async (url, init) => {
    assert.equal(url, "https://generativelanguage.googleapis.com/v1beta/models/configured-model:streamGenerateContent?alt=sse");
    assert.equal(JSON.parse(init.body).contents.length, 3);
    signal = init.signal;
    response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 9));
        controller.enqueue(bytes.slice(9, split));
        controller.enqueue(bytes.slice(split, split + 7));
        controller.enqueue(bytes.slice(split + 7));
        controller.close();
      },
    }));
    return response;
  });
  const events = [];
  for await (const item of provider.streamCompletion(input)) events.push(item);
  assert.deepEqual(events, [
    { type: "content", delta: "hé" },
    { type: "content", delta: "llo" },
    { type: "content", delta: "!" },
    { type: "complete", response: { success: true, role: "assistant", content: "héllo!", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 5 } } },
  ]);
  assert.equal(response.body.locked, false);
  await delay(130);
  assert.equal(signal.aborted, false);
});

test("zero visible deltas and STOP produce one empty completion", async () => {
  const provider = createGeminiProvider(config, capabilities, async () => new Response(frame({ candidates: [candidate([{ text: "thought", thought: true }, { text: "" }], "STOP")] })));
  const events = [];
  for await (const item of provider.streamCompletion(input)) events.push(item);
  assert.deepEqual(events, [{ type: "complete", response: { success: true, role: "assistant", content: "" } }]);
});

test("stream transport failures retain safe shared error categories", async () => {
  for (const [status, category] of [[401, "authentication"], [429, "rate_limit"], [500, "api_error"]]) {
    const provider = createGeminiProvider(config, capabilities, async () => new Response("body-secret", { status }));
    const events = [];
    for await (const item of provider.streamCompletion(input)) events.push(item);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "failure");
    assert.equal(events[0].error.category, category);
    clean(events[0]);
  }
});

test("text after STOP cannot become an authoritative completion", async () => {
  const provider = createGeminiProvider(config, capabilities, async () => new Response(
    frame({ candidates: [candidate([{ text: "first" }], "STOP")] }) +
    frame({ candidates: [partial([{ text: "late" }])] })
  ));
  const events = [];
  for await (const item of provider.streamCompletion(input)) events.push(item);
  assert.equal(events.at(-1).type, "failure");
  assert.equal(events.some((item) => item.type === "complete"), false);
});

for (const payload of [
  frame({ candidates: [candidate([{ text: "partial" }], "MAX_TOKENS")] }),
  frame({ candidates: [candidate([], "SAFETY")], secret: "body-secret" }),
  "data: {body-secret\n\n",
  frame({ candidates: [candidate([{ text: 5 }], "STOP")] }),
  frame({ candidates: [partial([{ text: "partial" }])] }),
  frame({ promptFeedback: { blockReason: "SAFETY", secret: "body-secret" } }),
]) {
  test("stream blocked, malformed, or missing terminal yields one safe failure", async () => {
    const provider = createGeminiProvider(config, capabilities, async () => new Response(payload));
    const events = [];
    for await (const item of provider.streamCompletion(input)) events.push(item);
    assert.equal(events.at(-1).type, "failure");
    assert.equal(events.filter((item) => item.type === "failure").length, 1);
    clean(events.at(-1));
  });
}

test("stream reader failure and body timeout normalize safely", async () => {
  const broken = createGeminiProvider(config, capabilities, async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error("stack-secret api-key-secret")); },
  })));
  const failed = [];
  for await (const item of broken.streamCompletion(input)) failed.push(item);
  assert.equal(failed.length, 1);
  assert.equal(failed[0].type, "failure");
  clean(failed[0]);

  let cancelled = false;
  const timeout = createGeminiProvider({ ...config, timeoutMs: 5 }, capabilities, async () => new Response(new ReadableStream({ start() {}, cancel() { cancelled = true; } })));
  const events = [];
  for await (const item of timeout.streamCompletion(input)) events.push(item);
  assert.equal(events.length, 1);
  assert.equal(events[0].error.category, "timeout");
  assert.equal(cancelled, true);
});

test("invalid frame cancels an open body and emits no later content", async () => {
  let cancelled = false;
  const provider = createGeminiProvider(config, capabilities, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode("data: {body-secret\n\n")); },
    cancel() { cancelled = true; },
  })));
  const events = [];
  for await (const item of provider.streamCompletion(input)) events.push(item);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "failure");
  assert.equal(cancelled, true);
  clean(events[0]);
});

test("Gemini adapter works behind unchanged Workspace and Agent sync and stream paths", async () => {
  const registry = new DefaultProviderRegistry();
  registry.registerProvider(createGeminiProvider(config, capabilities, async (url) =>
    url.includes("streamGenerateContent")
      ? new Response(frame({ candidates: [partial([{ text: "part" }])] }) + frame(completed()))
      : json(completed())
  ));
  const workspace = createWorkspace({ providerRegistry: registry, providerId: "gemini", model: "configured-model", conversationId: "gemini-test", conversationTitle: "Test" });
  const sync = await workspace.execute({ id: "sync", prompt: "Hello" });
  assert.equal(sync.content, "answer");
  const streamed = [];
  for await (const item of workspace.executeStream({ id: "stream", prompt: "Again" })) streamed.push(item);
  assert.equal(streamed.find((item) => item.type === "content")?.delta, "part");
  assert.equal(streamed.at(-1).response.content, "partanswer");
});
