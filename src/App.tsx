import { ChatWorkspace } from "./components/chat/ChatWorkspace";
import type { Workspace } from "./workspace";

interface AppProps {
  workspace?: Workspace;
}

export default function App({ workspace }: AppProps) {
  return (
    <main className="app-shell">
      {workspace ? (
        <ChatWorkspace key={workspace.id} workspace={workspace} />
      ) : (
        <section
          className="unavailable-workspace"
          aria-labelledby="workspace-title"
        >
          <p className="eyebrow">EOUS</p>
          <h1 id="workspace-title">Your conversational workspace</h1>
          <p className="summary">
            Chat is currently unavailable. Once your workspace is configured,
            you can describe a goal and work with the Agent here.
          </p>
        </section>
      )}
    </main>
  );
}
