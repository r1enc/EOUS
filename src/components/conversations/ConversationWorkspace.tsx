import { useCallback, useEffect, useRef, useState } from "react";
import type { PersistedConversationSession } from "../../conversation";
import type {
  ConversationNavigation as Navigation,
  Workspace
} from "../../workspace";
import { ChatWorkspace } from "../chat/ChatWorkspace";
import { ConversationNavigation } from "./ConversationNavigation";

function initialView(navigation: Navigation) {
  return {
    navigation,
    sessions: [] as PersistedConversationSession[],
    active: null as Workspace | null,
    loading: true,
    listFailed: false,
    pending: null as "create" | "open" | null,
    error: null as string | null,
    chatBusy: false
  };
}

export function ConversationWorkspace({
  navigation
}: {
  navigation: Navigation;
}) {
  const [view, setView] = useState(() => initialView(navigation));
  if (view.navigation !== navigation) setView(initialView(navigation));
  const control = useRef({
    source: navigation,
    mounted: false,
    generation: 0,
    list: 0,
    operation: 0,
    navigationBusy: false,
    chatBusy: false
  });

  const loadList = useCallback(() => {
    const current = control.current;
    if (!current.mounted || current.source !== navigation) return;
    const generation = current.generation;
    const request = ++current.list;
    const valid = () =>
      current.mounted &&
      current.generation === generation &&
      current.list === request;
    void Promise.resolve()
      .then(() => navigation.listConversations())
      .then((result) => {
        if (!valid()) return;
        setView((previous) => ({
          ...previous,
          loading: false,
          listFailed: result.status === "failure",
          sessions:
            result.status === "success" ? result.value : previous.sessions
        }));
      })
      .catch(() => {
        if (valid())
          setView((previous) => ({
            ...previous,
            loading: false,
            listFailed: true
          }));
      });
  }, [navigation]);

  function refreshList() {
    setView((previous) => ({ ...previous, loading: true }));
    void loadList();
  }

  useEffect(() => {
    const current = control.current;
    current.source = navigation;
    current.mounted = true;
    current.navigationBusy = false;
    current.chatBusy = false;
    current.generation++;
    void loadList();
    return () => {
      current.mounted = false;
      current.generation++;
    };
  }, [navigation, loadList]);

  async function navigate(kind: "create" | "open", id?: string) {
    const current = control.current;
    if (
      !current.mounted ||
      current.source !== navigation ||
      current.navigationBusy ||
      current.chatBusy
    )
      return;
    if (kind === "open" && id === view.active?.id) return;
    current.navigationBusy = true;
    const generation = current.generation;
    const operation = ++current.operation;
    const valid = () =>
      current.mounted &&
      current.generation === generation &&
      current.operation === operation;
    const error =
      kind === "create"
        ? "Could not create a conversation. Please try again."
        : "Could not open that conversation. Please try again.";
    setView((previous) => ({ ...previous, pending: kind, error: null }));
    try {
      const result =
        kind === "create"
          ? await navigation.createConversation()
          : await navigation.openConversation(id!);
      if (!valid()) return;
      if (result.status === "success") {
        setView((previous) => ({ ...previous, active: result.value }));
      } else {
        setView((previous) => ({ ...previous, error }));
      }
    } catch {
      if (valid()) setView((previous) => ({ ...previous, error }));
    } finally {
      if (valid()) {
        current.navigationBusy = false;
        setView((previous) => ({ ...previous, pending: null }));
        if (kind === "create") void refreshList();
      }
    }
  }

  function onBusyChange(busy: boolean) {
    const current = control.current;
    if (!current.mounted || current.source !== navigation) return;
    current.chatBusy = busy;
    setView((previous) => ({ ...previous, chatBusy: busy }));
    if (!busy) void refreshList();
  }

  function canSubmit() {
    const current = control.current;
    return (
      current.mounted &&
      current.source === navigation &&
      !current.navigationBusy &&
      !current.chatBusy
    );
  }

  return (
    <div className="conversation-workspace">
      <ConversationNavigation
        sessions={view.sessions}
        activeId={view.active?.id}
        loading={view.loading}
        failed={view.listFailed}
        disabled={view.chatBusy || Boolean(view.pending)}
        onCreate={() => {
          void navigate("create");
        }}
        onSelect={(id) => {
          void navigate("open", id);
        }}
        onRetry={() => {
          void refreshList();
        }}
      />
      <div className="active-conversation">
        {view.pending && (
          <p className="navigation-feedback" role="status">
            {view.pending === "create"
              ? "Creating conversation…"
              : "Opening conversation…"}
          </p>
        )}
        {view.error && (
          <p className="navigation-feedback chat-error" role="alert">
            {view.error}
          </p>
        )}
        {view.chatBusy && (
          <p className="navigation-feedback" role="status">
            Conversation navigation is paused until your request finishes.
          </p>
        )}
        {view.active ? (
          <ChatWorkspace
            key={view.active.id}
            workspace={view.active}
            disabled={Boolean(view.pending)}
            canSubmit={canSubmit}
            onBusyChange={onBusyChange}
          />
        ) : (
          <section
            className="no-active-conversation"
            aria-labelledby="empty-workspace-title"
          >
            <h1 id="empty-workspace-title">Start a conversation</h1>
            <p>
              No conversation is active. Choose a saved conversation or use New
              conversation to begin working with the Agent.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
