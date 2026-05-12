import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type CalendarBindingLocalEntityType = "calendar_entry" | "initiative_project_span";
export type CalendarBindingProvider = "google";
export type CalendarBindingSyncStatus =
  | "synced"
  | "pending_sync"
  | "sync_error"
  | "external_deleted"
  | "sync_blocked_readonly";

export type CalendarEventBinding = {
  id: number;
  localEntityType: CalendarBindingLocalEntityType;
  localEntityId: number;
  provider: CalendarBindingProvider;
  calendarSourceId: number | null;
  externalCalendarId: string;
  externalEventId: string;
  externalEtag: string | null;
  externalUpdatedAt: string | null;
  syncStatus: CalendarBindingSyncStatus;
  syncMessage: string | null;
  lastSyncedAt: string | null;
  unlinkedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type CalendarEventBindingRow = {
  id: number;
  local_entity_type: CalendarBindingLocalEntityType;
  local_entity_id: number;
  provider: CalendarBindingProvider;
  calendar_source_id: number | null;
  external_calendar_id: string;
  external_event_id: string;
  external_etag: string | null;
  external_updated_at: string | null;
  sync_status: CalendarBindingSyncStatus;
  sync_message: string | null;
  last_synced_at: string | null;
  unlinked_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCalendarEventBindingInput = {
  localEntityType: CalendarBindingLocalEntityType;
  localEntityId: number;
  provider?: CalendarBindingProvider;
  calendarSourceId?: number | null;
  externalCalendarId: string;
  externalEventId: string;
  externalEtag?: string | null;
  externalUpdatedAt?: string | null;
  syncStatus?: CalendarBindingSyncStatus;
  syncMessage?: string | null;
  lastSyncedAt?: string | null;
};

export type UpdateCalendarEventBindingInput = {
  id: number;
  calendarSourceId?: number | null;
  externalEtag?: string | null;
  externalUpdatedAt?: string | null;
  syncStatus?: CalendarBindingSyncStatus;
  syncMessage?: string | null;
  lastSyncedAt?: string | null;
  unlinkedAt?: string | null;
};

function toCalendarEventBinding(row: CalendarEventBindingRow): CalendarEventBinding {
  return {
    id: row.id,
    localEntityType: row.local_entity_type,
    localEntityId: row.local_entity_id,
    provider: row.provider,
    calendarSourceId: row.calendar_source_id,
    externalCalendarId: row.external_calendar_id,
    externalEventId: row.external_event_id,
    externalEtag: row.external_etag,
    externalUpdatedAt: row.external_updated_at,
    syncStatus: row.sync_status,
    syncMessage: row.sync_message,
    lastSyncedAt: row.last_synced_at,
    unlinkedAt: row.unlinked_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CalendarEventBindingRepository {
  constructor(private readonly db: Database.Database) {}

  listActive(): CalendarEventBinding[] {
    const rows = this.db
      .prepare("select * from calendar_event_bindings where unlinked_at is null order by id asc")
      .all() as CalendarEventBindingRow[];
    return rows.map(toCalendarEventBinding);
  }

  findById(id: number): CalendarEventBinding | null {
    const row = this.db.prepare("select * from calendar_event_bindings where id = ?").get(id) as CalendarEventBindingRow | undefined;
    return row ? toCalendarEventBinding(row) : null;
  }

  findActiveByLocal(input: { localEntityType: CalendarBindingLocalEntityType; localEntityId: number }): CalendarEventBinding | null {
    const row = this.db
      .prepare("select * from calendar_event_bindings where local_entity_type = ? and local_entity_id = ? and unlinked_at is null")
      .get(input.localEntityType, input.localEntityId) as CalendarEventBindingRow | undefined;
    return row ? toCalendarEventBinding(row) : null;
  }

  findActiveByExternal(input: { provider?: CalendarBindingProvider; externalCalendarId: string; externalEventId: string }): CalendarEventBinding | null {
    const row = this.db
      .prepare("select * from calendar_event_bindings where provider = ? and external_calendar_id = ? and external_event_id = ? and unlinked_at is null")
      .get(input.provider ?? "google", input.externalCalendarId, input.externalEventId) as CalendarEventBindingRow | undefined;
    return row ? toCalendarEventBinding(row) : null;
  }

  create(input: CreateCalendarEventBindingInput, now = nowIso()): CalendarEventBinding {
    assertValidBinding(input);
    const result = this.db
      .prepare(
        `insert into calendar_event_bindings
          (local_entity_type, local_entity_id, provider, calendar_source_id, external_calendar_id, external_event_id,
           external_etag, external_updated_at, sync_status, sync_message, last_synced_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.localEntityType,
        input.localEntityId,
        input.provider ?? "google",
        input.calendarSourceId ?? null,
        input.externalCalendarId,
        input.externalEventId,
        input.externalEtag ?? null,
        input.externalUpdatedAt ?? null,
        input.syncStatus ?? "synced",
        input.syncMessage ?? null,
        input.lastSyncedAt ?? now,
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateCalendarEventBindingInput, now = nowIso()): CalendarEventBinding {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Calendar event binding not found: ${input.id}`);
    }

    this.db
      .prepare(
        `update calendar_event_bindings
         set calendar_source_id = ?,
             external_etag = ?,
             external_updated_at = ?,
             sync_status = ?,
             sync_message = ?,
             last_synced_at = ?,
             unlinked_at = ?,
             updated_at = ?
         where id = ?`
      )
      .run(
        input.calendarSourceId === undefined ? existing.calendarSourceId : input.calendarSourceId,
        input.externalEtag === undefined ? existing.externalEtag : input.externalEtag,
        input.externalUpdatedAt === undefined ? existing.externalUpdatedAt : input.externalUpdatedAt,
        input.syncStatus ?? existing.syncStatus,
        input.syncMessage === undefined ? existing.syncMessage : input.syncMessage,
        input.lastSyncedAt === undefined ? existing.lastSyncedAt : input.lastSyncedAt,
        input.unlinkedAt === undefined ? existing.unlinkedAt : input.unlinkedAt,
        now,
        input.id
      );
    return this.findById(input.id)!;
  }

  unlink(id: number, now = nowIso()): CalendarEventBinding {
    return this.update({ id, unlinkedAt: now }, now);
  }
}

function assertValidBinding(input: CreateCalendarEventBindingInput): void {
  if (input.localEntityId <= 0) {
    throw new Error("Calendar event binding localEntityId must be positive");
  }
  if (!input.externalCalendarId.trim()) {
    throw new Error("Calendar event binding externalCalendarId is required");
  }
  if (!input.externalEventId.trim()) {
    throw new Error("Calendar event binding externalEventId is required");
  }
}
