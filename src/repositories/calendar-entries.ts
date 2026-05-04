import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import { TaskRepository } from "./tasks.js";

export type CalendarEntryType = "initiative_focus" | "task_work" | "standalone";
export type CalendarEntryStatus = "open" | "done";

export type CalendarEntry = {
  id: number;
  type: CalendarEntryType;
  title: string;
  startAt: string;
  endAt: string;
  status: CalendarEntryStatus;
  initiativeId: number | null;
  taskId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

type CalendarEntryRow = {
  id: number;
  type: CalendarEntryType;
  title: string;
  start_at: string;
  end_at: string;
  status: CalendarEntryStatus;
  initiative_id: number | null;
  task_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateCalendarEntryInput = {
  type: CalendarEntryType;
  title: string;
  startAt: string;
  endAt: string;
  initiativeId?: number | null;
  taskId?: number | null;
  notes?: string | null;
};

export type UpdateCalendarEntryInput = {
  id: number;
  type?: CalendarEntryType;
  title?: string;
  startAt?: string;
  endAt?: string;
  status?: CalendarEntryStatus;
  initiativeId?: number | null;
  taskId?: number | null;
  notes?: string | null;
};

function toCalendarEntry(row: CalendarEntryRow): CalendarEntry {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    startAt: row.start_at,
    endAt: row.end_at,
    status: row.status,
    initiativeId: row.initiative_id,
    taskId: row.task_id,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CalendarEntryRepository {
  constructor(private readonly db: Database.Database) {}

  list(range?: { startAt?: string; endAt?: string }): CalendarEntry[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (range?.startAt) {
      conditions.push("end_at > ?");
      params.push(range.startAt);
    }

    if (range?.endAt) {
      conditions.push("start_at < ?");
      params.push(range.endAt);
    }

    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from calendar_entries ${where} order by start_at asc, end_at asc, id asc`)
      .all(...params) as CalendarEntryRow[];
    return rows.map(toCalendarEntry);
  }

  findById(id: number): CalendarEntry | null {
    const row = this.db.prepare("select * from calendar_entries where id = ?").get(id) as CalendarEntryRow | undefined;
    return row ? toCalendarEntry(row) : null;
  }

  create(input: CreateCalendarEntryInput, now = nowIso()): CalendarEntry {
    assertValidCalendarEntry(input);
    const result = this.db
      .prepare(
        `insert into calendar_entries
          (type, title, start_at, end_at, status, initiative_id, task_id, notes, created_at, updated_at)
         values (?, ?, ?, ?, 'open', ?, ?, ?, ?, ?)`
      )
      .run(
        input.type,
        input.title,
        input.startAt,
        input.endAt,
        input.initiativeId ?? null,
        input.taskId ?? null,
        input.notes ?? null,
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateCalendarEntryInput, now = nowIso()): CalendarEntry {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Calendar entry not found: ${input.id}`);
    }

    const next: CreateCalendarEntryInput & { status: CalendarEntryStatus } = {
      type: input.type ?? existing.type,
      title: input.title ?? existing.title,
      startAt: input.startAt ?? existing.startAt,
      endAt: input.endAt ?? existing.endAt,
      initiativeId: input.initiativeId === undefined ? existing.initiativeId : input.initiativeId,
      taskId: input.taskId === undefined ? existing.taskId : input.taskId,
      notes: input.notes === undefined ? existing.notes : input.notes,
      status: input.status ?? existing.status
    };
    assertValidCalendarEntry(next);

    this.db
      .prepare(
        `update calendar_entries
         set type = ?, title = ?, start_at = ?, end_at = ?, status = ?, initiative_id = ?, task_id = ?, notes = ?, updated_at = ?
         where id = ?`
      )
      .run(next.type, next.title, next.startAt, next.endAt, next.status, next.initiativeId ?? null, next.taskId ?? null, next.notes ?? null, now, input.id);
    return this.findById(input.id)!;
  }

  complete(id: number, now = nowIso()): CalendarEntry {
    const entry = this.update({ id, status: "done" }, now);
    if (entry.taskId) {
      new TaskRepository(this.db).complete(entry.taskId, now);
    }
    return this.findById(id)!;
  }

  delete(id: number): void {
    this.db.prepare("delete from calendar_entries where id = ?").run(id);
  }
}

function assertValidCalendarEntry(input: CreateCalendarEntryInput): void {
  if (!input.title.trim()) {
    throw new Error("Calendar entry title is required");
  }
  if (!input.startAt || !input.endAt) {
    throw new Error("Calendar entry startAt and endAt are required");
  }
  if (input.startAt >= input.endAt) {
    throw new Error("Calendar entry startAt must be before endAt");
  }
  if (input.type === "initiative_focus" && !input.initiativeId) {
    throw new Error("initiative_focus calendar entries require initiativeId");
  }
  if (input.type === "task_work" && !input.taskId) {
    throw new Error("task_work calendar entries require taskId");
  }
  if (input.type === "standalone" && (input.initiativeId || input.taskId)) {
    throw new Error("standalone calendar entries cannot reference initiativeId or taskId");
  }
}
