pragma foreign_keys = on;

create table if not exists categories (
  id integer primary key,
  name text not null unique,
  description text,
  color text not null default '#27806f',
  emoji text not null default '📁',
  sort_order integer not null default 0,
  is_system integer not null default 0 check (is_system in (0, 1)),
  created_at text not null,
  updated_at text not null
);

create table if not exists initiatives (
  id integer primary key,
  category_id integer not null references categories(id),
  parent_id integer references initiatives(id),
  type text not null default 'project' check (type in ('idea', 'project', 'habit')),
  project_phase text not null default 'doing' check (project_phase in ('planning', 'doing')),
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  summary text,
  markdown text not null default '',
  start_date text,
  end_date text,
  is_locked integer not null default 0 check (is_locked in (0, 1)),
  sort_order integer not null default 0,
  is_system integer not null default 0 check (is_system in (0, 1)),
  created_at text not null,
  updated_at text not null
);

create table if not exists initiative_relations (
  id integer primary key,
  predecessor_initiative_id integer not null references initiatives(id) on delete cascade,
  successor_initiative_id integer not null references initiatives(id) on delete cascade,
  relation_type text not null default 'precedes' check (relation_type in ('precedes')),
  created_at text not null,
  updated_at text not null,
  check (predecessor_initiative_id <> successor_initiative_id),
  unique(predecessor_initiative_id, successor_initiative_id, relation_type)
);

create table if not exists planning_canvases (
  id integer primary key,
  name text not null unique,
  description text,
  default_start_date text,
  default_zoom text not null default 'month' check (default_zoom in ('month', 'week')),
  created_at text not null,
  updated_at text not null
);

create table if not exists planning_canvas_nodes (
  id integer primary key,
  canvas_id integer not null references planning_canvases(id) on delete cascade,
  initiative_id integer not null references initiatives(id) on delete cascade,
  x real not null,
  y real not null,
  width real,
  height real,
  collapsed integer not null default 0 check (collapsed in (0, 1)),
  created_at text not null,
  updated_at text not null,
  unique(canvas_id, initiative_id)
);

create table if not exists tasks (
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

create table if not exists task_checklist_items (
  id integer primary key,
  task_id integer not null references tasks(id) on delete cascade,
  name text not null,
  status text not null default 'todo' check (status in ('todo', 'done')),
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null
);

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

create table if not exists app_chat_messages (
  id integer primary key,
  conversation_id integer references app_conversations(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source text not null default 'app_text' check (source in ('app_text', 'app_voice_message', 'system')),
  created_at text not null
);

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
);

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
  turn_trace text,
  created_at text not null,
  check (
    (context_type in ('global', 'categories', 'ideas', 'projects', 'habits', 'tasks', 'initiatives') and context_entity_id is null)
    or (context_type in ('category', 'idea', 'project', 'habit', 'initiative', 'task') and context_entity_id is not null)
  )
);

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

create index if not exists idx_initiatives_category_id on initiatives(category_id);
create index if not exists idx_initiatives_type on initiatives(type);
create index if not exists idx_initiatives_start_date on initiatives(start_date);
create index if not exists idx_initiatives_end_date on initiatives(end_date);
create index if not exists idx_initiative_relations_predecessor on initiative_relations(predecessor_initiative_id, relation_type, successor_initiative_id);
create index if not exists idx_initiative_relations_successor on initiative_relations(successor_initiative_id, relation_type, predecessor_initiative_id);
create index if not exists idx_initiative_relations_type on initiative_relations(relation_type, id);
create index if not exists idx_planning_canvas_nodes_canvas on planning_canvas_nodes(canvas_id, y, x, id);
create index if not exists idx_planning_canvas_nodes_initiative on planning_canvas_nodes(initiative_id);
create index if not exists idx_categories_sort_order on categories(sort_order, id);
create index if not exists idx_initiatives_category_sort_order on initiatives(category_id, sort_order, id);
create index if not exists idx_initiatives_parent_id on initiatives(parent_id);
create index if not exists idx_tasks_initiative_id on tasks(initiative_id);
create index if not exists idx_tasks_initiative_sort_order on tasks(initiative_id, sort_order, id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_due_at on tasks(due_at);
create index if not exists idx_task_checklist_items_task_sort_order on task_checklist_items(task_id, sort_order, id);
create index if not exists idx_task_checklist_items_status on task_checklist_items(status);
create index if not exists idx_calendar_entries_start_at on calendar_entries(start_at);
create index if not exists idx_calendar_entries_end_at on calendar_entries(end_at);
create index if not exists idx_calendar_entries_status on calendar_entries(status);
create index if not exists idx_calendar_entries_initiative_id on calendar_entries(initiative_id);
create index if not exists idx_calendar_entries_task_id on calendar_entries(task_id);
create index if not exists idx_calendar_sources_enabled on calendar_sources(enabled, provider);
create unique index if not exists idx_calendar_event_bindings_active_local
  on calendar_event_bindings(local_entity_type, local_entity_id)
  where unlinked_at is null;
create unique index if not exists idx_calendar_event_bindings_active_external
  on calendar_event_bindings(provider, external_calendar_id, external_event_id)
  where unlinked_at is null;
create index if not exists idx_calendar_event_bindings_source on calendar_event_bindings(calendar_source_id);
create index if not exists idx_calendar_event_bindings_status on calendar_event_bindings(sync_status, id);
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
create index if not exists idx_media_assets_kind on media_assets(kind);
create index if not exists idx_media_assets_sha256 on media_assets(sha256);
create index if not exists idx_media_links_entity on media_links(entity_type, entity_id, sort_order, id);
create index if not exists idx_media_links_asset_id on media_links(asset_id);
create index if not exists idx_app_chat_messages_created_at on app_chat_messages(created_at, id);
create index if not exists idx_app_chat_messages_conversation_id on app_chat_messages(conversation_id, created_at, id);
create index if not exists idx_app_conversations_context on app_conversations(context_type, context_entity_id, updated_at);
create index if not exists idx_app_prompt_logs_created_at on app_prompt_logs(created_at, id);
create index if not exists idx_app_prompt_logs_conversation_id on app_prompt_logs(conversation_id, created_at, id);
create index if not exists idx_app_prompt_logs_context on app_prompt_logs(context_type, context_entity_id, created_at);
create index if not exists idx_app_state_events_id on app_state_events(id);
create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
