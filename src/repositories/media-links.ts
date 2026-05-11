import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import { toMediaAsset } from "./media-assets.js";
import type { MediaAsset } from "./media-assets.js";

export type MediaEntityType = "category" | "initiative" | "task" | "calendar_entry" | "app_chat_message";

export type MediaLink = {
  id: number;
  assetId: number;
  entityType: MediaEntityType;
  entityId: number;
  caption: string | null;
  role: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type MediaAttachment = MediaLink & {
  asset: MediaAsset;
};

type MediaLinkRow = {
  id: number;
  asset_id: number;
  entity_type: MediaEntityType;
  entity_id: number;
  caption: string | null;
  role: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type MediaAttachmentRow = MediaLinkRow & {
  asset_id_joined: number;
  kind: MediaAsset["kind"];
  mime_type: string;
  original_name: string;
  storage_path: string;
  sha256: string;
  byte_size: number;
  width: number | null;
  height: number | null;
  duration_ms: number | null;
  transcript: string | null;
  text_excerpt: string | null;
  summary: string | null;
  asset_created_at: string;
  asset_updated_at: string;
};

export type CreateMediaLinkInput = {
  assetId: number;
  entityType: MediaEntityType;
  entityId: number;
  caption?: string | null;
  role?: string | null;
};

export type UpdateMediaLinkInput = {
  id: number;
  caption?: string | null;
  role?: string | null;
};

function toMediaLink(row: MediaLinkRow): MediaLink {
  return {
    id: row.id,
    assetId: row.asset_id,
    entityType: row.entity_type,
    entityId: row.entity_id,
    caption: row.caption,
    role: row.role,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toMediaAttachment(row: MediaAttachmentRow): MediaAttachment {
  return {
    ...toMediaLink(row),
    asset: toMediaAsset({
      id: row.asset_id_joined,
      kind: row.kind,
      mime_type: row.mime_type,
      original_name: row.original_name,
      storage_path: row.storage_path,
      sha256: row.sha256,
      byte_size: row.byte_size,
      width: row.width,
      height: row.height,
      duration_ms: row.duration_ms,
      transcript: row.transcript,
      text_excerpt: row.text_excerpt,
      summary: row.summary,
      created_at: row.asset_created_at,
      updated_at: row.asset_updated_at
    })
  };
}

export class MediaLinkRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): MediaLink | null {
    const row = this.db.prepare("select * from media_links where id = ?").get(id) as MediaLinkRow | undefined;
    return row ? toMediaLink(row) : null;
  }

  listForEntity(entityType: MediaEntityType, entityId: number): MediaAttachment[] {
    const rows = this.db
      .prepare(
        `select
          l.*,
          a.id as asset_id_joined,
          a.kind,
          a.mime_type,
          a.original_name,
          a.storage_path,
          a.sha256,
          a.byte_size,
          a.width,
          a.height,
          a.duration_ms,
          a.transcript,
          a.text_excerpt,
          a.summary,
          a.created_at as asset_created_at,
          a.updated_at as asset_updated_at
        from media_links l
        join media_assets a on a.id = l.asset_id
        where l.entity_type = ? and l.entity_id = ?
        order by l.sort_order asc, l.id asc`
      )
      .all(entityType, entityId) as MediaAttachmentRow[];

    return rows.map(toMediaAttachment);
  }

  create(input: CreateMediaLinkInput, now = nowIso()): MediaAttachment {
    this.db
      .prepare(
        `insert into media_links
          (asset_id, entity_type, entity_id, caption, role, sort_order, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)
         on conflict(asset_id, entity_type, entity_id) do update set
          caption = excluded.caption,
          role = excluded.role,
          updated_at = excluded.updated_at`
      )
      .run(
        input.assetId,
        input.entityType,
        input.entityId,
        input.caption ?? null,
        input.role ?? null,
        this.nextSortOrder(input.entityType, input.entityId),
        now,
        now
      );

    const linkId = this.findExistingId(input.assetId, input.entityType, input.entityId);
    return this.findAttachmentByLinkId(linkId)!;
  }

  update(input: UpdateMediaLinkInput, now = nowIso()): MediaAttachment {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Media link not found: ${input.id}`);
    }

    this.db
      .prepare("update media_links set caption = ?, role = ?, updated_at = ? where id = ?")
      .run(
        input.caption === undefined ? existing.caption : input.caption,
        input.role === undefined ? existing.role : input.role,
        now,
        input.id
      );

    return this.findAttachmentByLinkId(input.id)!;
  }

  delete(id: number): MediaLink | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    this.db.prepare("delete from media_links where id = ?").run(id);
    return existing;
  }

  reorderWithinEntity(entityType: MediaEntityType, entityId: number, linkIds: number[], now = nowIso()): MediaAttachment[] {
    const uniqueIds = [...new Set(linkIds)];
    const existing = this.listForEntity(entityType, entityId);
    const existingIds = new Set(existing.map((link) => link.id));
    if (uniqueIds.some((id) => !existingIds.has(id))) {
      throw new Error("Media reorder can only include links from the same entity");
    }

    const update = this.db.prepare("update media_links set sort_order = ?, updated_at = ? where id = ? and entity_type = ? and entity_id = ?");
    const transaction = this.db.transaction(() => {
      uniqueIds.forEach((id, index) => update.run((index + 1) * 1000, now, id, entityType, entityId));
    });
    transaction();
    return this.listForEntity(entityType, entityId);
  }

  private findAttachmentByLinkId(id: number): MediaAttachment | null {
    const row = this.db
      .prepare(
        `select
          l.*,
          a.id as asset_id_joined,
          a.kind,
          a.mime_type,
          a.original_name,
          a.storage_path,
          a.sha256,
          a.byte_size,
          a.width,
          a.height,
          a.duration_ms,
          a.transcript,
          a.text_excerpt,
          a.summary,
          a.created_at as asset_created_at,
          a.updated_at as asset_updated_at
        from media_links l
        join media_assets a on a.id = l.asset_id
        where l.id = ?`
      )
      .get(id) as MediaAttachmentRow | undefined;

    return row ? toMediaAttachment(row) : null;
  }

  private findExistingId(assetId: number, entityType: MediaEntityType, entityId: number): number {
    const row = this.db
      .prepare("select id from media_links where asset_id = ? and entity_type = ? and entity_id = ?")
      .get(assetId, entityType, entityId) as { id: number } | undefined;
    if (!row) {
      throw new Error("Media link was not created");
    }
    return row.id;
  }

  private nextSortOrder(entityType: MediaEntityType, entityId: number): number {
    const row = this.db
      .prepare("select coalesce(max(sort_order), 0) + 1000 as next from media_links where entity_type = ? and entity_id = ?")
      .get(entityType, entityId) as { next: number };
    return row.next;
  }
}
