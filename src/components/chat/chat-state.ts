import type { ConversationMessage } from "../../conversation";

export interface ChatAttempt {
  id: string;
  prompt: string;
}

export interface ChatState {
  draft: string;
  history: ConversationMessage[];
  pending: ChatAttempt | null;
  retryId: string | null;
  failed: boolean;
}

type ChatAction =
  | { type: "edit"; draft: string }
  | { type: "start"; attempt: ChatAttempt }
  | { type: "success"; history: ConversationMessage[] }
  | { type: "failure" };

export function initialChatState(history: ConversationMessage[]): ChatState {
  return { draft: "", history, pending: null, retryId: null, failed: false };
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
      return { ...state, draft: action.draft, retryId: null, failed: false };
    case "start":
      if (state.pending) return state;
      return { ...state, pending: action.attempt, failed: false };
    case "success":
      return initialChatState(action.history);
    case "failure":
      return {
        ...state,
        pending: null,
        retryId: state.pending?.id ?? state.retryId,
        failed: true
      };
  }
}
