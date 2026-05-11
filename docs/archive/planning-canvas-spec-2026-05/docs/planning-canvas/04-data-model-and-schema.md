# Data Model and Schema

## Core principle

Do not conflate domain data with canvas layout.

An initiative's category, type, status, parent, predecessor/successor relationships, markdown memory, and dates belong to the domain model.

A card's x/y position, visual width, collapsed state, and layout behavior belong to the canvas model.

## Existing domain model

Do not duplicate existing domain relationship data.

Existing domain tables:

- `categories`
- `initiatives`
- `initiative_relations`
- `tasks`

Use existing repositories where possible:

```text
src/repositories/categories.ts
src/repositories/initiatives.ts
src/repositories/initiative-relations.ts
src/repositories/tasks.ts
```

## Recommended new table: planning_canvases

For v1, a single default canvas is enough. However, a small `planning_canvases` table preserves future flexibility.

Suggested SQLite schema:

```sql
create table if not exists planning_canvases (
  id integer primary key,
  name text not null unique,
  description text,
  default_start_date text,
  default_zoom text not null default 'month'
    check (default_zoom in ('month', 'week')),
  created_at text not null,
  updated_at text not null
);
```

Recommended default row:

```sql
insert or ignore into planning_canvases
  (id, name, description, default_start_date, default_zoom, created_at, updated_at)
values
  (1, 'Default Planning Canvas', null, null, 'month', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
```

Adapt timestamp generation to existing project conventions.

## Recommended new table: planning_canvas_nodes

Because MVP supports initiative nodes only, prefer a real foreign key to `initiatives(id)` instead of a polymorphic `object_type/object_id` pair.

Suggested SQLite schema:

```sql
create table if not exists planning_canvas_nodes (
  id integer primary key,
  canvas_id integer not null references planning_canvases(id) on delete cascade,
  initiative_id integer not null references initiatives(id) on delete cascade,

  x real not null,
  y real not null,
  width real,
  height real,

  collapsed integer not null default 0 check (collapsed in (0, 1)),
  date_linked integer not null default 0 check (date_linked in (0, 1)),

  created_at text not null,
  updated_at text not null,

  unique(canvas_id, initiative_id)
);

create index if not exists idx_planning_canvas_nodes_canvas
  on planning_canvas_nodes(canvas_id);

create index if not exists idx_planning_canvas_nodes_initiative
  on planning_canvas_nodes(initiative_id);
```

Notes:

- `date_linked` should default to `0` in MVP.
- MVP dragging should update `x` and `y`, not initiative dates.
- `width` and `height` are optional layout hints.
- cascading delete keeps layout clean when an initiative is deleted.
- if task canvas nodes are added later, either add a separate `planning_canvas_task_nodes` table or migrate to a carefully validated polymorphic table.

## Repository recommendation

Add a repository such as:

```text
src/repositories/planning-canvas.ts
```

Suggested functions:

```ts
ensureDefaultPlanningCanvas(): PlanningCanvas
getPlanningCanvas(canvasId: number): PlanningCanvas | null
listPlanningCanvasNodes(canvasId: number): PlanningCanvasNode[]
listPlanningCanvasInitiativeNodes(canvasId: number): PlanningCanvasInitiativeNode[]
createPlanningCanvasNode(input: {
  canvasId: number;
  initiativeId: number;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
}): PlanningCanvasNode
updatePlanningCanvasNodePosition(input: {
  nodeId: number;
  x: number;
  y: number;
}): PlanningCanvasNode
deletePlanningCanvasNode(nodeId: number): void
listUnmappedInitiativesForCanvas(input: {
  canvasId: number;
  categoryId?: number;
  type?: "idea" | "project" | "habit";
  status?: "active" | "paused" | "completed" | "archived";
  search?: string;
  includeArchived?: boolean;
}): InitiativeWithCategory[]
```

Adapt names to the existing repository style.

## Joined data shape for the frontend

The canvas UI will likely need a joined shape containing:

```ts
type PlanningCanvasInitiativeNode = {
  node: PlanningCanvasNode;
  initiative: Initiative;
  category: Category;
  childCount: number;
  taskCount: number;
  openTaskCount?: number;
  doneTaskCount?: number;
};
```

Add equivalent types to:

```text
web/src/types.ts
```

using the actual project style.

## Relationship data for rendering

Do not store parent-child or predecessor-successor relationships as canvas edges in MVP.

Derive edges from existing domain data.

### Parent-child edges

Source:

```sql
initiatives.parent_id
```

Render edge if both parent and child have visible canvas nodes.

### Predecessor-successor edges

Source:

```sql
initiative_relations
```

Render edge if both predecessor and successor have visible canvas nodes.

Direction:

```text
predecessor_initiative_id -> successor_initiative_id
```

Render as an arrow.

## Context resolver impact

The project has a schema sync mechanism:

```text
src/chat/conversation-context.ts
tests/chat/context-schema-sync.test.ts
```

Because Planning Canvas adds schema, the coding agent must inspect and update these.

Recommended context policy:

- Do not automatically dump raw canvas coordinates into normal conversation context.
- Do make the schema sync test aware of the new tables.
- Either explicitly exclude `planning_canvases` and `planning_canvas_nodes` from general context with a rationale, or expose a compact summary only when planning-canvas context is relevant.
- If the agent should manipulate canvas layout later, add dedicated tools/repository-backed actions instead of relying on memory.

Possible compact context summary:

```text
Planning canvas: 12 initiatives placed, 7 unmapped active initiatives.
```

Only include detailed node coordinates when the user specifically asks about the planning canvas layout.

## Date model note

The current schema has:

```ts
start_date: string | null
end_date: string | null
```

There is no current hard/soft date field.

MVP must not introduce invisible semantics where a drag gesture silently edits domain dates.

Future date model options:

```ts
date_mode: "none" | "soft" | "hard"
```

or:

```ts
date_precision: "none" | "month" | "week" | "day"
date_flexibility: "soft" | "hard"
```

Do not add these fields in v1 unless explicitly chosen as a product decision.
