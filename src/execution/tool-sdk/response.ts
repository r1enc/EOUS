import type { SdkError } from "./error";
import type { ToolOutputDefinition } from "./manifest";

export type SdkResponse<
  TOutput extends ToolOutputDefinition = ToolOutputDefinition
> =
  | {
      success: true;
      output: TOutput;
    }
  | {
      success: false;
      error: SdkError;
    };
