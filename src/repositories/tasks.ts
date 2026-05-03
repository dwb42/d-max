import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type Task = {
  id: number;
  initiativeId: number;
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
  initiative_id: number;
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
  initiativeId: number;
  title: string;
  priority?: TaskPriority;
  notes?: string | null;
  dueAt?: string | null;
};

export type UpdateTaskInput = {
  id: number;
  initiativeId?: number;
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

  list(filters: { initiativeId?: number; status?: TaskStatus; priority?: TaskPriority } = {}): Task[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.initiativeId !== undefined) {
      conditions.push("initiative_id = ?");
      params.push(filters.initiativeId);
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
      .prepare(`select * from tasks ${where} order by initiative_id asc, sort_order asc, due_at is null, due_at asc, updated_at desc, id asc`)
      .all(...params) as TaskRow[];

    return rows.map(toTask);
  }

  findById(id: number): Task | null {
    const row = this.db.prepare("select * from tasks where id = ?").get(id) as TaskRow | undefined;
    return row ? toTask(row) : null;
  }

  create(input: CreateTaskInput, now = nowIso()): Task {
    const result = this.db
      .prepare(
        "insert into tasks (initiative_id, title, status, priority, notes, due_at, sort_order, created_at, updated_at) values (?, ?, 'open', ?, ?, ?, ?, ?, ?)"
      )
      .run(input.initiativeId, input.title, input.priority ?? "normal", input.notes ?? null, input.dueAt ?? null, this.nextSortOrder(input.initiativeId), now, now);

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateTaskInput, now = nowIso()): Task {
    const existing = this.findById(input.id);

    if (!existing) {
      throw new Error(`Task not found: ${input.id}`);
    }

    const status = input.status ?? existing.status;
    const completedAt = status === "done" && existing.completedAt === null ? now : status === "done" ? existing.completedAt : null;

    this.db
      .prepare(
        "update tasks set initiative_id = ?, title = ?, status = ?, priority = ?, notes = ?, due_at = ?, updated_at = ?, completed_at = ? where id = ?"
      )
      .run(
        input.initiativeId ?? existing.initiativeId,
        input.title ?? existing.title,
        status,
        input.priority ?? existing.priority,
        input.notes === undefined ? existing.notes : input.notes,
        input.dueAt === undefined ? existing.dueAt : input.dueAt,
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

  private nextSortOrder(initiativeId: number): number {
    const row = this.db
      .prepare("select coalesce(max(sort_order), 0) + 1000 as next from tasks where initiative_id = ?")
      .get(initiativeId) as { next: number };
    return row.next;
  }
}
