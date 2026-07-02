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
      const gmailMailboxColumns = db.prepare("pragma table_info(gmail_mailboxes)").all() as Array<{ name: string }>;
      const gmailMessageColumns = db.prepare("pragma table_info(gmail_messages)").all() as Array<{ name: string }>;
      const gmailVisibilityColumns = db.prepare("pragma table_info(gmail_message_party_visibility)").all() as Array<{ name: string }>;
      const partyColumns = db.prepare("pragma table_info(parties)").all() as Array<{ name: string }>;
      const peopleColumns = db.prepare("pragma table_info(people)").all() as Array<{ name: string }>;
      const organizationColumns = db.prepare("pragma table_info(organizations)").all() as Array<{ name: string }>;
      const relationshipTypeCount = db.prepare("select count(*) as count from relationship_types where is_system = 1").get() as { count: number };
      const participantRoleTypeCount = db.prepare("select count(*) as count from participant_role_types where is_system = 1").get() as { count: number };
      const partyTimelineColumns = db.prepare("pragma table_info(party_timeline_entries)").all() as Array<{ name: string }>;
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
      expect(gmailMailboxColumns.some((column) => column.name === "account_label")).toBe(true);
      expect(gmailMessageColumns.some((column) => column.name === "plain_body")).toBe(true);
      expect(gmailVisibilityColumns.some((column) => column.name === "status")).toBe(true);
      expect(partyColumns.some((column) => column.name === "display_name")).toBe(true);
      expect(peopleColumns.some((column) => column.name === "salutation")).toBe(true);
      expect(peopleColumns.some((column) => column.name === "description")).toBe(true);
      expect(organizationColumns.some((column) => column.name === "markdown")).toBe(true);
      expect(relationshipTypeCount.count).toBeGreaterThanOrEqual(10);
      expect(participantRoleTypeCount.count).toBeGreaterThanOrEqual(12);
      expect(partyTimelineColumns.some((column) => column.name === "channel")).toBe(true);
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

  it("repairs orphaned app chat references and prevents conversation id reuse", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d-max-chat-migrate-test-"));
    const databasePath = path.join(dir, "legacy-chat.sqlite");
    const legacy = new Database(databasePath);

    legacy.pragma("foreign_keys = OFF");
    legacy.exec(`
      create table app_conversations (
        id integer primary key,
        title text,
        context_type text not null,
        context_entity_id integer,
        created_at text not null,
        updated_at text not null
      );
      create table app_chat_messages (
        id integer primary key,
        conversation_id integer references app_conversations(id),
        role text not null,
        content text not null,
        source text not null default 'app_text',
        audio_generation_status text not null default 'none',
        audio_provider text,
        audio_error text,
        audio_generated_from_message_id integer references app_chat_messages(id),
        audio_generated_at text,
        research_summary_json text,
        created_at text not null
      );
      create table app_prompt_logs (
        id integer primary key,
        conversation_id integer references app_conversations(id),
        user_message_id integer references app_chat_messages(id),
        openclaw_session_id text not null,
        context_type text not null,
        context_entity_id integer,
        user_input text not null,
        system_instructions text not null,
        context_data text not null,
        memory_history text not null,
        tools text not null,
        final_prompt text not null,
        context_payload_json text,
        turn_trace text,
        created_at text not null
      );
      insert into app_conversations (id, title, context_type, context_entity_id, created_at, updated_at)
        values (1, 'Existing', 'project', 1, '2026-06-30T10:00:00.000Z', '2026-06-30T10:00:00.000Z');
      insert into app_chat_messages (id, conversation_id, role, content, source, created_at)
        values
          (1, 1, 'user', 'valid message', 'app_text', '2026-06-30T10:01:00.000Z'),
          (2, 42, 'user', 'orphaned voice message', 'app_voice_message', '2026-06-30T10:02:00.000Z');
      insert into app_prompt_logs (
        id, conversation_id, user_message_id, openclaw_session_id, context_type, context_entity_id,
        user_input, system_instructions, context_data, memory_history, tools, final_prompt, created_at
      )
        values
          (1, 1, 1, 'session-1', 'project', 1, 'valid message', 'sys', 'ctx', 'mem', 'tools', 'prompt', '2026-06-30T10:01:01.000Z'),
          (2, 42, 999, 'session-2', 'project', 1, 'orphaned message', 'sys', 'ctx', 'mem', 'tools', 'prompt', '2026-06-30T10:02:01.000Z');
    `);
    legacy.close();

    migrate(databasePath);
    const db = openDatabase(databasePath);

    try {
      const conversationSql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_conversations'").get() as { sql: string };
      const messageSql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_chat_messages'").get() as { sql: string };
      const promptLogSql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_prompt_logs'").get() as { sql: string };
      const orphanedMessage = db.prepare("select conversation_id from app_chat_messages where id = 2").get() as { conversation_id: number | null };
      const orphanedPromptLog = db.prepare("select conversation_id, user_message_id from app_prompt_logs where id = 2").get() as {
        conversation_id: number | null;
        user_message_id: number | null;
      };
      const foreignKeyViolations = db.prepare("select * from pragma_foreign_key_check").all();

      expect(conversationSql.sql.toLowerCase()).toContain("autoincrement");
      expect(messageSql.sql.toLowerCase()).toContain("autoincrement");
      expect(promptLogSql.sql.toLowerCase()).toContain("autoincrement");
      expect(orphanedMessage.conversation_id).toBeNull();
      expect(orphanedPromptLog.conversation_id).toBeNull();
      expect(orphanedPromptLog.user_message_id).toBeNull();
      expect(foreignKeyViolations).toEqual([]);

      db
        .prepare(
          "insert into app_conversations (title, context_type, context_entity_id, created_at, updated_at) values ('Next', 'organization', 13, '2026-06-30T10:03:00.000Z', '2026-06-30T10:03:00.000Z')"
        )
        .run();
      const nextConversation = db.prepare("select max(id) as id from app_conversations").get() as { id: number };
      expect(nextConversation.id).toBeGreaterThan(42);
    } finally {
      db.close();
    }
  });

  it("migrates initiative and task participants into fresh leads without removing participants", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d-max-lead-migrate-test-"));
    const databasePath = path.join(dir, "lead-migration.sqlite");
    migrate(databasePath);
    let db = openDatabase(databasePath);
    try {
      const now = "2026-07-01T00:00:00.000Z";
      db.prepare("insert into categories (name, color, emoji, sort_order, created_at, updated_at) values ('Leads', '#27806f', 'L', 1000, ?, ?)").run(now, now);
      const categoryId = (db.prepare("select id from categories where name = 'Leads'").get() as { id: number }).id;
      db.prepare("insert into initiatives (category_id, name, markdown, sort_order, created_at, updated_at) values (?, 'Lead initiative', '', 1000, ?, ?)").run(categoryId, now, now);
      const initiativeId = (db.prepare("select id from initiatives where name = 'Lead initiative'").get() as { id: number }).id;
      db.prepare("insert into tasks (initiative_id, title, sort_order, created_at, updated_at) values (?, 'Lead task', 1000, ?, ?)").run(initiativeId, now, now);
      const taskId = (db.prepare("select id from tasks where title = 'Lead task'").get() as { id: number }).id;
      db.prepare("insert into parties (type, display_name, created_at, updated_at) values ('person', 'Clara Kontakt', ?, ?)").run(now, now);
      const partyId = (db.prepare("select id from parties where display_name = 'Clara Kontakt'").get() as { id: number }).id;
      const stakeholderId = (db.prepare("select id from participant_role_types where key = 'stakeholder'").get() as { id: number }).id;
      db.prepare("insert into entity_participants (party_id, entity_type, entity_id, role_type_id, role_label, is_primary, created_at, updated_at) values (?, 'initiative', ?, ?, null, 1, ?, ?)").run(partyId, initiativeId, stakeholderId, now, now);
      db.prepare("insert into entity_participants (party_id, entity_type, entity_id, role_type_id, role_label, is_primary, created_at, updated_at) values (?, 'initiative', ?, null, 'Kontaktperson', 0, ?, ?)").run(partyId, initiativeId, now, now);
      db.prepare("insert into entity_participants (party_id, entity_type, entity_id, role_type_id, role_label, is_primary, created_at, updated_at) values (?, 'task', ?, null, 'Ansprechpartner', 0, ?, ?)").run(partyId, taskId, now, now);
    } finally {
      db.close();
    }

    migrate(databasePath);
    db = openDatabase(databasePath);
    try {
      const leadRows = db.prepare("select l.*, ls.key as status_key from leads l join lead_statuses ls on ls.id = l.status_id order by l.id").all() as Array<{
        party_id: number;
        initiative_id: number | null;
        task_id: number | null;
        role_label: string | null;
        status_key: string;
      }>;
      const participantCount = (db.prepare("select count(*) as count from entity_participants").get() as { count: number }).count;

      expect(leadRows).toHaveLength(2);
      expect(leadRows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ initiative_id: expect.any(Number), task_id: null, role_label: "Stakeholder", status_key: "fresh" }),
          expect.objectContaining({ initiative_id: null, task_id: expect.any(Number), role_label: "Ansprechpartner", status_key: "fresh" })
        ])
      );
      expect(participantCount).toBe(3);
    } finally {
      db.close();
    }
  });
});
