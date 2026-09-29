import type {
  PersistedConversationSession,
  SessionResult
} from "../conversation";
import type { Workspace } from "./createWorkspace";

export const untitledConversation = "Untitled conversation";

export interface ConversationNavigation {
  listConversations(): Promise<SessionResult<PersistedConversationSession[]>>;
  createConversation(): Promise<SessionResult<Workspace>>;
  openConversation(id: string): Promise<SessionResult<Workspace>>;
}
