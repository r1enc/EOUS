import { useEffect, useReducer, useRef } from "react";
import type { Workspace } from "../../workspace";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { chatReducer, initialChatState, prepareAttempt } from "./chat-state";

interface ChatWorkspaceProps {
  workspace: Workspace;
  disabled?: boolean;
  canSubmit?: () => boolean;
  onBusyChange?: (busy: boolean) => void;
}

export function ChatWorkspace({
  workspace,
  disabled = false,
  canSubmit,
  onBusyChange
}: ChatWorkspaceProps) {
  const [state, dispatch] = useReducer(chatReducer, workspace, (current) =>
    initialChatState(current.getHistory())
  );
  const busy = useRef(false);
  const composer = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!state.pending && !disabled) composer.current?.focus();
  }, [state.pending, disabled]);

  async function submit() {
    // React state updates are batched; lock immediately for repeated send events.
    if (busy.current || disabled || canSubmit?.() === false) return;
    busy.current = true;
    let started = false;
    try {
      const attempt = prepareAttempt(state, () => crypto.randomUUID());
      if (!attempt) return;
      started = true;
      onBusyChange?.(true);
      dispatch({ type: "start", attempt });
      const response = await workspace.execute({
        ...attempt,
        context: { conversationId: workspace.id }
      });
      if (response.status === "success") {
        dispatch({ type: "success", history: workspace.getHistory() });
      } else {
        dispatch({ type: "failure" });
      }
    } catch {
      dispatch({ type: "failure" });
    } finally {
      busy.current = false;
      if (started) onBusyChange?.(false);
    }
  }

  return (
    <section className="chat-workspace" aria-labelledby="conversation-title">
      <header className="workspace-header">
        <p className="eyebrow">EOUS</p>
        <h1 id="conversation-title">{workspace.title}</h1>
        <p>Work with the Agent</p>
      </header>
      <MessageList history={state.history} pending={state.pending} />
      <div className="composer-panel">
        <p className="chat-status" role="status">
          {state.pending
            ? "Working on your request…"
            : disabled
              ? "Loading conversation…"
              : "Ready for your next goal"}
        </p>
        {state.failed && (
          <p className="chat-error" role="alert">
            Your request could not be completed. Your message is still here;
            please try again.
          </p>
        )}
        <MessageComposer
          ref={composer}
          draft={state.draft}
          pending={Boolean(state.pending)}
          disabled={disabled}
          onChange={(draft) => dispatch({ type: "edit", draft })}
          onSubmit={submit}
        />
      </div>
    </section>
  );
}
