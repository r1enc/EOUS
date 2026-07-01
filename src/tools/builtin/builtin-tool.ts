import type { SdkTool } from "../../execution/tool-sdk/tool";
import type {
  ToolInputDefinition,
  ToolOutputDefinition,
  ToolManifest
} from "../../execution/tool-sdk/manifest";
import type { BuiltInToolMetadata } from "./metadata";

export interface BuiltInToolManifest
  extends ToolManifest, BuiltInToolMetadata {}

export interface BuiltInTool<
  TInput extends ToolInputDefinition = ToolInputDefinition,
  TOutput extends ToolOutputDefinition = ToolOutputDefinition
> extends SdkTool<TInput, TOutput> {
  readonly manifest: BuiltInToolManifest;
}
