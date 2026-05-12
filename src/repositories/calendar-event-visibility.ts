import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { ExternalCalendarEvent } from "../calendar/google-calendar-provider.js";

export type CalendarEventVisibilityProvider = "google";
export type CalendarEventVisibilitySurface = "planning_canvas" | "calendar" | "global";
export type CalendarEventVisibilityHiddenScope = "event" | "recurring_instance" | "recurring_series";

export type CalendarEventVisibility = {
  id: number;
  provider: CalendarEventVisibilityProvider;
  surface: CalendarEventVisibilitySurface;
  hiddenScope: CalendarEventVisibilityHiddenScope;
  calendarSourceId: number | null;
  externalCalendarId: string;
  externalEventId: string | null;
  recurringEventId: string | null;
  originalStartAt: string | null;
  iCalUID: string | null;
  titleSnapshot: string;
  startAtSnapshot: string | null;
  endAtSnapshot: string | null;
  hiddenAt: string;
  createdAt: string;
  updatedAt: string;
};

type CalendarEventVisibilityRow = {
  id: number;
  provider: CalendarEventVisibilityProvider;
  surface: CalendarEventVisibilitySurface;
  hidden_scope: CalendarEventVisibilityHiddenScope;
  calendar_source_id: number | null;
  external_calendar_id: string;
  external_event_id: string | null;
  recurring_event_id: string | null;
  original_start_at: string | null;
  ical_uid: string | null;
  title_snapshot: string;
  start_at_snapshot: string | null;
  end_at_snapshot: string | null;
  hidden_at: string;
  created_at: string;
  updated_at: string;
};

export type CreateCalendarEventVisibilityInput = {
  provider?: CalendarEventVisibilityProvider;
  surface: CalendarEventVisibilitySurface;
  hiddenScope: CalendarEventVisibilityHiddenScope;
  calendarSourceId?: number | null;
  externalCalendarId: string;
  externalEventId?: string | null;
  recurringEventId?: string | null;
  originalStartAt?: string | null;
  iCalUID?: string | null;
  titleSnapshot: string;
  startAtSnapshot?: string | null;
  endAtSnapshot?: string | null;
};

export class CalendarEventVisibilityRepository {
  constructor(private readonly db: Database.Database) {}

  list(input: { surfaces?: CalendarEventVisibilitySurface[] } = {}): CalendarEventVisibility[] {
    const surfaces = input.surfaces?.length ? input.surfaces : null;
    const where = surfaces ? `where surface in (${surfaces.map(() => "?").join(", ")})` : "";
    const rows = this.db
      .prepare(`select * from calendar_event_visibility ${where} order by hidden_at desc, id desc`)
      .all(...(surfaces ?? [])) as CalendarEventVisibilityRow[];
    return rows.map(toCalendarEventVisibility);
  }

  findById(id: number): CalendarEventVisibility | null {
    const row = this.db.prepare("select * from calendar_event_visibility where id = ?").get(id) as CalendarEventVisibilityRow | undefined;
    return row ? toCalendarEventVisibility(row) : null;
  }

  create(input: CreateCalendarEventVisibilityInput, now = nowIso()): CalendarEventVisibility {
    assertValidVisibility(input);
    const provider = input.provider ?? "google";
    const existing = this.findByIdentity({
      provider,
      surface: input.surface,
      hiddenScope: input.hiddenScope,
      externalCalendarId: input.externalCalendarId,
      externalEventId: input.externalEventId ?? null,
      recurringEventId: input.recurringEventId ?? null,
      originalStartAt: input.originalStartAt ?? null
    });

    if (existing) {
      this.db
        .prepare(
          `update calendar_event_visibility
           set calendar_source_id = ?,
               ical_uid = ?,
               title_snapshot = ?,
               start_at_snapshot = ?,
               end_at_snapshot = ?,
               hidden_at = ?,
               updated_at = ?
           where id = ?`
        )
        .run(
          input.calendarSourceId ?? existing.calendarSourceId,
          input.iCalUID ?? existing.iCalUID,
          input.titleSnapshot,
          input.startAtSnapshot ?? existing.startAtSnapshot,
          input.endAtSnapshot ?? existing.endAtSnapshot,
          now,
          now,
          existing.id
        );
      return this.findById(existing.id)!;
    }

    const result = this.db
      .prepare(
        `insert into calendar_event_visibility
          (provider, surface, hidden_scope, calendar_source_id, external_calendar_id, external_event_id, recurring_event_id,
           original_start_at, ical_uid, title_snapshot, start_at_snapshot, end_at_snapshot, hidden_at, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        provider,
        input.surface,
        input.hiddenScope,
        input.calendarSourceId ?? null,
        input.externalCalendarId,
        input.externalEventId ?? null,
        input.recurringEventId ?? null,
        input.originalStartAt ?? null,
        input.iCalUID ?? null,
        input.titleSnapshot,
        input.startAtSnapshot ?? null,
        input.endAtSnapshot ?? null,
        now,
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  delete(id: number): CalendarEventVisibility | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from calendar_event_visibility where id = ?").run(id);
    return existing;
  }

  matchesEvent(event: ExternalCalendarEvent, visibility: CalendarEventVisibility): boolean {
    return visibilityMatchesEvent(event, visibility);
  }

  private findByIdentity(input: {
    provider: CalendarEventVisibilityProvider;
    surface: CalendarEventVisibilitySurface;
    hiddenScope: CalendarEventVisibilityHiddenScope;
    externalCalendarId: string;
    externalEventId: string | null;
    recurringEventId: string | null;
    originalStartAt: string | null;
  }): CalendarEventVisibility | null {
    const baseParams = [input.provider, input.surface, input.hiddenScope, input.externalCalendarId];
    const row = input.hiddenScope === "event"
      ? this.db
        .prepare(
          `select * from calendar_event_visibility
           where provider = ? and surface = ? and hidden_scope = ? and external_calendar_id = ? and external_event_id = ?`
        )
        .get(...baseParams, input.externalEventId) as CalendarEventVisibilityRow | undefined
      : input.hiddenScope === "recurring_instance"
        ? this.db
          .prepare(
            `select * from calendar_event_visibility
             where provider = ? and surface = ? and hidden_scope = ? and external_calendar_id = ? and recurring_event_id = ? and original_start_at = ?`
          )
          .get(...baseParams, input.recurringEventId, input.originalStartAt) as CalendarEventVisibilityRow | undefined
        : this.db
          .prepare(
            `select * from calendar_event_visibility
             where provider = ? and surface = ? and hidden_scope = ? and external_calendar_id = ? and recurring_event_id = ?`
          )
          .get(...baseParams, input.recurringEventId) as CalendarEventVisibilityRow | undefined;
    return row ? toCalendarEventVisibility(row) : null;
  }
}

export function visibilityMatchesEvent(event: ExternalCalendarEvent, visibility: CalendarEventVisibility): boolean {
  if (visibility.provider !== "google" || visibility.externalCalendarId !== event.externalCalendarId) {
    return false;
  }
  if (visibility.hiddenScope === "event") {
    return Boolean(visibility.externalEventId && visibility.externalEventId === event.externalEventId);
  }
  if (visibility.hiddenScope === "recurring_series") {
    return Boolean(visibility.recurringEventId && visibility.recurringEventId === event.recurringEventId);
  }
  return Boolean(
    visibility.recurringEventId
      && visibility.originalStartAt
      && visibility.recurringEventId === event.recurringEventId
      && visibility.originalStartAt === event.originalStartAt
  );
}

function toCalendarEventVisibility(row: CalendarEventVisibilityRow): CalendarEventVisibility {
  return {
    id: row.id,
    provider: row.provider,
    surface: row.surface,
    hiddenScope: row.hidden_scope,
    calendarSourceId: row.calendar_source_id,
    externalCalendarId: row.external_calendar_id,
    externalEventId: row.external_event_id,
    recurringEventId: row.recurring_event_id,
    originalStartAt: row.original_start_at,
    iCalUID: row.ical_uid,
    titleSnapshot: row.title_snapshot,
    startAtSnapshot: row.start_at_snapshot,
    endAtSnapshot: row.end_at_snapshot,
    hiddenAt: row.hidden_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function assertValidVisibility(input: CreateCalendarEventVisibilityInput): void {
  if (!input.externalCalendarId.trim()) {
    throw new Error("Hidden calendar event externalCalendarId is required");
  }
  if (!input.titleSnapshot.trim()) {
    throw new Error("Hidden calendar event titleSnapshot is required");
  }
  if (input.hiddenScope === "event" && !input.externalEventId?.trim()) {
    throw new Error("Single hidden calendar events require externalEventId");
  }
  if (input.hiddenScope === "recurring_instance" && (!input.recurringEventId?.trim() || !input.originalStartAt?.trim())) {
    throw new Error("Hidden recurring instances require recurringEventId and originalStartAt");
  }
  if (input.hiddenScope === "recurring_series" && !input.recurringEventId?.trim()) {
    throw new Error("Hidden recurring series require recurringEventId");
  }
}
