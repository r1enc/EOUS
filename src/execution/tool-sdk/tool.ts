import type {
  ToolInputDefinition,
  ToolManifest,
  ToolOutputDefinition
} from "./manifest";
import type { SdkRequest } from "./request";
import type { SdkResponse } from "./response";

export interface SdkTool<
  TInput extends ToolInputDefinition = ToolInputDefinition,
  TOutput extends ToolOutputDefinition = ToolOutputDefinition
> {
  manifest: ToolManifest;
  execute(request: SdkRequest<TInput>): Promise<SdkResponse<TOutput>>;
}
