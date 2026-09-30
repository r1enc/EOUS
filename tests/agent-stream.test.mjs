import assert from "node:assert/strict";
import { after, test } from "node:test";
import { setImmediate } from "node:timers/promises";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true, hmr: false },
  appType: "custom"
});
after(async () => vite.close());

const { DefaultAgent } = await vite.ssrLoadModule("/src/agent/index.ts");
const { DefaultToolSdkRuntime } = await vite.ssrLoadModule(
  "/src/execution/tool-sdk/index.ts"
);
const { DefaultPermissionManager } = await vite.ssrLoadModule(
  "/src/permission/index.ts"
);
const { createBuiltInTools } = await vite.ssrLoadModule(
  "/src/tools/builtin/index.ts"
);

const request = { id: "turn", prompt: "Read document" };
const complete = (content) => ({
  type: "complete",
  response: { success: true, role: "assistant", content }
});

function provider(stream, synchronous = "Synchronous answer") {
  const calls = { stream: [], completion: [] };
  return {
    calls,
    id: "provider",
    name: "Provider",
    capabilities: {
      contextWindow: 4096,
      supportsSystemInstructions: true,
      supportsFunctionCalling: false,
      supportsVision: false
    },
    async generateCompletion(input) {
      calls.completion.push(input);
      return { success: true, role: "assistant", content: synchronous };
    },
    ...(stream && {
      streamCompletion(input) {
        calls.stream.push(input);
        return stream(input, calls.stream.length);
      }
    })
  };
}

function plan(action = "pdf-reader", input = { filePath: "document.pdf" }) {
  const now = new Date().toISOString();
  return {
    id: "plan",
    status: "planned",
    createdAt: now,
    updatedAt: now,
    steps: [{ id: "step", action, input, status: "pending" }]
  };
}

function agent(source, planner, decide) {
  const permissions = new DefaultPermissionManager(decide);
  const tools = new DefaultToolSdkRuntime((input, required, approval) =>
    permissions.consumeApproval(input, required, approval)
  );
  for (const tool of createBuiltInTools()) tools.register(tool);
  return {
    runtime: new DefaultAgent(
      "agent",
      "Agent",
      source,
      "model",
      tools,
      planner,
      permissions
    ),
    permissions
  };
}

async function collect(stream) {
  const events = [];
  for await (const event of stream) events.push(event);
  return events;
}

test("no-planner stream preserves ordered deltas and authoritative completion", async () => {
  const source = provider(async function* () {
    yield { type: "content", delta: "Hel" };
    yield { type: "content", delta: "" };
    yield { type: "content", delta: "lo" };
    yield complete("Hello!");
  });
  const { runtime } = agent(source);
  const events = await collect(runtime.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["content", "content", "content", "complete"]
  );
  assert.deepEqual(
    events.slice(0, -1).map((event) => event.delta),
    ["Hel", "", "lo"]
  );
  assert.equal(events.at(-1).response.content, "Hello!");
  assert.equal(source.calls.stream.length, 1);
  assert.equal(source.calls.completion.length, 0);

  assert.equal((await runtime.execute(request)).content, "Synchronous answer");
  assert.equal(source.calls.completion.length, 1);
  assert.equal(source.calls.stream.length, 1);
});

test("non-streaming Provider falls back without artificial deltas", async () => {
  const source = provider();
  const { runtime } = agent(source);
  const events = await collect(runtime.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["complete"]
  );
  assert.equal(events[0].response.content, "Synchronous answer");
  assert.equal(source.calls.completion.length, 1);
});

test("non-streaming Provider failure is one terminal failure", async () => {
  const source = provider();
  source.generateCompletion = async () => ({
    success: false,
    error: { code: "OFFLINE", message: "Unavailable", category: "api_error" }
  });
  const events = await collect(agent(source).runtime.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["failure"]
  );
  assert.equal(events[0].response.error.code, "OFFLINE");
});

test("planner buffers initial content until a null decision", async () => {
  const source = provider(async function* () {
    yield { type: "content", delta: "Draft" };
    yield complete("Authoritative answer");
  });
  let release;
  const planner = {
    async plan(_request, reasoning) {
      assert.equal(reasoning, "Authoritative answer");
      await new Promise((resolve) => {
        release = resolve;
      });
      return null;
    }
  };
  const { runtime } = agent(source, planner);
  const iterator = runtime.executeStream(request)[Symbol.asyncIterator]();
  let settled = false;
  const first = iterator.next().then((value) => {
    settled = true;
    return value;
  });
  while (!release) await setImmediate();
  assert.equal(settled, false);
  release();
  assert.deepEqual((await first).value, { type: "content", delta: "Draft" });
  assert.equal(
    (await iterator.next()).value.response.content,
    "Authoritative answer"
  );
  assert.equal((await iterator.next()).done, true);
});

test("invalid initial planner stream never exposes buffered content", async () => {
  const source = provider(async function* () {
    yield { type: "content", delta: "Private planning text" };
  });
  let plannerCalls = 0;
  const { runtime } = agent(source, {
    async plan() {
      plannerCalls++;
      return null;
    }
  });
  const events = await collect(runtime.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["failure"]
  );
  assert.equal(events[0].response.error.code, "AGENT_EXECUTION_FAILED");
  assert.equal(plannerCalls, 0);
});

test("planned tools hide initial stream and expose only final synthesis", async () => {
  const source = provider(async function* (_input, call) {
    if (call === 1) {
      yield { type: "content", delta: "Private planning text" };
      yield complete("Plan the tool");
    } else {
      yield { type: "content", delta: "Final" };
      yield complete("Final answer!");
    }
  });
  const { runtime, permissions } = agent(
    source,
    {
      async plan(_request, reasoning) {
        assert.equal(reasoning, "Plan the tool");
        return plan();
      }
    },
    async (approval) => ({ requestId: approval.id, decision: "granted" })
  );
  const events = await collect(runtime.executeStream(request));
  assert.deepEqual(
    events.map((event) => event.type),
    ["content", "complete"]
  );
  assert.equal(events[0].delta, "Final");
  assert.equal(events[1].response.content, "Final answer!");
  assert.equal(events[1].response.plan.steps[0].status, "completed");
  assert.match(
    source.calls.stream[1].messages.at(-1).content,
    /Simulated PDF Content/
  );
  assert.equal(permissions.getHistory()[0].response.decision, "granted");
});

test("permission rejection and tool failure produce only terminal failures", async () => {
  for (const [input, decision, code] of [
    [{ filePath: "document.pdf" }, "denied", "PERMISSION_DENIED"],
    [{ filePath: "document.txt" }, "granted", "invalid_file_type"]
  ]) {
    const source = provider(async function* () {
      yield { type: "content", delta: "Private" };
      yield complete("Plan");
    });
    const { runtime } = agent(
      source,
      {
        async plan() {
          return plan("pdf-reader", input);
        }
      },
      async (approval) => ({ requestId: approval.id, decision })
    );
    const events = await collect(runtime.executeStream(request));
    assert.deepEqual(
      events.map((event) => event.type),
      ["failure"]
    );
    assert.equal(events[0].response.error.code, code);
    assert.equal(source.calls.stream.length, 1);
  }
});

test("provider failure is preserved and malformed streams are sanitized", async () => {
  const expected = provider(async function* () {
    yield { type: "content", delta: "Partial" };
    yield {
      type: "failure",
      error: {
        code: "RATE_LIMIT",
        message: "Try later",
        category: "rate_limit"
      }
    };
  });
  const expectedEvents = await collect(
    agent(expected).runtime.executeStream(request)
  );
  assert.deepEqual(
    expectedEvents.map((event) => event.type),
    ["content", "failure"]
  );
  assert.equal(expectedEvents[1].response.error.code, "RATE_LIMIT");

  const malformed = [
    () => {
      throw new Error("secret provider constructor");
    },
    async function* () {
      yield { type: "content", delta: "Partial" };
      throw new Error("secret adapter path");
    },
    async function* () {
      yield { type: "content", delta: "Partial" };
    },
    async function* () {
      yield complete("Done");
      yield complete("Again");
    },
    async function* () {
      yield complete("Done");
      yield { type: "content", delta: "Late" };
    },
    async function* () {
      yield { type: "content", delta: 42 };
    },
    async function* () {
      yield {
        type: "failure",
        error: { code: "X", message: "Failed", category: "unknown" }
      };
      yield complete("Invalid success");
    }
  ];
  for (const stream of malformed) {
    const events = await collect(
      agent(provider(stream)).runtime.executeStream(request)
    );
    assert.equal(events.at(-1).type, "failure");
    assert.equal(events.at(-1).response.error.code, "AGENT_EXECUTION_FAILED");
    assert.doesNotMatch(
      events.at(-1).response.error.message,
      /secret|adapter|path/i
    );
    assert.equal(events.filter((event) => event.type === "complete").length, 0);
  }
});
