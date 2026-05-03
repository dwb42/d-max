import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type ConversationContextType = "global" | "initiatives" | "category" | "initiative" | "task";

export type AppConversation = {
  id: number;
  title: string | null;
  contextType: ConversationContextType;
  contextEntityId: number | null;
  createdAt: string;
  updatedAt: string;
};

type AppConversationRow = {
  id: number;
  title: string | null;
  context_type: ConversationContextType;
  context_entity_id: number | null;
  created_at: string;
  updated_at: string;
};

export type CreateAppConversationInput = {
  title?: string | null;
  contextType: ConversationContextType;
  contextEntityId?: number | null;
};

function toConversation(row: AppConversationRow): AppConversation {
  return {
    id: row.id,
    title: row.title,
    contextType: row.context_type,
    contextEntityId: row.context_entity_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class AppConversationRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): AppConversation | null {
    const row = this.db.prepare("select * from app_conversations where id = ?").get(id) as AppConversationRow | undefined;
    return row ? toConversation(row) : null;
  }

  findLatestByContext(input: { contextType: ConversationContextType; contextEntityId?: number | null }): AppConversation | null {
    const entityId = normalizedEntityId(input.contextType, input.contextEntityId);
    const row = this.db
      .prepare(
        `select * from app_conversations
         where context_type = ? and context_entity_id is ?
         order by updated_at desc, id desc
         limit 1`
      )
      .get(input.contextType, entityId) as AppConversationRow | undefined;

    return row ? toConversation(row) : null;
  }

  listByContext(input: { contextType: ConversationContextType; contextEntityId?: number | null }): AppConversation[] {
    const entityId = normalizedEntityId(input.contextType, input.contextEntityId);
    const rows = this.db
      .prepare(
        `select * from app_conversations
         where context_type = ? and context_entity_id is ?
         order by updated_at desc, id desc`
      )
      .all(input.contextType, entityId) as AppConversationRow[];

    return rows.map(toConversation);
  }

  create(input: CreateAppConversationInput, now = nowIso()): AppConversation {
    const entityId = normalizedEntityId(input.contextType, input.contextEntityId);
    const result = this.db
      .prepare(
        "insert into app_conversations (title, context_type, context_entity_id, created_at, updated_at) values (?, ?, ?, ?, ?)"
      )
      .run(input.title ?? null, input.contextType, entityId, now, now);

    return this.findById(Number(result.lastInsertRowid))!;
  }

  updateTitle(id: number, title: string | null): AppConversation {
    this.db.prepare("update app_conversations set title = ? where id = ?").run(title, id);
    return this.findById(id)!;
  }

  touch(id: number, now = nowIso()): void {
    this.db.prepare("update app_conversations set updated_at = ? where id = ?").run(now, id);
  }
}

function normalizedEntityId(contextType: ConversationContextType, entityId?: number | null): number | null {
  if (contextType === "global" || contextType === "initiatives") {
    return null;
  }

  if (!entityId) {
    throw new Error(`contextEntityId is required for ${contextType} conversations`);
  }

  return entityId;
}
