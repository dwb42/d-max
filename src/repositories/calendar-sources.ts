import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type CalendarSourceProvider = "google";

export type CalendarSource = {
  id: number;
  provider: CalendarSourceProvider;
  accountLabel: string;
  calendarId: string;
  displayName: string;
  color: string | null;
  enabled: boolean;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

type CalendarSourceRow = {
  id: number;
  provider: CalendarSourceProvider;
  account_label: string;
  calendar_id: string;
  display_name: string;
  color: string | null;
  enabled: number;
  read_only: number;
  created_at: string;
  updated_at: string;
};

export type CreateCalendarSourceInput = {
  provider?: CalendarSourceProvider;
  accountLabel: string;
  calendarId: string;
  displayName: string;
  color?: string | null;
  enabled?: boolean;
  readOnly?: boolean;
};

export type UpdateCalendarSourceInput = {
  id: number;
  accountLabel?: string;
  calendarId?: string;
  displayName?: string;
  color?: string | null;
  enabled?: boolean;
  readOnly?: boolean;
};

function toCalendarSource(row: CalendarSourceRow): CalendarSource {
  return {
    id: row.id,
    provider: row.provider,
    accountLabel: row.account_label,
    calendarId: row.calendar_id,
    displayName: row.display_name,
    color: row.color,
    enabled: row.enabled === 1,
    readOnly: row.read_only === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CalendarSourceRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { enabled?: boolean } = {}): CalendarSource[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.enabled !== undefined) {
      conditions.push("enabled = ?");
      params.push(filters.enabled ? 1 : 0);
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from calendar_sources ${where} order by enabled desc, lower(display_name) asc, id asc`)
      .all(...params) as CalendarSourceRow[];
    return rows.map(toCalendarSource);
  }

  findById(id: number): CalendarSource | null {
    const row = this.db.prepare("select * from calendar_sources where id = ?").get(id) as CalendarSourceRow | undefined;
    return row ? toCalendarSource(row) : null;
  }

  create(input: CreateCalendarSourceInput, now = nowIso()): CalendarSource {
    assertValidCalendarSource(input);
    const result = this.db
      .prepare(
        `insert into calendar_sources
          (provider, account_label, calendar_id, display_name, color, enabled, read_only, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.provider ?? "google",
        input.accountLabel,
        input.calendarId,
        input.displayName,
        input.color ?? null,
        input.enabled === false ? 0 : 1,
        input.readOnly === false ? 0 : 1,
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateCalendarSourceInput, now = nowIso()): CalendarSource {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Calendar source not found: ${input.id}`);
    }

    const next = {
      accountLabel: input.accountLabel ?? existing.accountLabel,
      calendarId: input.calendarId ?? existing.calendarId,
      displayName: input.displayName ?? existing.displayName,
      color: input.color === undefined ? existing.color : input.color,
      enabled: input.enabled ?? existing.enabled,
      readOnly: input.readOnly ?? existing.readOnly
    };
    assertValidCalendarSource(next);

    this.db
      .prepare(
        `update calendar_sources
         set account_label = ?, calendar_id = ?, display_name = ?, color = ?, enabled = ?, read_only = ?, updated_at = ?
         where id = ?`
      )
      .run(next.accountLabel, next.calendarId, next.displayName, next.color, next.enabled ? 1 : 0, next.readOnly ? 1 : 0, now, input.id);
    return this.findById(input.id)!;
  }
}

function assertValidCalendarSource(input: Pick<CreateCalendarSourceInput, "accountLabel" | "calendarId" | "displayName" | "color">): void {
  if (!input.accountLabel.trim()) {
    throw new Error("Calendar source accountLabel is required");
  }
  if (!input.calendarId.trim()) {
    throw new Error("Calendar source calendarId is required");
  }
  if (!input.displayName.trim()) {
    throw new Error("Calendar source displayName is required");
  }
  if (input.color && !/^#[0-9a-f]{6}$/i.test(input.color)) {
    throw new Error("Calendar source color must be a hex color");
  }
}
