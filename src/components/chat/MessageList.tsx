import { useEffect, useRef } from "react";
import type { ConversationMessage } from "../../conversation";
import type { ChatAttempt, ChatState } from "./chat-state";

const roleLabels = {
  user: "You",
  assistant: "Agent",
  system: "System",
  tool: "Tool"
};

interface MessageListProps {
  history: ConversationMessage[];
  pending: ChatAttempt | null;
  streamedAssistant: ChatState["streamedAssistant"];
}

export function MessageList({
  history,
  pending,
  streamedAssistant
}: MessageListProps) {
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [history, pending, streamedAssistant?.content]);

  return (
    <div
      className="conversation-panel"
      role="region"
      aria-label="Conversation messages"
      tabIndex={0}
    >
      {history.length === 0 && !pending && (
        <div className="empty-conversation">
          <h2>What would you like to accomplish?</h2>
          <p>
            Describe your goal below to begin a conversation with the EOUS
            Agent.
          </p>
        </div>
      )}
      <ol className="message-list">
        {history.map((message) => (
          <li key={message.id} className={`message message-${message.role}`}>
            <p className="message-role">{roleLabels[message.role]}</p>
            <p className="message-content">{message.content}</p>
          </li>
        ))}
        {pending && (
          <li className="message message-user message-pending">
            <p className="message-role">
              You <span>· Pending</span>
            </p>
            <p className="message-content">{pending.prompt}</p>
          </li>
        )}
        {pending && streamedAssistant?.attemptId === pending.id && (
          <li className="message message-assistant message-streaming">
            <p className="message-role">
              Agent <span>· Responding</span>
            </p>
            <p className="message-content">{streamedAssistant.content}</p>
          </li>
        )}
      </ol>
      <div ref={end} />
    </div>
  );
}
