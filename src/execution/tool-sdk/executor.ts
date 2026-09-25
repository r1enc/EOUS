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

      return await tool.execute(structuredClone(request));
    } catch (error) {
      return {
        success: false,
        error: {
          code: "TOOL_EXECUTION_FAILED",
          message:
            error instanceof Error ? error.message : "Tool execution failed",
          category: "execution"
        }
      };
    }
  }
}
