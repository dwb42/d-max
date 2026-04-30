import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type Category = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  sort_order: number;
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
    sortOrder: row.sort_order,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

export class CategoryRepository {
  constructor(private readonly db: Database.Database) {}

  list(): Category[] {
    const rows = this.db
      .prepare("select * from categories order by sort_order asc, is_system desc, lower(name) asc, id asc")
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
        "insert into categories (name, description, sort_order, is_system, created_at, updated_at) values (?, ?, ?, ?, ?, ?)"
      )
      .run(input.name, input.description ?? null, this.nextSortOrder(), input.isSystem ? 1 : 0, now, now);

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

  reorder(categoryIds: number[], now = nowIso()): Category[] {
    const uniqueIds = [...new Set(categoryIds)];
    const update = this.db.prepare("update categories set sort_order = ?, updated_at = ? where id = ?");
    const transaction = this.db.transaction(() => {
      uniqueIds.forEach((id, index) => update.run((index + 1) * 1000, now, id));
    });
    transaction();
    return this.list();
  }

  private nextSortOrder(): number {
    const row = this.db.prepare("select coalesce(max(sort_order), 0) + 1000 as next from categories").get() as { next: number };
    return row.next;
  }
}
