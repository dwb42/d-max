import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type TaskChecklistItemStatus = "todo" | "done";

export type TaskChecklistItem = {
  id: number;
  taskId: number;
  name: string;
  status: TaskChecklistItemStatus;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

type TaskChecklistItemRow = {
  id: number;
  task_id: number;
  name: string;
  status: TaskChecklistItemStatus;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

export type CreateTaskChecklistItemInput = {
  taskId: number;
  name: string;
};

export type UpdateTaskChecklistItemInput = {
  id: number;
  taskId?: number;
  name?: string;
  status?: TaskChecklistItemStatus;
};

function toTaskChecklistItem(row: TaskChecklistItemRow): TaskChecklistItem {
  return {
    id: row.id,
    taskId: row.task_id,
    name: row.name,
    status: row.status,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class TaskChecklistItemRepository {
  constructor(private readonly db: Database.Database) {}

  listByTask(taskId: number): TaskChecklistItem[] {
    const rows = this.db
      .prepare("select * from task_checklist_items where task_id = ? order by sort_order asc, id asc")
      .all(taskId) as TaskChecklistItemRow[];

    return rows.map(toTaskChecklistItem);
  }

  findById(id: number): TaskChecklistItem | null {
    const row = this.db.prepare("select * from task_checklist_items where id = ?").get(id) as TaskChecklistItemRow | undefined;
    return row ? toTaskChecklistItem(row) : null;
  }

  create(input: CreateTaskChecklistItemInput, now = nowIso()): TaskChecklistItem {
    const result = this.db
      .prepare(
        "insert into task_checklist_items (task_id, name, status, sort_order, created_at, updated_at) values (?, ?, 'todo', ?, ?, ?)"
      )
      .run(input.taskId, input.name, this.nextSortOrder(input.taskId), now, now);

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateTaskChecklistItemInput, now = nowIso()): TaskChecklistItem {
    const existing = this.findById(input.id);

    if (!existing) {
      throw new Error(`Task checklist item not found: ${input.id}`);
    }

    this.db
      .prepare("update task_checklist_items set task_id = ?, name = ?, status = ?, updated_at = ? where id = ?")
      .run(input.taskId ?? existing.taskId, input.name ?? existing.name, input.status ?? existing.status, now, input.id);

    return this.findById(input.id)!;
  }

  delete(id: number): void {
    this.db.prepare("delete from task_checklist_items where id = ?").run(id);
  }

  reorderWithinTask(taskId: number, itemIds: number[], now = nowIso()): TaskChecklistItem[] {
    const uniqueIds = [...new Set(itemIds)];
    const existing = this.listByTask(taskId);
    const existingIds = new Set(existing.map((item) => item.id));
    if (uniqueIds.some((id) => !existingIds.has(id))) {
      throw new Error("Checklist item reorder can only include items from the same task");
    }

    const update = this.db.prepare("update task_checklist_items set sort_order = ?, updated_at = ? where id = ? and task_id = ?");
    const transaction = this.db.transaction(() => {
      uniqueIds.forEach((id, index) => update.run((index + 1) * 1000, now, id, taskId));
    });
    transaction();
    return this.listByTask(taskId);
  }

  private nextSortOrder(taskId: number): number {
    const row = this.db
      .prepare("select coalesce(max(sort_order), 0) + 1000 as next from task_checklist_items where task_id = ?")
      .get(taskId) as { next: number };
    return row.next;
  }
}
