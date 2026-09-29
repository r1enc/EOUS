import { Plus } from "lucide-react";
import type { PersistedConversationSession } from "../../conversation";
import { untitledConversation } from "../../workspace/conversation-navigation";
import { Button } from "../ui/button";

interface ConversationNavigationProps {
  sessions: PersistedConversationSession[];
  activeId?: string;
  loading: boolean;
  failed: boolean;
  disabled: boolean;
  onCreate: () => void;
  onSelect: (id: string) => void;
  onRetry: () => void;
}

export function ConversationNavigation({
  sessions,
  activeId,
  loading,
  failed,
  disabled,
  onCreate,
  onSelect,
  onRetry
}: ConversationNavigationProps) {
  return (
    <nav className="conversation-navigation" aria-label="Conversation history">
      <p className="eyebrow">EOUS</p>
      <h2>Conversations</h2>
      <Button onClick={onCreate} disabled={disabled}>
        <Plus aria-hidden="true" /> New conversation
      </Button>
      {loading && (
        <p className="navigation-status" role="status">
          Loading conversations…
        </p>
      )}
      {failed && (
        <div className="navigation-error" role="alert">
          <p>Could not load conversations. Please try again.</p>
          <Button variant="outline" onClick={onRetry} disabled={loading}>
            Retry list
          </Button>
        </div>
      )}
      {!loading && !failed && sessions.length === 0 && (
        <p className="navigation-status">No saved conversations yet.</p>
      )}
      <ul className="conversation-list">
        {sessions.map((session) => (
          <li key={session.id}>
            <button
              type="button"
              className="conversation-entry"
              disabled={disabled}
              aria-current={session.id === activeId ? "true" : undefined}
              onClick={() => onSelect(session.id)}
            >
              <span>{session.title ?? untitledConversation}</span>
              {session.id === activeId && (
                <span className="selected-label">Active</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
