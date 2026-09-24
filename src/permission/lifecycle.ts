import type { PermissionRequest } from "./request";
import type { PermissionResponse } from "./response";

export interface PermissionLifecycle {
  request: PermissionRequest;
  response?: PermissionResponse;
}
