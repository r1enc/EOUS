import { getSqliteConnection } from "./connection";

export interface StoredConversation {
  id: string;
  title: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface StoredConversationMessage {
  id: string;
  conversationId: string;
  role: string;
  content: string;
  createdAt: number;
}

export interface ConversationStorage {
  insertConversation(conversation: StoredConversation): Promise<void>;
  getConversation(id: string): Promise<StoredConversation | undefined>;
  listConversations(): Promise<StoredConversation[]>;
  insertMessage(message: StoredConversationMessage): Promise<void>;
  insertCompletedTurn(
    user: StoredConversationMessage,
    assistant: StoredConversationMessage
  ): Promise<void>;
  getMessages(conversationId: string): Promise<StoredConversationMessage[]>;
}

interface SqliteConnection {
  execute(query: string, bindValues?: unknown[]): Promise<unknown>;
  select<T>(query: string, bindValues?: unknown[]): Promise<T>;
}

export class SqliteConversationStorage implements ConversationStorage {
  constructor(
    private readonly getConnection: () => Promise<SqliteConnection> = getSqliteConnection
  ) {}

  async insertConversation(conversation: StoredConversation): Promise<void> {
    requireId(conversation.id);
    requireTimestamp(conversation.createdAt);
    requireTimestamp(conversation.updatedAt);
    const database = await this.getConnection();
    await database.execute(
      "INSERT INTO conversations (id, title, created_at, updated_at) VALUES ($1, $2, $3, $4)",
      [
        conversation.id,
        conversation.title,
        conversation.createdAt,
        conversation.updatedAt
      ]
    );
  }

  async getConversation(id: string): Promise<StoredConversation | undefined> {
    requireId(id);
    const database = await this.getConnection();
    const rows = await database.select<StoredConversation[]>(
      "SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM conversations WHERE id = $1",
      [id]
    );
    return rows[0];
  }

  async listConversations(): Promise<StoredConversation[]> {
    const database = await this.getConnection();
    return database.select<StoredConversation[]>(
      "SELECT id, title, created_at AS createdAt, updated_at AS updatedAt FROM conversations ORDER BY updated_at DESC, id ASC"
    );
  }

  async insertMessage(message: StoredConversationMessage): Promise<void> {
    requireId(message.id);
    requireId(message.conversationId);
    requireTimestamp(message.createdAt);
    const database = await this.getConnection();
    await database.execute(
      "INSERT INTO conversation_messages (id, conversation_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5)",
      [
        message.id,
        message.conversationId,
        message.role,
        message.content,
        message.createdAt
      ]
    );
  }

  async insertCompletedTurn(
    user: StoredConversationMessage,
    assistant: StoredConversationMessage
  ): Promise<void> {
    for (const message of [user, assistant]) {
      requireId(message.id);
      requireId(message.conversationId);
      requireTimestamp(message.createdAt);
      if (typeof message.content !== "string") {
        throw new TypeError("Message content must be a string");
      }
    }
    if (
      user.role !== "user" ||
      assistant.role !== "assistant" ||
      user.conversationId !== assistant.conversationId ||
      user.createdAt !== assistant.createdAt ||
      user.id === assistant.id
    ) {
      throw new TypeError("A matching user and assistant turn is required");
    }

    const database = await this.getConnection();
    await database.execute(
      "INSERT OR ABORT INTO conversation_messages (id, conversation_id, role, content, created_at) VALUES ($1, $2, $3, $4, $5), ($6, $7, $8, $9, $10)",
      [
        user.id,
        user.conversationId,
        user.role,
        user.content,
        user.createdAt,
        assistant.id,
        assistant.conversationId,
        assistant.role,
        assistant.content,
        assistant.createdAt
      ]
    );
  }

  async getMessages(
    conversationId: string
  ): Promise<StoredConversationMessage[]> {
    requireId(conversationId);
    const database = await this.getConnection();
    return database.select<StoredConversationMessage[]>(
      // rowid preserves insertion order when millisecond timestamps collide.
      "SELECT id, conversation_id AS conversationId, role, content, created_at AS createdAt FROM conversation_messages WHERE conversation_id = $1 ORDER BY created_at ASC, rowid ASC",
      [conversationId]
    );
  }
}

function requireId(id: string): void {
  if (typeof id !== "string" || id.trim() === "") {
    throw new TypeError("A non-empty storage ID is required");
  }
}

function requireTimestamp(timestamp: number): void {
  if (!Number.isSafeInteger(timestamp)) {
    throw new TypeError("A millisecond timestamp is required");
  }
}
