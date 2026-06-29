export type SdkErrorCategory =
  "validation" | "permission" | "compatibility" | "execution" | "internal";

export interface SdkError {
  code: string;
  message: string;
  category: SdkErrorCategory;
}
