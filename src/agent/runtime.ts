import type {
  Provider,
  ProviderMessage,
  ProviderRequest,
  ProviderResponse,
  ProviderStreamEvent
} from "../intelligence/provider-sdk";
import {
  validateSdkRequest,
  type ToolManifest,
  type ToolSdkRuntime
} from "../execution/tool-sdk";
import {
  DefaultPermissionManager,
  PermissionRuntimeError,
  type PermissionManager
} from "../permission";
import type { Agent } from "./agent";
import type { AgentRequest } from "./request";
import type { AgentResponse } from "./response";
import type { AgentStreamEvent } from "./stream";
import type { AgentExecutionPlan, AgentExecutionStep } from "./planning";
import { validateAgentExecutionPlan, validateAgentRequest } from "./validation";

type ContentEvent = Extract<AgentStreamEvent, { type: "content" }>;

export interface AgentPlanner {
  // Each step's action identifies a registered tool; input follows its manifest.
  plan(
    request: AgentRequest,
    reasoning: string,
    availableTools: ToolManifest[]
  ): Promise<AgentExecutionPlan | null>;
}

export class DefaultAgent implements Agent {
  readonly id: string;
  readonly name: string;

  constructor(
    id: string,
    name: string,
    private readonly provider: Provider,
    private readonly model: string,
    private readonly tools: ToolSdkRuntime,
    private readonly planner?: AgentPlanner,
    private readonly permissions: PermissionManager = new DefaultPermissionManager()
  ) {
    this.id = id;
    this.name = name;
  }

  async execute(request: AgentRequest): Promise<AgentResponse> {
    for await (const event of this.run(request, false)) {
      if (event.type !== "content") return event.response;
    }
    return failure(
      request?.id ?? "",
      "AGENT_EXECUTION_FAILED",
      "Agent execution failed"
    );
  }

  executeStream(request: AgentRequest): AsyncIterable<AgentStreamEvent> {
    return this.run(request, true);
  }

  private async *run(
    request: AgentRequest,
    stream: boolean
  ): AsyncGenerator<AgentStreamEvent> {
    let activePlan: AgentExecutionPlan | undefined;
    let activeStep: AgentExecutionStep | undefined;
    try {
      const errors = validateAgentRequest(request);
      if (errors.length > 0) {
        yield {
          type: "failure",
          response: failure(
            request?.id ?? "",
            errors[0].code,
            errors[0].message
          )
        };
        return;
      }

      const messages: ProviderMessage[] = [
        ...(request.context?.history ?? [])
          .filter((message) => message.role !== "tool")
          .map((message) => ({
            role: message.role as ProviderMessage["role"],
            content: message.content
          })),
        { role: "user", content: request.prompt }
      ];
      const initialRequest = { model: this.model, messages };
      const initial = this.completion(initialRequest, stream);
      const buffered: ContentEvent[] = [];
      let reasoning: ProviderResponse;
      if (this.planner) {
        while (true) {
          const next = await initial.next();
          if (next.done) {
            reasoning = next.value;
            break;
          }
          buffered.push(next.value);
        }
      } else {
        reasoning = yield* initial;
      }
      if (!reasoning.success) {
        yield {
          type: "failure",
          response: failure(
            request.id,
            reasoning.error.code,
            reasoning.error.message
          )
        };
        return;
      }

      // Planner input is internal until it is known to be the final answer.
      if (!this.planner) {
        yield {
          type: "complete",
          response: success(request.id, reasoning.content)
        };
        return;
      }
      const proposedPlan = await this.planner.plan(
        request,
        reasoning.content,
        this.tools.listManifests()
      );
      if (!proposedPlan) {
        for (const event of buffered) yield event;
        yield {
          type: "complete",
          response: success(request.id, reasoning.content)
        };
        return;
      }
      const planErrors = validateAgentExecutionPlan(proposedPlan);
      if (planErrors.length > 0) {
        yield {
          type: "failure",
          response: failure(
            request.id,
            planErrors[0].code,
            planErrors[0].message
          )
        };
        return;
      }

      const plan = structuredClone(proposedPlan);
      activePlan = plan;
      plan.status = "executing";
      for (const step of plan.steps) {
        activeStep = step;
        const manifest = this.tools
          .listManifests()
          .find((tool) => tool.id === step.action);
        if (!manifest) {
          plan.status = "failed";
          step.status = "failed";
          step.error = `Tool '${step.action}' is not registered`;
          yield {
            type: "failure",
            response: failure(request.id, "TOOL_NOT_FOUND", step.error, plan)
          };
          return;
        }

        const execution = structuredClone({
          toolId: step.action,
          input: step.input
        });
        const inputError = validateSdkRequest(execution, manifest);
        if (inputError) {
          plan.status = "failed";
          step.status = "failed";
          step.error = inputError.message;
          yield {
            type: "failure",
            response: failure(
              request.id,
              inputError.code,
              inputError.message,
              plan
            )
          };
          return;
        }
        const approval = await this.permissions.approve(
          execution,
          manifest.requiredPermissions.map((permissionId) => ({
            permissionId
          })),
          {
            requestId: request.id,
            conversationId: request.context?.conversationId,
            stepId: step.id
          }
        );
        step.status = "running";
        const result = await this.tools.execute(execution, approval);
        if (!result.success) {
          plan.status = "failed";
          step.status = "failed";
          step.error = result.error.message;
          yield {
            type: "failure",
            response: failure(
              request.id,
              result.error.code,
              result.error.message,
              plan
            )
          };
          return;
        }
        step.status = "completed";
        step.output = result.output;
        plan.updatedAt = new Date().toISOString();
      }
      plan.status = "completed";
      activeStep = undefined;

      const final = yield* this.completion(
        {
          model: this.model,
          messages: [
            ...messages,
            { role: "assistant", content: reasoning.content },
            {
              role: "user",
              content: `Tool results: ${JSON.stringify(
                plan.steps.map((step) => ({
                  action: step.action,
                  output: step.output
                }))
              )}. Provide the final response to the original request.`
            }
          ]
        },
        stream
      );
      if (final.success) {
        yield {
          type: "complete",
          response: success(request.id, final.content, plan)
        };
      } else {
        yield {
          type: "failure",
          response: failure(
            request.id,
            final.error.code,
            final.error.message,
            plan
          )
        };
      }
    } catch (error) {
      const message =
        error instanceof PermissionRuntimeError
          ? error.message
          : "Agent execution failed";
      if (activePlan) {
        activePlan.status = "failed";
        activePlan.updatedAt = new Date().toISOString();
      }
      if (activeStep) {
        activeStep.status = "failed";
        activeStep.error = message;
      }
      yield {
        type: "failure",
        response: failure(
          request?.id ?? "",
          error instanceof PermissionRuntimeError
            ? error.code
            : "AGENT_EXECUTION_FAILED",
          message,
          activePlan
        )
      };
    }
  }

  private async *completion(
    request: ProviderRequest,
    stream: boolean
  ): AsyncGenerator<ContentEvent, ProviderResponse> {
    if (!stream || typeof this.provider.streamCompletion !== "function") {
      return await this.provider.generateCompletion(request);
    }
    let terminal: ProviderResponse | undefined;
    for await (const event of this.provider.streamCompletion(request)) {
      if (!validProviderStreamEvent(event) || terminal) {
        throw new Error("Invalid provider stream");
      }
      if (event.type === "content") {
        yield { type: "content", delta: event.delta };
      } else if (event.type === "complete") {
        terminal = event.response;
      } else {
        terminal = { success: false, error: event.error };
      }
    }
    if (!terminal) throw new Error("Provider stream ended without a result");
    return terminal;
  }
}

function validProviderStreamEvent(
  value: unknown
): value is ProviderStreamEvent {
  if (!value || typeof value !== "object") return false;
  const event = value as Record<string, unknown>;
  if (event.type === "content") return typeof event.delta === "string";
  if (event.type === "complete") {
    const response = event.response;
    return (
      !!response &&
      typeof response === "object" &&
      (response as Record<string, unknown>).success === true &&
      (response as Record<string, unknown>).role === "assistant" &&
      typeof (response as Record<string, unknown>).content === "string"
    );
  }
  if (event.type === "failure") {
    const error = event.error;
    if (!error || typeof error !== "object") return false;
    const fields = error as Record<string, unknown>;
    return (
      typeof fields.code === "string" &&
      typeof fields.message === "string" &&
      typeof fields.category === "string" &&
      [
        "api_error",
        "rate_limit",
        "authentication",
        "validation",
        "timeout",
        "unknown"
      ].includes(fields.category)
    );
  }
  return false;
}

function success(
  id: string,
  content: string,
  plan?: AgentExecutionPlan
): AgentResponse & { status: "success" } {
  return { id, content, status: "success", plan };
}

function failure(
  id: string,
  code: string,
  message: string,
  plan?: AgentExecutionPlan
): AgentResponse & { status: "failure" } {
  return { id, content: "", status: "failure", error: { code, message }, plan };
}
