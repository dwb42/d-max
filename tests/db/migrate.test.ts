import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "../../src/db/migrate.js";
import { openDatabase } from "../../src/db/connection.js";

describe("migrate", () => {
  it("adds category colors, project type, date range columns, and promotes Inbox category on existing databases", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d-max-migrate-test-"));
    const databasePath = path.join(dir, "legacy.sqlite");
    const legacy = new Database(databasePath);

    legacy.exec(`
      create table categories (
        id integer primary key,
        name text not null unique,
        description text,
        sort_order integer not null default 0,
        is_system integer not null default 0 check (is_system in (0, 1)),
        created_at text not null,
        updated_at text not null
      );
      create table projects (
        id integer primary key,
        category_id integer not null references categories(id),
        parent_id integer references projects(id),
        name text not null,
        status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
        summary text,
        markdown text not null default '',
        sort_order integer not null default 0,
        is_system integer not null default 0 check (is_system in (0, 1)),
        created_at text not null,
        updated_at text not null
      );
      insert into categories (id, name, description, sort_order, is_system, created_at, updated_at)
        values (1, 'Inbox', null, 1000, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
      insert into projects (id, category_id, parent_id, name, status, summary, markdown, sort_order, is_system, created_at, updated_at)
        values (1, 1, null, 'Legacy Initiative', 'active', null, '', 1000, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
    `);
    legacy.close();

    migrate(databasePath);
    const db = openDatabase(databasePath);

    try {
      const initiativeColumns = db.prepare("pragma table_info(initiatives)").all() as Array<{ name: string }>;
      const initiative = db.prepare("select type, start_date, end_date from initiatives where id = 1").get() as {
        type: string;
        start_date: string | null;
        end_date: string | null;
      };
      const categoryColumns = db.prepare("pragma table_info(categories)").all() as Array<{ name: string }>;
      const inbox = db.prepare("select is_system, color, emoji from categories where name = 'Inbox'").get() as {
        is_system: number;
        color: string;
        emoji: string;
      };

      expect(categoryColumns.some((column) => column.name === "color")).toBe(true);
      expect(categoryColumns.some((column) => column.name === "emoji")).toBe(true);
      expect(initiativeColumns.some((column) => column.name === "type")).toBe(true);
      expect(initiativeColumns.some((column) => column.name === "start_date")).toBe(true);
      expect(initiativeColumns.some((column) => column.name === "end_date")).toBe(true);
      expect(initiative.type).toBe("project");
      expect(initiative.start_date).toBeNull();
      expect(initiative.end_date).toBeNull();
      expect(inbox.is_system).toBe(1);
      expect(inbox.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(inbox.emoji).toBe("📥");
    } finally {
      db.close();
    }
  });
});
