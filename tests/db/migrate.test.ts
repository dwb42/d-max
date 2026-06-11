import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import Database from "better-sqlite3";
import { describe, expect, it } from "vitest";
import { migrate } from "../../src/db/migrate.js";
import { openDatabase } from "../../src/db/connection.js";

describe("migrate", () => {
  it("adds category colors, project type, date range columns, media tables, who tables, and promotes Inbox category on existing databases", () => {
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
      create table tasks (
        id integer primary key,
        project_id integer not null references projects(id),
        title text not null,
        status text not null default 'open' check (status in ('open', 'in_progress', 'blocked', 'done', 'cancelled')),
        priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
        notes text,
        due_at text,
        sort_order integer not null default 0,
        created_at text not null,
        updated_at text not null,
        completed_at text
      );
      insert into categories (id, name, description, sort_order, is_system, created_at, updated_at)
        values (1, 'Inbox', null, 1000, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
      insert into projects (id, category_id, parent_id, name, status, summary, markdown, sort_order, is_system, created_at, updated_at)
        values (1, 1, null, 'Legacy Initiative', 'active', null, '', 1000, 0, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z');
      insert into tasks (id, project_id, title, status, priority, notes, due_at, sort_order, created_at, updated_at, completed_at)
        values (1, 1, 'Legacy blocked task', 'blocked', 'normal', null, null, 1000, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z', null);
    `);
    legacy.close();

    migrate(databasePath);
    const db = openDatabase(databasePath);

    try {
      const initiativeColumns = db.prepare("pragma table_info(initiatives)").all() as Array<{ name: string }>;
      const initiativeRelationColumns = db.prepare("pragma table_info(initiative_relations)").all() as Array<{ name: string }>;
      const initiative = db.prepare("select type, start_date, end_date, is_locked from initiatives where id = 1").get() as {
        type: string;
        start_date: string | null;
        end_date: string | null;
        is_locked: number;
      };
      const categoryColumns = db.prepare("pragma table_info(categories)").all() as Array<{ name: string }>;
      const mediaAssetColumns = db.prepare("pragma table_info(media_assets)").all() as Array<{ name: string }>;
      const mediaLinkColumns = db.prepare("pragma table_info(media_links)").all() as Array<{ name: string }>;
      const graphAnnotationColumns = db.prepare("pragma table_info(graph_node_annotations)").all() as Array<{ name: string }>;
      const mindmapDraftColumns = db.prepare("pragma table_info(mindmap_change_drafts)").all() as Array<{ name: string }>;
      const appChatMessageColumns = db.prepare("pragma table_info(app_chat_messages)").all() as Array<{ name: string }>;
      const partyColumns = db.prepare("pragma table_info(parties)").all() as Array<{ name: string }>;
      const peopleColumns = db.prepare("pragma table_info(people)").all() as Array<{ name: string }>;
      const organizationColumns = db.prepare("pragma table_info(organizations)").all() as Array<{ name: string }>;
      const relationshipTypeCount = db.prepare("select count(*) as count from relationship_types where is_system = 1").get() as { count: number };
      const participantRoleTypeCount = db.prepare("select count(*) as count from participant_role_types where is_system = 1").get() as { count: number };
      const legacyTask = db.prepare("select status, completed_at from tasks where id = 1").get() as {
        status: string;
        completed_at: string | null;
      };
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
      expect(initiativeColumns.some((column) => column.name === "is_locked")).toBe(true);
      expect(initiativeRelationColumns.some((column) => column.name === "predecessor_initiative_id")).toBe(true);
      expect(initiativeRelationColumns.some((column) => column.name === "successor_initiative_id")).toBe(true);
      expect(initiativeRelationColumns.some((column) => column.name === "relation_type")).toBe(true);
      expect(mediaAssetColumns.some((column) => column.name === "storage_path")).toBe(true);
      expect(mediaAssetColumns.some((column) => column.name === "sha256")).toBe(true);
      expect(mediaLinkColumns.some((column) => column.name === "entity_type")).toBe(true);
      expect(mediaLinkColumns.some((column) => column.name === "caption")).toBe(true);
      expect(graphAnnotationColumns.some((column) => column.name === "annotation_type")).toBe(true);
      expect(mindmapDraftColumns.some((column) => column.name === "patches_json")).toBe(true);
      expect(appChatMessageColumns.some((column) => column.name === "audio_generation_status")).toBe(true);
      expect(appChatMessageColumns.some((column) => column.name === "audio_generated_from_message_id")).toBe(true);
      expect(partyColumns.some((column) => column.name === "display_name")).toBe(true);
      expect(peopleColumns.some((column) => column.name === "salutation")).toBe(true);
      expect(organizationColumns.some((column) => column.name === "markdown")).toBe(true);
      expect(relationshipTypeCount.count).toBeGreaterThanOrEqual(10);
      expect(participantRoleTypeCount.count).toBeGreaterThanOrEqual(12);
      expect(initiative.type).toBe("project");
      expect(initiative.start_date).toBeNull();
      expect(initiative.end_date).toBeNull();
      expect(initiative.is_locked).toBe(0);
      expect(legacyTask.status).toBe("open");
      expect(legacyTask.completed_at).toBeNull();
      expect(inbox.is_system).toBe(1);
      expect(inbox.color).toMatch(/^#[0-9a-f]{6}$/);
      expect(inbox.emoji).toBe("📥");
      expect(() =>
        db
          .prepare(
            "insert into tasks (initiative_id, title, status, priority, sort_order, created_at, updated_at) values (1, 'bad status', 'blocked', 'normal', 1000, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')"
          )
          .run()
      ).toThrow();
      expect(() =>
        db
          .prepare(
            "insert into app_conversations (context_type, context_entity_id, created_at, updated_at) values ('ideas', null, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')"
          )
          .run()
      ).not.toThrow();
      expect(() =>
        db
          .prepare(
            "insert into app_conversations (context_type, context_entity_id, created_at, updated_at) values ('project', 1, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')"
          )
          .run()
      ).not.toThrow();
      expect(() =>
        db
          .prepare(
            "insert into app_conversations (context_type, context_entity_id, created_at, updated_at) values ('person', 1, '2026-05-01T00:00:00.000Z', '2026-05-01T00:00:00.000Z')"
          )
          .run()
      ).not.toThrow();
    } finally {
      db.close();
    }
  });
});
