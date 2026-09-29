import { ChatWorkspace } from "./components/chat/ChatWorkspace";
import { ConversationWorkspace } from "./components/conversations/ConversationWorkspace";
import type { ConversationNavigation, Workspace } from "./workspace";

type AppProps =
  | { workspace?: Workspace; navigation?: never }
  | { navigation: ConversationNavigation; workspace?: never };

export default function App({ workspace, navigation }: AppProps) {
  return (
    <main className="app-shell">
      {navigation && !workspace ? (
        <ConversationWorkspace navigation={navigation} />
      ) : workspace && !navigation ? (
        <ChatWorkspace key={workspace.id} workspace={workspace} />
      ) : (
        <section
          className="unavailable-workspace"
          aria-labelledby="workspace-title"
        >
          <p className="eyebrow">EOUS</p>
          <h1 id="workspace-title">Your conversational workspace</h1>
          <p className="summary">
            {workspace && navigation
              ? "Chat is unavailable. Check your workspace configuration."
              : "Chat is currently unavailable. Once your workspace is configured, you can describe a goal and work with the Agent here."}
          </p>
        </section>
      )}
    </main>
  );
}
