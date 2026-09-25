import type { SdkTool } from "./tool";
import type { ToolManifest } from "./manifest";
import { validateCompatibility, validateToolContract } from "./validation";

export interface ToolRegistry {
  register(tool: SdkTool): void;
  get(toolId: string): SdkTool | undefined;
  listManifests(): ToolManifest[];
}

export class DefaultToolRegistry implements ToolRegistry {
  private readonly tools = new Map<string, SdkTool>();

  register(tool: SdkTool): void {
    const contractError = validateToolContract(tool);
    if (contractError) throw new Error(contractError.message);

    const compatibilityError = validateCompatibility(tool.manifest.sdkVersion);
    if (compatibilityError) throw new Error(compatibilityError.message);

    if (this.tools.has(tool.manifest.id)) {
      throw new Error(`Tool '${tool.manifest.id}' is already registered`);
    }
    // Keep execution metadata private to the SDK. Tool discovery returns copies.
    this.tools.set(tool.manifest.id, {
      manifest: structuredClone(tool.manifest),
      execute: (request) => tool.execute(request)
    });
  }

  get(toolId: string): SdkTool | undefined {
    const tool = this.tools.get(toolId);
    return (
      tool && {
        manifest: structuredClone(tool.manifest),
        execute: (request) => tool.execute(request)
      }
    );
  }

  listManifests(): ToolManifest[] {
    return Array.from(this.tools.values(), (tool) =>
      structuredClone(tool.manifest)
    );
  }
}
