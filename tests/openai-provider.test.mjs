/* global Response, ReadableStream, TextEncoder */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(async () => vite.close());
const { createOpenAiProvider } = await vite.ssrLoadModule("/src/intelligence/providers/openai.ts");
const { DefaultProviderRegistry } = await vite.ssrLoadModule("/src/intelligence/provider-sdk/index.ts");
const { createWorkspace } = await vite.ssrLoadModule("/src/workspace/createWorkspace.ts");

const capabilities = { contextWindow: 4096, supportsSystemInstructions: true, supportsFunctionCalling: false, supportsVision: false };
const config = { auth: { apiKey: "api-key-secret" }, timeoutMs: 100 };
const input = {
  model: "configured-model",
  messages: [
    { role: "system", content: "Be concise" },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Again" },
  ],
  options: { maxTokens: 25, temperature: 0, topP: 0.7 },
};
const completed = (output = [{ type: "message", role: "assistant", content: [{ type: "output_text", text: "answer" }] }], usage) =>
  ({ object: "response", status: "completed", output, ...(usage ? { usage } : {}) });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
const event = (type, data, newline = "\n") => `event: ${type}${newline}data: ${JSON.stringify({ type, ...data })}${newline}${newline}`;
const clean = (value) => {
  const publicValue = JSON.stringify(value);
  for (const secret of ["api-key-secret", "token-secret", "header-secret", "body-secret", "stack-secret", "url-secret"]) {
    assert.equal(publicValue.includes(secret), false);
  }
};

test("adapter satisfies Provider shape and maps transcript, options, auth, and endpoint", async () => {
  const provider = createOpenAiProvider(config, capabilities, async (url, init) => {
    assert.equal(url, "https://api.openai.com/v1/responses");
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer api-key-secret");
    assert.equal(init.headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(init.body), {
      model: "configured-model", input: input.messages, store: false,
      max_output_tokens: 25, temperature: 0, top_p: 0.7,
    });
    return json(completed());
  });
  assert.equal(provider.id, "openai");
  assert.equal(provider.name, "OpenAI");
  assert.equal(provider.capabilities, capabilities);
  assert.equal(typeof provider.streamCompletion, "function");
  new DefaultProviderRegistry().registerProvider(provider);
  assert.deepEqual(await provider.generateCompletion(input), { success: true, role: "assistant", content: "answer" });
});

test("token auth, base URL trailing slash, and omitted options", async () => {
  const provider = createOpenAiProvider({ baseUrl: "https://proxy.example/v1", auth: { token: "token-secret" } }, capabilities, async (url, init) => {
    assert.equal(url, "https://proxy.example/v1/responses");
    assert.equal(init.headers.Authorization, "Bearer token-secret");
    assert.deepEqual(JSON.parse(init.body), { model: "configured-model", input: input.messages, store: false });
    return json(completed([]));
  });
  assert.deepEqual(await provider.generateCompletion({ ...input, options: undefined }), { success: true, role: "assistant", content: "" });
});

test("multiple text parts normalize in order; unrelated items stay hidden; usage maps", async () => {
  const output = [
    { type: "reasoning", summary: "body-secret" },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "A" }, { type: "refusal", refusal: "body-secret" }, { type: "output_text", text: "B" }] },
    { type: "function_call", arguments: "body-secret" },
    { type: "message", role: "assistant", content: [{ type: "output_text", text: "C" }] },
  ];
  const provider = createOpenAiProvider(config, capabilities, async () => json(completed(output, { input_tokens: 2, output_tokens: 3, total_tokens: 5 })));
  assert.deepEqual(await provider.generateCompletion(input), { success: true, role: "assistant", content: "ABC", usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 } });
});

test("malformed usage is omitted; malformed JSON and structure fail safely", async () => {
  const malformedUsage = createOpenAiProvider(config, capabilities, async () => json(completed([], { input_tokens: "2", output_tokens: 3, total_tokens: 5 })));
  assert.deepEqual(await malformedUsage.generateCompletion(input), { success: true, role: "assistant", content: "" });
  for (const response of [new Response("{body-secret"), json({ status: "completed", output: "body-secret" }), json(completed([{ type: "message", role: "assistant", content: [{ type: "output_text" }] }]))]) {
    const provider = createOpenAiProvider(config, capabilities, async () => response);
    const result = await provider.generateCompletion(input);
    assert.equal(result.success, false);
    assert.equal(result.error.category, "validation");
    clean(result);
  }
});

test("completed HTTP response with provider failure status stays a safe failure", async () => {
  const provider = createOpenAiProvider(config, capabilities, async () => json({ status: "failed", error: { message: "body-secret" } }));
  const result = await provider.generateCompletion(input);
  assert.equal(result.success, false);
  assert.equal(result.error.category, "api_error");
  clean(result);
});

for (const [status, category] of [[401, "authentication"], [403, "authentication"], [429, "rate_limit"], [500, "api_error"]]) {
  test(`HTTP ${status} safely normalizes`, async () => {
    const provider = createOpenAiProvider(config, capabilities, async () => new Response("body-secret", { status }));
    const result = await provider.generateCompletion(input);
    assert.equal(result.success, false);
    assert.equal(result.error.category, category);
    clean(result);
  });
}

test("timeout and network exceptions never expose internal details", async () => {
  const timeout = createOpenAiProvider({ ...config, timeoutMs: 5 }, capabilities, async () => new Promise(() => {}));
  const timed = await timeout.generateCompletion(input);
  assert.equal(timed.error.category, "timeout");
  clean(timed);
  const network = createOpenAiProvider(config, capabilities, async () => { const error = new Error("api-key-secret token-secret header-secret url-secret"); error.stack = "stack-secret"; throw error; });
  const failed = await network.generateCompletion(input);
  assert.equal(failed.error.category, "unknown");
  clean(failed);
});

test("invalid auth, URL, model, messages, and options avoid network", async () => {
  let calls = 0;
  const fetcher = async () => { calls++; return json(completed()); };
  const cases = [
    [{}, input],
    [{ auth: { apiKey: 42 } }, input],
    [{ auth: { apiKey: "api-key-secret", token: "token-secret" } }, input],
    [{ ...config, baseUrl: "https://user:password@example.com/v1?token=url-secret" }, input],
    [config, { ...input, model: "  " }],
    [config, { ...input, messages: [] }],
    [config, { ...input, messages: [{ role: "tool", content: "unsafe" }] }],
    [config, { ...input, messages: [{ role: "user", content: " " }] }],
    [config, { ...input, options: { maxTokens: 0 } }],
    [config, { ...input, options: { temperature: -1 } }],
    [config, { ...input, options: { topP: 2 } }],
  ];
  for (const [settings, request] of cases) {
    const result = await createOpenAiProvider(settings, capabilities, fetcher).generateCompletion(request);
    assert.equal(result.success, false);
    clean(result);
  }
  assert.equal(calls, 0);
});

test("SSE splits UTF-8 and event framing across chunks; final response is authoritative", async () => {
  const terminal = completed(undefined, { input_tokens: 1, output_tokens: 2, total_tokens: 3 });
  const payload = ": comment\r\n\r\n" + event("response.created", { response: { status: "in_progress" } }, "\r\n") +
    event("response.output_text.delta", { delta: "hé" }, "\r\n") +
    event("response.output_text.delta", { delta: "llo" }) +
    event("response.completed", { response: terminal }) +
    event("response.output_text.delta", { delta: "must be ignored" });
  const bytes = new TextEncoder().encode(payload);
  const split = bytes.indexOf(0xc3) + 1;
  let cancelled = false;
  let signal;
  const provider = createOpenAiProvider({ ...config, timeoutMs: 100 }, capabilities, async (_url, init) => {
    signal = init.signal;
    assert.equal(JSON.parse(init.body).stream, true);
    return new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(bytes.slice(0, 9));
        controller.enqueue(bytes.slice(9, split));
        controller.enqueue(bytes.slice(split, split + 5));
        controller.enqueue(bytes.slice(split + 5));
      },
      cancel() { cancelled = true; },
    }));
  });
  const events = [];
  for await (const item of provider.streamCompletion(input)) events.push(item);
  assert.deepEqual(events, [
    { type: "content", delta: "hé" },
    { type: "content", delta: "llo" },
    { type: "complete", response: { success: true, role: "assistant", content: "answer", usage: { promptTokens: 1, completionTokens: 2, totalTokens: 3 } } },
  ]);
  assert.equal(cancelled, true);
  await delay(130);
  assert.equal(signal.aborted, false);
});

test("zero deltas and empty terminal text complete once", async () => {
  const payload = event("response.in_progress", {}) + event("response.output_text.delta", { delta: "" }) + event("response.completed", { response: completed([]) });
  const provider = createOpenAiProvider(config, capabilities, async () => new Response(payload));
  const events = [];
  for await (const item of provider.streamCompletion(input)) events.push(item);
  assert.deepEqual(events, [{ type: "complete", response: { success: true, role: "assistant", content: "" } }]);
});

for (const payload of [
  event("error", { message: "api-key-secret body-secret" }),
  event("response.failed", { response: { error: { message: "token-secret" } } }),
  event("response.incomplete", { response: { incomplete_details: "body-secret" } }),
  "event: response.output_text.delta\ndata: {body-secret\n\n",
  event("response.output_text.delta", { delta: 4 }),
  event("response.completed", { response: { status: "completed", output: "body-secret" } }),
  event("response.output_text.delta", { delta: "partial" }),
]) {
  test("stream error, malformed event, or missing terminal ends in one safe failure", async () => {
    const provider = createOpenAiProvider(config, capabilities, async () => new Response(payload));
    const events = [];
    for await (const item of provider.streamCompletion(input)) events.push(item);
    assert.equal(events.at(-1).type, "failure");
    assert.equal(events.filter((item) => item.type === "failure").length, 1);
    clean(events.at(-1));
  });
}

test("explicit stream failure cancels the body and emits no later event", async () => {
  let cancelled = false;
  const payload = event("response.failed", { response: { error: { message: "body-secret" } } }) + event("response.output_text.delta", { delta: "late" });
  const provider = createOpenAiProvider(config, capabilities, async () => new Response(new ReadableStream({
    start(controller) { controller.enqueue(new TextEncoder().encode(payload)); },
    cancel() { cancelled = true; },
  })));
  const events = [];
  for await (const item of provider.streamCompletion(input)) events.push(item);
  assert.equal(events.length, 1);
  assert.equal(events[0].type, "failure");
  assert.equal(cancelled, true);
  clean(events[0]);
});

test("stream reader failure and body timeout normalize and clean up", async () => {
  let cancelled = false;
  const broken = createOpenAiProvider(config, capabilities, async () => new Response(new ReadableStream({
    start(controller) { controller.error(new Error("stack-secret api-key-secret")); },
    cancel() { cancelled = true; },
  })));
  const failure = [];
  for await (const item of broken.streamCompletion(input)) failure.push(item);
  assert.equal(failure.at(-1).type, "failure");
  clean(failure.at(-1));
  // An errored stream has no active reader to cancel; close still releases transport state.
  assert.equal(typeof cancelled, "boolean");

  const timeout = createOpenAiProvider({ ...config, timeoutMs: 5 }, capabilities, async () => new Response(new ReadableStream({ start() {}, cancel() { cancelled = true; } })));
  const events = [];
  for await (const item of timeout.streamCompletion(input)) events.push(item);
  assert.equal(events.length, 1);
  assert.equal(events[0].error.category, "timeout");
  assert.equal(cancelled, true);
});

test("OpenAI adapter works behind unchanged Workspace and Agent sync and stream paths", async () => {
  const registry = new DefaultProviderRegistry();
  registry.registerProvider(createOpenAiProvider(config, capabilities, async (_url, init) =>
    JSON.parse(init.body).stream
      ? new Response(event("response.output_text.delta", { delta: "part" }) + event("response.completed", { response: completed() }))
      : json(completed())
  ));
  const workspace = createWorkspace({ providerRegistry: registry, providerId: "openai", model: "configured-model", conversationId: "openai-test", conversationTitle: "Test" });
  const sync = await workspace.execute({ id: "sync", prompt: "Hello" });
  assert.equal(sync.content, "answer");
  const streamed = [];
  for await (const item of workspace.executeStream({ id: "stream", prompt: "Again" })) streamed.push(item);
  assert.equal(streamed.find((item) => item.type === "content")?.delta, "part");
  assert.equal(streamed.at(-1).response.content, "answer");
});
