import type { PermissionError } from "./error";
import type { PermissionDecision } from "./decision";
import type { PermissionPolicyType } from "./policy";
import type {
  SensitiveActionCategory,
  SensitiveActionSeverity
} from "./sensitive-action";

export class PermissionValidationError
  extends Error
  implements PermissionError
{
  code: string;
  category: "validation";

  constructor(message: string, code: string = "validation_error") {
    super(message);
    this.name = "PermissionValidationError";
    this.code = code;
    this.category = "validation";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validateRequiredString(
  value: unknown,
  label: string,
  code: string
): PermissionValidationError[] {
  if (typeof value === "string" && value.trim() !== "") {
    return [];
  }
  return [
    new PermissionValidationError(`${label} must be a non-empty string`, code)
  ];
}

function validatePermission(value: unknown): PermissionValidationError[] {
  if (!isRecord(value)) {
    return [
      new PermissionValidationError(
        "Permission must be an object",
        "invalid_permission"
      )
    ];
  }

  const errors = [
    ...validateRequiredString(
      value.id,
      "Permission id",
      "invalid_permission_id"
    ),
    ...validateRequiredString(
      value.name,
      "Permission name",
      "invalid_permission_name"
    ),
    ...validateRequiredString(
      value.category,
      "Permission category",
      "invalid_permission_category"
    )
  ];
  if (
    value.description !== undefined &&
    typeof value.description !== "string"
  ) {
    errors.push(
      new PermissionValidationError(
        "Permission description must be a string",
        "invalid_permission_description"
      )
    );
  }
  if (value.context !== undefined) {
    errors.push(...validatePermissionContext(value.context));
  }
  return errors;
}

export function validatePermissionRequest(
  value: unknown
): PermissionValidationError[] {
  if (!isRecord(value)) {
    return [
      new PermissionValidationError(
        "Permission request must be an object",
        "invalid_request"
      )
    ];
  }
  return [
    ...validateRequiredString(
      value.id,
      "Permission request id",
      "invalid_request_id"
    ),
    ...validatePermission(value.permission)
  ];
}

export function validatePermissionResponse(
  value: unknown
): PermissionValidationError[] {
  if (!isRecord(value)) {
    return [
      new PermissionValidationError(
        "Permission response must be an object",
        "invalid_response"
      )
    ];
  }
  return [
    ...validateRequiredString(
      value.requestId,
      "Permission response requestId",
      "invalid_request_id"
    ),
    ...validatePermissionDecision(value.decision)
  ];
}

export function validatePermissionContext(
  value: unknown
): PermissionValidationError[] {
  if (isRecord(value)) {
    return [];
  }
  return [
    new PermissionValidationError(
      "Permission context must be an object",
      "invalid_context"
    )
  ];
}

export function validatePermissionLifecycle(
  value: unknown
): PermissionValidationError[] {
  if (!isRecord(value)) {
    return [
      new PermissionValidationError(
        "Permission lifecycle must be an object",
        "invalid_lifecycle"
      )
    ];
  }
  const errors = validatePermissionRequest(value.request);
  if (value.response !== undefined) {
    errors.push(...validatePermissionResponse(value.response));
  }
  return errors;
}

export function validatePermissionDecision(
  value: unknown
): PermissionValidationError[] {
  const validDecisions: PermissionDecision[] = ["granted", "denied"];
  if (validDecisions.includes(value as PermissionDecision)) {
    return [];
  }
  return [
    new PermissionValidationError(
      "Permission decision must be 'granted' or 'denied'",
      "invalid_decision"
    )
  ];
}

function validatePermissionPolicyType(
  value: unknown
): PermissionValidationError[] {
  const validTypes: PermissionPolicyType[] = [
    "approval_required",
    "approval_not_required"
  ];
  if (validTypes.includes(value as PermissionPolicyType)) {
    return [];
  }
  return [
    new PermissionValidationError(
      "Permission decision policy type is invalid",
      "invalid_policy_type"
    )
  ];
}

export function validatePermissionPolicy(
  value: unknown
): PermissionValidationError[] {
  if (!isRecord(value)) {
    return [
      new PermissionValidationError(
        "Permission policy must be an object",
        "invalid_policy"
      )
    ];
  }
  const errors: PermissionValidationError[] = [];
  if (!isRecord(value.requirement)) {
    errors.push(
      new PermissionValidationError(
        "Permission requirement must be an object",
        "invalid_requirement"
      )
    );
  } else {
    errors.push(
      ...validateRequiredString(
        value.requirement.permissionId,
        "Permission requirement permissionId",
        "invalid_permission_id"
      )
    );
  }
  if (!isRecord(value.decisionPolicy)) {
    errors.push(
      new PermissionValidationError(
        "Permission decision policy must be an object",
        "invalid_decision_policy"
      )
    );
  } else {
    errors.push(...validatePermissionPolicyType(value.decisionPolicy.type));
  }
  return errors;
}

export function validateSensitiveAction(
  value: unknown
): PermissionValidationError[] {
  if (!isRecord(value)) {
    return [
      new PermissionValidationError(
        "Sensitive action must be an object",
        "invalid_sensitive_action"
      )
    ];
  }
  const errors = validateRequiredString(
    value.id,
    "Sensitive action id",
    "invalid_action_id"
  );
  const validCategories: SensitiveActionCategory[] = [
    "sensitive",
    "destructive",
    "irreversible"
  ];
  if (!Array.isArray(value.categories)) {
    errors.push(
      new PermissionValidationError(
        "Sensitive action categories must be an array",
        "invalid_action_categories"
      )
    );
  } else {
    for (let index = 0; index < value.categories.length; index++) {
      const category = value.categories[index];
      if (!validCategories.includes(category)) {
        errors.push(
          new PermissionValidationError(
            `Sensitive action category at index ${index} is invalid`,
            "invalid_action_category"
          )
        );
      }
    }
  }
  const validSeverities: SensitiveActionSeverity[] = ["low", "medium", "high"];
  if (!validSeverities.includes(value.severity as SensitiveActionSeverity)) {
    errors.push(
      new PermissionValidationError(
        "Sensitive action severity is invalid",
        "invalid_action_severity"
      )
    );
  }
  if (value.metadata !== undefined && !isRecord(value.metadata)) {
    errors.push(
      new PermissionValidationError(
        "Sensitive action metadata must be an object",
        "invalid_action_metadata"
      )
    );
  }
  return errors;
}
