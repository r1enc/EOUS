import { relations } from "drizzle-orm";
import { index, integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const conversations = sqliteTable("conversations", {
  id: text("id").primaryKey(),
  title: text("title"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const conversationMessages = sqliteTable(
  "conversation_messages",
  {
    id: text("id").primaryKey(),
    conversationId: text("conversation_id")
      .notNull()
      .references(() => conversations.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    content: text("content").notNull(),
    createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull()
  },
  (table) => [
    index("conversation_messages_conversation_id_idx").on(table.conversationId)
  ]
);

export const memories = sqliteTable("memories", {
  id: text("id").primaryKey(),
  content: text("content").notNull(),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const providers = sqliteTable("providers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const tools = sqliteTable("tools", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  metadata: text("metadata"),
  createdAt: integer("created_at", { mode: "timestamp_ms" }).notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const appSettings = sqliteTable("app_settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: integer("updated_at", { mode: "timestamp_ms" }).notNull()
});

export const conversationsRelations = relations(conversations, ({ many }) => ({
  messages: many(conversationMessages)
}));

export const conversationMessagesRelations = relations(
  conversationMessages,
  ({ one }) => ({
    conversation: one(conversations, {
      fields: [conversationMessages.conversationId],
      references: [conversations.id]
    })
  })
);

export type Conversation = typeof conversations.$inferSelect;
export type NewConversation = typeof conversations.$inferInsert;

export type ConversationMessage = typeof conversationMessages.$inferSelect;
export type NewConversationMessage = typeof conversationMessages.$inferInsert;

export type Memory = typeof memories.$inferSelect;
export type NewMemory = typeof memories.$inferInsert;

export type Provider = typeof providers.$inferSelect;
export type NewProvider = typeof providers.$inferInsert;

export type Tool = typeof tools.$inferSelect;
export type NewTool = typeof tools.$inferInsert;

export type AppSetting = typeof appSettings.$inferSelect;
export type NewAppSetting = typeof appSettings.$inferInsert;
