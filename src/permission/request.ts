import type { Permission } from "./permission";

export interface PermissionRequest {
  id: string;
  permission: Permission;
}
