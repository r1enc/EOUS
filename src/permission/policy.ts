import type { PermissionDecisionPolicy } from "./decision-policy";
import type { PermissionRequirement } from "./requirement";

export type PermissionPolicyType =
  "approval_required" | "approval_not_required";

export interface PermissionPolicy {
  requirement: PermissionRequirement;
  decisionPolicy: PermissionDecisionPolicy;
}
