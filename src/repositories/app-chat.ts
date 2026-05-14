import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type AppChatRole = "user" | "assistant";
export type AppChatSource = "app_text" | "app_voice_message" | "system";
export type AppChatAudioGenerationStatus = "none" | "pending" | "ready" | "failed";

export type AppChatMessage = {
  id: number;
  conversationId: number | null;
  role: AppChatRole;
  content: string;
  source: AppChatSource;
  audioGenerationStatus: AppChatAudioGenerationStatus;
  audioProvider: string | null;
  audioError: string | null;
  audioGeneratedFromMessageId: number | null;
  audioGeneratedAt: string | null;
  createdAt: string;
};

type AppChatMessageRow = {
  id: number;
  conversation_id: number | null;
  role: AppChatRole;
  content: string;
  source: AppChatSource;
  audio_generation_status: AppChatAudioGenerationStatus;
  audio_provider: string | null;
  audio_error: string | null;
  audio_generated_from_message_id: number | null;
  audio_generated_at: string | null;
  created_at: string;
};

export type CreateAppChatMessageInput = {
  conversationId?: number | null;
  role: AppChatRole;
  content: string;
  source?: AppChatSource;
  audioGenerationStatus?: AppChatAudioGenerationStatus;
  audioProvider?: string | null;
  audioError?: string | null;
  audioGeneratedFromMessageId?: number | null;
  audioGeneratedAt?: string | null;
};

export type UpdateAppChatMessageAudioInput = {
  id: number;
  audioGenerationStatus: AppChatAudioGenerationStatus;
  audioProvider?: string | null;
  audioError?: string | null;
  audioGeneratedFromMessageId?: number | null;
  audioGeneratedAt?: string | null;
};

function toMessage(row: AppChatMessageRow): AppChatMessage {
  return {
    id: row.id,
    conversationId: row.conversation_id,
    role: row.role,
    content: row.content,
    source: row.source,
    audioGenerationStatus: row.audio_generation_status,
    audioProvider: row.audio_provider,
    audioError: row.audio_error,
    audioGeneratedFromMessageId: row.audio_generated_from_message_id,
    audioGeneratedAt: row.audio_generated_at,
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
        `insert into app_chat_messages
          (conversation_id, role, content, source, audio_generation_status, audio_provider, audio_error, audio_generated_from_message_id, audio_generated_at, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.conversationId ?? null,
        input.role,
        input.content,
        input.source ?? "app_text",
        input.audioGenerationStatus ?? "none",
        input.audioProvider ?? null,
        input.audioError ?? null,
        input.audioGeneratedFromMessageId ?? null,
        input.audioGeneratedAt ?? null,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  updateAudio(input: UpdateAppChatMessageAudioInput, now = nowIso()): AppChatMessage {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`App chat message not found: ${input.id}`);
    }

    this.db
      .prepare(
        `update app_chat_messages
         set audio_generation_status = ?,
             audio_provider = ?,
             audio_error = ?,
             audio_generated_from_message_id = ?,
             audio_generated_at = ?
         where id = ?`
      )
      .run(
        input.audioGenerationStatus,
        input.audioProvider === undefined ? existing.audioProvider : input.audioProvider,
        input.audioError === undefined ? existing.audioError : input.audioError,
        input.audioGeneratedFromMessageId === undefined ? existing.audioGeneratedFromMessageId : input.audioGeneratedFromMessageId,
        input.audioGeneratedAt === undefined ? existing.audioGeneratedAt : input.audioGeneratedAt,
        input.id
      );

    return this.findById(input.id)!;
  }

  findById(id: number): AppChatMessage | null {
    const row = this.db.prepare("select * from app_chat_messages where id = ?").get(id) as AppChatMessageRow | undefined;
    return row ? toMessage(row) : null;
  }
}
