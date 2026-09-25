import type { ToolManifest } from "./manifest";
import type { SdkRequest } from "./request";
import type { SdkResponse } from "./response";
import type { SdkTool } from "./tool";
import { ToolExecutor, type ExecutionPermissionValidator } from "./executor";
import { DefaultToolRegistry } from "./registry";

export interface ToolSdkRuntime {
  listManifests(): ToolManifest[];
  execute(request: SdkRequest, approval?: object): Promise<SdkResponse>;
}

export class DefaultToolSdkRuntime implements ToolSdkRuntime {
  private readonly registry = new DefaultToolRegistry();
  private readonly executor: ToolExecutor;

  constructor(validatePermission?: ExecutionPermissionValidator) {
    this.executor = new ToolExecutor(this.registry, validatePermission);
  }

  register(tool: SdkTool): void {
    this.registry.register(tool);
  }

  listManifests(): ToolManifest[] {
    return this.registry.listManifests();
  }

  execute(request: SdkRequest, approval?: object): Promise<SdkResponse> {
    return this.executor.execute(request, approval);
  }
}
