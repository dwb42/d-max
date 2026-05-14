import fs from "node:fs";
import path from "node:path";
import { deriveConversationTitle } from "../chat/conversation-title.js";
import { categoryColorForSortOrder, categoryEmojiForName } from "../repositories/categories.js";
import { nowIso } from "./time.js";
import { openDatabase } from "./connection.js";

export function migrate(databasePath?: string): void {
  const schemaPath = path.resolve(process.env.DMAX_SCHEMA_PATH?.trim() || "data/schema.sql");
  const schema = fs.readFileSync(schemaPath, "utf8");
  const db = openDatabase(databasePath);

  try {
    recoverScratchMigrationTables(db);
    migrateInitiativeStorage(db);
    migrateExistingAppChatMessages(db);
    migrateRemovedThinkingDomain(db);
    migrateSortOrder(db);
    migrateCategoryColors(db);
    migrateCategoryEmojis(db);
    migrateInitiativeTypes(db);
    migrateInitiativeProjectPhase(db);
    migrateInitiativeDates(db);
    migrateInitiativeLockedTimeframes(db);
    migrateTaskStatusModel(db);
    migrateCalendarDomain(db);
    migrateCalendarEventBindings(db);
    migrateCalendarEventVisibility(db);
    migrateTaskChecklistItems(db);
    migrateMediaDomain(db);
    migrateWhoDomain(db);
    db.exec(schema);
    ensureInboxCategory(db);
    migratePromptLogs(db);
    migrateStateEvents(db);
    migrateWhoContextTypes(db);
    backfillConversationTitles(db);
  } finally {
    db.close();
  }
}

function recoverScratchMigrationTables(db: ReturnType<typeof openDatabase>): void {
  for (const table of ["app_conversations", "app_prompt_logs", "app_state_events", "tasks"]) {
    const scratch = `${table}_next`;
    if (!tableExists(db, scratch)) {
      continue;
    }

    if (tableExists(db, table)) {
      db.exec(`drop table ${scratch}`);
    } else {
      db.exec(`alter table ${scratch} rename to ${table}`);
    }
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
      context_type text not null check (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'category', 'idea', 'project', 'habit', 'initiative', 'task')),
      context_entity_id integer,
      created_at text not null,
      updated_at text not null,
      check (
        (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'idea', 'project', 'habit', 'initiative', 'task') and context_entity_id is not null)
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
      context_type text not null check (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'category', 'idea', 'project', 'habit', 'initiative', 'task')),
      context_entity_id integer,
      user_input text not null,
      system_instructions text not null,
      context_data text not null,
      memory_history text not null,
      tools text not null,
      final_prompt text not null,
      context_payload_json text,
      turn_trace text,
      created_at text not null,
      check (
        (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'idea', 'project', 'habit', 'initiative', 'task') and context_entity_id is not null)
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
  if (!columns.some((column) => column.name === "context_payload_json")) {
    db.exec("alter table app_prompt_logs add column context_payload_json text");
  }
}

function migrateStateEvents(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists app_state_events (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'planning_canvas_node', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link')),
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

  rebuildStateEventsForCalendarDomain(db);
  rebuildStateEventsForCalendarEventVisibilityDomain(db);
  rebuildStateEventsForMediaDomain(db);
  rebuildStateEventsForInitiativeRelationDomain(db);
  rebuildStateEventsForPlanningCanvasDomain(db);
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

function migrateInitiativeProjectPhase(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'initiatives'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(initiatives)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "project_phase")) {
    db.exec("alter table initiatives add column project_phase text not null default 'doing' check (project_phase in ('planning', 'doing'))");
  }
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

function migrateInitiativeLockedTimeframes(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'initiatives'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(initiatives)").all() as Array<{ name: string }>;
  if (!columns.some((column) => column.name === "is_locked")) {
    db.exec("alter table initiatives add column is_locked integer not null default 0 check (is_locked in (0, 1))");
  }
}

function migrateTaskStatusModel(db: ReturnType<typeof openDatabase>): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = 'tasks'")
    .get() as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare("pragma table_info(tasks)").all() as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));
  if (!columnNames.has("status")) {
    return;
  }

  db.pragma("foreign_keys = OFF");
  try {
    db.exec(`
      create table tasks_next (
        id integer primary key,
        initiative_id integer not null references initiatives(id),
        title text not null,
        status text not null default 'open' check (status in ('open', 'done')),
        priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
        notes text,
        due_at text,
        sort_order integer not null default 0,
        created_at text not null,
        updated_at text not null,
        completed_at text
      );
      insert into tasks_next (id, initiative_id, title, status, priority, notes, due_at, sort_order, created_at, updated_at, completed_at)
        select
          id,
          initiative_id,
          title,
          case when status = 'done' then 'done' else 'open' end,
          priority,
          notes,
          due_at,
          sort_order,
          created_at,
          updated_at,
          case when status = 'done' then completed_at else null end
        from tasks;
      drop table tasks;
      alter table tasks_next rename to tasks;
    `);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function migrateCalendarDomain(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists calendar_entries (
      id integer primary key,
      type text not null check (type in ('initiative_focus', 'task_work', 'standalone')),
      title text not null,
      start_at text not null,
      end_at text not null,
      status text not null default 'open' check (status in ('open', 'done')),
      initiative_id integer references initiatives(id),
      task_id integer references tasks(id),
      notes text,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists idx_calendar_entries_start_at on calendar_entries(start_at);
    create index if not exists idx_calendar_entries_end_at on calendar_entries(end_at);
    create index if not exists idx_calendar_entries_status on calendar_entries(status);
    create index if not exists idx_calendar_entries_initiative_id on calendar_entries(initiative_id);
    create index if not exists idx_calendar_entries_task_id on calendar_entries(task_id);

    create table if not exists calendar_sources (
      id integer primary key,
      provider text not null check (provider in ('google')),
      account_label text not null,
      calendar_id text not null,
      display_name text not null,
      color text,
      enabled integer not null default 1 check (enabled in (0, 1)),
      read_only integer not null default 1 check (read_only in (0, 1)),
      created_at text not null,
      updated_at text not null,
      unique(provider, calendar_id)
    );
    create index if not exists idx_calendar_sources_enabled on calendar_sources(enabled, provider);
  `);
}

function migrateCalendarEventBindings(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists calendar_event_bindings (
      id integer primary key,
      local_entity_type text not null check (local_entity_type in ('calendar_entry', 'initiative_project_span')),
      local_entity_id integer not null,
      provider text not null check (provider in ('google')),
      calendar_source_id integer references calendar_sources(id),
      external_calendar_id text not null,
      external_event_id text not null,
      external_etag text,
      external_updated_at text,
      sync_status text not null default 'synced' check (sync_status in ('synced', 'pending_sync', 'sync_error', 'external_deleted', 'sync_blocked_readonly')),
      sync_message text,
      last_synced_at text,
      unlinked_at text,
      created_at text not null,
      updated_at text not null
    );
    create unique index if not exists idx_calendar_event_bindings_active_local
      on calendar_event_bindings(local_entity_type, local_entity_id)
      where unlinked_at is null;
    create unique index if not exists idx_calendar_event_bindings_active_external
      on calendar_event_bindings(provider, external_calendar_id, external_event_id)
      where unlinked_at is null;
    create index if not exists idx_calendar_event_bindings_source on calendar_event_bindings(calendar_source_id);
    create index if not exists idx_calendar_event_bindings_status on calendar_event_bindings(sync_status, id);
  `);
}

function migrateCalendarEventVisibility(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    drop index if exists idx_calendar_event_visibility_identity;
    create table if not exists calendar_event_visibility (
      id integer primary key,
      provider text not null check (provider in ('google')),
      surface text not null check (surface in ('planning_canvas', 'calendar', 'global')),
      hidden_scope text not null check (hidden_scope in ('event', 'recurring_instance', 'recurring_series')),
      calendar_source_id integer references calendar_sources(id),
      external_calendar_id text not null,
      external_event_id text,
      recurring_event_id text,
      original_start_at text,
      ical_uid text,
      title_snapshot text not null,
      start_at_snapshot text,
      end_at_snapshot text,
      hidden_at text not null,
      created_at text not null,
      updated_at text not null,
      check (
        (hidden_scope = 'event' and external_event_id is not null)
        or (hidden_scope = 'recurring_instance' and recurring_event_id is not null and original_start_at is not null)
        or (hidden_scope = 'recurring_series' and recurring_event_id is not null)
      )
    );
    create unique index if not exists idx_calendar_event_visibility_event_identity
      on calendar_event_visibility(provider, surface, external_calendar_id, external_event_id)
      where hidden_scope = 'event';
    create unique index if not exists idx_calendar_event_visibility_instance_identity
      on calendar_event_visibility(provider, surface, external_calendar_id, recurring_event_id, original_start_at)
      where hidden_scope = 'recurring_instance';
    create unique index if not exists idx_calendar_event_visibility_series_identity
      on calendar_event_visibility(provider, surface, external_calendar_id, recurring_event_id)
      where hidden_scope = 'recurring_series';
    create index if not exists idx_calendar_event_visibility_surface on calendar_event_visibility(surface, provider, hidden_scope);
    create index if not exists idx_calendar_event_visibility_source on calendar_event_visibility(calendar_source_id);
  `);
}

function migrateTaskChecklistItems(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists task_checklist_items (
      id integer primary key,
      task_id integer not null references tasks(id) on delete cascade,
      name text not null,
      status text not null default 'todo' check (status in ('todo', 'done')),
      sort_order integer not null default 0,
      created_at text not null,
      updated_at text not null
    );
    create index if not exists idx_task_checklist_items_task_sort_order on task_checklist_items(task_id, sort_order, id);
    create index if not exists idx_task_checklist_items_status on task_checklist_items(status);
  `);
}

function migrateMediaDomain(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists media_assets (
      id integer primary key,
      kind text not null check (kind in ('image', 'audio', 'video', 'document', 'other')),
      mime_type text not null,
      original_name text not null,
      storage_path text not null unique,
      sha256 text not null,
      byte_size integer not null,
      width integer,
      height integer,
      duration_ms integer,
      transcript text,
      text_excerpt text,
      summary text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists media_links (
      id integer primary key,
      asset_id integer not null references media_assets(id) on delete cascade,
      entity_type text not null check (entity_type in ('category', 'initiative', 'task', 'calendar_entry', 'app_chat_message')),
      entity_id integer not null,
      caption text,
      role text,
      sort_order integer not null default 0,
      created_at text not null,
      updated_at text not null,
      unique(asset_id, entity_type, entity_id)
    );

    create index if not exists idx_media_assets_kind on media_assets(kind);
    create index if not exists idx_media_assets_sha256 on media_assets(sha256);
    create index if not exists idx_media_links_entity on media_links(entity_type, entity_id, sort_order, id);
    create index if not exists idx_media_links_asset_id on media_links(asset_id);
  `);
}

function migrateWhoDomain(db: ReturnType<typeof openDatabase>): void {
  db.exec(`
    create table if not exists parties (
      id integer primary key,
      type text not null check (type in ('person', 'organization')),
      display_name text not null,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists people (
      party_id integer primary key references parties(id) on delete cascade,
      first_name text,
      last_name text,
      salutation text not null default 'unknown' check (salutation in ('mr', 'mrs', 'unknown')),
      academic_title text,
      name_suffix text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists organizations (
      party_id integer primary key references parties(id) on delete cascade,
      name text not null,
      legal_name text,
      organization_type text,
      markdown text not null default '',
      created_at text not null,
      updated_at text not null
    );

    create table if not exists relationship_types (
      id integer primary key,
      key text not null unique,
      label text not null,
      inverse_label text,
      directionality text not null check (directionality in ('directed', 'symmetric')),
      is_system integer not null default 0 check (is_system in (0, 1)),
      sort_order integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists party_relationships (
      id integer primary key,
      from_party_id integer not null references parties(id) on delete cascade,
      to_party_id integer not null references parties(id) on delete cascade,
      relationship_type_id integer not null references relationship_types(id),
      role_label text,
      started_on text,
      ended_on text,
      status text not null default 'active' check (status in ('active', 'inactive')),
      created_at text not null,
      updated_at text not null,
      check (from_party_id <> to_party_id),
      unique(from_party_id, to_party_id, relationship_type_id, role_label, started_on)
    );

    create table if not exists participant_role_types (
      id integer primary key,
      key text not null unique,
      label text not null,
      applies_to_entity_type text check (applies_to_entity_type in ('initiative', 'task', 'calendar_entry')),
      is_system integer not null default 0 check (is_system in (0, 1)),
      sort_order integer not null default 0,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists entity_participants (
      id integer primary key,
      party_id integer not null references parties(id) on delete cascade,
      entity_type text not null check (entity_type in ('initiative', 'task', 'calendar_entry')),
      entity_id integer not null,
      role_type_id integer references participant_role_types(id),
      role_label text,
      is_primary integer not null default 0 check (is_primary in (0, 1)),
      created_at text not null,
      updated_at text not null,
      unique(party_id, entity_type, entity_id, role_type_id, role_label)
    );

    create table if not exists party_contact_points (
      id integer primary key,
      party_id integer not null references parties(id) on delete cascade,
      type text not null check (type in ('email', 'phone', 'whatsapp', 'signal', 'telegram', 'linkedin', 'website', 'other')),
      label text,
      value text not null,
      normalized_value text,
      is_primary integer not null default 0 check (is_primary in (0, 1)),
      is_preferred integer not null default 0 check (is_preferred in (0, 1)),
      can_send integer not null default 0 check (can_send in (0, 1)),
      can_receive integer not null default 0 check (can_receive in (0, 1)),
      provider text,
      created_at text not null,
      updated_at text not null
    );

    create table if not exists party_addresses (
      id integer primary key,
      party_id integer not null references parties(id) on delete cascade,
      label text,
      line1 text not null,
      line2 text,
      postal_code text,
      city text,
      region text,
      country text,
      is_primary integer not null default 0 check (is_primary in (0, 1)),
      created_at text not null,
      updated_at text not null
    );

    create index if not exists idx_parties_type_display_name on parties(type, lower(display_name), id);
    create index if not exists idx_people_last_first on people(lower(last_name), lower(first_name), party_id);
    create index if not exists idx_organizations_name on organizations(lower(name), party_id);
    create index if not exists idx_relationship_types_sort on relationship_types(sort_order, lower(label), id);
    create index if not exists idx_party_relationships_from on party_relationships(from_party_id, status, relationship_type_id, to_party_id);
    create index if not exists idx_party_relationships_to on party_relationships(to_party_id, status, relationship_type_id, from_party_id);
    create index if not exists idx_party_relationships_type_status on party_relationships(relationship_type_id, status, id);
    create index if not exists idx_participant_role_types_sort on participant_role_types(sort_order, lower(label), id);
    create index if not exists idx_entity_participants_entity on entity_participants(entity_type, entity_id, is_primary desc, id);
    create index if not exists idx_entity_participants_party on entity_participants(party_id, entity_type, entity_id);
    create index if not exists idx_party_contact_points_party_type on party_contact_points(party_id, type, is_preferred desc, is_primary desc, id);
    create index if not exists idx_party_addresses_party on party_addresses(party_id, is_primary desc, id);
  `);

  ensureColumn(db, "organizations", "markdown", "text not null default ''");
  ensureWhoSystemTypes(db);
}

function ensureWhoSystemTypes(db: ReturnType<typeof openDatabase>): void {
  const now = nowIso();
  const relationshipTypes = [
    ["works_for", "works for", "employs", "directed", 1000],
    ["founder_of", "founder of", "founded by", "directed", 2000],
    ["member_of", "member of", "has member", "directed", 3000],
    ["advisor_to", "advisor to", "advised by", "directed", 4000],
    ["knows", "knows", "knows", "symmetric", 5000],
    ["family_related_to", "family related to", "family related to", "symmetric", 6000],
    ["partner_of", "partner of", "partner of", "symmetric", 7000],
    ["customer_of", "customer of", "has customer", "directed", 8000],
    ["supplier_of", "supplier of", "has supplier", "directed", 9000],
    ["mentor_of", "mentor of", "mentored by", "directed", 10000]
  ] as const;
  const participantRoles = [
    ["responsible", "Responsible", null, 1000],
    ["participant", "Participant", null, 2000],
    ["customer", "Customer", null, 3000],
    ["contact_person", "Contact person", null, 4000],
    ["supplier", "Supplier", null, 5000],
    ["partner", "Partner", null, 6000],
    ["stakeholder", "Stakeholder", null, 7000],
    ["decision_maker", "Decision maker", null, 8000],
    ["observer", "Observer", null, 9000],
    ["coach", "Coach", null, 10000],
    ["assistant", "Assistant", null, 11000],
    ["accountability_partner", "Accountability partner", "initiative", 12000]
  ] as const;

  const upsertRelationship = db.prepare(
    `insert into relationship_types (key, label, inverse_label, directionality, is_system, sort_order, created_at, updated_at)
     values (?, ?, ?, ?, 1, ?, ?, ?)
     on conflict(key) do update set
      label = excluded.label,
      inverse_label = excluded.inverse_label,
      directionality = excluded.directionality,
      is_system = 1,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at`
  );
  const upsertRole = db.prepare(
    `insert into participant_role_types (key, label, applies_to_entity_type, is_system, sort_order, created_at, updated_at)
     values (?, ?, ?, 1, ?, ?, ?)
     on conflict(key) do update set
      label = excluded.label,
      applies_to_entity_type = excluded.applies_to_entity_type,
      is_system = 1,
      sort_order = excluded.sort_order,
      updated_at = excluded.updated_at`
  );
  const transaction = db.transaction(() => {
    relationshipTypes.forEach(([key, label, inverseLabel, directionality, sortOrder]) =>
      upsertRelationship.run(key, label, inverseLabel, directionality, sortOrder, now, now)
    );
    participantRoles.forEach(([key, label, appliesToEntityType, sortOrder]) => upsertRole.run(key, label, appliesToEntityType, sortOrder, now, now));
  });
  transaction();
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

function ensureColumn(db: ReturnType<typeof openDatabase>, table: string, column: string, definition: string): void {
  const existing = db
    .prepare("select name from sqlite_master where type = 'table' and name = ?")
    .get(table) as { name: string } | undefined;
  if (!existing) {
    return;
  }

  const columns = db.prepare(`pragma table_info(${table})`).all() as Array<{ name: string }>;
  if (!columns.some((entry) => entry.name === column)) {
    db.exec(`alter table ${table} add column ${column} ${definition}`);
  }
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
      left join initiatives p on c.context_type in ('idea', 'project', 'habit', 'initiative') and c.context_entity_id = p.id
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
      context_type text not null check (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'category', 'idea', 'project', 'habit', 'initiative', 'task')),
      context_entity_id integer,
      created_at text not null,
      updated_at text not null,
      check (
        (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'idea', 'project', 'habit', 'initiative', 'task') and context_entity_id is not null)
      )
    );
    insert into app_conversations_next (id, title, context_type, context_entity_id, created_at, updated_at)
      select
        id,
        title,
        context_type,
        context_entity_id,
        created_at,
        updated_at
      from app_conversations
      where context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'category', 'idea', 'project', 'habit', 'initiative', 'task');
    drop table app_conversations;
    alter table app_conversations_next rename to app_conversations;
  `);
}

function rebuildAppPromptLogsForInitiativeContext(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_prompt_logs")) {
    return;
  }

  const hasTurnTrace = tableColumns(db, "app_prompt_logs").some((column) => column.name === "turn_trace");
  const hasContextPayloadJson = tableColumns(db, "app_prompt_logs").some((column) => column.name === "context_payload_json");
  const turnTraceSelect = hasTurnTrace ? "turn_trace" : "null as turn_trace";
  const contextPayloadJsonSelect = hasContextPayloadJson ? "context_payload_json" : "null as context_payload_json";
  db.exec(`
    create table app_prompt_logs_next (
      id integer primary key,
      conversation_id integer references app_conversations(id),
      user_message_id integer references app_chat_messages(id),
      openclaw_session_id text not null,
      context_type text not null check (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'category', 'idea', 'project', 'habit', 'initiative', 'task')),
      context_entity_id integer,
      user_input text not null,
      system_instructions text not null,
      context_data text not null,
      memory_history text not null,
      tools text not null,
      final_prompt text not null,
      context_payload_json text,
      turn_trace text,
      created_at text not null,
      check (
        (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives') and context_entity_id is null)
        or (context_type in ('category', 'idea', 'project', 'habit', 'initiative', 'task') and context_entity_id is not null)
      )
    );
    insert into app_prompt_logs_next (
      id, conversation_id, user_message_id, openclaw_session_id, context_type, context_entity_id,
      user_input, system_instructions, context_data, memory_history, tools, final_prompt, context_payload_json, turn_trace, created_at
    )
      select
        id,
        conversation_id,
        user_message_id,
        openclaw_session_id,
        context_type,
        context_entity_id,
        user_input,
        system_instructions,
        context_data,
        memory_history,
        tools,
        final_prompt,
        ${contextPayloadJsonSelect},
        ${turnTraceSelect},
        created_at
      from app_prompt_logs
      where context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'category', 'idea', 'project', 'habit', 'initiative', 'task');
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

function rebuildStateEventsForCalendarDomain(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_state_events")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_state_events'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'calendar_entry'") && sql.sql.includes("'calendar_source'")) {
    return;
  }

  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
  `);
}

function rebuildStateEventsForCalendarEventVisibilityDomain(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_state_events")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_state_events'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'calendar_event_visibility'")) {
    return;
  }

  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'planning_canvas_node', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'planning_canvas_node', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
  `);
}

function rebuildStateEventsForMediaDomain(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_state_events")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_state_events'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'media_asset'") && sql.sql.includes("'media_link'")) {
    return;
  }

  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
  `);
}

function rebuildStateEventsForInitiativeRelationDomain(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_state_events")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_state_events'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'initiative_relation'")) {
    return;
  }

  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'initiative', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
  `);
}

function rebuildStateEventsForPlanningCanvasDomain(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_state_events")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_state_events'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'planning_canvas_node'")) {
    return;
  }

  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'planning_canvas_node', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
  `);
}

function migrateWhoContextTypes(db: ReturnType<typeof openDatabase>): void {
  db.pragma("foreign_keys = OFF");
  try {
    rebuildAppConversationsForWhoContext(db);
    rebuildAppPromptLogsForWhoContext(db);
    rebuildStateEventsForWhoDomain(db);
  } finally {
    db.pragma("foreign_keys = ON");
  }
}

function rebuildAppConversationsForWhoContext(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_conversations")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_conversations'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'person'") && sql.sql.includes("'organizations'")) {
    return;
  }

  db.exec(`
    create table app_conversations_next (
      id integer primary key,
      title text,
      context_type text not null check (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'people', 'organizations', 'category', 'idea', 'project', 'habit', 'initiative', 'task', 'person', 'organization')),
      context_entity_id integer,
      created_at text not null,
      updated_at text not null,
      check (
        (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'people', 'organizations') and context_entity_id is null)
        or (context_type in ('category', 'idea', 'project', 'habit', 'initiative', 'task', 'person', 'organization') and context_entity_id is not null)
      )
    );
    insert into app_conversations_next (id, title, context_type, context_entity_id, created_at, updated_at)
      select id, title, context_type, context_entity_id, created_at, updated_at
      from app_conversations
      where context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'people', 'organizations', 'category', 'idea', 'project', 'habit', 'initiative', 'task', 'person', 'organization');
    drop table app_conversations;
    alter table app_conversations_next rename to app_conversations;
    create index if not exists idx_app_conversations_context on app_conversations(context_type, context_entity_id, updated_at);
  `);
}

function rebuildAppPromptLogsForWhoContext(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_prompt_logs")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_prompt_logs'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'person'") && sql.sql.includes("'organizations'")) {
    return;
  }

  const hasTurnTrace = tableColumns(db, "app_prompt_logs").some((column) => column.name === "turn_trace");
  const hasContextPayloadJson = tableColumns(db, "app_prompt_logs").some((column) => column.name === "context_payload_json");
  const turnTraceSelect = hasTurnTrace ? "turn_trace" : "null as turn_trace";
  const contextPayloadJsonSelect = hasContextPayloadJson ? "context_payload_json" : "null as context_payload_json";
  db.exec(`
    create table app_prompt_logs_next (
      id integer primary key,
      conversation_id integer references app_conversations(id),
      user_message_id integer references app_chat_messages(id),
      openclaw_session_id text not null,
      context_type text not null check (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'people', 'organizations', 'category', 'idea', 'project', 'habit', 'initiative', 'task', 'person', 'organization')),
      context_entity_id integer,
      user_input text not null,
      system_instructions text not null,
      context_data text not null,
      memory_history text not null,
      tools text not null,
      final_prompt text not null,
      context_payload_json text,
      turn_trace text,
      created_at text not null,
      check (
        (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'people', 'organizations') and context_entity_id is null)
        or (context_type in ('category', 'idea', 'project', 'habit', 'initiative', 'task', 'person', 'organization') and context_entity_id is not null)
      )
    );
    insert into app_prompt_logs_next (
      id, conversation_id, user_message_id, openclaw_session_id, context_type, context_entity_id,
      user_input, system_instructions, context_data, memory_history, tools, final_prompt, context_payload_json, turn_trace, created_at
    )
      select
        id,
        conversation_id,
        user_message_id,
        openclaw_session_id,
        context_type,
        context_entity_id,
        user_input,
        system_instructions,
        context_data,
        memory_history,
        tools,
        final_prompt,
        ${contextPayloadJsonSelect},
        ${turnTraceSelect},
        created_at
      from app_prompt_logs
      where context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives', 'people', 'organizations', 'category', 'idea', 'project', 'habit', 'initiative', 'task', 'person', 'organization');
    drop table app_prompt_logs;
    alter table app_prompt_logs_next rename to app_prompt_logs;
    create index if not exists idx_app_prompt_logs_created_at on app_prompt_logs(created_at, id);
    create index if not exists idx_app_prompt_logs_conversation_id on app_prompt_logs(conversation_id, created_at, id);
    create index if not exists idx_app_prompt_logs_context on app_prompt_logs(context_type, context_entity_id, created_at);
  `);
}

function rebuildStateEventsForWhoDomain(db: ReturnType<typeof openDatabase>): void {
  if (!tableExists(db, "app_state_events")) {
    return;
  }

  const sql = db.prepare("select sql from sqlite_master where type = 'table' and name = 'app_state_events'").get() as
    | { sql: string }
    | undefined;
  if (sql?.sql.includes("'party_address'") && sql.sql.includes("'entity_participant'")) {
    return;
  }

  db.exec(`
    create table app_state_events_next (
      id integer primary key,
      source text not null check (source in ('api', 'tool')),
      operation text not null,
      entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'planning_canvas_node', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link', 'party', 'person', 'organization', 'relationship_type', 'party_relationship', 'participant_role_type', 'entity_participant', 'party_contact_point', 'party_address')),
      entity_id integer,
      category_id integer,
      initiative_id integer,
      task_id integer,
      created_at text not null
    );
    insert into app_state_events_next (id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at)
      select id, source, operation, entity_type, entity_id, category_id, initiative_id, task_id, created_at
      from app_state_events
      where entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'planning_canvas_node', 'task', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link', 'party', 'person', 'organization', 'relationship_type', 'party_relationship', 'participant_role_type', 'entity_participant', 'party_contact_point', 'party_address');
    drop table app_state_events;
    alter table app_state_events_next rename to app_state_events;
    create index if not exists idx_app_state_events_id on app_state_events(id);
    create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
    create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
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
