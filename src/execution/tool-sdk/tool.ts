import type { ToolManifest } from "./manifest";
import type { SdkRequest } from "./request";
import type { SdkResponse } from "./response";

export interface SdkTool<TInput = unknown, TOutput = unknown> {
  manifest: ToolManifest;
  execute(request: SdkRequest<TInput>): Promise<SdkResponse<TOutput>>;
}
