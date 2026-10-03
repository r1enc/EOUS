/* global Response, AbortController, ReadableStream */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

const vite = await createServer({ server: { middlewareMode: true, hmr: false }, appType: "custom" });
after(async () => vite.close());
const { sendProviderRequest } = await vite.ssrLoadModule("/src/intelligence/provider-runtime/transport.ts");

const request = {
  url: "https://secret:password.invalid/path?token=url-secret",
  method: "POST",
  headers: { Authorization: "Bearer header-secret", "Content-Type": "application/json" },
  body: '{"prompt":"hello"}',
  timeoutMs: 100,
};
const noSecrets = (result) => {
  const publicError = JSON.stringify(result.error);
  for (const secret of ["api-key-secret", "token-secret", "header-secret", "url-secret", "password", "stack-secret", "body-secret"]) {
    assert.equal(publicError.includes(secret), false);
  }
};

test("native transport passes provider-neutral request details and parses a response", async () => {
  let signal;
  const result = await sendProviderRequest(request, async (url, init) => {
    assert.equal(url, request.url);
    assert.equal(init.method, "POST");
    assert.equal(init.headers.Authorization, "Bearer header-secret");
    assert.equal(init.body, request.body);
    signal = init.signal;
    return new Response('{"answer":42}', { status: 201 });
  });
  assert.equal(result.success, true);
  assert.equal(result.status, 201);
  assert.deepEqual(await result.readJson(), { success: true, value: { answer: 42 } });
  await delay(130);
  assert.equal(signal.aborted, false, "completed body read clears the timeout");
});

for (const [status, category] of [[401, "authentication"], [403, "authentication"], [429, "rate_limit"], [503, "api_error"]]) {
  test(`HTTP ${status} is safely normalized`, async () => {
    const result = await sendProviderRequest(request, async () => new Response("body-secret", { status }));
    assert.equal(result.success, false);
    assert.equal(result.error.category, category);
    noSecrets(result);
  });
}

test("timeout aborts even a fetch implementation that does not settle", async () => {
  let signal;
  const result = await sendProviderRequest({ ...request, timeoutMs: 5 }, async (_url, init) => {
    signal = init.signal;
    return new Promise(() => {});
  });
  assert.equal(result.success, false);
  assert.equal(result.error.category, "timeout");
  assert.equal(signal.aborted, true);
  noSecrets(result);
});

test("timeout also covers stalled response bodies", async () => {
  const body = new ReadableStream({ start() {} });
  const response = await sendProviderRequest({ ...request, timeoutMs: 5 }, async () => new Response(body));
  assert.equal(response.success, true);
  const parsed = await response.readJson();
  assert.equal(parsed.success, false);
  assert.equal(parsed.error.category, "timeout");
});

test("streaming callers can close after consuming the raw response", async () => {
  let signal;
  const result = await sendProviderRequest({ ...request, timeoutMs: 100 }, async (_url, init) => {
    signal = init.signal;
    return new Response("stream body");
  });
  assert.equal(result.success, true);
  assert.equal(await result.response.text(), "stream body");
  result.close();
  await delay(130);
  assert.equal(signal.aborted, false);
});

test("malformed response object and unreadable JSON have safe validation errors", async () => {
  const malformed = await sendProviderRequest(request, async () => ({ status: 200, body: "body-secret" }));
  assert.equal(malformed.success, false);
  assert.equal(malformed.error.category, "validation");
  noSecrets(malformed);

  const response = await sendProviderRequest(request, async () => new Response("{body-secret", { status: 200 }));
  assert.equal(response.success, true);
  const parsed = await response.readJson();
  assert.equal(parsed.success, false);
  assert.equal(parsed.error.category, "validation");
  noSecrets(parsed);
});

test("network exception including credentials and stack is normalized safely", async () => {
  const error = new Error("api-key-secret token-secret header-secret");
  error.stack = "stack-secret";
  const result = await sendProviderRequest(request, async () => { throw error; });
  assert.equal(result.success, false);
  assert.equal(result.error.category, "unknown");
  noSecrets(result);
});

test("external abort and invalid timeout settle safely", async () => {
  const external = new AbortController();
  const waiting = sendProviderRequest({ ...request, signal: external.signal }, async () => new Promise(() => {}));
  external.abort();
  const aborted = await waiting;
  assert.equal(aborted.success, false);
  assert.equal(aborted.error.category, "unknown");
  const invalid = await sendProviderRequest({ ...request, timeoutMs: Number.NaN }, async () => { throw new Error("must not fetch"); });
  assert.equal(invalid.success, false);
  assert.equal(invalid.error.category, "validation");
});
