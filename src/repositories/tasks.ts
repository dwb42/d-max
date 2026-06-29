import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type TaskStatus = "open" | "done";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type Task = {
  id: number;
  initiativeId: number | null;
  primaryPartyId: number | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  notes: string | null;
  dueAt: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type TaskRow = {
  id: number;
  initiative_id: number | null;
  primary_party_id: number | null;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  notes: string | null;
  due_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CreateTaskInput = {
  initiativeId?: number | null;
  primaryPartyId?: number | null;
  title: string;
  priority?: TaskPriority;
  notes?: string | null;
  dueAt?: string | null;
};

export type UpdateTaskInput = {
  id: number;
  initiativeId?: number | null;
  primaryPartyId?: number | null;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  notes?: string | null;
  dueAt?: string | null;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    initiativeId: row.initiative_id,
    primaryPartyId: row.primary_party_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    dueAt: row.due_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export class TaskRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { initiativeId?: number | null; primaryPartyId?: number; status?: TaskStatus; priority?: TaskPriority } = {}): Task[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.initiativeId !== undefined) {
      if (filters.initiativeId === null) {
        conditions.push("initiative_id is null");
      } else {
        conditions.push("initiative_id = ?");
        params.push(filters.initiativeId);
      }
    }

    if (filters.primaryPartyId !== undefined) {
      conditions.push("primary_party_id = ?");
      params.push(filters.primaryPartyId);
    }

    if (filters.status !== undefined) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    if (filters.priority !== undefined) {
      conditions.push("priority = ?");
      params.push(filters.priority);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from tasks ${where} order by primary_party_id is null, primary_party_id asc, initiative_id is null, initiative_id asc, sort_order asc, due_at is null, due_at asc, updated_at desc, id asc`)
      .all(...params) as TaskRow[];

    return rows.map(toTask);
  }

  findById(id: number): Task | null {
    const row = this.db.prepare("select * from tasks where id = ?").get(id) as TaskRow | undefined;
    return row ? toTask(row) : null;
  }

  create(input: CreateTaskInput, now = nowIso()): Task {
    const initiativeId = input.initiativeId ?? null;
    const primaryPartyId = input.primaryPartyId ?? null;
    if (!initiativeId && !primaryPartyId) {
      throw new Error("Task requires an initiativeId or primaryPartyId");
    }

    const result = this.db
      .prepare(
        "insert into tasks (initiative_id, primary_party_id, title, status, priority, notes, due_at, sort_order, created_at, updated_at) values (?, ?, ?, 'open', ?, ?, ?, ?, ?, ?)"
      )
      .run(
        initiativeId,
        primaryPartyId,
        input.title,
        input.priority ?? "normal",
        input.notes ?? null,
        input.dueAt ?? null,
        this.nextSortOrder(initiativeId, primaryPartyId),
        now,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateTaskInput, now = nowIso()): Task {
    const existing = this.findById(input.id);

    if (!existing) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const status = input.status ?? existing.status;
    const completedAt = status === "done" && existing.completedAt === null ? now : status === "done" ? existing.completedAt : null;
    const nextInitiativeId = input.initiativeId === undefined ? existing.initiativeId : input.initiativeId;
    const nextPrimaryPartyId = input.primaryPartyId === undefined ? existing.primaryPartyId : input.primaryPartyId;
    if (!nextInitiativeId && !nextPrimaryPartyId) {
      throw new Error("Task requires an initiativeId or primaryPartyId");
    }
    const contextChanged = nextInitiativeId !== existing.initiativeId || nextPrimaryPartyId !== existing.primaryPartyId;
    const nextSortOrder = contextChanged ? this.nextSortOrder(nextInitiativeId, nextPrimaryPartyId) : existing.sortOrder;

    this.db
      .prepare(
        "update tasks set initiative_id = ?, primary_party_id = ?, title = ?, status = ?, priority = ?, notes = ?, due_at = ?, sort_order = ?, updated_at = ?, completed_at = ? where id = ?"
      )
      .run(
        nextInitiativeId,
        nextPrimaryPartyId,
        input.title ?? existing.title,
        status,
        input.priority ?? existing.priority,
        input.notes === undefined ? existing.notes : input.notes,
        input.dueAt === undefined ? existing.dueAt : input.dueAt,
        nextSortOrder,
        now,
        completedAt,
        input.id
      );

    return this.findById(input.id)!;
  }

  complete(id: number, now = nowIso()): Task {
    return this.update({ id, status: "done" }, now);
  }

  delete(id: number): void {
    this.db.prepare("delete from media_links where entity_type = 'task' and entity_id = ?").run(id);
    this.db.prepare("delete from tasks where id = ?").run(id);
  }

  reorderWithinInitiative(initiativeId: number, taskIds: number[], now = nowIso()): Task[] {
    const uniqueIds = [...new Set(taskIds)];
    const existing = this.list({ initiativeId });
    const existingIds = new Set(existing.map((task) => task.id));
    if (uniqueIds.some((id) => !existingIds.has(id))) {
      throw new Error("Task reorder can only include tasks from the same initiative");
    }

    const update = this.db.prepare("update tasks set sort_order = ?, updated_at = ? where id = ? and initiative_id = ?");
    const transaction = this.db.transaction(() => {
      uniqueIds.forEach((id, index) => update.run((index + 1) * 1000, now, id, initiativeId));
    });
    transaction();
    return this.list({ initiativeId });
  }

  reorderWithinParty(primaryPartyId: number, taskIds: number[], now = nowIso()): Task[] {
    const uniqueIds = [...new Set(taskIds)];
    const existing = this.list({ primaryPartyId });
    const existingIds = new Set(existing.map((task) => task.id));
    if (uniqueIds.some((id) => !existingIds.has(id))) {
      throw new Error("Task reorder can only include tasks from the same party");
    }

    const update = this.db.prepare("update tasks set sort_order = ?, updated_at = ? where id = ? and primary_party_id = ?");
    const transaction = this.db.transaction(() => {
      uniqueIds.forEach((id, index) => update.run((index + 1) * 1000, now, id, primaryPartyId));
    });
    transaction();
    return this.list({ primaryPartyId });
  }

  private nextSortOrder(initiativeId: number | null, primaryPartyId: number | null): number {
    if (primaryPartyId) {
      const row = this.db
        .prepare("select coalesce(max(sort_order), 0) + 1000 as next from tasks where primary_party_id = ?")
        .get(primaryPartyId) as { next: number };
      return row.next;
    }
    if (!initiativeId) {
      return 1000;
    }
    const row = this.db
      .prepare("select coalesce(max(sort_order), 0) + 1000 as next from tasks where initiative_id = ?")
      .get(initiativeId) as { next: number };
    return row.next;
  }
}
