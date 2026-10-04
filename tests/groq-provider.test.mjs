/* global Response, ReadableStream, TextEncoder */
import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(async () => vite.close());
const { createGroqProvider } = await vite.ssrLoadModule(
  "/src/intelligence/providers/groq.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
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
const config = { auth: { apiKey: "api-key-secret" }, timeoutMs: 100 };
const input = {
  model: "vendor/configured-model",
  messages: [
    { role: "system", content: "First rule" },
    { role: "system", content: " Second rule " },
    { role: "user", content: "Hello" },
    { role: "assistant", content: "Hi" },
    { role: "user", content: "Again" }
  ],
  options: { maxTokens: 25, temperature: 0, topP: 0.7 }
};
const completion = (content = "answer", finish_reason = "stop", usage) => ({
  choices: [{ message: { role: "assistant", content }, finish_reason }],
  ...(usage ? { usage } : {})
});
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { "Content-Type": "application/json" }
  });
const frame = (value, newline = "\n") =>
  `data: ${JSON.stringify(value)}${newline}${newline}`;
const done = (newline = "\n") => `data: [DONE]${newline}${newline}`;
const chunk = (content, finish_reason = null, extra = {}) => ({
  choices: [
    {
      delta: { ...(content === undefined ? {} : { content }), ...extra },
      finish_reason
    }
  ]
});
const eventsFor = async (provider, request = input) => {
  const events = [];
  for await (const event of provider.streamCompletion(request))
    events.push(event);
  return events;
};
const terminal = (events, type) => {
  assert.equal(events.at(-1)?.type, type);
  assert.equal(
    events.filter(
      (event) => event.type === "complete" || event.type === "failure"
    ).length,
    1
  );
};
const clean = (value) => {
  const publicValue = JSON.stringify(value);
  for (const secret of [
    "api-key-secret",
    "token-secret",
    "body-secret",
    "stack-secret",
    "url-secret",
    "request-secret"
  ]) {
    assert.equal(publicValue.includes(secret), false);
  }
};

test("Provider shape, registry, endpoint, Bearer auth, transcript order, and options", async () => {
  const provider = createGroqProvider(
    config,
    capabilities,
    async (url, init) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      assert.equal(init.method, "POST");
      assert.equal(init.headers.Authorization, "Bearer api-key-secret");
      assert.equal(init.headers["Content-Type"], "application/json");
      const body = JSON.parse(init.body);
      assert.deepEqual(body, {
        model: input.model,
        messages: input.messages,
        max_completion_tokens: 25,
        temperature: 0,
        top_p: 0.7
      });
      assert.equal("max_tokens" in body, false);
      return json(completion());
    }
  );
  assert.equal(provider.id, "groq");
  assert.equal(provider.name, "Groq");
  assert.equal(provider.capabilities, capabilities);
  assert.equal(typeof provider.streamCompletion, "function");
  new DefaultProviderRegistry().registerProvider(provider);
  assert.deepEqual(await provider.generateCompletion(input), {
    success: true,
    role: "assistant",
    content: "answer"
  });
});

test("token alias, base URL override, empty content, and omitted options", async () => {
  const provider = createGroqProvider(
    {
      baseUrl: "https://proxy.example/openai/v1",
      auth: { token: "token-secret" }
    },
    capabilities,
    async (url, init) => {
      assert.equal(url, "https://proxy.example/openai/v1/chat/completions");
      assert.equal(init.headers.Authorization, "Bearer token-secret");
      assert.deepEqual(JSON.parse(init.body), {
        model: input.model,
        messages: input.messages
      });
      return json(completion(""));
    }
  );
  assert.deepEqual(
    await provider.generateCompletion({ ...input, options: undefined }),
    { success: true, role: "assistant", content: "" }
  );
});

test("sync usage is normalized; reasoning and provider metadata stay hidden", async () => {
  const provider = createGroqProvider(config, capabilities, async () =>
    json({
      choices: [
        {
          message: {
            role: "assistant",
            content: "visible",
            reasoning: "body-secret",
            tool_calls: [{ id: "body-secret" }]
          },
          finish_reason: "stop"
        }
      ],
      usage: {
        prompt_tokens: 2,
        completion_tokens: 3,
        total_tokens: 8,
        queue_time: 0.2
      },
      x_groq: { id: "body-secret" },
      system_fingerprint: "body-secret"
    })
  );
  const result = await provider.generateCompletion(input);
  assert.deepEqual(result, {
    success: true,
    role: "assistant",
    content: "visible",
    usage: { promptTokens: 2, completionTokens: 3, totalTokens: 8 }
  });
  clean(result);
});

test("absent or malformed usage is omitted", async () => {
  for (const usage of [
    undefined,
    { prompt_tokens: "2", completion_tokens: 3, total_tokens: 5 },
    { prompt_tokens: 2, completion_tokens: -1, total_tokens: 1 }
  ]) {
    const provider = createGroqProvider(config, capabilities, async () =>
      json(completion("", "stop", usage))
    );
    assert.deepEqual(await provider.generateCompletion(input), {
      success: true,
      role: "assistant",
      content: ""
    });
  }
});

test("malformed choices, message, JSON, and abnormal finish fail safely", async () => {
  const cases = [
    [{ choices: [] }, "validation"],
    [{ choices: "body-secret" }, "validation"],
    [
      {
        choices: [
          {
            message: { role: "user", content: "body-secret" },
            finish_reason: "stop"
          }
        ]
      },
      "validation"
    ],
    [completion(null), "validation"],
    [completion("partial", "length"), "api_error"],
    [completion("", "content_filter"), "api_error"],
    [completion("", "tool_calls"), "api_error"],
    [completion("", null), "validation"]
  ];
  for (const [payload, category] of cases) {
    const result = await createGroqProvider(config, capabilities, async () =>
      json(payload)
    ).generateCompletion(input);
    assert.equal(result.success, false);
    assert.equal(result.error.category, category);
    clean(result);
  }
  const result = await createGroqProvider(
    config,
    capabilities,
    async () => new Response("{body-secret")
  ).generateCompletion(input);
  assert.equal(result.error.category, "validation");
  clean(result);
});

for (const [status, category] of [
  [401, "authentication"],
  [403, "authentication"],
  [429, "rate_limit"],
  [400, "api_error"],
  [500, "api_error"]
]) {
  test(`HTTP ${status} safely normalizes sync and stream`, async () => {
    const provider = createGroqProvider(
      config,
      capabilities,
      async () => new Response("body-secret", { status })
    );
    const sync = await provider.generateCompletion(input);
    assert.equal(sync.error.category, category);
    const events = await eventsFor(provider);
    terminal(events, "failure");
    assert.equal(events[0].error.category, category);
    clean(sync);
    clean(events);
  });
}

test("request timeout, stream body timeout, network and reader errors are safe", async () => {
  const timeout = createGroqProvider(
    { ...config, timeoutMs: 5 },
    capabilities,
    async () => new Promise(() => {})
  );
  const timed = await timeout.generateCompletion(input);
  assert.equal(timed.error.category, "timeout");
  clean(timed);
  const network = createGroqProvider(config, capabilities, async () => {
    const error = new Error("api-key-secret request-secret");
    error.stack = "stack-secret";
    throw error;
  });
  const failed = await network.generateCompletion(input);
  assert.equal(failed.error.category, "unknown");
  clean(failed);
  const broken = createGroqProvider(
    config,
    capabilities,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.error(new Error("body-secret stack-secret"));
          }
        })
      )
  );
  const brokenEvents = await eventsFor(broken);
  terminal(brokenEvents, "failure");
  clean(brokenEvents);
  const streamNetwork = await eventsFor(network);
  terminal(streamNetwork, "failure");
  assert.equal(streamNetwork[0].error.category, "unknown");
  clean(streamNetwork);
  let cancelled = false;
  const bodyTimeout = createGroqProvider(
    { ...config, timeoutMs: 5 },
    capabilities,
    async () =>
      new Response(
        new ReadableStream({
          start() {},
          cancel() {
            cancelled = true;
          }
        })
      )
  );
  const timeoutEvents = await eventsFor(bodyTimeout);
  terminal(timeoutEvents, "failure");
  assert.equal(timeoutEvents[0].error.category, "timeout");
  assert.equal(cancelled, true);
});

test("invalid config, request, and URL avoid network", async () => {
  let calls = 0;
  const fetcher = async () => {
    calls++;
    return json(completion());
  };
  const cases = [
    [{}, input],
    [{ auth: { apiKey: "api-key-secret", token: "token-secret" } }, input],
    [{ auth: { apiKey: " ", token: "token-secret" } }, input],
    [{ auth: { apiKey: 42 } }, input],
    [{ auth: { apiKey: "api-key-secret\nrequest-secret" } }, input],
    [{ ...config, baseUrl: "https://user:password@proxy.example/v1" }, input],
    [{ ...config, baseUrl: "https://proxy.example/v1?key=url-secret" }, input],
    [{ ...config, baseUrl: "https://proxy.example/v1?" }, input],
    [{ ...config, baseUrl: "https://proxy.example/v1#url-secret" }, input],
    [{ ...config, baseUrl: "https://proxy.example/v1#" }, input],
    [{ ...config, baseUrl: "javascript:request-secret" }, input],
    [config, { ...input, model: " " }],
    [config, { ...input, messages: [] }],
    [
      config,
      { ...input, messages: [{ role: "tool", content: "body-secret" }] }
    ],
    [config, { ...input, messages: [{ role: "user", content: " " }] }],
    [config, { ...input, options: { maxTokens: 0 } }],
    [config, { ...input, options: { temperature: -1 } }],
    [config, { ...input, options: { temperature: 3 } }],
    [config, { ...input, options: { topP: 2 } }]
  ];
  for (const [settings, request] of cases) {
    const provider = createGroqProvider(settings, capabilities, fetcher);
    const sync = await provider.generateCompletion(request);
    assert.equal(sync.success, false);
    const stream = await eventsFor(provider, request);
    terminal(stream, "failure");
    clean(sync);
    clean(stream);
  }
  assert.equal(calls, 0);
});

test("SSE handles split UTF-8, JSON, CRLF, comments, multiple frames, stop, DONE, and cleanup", async () => {
  const payload =
    ": comment\r\n\r\n" +
    frame(
      chunk(undefined, null, { role: "assistant", reasoning: "body-secret" }),
      "\r\n"
    ) +
    frame(chunk("hé"), "\r\n") +
    frame(chunk("llo")) +
    frame(chunk("", "stop", { tool_calls: undefined })) +
    done();
  const bytes = new TextEncoder().encode(payload);
  const split = bytes.indexOf(0xc3) + 1;
  let response;
  let signal;
  const provider = createGroqProvider(
    { ...config, timeoutMs: 100 },
    capabilities,
    async (url, init) => {
      assert.equal(url, "https://api.groq.com/openai/v1/chat/completions");
      assert.deepEqual(JSON.parse(init.body), {
        model: input.model,
        messages: input.messages,
        stream: true,
        max_completion_tokens: 25,
        temperature: 0,
        top_p: 0.7
      });
      signal = init.signal;
      response = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(bytes.slice(0, 7));
            controller.enqueue(bytes.slice(7, split));
            controller.enqueue(bytes.slice(split, split + 4));
            controller.enqueue(bytes.slice(split + 4));
          }
        })
      );
      return response;
    }
  );
  const events = await eventsFor(provider);
  assert.deepEqual(events, [
    { type: "content", delta: "hé" },
    { type: "content", delta: "llo" },
    {
      type: "complete",
      response: { success: true, role: "assistant", content: "héllo" }
    }
  ]);
  assert.equal(response.body.locked, false);
  await delay(130);
  assert.equal(signal.aborted, false);
  clean(events);
});

test("terminal chunk may carry final text; empty content is a valid completion", async () => {
  const withLast = createGroqProvider(
    config,
    capabilities,
    async () =>
      new Response(
        frame(chunk("first")) + frame(chunk("last", "stop")) + done()
      )
  );
  assert.deepEqual(await eventsFor(withLast), [
    { type: "content", delta: "first" },
    { type: "content", delta: "last" },
    {
      type: "complete",
      response: { success: true, role: "assistant", content: "firstlast" }
    }
  ]);
  const empty = createGroqProvider(
    config,
    capabilities,
    async () =>
      new Response(frame(chunk("")) + frame(chunk(undefined, "stop")) + done())
  );
  assert.deepEqual(await eventsFor(empty), [
    {
      type: "complete",
      response: { success: true, role: "assistant", content: "" }
    }
  ]);
});

for (const payload of [
  done(),
  frame(chunk("partial")) + done(),
  frame(chunk("partial", "stop")),
  frame(chunk("partial", "length")) + done(),
  frame(chunk("partial", "content_filter")) + done(),
  frame(chunk("partial", "tool_calls")) + done(),
  frame(chunk("first", "stop")) + frame(chunk("late")) + done(),
  frame(chunk("first", "stop")) + frame(chunk("again", "stop")) + done(),
  frame({ choices: [] }) + done(),
  frame({ choices: [{ delta: { content: 5 }, finish_reason: "stop" }] }) +
    done(),
  frame({
    choices: [
      { delta: { role: "user", content: "body-secret" }, finish_reason: "stop" }
    ]
  }) + done(),
  "data: {body-secret\n\n",
  "data: \xff\n\n"
]) {
  test("stream malformed, incomplete, or abnormal terminal yields one safe failure", async () => {
    const provider = createGroqProvider(
      config,
      capabilities,
      async () => new Response(payload)
    );
    const events = await eventsFor(provider);
    terminal(events, "failure");
    clean(events.at(-1));
  });
}

test("invalid frame cancels an open stream and emits no late content", async () => {
  let cancelled = false;
  const provider = createGroqProvider(
    config,
    capabilities,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode("data: {body-secret\n\n")
            );
          },
          cancel() {
            cancelled = true;
          }
        })
      )
  );
  const events = await eventsFor(provider);
  terminal(events, "failure");
  assert.equal(events.length, 1);
  assert.equal(cancelled, true);
  clean(events);
});

test("invalid UTF-8 in SSE produces one safe failure", async () => {
  const provider = createGroqProvider(
    config,
    capabilities,
    async () =>
      new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(
              new Uint8Array([
                0x64, 0x61, 0x74, 0x61, 0x3a, 0x20, 0xc3, 0x28, 0x0a, 0x0a
              ])
            );
            controller.close();
          }
        })
      )
  );
  const events = await eventsFor(provider);
  terminal(events, "failure");
  clean(events);
});

test("Groq adapter works through unchanged Workspace and Agent sync and stream paths", async () => {
  const registry = new DefaultProviderRegistry();
  registry.registerProvider(
    createGroqProvider(config, capabilities, async (_url, init) =>
      JSON.parse(init.body).stream
        ? new Response(
            frame(chunk("part")) + frame(chunk("answer", "stop")) + done()
          )
        : json(completion())
    )
  );
  const workspace = createWorkspace({
    providerRegistry: registry,
    providerId: "groq",
    model: input.model,
    conversationId: "groq-test",
    conversationTitle: "Test"
  });
  const sync = await workspace.execute({ id: "sync", prompt: "Hello" });
  assert.equal(sync.content, "answer");
  const streamed = [];
  for await (const event of workspace.executeStream({
    id: "stream",
    prompt: "Again"
  }))
    streamed.push(event);
  assert.equal(
    streamed.find((event) => event.type === "content")?.delta,
    "part"
  );
  assert.equal(streamed.at(-1).response.content, "partanswer");
});
