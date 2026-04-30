import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type AppChatRole = "user" | "assistant";
export type AppChatSource = "app_text" | "app_voice_message" | "system";

export type AppChatMessage = {
  id: number;
  role: AppChatRole;
  content: string;
  source: AppChatSource;
  thinkingSpaceId: number | null;
  createdAt: string;
};

type AppChatMessageRow = {
  id: number;
  role: AppChatRole;
  content: string;
  source: AppChatSource;
  thinking_space_id: number | null;
  created_at: string;
};

export type CreateAppChatMessageInput = {
  role: AppChatRole;
  content: string;
  source?: AppChatSource;
  thinkingSpaceId?: number | null;
};

function toMessage(row: AppChatMessageRow): AppChatMessage {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    source: row.source,
    thinkingSpaceId: row.thinking_space_id,
    createdAt: row.created_at
  };
}

export class AppChatRepository {
  constructor(private readonly db: Database.Database) {}

  list(limit = 80): AppChatMessage[] {
    const rows = this.db
      .prepare("select * from app_chat_messages order by created_at desc, id desc limit ?")
      .all(limit) as AppChatMessageRow[];

    return rows.reverse().map(toMessage);
  }

  create(input: CreateAppChatMessageInput, now = nowIso()): AppChatMessage {
    const result = this.db
      .prepare("insert into app_chat_messages (role, content, source, thinking_space_id, created_at) values (?, ?, ?, ?, ?)")
      .run(input.role, input.content, input.source ?? "app_text", input.thinkingSpaceId ?? null, now);

    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): AppChatMessage | null {
    const row = this.db.prepare("select * from app_chat_messages where id = ?").get(id) as AppChatMessageRow | undefined;
    return row ? toMessage(row) : null;
  }
}
