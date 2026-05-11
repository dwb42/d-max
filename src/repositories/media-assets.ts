import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type MediaKind = "image" | "audio" | "video" | "document" | "other";

export type MediaAsset = {
  id: number;
  kind: MediaKind;
  mimeType: string;
  originalName: string;
  storagePath: string;
  sha256: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  transcript: string | null;
  textExcerpt: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
};

type MediaAssetRow = {
  id: number;
  kind: MediaKind;
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
  created_at: string;
  updated_at: string;
};

export type CreateMediaAssetInput = {
  kind: MediaKind;
  mimeType: string;
  originalName: string;
  storagePath: string;
  sha256: string;
  byteSize: number;
  width?: number | null;
  height?: number | null;
  durationMs?: number | null;
  transcript?: string | null;
  textExcerpt?: string | null;
  summary?: string | null;
};

export type UpdateMediaAssetInput = {
  id: number;
  transcript?: string | null;
  textExcerpt?: string | null;
  summary?: string | null;
};

export function toMediaAsset(row: MediaAssetRow): MediaAsset {
  return {
    id: row.id,
    kind: row.kind,
    mimeType: row.mime_type,
    originalName: row.original_name,
    storagePath: row.storage_path,
    sha256: row.sha256,
    byteSize: row.byte_size,
    width: row.width,
    height: row.height,
    durationMs: row.duration_ms,
    transcript: row.transcript,
    textExcerpt: row.text_excerpt,
    summary: row.summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class MediaAssetRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): MediaAsset | null {
    const row = this.db.prepare("select * from media_assets where id = ?").get(id) as MediaAssetRow | undefined;
    return row ? toMediaAsset(row) : null;
  }

  findByHash(sha256: string, byteSize?: number): MediaAsset | null {
    const row =
      byteSize === undefined
        ? this.db.prepare("select * from media_assets where sha256 = ? order by id asc limit 1").get(sha256)
        : this.db.prepare("select * from media_assets where sha256 = ? and byte_size = ? order by id asc limit 1").get(sha256, byteSize);
    return row ? toMediaAsset(row as MediaAssetRow) : null;
  }

  create(input: CreateMediaAssetInput, now = nowIso()): MediaAsset {
    const result = this.db
      .prepare(
        `insert into media_assets
          (kind, mime_type, original_name, storage_path, sha256, byte_size, width, height, duration_ms, transcript, text_excerpt, summary, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.kind,
        input.mimeType,
        input.originalName,
        input.storagePath,
        input.sha256,
        input.byteSize,
        input.width ?? null,
        input.height ?? null,
        input.durationMs ?? null,
        input.transcript ?? null,
        input.textExcerpt ?? null,
        input.summary ?? null,
        now,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  updateDerivedText(input: UpdateMediaAssetInput, now = nowIso()): MediaAsset {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Media asset not found: ${input.id}`);
    }

    this.db
      .prepare("update media_assets set transcript = ?, text_excerpt = ?, summary = ?, updated_at = ? where id = ?")
      .run(
        input.transcript === undefined ? existing.transcript : input.transcript,
        input.textExcerpt === undefined ? existing.textExcerpt : input.textExcerpt,
        input.summary === undefined ? existing.summary : input.summary,
        now,
        input.id
      );

    return this.findById(input.id)!;
  }
}
