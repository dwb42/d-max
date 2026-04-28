import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type ProjectStatus = "active" | "paused" | "completed" | "archived";

export type Project = {
  id: number;
  categoryId: number;
  parentId: number | null;
  name: string;
  status: ProjectStatus;
  summary: string | null;
  markdown: string;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

type ProjectRow = {
  id: number;
  category_id: number;
  parent_id: number | null;
  name: string;
  status: ProjectStatus;
  summary: string | null;
  markdown: string;
  is_system: number;
  created_at: string;
  updated_at: string;
};

export type CreateProjectInput = {
  categoryId: number;
  parentId?: number | null;
  name: string;
  summary?: string | null;
  markdown?: string;
  isSystem?: boolean;
};

export type UpdateProjectInput = {
  id: number;
  categoryId?: number;
  parentId?: number | null;
  name?: string;
  status?: ProjectStatus;
  summary?: string | null;
};

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentId: row.parent_id,
    name: row.name,
    status: row.status,
    summary: row.summary,
    markdown: row.markdown,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class ProjectRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { categoryId?: number; status?: ProjectStatus } = {}): Project[] {
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

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`select * from projects ${where} order by is_system desc, lower(name) asc`)
      .all(...params) as ProjectRow[];

    return rows.map(toProject);
  }

  findById(id: number): Project | null {
    const row = this.db.prepare("select * from projects where id = ?").get(id) as ProjectRow | undefined;
    return row ? toProject(row) : null;
  }

  create(input: CreateProjectInput, now = nowIso()): Project {
    const result = this.db
      .prepare(
        "insert into projects (category_id, parent_id, name, status, summary, markdown, is_system, created_at, updated_at) values (?, ?, ?, 'active', ?, ?, ?, ?, ?)"
      )
      .run(
        input.categoryId,
        input.parentId ?? null,
        input.name,
        input.summary ?? null,
        input.markdown ?? "",
        input.isSystem ? 1 : 0,
        now,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateProjectInput, now = nowIso()): Project {
    const existing = this.findById(input.id);

    if (!existing) {
      throw new Error(`Project not found: ${input.id}`);
    }

    this.db
      .prepare(
        "update projects set category_id = ?, parent_id = ?, name = ?, status = ?, summary = ?, updated_at = ? where id = ?"
      )
      .run(
        input.categoryId ?? existing.categoryId,
        input.parentId === undefined ? existing.parentId : input.parentId,
        input.name ?? existing.name,
        input.status ?? existing.status,
        input.summary === undefined ? existing.summary : input.summary,
        now,
        input.id
      );

    return this.findById(input.id)!;
  }

  updateMarkdown(id: number, markdown: string, now = nowIso()): Project {
    const existing = this.findById(id);

    if (!existing) {
      throw new Error(`Project not found: ${id}`);
    }

    this.db.prepare("update projects set markdown = ?, updated_at = ? where id = ?").run(markdown, now, id);
    return this.findById(id)!;
  }

  archive(id: number, now = nowIso()): Project {
    return this.update({ id, status: "archived" }, now);
  }
}
