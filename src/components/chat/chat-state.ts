import type { ConversationMessage } from "../../conversation";

export interface ChatAttempt {
  id: string;
  prompt: string;
}

export interface ChatState {
  draft: string;
  history: ConversationMessage[];
  pending: ChatAttempt | null;
  streamedAssistant: { attemptId: string; content: string } | null;
  retryId: string | null;
  failed: boolean;
  failureCode: string | null;
}

type ChatAction =
  | { type: "edit"; draft: string }
  | { type: "start"; attempt: ChatAttempt }
  | { type: "streamContent"; attemptId: string; delta: string }
  | { type: "reset"; history: ConversationMessage[] }
  | { type: "success"; history: ConversationMessage[] }
  | { type: "failure"; code?: string };

export function initialChatState(history: ConversationMessage[]): ChatState {
  return {
    draft: "",
    history,
    pending: null,
    streamedAssistant: null,
    retryId: null,
    failed: false,
    failureCode: null
  };
}

export function prepareAttempt(
  state: ChatState,
  createId: () => string
): ChatAttempt | null {
  if (state.pending || !state.draft.trim()) return null;
  return { id: state.retryId ?? createId(), prompt: state.draft };
}

export function chatReducer(state: ChatState, action: ChatAction): ChatState {
  switch (action.type) {
    case "edit":
      if (state.pending || action.draft === state.draft) return state;
      return {
        ...state,
        draft: action.draft,
        retryId: null,
        failed: false,
        failureCode: null
      };
    case "start":
      if (state.pending) return state;
      return {
        ...state,
        pending: action.attempt,
        streamedAssistant: null,
        failed: false,
        failureCode: null
      };
    case "streamContent":
      if (
        !state.pending ||
        state.pending.id !== action.attemptId ||
        !action.delta
      )
        return state;
      return {
        ...state,
        streamedAssistant: {
          attemptId: action.attemptId,
          content: (state.streamedAssistant?.content ?? "") + action.delta
        }
      };
    case "reset":
    case "success":
      return initialChatState(action.history);
    case "failure":
      return {
        ...state,
        pending: null,
        streamedAssistant: null,
        retryId: state.pending?.id ?? state.retryId,
        failed: true,
        failureCode: action.code ?? null
      };
  }
}
