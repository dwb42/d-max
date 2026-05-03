import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type InitiativeType = "idea" | "project" | "habit";
export type InitiativeStatus = "active" | "paused" | "completed" | "archived";

export type Initiative = {
  id: number;
  categoryId: number;
  parentId: number | null;
  type: InitiativeType;
  name: string;
  status: InitiativeStatus;
  summary: string | null;
  markdown: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

type InitiativeRow = {
  id: number;
  category_id: number;
  parent_id: number | null;
  type: InitiativeType;
  name: string;
  status: InitiativeStatus;
  summary: string | null;
  markdown: string;
  start_date: string | null;
  end_date: string | null;
  sort_order: number;
  is_system: number;
  created_at: string;
  updated_at: string;
};

export type CreateInitiativeInput = {
  categoryId: number;
  parentId?: number | null;
  type?: InitiativeType;
  name: string;
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
  isSystem?: boolean;
};

export type UpdateInitiativeInput = {
  id: number;
  categoryId?: number;
  parentId?: number | null;
  type?: InitiativeType;
  name?: string;
  status?: InitiativeStatus;
  summary?: string | null;
  startDate?: string | null;
  endDate?: string | null;
};

function toInitiative(row: InitiativeRow): Initiative {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentId: row.parent_id,
    type: row.type,
    name: row.name,
    status: row.status,
    summary: row.summary,
    markdown: row.markdown,
    startDate: row.start_date,
    endDate: row.end_date,
    sortOrder: row.sort_order,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class InitiativeRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { categoryId?: number; status?: InitiativeStatus; type?: InitiativeType } = {}): Initiative[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.categoryId !== undefined) {
      conditions.push("category_id = ?");
      params.push(filters.categoryId);
    }

    if (filters.status !== undefined) {
      conditions.push("status = ?");
      params.push(filters.status);
    }

    if (filters.type !== undefined) {
      conditions.push("type = ?");
      params.push(filters.type);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from initiatives ${where} order by category_id asc, sort_order asc, is_system desc, lower(name) asc, id asc`)
      .all(...params) as InitiativeRow[];

    return rows.map(toInitiative);
  }

  findById(id: number): Initiative | null {
    const row = this.db.prepare("select * from initiatives where id = ?").get(id) as InitiativeRow | undefined;
    return row ? toInitiative(row) : null;
  }

  create(input: CreateInitiativeInput, now = nowIso()): Initiative {
    assertValidInitiativeDateRange(input.startDate ?? null, input.endDate ?? null);

    const result = this.db
      .prepare(
        "insert into initiatives (category_id, parent_id, type, name, status, summary, markdown, start_date, end_date, sort_order, is_system, created_at, updated_at) values (?, ?, ?, ?, 'active', ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        input.categoryId,
        input.parentId ?? null,
        input.type ?? "project",
        input.name,
        input.summary ?? null,
        input.markdown ?? "",
        input.startDate ?? null,
        input.endDate ?? null,
        this.nextSortOrder(input.categoryId),
        input.isSystem ? 1 : 0,
        now,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateInitiativeInput, now = nowIso()): Initiative {
    const existing = this.findById(input.id);

    if (!existing) {
      throw new Error(`Initiative not found: ${input.id}`);
    }

    const nextStartDate = input.startDate === undefined ? existing.startDate : input.startDate;
    const nextEndDate = input.endDate === undefined ? existing.endDate : input.endDate;
    assertValidInitiativeDateRange(nextStartDate, nextEndDate);

    this.db
      .prepare(
        "update initiatives set category_id = ?, parent_id = ?, type = ?, name = ?, status = ?, summary = ?, start_date = ?, end_date = ?, updated_at = ? where id = ?"
      )
      .run(
        input.categoryId ?? existing.categoryId,
        input.parentId === undefined ? existing.parentId : input.parentId,
        input.type ?? existing.type,
        input.name ?? existing.name,
        input.status ?? existing.status,
        input.summary === undefined ? existing.summary : input.summary,
        nextStartDate,
        nextEndDate,
        now,
        input.id
      );

    return this.findById(input.id)!;
  }

  updateMarkdown(id: number, markdown: string, now = nowIso()): Initiative {
    const existing = this.findById(id);

    if (!existing) {
      throw new Error(`Initiative not found: ${id}`);
    }

    this.db.prepare("update initiatives set markdown = ?, updated_at = ? where id = ?").run(markdown, now, id);
    return this.findById(id)!;
  }

  archive(id: number, now = nowIso()): Initiative {
    return this.update({ id, status: "archived" }, now);
  }

  reorderWithinCategory(categoryId: number, initiativeIds: number[], now = nowIso()): Initiative[] {
    const uniqueIds = [...new Set(initiativeIds)];
    const existing = this.list({ categoryId });
    const existingIds = new Set(existing.map((initiative) => initiative.id));
    if (uniqueIds.some((id) => !existingIds.has(id))) {
      throw new Error("Initiative reorder can only include initiatives from the same category");
    }

    const update = this.db.prepare("update initiatives set sort_order = ?, updated_at = ? where id = ? and category_id = ?");
    const transaction = this.db.transaction(() => {
      uniqueIds.forEach((id, index) => update.run((index + 1) * 1000, now, id, categoryId));
    });
    transaction();
    return this.list({ categoryId });
  }

  private nextSortOrder(categoryId: number): number {
    const row = this.db
      .prepare("select coalesce(max(sort_order), 0) + 1000 as next from initiatives where category_id = ?")
      .get(categoryId) as { next: number };
    return row.next;
  }
}

function assertValidInitiativeDateRange(startDate: string | null, endDate: string | null): void {
  if (startDate && endDate && startDate > endDate) {
    throw new Error("Initiative startDate cannot be after endDate");
  }
}
