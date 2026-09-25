import type {
  Provider,
  ProviderMessage,
  ProviderResponse
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
import type { AgentExecutionPlan, AgentExecutionStep } from "./planning";
import { validateAgentExecutionPlan, validateAgentRequest } from "./validation";

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
    let activePlan: AgentExecutionPlan | undefined;
    let activeStep: AgentExecutionStep | undefined;
    try {
      const errors = validateAgentRequest(request);
      if (errors.length > 0)
        return failure(request?.id ?? "", errors[0].code, errors[0].message);

      const messages: ProviderMessage[] = [
        ...(request.context?.history ?? [])
          .filter((message) => message.role !== "tool")
          .map((message) => ({
            role: message.role as ProviderMessage["role"],
            content: message.content
          })),
        { role: "user", content: request.prompt }
      ];

      const reasoning = await this.provider.generateCompletion({
        model: this.model,
        messages
      });
      if (!reasoning.success) {
        return failure(
          request.id,
          reasoning.error.code,
          reasoning.error.message
        );
      }

      // No provider response syntax is defined for tool selection. A planner
      // must be supplied by the host before tool steps can be requested.
      if (!this.planner) return success(request.id, reasoning.content);

      const proposedPlan = await this.planner.plan(
        request,
        reasoning.content,
        this.tools.listManifests()
      );
      if (!proposedPlan) return success(request.id, reasoning.content);
      const planErrors = validateAgentExecutionPlan(proposedPlan);
      if (planErrors.length > 0) {
        return failure(request.id, planErrors[0].code, planErrors[0].message);
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
          return failure(request.id, "TOOL_NOT_FOUND", step.error, plan);
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
          return failure(request.id, inputError.code, inputError.message, plan);
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
          return failure(
            request.id,
            result.error.code,
            result.error.message,
            plan
          );
        }
        step.status = "completed";
        step.output = result.output;
        plan.updatedAt = new Date().toISOString();
      }
      plan.status = "completed";
      activeStep = undefined;

      const final = await this.provider.generateCompletion({
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
      });
      return providerResult(request.id, final, plan);
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
      return failure(
        request?.id ?? "",
        error instanceof PermissionRuntimeError
          ? error.code
          : "AGENT_EXECUTION_FAILED",
        message,
        activePlan
      );
    }
  }
}

function providerResult(
  id: string,
  response: ProviderResponse,
  plan: AgentExecutionPlan
): AgentResponse {
  return response.success
    ? success(id, response.content, plan)
    : failure(id, response.error.code, response.error.message, plan);
}

function success(
  id: string,
  content: string,
  plan?: AgentExecutionPlan
): AgentResponse {
  return { id, content, status: "success", plan };
}

function failure(
  id: string,
  code: string,
  message: string,
  plan?: AgentExecutionPlan
): AgentResponse {
  return { id, content: "", status: "failure", error: { code, message }, plan };
}
