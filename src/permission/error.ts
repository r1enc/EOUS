export type PermissionErrorCategory =
  "validation" | "policy" | "denied" | "unknown";

export interface PermissionError {
  code: string;
  message: string;
  category: PermissionErrorCategory;
}
