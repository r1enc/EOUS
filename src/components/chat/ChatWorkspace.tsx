import {
  useEffect,
  useLayoutEffect,
  useReducer,
  useRef,
  useSyncExternalStore
} from "react";
import type { Workspace } from "../../workspace";
import { MessageComposer } from "./MessageComposer";
import { MessageList } from "./MessageList";
import { PermissionDialog } from "./PermissionDialog";
import { chatReducer, initialChatState, prepareAttempt } from "./chat-state";

const noPending = () => null;
const noSubscription = () => () => {};

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
  const mounted = useRef(false);
  const runId = useRef(0);
  const currentWorkspace = useRef(workspace);
  const onBusyChangeRef = useRef(onBusyChange);
  const composer = useRef<HTMLTextAreaElement>(null);
  const interaction = workspace.permissionInteraction;
  const pendingPermission = useSyncExternalStore(
    interaction?.subscribe ?? noSubscription,
    interaction?.getPending ?? noPending,
    noPending
  );
  const decisions =
    workspace.getPermissionHistory?.().filter((entry) => entry.response) ?? [];
  const lastPermission = decisions[decisions.length - 1];

  useLayoutEffect(() => {
    currentWorkspace.current = workspace;
    mounted.current = true;
    const invalidateRun = () => {
      runId.current++;
    };
    return () => {
      mounted.current = false;
      invalidateRun();
      if (busy.current) {
        busy.current = false;
        onBusyChangeRef.current?.(false);
      }
    };
  }, [workspace]);

  useLayoutEffect(() => {
    onBusyChangeRef.current = onBusyChange;
  }, [onBusyChange]);

  const previousWorkspace = useRef(workspace);
  useLayoutEffect(() => {
    if (previousWorkspace.current === workspace) return;
    previousWorkspace.current = workspace;
    dispatch({ type: "reset", history: workspace.getHistory() });
  }, [workspace]);

  useEffect(() => {
    if (!state.pending && !disabled) composer.current?.focus();
  }, [state.pending, disabled]);

  async function submit() {
    // React state updates are batched; lock immediately for repeated send events.
    if (busy.current || disabled || canSubmit?.() === false) return;
    busy.current = true;
    const currentRun = ++runId.current;
    const active = () =>
      mounted.current &&
      runId.current === currentRun &&
      currentWorkspace.current === workspace;
    let started = false;
    try {
      const attempt = prepareAttempt(state, () => crypto.randomUUID());
      if (!attempt) return;
      started = true;
      onBusyChange?.(true);
      dispatch({ type: "start", attempt });
      const request = {
        ...attempt,
        context: { conversationId: workspace.id }
      };
      if (typeof workspace.executeStream === "function") {
        let terminalAccepted = false;
        for await (const event of workspace.executeStream(request)) {
          if (!active()) continue;
          if (!event || typeof event !== "object")
            throw new Error("Invalid Workspace stream event");
          if (event.type === "content") {
            if (typeof event.delta !== "string")
              throw new Error("Invalid Workspace content event");
            dispatch({
              type: "streamContent",
              attemptId: attempt.id,
              delta: event.delta
            });
            continue;
          }
          if (event.type !== "complete" && event.type !== "failure")
            throw new Error("Unknown Workspace stream event");
          const response = event.response;
          if (
            !response ||
            response.id !== attempt.id ||
            typeof response.content !== "string" ||
            response.status !==
              (event.type === "complete" ? "success" : "failure") ||
            (response.error !== undefined &&
              (typeof response.error !== "object" ||
                response.error === null ||
                typeof response.error.code !== "string"))
          )
            throw new Error("Invalid Workspace terminal event");
          if (event.type === "complete") {
            const history = workspace.getHistory();
            dispatch({ type: "success", history });
          } else {
            dispatch({ type: "failure", code: response.error?.code });
          }
          terminalAccepted = true;
          break;
        }
        if (!terminalAccepted && active()) dispatch({ type: "failure" });
      } else {
        const response = await workspace.execute(request);
        if (active()) {
          if (response.status === "success") {
            dispatch({ type: "success", history: workspace.getHistory() });
          } else {
            dispatch({ type: "failure", code: response.error?.code });
          }
        }
      }
    } catch {
      if (active()) dispatch({ type: "failure" });
    } finally {
      if (runId.current === currentRun) {
        busy.current = false;
        if (started) onBusyChange?.(false);
      }
    }
  }

  return (
    <section className="chat-workspace" aria-labelledby="conversation-title">
      <header className="workspace-header">
        <p className="eyebrow">EOUS</p>
        <h1 id="conversation-title">{workspace.title}</h1>
        <p>Work with the Agent</p>
      </header>
      <MessageList
        history={state.history}
        pending={state.pending}
        streamedAssistant={state.streamedAssistant}
      />
      <div className="composer-panel">
        <p className="chat-status" role="status">
          {pendingPermission
            ? "Awaiting your approval…"
            : state.pending
              ? "Working on your request…"
              : disabled
                ? "Loading conversation…"
                : "Ready for your next goal"}
        </p>
        {state.failed && (
          <p className="chat-error" role="alert">
            {state.failureCode === "PERMISSION_DENIED"
              ? "The requested action was not approved. Your message is still here."
              : "Your request could not be completed. Your message is still here; please try again."}
          </p>
        )}
        {!state.pending && lastPermission?.response && (
          <p className="permission-outcome" role="status">
            Last permission: {lastPermission.request.permission.name} —{" "}
            {lastPermission.response.decision === "granted"
              ? "granted"
              : "denied"}
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
      {interaction && (
        <PermissionDialog
          interaction={interaction}
          pending={pendingPermission}
        />
      )}
    </section>
  );
}
