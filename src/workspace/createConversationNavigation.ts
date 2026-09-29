import {
  ConversationSessionOperations,
  type ConversationMessage,
  type SessionResult
} from "../conversation";
import type { ConversationStorage } from "../infrastructure/database/conversation-storage";
import {
  createWorkspace,
  type Workspace,
  type WorkspaceConfig
} from "./createWorkspace";
import {
  untitledConversation,
  type ConversationNavigation
} from "./conversation-navigation";

export interface ConversationNavigationConfig {
  storage: ConversationStorage;
  workspaceConfig: Omit<
    WorkspaceConfig,
    | "conversationId"
    | "conversationTitle"
    | "initialHistory"
    | "conversationPersistence"
  >;
  createId?: () => string;
}

function unavailable(): SessionResult<Workspace> {
  return {
    status: "failure",
    error: {
      code: "workspace_unavailable",
      category: "session",
      message: "The conversational workspace is unavailable"
    }
  };
}

export function createConversationNavigation({
  storage,
  workspaceConfig,
  createId = () => crypto.randomUUID()
}: ConversationNavigationConfig): ConversationNavigation {
  const sessions = new ConversationSessionOperations(storage);
  function build(
    id: string,
    title: string | null,
    history: ConversationMessage[]
  ): Workspace {
    return createWorkspace({
      ...workspaceConfig,
      conversationId: id,
      conversationTitle: title ?? untitledConversation,
      initialHistory: history,
      conversationPersistence: storage
    });
  }
  return {
    listConversations: () => sessions.listSessions(),
    async createConversation() {
      try {
        const id = createId();
        // Construction has no execution or persistence side effects. Reuse this
        // instance only after the session insertion is confirmed.
        const workspace = build(id, null, []);
        const created = await sessions.createSession({ id, title: null });
        if (created.status === "failure") return created;
        return { status: "success", value: workspace };
      } catch {
        return unavailable();
      }
    },
    async openConversation(id) {
      try {
        const session = await sessions.resumeSession(id);
        if (session.status === "failure") return session;
        const history = await sessions.loadHistory(session.value.id);
        if (history.status === "failure") return history;
        return {
          status: "success",
          value: build(session.value.id, session.value.title, history.value)
        };
      } catch {
        return unavailable();
      }
    }
  };
}
