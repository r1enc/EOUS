export type SensitiveActionCategory =
  "sensitive" | "destructive" | "irreversible";

export type SensitiveActionSeverity = "low" | "medium" | "high";

export type SensitiveActionMetadata = Record<string, unknown>;

export interface SensitiveAction {
  id: string;
  categories: SensitiveActionCategory[];
  severity: SensitiveActionSeverity;
  metadata?: SensitiveActionMetadata;
}
