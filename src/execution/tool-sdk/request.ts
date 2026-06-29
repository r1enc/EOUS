export interface SdkRequest<TInput = unknown> {
  toolId: string;
  input: TInput;
}
