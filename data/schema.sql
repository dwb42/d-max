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

create table if not exists graph_layout_nodes (
  id integer primary key,
  scope_key text not null,
  scope_type text not null check (scope_type in ('initiative', 'category', 'all_categories')),
  scope_initiative_id integer references initiatives(id) on delete cascade,
  scope_category_id integer references categories(id) on delete cascade,
  node_key text not null,
  node_kind text not null check (node_kind in ('initiative_root', 'branch', 'freestyle', 'task', 'media')),
  entity_type text check (entity_type in ('initiative', 'task', 'media_asset')),
  entity_id integer,
  parent_node_key text,
  label text not null,
  x real not null,
  y real not null,
  width real,
  height real,
  collapsed integer not null default 0 check (collapsed in (0, 1)),
  created_at text not null,
  updated_at text not null,
  unique(scope_key, node_key),
  check (
    (scope_type = 'initiative' and scope_initiative_id is not null and scope_category_id is null)
    or (scope_type = 'category' and scope_initiative_id is null and scope_category_id is not null)
    or (scope_type = 'all_categories' and scope_initiative_id is null and scope_category_id is null)
  )
);

create table if not exists graph_node_annotations (
  id integer primary key,
  scope_key text not null,
  node_key text not null,
  annotation_type text not null check (annotation_type in ('priority', 'warning', 'timestamp', 'note', 'source_ref')),
  value text not null,
  payload_json text,
  created_at text not null,
  updated_at text not null,
  foreign key (scope_key, node_key) references graph_layout_nodes(scope_key, node_key) on delete cascade
);

create table if not exists mindmap_change_drafts (
  id integer primary key,
  initiative_id integer not null references initiatives(id) on delete cascade,
  status text not null default 'draft' check (status in ('draft', 'committed', 'discarded')),
  source_kind text not null check (source_kind in ('dialog', 'long_content', 'mindmap_review', 'manual')),
  source_ref_json text,
  summary text not null,
  rationale text,
  patches_json text not null,
  warnings_json text not null default '[]',
  committed_at text,
  created_at text not null,
  updated_at text not null
);

create table if not exists tasks (
  id integer primary key,
  initiative_id integer references initiatives(id),
  primary_party_id integer references parties(id),
  title text not null,
  status text not null default 'open' check (status in ('open', 'done')),
  priority text not null default 'normal' check (priority in ('low', 'normal', 'high', 'urgent')),
  notes text,
  due_at text,
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null,
  completed_at text,
  check (initiative_id is not null or primary_party_id is not null)
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

create table if not exists gmail_mailboxes (
  id integer primary key,
  account_label text not null unique,
  display_name text not null,
  email_address text,
  enabled integer not null default 1 check (enabled in (0, 1)),
  sync_enabled integer not null default 1 check (sync_enabled in (0, 1)),
  send_enabled integer not null default 0 check (send_enabled in (0, 1)),
  signature text,
  last_sync_at text,
  last_sync_error text,
  created_at text not null,
  updated_at text not null
);

create table if not exists gmail_messages (
  id integer primary key,
  mailbox_id integer not null references gmail_mailboxes(id) on delete cascade,
  gmail_message_id text not null,
  gmail_thread_id text,
  history_id text,
  label_ids_json text not null default '[]',
  direction text not null default 'unknown' check (direction in ('inbound', 'outbound', 'internal', 'unknown')),
  message_date text not null,
  subject text,
  from_json text not null default '[]',
  to_json text not null default '[]',
  cc_json text not null default '[]',
  bcc_json text not null default '[]',
  plain_body text,
  html_body text,
  snippet text,
  sync_status text not null default 'synced' check (sync_status in ('synced', 'external_deleted')),
  last_synced_at text not null,
  created_at text not null,
  updated_at text not null,
  unique(mailbox_id, gmail_message_id)
);

create table if not exists gmail_message_participants (
  id integer primary key,
  message_id integer not null references gmail_messages(id) on delete cascade,
  role text not null check (role in ('from', 'to', 'cc', 'bcc')),
  email text not null,
  normalized_email text not null,
  name text,
  created_at text not null,
  updated_at text not null
);

create table if not exists gmail_message_party_links (
  id integer primary key,
  message_id integer not null references gmail_messages(id) on delete cascade,
  party_id integer not null references parties(id) on delete cascade,
  contact_point_id integer references party_contact_points(id) on delete set null,
  matched_email text not null,
  created_at text not null,
  updated_at text not null,
  unique(message_id, party_id, contact_point_id, matched_email)
);

create table if not exists gmail_message_party_visibility (
  id integer primary key,
  message_id integer not null references gmail_messages(id) on delete cascade,
  party_id integer not null references parties(id) on delete cascade,
  status text not null check (status in ('archived', 'trashed')),
  created_at text not null,
  updated_at text not null,
  unique(message_id, party_id)
);

create table if not exists gmail_message_attachments (
  id integer primary key,
  message_id integer not null references gmail_messages(id) on delete cascade,
  gmail_attachment_id text,
  filename text,
  mime_type text,
  byte_size integer,
  part_id text,
  created_at text not null,
  updated_at text not null
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
  description text,
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

create table if not exists lead_status_groups (
  id integer primary key,
  key text not null unique,
  label text not null,
  is_system integer not null default 0 check (is_system in (0, 1)),
  sort_order integer not null default 0,
  created_at text not null,
  updated_at text not null
);

create table if not exists lead_statuses (
  id integer primary key,
  group_id integer not null references lead_status_groups(id) on delete cascade,
  key text not null,
  label text not null,
  sort_order integer not null default 0,
  is_terminal integer not null default 0 check (is_terminal in (0, 1)),
  is_success integer not null default 0 check (is_success in (0, 1)),
  created_at text not null,
  updated_at text not null,
  unique(group_id, key)
);

create table if not exists leads (
  id integer primary key,
  party_id integer not null references parties(id) on delete cascade,
  initiative_id integer references initiatives(id) on delete cascade,
  task_id integer references tasks(id) on delete cascade,
  status_id integer not null references lead_statuses(id),
  role_label text,
  created_at text not null,
  updated_at text not null,
  check (
    (initiative_id is not null and task_id is null)
    or (initiative_id is null and task_id is not null)
  )
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

create table if not exists party_timeline_entries (
  id integer primary key,
  kind text not null check (kind in ('conversation', 'letter_received', 'letter_sent', 'visit', 'note')),
  channel text check (channel in ('phone', 'meeting', 'visit', 'letter', 'note', 'other')),
  direction text not null default 'none' check (direction in ('inbound', 'outbound', 'bidirectional', 'none')),
  occurred_at text not null,
  title text not null,
  body text,
  related_task_id integer references tasks(id) on delete set null,
  created_at text not null,
  updated_at text not null
);

create table if not exists party_timeline_entry_parties (
  id integer primary key,
  entry_id integer not null references party_timeline_entries(id) on delete cascade,
  party_id integer not null references parties(id) on delete cascade,
  role text not null default 'primary' check (role in ('primary', 'participant', 'related', 'organization_context')),
  created_at text not null,
  updated_at text not null,
  unique(entry_id, party_id, role)
);

create table if not exists app_chat_messages (
  id integer primary key autoincrement,
  conversation_id integer references app_conversations(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source text not null default 'app_text' check (source in ('app_text', 'app_voice_message', 'system')),
  audio_generation_status text not null default 'none' check (audio_generation_status in ('none', 'pending', 'ready', 'failed')),
  audio_provider text,
  audio_error text,
  audio_generated_from_message_id integer references app_chat_messages(id),
  audio_generated_at text,
  research_summary_json text,
  created_at text not null
);

create table if not exists app_conversations (
  id integer primary key autoincrement,
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

create table if not exists app_prompt_logs (
  id integer primary key autoincrement,
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

create table if not exists app_state_events (
  id integer primary key,
  source text not null check (source in ('api', 'tool')),
  operation text not null,
  entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'initiative_relation', 'planning_canvas_node', 'task', 'communication_event', 'calendar_entry', 'calendar_event_visibility', 'calendar_source', 'media_asset', 'media_link', 'party', 'person', 'organization', 'relationship_type', 'party_relationship', 'participant_role_type', 'entity_participant', 'lead', 'party_contact_point', 'party_address')),
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
create index if not exists idx_graph_layout_nodes_scope_parent on graph_layout_nodes(scope_key, parent_node_key, node_key);
create index if not exists idx_graph_layout_nodes_entity on graph_layout_nodes(entity_type, entity_id);
create index if not exists idx_graph_node_annotations_node on graph_node_annotations(scope_key, node_key, annotation_type);
create index if not exists idx_graph_node_annotations_type on graph_node_annotations(annotation_type, scope_key);
create index if not exists idx_mindmap_change_drafts_initiative on mindmap_change_drafts(initiative_id, status, id);
create index if not exists idx_categories_sort_order on categories(sort_order, id);
create index if not exists idx_initiatives_category_sort_order on initiatives(category_id, sort_order, id);
create index if not exists idx_initiatives_parent_id on initiatives(parent_id);
create index if not exists idx_tasks_initiative_id on tasks(initiative_id);
create index if not exists idx_tasks_primary_party_id on tasks(primary_party_id, status, due_at, id);
create index if not exists idx_tasks_initiative_sort_order on tasks(initiative_id, sort_order, id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_due_at on tasks(due_at);
create index if not exists idx_party_timeline_entries_occurred on party_timeline_entries(occurred_at desc, id desc);
create index if not exists idx_party_timeline_entries_channel on party_timeline_entries(channel, occurred_at desc, id desc);
create index if not exists idx_party_timeline_entries_task on party_timeline_entries(related_task_id);
create index if not exists idx_party_timeline_entry_parties_party on party_timeline_entry_parties(party_id, entry_id);
create index if not exists idx_party_timeline_entry_parties_entry on party_timeline_entry_parties(entry_id, party_id);
create index if not exists idx_task_checklist_items_task_sort_order on task_checklist_items(task_id, sort_order, id);
create index if not exists idx_task_checklist_items_status on task_checklist_items(status);
create index if not exists idx_calendar_entries_start_at on calendar_entries(start_at);
create index if not exists idx_calendar_entries_end_at on calendar_entries(end_at);
create index if not exists idx_calendar_entries_status on calendar_entries(status);
create index if not exists idx_calendar_entries_initiative_id on calendar_entries(initiative_id);
create index if not exists idx_calendar_entries_task_id on calendar_entries(task_id);
create index if not exists idx_calendar_sources_enabled on calendar_sources(enabled, provider);
create index if not exists idx_gmail_mailboxes_sync on gmail_mailboxes(enabled, sync_enabled, id);
create index if not exists idx_gmail_messages_mailbox_date on gmail_messages(mailbox_id, message_date desc, id desc);
create index if not exists idx_gmail_messages_status on gmail_messages(sync_status, id);
create index if not exists idx_gmail_message_participants_email on gmail_message_participants(normalized_email, message_id);
create index if not exists idx_gmail_message_party_links_party on gmail_message_party_links(party_id, message_id);
create index if not exists idx_gmail_message_party_links_message on gmail_message_party_links(message_id, party_id);
create index if not exists idx_gmail_message_party_visibility_party on gmail_message_party_visibility(party_id, status, message_id);
create index if not exists idx_gmail_message_attachments_message on gmail_message_attachments(message_id);
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
create index if not exists idx_lead_status_groups_sort on lead_status_groups(sort_order, lower(label), id);
create index if not exists idx_lead_statuses_group_sort on lead_statuses(group_id, sort_order, lower(label), id);
create unique index if not exists idx_leads_unique_initiative_party on leads(party_id, initiative_id) where initiative_id is not null;
create unique index if not exists idx_leads_unique_task_party on leads(party_id, task_id) where task_id is not null;
create index if not exists idx_leads_initiative_status on leads(initiative_id, status_id, id);
create index if not exists idx_leads_task_status on leads(task_id, status_id, id);
create index if not exists idx_leads_party on leads(party_id, id);
create index if not exists idx_party_contact_points_party_type on party_contact_points(party_id, type, is_preferred desc, is_primary desc, id);
create index if not exists idx_party_addresses_party on party_addresses(party_id, is_primary desc, id);
create index if not exists idx_app_chat_messages_created_at on app_chat_messages(created_at, id);
create index if not exists idx_app_chat_messages_conversation_id on app_chat_messages(conversation_id, created_at, id);
create index if not exists idx_app_conversations_context on app_conversations(context_type, context_entity_id, updated_at);
create index if not exists idx_app_prompt_logs_created_at on app_prompt_logs(created_at, id);
create index if not exists idx_app_prompt_logs_conversation_id on app_prompt_logs(conversation_id, created_at, id);
create index if not exists idx_app_prompt_logs_context on app_prompt_logs(context_type, context_entity_id, created_at);
create index if not exists idx_app_state_events_id on app_state_events(id);
create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
