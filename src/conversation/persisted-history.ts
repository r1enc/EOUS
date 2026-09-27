import type { StoredConversationMessage } from "../infrastructure/database/conversation-storage";
import type { ConversationMessage, ConversationMessageRole } from "./history";

const roles: ConversationMessageRole[] = [
  "user",
  "assistant",
  "system",
  "tool"
];

export function persistedMessageId(
  conversationId: string,
  messageId: string
): string {
  return JSON.stringify(["eous-turn-v1", conversationId, messageId]);
}

function publicMessageId(
  message: StoredConversationMessage
): string | undefined {
  try {
    const parts: unknown = JSON.parse(message.id);
    if (Array.isArray(parts) && parts[0] === "eous-turn-v1") {
      return parts.length === 3 &&
        parts[1] === message.conversationId &&
        typeof parts[2] === "string"
        ? parts[2]
        : undefined;
    }
  } catch {
    // Existing storage rows retain their original IDs.
  }
  return message.id;
}

export function toConversationMessage(
  message: StoredConversationMessage,
  conversationId: string
): ConversationMessage | undefined {
  if (
    message.conversationId !== conversationId ||
    typeof message.id !== "string" ||
    message.id.trim() === "" ||
    !roles.includes(message.role as ConversationMessageRole) ||
    typeof message.content !== "string" ||
    !Number.isSafeInteger(message.createdAt) ||
    !Number.isFinite(new Date(message.createdAt).getTime())
  ) {
    return undefined;
  }
  const id = publicMessageId(message);
  if (!id || id.trim() === "") return undefined;
  return {
    id,
    role: message.role as ConversationMessageRole,
    content: message.content,
    timestamp: new Date(message.createdAt).toISOString()
  };
}

export function toConversationHistory(
  rows: StoredConversationMessage[],
  conversationId: string
): ConversationMessage[] | undefined {
  const messages: ConversationMessage[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const message = toConversationMessage(row, conversationId);
    if (!message || ids.has(message.id)) return undefined;
    ids.add(message.id);
    messages.push(message);
  }
  return messages;
}

export type CompletedTurnLookup =
  | { kind: "none" }
  | { kind: "conflict" }
  | {
      kind: "complete";
      user: ConversationMessage;
      assistant: ConversationMessage;
    };

export function findCompletedTurn(
  rows: StoredConversationMessage[],
  conversationId: string,
  requestId: string,
  prompt: string,
  expectedAssistant?: string,
  expectedTime?: number
): CompletedTurnLookup {
  const userId = `${requestId}:user`;
  const assistantId = `${requestId}:assistant`;
  const userKeys = [userId, persistedMessageId(conversationId, userId)];
  const assistantKeys = [
    assistantId,
    persistedMessageId(conversationId, assistantId)
  ];
  const users = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => userKeys.includes(row.id));
  const assistants = rows
    .map((row, index) => ({ row, index }))
    .filter(({ row }) => assistantKeys.includes(row.id));

  if (users.length === 0 && assistants.length === 0) return { kind: "none" };
  if (users.length !== 1 || assistants.length !== 1) {
    return { kind: "conflict" };
  }

  const user = toConversationMessage(users[0].row, conversationId);
  const assistant = toConversationMessage(assistants[0].row, conversationId);
  if (
    !user ||
    !assistant ||
    user.id !== userId ||
    assistant.id !== assistantId ||
    user.role !== "user" ||
    assistant.role !== "assistant" ||
    user.content !== prompt ||
    users[0].index >= assistants[0].index ||
    users[0].row.createdAt !== assistants[0].row.createdAt ||
    (expectedAssistant !== undefined &&
      assistant.content !== expectedAssistant) ||
    (expectedTime !== undefined && users[0].row.createdAt !== expectedTime)
  ) {
    return { kind: "conflict" };
  }
  return { kind: "complete", user, assistant };
}
