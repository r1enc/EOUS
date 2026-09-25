import type { PermissionContext } from "./context";
import type { PermissionLifecycle } from "./lifecycle";
import type { PermissionPolicy } from "./policy";
import type { PermissionRequest } from "./request";
import type { PermissionResponse } from "./response";
import type { PermissionRequirement } from "./requirement";
import {
  validatePermissionPolicy,
  validatePermissionRequest,
  validatePermissionResponse
} from "./validation";

export type PermissionApprovalHandler = (
  request: PermissionRequest
) => Promise<PermissionResponse>;

export interface PermissionExecution {
  toolId: string;
  input: Record<string, unknown>;
}

export interface PermissionManager {
  approve(
    execution: PermissionExecution,
    requirements: PermissionRequirement[],
    context?: PermissionContext
  ): Promise<object | undefined>;
  consumeApproval(
    execution: PermissionExecution,
    permissions: string[],
    approval?: object
  ): boolean;
  getHistory(): PermissionLifecycle[];
}

export class PermissionRuntimeError extends Error {
  constructor(
    readonly code: string,
    message: string
  ) {
    super(message);
    this.name = "PermissionRuntimeError";
  }
}

export class DefaultPermissionManager implements PermissionManager {
  private readonly history: PermissionLifecycle[] = [];
  private readonly approvals = new WeakMap<
    object,
    {
      execution: PermissionExecution;
      signature: string;
      permissions: string[];
    }
  >();
  private nextId = 0;

  constructor(private readonly handler?: PermissionApprovalHandler) {}

  async approve(
    execution: PermissionExecution,
    requirements: PermissionRequirement[],
    context: PermissionContext = {}
  ): Promise<object | undefined> {
    if (requirements.length === 0) return undefined;
    const snapshot = structuredClone(execution);
    const signature = JSON.stringify(snapshot);
    const permissions = [
      ...new Set(requirements.map(({ permissionId }) => permissionId))
    ];

    for (const permissionId of permissions) {
      // Manifest requirements always require explicit approval; there is no
      // policy override that can silently downgrade a sensitive operation.
      const policy: PermissionPolicy = {
        requirement: { permissionId },
        decisionPolicy: { type: "approval_required" }
      };
      const request: PermissionRequest = {
        id: `permission-${++this.nextId}`,
        permission: {
          id: policy.requirement.permissionId,
          name: permissionId,
          category: "tool",
          context: { ...structuredClone(context), ...snapshot }
        }
      };
      const errors = [
        ...validatePermissionPolicy(policy),
        ...validatePermissionRequest(request)
      ];
      if (errors.length)
        throw new PermissionRuntimeError(errors[0].code, errors[0].message);
      const lifecycle: PermissionLifecycle = { request };
      this.history.push(lifecycle);
      if (!this.handler) {
        throw new PermissionRuntimeError(
          "PERMISSION_REQUIRED",
          "An approval handler is required"
        );
      }

      let response: PermissionResponse;
      try {
        response = await this.handler(structuredClone(request));
      } catch {
        throw new PermissionRuntimeError(
          "PERMISSION_APPROVAL_FAILED",
          "The approval handler failed"
        );
      }
      if (
        validatePermissionResponse(response).length ||
        response.requestId !== request.id
      ) {
        throw new PermissionRuntimeError(
          "INVALID_PERMISSION_RESPONSE",
          "Approval must match the pending permission request"
        );
      }
      lifecycle.response = {
        requestId: response.requestId,
        decision: response.decision
      };
      if (response.decision !== "granted") {
        throw new PermissionRuntimeError(
          "PERMISSION_DENIED",
          `Permission '${permissionId}' was denied`
        );
      }
    }

    const approval = {};
    this.approvals.set(approval, { execution, signature, permissions });
    return approval;
  }

  consumeApproval(
    execution: PermissionExecution,
    permissions: string[],
    approval?: object
  ): boolean {
    if (!approval) return false;
    const stored = this.approvals.get(approval);
    this.approvals.delete(approval);
    return (
      stored !== undefined &&
      stored.execution === execution &&
      stored.signature === JSON.stringify(execution) &&
      permissions.every((permissionId) =>
        stored.permissions.includes(permissionId)
      )
    );
  }

  getHistory(): PermissionLifecycle[] {
    return structuredClone(this.history);
  }
}
