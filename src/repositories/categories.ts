import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type Category = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  emoji: string;
  sortOrder: number;
  isSystem: boolean;
  createdAt: string;
  updatedAt: string;
};

type CategoryRow = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  emoji: string;
  sort_order: number;
  is_system: number;
  created_at: string;
  updated_at: string;
};

export type CreateCategoryInput = {
  name: string;
  description?: string | null;
  color?: string | null;
  isSystem?: boolean;
};

export type UpdateCategoryInput = {
  id: number;
  name?: string;
  description?: string | null;
  color?: string | null;
};

function toCategory(row: CategoryRow): Category {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    color: row.color,
    emoji: row.emoji,
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
    const sortOrder = this.nextSortOrder();
    const result = this.db
      .prepare(
        "insert into categories (name, description, color, emoji, sort_order, is_system, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .run(
        input.name,
        input.description ?? null,
        normalizeCategoryColor(input.color) ?? categoryColorForSortOrder(sortOrder),
        categoryEmojiForName(input.name),
        sortOrder,
        input.isSystem ? 1 : 0,
        now,
        now
      );

    return this.findById(Number(result.lastInsertRowid))!;
  }

  update(input: UpdateCategoryInput, now = nowIso()): Category {
    const existing = this.findById(input.id);

    if (!existing) {
      throw new Error(`Category not found: ${input.id}`);
    }

    this.db
      .prepare("update categories set name = ?, description = ?, color = ?, updated_at = ? where id = ?")
      .run(
        input.name ?? existing.name,
        input.description === undefined ? existing.description : input.description,
        normalizeCategoryColor(input.color) ?? existing.color,
        now,
        input.id
      );

    return this.findById(input.id)!;
  }

  ensureSystemCategory(name: string, now = nowIso()): Category {
    const existing = this.findByName(name);
    if (!existing) {
      return this.create({ name, isSystem: true }, now);
    }

    if (!existing.isSystem) {
      this.db.prepare("update categories set is_system = 1, updated_at = ? where id = ?").run(now, existing.id);
      return this.findById(existing.id)!;
    }

    return existing;
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

const categoryPalette = [
  "#27806f",
  "#5577d8",
  "#d86b35",
  "#8a64c9",
  "#c9577a",
  "#d0a12a",
  "#3f8fb8",
  "#6f8f38"
];

export function categoryColorForSortOrder(sortOrder: number): string {
  const index = Math.max(0, Math.floor(sortOrder / 1000) - 1) % categoryPalette.length;
  return categoryPalette[index] ?? categoryPalette[0]!;
}

export function normalizeCategoryColor(color?: string | null): string | null {
  const trimmed = color?.trim();
  return trimmed && /^#[0-9a-f]{6}$/i.test(trimmed) ? trimmed.toLowerCase() : null;
}

export function categoryEmojiForName(name: string): string {
  const normalized = normalizeCategoryName(name);
  if (normalized.includes("business")) return "💼";
  if (normalized.includes("vermoegensverwaltung") || normalized.includes("vermogensverwaltung") || normalized.includes("finanzen")) return "💰";
  if (normalized.includes("haus") || normalized.includes("hof")) return "🏡";
  if (normalized.includes("reisen")) return "🚲";
  if (normalized.includes("inbox")) return "📥";
  if (normalized.includes("freunde")) return "🤝";
  if (normalized.includes("familie")) return "👨‍👩‍👧‍👦";
  if (normalized.includes("koerper") || normalized.includes("korper") || normalized.includes("geist")) return "🧘";
  if (normalized.includes("herz") || normalized.includes("seele")) return "❤️";
  if (normalized.includes("health") || normalized.includes("gesundheit")) return "🌿";
  return "📁";
}

function normalizeCategoryName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ö/g, "oe")
    .replace(/ä/g, "ae")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss");
}
