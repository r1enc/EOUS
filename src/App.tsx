import { ChatWorkspace } from "./components/chat/ChatWorkspace";
import { ConversationWorkspace } from "./components/conversations/ConversationWorkspace";
import {
  ProviderSettingsScreen,
  type ProviderSettingsView
} from "./components/settings/ProviderSettingsScreen";
import type { ConversationNavigation, Workspace } from "./workspace";

interface AppProps {
  workspace?: Workspace;
  navigation?: ConversationNavigation;
  providerSettings?: ProviderSettingsView;
}

export default function App({
  workspace,
  navigation,
  providerSettings
}: AppProps) {
  const modeCount = [workspace, navigation, providerSettings].filter(
    Boolean
  ).length;
  return (
    <main className="app-shell">
      {modeCount === 1 && navigation ? (
        <ConversationWorkspace navigation={navigation} />
      ) : modeCount === 1 && workspace ? (
        <ChatWorkspace key={workspace.id} workspace={workspace} />
      ) : modeCount === 1 && providerSettings ? (
        <ProviderSettingsScreen view={providerSettings} />
      ) : (
        <section
          className="unavailable-workspace"
          aria-labelledby="workspace-title"
        >
          <p className="eyebrow">EOUS</p>
          <h1 id="workspace-title">Your conversational workspace</h1>
          <p className="summary">
            {modeCount > 1
              ? "Chat is unavailable. Check your workspace configuration."
              : "Chat is currently unavailable. Once your workspace is configured, you can describe a goal and work with the Agent here."}
          </p>
        </section>
      )}
    </main>
  );
}
