pragma foreign_keys = on;

create table if not exists categories (
  id integer primary key,
  name text not null unique,
  description text,
  sort_order integer not null default 0,
  is_system integer not null default 0 check (is_system in (0, 1)),
  created_at text not null,
  updated_at text not null
);

create table if not exists projects (
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

create table if not exists tasks (
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

create table if not exists thinking_spaces (
  id integer primary key,
  title text not null,
  summary text,
  status text not null default 'active' check (status in ('active', 'paused', 'archived')),
  created_at text not null,
  updated_at text not null,
  archived_at text
);

create table if not exists thinking_sessions (
  id integer primary key,
  space_id integer not null references thinking_spaces(id),
  source text not null default 'conversation',
  raw_input text,
  summary text,
  created_at text not null
);

create table if not exists thoughts (
  id integer primary key,
  space_id integer not null references thinking_spaces(id),
  session_id integer references thinking_sessions(id),
  type text not null check (type in (
    'observation',
    'desire',
    'constraint',
    'question',
    'hypothesis',
    'option',
    'fear',
    'pattern',
    'possible_project',
    'possible_task',
    'decision',
    'discarded'
  )),
  content text not null,
  normalized_content text,
  status text not null default 'active' check (status in ('active', 'parked', 'resolved', 'contradicted', 'discarded')),
  maturity text not null default 'spark' check (maturity in ('spark', 'named', 'connected', 'testable', 'committed', 'operational')),
  confidence real not null default 0.5 check (confidence >= 0 and confidence <= 1),
  heat real not null default 0.5 check (heat >= 0 and heat <= 1),
  created_at text not null,
  updated_at text not null,
  resolved_at text
);

create table if not exists thought_links (
  id integer primary key,
  from_thought_id integer not null references thoughts(id),
  to_entity_type text not null check (to_entity_type in ('thought', 'category', 'project', 'task', 'tension')),
  to_entity_id integer not null,
  relation text not null check (relation in (
    'supports',
    'contradicts',
    'causes',
    'blocks',
    'refines',
    'repeats',
    'answers',
    'depends_on',
    'candidate_for',
    'extracted_to',
    'mentions',
    'context'
  )),
  strength real not null default 0.5 check (strength >= 0 and strength <= 1),
  created_at text not null
);

create table if not exists tensions (
  id integer primary key,
  space_id integer not null references thinking_spaces(id),
  session_id integer references thinking_sessions(id),
  want text not null,
  but text not null,
  pressure text not null default 'medium' check (pressure in ('low', 'medium', 'high')),
  status text not null default 'unresolved' check (status in ('unresolved', 'parked', 'resolved', 'discarded')),
  created_at text not null,
  updated_at text not null,
  resolved_at text
);

create table if not exists app_chat_messages (
  id integer primary key,
  conversation_id integer references app_conversations(id),
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  source text not null default 'app_text' check (source in ('app_text', 'app_voice_message', 'system')),
  thinking_space_id integer references thinking_spaces(id),
  created_at text not null
);

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
);

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

create table if not exists app_state_events (
  id integer primary key,
  source text not null check (source in ('api', 'tool')),
  operation text not null,
  entity_type text not null check (entity_type in ('overview', 'category', 'project', 'task', 'thinking')),
  entity_id integer,
  category_id integer,
  project_id integer,
  task_id integer,
  created_at text not null
);

create index if not exists idx_projects_category_id on projects(category_id);
create index if not exists idx_categories_sort_order on categories(sort_order, id);
create index if not exists idx_projects_category_sort_order on projects(category_id, sort_order, id);
create index if not exists idx_projects_parent_id on projects(parent_id);
create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_project_sort_order on tasks(project_id, sort_order, id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_due_at on tasks(due_at);
create index if not exists idx_thinking_sessions_space_id on thinking_sessions(space_id);
create index if not exists idx_thoughts_space_id on thoughts(space_id);
create index if not exists idx_thoughts_session_id on thoughts(session_id);
create index if not exists idx_thoughts_type on thoughts(type);
create index if not exists idx_thoughts_status on thoughts(status);
create index if not exists idx_thought_links_from_thought_id on thought_links(from_thought_id);
create index if not exists idx_thought_links_target on thought_links(to_entity_type, to_entity_id);
create index if not exists idx_tensions_space_id on tensions(space_id);
create index if not exists idx_tensions_status on tensions(status);
create index if not exists idx_app_chat_messages_created_at on app_chat_messages(created_at, id);
create index if not exists idx_app_chat_messages_thinking_space_id on app_chat_messages(thinking_space_id);
create index if not exists idx_app_chat_messages_conversation_id on app_chat_messages(conversation_id, created_at, id);
create index if not exists idx_app_conversations_context on app_conversations(context_type, context_entity_id, updated_at);
create index if not exists idx_app_prompt_logs_created_at on app_prompt_logs(created_at, id);
create index if not exists idx_app_prompt_logs_conversation_id on app_prompt_logs(conversation_id, created_at, id);
create index if not exists idx_app_prompt_logs_context on app_prompt_logs(context_type, context_entity_id, created_at);
create index if not exists idx_app_state_events_id on app_state_events(id);
create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, project_id, task_id, category_id);
