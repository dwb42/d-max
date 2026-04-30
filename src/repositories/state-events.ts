import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type StateEventSource = "api" | "tool";
export type StateEventEntityType = "overview" | "category" | "project" | "task" | "thinking";

export type StateEvent = {
  id: number;
  source: StateEventSource;
  operation: string;
  entityType: StateEventEntityType;
  entityId: number | null;
  categoryId: number | null;
  projectId: number | null;
  taskId: number | null;
  createdAt: string;
};

type StateEventRow = {
  id: number;
  source: StateEventSource;
  operation: string;
  entity_type: StateEventEntityType;
  entity_id: number | null;
  category_id: number | null;
  project_id: number | null;
  task_id: number | null;
  created_at: string;
};

export type CreateStateEventInput = {
  source: StateEventSource;
  operation: string;
  entityType?: StateEventEntityType;
  entityId?: number | null;
  categoryId?: number | null;
  projectId?: number | null;
  taskId?: number | null;
};

function toStateEvent(row: StateEventRow): StateEvent {
  return {
    id: row.id,
    source: row.source,
    operation: row.operation,
    entityType: row.entity_type,
    entityId: row.entity_id,
    categoryId: row.category_id,
    projectId: row.project_id,
    taskId: row.task_id,
    createdAt: row.created_at
  };
}

export class StateEventRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateStateEventInput, now = nowIso()): StateEvent {
    const result = this.db
      .prepare(
        `insert into app_state_events
          (source, operation, entity_type, entity_id, category_id, project_id, task_id, created_at)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        input.source,
        input.operation,
        input.entityType ?? "overview",
        input.entityId ?? null,
        input.categoryId ?? null,
        input.projectId ?? null,
        input.taskId ?? null,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): StateEvent | null {
    const row = this.db.prepare("select * from app_state_events where id = ?").get(id) as StateEventRow | undefined;
    return row ? toStateEvent(row) : null;
  }

  latestId(): number {
    const row = this.db.prepare("select coalesce(max(id), 0) as id from app_state_events").get() as { id: number };
    return row.id;
  }

  listAfter(id: number, limit = 50): StateEvent[] {
    const rows = this.db
      .prepare("select * from app_state_events where id > ? order by id asc limit ?")
      .all(id, limit) as StateEventRow[];
    return rows.map(toStateEvent);
  }
}
