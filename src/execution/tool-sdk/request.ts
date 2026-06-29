import type { ToolInputDefinition } from "./manifest";

export interface SdkRequest<
  TInput extends ToolInputDefinition = ToolInputDefinition
> {
  toolId: string;
  input: TInput;
}
