pragma foreign_keys = on;

create table if not exists categories (
  id integer primary key,
  name text not null unique,
  description text,
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
  created_at text not null,
  updated_at text not null,
  completed_at text
);

create index if not exists idx_projects_category_id on projects(category_id);
create index if not exists idx_projects_parent_id on projects(parent_id);
create index if not exists idx_tasks_project_id on tasks(project_id);
create index if not exists idx_tasks_status on tasks(status);
create index if not exists idx_tasks_priority on tasks(priority);
create index if not exists idx_tasks_due_at on tasks(due_at);
