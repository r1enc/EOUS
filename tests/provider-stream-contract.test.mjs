import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom"
});
after(async () => vite.close());

const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/index.ts"
);
const { createWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createWorkspace.ts"
);

const request = {
  model: "test-model",
  messages: [{ role: "user", content: "Hello" }]
};

function makeProvider(id = "test-provider") {
  return {
    id,
    name: "Test Provider",
    capabilities: {
      contextWindow: 4096,
      supportsSystemInstructions: true,
      supportsFunctionCalling: false,
      supportsVision: false
    },
    async generateCompletion(input) {
      assert.deepEqual(input, request);
      return { success: true, role: "assistant", content: "Plain response" };
    }
  };
}

test("non-streaming Provider remains registrable and works through Agent", async () => {
  const registry = new DefaultProviderRegistry();
  registry.registerProvider(makeProvider());
  const provider = registry.getProvider("test-provider");
  assert.equal(typeof provider.streamCompletion, "undefined");
  assert.deepEqual(await provider.generateCompletion(request), {
    success: true,
    role: "assistant",
    content: "Plain response"
  });

  const workspace = createWorkspace({
    providerRegistry: registry,
    providerId: "test-provider",
    model: request.model,
    conversationId: "conversation-1",
    conversationTitle: "Test"
  });
  assert.deepEqual(await workspace.execute({ id: "turn-1", prompt: "Hello" }), {
    id: "turn-1",
    content: "Plain response",
    status: "success"
  });
});

test("streaming Provider yields ordered deltas and authoritative completion", async () => {
  const provider = {
    ...makeProvider(),
    async *streamCompletion(input) {
      assert.deepEqual(input, request);
      yield { type: "content", delta: "Hel" };
      yield { type: "content", delta: "" };
      yield { type: "content", delta: "lo" };
      yield {
        type: "complete",
        response: {
          success: true,
          role: "assistant",
          content: "Hello!"
        }
      };
    }
  };
  const registry = new DefaultProviderRegistry();
  registry.registerProvider(provider);
  const retrieved = registry.getProvider(provider.id);
  assert.equal(typeof retrieved.streamCompletion, "function");
  assert.equal(retrieved.streamCompletion, provider.streamCompletion);

  const events = [];
  for await (const event of retrieved.streamCompletion(request))
    events.push(event);
  assert.deepEqual(
    events.map((event) => event.type),
    ["content", "content", "content", "complete"]
  );
  assert.deepEqual(
    events.slice(0, -1).map((event) => event.delta),
    ["Hel", "", "lo"]
  );
  assert.equal(
    events
      .slice(0, -1)
      .map((event) => event.delta)
      .join(""),
    "Hello"
  );
  assert.deepEqual(events.at(-1).response, {
    success: true,
    role: "assistant",
    content: "Hello!"
  });
  assert.deepEqual(await retrieved.generateCompletion(request), {
    success: true,
    role: "assistant",
    content: "Plain response"
  });
});

test("stream may complete with zero chunks and empty final content", async () => {
  const provider = {
    ...makeProvider(),
    async *streamCompletion() {
      yield {
        type: "complete",
        response: { success: true, role: "assistant", content: "" }
      };
    }
  };
  const events = [];
  for await (const event of provider.streamCompletion(request))
    events.push(event);
  assert.deepEqual(events, [
    {
      type: "complete",
      response: { success: true, role: "assistant", content: "" }
    }
  ]);
});

test("stream failure is terminal and retains the ProviderError shape", async () => {
  const error = {
    code: "PROVIDER_UNAVAILABLE",
    message: "Temporarily unavailable",
    category: "api_error"
  };
  const provider = {
    ...makeProvider(),
    async *streamCompletion() {
      yield { type: "content", delta: "Partial" };
      yield { type: "failure", error };
    }
  };
  const events = [];
  for await (const event of provider.streamCompletion(request))
    events.push(event);
  assert.deepEqual(
    events.map((event) => event.type),
    ["content", "failure"]
  );
  assert.deepEqual(events.at(-1).error, error);
  assert.deepEqual(Object.keys(events.at(-1)).sort(), ["error", "type"]);
});
