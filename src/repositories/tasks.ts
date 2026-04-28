import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type TaskStatus = "open" | "in_progress" | "blocked" | "done" | "cancelled";
export type TaskPriority = "low" | "normal" | "high" | "urgent";

export type Task = {
  id: number;
  projectId: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  notes: string | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  completedAt: string | null;
};

type TaskRow = {
  id: number;
  project_id: number;
  title: string;
  status: TaskStatus;
  priority: TaskPriority;
  notes: string | null;
  due_at: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

export type CreateTaskInput = {
  projectId: number;
  title: string;
  priority?: TaskPriority;
  notes?: string | null;
  dueAt?: string | null;
};

export type UpdateTaskInput = {
  id: number;
  projectId?: number;
  title?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  notes?: string | null;
  dueAt?: string | null;
};

function toTask(row: TaskRow): Task {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    dueAt: row.due_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}

export class TaskRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { projectId?: number; status?: TaskStatus; priority?: TaskPriority } = {}): Task[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.projectId !== undefined) {
      conditions.push("project_id = ?");
      params.push(filters.projectId);
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
      .prepare(`select * from tasks ${where} order by due_at is null, due_at asc, updated_at desc`)
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
        "insert into tasks (project_id, title, status, priority, notes, due_at, created_at, updated_at) values (?, ?, 'open', ?, ?, ?, ?, ?)"
      )
      .run(input.projectId, input.title, input.priority ?? "normal", input.notes ?? null, input.dueAt ?? null, now, now);

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
        "update tasks set project_id = ?, title = ?, status = ?, priority = ?, notes = ?, due_at = ?, updated_at = ?, completed_at = ? where id = ?"
      )
      .run(
        input.projectId ?? existing.projectId,
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
}
