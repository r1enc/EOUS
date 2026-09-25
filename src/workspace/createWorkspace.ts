import { DefaultAgent, type AgentPlanner } from "../agent";
import {
  DefaultConversation,
  type Conversation,
  type ConversationMessage
} from "../conversation";
import {
  DefaultPermissionManager,
  type PermissionApprovalHandler,
  type PermissionLifecycle
} from "../permission";
import type { ProviderRegistry } from "../intelligence/provider-sdk";
import { DefaultToolSdkRuntime } from "../execution/tool-sdk";
import { createBuiltInTools } from "../tools/builtin";

export interface WorkspaceConfig {
  providerRegistry: ProviderRegistry;
  providerId: string;
  model: string;
  conversationId: string;
  conversationTitle: string;
  planner?: AgentPlanner;
  approvePermission?: PermissionApprovalHandler;
}

export interface Workspace extends Conversation {
  getHistory(): ConversationMessage[];
  getPermissionHistory(): PermissionLifecycle[];
}

export function createWorkspace(config: WorkspaceConfig): Workspace {
  const provider = config.providerRegistry.getProvider(config.providerId);
  if (!provider)
    throw new Error(`Provider '${config.providerId}' is not registered`);
  if (!config.model.trim()) throw new Error("A provider model is required");

  const permissions = new DefaultPermissionManager(config.approvePermission);
  const tools = new DefaultToolSdkRuntime((request, required, approval) =>
    permissions.consumeApproval(request, required, approval)
  );
  for (const tool of createBuiltInTools()) tools.register(tool);

  const agent = new DefaultAgent(
    "eous-agent",
    "EOUS Agent",
    provider,
    config.model,
    tools,
    config.planner,
    permissions
  );
  const conversation = new DefaultConversation(
    config.conversationId,
    config.conversationTitle,
    agent
  );
  return {
    id: conversation.id,
    title: conversation.title,
    execute: (request) => conversation.execute(request),
    getHistory: () => conversation.getHistory(),
    getPermissionHistory: () => permissions.getHistory()
  };
}
