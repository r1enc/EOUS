import assert from "node:assert/strict";
import { after, test } from "node:test";
import { createServer } from "vite";

const vite = await createServer({
  server: { middlewareMode: true },
  appType: "custom"
});
after(async () => vite.close());

const { createWorkspace } = await vite.ssrLoadModule(
  "/src/workspace/createWorkspace.ts"
);
const { DefaultProviderRegistry } = await vite.ssrLoadModule(
  "/src/intelligence/provider-sdk/index.ts"
);
const {
  DefaultToolRegistry,
  DefaultToolSdkRuntime,
  ToolExecutor,
  validateCompatibility
} = await vite.ssrLoadModule("/src/execution/tool-sdk/index.ts");
const { BUILTIN_TOOLS, PdfReaderTool, createBuiltInTools } =
  await vite.ssrLoadModule("/src/tools/builtin/index.ts");
const { DefaultPermissionManager } = await vite.ssrLoadModule(
  "/src/permission/index.ts"
);
const { DefaultAgent } = await vite.ssrLoadModule("/src/agent/index.ts");
const { DefaultConversation } = await vite.ssrLoadModule(
  "/src/conversation/index.ts"
);

function makeProvider(calls) {
  return {
    id: "test-provider",
    name: "Test Provider",
    capabilities: {
      contextWindow: 4096,
      supportsSystemInstructions: true,
      supportsFunctionCalling: false,
      supportsVision: false
    },
    async generateCompletion(request) {
      calls.push(request);
      return {
        success: true,
        role: "assistant",
        content: calls.length === 1 ? "Reasoning" : "The result is 4."
      };
    }
  };
}

function makePlanner(action, input) {
  return {
    async plan() {
      const now = new Date().toISOString();
      return {
        id: "plan-1",
        status: "planned",
        createdAt: now,
        updatedAt: now,
        steps: [{ id: "step-1", action, input, status: "pending" }]
      };
    }
  };
}

function makeWorkspace(planner, calls, approvePermission) {
  const providerRegistry = new DefaultProviderRegistry();
  providerRegistry.registerProvider(makeProvider(calls));
  return createWorkspace({
    providerRegistry,
    providerId: "test-provider",
    model: "test-model",
    conversationId: "conversation-1",
    conversationTitle: "Test",
    planner,
    approvePermission
  });
}

test("Conversation delegates through Agent and SDK for a permitted tool", async () => {
  const calls = [];
  const conversation = makeWorkspace(
    makePlanner("calculator", { expression: "2+2" }),
    calls
  );
  const response = await conversation.execute({
    id: "request-1",
    prompt: "Calculate 2+2"
  });
  assert.equal(response.status, "success");
  assert.equal(response.content, "The result is 4.");
  assert.equal(calls.length, 2);
  assert.equal(calls[0].messages.at(-1).content, "Calculate 2+2");
  assert.match(calls[1].messages.at(-1).content, /"result":4/);
  assert.equal(conversation.getHistory().length, 2);
});

test("permission-required tools fail before execution", async () => {
  const calls = [];
  const conversation = makeWorkspace(
    makePlanner("text-reader", { filePath: "secret.txt" }),
    calls
  );
  const response = await conversation.execute({
    id: "request-2",
    prompt: "Read a file"
  });
  assert.equal(response.status, "failure");
  assert.equal(response.error.code, "PERMISSION_REQUIRED");
  assert.equal(calls.length, 1);
  assert.equal(conversation.getHistory().length, 0);
  assert.equal(conversation.getPermissionHistory().length, 1);
  assert.equal(conversation.getPermissionHistory()[0].response, undefined);
});

test("provider-only turns retain conversation context without a planner", async () => {
  const calls = [];
  const conversation = makeWorkspace(undefined, calls);
  const first = await conversation.execute({
    id: "request-3",
    prompt: "Hello"
  });
  const second = await conversation.execute({
    id: "request-4",
    prompt: "Continue"
  });
  assert.equal(first.status, "success");
  assert.equal(second.status, "success");
  assert.equal(calls.length, 2);
  assert.deepEqual(
    calls[1].messages.map((message) => message.role),
    ["user", "assistant", "user"]
  );
  assert.equal(conversation.getHistory().length, 4);
});

test("SDK validates registration, input, permission, and thrown tool errors", async () => {
  const sdk = new DefaultToolSdkRuntime();
  for (const tool of BUILTIN_TOOLS) sdk.register(tool);
  assert.equal(sdk.listManifests().length, 4);
  assert.equal(validateCompatibility("1.0.0"), null);
  assert.notEqual(validateCompatibility("1.0")?.code, undefined);
  assert.throws(() => sdk.register(BUILTIN_TOOLS[0]), /already registered/);

  const discovered = sdk
    .listManifests()
    .find((tool) => tool.id === "pdf-reader");
  discovered.requiredPermissions.length = 0;

  const invalid = await sdk.execute({ toolId: "calculator", input: {} });
  assert.equal(invalid.success, false);
  assert.equal(invalid.error.category, "validation");

  const blocked = await sdk.execute({
    toolId: "pdf-reader",
    input: { filePath: "file.pdf" }
  });
  assert.equal(blocked.success, false);
  assert.equal(blocked.error.category, "permission");

  sdk.register({
    manifest: {
      id: "throwing-tool",
      name: "Throwing Tool",
      description: "Tests failure isolation",
      sdkVersion: "1.0.0",
      toolVersion: "1.0.0",
      capabilities: [],
      requiredPermissions: [],
      input: {},
      output: {},
      dependencies: []
    },
    async execute() {
      throw new Error("isolated failure");
    }
  });
  const failed = await sdk.execute({ toolId: "throwing-tool", input: {} });
  assert.equal(failed.success, false);
  assert.equal(failed.error.category, "execution");
  const succeeded = await sdk.execute({
    toolId: "calculator",
    input: { expression: "3+3" }
  });
  assert.equal(succeeded.success, true);
  assert.equal(succeeded.output.result, 6);
});

test("approval pauses execution, records the decision, then reaches the tool", async () => {
  let resolveApproval;
  let notifyRequested;
  const requested = new Promise((resolve) => {
    notifyRequested = resolve;
  });
  const permissions = new DefaultPermissionManager((request) => {
    notifyRequested(request);
    return new Promise((resolve) => {
      resolveApproval = resolve;
    });
  });
  const sdk = new DefaultToolSdkRuntime((request, required, approval) =>
    permissions.consumeApproval(request, required, approval)
  );
  let executions = 0;
  sdk.register({
    manifest: { ...BUILTIN_TOOLS[2].manifest },
    async execute() {
      executions++;
      assert.equal(permissions.getHistory()[0].response.decision, "granted");
      return { success: true, output: { content: "document content" } };
    }
  });
  const calls = [];
  const agent = new DefaultAgent(
    "test",
    "Test",
    makeProvider(calls),
    "test-model",
    sdk,
    makePlanner("pdf-reader", { filePath: "document.pdf" }),
    permissions
  );
  const conversation = new DefaultConversation("conversation-1", "Test", agent);
  const pending = conversation.execute({
    id: "approval-turn",
    prompt: "Read the document"
  });
  const permissionRequest = await requested;
  assert.equal(executions, 0);
  assert.equal(calls.length, 1);
  assert.equal(permissions.getHistory()[0].response, undefined);
  assert.equal(
    permissionRequest.permission.context.input.filePath,
    "document.pdf"
  );
  resolveApproval({ requestId: permissionRequest.id, decision: "granted" });
  assert.equal((await pending).status, "success");
  assert.equal(executions, 1);
  assert.equal(calls.length, 2);
});

test("Presentation approval handler allows a built-in and exposes immutable session records", async () => {
  const calls = [];
  const workspace = makeWorkspace(
    makePlanner("pdf-reader", { filePath: "document.pdf" }),
    calls,
    async (request) => ({ requestId: request.id, decision: "granted" })
  );
  assert.equal(
    (await workspace.execute({ id: "approved", prompt: "Read PDF" })).status,
    "success"
  );
  assert.match(calls[1].messages.at(-1).content, /Simulated PDF Content/);
  const records = workspace.getPermissionHistory();
  assert.equal(records[0].response.decision, "granted");
  records[0].response.decision = "denied";
  assert.equal(
    workspace.getPermissionHistory()[0].response.decision,
    "granted"
  );
});

test("explicit denial is recorded and prevents execution and final synthesis", async () => {
  const calls = [];
  const workspace = makeWorkspace(
    makePlanner("pdf-reader", { filePath: "document.pdf" }),
    calls,
    async (request) => ({ requestId: request.id, decision: "denied" })
  );
  const result = await workspace.execute({ id: "denied", prompt: "Read PDF" });
  assert.equal(result.error.code, "PERMISSION_DENIED");
  assert.equal(result.error.message, "Permission 'read_file' was denied");
  assert.equal(calls.length, 1);
  assert.equal(workspace.getPermissionHistory()[0].response.decision, "denied");
});

test("mismatched and failed approval handlers fail closed", async () => {
  for (const handler of [
    async () => ({ requestId: "wrong-id", decision: "granted" }),
    async () => ({ requestId: "wrong-id", decision: "allow" }),
    async () => {
      throw new Error("dialog unavailable");
    }
  ]) {
    const calls = [];
    const workspace = makeWorkspace(
      makePlanner("pdf-reader", { filePath: "document.pdf" }),
      calls,
      handler
    );
    const result = await workspace.execute({
      id: "invalid-approval",
      prompt: "Read PDF"
    });
    assert.equal(result.status, "failure");
    assert.equal(calls.length, 1);
    assert.equal(workspace.getPermissionHistory()[0].response, undefined);
  }
});

test("SDK accepts only an exact, single-use approval from its session manager", async () => {
  const manager = new DefaultPermissionManager(async (request) => ({
    requestId: request.id,
    decision: "granted"
  }));
  const sdk = new DefaultToolSdkRuntime((request, required, approval) =>
    manager.consumeApproval(request, required, approval)
  );
  sdk.register(BUILTIN_TOOLS[2]);
  const request = { toolId: "pdf-reader", input: { filePath: "document.pdf" } };
  const approval = await manager.approve(request, [
    { permissionId: "read_file" }
  ]);
  assert.equal((await sdk.execute(request, {})).success, false);
  assert.equal((await sdk.execute(request, approval)).success, true);
  assert.equal((await sdk.execute(request, approval)).success, false);

  const changed = { toolId: "pdf-reader", input: { filePath: "document.pdf" } };
  const changedApproval = await manager.approve(changed, [
    { permissionId: "read_file" }
  ]);
  changed.input.filePath = "different.pdf";
  assert.equal((await sdk.execute(changed, changedApproval)).success, false);
});

test("invalid manifests and requests are rejected without running tools or prompting", async () => {
  const sdk = new DefaultToolSdkRuntime();
  let executions = 0;
  const tool = {
    manifest: { ...BUILTIN_TOOLS[0].manifest, sdkVersion: "1.0" },
    async execute() {
      executions++;
    }
  };
  assert.throws(() => sdk.register(tool));
  assert.equal(sdk.listManifests().length, 0);
  sdk.register(BUILTIN_TOOLS[0]);
  for (const input of [{}, { expression: undefined }, { expression: 2 }]) {
    assert.equal(
      (await sdk.execute({ toolId: "calculator", input })).success,
      false
    );
  }
  assert.equal((await sdk.execute(null)).success, false);
  assert.equal(executions, 0);

  const calls = [];
  let approvals = 0;
  const workspace = makeWorkspace(
    makePlanner("pdf-reader", {}),
    calls,
    async () => {
      approvals++;
    }
  );
  assert.equal(
    (await workspace.execute({ id: "invalid", prompt: "Read PDF" })).status,
    "failure"
  );
  assert.equal(approvals, 0);
});

test("tool failures return through Agent and Conversation without affecting the next turn", async () => {
  let expression = "1/0";
  const calls = [];
  const planner = {
    plan: (...args) => makePlanner("calculator", { expression }).plan(...args)
  };
  const workspace = makeWorkspace(planner, calls);
  const failed = await workspace.execute({
    id: "failed-tool",
    prompt: "Calculate"
  });
  assert.equal(failed.status, "failure");
  assert.equal(failed.error.code, "evaluation_failed");
  assert.equal(calls.length, 1);
  expression = "2+2";
  assert.equal(
    (await workspace.execute({ id: "next-turn", prompt: "Calculate" })).status,
    "success"
  );
});

test("all required permissions must be granted for the current execution", async () => {
  const manager = new DefaultPermissionManager(async (request) => ({
    requestId: request.id,
    decision: request.permission.id === "read_file" ? "granted" : "denied"
  }));
  await assert.rejects(
    manager.approve({ toolId: "test", input: {} }, [
      { permissionId: "read_file" },
      { permissionId: "network" }
    ]),
    /denied/
  );
  assert.deepEqual(
    manager.getHistory().map((entry) => entry.response.decision),
    ["granted", "denied"]
  );
});

test("workspace selects interchangeable Providers exclusively through ProviderRegistry", async () => {
  const registry = new DefaultProviderRegistry();
  for (const id of ["first", "second"]) {
    registry.registerProvider({
      ...makeProvider([]),
      id,
      async generateCompletion() {
        return { success: true, role: "assistant", content: id };
      }
    });
    const workspace = createWorkspace({
      providerRegistry: registry,
      providerId: id,
      model: "test",
      conversationId: id,
      conversationTitle: id
    });
    assert.equal(
      (await workspace.execute({ id: "request", prompt: "Hello" })).content,
      id
    );
  }
});

test("tool-produced output reaches the Workspace caller through final Provider synthesis", async () => {
  const calls = [];
  const registry = new DefaultProviderRegistry();
  registry.registerProvider({
    ...makeProvider([]),
    async generateCompletion(request) {
      calls.push(request);
      if (calls.length === 1)
        return { success: true, role: "assistant", content: "Calculate" };
      const result = request.messages.at(-1).content.match(/"result":(\d+)/);
      assert.ok(result, "final synthesis receives the actual SDK tool output");
      return {
        success: true,
        role: "assistant",
        content: `Calculated ${result[1]}`
      };
    }
  });
  const workspace = createWorkspace({
    providerRegistry: registry,
    providerId: "test-provider",
    model: "test-model",
    conversationId: "derived-result",
    conversationTitle: "Derived result",
    planner: makePlanner("calculator", { expression: "7*8" })
  });
  const response = await workspace.execute({
    id: "derived-result-turn",
    prompt: "Calculate 7*8"
  });
  assert.equal(response.status, "success");
  assert.equal(response.content, "Calculated 56");
  assert.equal(workspace.getHistory().at(-1).content, "Calculated 56");
  assert.equal(calls.length, 2);
});

test("Provider failures at reasoning and final synthesis return through Workspace and allow recovery", async () => {
  for (const failedCall of [1, 2]) {
    let call = 0;
    const registry = new DefaultProviderRegistry();
    registry.registerProvider({
      ...makeProvider([]),
      async generateCompletion() {
        call++;
        if (call === failedCall)
          return {
            success: false,
            error: {
              code: "PROVIDER_UNAVAILABLE",
              message: "Temporary failure"
            }
          };
        return { success: true, role: "assistant", content: "Recovered" };
      }
    });
    const workspace = createWorkspace({
      providerRegistry: registry,
      providerId: "test-provider",
      model: "test-model",
      conversationId: `provider-failure-${failedCall}`,
      conversationTitle: "Provider failure",
      planner: makePlanner("calculator", { expression: "2+2" })
    });
    const failed = await workspace.execute({
      id: `provider-failed-${failedCall}`,
      prompt: "Calculate"
    });
    assert.equal(failed.status, "failure");
    assert.equal(failed.error.code, "PROVIDER_UNAVAILABLE");
    assert.equal(failed.error.message, "Temporary failure");
    assert.equal(workspace.getHistory().length, 0);
    assert.equal(call, failedCall);
    const recovered = await workspace.execute({
      id: `provider-recovered-${failedCall}`,
      prompt: "Calculate again"
    });
    assert.equal(recovered.status, "success");
    assert.equal(workspace.getHistory().length, 2);
  }
});

test("planner exceptions, invalid plans, and unknown tools fail through Workspace without poisoning later turns", async () => {
  const invalidPlan = await makePlanner("calculator", {
    expression: "2+2"
  }).plan();
  invalidPlan.steps[0].id = "";
  const cases = [
    {
      planner: {
        async plan() {
          throw new Error("planner failed");
        }
      },
      code: "AGENT_EXECUTION_FAILED"
    },
    {
      planner: {
        async plan() {
          return invalidPlan;
        }
      },
      code: "invalid_step_id"
    },
    { planner: makePlanner("unknown-tool", {}), code: "TOOL_NOT_FOUND" }
  ];
  for (const { planner, code } of cases) {
    let shouldFail = true;
    const workspace = makeWorkspace(
      {
        async plan(...args) {
          return shouldFail
            ? planner.plan(...args)
            : makePlanner("calculator", { expression: "2+2" }).plan(...args);
        }
      },
      []
    );
    const failed = await workspace.execute({
      id: `failed-${code}`,
      prompt: "Run"
    });
    assert.equal(failed.status, "failure");
    assert.equal(failed.error.code, code);
    assert.equal(workspace.getHistory().length, 0);
    shouldFail = false;
    const recovered = await workspace.execute({
      id: `recovered-${code}`,
      prompt: "Run again"
    });
    assert.equal(recovered.status, "success");
    assert.equal(workspace.getHistory().length, 2);
  }
});

test("public Registry lookup cannot change metadata governing SDK validation and permission", async () => {
  const registry = new DefaultToolRegistry();
  registry.register(
    BUILTIN_TOOLS.find((tool) => tool.manifest.id === "pdf-reader")
  );
  const exposed = registry.get("pdf-reader");
  exposed.manifest.requiredPermissions.length = 0;
  exposed.manifest.sdkVersion = "99.0.0";
  exposed.manifest.input = {};

  const registered = registry.get("pdf-reader").manifest;
  assert.deepEqual(registered.requiredPermissions, ["read_file"]);
  assert.equal(registered.sdkVersion, "1.0.0");
  assert.notDeepEqual(registered.input, {});
  const executor = new ToolExecutor(registry);
  const invalid = await executor.execute({ toolId: "pdf-reader", input: {} });
  assert.equal(invalid.error.category, "validation");
  const blocked = await executor.execute({
    toolId: "pdf-reader",
    input: { filePath: "document.pdf" }
  });
  assert.equal(blocked.error.category, "permission");
});

test("malformed tool responses become isolated standardized SDK failures", async () => {
  const sdk = new DefaultToolSdkRuntime();
  sdk.register(BUILTIN_TOOLS.find((tool) => tool.manifest.id === "calculator"));
  for (const [id, response] of [
    ["missing-response", undefined],
    ["missing-output", { success: true }],
    ["missing-error", { success: false }]
  ]) {
    sdk.register({
      manifest: {
        id,
        name: id,
        description: "Malformed result test",
        sdkVersion: "1.0.0",
        toolVersion: "1.0.0",
        capabilities: [],
        requiredPermissions: [],
        input: {},
        output: {},
        dependencies: []
      },
      async execute() {
        return response;
      }
    });
    const result = await sdk.execute({ toolId: id, input: {} });
    assert.equal(result.success, false);
    assert.equal(result.error.category, "execution");
    assert.equal(typeof result.error.code, "string");
  }
  const next = await sdk.execute({
    toolId: "calculator",
    input: { expression: "3+3" }
  });
  assert.equal(next.success, true);
  assert.equal(next.output.result, 6);
});

test("Workspace built-ins are isolated from mutations of the public shared collection", async () => {
  const originalTools = [...BUILTIN_TOOLS];
  const sharedPdf = BUILTIN_TOOLS.find(
    (tool) => tool.manifest.id === "pdf-reader"
  );
  const originalManifest = sharedPdf.manifest;
  const originalExecute = PdfReaderTool.prototype.execute;
  let pdfExecutions = 0;
  PdfReaderTool.prototype.execute = async function (request) {
    pdfExecutions++;
    return originalExecute.call(this, request);
  };

  try {
    sharedPdf.manifest = JSON.parse(JSON.stringify(originalManifest));
    sharedPdf.manifest.requiredPermissions.length = 0;

    const calls = [];
    const workspace = makeWorkspace(
      makePlanner("pdf-reader", { filePath: "document.pdf" }),
      calls
    );
    const blocked = await workspace.execute({
      id: "mutated-shared-pdf",
      prompt: "Read PDF"
    });
    assert.equal(blocked.status, "failure");
    assert.equal(blocked.error.code, "PERMISSION_REQUIRED");
    assert.equal(pdfExecutions, 0);
    assert.equal(calls.length, 1);
    assert.equal(workspace.getHistory().length, 0);
    assert.equal(workspace.getPermissionHistory().length, 1);
    assert.equal(workspace.getPermissionHistory()[0].response, undefined);

    sharedPdf.manifest.input.properties.filePath.type = "number";
    sharedPdf.manifest.output.properties.content.type = "number";
    const freshPdf = createBuiltInTools().find(
      (tool) => tool.manifest.id === "pdf-reader"
    );
    assert.deepEqual(freshPdf.manifest.requiredPermissions, ["read_file"]);
    assert.equal(freshPdf.manifest.input.properties.filePath.type, "string");
    assert.equal(freshPdf.manifest.output.properties.content.type, "string");

    BUILTIN_TOOLS.splice(0, BUILTIN_TOOLS.length);
    const secondWorkspace = makeWorkspace(
      makePlanner("pdf-reader", { filePath: "document.pdf" }),
      []
    );
    const secondBlocked = await secondWorkspace.execute({
      id: "mutated-shared-array",
      prompt: "Read PDF"
    });
    assert.equal(secondBlocked.error.code, "PERMISSION_REQUIRED");
    assert.equal(pdfExecutions, 0);
  } finally {
    sharedPdf.manifest = originalManifest;
    BUILTIN_TOOLS.splice(0, BUILTIN_TOOLS.length, ...originalTools);
    PdfReaderTool.prototype.execute = originalExecute;
  }
});

test("unexpected Executor errors expose a stable SDK failure without internal details", async () => {
  const secret = "internal-executor-secret-044";
  const sdk = new DefaultToolSdkRuntime();
  sdk.register({
    manifest: {
      id: "throwing-tool",
      name: "Throwing Tool",
      description: "Exercises the Executor failure boundary",
      sdkVersion: "1.0.0",
      toolVersion: "1.0.0",
      capabilities: [],
      requiredPermissions: [],
      input: {},
      output: {},
      dependencies: []
    },
    async execute() {
      throw new Error(secret);
    }
  });
  const result = await sdk.execute({ toolId: "throwing-tool", input: {} });
  assert.equal(result.success, false);
  assert.deepEqual(result.error, {
    code: "TOOL_EXECUTION_FAILED",
    message: "Tool execution failed",
    category: "execution"
  });
  assert.doesNotMatch(JSON.stringify(result), /internal-executor-secret-044/);
});

test("unexpected Agent and Conversation errors do not leak through public responses", async () => {
  const secret = "internal-agent-secret-044";
  const workspace = makeWorkspace(
    {
      async plan() {
        throw new Error(secret);
      }
    },
    []
  );
  const agentFailure = await workspace.execute({
    id: "unexpected-agent",
    prompt: "Run"
  });
  assert.deepEqual(agentFailure.error, {
    code: "AGENT_EXECUTION_FAILED",
    message: "Agent execution failed"
  });
  assert.doesNotMatch(JSON.stringify(agentFailure), /internal-agent-secret-044/);

  const sdk = new DefaultToolSdkRuntime();
  sdk.register(createBuiltInTools().find((tool) => tool.manifest.id === "calculator"));
  const agent = new DefaultAgent(
    "test",
    "Test",
    makeProvider([]),
    "test-model",
    sdk,
    makePlanner("calculator", { expression: "2+2" }),
    {
      async approve() {
        throw new Error(secret);
      }
    }
  );
  const plannedFailure = await agent.execute({
    id: "unexpected-planned-agent",
    prompt: "Run"
  });
  assert.deepEqual(plannedFailure.error, {
    code: "AGENT_EXECUTION_FAILED",
    message: "Agent execution failed"
  });
  assert.equal(plannedFailure.plan.steps[0].error, "Agent execution failed");
  assert.doesNotMatch(JSON.stringify(plannedFailure), /internal-agent-secret-044/);

  const conversation = new DefaultConversation("conversation-1", "Test", {
    async execute() {
      throw new Error("internal-conversation-secret-044");
    }
  });
  const conversationFailure = await conversation.execute({
    id: "unexpected-conversation",
    prompt: "Run"
  });
  assert.deepEqual(conversationFailure.error, {
    code: "CONVERSATION_FAILED",
    message: "Conversation failed"
  });
  assert.doesNotMatch(
    JSON.stringify(conversationFailure),
    /internal-conversation-secret-044/
  );
});

test("built-in unexpected errors preserve codes without leaking implementation details", async () => {
  const calculator = createBuiltInTools().find(
    (tool) => tool.manifest.id === "calculator"
  );
  const result = await calculator.execute({
    toolId: "calculator",
    input: { expression: "1+" }
  });
  assert.equal(result.success, false);
  assert.deepEqual(result.error, {
    code: "evaluation_failed",
    message: "Failed to evaluate expression",
    category: "execution"
  });

  const originalFetch = globalThis.fetch;
  try {
    globalThis.fetch = async () => {
      throw new Error("internal-fetch-secret-044");
    };
    const reader = createBuiltInTools().find(
      (tool) => tool.manifest.id === "text-reader"
    );
    const failed = await reader.execute({
      toolId: "text-reader",
      input: { filePath: "https://example.com/file.txt" }
    });
    assert.equal(failed.success, false);
    assert.deepEqual(failed.error, {
      code: "read_failed",
      message: "Failed to read text file",
      category: "execution"
    });
    assert.doesNotMatch(JSON.stringify(failed), /internal-fetch-secret-044/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
