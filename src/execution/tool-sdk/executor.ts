import type { SdkRequest } from "./request";
import type { SdkResponse } from "./response";
import type { ToolRegistry } from "./registry";
import { validateSdkRequest } from "./request-validation";

// Injected by composition; the Execution Layer does not import orchestration.
export type ExecutionPermissionValidator = (
  request: SdkRequest,
  requiredPermissions: string[],
  approval?: object
) => boolean;

export class ToolExecutor {
  constructor(
    private readonly registry: ToolRegistry,
    private readonly validatePermission?: ExecutionPermissionValidator
  ) {}

  async execute(request: SdkRequest, approval?: object): Promise<SdkResponse> {
    try {
      const requestError = validateSdkRequest(request);
      if (requestError) return { success: false, error: requestError };

      const tool = this.registry.get(request.toolId);
      if (!tool) {
        return {
          success: false,
          error: {
            code: "TOOL_NOT_FOUND",
            message: `Tool '${request.toolId}' is not registered`,
            category: "validation"
          }
        };
      }

      const inputError = validateSdkRequest(request, tool.manifest);
      if (inputError) return { success: false, error: inputError };

      if (
        tool.manifest.requiredPermissions.length > 0 &&
        !this.validatePermission?.(
          request,
          tool.manifest.requiredPermissions,
          approval
        )
      ) {
        return {
          success: false,
          error: {
            code: "PERMISSION_REQUIRED",
            message: `Tool '${request.toolId}' requires user approval`,
            category: "permission"
          }
        };
      }

      const response: unknown = await tool.execute(structuredClone(request));
      if (!isSdkResponse(response)) {
        return {
          success: false,
          error: {
            code: "INVALID_TOOL_RESPONSE",
            message: `Tool '${request.toolId}' returned an invalid SDK response`,
            category: "execution"
          }
        };
      }
      return response;
    } catch {
      return {
        success: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message: "Tool execution failed",
          category: "execution"
        }
      };
    }
  }
}

function isSdkResponse(value: unknown): value is SdkResponse {
  if (typeof value !== "object" || value === null) return false;
  const response = value as Record<string, unknown>;
  if (response.success === true) {
    return (
      typeof response.output === "object" &&
      response.output !== null &&
      !Array.isArray(response.output)
    );
  }
  if (response.success !== false) return false;
  const error = response.error;
  if (typeof error !== "object" || error === null) return false;
  const sdkError = error as Record<string, unknown>;
  return (
    typeof sdkError.code === "string" &&
    sdkError.code.trim() !== "" &&
    typeof sdkError.message === "string" &&
    [
      "validation",
      "permission",
      "compatibility",
      "execution",
      "internal"
    ].includes(sdkError.category as string)
  );
}
