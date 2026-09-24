import type { PermissionContext } from "./context";

export interface Permission {
  id: string;
  name: string;
  description?: string;
  category: string;
  context?: PermissionContext;
}
