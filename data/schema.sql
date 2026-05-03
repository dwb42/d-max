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
  name text not null,
  status text not null default 'active' check (status in ('active', 'paused', 'completed', 'archived')),
  summary text,
  markdown text not null default '',
  start_date text,
  end_date text,
  sort_order integer not null default 0,
  is_system integer not null default 0 check (is_system in (0, 1)),
  created_at text not null,
  updated_at text not null
);

create table if not exists tasks (
  id integer primary key,
  initiative_id integer not null references initiatives(id),
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
  entity_type text not null check (entity_type in ('overview', 'category', 'initiative', 'task')),
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
create index if not exists idx_categories_sort_order on categories(sort_order, id);
create index if not exists idx_initiatives_category_sort_order on initiatives(category_id, sort_order, id);
create index if not exists idx_initiatives_parent_id on initiatives(parent_id);
create index if not exists idx_tasks_initiative_id on tasks(initiative_id);
create index if not exists idx_tasks_initiative_sort_order on tasks(initiative_id, sort_order, id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_due_at on tasks(due_at);
create index if not exists idx_app_chat_messages_created_at on app_chat_messages(created_at, id);
create index if not exists idx_app_chat_messages_conversation_id on app_chat_messages(conversation_id, created_at, id);
create index if not exists idx_app_conversations_context on app_conversations(context_type, context_entity_id, updated_at);
create index if not exists idx_app_prompt_logs_created_at on app_prompt_logs(created_at, id);
create index if not exists idx_app_prompt_logs_conversation_id on app_prompt_logs(conversation_id, created_at, id);
create index if not exists idx_app_prompt_logs_context on app_prompt_logs(context_type, context_entity_id, created_at);
create index if not exists idx_app_state_events_id on app_state_events(id);
create index if not exists idx_app_state_events_created_at on app_state_events(created_at, id);
create index if not exists idx_app_state_events_scope on app_state_events(entity_type, entity_id, initiative_id, task_id, category_id);
