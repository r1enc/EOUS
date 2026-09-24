import type { PermissionDecision } from "./decision";
import type { PermissionRequest } from "./request";

export interface PermissionResponse {
  requestId: PermissionRequest["id"];
  decision: PermissionDecision;
}
