import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type Category = {
  id: number;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  is_system: number;
  created_at: string;
  updated_at: string;
};

export type CreateCategoryInput = {
  name: string;
  description?: string | null;
  isSystem?: boolean;
};

export type UpdateCategoryInput = {
  id: number;
  name?: string;
  description?: string | null;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CategoryRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Category[] {
    const rows = this.db
      .prepare("select * from categories order by is_system desc, lower(name) asc")
      .all() as CategoryRow[];

    return rows.map(toCategory);
  }

  findById(id: number): Category | null {
    const row = this.db.prepare("select * from categories where id = ?").get(id) as CategoryRow | undefined;
    return row ? toCategory(row) : null;
  }

  findByName(name: string): Category | null {
    const row = this.db.prepare("select * from categories where lower(name) = lower(?)").get(name) as CategoryRow | undefined;
    return row ? toCategory(row) : null;
  }

  create(input: CreateCategoryInput, now = nowIso()): Category {
    const result = this.db
      .prepare(
        "insert into categories (name, description, is_system, created_at, updated_at) values (?, ?, ?, ?, ?)"
      )
      .run(input.name, input.description ?? null, input.isSystem ? 1 : 0, now, now);

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateCategoryInput, now = nowIso()): Category {
    const existing = this.findById(input.id);

    if (!existing) {
      throw new Error(`Category not found: ${input.id}`);
    }

    this.db
      .prepare("update categories set name = ?, description = ?, updated_at = ? where id = ?")
      .run(input.name ?? existing.name, input.description ?? existing.description, now, input.id);

    return this.findById(input.id)!;
  }

  ensureSystemCategory(name: string, now = nowIso()): Category {
    const existing = this.findByName(name);
    return existing ?? this.create({ name, isSystem: true }, now);
  }
}
