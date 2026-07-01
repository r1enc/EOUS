import type { ConversationRequest } from "./request";
import type { ConversationResponse } from "./response";
import type { ConversationContext } from "./context";
import type {
  ConversationHistory,
  ConversationMessage,
  ConversationMessageRole
} from "./history";
import type { ConversationSession } from "./session";
import type {
  ConversationLifecycleEvent,
  ConversationLifecycleState
} from "./lifecycle";
import type { ConversationError } from "./error";

export class ConversationValidationError
  extends Error
  implements ConversationError
{
  code: string;
  category: "validation";

  constructor(message: string, code: string = "validation_error") {
    super(message);
    this.name = "ConversationValidationError";
    this.code = code;
    this.category = "validation";
  }
}

export function validateConversationRequest(
  request?: ConversationRequest
): ConversationValidationError[] {
  const errors: ConversationValidationError[] = [];
  if (!request) {
    errors.push(
      new ConversationValidationError(
        "Conversation request is required",
        "missing_request"
      )
    );
    return errors;
  }
  if (
    !request.id ||
    typeof request.id !== "string" ||
    request.id.trim() === ""
  ) {
    errors.push(
      new ConversationValidationError(
        "Conversation request id must be a non-empty string",
        "invalid_request_id"
      )
    );
  }
  if (typeof request.prompt !== "string") {
    errors.push(
      new ConversationValidationError(
        "Conversation request prompt must be a string",
        "invalid_prompt"
      )
    );
  }
  if (request.context) {
    errors.push(...validateConversationContext(request.context));
  }
  return errors;
}

export function validateConversationContext(
  context?: ConversationContext
): ConversationValidationError[] {
  const errors: ConversationValidationError[] = [];
  if (!context) {
    errors.push(
      new ConversationValidationError(
        "Conversation context is required if provided",
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
      new ConversationValidationError(
        "Conversation context conversationId must be a non-empty string",
        "invalid_conversation_id"
      )
    );
  }
  if (context.history) {
    errors.push(...validateConversationHistory(context.history));
  }
  return errors;
}

export function validateConversationMessage(
  message?: ConversationMessage
): ConversationValidationError[] {
  const errors: ConversationValidationError[] = [];
  if (!message) {
    errors.push(
      new ConversationValidationError(
        "Conversation message is required",
        "missing_message"
      )
    );
    return errors;
  }
  if (
    !message.id ||
    typeof message.id !== "string" ||
    message.id.trim() === ""
  ) {
    errors.push(
      new ConversationValidationError(
        "Conversation message id must be a non-empty string",
        "invalid_message_id"
      )
    );
  }
  const validRoles: ConversationMessageRole[] = [
    "user",
    "assistant",
    "system",
    "tool"
  ];
  if (!validRoles.includes(message.role)) {
    errors.push(
      new ConversationValidationError(
        `Conversation message role must be one of: ${validRoles.join(", ")}`,
        "invalid_message_role"
      )
    );
  }
  if (typeof message.content !== "string") {
    errors.push(
      new ConversationValidationError(
        "Conversation message content must be a string",
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
      new ConversationValidationError(
        "Conversation message timestamp must be a non-empty string",
        "invalid_message_timestamp"
      )
    );
  }
  return errors;
}

export function validateConversationHistory(
  history?: ConversationHistory
): ConversationValidationError[] {
  const errors: ConversationValidationError[] = [];
  if (!history) {
    errors.push(
      new ConversationValidationError(
        "Conversation history is required",
        "missing_history"
      )
    );
    return errors;
  }
  if (!Array.isArray(history.messages)) {
    errors.push(
      new ConversationValidationError(
        "Conversation history messages must be an array",
        "invalid_history_messages"
      )
    );
  } else {
    for (const msg of history.messages) {
      errors.push(...validateConversationMessage(msg));
    }
  }
  return errors;
}

export function validateConversationSession(
  session?: ConversationSession
): ConversationValidationError[] {
  const errors: ConversationValidationError[] = [];
  if (!session) {
    errors.push(
      new ConversationValidationError(
        "Conversation session is required",
        "missing_session"
      )
    );
    return errors;
  }
  if (
    !session.id ||
    typeof session.id !== "string" ||
    session.id.trim() === ""
  ) {
    errors.push(
      new ConversationValidationError(
        "Conversation session id must be a non-empty string",
        "invalid_session_id"
      )
    );
  }
  if (
    !session.title ||
    typeof session.title !== "string" ||
    session.title.trim() === ""
  ) {
    errors.push(
      new ConversationValidationError(
        "Conversation session title must be a non-empty string",
        "invalid_session_title"
      )
    );
  }
  if (
    !session.createdAt ||
    typeof session.createdAt !== "string" ||
    session.createdAt.trim() === ""
  ) {
    errors.push(
      new ConversationValidationError(
        "Conversation session createdAt must be a non-empty string",
        "invalid_session_created_at"
      )
    );
  }
  if (
    !session.updatedAt ||
    typeof session.updatedAt !== "string" ||
    session.updatedAt.trim() === ""
  ) {
    errors.push(
      new ConversationValidationError(
        "Conversation session updatedAt must be a non-empty string",
        "invalid_session_updated_at"
      )
    );
  }
  if (!session.history) {
    errors.push(
      new ConversationValidationError(
        "Conversation session history is required",
        "missing_session_history"
      )
    );
  } else {
    errors.push(...validateConversationHistory(session.history));
  }
  if (!session.context) {
    errors.push(
      new ConversationValidationError(
        "Conversation session context is required",
        "missing_session_context"
      )
    );
  } else {
    errors.push(...validateConversationContext(session.context));
  }
  return errors;
}

export function validateConversationResponse(
  response?: ConversationResponse
): ConversationValidationError[] {
  const errors: ConversationValidationError[] = [];
  if (!response) {
    errors.push(
      new ConversationValidationError(
        "Conversation response is required",
        "missing_response"
      )
    );
    return errors;
  }
  if (
    !response.id ||
    typeof response.id !== "string" ||
    response.id.trim() === ""
  ) {
    errors.push(
      new ConversationValidationError(
        "Conversation response id must be a non-empty string",
        "invalid_response_id"
      )
    );
  }
  if (typeof response.content !== "string") {
    errors.push(
      new ConversationValidationError(
        "Conversation response content must be a string",
        "invalid_response_content"
      )
    );
  }
  if (response.status !== "success" && response.status !== "failure") {
    errors.push(
      new ConversationValidationError(
        "Conversation response status must be 'success' or 'failure'",
        "invalid_response_status"
      )
    );
  }
  if (response.status === "failure") {
    if (!response.error) {
      errors.push(
        new ConversationValidationError(
          "Conversation response error is required when status is 'failure'",
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
          new ConversationValidationError(
            "Conversation response error code must be a non-empty string",
            "invalid_error_code"
          )
        );
      }
      if (typeof response.error.message !== "string") {
        errors.push(
          new ConversationValidationError(
            "Conversation response error message must be a string",
            "invalid_error_message"
          )
        );
      }
    }
  }
  return errors;
}

export function validateConversationLifecycleEvent(
  event?: ConversationLifecycleEvent
): ConversationValidationError[] {
  const errors: ConversationValidationError[] = [];
  if (!event) {
    errors.push(
      new ConversationValidationError(
        "Conversation lifecycle event is required",
        "missing_lifecycle_event"
      )
    );
    return errors;
  }
  const validStates: ConversationLifecycleState[] = [
    "idle",
    "initializing",
    "waiting_for_input",
    "processing",
    "generating",
    "completed",
    "failed"
  ];
  if (!validStates.includes(event.state)) {
    errors.push(
      new ConversationValidationError(
        `Conversation lifecycle state must be one of: ${validStates.join(", ")}`,
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
      new ConversationValidationError(
        "Conversation lifecycle event timestamp must be a non-empty string",
        "invalid_lifecycle_timestamp"
      )
    );
  }
  return errors;
}
