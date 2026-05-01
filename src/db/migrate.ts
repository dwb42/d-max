import fs from "node:fs";
import path from "node:path";
import { deriveConversationTitle } from "../chat/conversation-title.js";
import { openDatabase } from "./connection.js";

export function migrate(databasePath?: string): void {
  const schemaPath = path.resolve("data/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);

  try {
    migrateExistingAppChatMessages(db);
    migrateRemovedThinkingDomain(db);
    migrateSortOrder(db);
    db.exec(schema);
    migratePromptLogs(db);
    migrateStateEvents(db);
    backfillConversationTitles(db);
  } finally {
    db.close();
  }
}

function migrateRemovedThinkingDomain(db: ReturnType<typeof openDatabase>): void {
  db.pragma("foreign_keys = OFF");
  try {
    removeAppChatThinkingSpaceColumn(db);
    removeThinkingStateEvents(db);

    db.exec(`
      drop table if exists thought_links;
      drop table if exists tensions;
      drop table if exists thoughts;
      drop table if exists thinking_sessions;
      drop table if exists thinking_spaces;
    `);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function removeAppChatThinkingSpaceColumn(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'app_chat_messages'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(app_chat_messages)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "thinking_space_id")) {
    return;
  }

  db.exec(`
    create table app_chat_messages_next (
      id integer primary key,
      conversation_id integer references app_conversations(id),
      role text not null check (role in ('user', 'assistant')),
      content text not null,
      source text not null default 'app_text' check (source in ('app_text', 'app_voice_message', 'system')),
      created_at text not null
    );
    insert into app_chat_messages_next (id, conversation_id, role, content, source, created_at)
      select id, conversation_id, role, content, source, created_at from app_chat_messages;
    drop table app_chat_messages;
    alter table app_chat_messages_next rename to app_chat_messages;
  `);
}

function removeThinkingStateEvents(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'app_state_events'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'project', 'task')),
      entity_id integer,
      category_id integer,
      project_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, project_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, project_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'project', 'task');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
  `);
}

function migrateExistingAppChatMessages(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'app_chat_messages'")
    .get() as { name: string } | undefined;

  if (!existing) {
    return;
  }

  db.exec(`
    create table if not exists app_conversations (
      id integer primary key,
      title text,
      context_type text not null check (context_type in ('global', 'projects', 'category', 'project', 'task')),
      context_entity_id integer,
      created_at text not null,
      updated_at text not null,
      check (
        (context_type in ('global', 'projects') and context_entity_id is null)
        or (context_type in ('category', 'project', 'task') and context_entity_id is not null)
      )
    )
  `);

  const chatColumns = db.prepare("pragma table_info(app_chat_messages)").all() as Array<{ name: string }>;
  if (!chatColumns.some((column) => column.name === "conversation_id")) {
    db.exec("alter table app_chat_messages add column conversation_id integer references app_conversations(id)");
  }
}

function migratePromptLogs(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists app_prompt_logs (
      id integer primary key,
      conversation_id integer references app_conversations(id),
      user_message_id integer references app_chat_messages(id),
      openclaw_session_id text not null,
      context_type text not null check (context_type in ('global', 'projects', 'category', 'project', 'task')),
      context_entity_id integer,
      user_input text not null,
      system_instructions text not null,
      context_data text not null,
      memory_history text not null,
      tools text not null,
      final_prompt text not null,
      created_at text not null,
      check (
        (context_type in ('global', 'projects') and context_entity_id is null)
        or (context_type in ('category', 'project', 'task') and context_entity_id is not null)
      )
    );
    create index if not exists idx_app_prompt_logs_created_at on app_prompt_logs(created_at, id);
    create index if not exists idx_app_prompt_logs_conversation_id on app_prompt_logs(conversation_id, created_at, id);
    create index if not exists idx_app_prompt_logs_context on app_prompt_logs(context_type, context_entity_id, created_at);
  `);
}

function migrateStateEvents(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists app_state_events (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'project', 'task')),
      entity_id integer,
      category_id integer,
      project_id integer,
      task_id integer,
      created_at text not null
    );
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, project_id, task_id, category_id);
  `);
}

function migrateSortOrder(db: ReturnType<typeof openDatabase>): void {
  ensureSortOrderColumn(db, "categories", "is_system desc, lower(name) asc, id asc");
  ensureSortOrderColumn(db, "projects", "category_id asc, is_system desc, lower(name) asc, id asc");
  ensureSortOrderColumn(db, "tasks", "project_id asc, due_at is null, due_at asc, updated_at desc, id asc");
}

function ensureSortOrderColumn(db: ReturnType<typeof openDatabase>, table: string, orderBy: string): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = ?")
    .get(table) as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "sort_order")) {
    db.exec(`alter table ${table} add column sort_order integer not null default 0`);
  }

  const rows = db.prepare(`select id from ${table} where sort_order = 0 order by ${orderBy}`).all() as Array<{ id: number }>;
  const update = db.prepare(`update ${table} set sort_order = ? where id = ?`);
  const transaction = db.transaction(() => {
    rows.forEach((row, index) => update.run((index + 1) * 1000, row.id));
  });
  transaction();
}

function backfillConversationTitles(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'app_conversations'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const rows = db
    .prepare(
      `select
        c.id,
        c.title,
        c.context_type as contextType,
        coalesce(p.name, t.title, cat.name) as contextTitle,
        (
          select m.content
          from app_chat_messages m
          where m.conversation_id = c.id and m.role = 'user'
          order by m.created_at asc, m.id asc
          limit 1
        ) as firstUserMessage
      from app_conversations c
      left join projects p on c.context_type = 'project' and c.context_entity_id = p.id
      left join tasks t on c.context_type = 'task' and c.context_entity_id = t.id
      left join categories cat on c.context_type = 'category' and c.context_entity_id = cat.id`
    )
    .all() as Array<{
    id: number;
    title: string | null;
    contextType: string;
    contextTitle: string | null;
    firstUserMessage: string | null;
  }>;

  const update = db.prepare("update app_conversations set title = ? where id = ?");
  const transaction = db.transaction(() => {
    for (const row of rows) {
      if (!row.firstUserMessage || !shouldBackfillConversationTitle(row)) {
        continue;
      }
      update.run(deriveConversationTitle(row.firstUserMessage), row.id);
    }
  });
  transaction();
}

function shouldBackfillConversationTitle(row: {
  title: string | null;
  contextType: string;
  contextTitle: string | null;
}): boolean {
  const title = row.title?.trim();
  if (!title) {
    return true;
  }

  if (row.contextTitle && title === row.contextTitle) {
    return true;
  }

  return (
    (row.contextType === "global" && title === "Global Chat") ||
    (row.contextType === "projects" && title === "Projects")
  );
}
