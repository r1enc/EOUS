import type { SdkError } from "./error";

export interface SdkResponse<TOutput = unknown> {
  success: boolean;
  output?: TOutput;
  error?: SdkError;
}
