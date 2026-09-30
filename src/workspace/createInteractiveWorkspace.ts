import {
  createWorkspace,
  type Workspace,
  type WorkspaceConfig
} from "./createWorkspace";
import { createPermissionInteraction } from "./permission-interaction";

export function createInteractiveWorkspace(config: WorkspaceConfig): Workspace {
  if (config.approvePermission !== undefined)
    throw new Error("Interactive approval conflicts with approvePermission");
  const permissionInteraction = createPermissionInteraction();
  const workspace = createWorkspace({
    ...config,
    approvePermission: permissionInteraction.handle
  });
  return { ...workspace, permissionInteraction };
}
