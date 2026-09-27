import type {
  ConversationStorage,
  StoredConversation
} from "../infrastructure/database/conversation-storage";
import type { ConversationError } from "./error";

export interface PersistedConversationSession {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface CreateSessionInput {
  id: string;
  title: string | null;
}

export type SessionResult<T> =
  | { status: "success"; value: T }
  | { status: "failure"; error: ConversationError };

const invalidId: ConversationError = {
  code: "invalid_session_id",
  message: "Conversation ID must be a non-empty string",
  category: "validation"
};
const invalidTitle: ConversationError = {
  code: "invalid_session_title",
  message: "Conversation title must be a non-empty string or null",
  category: "validation"
};
const missingSession: ConversationError = {
  code: "session_not_found",
  message: "Conversation does not exist",
  category: "session"
};
const duplicateSession: ConversationError = {
  code: "session_already_exists",
  message: "Conversation already exists",
  category: "session"
};
const storageFailure: ConversationError = {
  code: "session_storage_failed",
  message: "Conversation storage failed",
  category: "session"
};

function failure<T>(error: ConversationError): SessionResult<T> {
  return { status: "failure", error };
}

function validId(id: unknown): id is string {
  return typeof id === "string" && id.trim() !== "";
}

function validTitle(title: unknown): title is string | null {
  return title === null || (typeof title === "string" && title.trim() !== "");
}

function toSession(
  conversation: StoredConversation
): PersistedConversationSession {
  return {
    id: conversation.id,
    title: conversation.title,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt
  };
}

export class ConversationSessionOperations {
  constructor(
    private readonly storage: ConversationStorage,
    private readonly now: () => number = Date.now
  ) {}

  async createSession(
    input: CreateSessionInput
  ): Promise<SessionResult<PersistedConversationSession>> {
    if (!validId(input?.id)) return failure(invalidId);
    if (!validTitle(input.title)) return failure(invalidTitle);

    try {
      if (await this.storage.getConversation(input.id)) {
        return failure(duplicateSession);
      }
      const timestamp = this.now();
      const session = {
        id: input.id,
        title: input.title,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      await this.storage.insertConversation(session);
      return { status: "success", value: session };
    } catch {
      return failure(storageFailure);
    }
  }

  async listSessions(): Promise<SessionResult<PersistedConversationSession[]>> {
    try {
      const sessions = await this.storage.listConversations();
      return { status: "success", value: sessions.map(toSession) };
    } catch {
      return failure(storageFailure);
    }
  }

  async loadSession(
    id: string
  ): Promise<SessionResult<PersistedConversationSession>> {
    if (!validId(id)) return failure(invalidId);

    try {
      const session = await this.storage.getConversation(id);
      return session
        ? { status: "success", value: toSession(session) }
        : failure(missingSession);
    } catch {
      return failure(storageFailure);
    }
  }

  async resumeSession(
    id: string
  ): Promise<SessionResult<PersistedConversationSession>> {
    return this.loadSession(id);
  }
}
