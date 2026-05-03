import fs from "node:fs";
import path from "node:path";
import { deriveConversationTitle } from "../chat/conversation-title.js";
import { categoryColorForSortOrder, categoryEmojiForName } from "../repositories/categories.js";
import { nowIso } from "./time.js";
import { openDatabase } from "./connection.js";

export function migrate(databasePath?: string): void {
  const schemaPath = path.resolve("data/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);

  try {
    migrateInitiativeStorage(db);
    migrateExistingAppChatMessages(db);
    migrateRemovedThinkingDomain(db);
    migrateSortOrder(db);
    migrateCategoryColors(db);
    migrateCategoryEmojis(db);
    migrateInitiativeTypes(db);
    migrateInitiativeDates(db);
    db.exec(schema);
    ensureInboxCategory(db);
    migratePromptLogs(db);
    migrateStateEvents(db);
    backfillConversationTitles(db);
  } finally {
    db.close();
  }
}

function migrateInitiativeStorage(db: ReturnType<typeof openDatabase>): void {
  db.pragma("foreign_keys = OFF");
  try {
    if (tableExists(db, "projects") && !tableExists(db, "initiatives")) {
      db.exec("alter table projects rename to initiatives");
    }

    renameColumnIfPresent(db, "tasks", "project_id", "initiative_id");
    renameColumnIfPresent(db, "app_state_events", "project_id", "initiative_id");
    rebuildAppConversationsForInitiativeContext(db);
    rebuildAppPromptLogsForInitiativeContext(db);
    rebuildStateEventsForInitiativeContext(db);
  } finally {
    db.pragma("foreign_keys = ON");
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
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'task')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'initiative', 'task');
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
      context_type text not null check (context_type in ('global', 'initiatives', 'category', 'initiative', 'task')),
      context_entity_id integer,
      created_at text not null,
      updated_at text not null,
      check (
        (context_type in ('global', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'initiative', 'task') and context_entity_id is not null)
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
      context_type text not null check (context_type in ('global', 'initiatives', 'category', 'initiative', 'task')),
      context_entity_id integer,
      user_input text not null,
      system_instructions text not null,
      context_data text not null,
      memory_history text not null,
      tools text not null,
      final_prompt text not null,
      turn_trace text,
      created_at text not null,
      check (
        (context_type in ('global', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'initiative', 'task') and context_entity_id is not null)
      )
    );
    create index if not exists idx_app_prompt_logs_created_at on app_prompt_logs(created_at, id);
    create index if not exists idx_app_prompt_logs_conversation_id on app_prompt_logs(conversation_id, created_at, id);
    create index if not exists idx_app_prompt_logs_context on app_prompt_logs(context_type, context_entity_id, created_at);
  `);

  const columns = db.prepare("pragma table_info(app_prompt_logs)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "turn_trace")) {
    db.exec("alter table app_prompt_logs add column turn_trace text");
  }
}

function migrateStateEvents(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists app_state_events (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'task')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
  `);
}

function migrateSortOrder(db: ReturnType<typeof openDatabase>): void {
  ensureSortOrderColumn(db, "categories", "is_system desc, lower(name) asc, id asc");
  ensureSortOrderColumn(db, "initiatives", "category_id asc, is_system desc, lower(name) asc, id asc");
  ensureSortOrderColumn(db, "tasks", "initiative_id asc, due_at is null, due_at asc, updated_at desc, id asc");
}

function migrateCategoryColors(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'categories'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(categories)").all() as Array<{ name: string }>;
  const addedColorColumn = !columns.some((column) => column.name === "color");
  if (addedColorColumn) {
    db.exec("alter table categories add column color text not null default '#27806f'");
  }

  const rows = db
    .prepare(addedColorColumn ? "select id, sort_order from categories" : "select id, sort_order from categories where color = ''")
    .all() as Array<{ id: number; sort_order: number }>;
  const update = db.prepare("update categories set color = ? where id = ?");
  const transaction = db.transaction(() => {
    rows.forEach((row) => update.run(categoryColorForSortOrder(row.sort_order), row.id));
  });
  transaction();
}

function migrateCategoryEmojis(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'categories'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(categories)").all() as Array<{ name: string }>;
  const addedEmojiColumn = !columns.some((column) => column.name === "emoji");
  if (addedEmojiColumn) {
    db.exec("alter table categories add column emoji text not null default '📁'");
  }

  const rows = db
    .prepare(addedEmojiColumn ? "select id, name from categories" : "select id, name from categories where emoji = '' or emoji = '📁'")
    .all() as Array<{ id: number; name: string }>;
  const update = db.prepare("update categories set emoji = ? where id = ?");
  const transaction = db.transaction(() => {
    rows.forEach((row) => update.run(categoryEmojiForName(row.name), row.id));
  });
  transaction();
}

function migrateInitiativeTypes(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'initiatives'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(initiatives)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "type")) {
    db.exec("alter table initiatives add column type text not null default 'project' check (type in ('idea', 'project', 'habit'))");
  }

  db.exec("create index if not exists idx_initiatives_type on initiatives(type)");
}

function migrateInitiativeDates(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'initiatives'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(initiatives)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "start_date")) {
    db.exec("alter table initiatives add column start_date text");
  }
  if (!columns.some((column) => column.name === "end_date")) {
    db.exec("alter table initiatives add column end_date text");
  }

  db.exec(`
    create index if not exists idx_initiatives_start_date on initiatives(start_date);
    create index if not exists idx_initiatives_end_date on initiatives(end_date);
  `);
}

function ensureInboxCategory(db: ReturnType<typeof openDatabase>): void {
  const now = nowIso();
  const existing = db.prepare("select id, is_system from categories where lower(name) = lower('Inbox')").get() as
    | { id: number; is_system: number }
    | undefined;

  if (!existing) {
    const row = db.prepare("select coalesce(max(sort_order), 0) + 1000 as next from categories").get() as { next: number };
    db.prepare(
      "insert into categories (name, description, color, emoji, sort_order, is_system, created_at, updated_at) values ('Inbox', ?, ?, ?, ?, 1, ?, ?)"
    ).run(
      "System fallback for uncategorized initiatives and concrete tasks without initiative context.",
      categoryColorForSortOrder(row.next),
      categoryEmojiForName("Inbox"),
      row.next,
      now,
      now
    );
    return;
  }

  if (existing.is_system !== 1) {
    db.prepare("update categories set is_system = 1, updated_at = ? where id = ?").run(now, existing.id);
  }
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
      left join initiatives p on c.context_type = 'initiative' and c.context_entity_id = p.id
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
    (row.contextType === "initiatives" && title === "Initiatives")
  );
}

function rebuildAppConversationsForInitiativeContext(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_conversations")) {
    return;
  }

  db.exec(`
    create table app_conversations_next (
      id integer primary key,
      title text,
      context_type text not null check (context_type in ('global', 'initiatives', 'category', 'initiative', 'task')),
      context_entity_id integer,
      created_at text not null,
      updated_at text not null,
      check (
        (context_type in ('global', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'initiative', 'task') and context_entity_id is not null)
      )
    );
    insert into app_conversations_next (id, title, context_type, context_entity_id, created_at, updated_at)
      select
        id,
        title,
        case context_type when 'projects' then 'initiatives' when 'project' then 'initiative' else context_type end,
        context_entity_id,
        created_at,
        updated_at
      from app_conversations
      where context_type in ('global', 'projects', 'initiatives', 'category', 'project', 'initiative', 'task');
    drop table app_conversations;
    alter table app_conversations_next rename to app_conversations;
  `);
}

function rebuildAppPromptLogsForInitiativeContext(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_prompt_logs")) {
    return;
  }

  const hasTurnTrace = tableColumns(db, "app_prompt_logs").some((column) => column.name === "turn_trace");
  const turnTraceSelect = hasTurnTrace ? "turn_trace" : "null as turn_trace";
  db.exec(`
    create table app_prompt_logs_next (
      id integer primary key,
      conversation_id integer references app_conversations(id),
      user_message_id integer references app_chat_messages(id),
      openclaw_session_id text not null,
      context_type text not null check (context_type in ('global', 'initiatives', 'category', 'initiative', 'task')),
      context_entity_id integer,
      user_input text not null,
      system_instructions text not null,
      context_data text not null,
      memory_history text not null,
      tools text not null,
      final_prompt text not null,
      turn_trace text,
      created_at text not null,
      check (
        (context_type in ('global', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'initiative', 'task') and context_entity_id is not null)
      )
    );
    insert into app_prompt_logs_next (
      id, conversation_id, user_message_id, openclaw_session_id, context_type, context_entity_id,
      user_input, system_instructions, context_data, memory_history, tools, final_prompt, turn_trace, created_at
    )
      select
        id,
        conversation_id,
        user_message_id,
        openclaw_session_id,
        case context_type when 'projects' then 'initiatives' when 'project' then 'initiative' else context_type end,
        context_entity_id,
        user_input,
        system_instructions,
        context_data,
        memory_history,
        tools,
        final_prompt,
        ${turnTraceSelect},
        created_at
      from app_prompt_logs
      where context_type in ('global', 'projects', 'initiatives', 'category', 'project', 'initiative', 'task');
    drop table app_prompt_logs;
    alter table app_prompt_logs_next rename to app_prompt_logs;
  `);
}

function rebuildStateEventsForInitiativeContext(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_state_events")) {
    return;
  }

  const columns = tableColumns(db, "app_state_events");
  const initiativeColumn = columns.some((column) => column.name === "initiative_id") ? "initiative_id" : "null as initiative_id";
  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'task')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select
        id,
        source,
        case operation
          when 'createProject' then 'createInitiative'
          when 'updateProject' then 'updateInitiative'
          when 'reorderProjects' then 'reorderInitiatives'
          when 'updateProjectMarkdown' then 'updateInitiativeMarkdown'
          when 'archiveProject' then 'archiveInitiative'
          else operation
        end,
        case entity_type when 'project' then 'initiative' else entity_type end,
        entity_id,
        category_id,
        ${initiativeColumn},
        task_id,
        created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'project', 'initiative', 'task');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
  `);
}

function tableExists(db: ReturnType<typeof openDatabase>, name: string): boolean {
  return Boolean(db.prepare("select name from sqlite_master where type = 'table' and name = ?").get(name));
}

function tableColumns(db: ReturnType<typeof openDatabase>, table: string): Array<{ name: string }> {
  return db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
}

function renameColumnIfPresent(db: ReturnType<typeof openDatabase>, table: string, from: string, to: string): void {
  if (!tableExists(db, table)) {
    return;
  }

  const columns = tableColumns(db, table);
  if (columns.some((column) => column.name === from) && !columns.some((column) => column.name === to)) {
    db.exec(`alter table ${table} rename column ${from} to ${to}`);
  }
}
