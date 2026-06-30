import type { AgentRequest } from "./request";
import type { AgentResponse } from "./response";
import type { AgentContext, AgentMessage, AgentMessageRole } from "./context";
import type { AgentExecutionPlan, AgentExecutionStep } from "./planning";
import type { AgentLifecycleEvent, AgentLifecycleState } from "./lifecycle";
import type { AgentError } from "./error";

export class AgentValidationError extends Error implements AgentError {
  code: string;
  category: "validation";

  constructor(message: string, code: string = "validation_error") {
    super(message);
    this.name = "AgentValidationError";
    this.code = code;
    this.category = "validation";
  }
}

export function validateAgentRequest(
  request?: AgentRequest
): AgentValidationError[] {
  const errors: AgentValidationError[] = [];
  if (!request) {
    errors.push(
      new AgentValidationError("Agent request is required", "missing_request")
    );
    return errors;
  }
  if (
    !request.id ||
    typeof request.id !== "string" ||
    request.id.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent request id must be a non-empty string",
        "invalid_request_id"
      )
    );
  }
  if (typeof request.prompt !== "string") {
    errors.push(
      new AgentValidationError(
        "Agent request prompt must be a string",
        "invalid_prompt"
      )
    );
  }
  if (request.context) {
    errors.push(...validateAgentContext(request.context));
  }
  return errors;
}

export function validateAgentContext(
  context?: AgentContext
): AgentValidationError[] {
  const errors: AgentValidationError[] = [];
  if (!context) {
    errors.push(
      new AgentValidationError(
        "Agent context is required if provided",
        "missing_context"
      )
    );
    return errors;
  }
  if (
    !context.conversationId ||
    typeof context.conversationId !== "string" ||
    context.conversationId.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent context conversationId must be a non-empty string",
        "invalid_conversation_id"
      )
    );
  }
  if (context.history) {
    if (!Array.isArray(context.history)) {
      errors.push(
        new AgentValidationError(
          "Agent context history must be an array",
          "invalid_history"
        )
      );
    } else {
      for (const msg of context.history) {
        errors.push(...validateAgentMessage(msg));
      }
    }
  }
  return errors;
}

export function validateAgentMessage(
  message?: AgentMessage
): AgentValidationError[] {
  const errors: AgentValidationError[] = [];
  if (!message) {
    errors.push(
      new AgentValidationError("Agent message is required", "missing_message")
    );
    return errors;
  }
  const validRoles: AgentMessageRole[] = [
    "user",
    "assistant",
    "system",
    "tool"
  ];
  if (!validRoles.includes(message.role)) {
    errors.push(
      new AgentValidationError(
        `Agent message role must be one of: ${validRoles.join(", ")}`,
        "invalid_message_role"
      )
    );
  }
  if (typeof message.content !== "string") {
    errors.push(
      new AgentValidationError(
        "Agent message content must be a string",
        "invalid_message_content"
      )
    );
  }
  if (
    !message.timestamp ||
    typeof message.timestamp !== "string" ||
    message.timestamp.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent message timestamp must be a non-empty string",
        "invalid_message_timestamp"
      )
    );
  }
  return errors;
}

export function validateAgentResponse(
  response?: AgentResponse
): AgentValidationError[] {
  const errors: AgentValidationError[] = [];
  if (!response) {
    errors.push(
      new AgentValidationError("Agent response is required", "missing_response")
    );
    return errors;
  }
  if (
    !response.id ||
    typeof response.id !== "string" ||
    response.id.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent response id must be a non-empty string",
        "invalid_response_id"
      )
    );
  }
  if (typeof response.content !== "string") {
    errors.push(
      new AgentValidationError(
        "Agent response content must be a string",
        "invalid_response_content"
      )
    );
  }
  if (response.status !== "success" && response.status !== "failure") {
    errors.push(
      new AgentValidationError(
        "Agent response status must be 'success' or 'failure'",
        "invalid_response_status"
      )
    );
  }
  if (response.plan) {
    errors.push(...validateAgentExecutionPlan(response.plan));
  }
  if (response.status === "failure") {
    if (!response.error) {
      errors.push(
        new AgentValidationError(
          "Agent response error is required when status is 'failure'",
          "missing_response_error"
        )
      );
    } else {
      if (
        !response.error.code ||
        typeof response.error.code !== "string" ||
        response.error.code.trim() === ""
      ) {
        errors.push(
          new AgentValidationError(
            "Agent response error code must be a non-empty string",
            "invalid_error_code"
          )
        );
      }
      if (typeof response.error.message !== "string") {
        errors.push(
          new AgentValidationError(
            "Agent response error message must be a string",
            "invalid_error_message"
          )
        );
      }
    }
  }
  return errors;
}

export function validateAgentExecutionPlan(
  plan?: AgentExecutionPlan
): AgentValidationError[] {
  const errors: AgentValidationError[] = [];
  if (!plan) {
    errors.push(
      new AgentValidationError(
        "Agent execution plan is required if provided",
        "missing_plan"
      )
    );
    return errors;
  }
  if (!plan.id || typeof plan.id !== "string" || plan.id.trim() === "") {
    errors.push(
      new AgentValidationError(
        "Agent execution plan id must be a non-empty string",
        "invalid_plan_id"
      )
    );
  }
  const validStatuses = ["planned", "executing", "completed", "failed"];
  if (!validStatuses.includes(plan.status)) {
    errors.push(
      new AgentValidationError(
        `Agent execution plan status must be one of: ${validStatuses.join(", ")}`,
        "invalid_plan_status"
      )
    );
  }
  if (!Array.isArray(plan.steps)) {
    errors.push(
      new AgentValidationError(
        "Agent execution plan steps must be an array",
        "invalid_plan_steps"
      )
    );
  } else {
    for (const step of plan.steps) {
      errors.push(...validateAgentExecutionStep(step));
    }
  }
  if (
    !plan.createdAt ||
    typeof plan.createdAt !== "string" ||
    plan.createdAt.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent execution plan createdAt must be a non-empty string",
        "invalid_plan_created_at"
      )
    );
  }
  if (
    !plan.updatedAt ||
    typeof plan.updatedAt !== "string" ||
    plan.updatedAt.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent execution plan updatedAt must be a non-empty string",
        "invalid_plan_updated_at"
      )
    );
  }
  return errors;
}

export function validateAgentExecutionStep(
  step?: AgentExecutionStep
): AgentValidationError[] {
  const errors: AgentValidationError[] = [];
  if (!step) {
    errors.push(
      new AgentValidationError(
        "Agent execution step is required",
        "missing_step"
      )
    );
    return errors;
  }
  if (!step.id || typeof step.id !== "string" || step.id.trim() === "") {
    errors.push(
      new AgentValidationError(
        "Agent execution step id must be a non-empty string",
        "invalid_step_id"
      )
    );
  }
  if (
    !step.action ||
    typeof step.action !== "string" ||
    step.action.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent execution step action must be a non-empty string",
        "invalid_step_action"
      )
    );
  }
  const validStepStatuses = ["pending", "running", "completed", "failed"];
  if (!validStepStatuses.includes(step.status)) {
    errors.push(
      new AgentValidationError(
        `Agent execution step status must be one of: ${validStepStatuses.join(", ")}`,
        "invalid_step_status"
      )
    );
  }
  if (
    !step.input ||
    typeof step.input !== "object" ||
    Array.isArray(step.input)
  ) {
    errors.push(
      new AgentValidationError(
        "Agent execution step input must be an object",
        "invalid_step_input"
      )
    );
  }
  return errors;
}

export function validateAgentLifecycleEvent(
  event?: AgentLifecycleEvent
): AgentValidationError[] {
  const errors: AgentValidationError[] = [];
  if (!event) {
    errors.push(
      new AgentValidationError(
        "Agent lifecycle event is required",
        "missing_lifecycle_event"
      )
    );
    return errors;
  }
  const validStates: AgentLifecycleState[] = [
    "idle",
    "intent_analyzing",
    "reasoning",
    "planning",
    "verifying_permissions",
    "executing_tools",
    "generating_response",
    "completed",
    "failed"
  ];
  if (!validStates.includes(event.state)) {
    errors.push(
      new AgentValidationError(
        `Agent lifecycle state must be one of: ${validStates.join(", ")}`,
        "invalid_lifecycle_state"
      )
    );
  }
  if (
    !event.timestamp ||
    typeof event.timestamp !== "string" ||
    event.timestamp.trim() === ""
  ) {
    errors.push(
      new AgentValidationError(
        "Agent lifecycle event timestamp must be a non-empty string",
        "invalid_lifecycle_timestamp"
      )
    );
  }
  return errors;
}
