import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type AppChatRole = "user" | "assistant";
export type AppChatSource = "app_text" | "app_voice_message" | "system";

export type AppChatMessage = {
  id: number;
  conversationId: number | null;
  role: AppChatRole;
  content: string;
  source: AppChatSource;
  thinkingSpaceId: number | null;
  createdAt: string;
};

type AppChatMessageRow = {
  id: number;
  conversation_id: number | null;
  role: AppChatRole;
  content: string;
  source: AppChatSource;
  thinking_space_id: number | null;
  created_at: string;
};

export type CreateAppChatMessageInput = {
  conversationId?: number | null;
  role: AppChatRole;
  content: string;
  source?: AppChatSource;
  thinkingSpaceId?: number | null;
};

function toMessage(row: AppChatMessageRow): AppChatMessage {
    return {
      id: row.id,
      conversationId: row.conversation_id,
      role: row.role,
    content: row.content,
    source: row.source,
    thinkingSpaceId: row.thinking_space_id,
    createdAt: row.created_at
  };
}

export class AppChatRepository {
  constructor(private readonly db: Database.Database) {}

  list(limit = 80, filters: { conversationId?: number | null } = {}): AppChatMessage[] {
    const where = filters.conversationId === undefined ? "" : "where conversation_id is ?";
    const params = filters.conversationId === undefined ? [limit] : [filters.conversationId, limit];
    const rows = this.db
      .prepare(`select * from app_chat_messages ${where} order by created_at desc, id desc limit ?`)
      .all(...params) as AppChatMessageRow[];

    return rows.reverse().map(toMessage);
  }

  create(input: CreateAppChatMessageInput, now = nowIso()): AppChatMessage {
    const result = this.db
      .prepare(
        "insert into app_chat_messages (conversation_id, role, content, source, thinking_space_id, created_at) values (?, ?, ?, ?, ?, ?)"
      )
      .run(input.conversationId ?? null, input.role, input.content, input.source ?? "app_text", input.thinkingSpaceId ?? null, now);

    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): AppChatMessage | null {
    const row = this.db.prepare("select * from app_chat_messages where id = ?").get(id) as AppChatMessageRow | undefined;
    return row ? toMessage(row) : null;
  }
}
