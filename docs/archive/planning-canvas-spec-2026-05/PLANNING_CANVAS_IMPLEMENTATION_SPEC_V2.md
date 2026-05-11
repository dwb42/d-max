# Planning Canvas Implementation Spec v2 — d-max Model-Aligned

Implementation status note, 2026-05-07:
The current d-max Planning Canvas MVP has been implemented with a narrower
project-only scope. For authoritative implemented state, read
`docs/current-state.md`. Key current choices: one default canvas, project cards
only, manual persisted `planning_canvas_nodes.x/y`, fixed-size cards, zoom that
changes only the horizontal time scale, a red Today line, permanent
parent-child and predecessor/successor relationship rendering, card click opens
project detail in a new tab, a compact card edit modal, and hidden left/right
side handles for creating predecessor/successor projects.


---

# File: docs/planning-canvas/README.md


# Planning Canvas Spec Pack v2 — d-max Model-Aligned

This folder contains the implementation specification for the new **Planning Canvas** feature, updated to match the current d-max SQLite data model for categories, initiatives, initiative relationships, and tasks.

The Planning Canvas is a Miro-like, time-aware planning view for arranging initiatives over a soft timeline. It helps the user model hierarchy, sequencing, dependency, category context, and future planning intent in a more flexible way than a calendar or list.

## Important v2 updates

This version incorporates the current d-max model:

- `initiatives.name`, not `title`, is the canonical initiative label.
- `initiatives.start_date` and `initiatives.end_date` are nullable date-only strings in `YYYY-MM-DD`.
- `categories` own initiatives through `initiatives.category_id`.
- category `color` and `emoji` should be used in the Planning Canvas UI.
- parent/child hierarchy is represented by `initiatives.parent_id`.
- predecessor/successor sequencing is represented by the `initiative_relations` table.
- `initiative_relations` supports many-to-many directed `precedes` edges.
- tasks belong to exactly one initiative through `tasks.initiative_id`.
- task due dates use `tasks.due_at`.
- SQLite is the source of truth. Durable changes should go through repositories/API/tools, not prompt memory.
- schema changes must be considered in `src/chat/conversation-context.ts` and `tests/chat/context-schema-sync.test.ts`.

## Recommended usage with a coding agent

Give the coding agent this folder and start with:

> Read `docs/planning-canvas/00-coding-agent-entry-prompt.md` first. Then inspect the codebase and produce an implementation plan. Implement the feature phase by phase, following the acceptance criteria.

## File order

1. `00-coding-agent-entry-prompt.md`
   The main instruction prompt for the coding agent.

2. `01-domain-model-alignment.md`
   How the current d-max model maps into the Planning Canvas feature.

3. `02-product-brief.md`
   Product concept, goals, and mental model.

4. `03-mvp-scope.md`
   What is included in v1 and what is intentionally excluded.

5. `04-data-model-and-schema.md`
   Concrete schema/repository recommendations aligned with the current SQLite model.

6. `05-ui-behavior-spec.md`
   Interaction design, layout, dragging, snapping, parking lot, relationships, and inspector behavior.

7. `06-implementation-phases.md`
   Practical build sequence.

8. `07-acceptance-criteria.md`
   Testable criteria for completion.

9. `08-open-questions.md`
   Product and technical decisions to resolve during or before implementation.

10. `09-coding-agent-prompt-sequence.md`
   Suggested prompts for implementing the feature in controlled phases.


---

# File: docs/planning-canvas/00-coding-agent-entry-prompt.md


# Coding Agent Entry Prompt: Planning Canvas

You are implementing a new **Planning Canvas** feature in the d-max project/task management application.

Before coding:

1. Read all files in `docs/planning-canvas/`.
2. Inspect the existing project structure, frontend framework, routing, data access layer, database/schema model, component patterns, styling system, and existing initiative/task models.
3. Specifically inspect these files before proposing implementation:

```text
data/schema.sql
src/repositories/categories.ts
src/repositories/initiatives.ts
src/repositories/initiative-relations.ts
src/repositories/tasks.ts
src/tools/initiatives.ts
src/tools/initiative-relations.ts
src/chat/conversation-context.ts
tests/chat/context-schema-sync.test.ts
web/src/types.ts
web/src/App.tsx
```

4. Do not redesign the existing application architecture unless necessary.
5. Reuse existing repositories, validation patterns, API/tool patterns, UI components, styling conventions, and date utilities wherever possible.
6. SQLite is the source of truth. Durable changes must go through repositories/API/tools, not prompt memory.
7. Implement the feature incrementally, phase by phase.
8. After inspecting the codebase, produce a concise implementation plan listing:
   - files/components to create or modify,
   - data-model changes,
   - schema/migration approach,
   - repository/API/tool changes,
   - context resolver/test impact,
   - risks or assumptions,
   - the first implementation phase.

## Current domain model facts

The app already has:

- `categories`
- `initiatives`
- `initiative_relations`
- `tasks`

Initiatives are the primary durable object. Product language may call them ideas, projects, habits, or initiatives, but technically they are rows in `initiatives`.

Canonical initiative fields include:

```ts
id: number
category_id: number
parent_id: number | null
type: "idea" | "project" | "habit"
name: string
status: "active" | "paused" | "completed" | "archived"
summary?: string | null
markdown: string
start_date?: string | null
end_date?: string | null
sort_order: number
is_system: 0 | 1
created_at: string
updated_at: string
```

Canonical task fields include:

```ts
id: number
initiative_id: number
title: string
status: "open" | "done"
priority: "low" | "normal" | "high" | "urgent"
notes?: string | null
due_at?: string | null
sort_order: number
created_at: string
updated_at: string
completed_at?: string | null
```

Predecessor/successor relationships are stored in `initiative_relations`:

```ts
predecessor_initiative_id: number
successor_initiative_id: number
relation_type: "precedes"
```

Parent/child hierarchy is stored separately through `initiatives.parent_id`.

## Feature summary

Create a new canvas-style planning view, similar in spirit to a Miro-style infinite canvas, but with a horizontal time-grid background.

The canvas should help users:

- visually arrange initiatives over time,
- model soft future intent,
- understand hierarchy,
- see predecessor/successor sequences,
- use categories as visual context,
- pull unmapped initiatives from a parking lot,
- inspect initiative details and tasks from the canvas.

This should feel more flexible than a calendar and less rigid than a Gantt chart.

## Core implementation principle

Canvas layout must be stored separately from initiative/task domain data.

Do not use initiative dates as the only source of canvas position.

The domain object answers:

> What is this initiative?

The canvas node answers:

> Where does this initiative appear on this planning canvas?

## MVP priorities

Implement in this order:

1. New Planning Canvas route/view.
2. Time-grid canvas background.
3. Persistent planning canvas node storage.
4. Draggable initiative cards.
5. Parking lot with drag-to-canvas.
6. Relationship lines for parent-child and predecessor-successor relationships.
7. Inspector/details panel.
8. Filters, toggles, tests, and polish.

Do not implement advanced nested containers, full task canvas mapping, complex auto-layout, collaboration, arbitrary whiteboard shapes, or full Gantt precision in v1.

## Important behavior

For MVP, moving a card updates canvas placement only. It must not silently update `initiatives.start_date` or `initiatives.end_date`.

If date-linking is implemented later:

- soft-dated initiatives may update dates when moved,
- hard-dated initiatives should be locked or require confirmation,
- undated initiatives should remain layout-only unless explicitly assigned a date.

The current schema does not have a `date_mode` field. Do not invent soft/hard date semantics in MVP unless a deliberate schema decision is made.

## Final delivery expectation

The feature is complete when the acceptance criteria in `07-acceptance-criteria.md` pass.


---

# File: docs/planning-canvas/01-domain-model-alignment.md


# Domain Model Alignment

This document maps the current d-max data model onto the Planning Canvas feature.

## Categories

Table: `categories`

Categories are broad life/business areas. Every initiative belongs to exactly one category through `initiatives.category_id`.

Important fields for Planning Canvas:

```ts
id: number
name: string
description?: string | null
color: string
emoji: string
sort_order: number
is_system: 0 | 1
```

## How categories should appear in the canvas

Use categories as visual context, not as the primary canvas structure.

Recommended MVP usage:

- show category emoji/name on initiative cards,
- use category color as a small accent stripe or badge,
- allow filtering parking lot by category,
- allow filtering canvas nodes by category,
- optionally group parking lot items by category.

Do not make category swimlanes required in MVP. The vertical axis should remain freeform.

## Initiatives

Table: `initiatives`

Initiatives are the primary canvas objects for v1.

Use these canonical field names:

```ts
id
category_id
parent_id
type
name
status
summary
markdown
start_date
end_date
sort_order
is_system
created_at
updated_at
```

Important UI mapping:

| Domain field | Canvas usage |
|---|---|
| `name` | primary card label |
| `type` | idea/project/habit badge or icon |
| `status` | active/paused/completed/archived badge/filter |
| `category_id` | join to category for emoji/color/name |
| `parent_id` | parent-child hierarchy line |
| `summary` | card subtitle or inspector field |
| `markdown` | inspector/details preview or editor link |
| `start_date`, `end_date` | date label and optional duration indicator |

## Initiative types

Current valid values:

```ts
"idea" | "project" | "habit"
```

Product semantics:

- `idea`: loose thought, possibility, impulse, brainstorming; usually not time-bound.
- `project`: concrete goal-oriented work with an outcome; may have `start_date` and `end_date`.
- `habit`: ongoing practice/routine; usually no clear end date.

Implementation note:

- Changing initiative type is a lifecycle decision in agent flows and requires confirmation.
- The Planning Canvas v1 should display type but should not introduce type-changing flows unless the existing UI already supports that safely.

## Initiative status

Current valid values:

```ts
"active" | "paused" | "completed" | "archived"
```

Recommended MVP behavior:

- show status on card,
- filter by status,
- hide archived initiatives by default in the parking lot unless there is already a global convention to show them,
- optionally allow a “show archived” toggle.

## Dates

Current initiative dates:

```ts
start_date: string | null
end_date: string | null
```

Rules:

- date-only strings in `YYYY-MM-DD`, nullable,
- validation rejects `start_date > end_date`,
- dates are domain data,
- canvas position is layout data.

MVP behavior:

- display date labels when present,
- optionally show a small duration ribbon,
- do not silently modify dates when the user drags cards,
- do not add hard/soft date behavior in MVP unless explicitly designed.

## Parent/child hierarchy

Parent/child hierarchy is represented by:

```ts
initiatives.parent_id references initiatives(id)
```

Meaning:

- one initiative can have one parent,
- one initiative can have many children,
- hierarchy represents containment/structure, not sequencing.

Canvas behavior:

- render parent-child lines between visible parent and child initiatives,
- use a neutral non-arrow line,
- optionally show child count on parent cards,
- do not implement parent reassignment by drag/drop in MVP.

Reason:

- parent cycle protection is not documented as strongly as directed relation cycle protection,
- display-only hierarchy is much safer for v1.

## Predecessor/successor graph

Table: `initiative_relations`

Canonical schema:

```ts
id: number
predecessor_initiative_id: number
successor_initiative_id: number
relation_type: "precedes"
created_at: string
updated_at: string
```

Meaning:

```text
A -> B
A precedes B
B succeeds/follows A
```

Rules:

- applies to all initiative types,
- v1 supports only `relation_type = 'precedes'`,
- many-to-many is supported,
- one initiative can have multiple successors,
- one initiative can have multiple predecessors,
- self-relations are prevented by DB constraint,
- duplicate edges are prevented by unique constraint,
- cycles are prevented in repository logic,
- deleting an initiative cascades relation rows involving it.

Canvas behavior:

- render directional arrows from predecessor to successor,
- derive these arrows from `initiative_relations`,
- only render the arrow when both initiatives are visible on the canvas,
- do not create a separate canvas edge table for these existing relationships in MVP.

## Tasks

Table: `tasks`

Tasks belong to exactly one initiative:

```ts
tasks.initiative_id references initiatives(id)
```

Canonical fields:

```ts
id
action? no; canonical label is title
initiative_id
title
status: "open" | "done"
priority: "low" | "normal" | "high" | "urgent"
notes
due_at
sort_order
created_at
updated_at
completed_at
```

Canvas MVP behavior:

- do not render task nodes by default,
- show task count on initiative cards,
- show open/done task counts if cheap to compute,
- list tasks in the inspector for the selected initiative,
- optionally highlight urgent/high-priority tasks in the inspector,
- do not implement task-to-canvas promotion in v1 unless the codebase already makes it trivial.

## Relationship summary

The practical graph is:

```text
Category 1 -> many Initiatives
Initiative 1 -> many Tasks
Initiative 1 -> many child Initiatives through initiatives.parent_id
Initiative many -> many Initiatives through initiative_relations
```

Concrete links:

```text
categories.id
  <- initiatives.category_id

initiatives.id
  <- initiatives.parent_id

initiatives.id
  <- tasks.initiative_id

initiatives.id
  <- initiative_relations.predecessor_initiative_id
initiatives.id
  <- initiative_relations.successor_initiative_id
```

## Source-of-truth rule

SQLite is the source of truth.

Durable state changes should go through repositories/API/tools. The Planning Canvas must not rely on direct prompt memory or frontend-only state for durable layout.


---

# File: docs/planning-canvas/02-product-brief.md


# Product Brief: Planning Canvas

## Product concept

The Planning Canvas is a zoomable, pannable, time-aware canvas where initiatives can be placed on a soft timeline, connected by relationship lines, visually enriched by category context, and pulled in from an unmapped parking lot.

It is not just a canvas view. It is a **temporal planning canvas**: a hybrid between a whiteboard, loose roadmap, dependency map, and calendar.

## Problem

The existing app has list and calendar/timeline-style views. These are useful for execution and date-based review, but they do not give the user a good way to:

- plan further ahead,
- model rough intent,
- see sequences,
- see how ideas become planning projects and implementation projects,
- understand nesting,
- understand interrelatedness,
- arrange future work spatially before it becomes exact.

## Core goal

Give the user a flexible, visual, time-aware workspace where initiatives can be arranged, nested, sequenced, connected, and gradually turned from vague ideas into concrete projects.

## User mental model

The user needs to represent several kinds of structure.

### Category context

Example:

```text
Health
Work
Travel
Relationships
Business
```

Categories should help the user understand life/business area context without making the canvas rigid.

### Containment

Example:

```text
South America Trip
├── Beach Holiday
├── Backpacking
└── Meditation Retreat
```

### Succession / dependency

Example:

```text
Idea → Planning Project → Implementation Project
```

### Time placement

Example:

```text
Trip to Helsinki: July 29 – August 1
```

### Soft intent

Example:

```text
I want to work on this planning project sometime in June.
```

Important: the current schema only has date fields, not a formal soft/hard date model. The canvas can visually support soft planning without mutating actual dates in MVP.

### Task ownership

Example:

```text
South America Trip
├── Book flights
├── Renew passport
└── Research retreat options
```

Tasks should remain secondary in canvas v1.

## Experience principles

1. The canvas should support rough planning, not only exact scheduling.
2. The horizontal axis represents time.
3. The vertical axis is freeform.
4. Cards must remain readable even when the represented duration is short.
5. Relationships must be visually understandable.
6. The user should be able to reduce visual noise.
7. Category color and emoji should help orientation.
8. Domain data and canvas layout should remain separate.
9. The first version should feel like a time-aware whiteboard, not a strict Gantt chart.


---

# File: docs/planning-canvas/03-mvp-scope.md


# MVP Scope: Planning Canvas v1

## Must have

### 1. Canvas view

Create a new Planning Canvas view with:

- central canvas,
- top toolbar,
- left parking lot,
- optional right inspector/details panel.

The canvas must support:

- panning,
- zooming if the selected implementation/library supports it,
- a time-grid background,
- month labels,
- week subdivisions,
- visible current time region by default.

### 2. Initiative nodes

Render initiatives as draggable cards on the canvas.

Cards should show:

- `initiatives.name`,
- `initiatives.type`,
- `initiatives.status`,
- category emoji/color/name,
- `initiatives.start_date` / `initiatives.end_date` if available,
- child count if available,
- task count if available.

### 3. Separate canvas placement

Store canvas placement separately from initiative domain data.

Minimum placement fields:

```ts
canvas_id
initiative_id
x
y
width
height
```

### 4. Parking lot

Add a left-side parking lot showing initiatives that do not yet have a canvas node.

The user can drag an initiative from the parking lot onto the canvas.

Dropping creates a canvas node and removes the item from the parking lot.

### 5. Relationship lines

Render relationship lines between visible initiative nodes.

Supported relationship types for MVP:

- parent-child from `initiatives.parent_id`,
- predecessor-successor from `initiative_relations`.

Use different visual styles.

### 6. Details panel

Clicking a card opens an inspector/details panel with initiative metadata, category, relationships, and tasks.

### 7. Basic snapping

Horizontal dragging should snap to a sensible grid, such as weeks or months.

Vertical dragging remains freeform.

Snapping affects canvas position only in MVP. It does not mutate `start_date` or `end_date`.

### 8. Readable cards

Cards must have a minimum readable width. Do not shrink cards to exact duration if that would make text unreadable.

## Should not be in MVP

Do not implement these unless they are already trivial in the codebase:

- full nested parent containers,
- parent reassignment by drag/drop,
- relation creation by connector handles,
- automatic layout,
- full task canvas mapping,
- task dependency mapping,
- arbitrary drawing tools,
- collaboration/multiplayer,
- comments,
- image uploads,
- advanced dependency validation,
- full Gantt chart behavior,
- complex date editing through drag gestures,
- resource/capacity planning,
- new soft/hard date schema.

## Later enhancements

Potential future features:

- parent initiatives as resizable containers,
- task nodes promoted from initiative details,
- relationship creation by dragging handles,
- selected-node focus mode,
- auto-arrange by dependency,
- category swimlanes,
- multiple canvases,
- undo/redo,
- keyboard shortcuts,
- export/share,
- conflict detection,
- formal date mode: none/soft/hard,
- formal date precision: month/week/day.


---

# File: docs/planning-canvas/04-data-model-and-schema.md


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


---

# File: docs/planning-canvas/05-ui-behavior-spec.md


# UI and Behavior Spec

## Overall layout

Recommended layout:

```text
┌─────────────────────────────────────────────────────────────────────┐
│ Top toolbar                                                         │
│ [Today] [Zoom -] [Zoom +] [Month/Week] [Relationships] [Filters]    │
├────────────────┬────────────────────────────────────────────────────┤
│ Parking Lot    │ Canvas                                             │
│                │                                                    │
│ Search         │  May       June       July       August             │
│ Category       │  |---------|----------|----------|----------|       │
│ Type           │                                                    │
│ Status         │      ┌──────────────────────┐                      │
│                │      │ 🌎 Travel · Project  │                      │
│ Unmapped       │      │ South America Trip   │                      │
│ initiatives    │      │ Jul 1 – Aug 31       │                      │
│                │      └──────────┬───────────┘                      │
│                │                 ↓                                  │
│                │      ┌──────────────────────┐                      │
│                │      │ 💼 Work · Project    │                      │
│                │      │ Planning Project     │                      │
│                │      └──────────────────────┘                      │
└────────────────┴────────────────────────────────────────────────────┘
```

Optional right-side inspector:

```text
┌────────────────────┐
│ Inspector          │
│                    │
│ South America Trip │
│ Category: 🌎 Travel│
│ Type: Project      │
│ Status: Active     │
│ Dates: Jul–Aug     │
│ Children: 3        │
│ Tasks: 12          │
└────────────────────┘
```

## Canvas background

The canvas background should show time horizontally.

At minimum:

- month columns,
- week subdivisions,
- visible labels,
- enough contrast to guide placement without visual clutter.

The vertical axis is freeform.

## Default viewport

When the user opens the Planning Canvas:

- show the current month,
- include at least one previous month,
- include several future months,
- load existing placed nodes,
- show unmapped initiatives in the parking lot.

## Card design

Initiative card contents:

- `initiatives.name`,
- category emoji/name and category color accent,
- initiative type label/icon,
- status,
- priority only if the current initiative model actually has priority; otherwise do not invent it,
- date range if available,
- child count if available,
- task count if available.

Important correction:

- initiatives currently do **not** have a documented priority field.
- tasks have priority.
- do not show initiative priority unless the codebase has it elsewhere.

Cards should have a minimum readable width, roughly 220–280 px.

Do not make a one-day initiative card too narrow to read.

## Duration display

For MVP, use a date label and optionally an internal duration ribbon.

The card width does not need to exactly equal duration.

Good pattern:

```text
┌─────────────────────────────┐
│ 🌎 Travel · Project         │
│ Trip to Helsinki            │
│ Jul 29 – Aug 1              │
│ █████                       │
└─────────────────────────────┘
```

The visual card remains readable while the date label communicates timing.

## Dragging

Users can drag initiative cards.

Dragging should:

- update `planning_canvas_nodes.x`,
- update `planning_canvas_nodes.y`,
- persist position through the repository/API layer,
- optionally snap horizontally to week or month units,
- keep vertical movement freeform.

For MVP, dragging must not silently update `initiatives.start_date` or `initiatives.end_date`.

## Parking lot

The parking lot is a left-side panel containing unmapped initiatives.

It should support:

- search by initiative name,
- category filter,
- type filter: idea/project/habit,
- status filter: active/paused/completed/archived,
- hide archived by default unless the app convention differs,
- drag from parking lot to canvas.

On drop:

1. create a `planning_canvas_nodes` row,
2. set `canvas_id`, likely default `1`,
3. set `initiative_id`,
4. persist `x` and `y`,
5. remove the item from the parking lot list.

## Relationship lines

Relationship lines should render only when both related initiatives are visible on the canvas.

### Parent-child

Source:

```text
initiatives.parent_id
```

Style:

- neutral line,
- no arrow,
- visually distinct from dependency arrows.

### Predecessor-successor

Source:

```text
initiative_relations.predecessor_initiative_id
initiative_relations.successor_initiative_id
```

Style:

- directional arrow from predecessor to successor,
- visually distinct from parent-child lines.

## Relationship toggles

Top toolbar should include a way to show/hide relationship lines.

Minimum:

```text
[Show relationships]
```

Better:

```text
Show:
[x] Parent-child
[x] Precedes arrows
```

## Selection behavior

Clicking a card:

- selects the node,
- opens the inspector/details panel,
- highlights the selected card.

Nice-to-have:

- highlight direct parent,
- highlight direct children,
- highlight direct predecessors,
- highlight direct successors,
- fade unrelated nodes.

## Inspector/details panel

Clicking an initiative opens a panel with:

- `name`,
- category emoji/name/color,
- type,
- status,
- start/end dates,
- summary,
- markdown preview or link to existing editor,
- parent initiative,
- child initiatives,
- predecessors,
- successors,
- tasks.

Task display:

- show open/done counts,
- list tasks sorted by `sort_order`,
- show task `title`, `status`, `priority`, `due_at`,
- avoid making tasks full canvas nodes in MVP.

Editing may be read-only in MVP if editing is not trivial.

## Empty state

If no nodes are placed on the canvas, show:

```text
Start planning by dragging initiatives from the parking lot onto the timeline.
```

The time grid should still be visible.

## Visual language

Recommended encoding:

```text
Idea      = lightbulb/icon/label
Project   = project/folder/flag icon/label
Habit     = repeat/loop icon/label
```

Category:

```text
category.color = accent stripe/badge
category.emoji = compact recognizable marker
category.name  = readable context label
```

Status:

```text
active    = normal/emphasized
paused    = muted/paused indicator
completed = completed/check treatment
archived  = hidden by default or heavily muted
```

Relationship styles:

```text
Parent-child          = neutral line, no arrow
Predecessor-successor = arrow line
```

Do not rely only on color. Use labels, icons, and line style.


---

# File: docs/planning-canvas/06-implementation-phases.md


# Implementation Phases

## Phase 0: Inspect existing codebase

Before coding, inspect:

- frontend framework,
- routing,
- data fetching,
- state management,
- database/schema layer,
- existing repository conventions,
- existing API/tool conventions,
- existing initiative model,
- existing category model,
- existing task model,
- existing relationship fields,
- existing drag-and-drop or canvas libraries,
- existing UI component system,
- existing date utilities.

Required files to inspect:

```text
data/schema.sql
src/repositories/categories.ts
src/repositories/initiatives.ts
src/repositories/initiative-relations.ts
src/repositories/tasks.ts
src/tools/initiatives.ts
src/tools/initiative-relations.ts
src/chat/conversation-context.ts
tests/chat/context-schema-sync.test.ts
web/src/types.ts
web/src/App.tsx
```

Then produce a short technical plan before coding.

## Phase 1: Add schema and repository foundation

Add Planning Canvas persistence.

Preferred tables:

- `planning_canvases`
- `planning_canvas_nodes`

Use `planning_canvas_nodes.initiative_id` as a real foreign key to `initiatives(id)` for v1.

Add repository functions for:

- ensuring default canvas,
- listing canvas nodes,
- creating a canvas node,
- updating node position,
- deleting a node if needed,
- listing unmapped initiatives.

Update types in:

```text
web/src/types.ts
```

Update or explicitly account for schema context sync:

```text
src/chat/conversation-context.ts
tests/chat/context-schema-sync.test.ts
```

Recommended: do not include raw coordinates in ordinary conversation context by default.

## Phase 2: Create Planning Canvas route and shell

Add a new route/view, suggested:

```text
/planning-canvas
```

Create the layout:

- top toolbar,
- left parking lot panel,
- main canvas area,
- optional right inspector panel.

Do not implement all behavior yet. First make the view render reliably.

## Phase 3: Implement time-grid canvas background

Create the central canvas area.

Requirements:

- horizontally oriented time grid,
- month labels,
- week subdivisions,
- default viewport around current month,
- basic pan/zoom if the chosen library supports it,
- `Today` action if straightforward.

## Phase 4: Render draggable initiative cards

For all placed initiative nodes:

- fetch/join the related initiative,
- fetch/join the category,
- compute child count,
- compute task count,
- render a card at the stored x/y position,
- allow dragging,
- persist x/y after drag,
- keep minimum readable width.

Card should show:

- initiative `name`,
- category emoji/color/name,
- type,
- status,
- date range,
- child count,
- task count.

Do not show initiative priority unless the codebase has an initiative priority field outside the model overview.

## Phase 5: Implement parking lot

Show initiatives without a canvas node in the left panel.

Requirements:

- list unmapped initiatives,
- search/filter by name,
- filter by category,
- filter by type,
- filter by status,
- hide archived by default unless app convention differs,
- drag initiative onto canvas,
- create canvas node on drop,
- remove from parking lot after placement.

## Phase 6: Implement relationship lines

Derive edges from existing data.

Parent-child:

- if `child.parent_id` references another visible initiative, render a parent-child line.

Predecessor-successor:

- use `initiative_relations`,
- render arrow from `predecessor_initiative_id` to `successor_initiative_id`,
- only render if both nodes are visible.

Add toolbar toggle to show/hide relationship lines.

## Phase 7: Implement inspector/details panel

On card click:

- set selected node,
- open details panel,
- show initiative metadata and relationships.

Fields:

- name,
- category,
- type,
- status,
- dates,
- summary,
- markdown preview/link,
- parent,
- children,
- predecessors,
- successors,
- tasks.

Read-only is acceptable for MVP.

## Phase 8: Add snapping and polish

Add:

- horizontal snapping to week or month grid,
- selected-node styling,
- empty state,
- fit-to-content if straightforward,
- loading states,
- error states,
- relationship visibility toggle,
- basic filters,
- archived visibility behavior.

## Phase 9: Test and validate

Validate with example scenarios.

### Scenario A: Idea to implementation chain

```text
Idea → Planning Project → Implementation Project
```

Expected:

- all three appear as cards when placed,
- arrows show sequence via `initiative_relations`,
- dragging persists positions.

### Scenario B: South America trip hierarchy

```text
South America Trip
├── Beach Holiday
├── Backpacking
└── Meditation Retreat
```

Expected:

- parent-child lines render via `initiatives.parent_id`,
- child initiatives remain separately draggable,
- inspector shows child count and relationships.

### Scenario C: Parking lot

Expected:

- unmapped initiatives appear in the parking lot,
- dragging one to the canvas creates a node,
- reload preserves the node,
- item no longer appears as unmapped.

### Scenario D: Categories

Expected:

- initiative cards show category emoji/color/name,
- parking lot can filter by category,
- category context does not force swimlanes in MVP.

### Scenario E: Context schema sync

Expected:

- schema sync test is updated intentionally,
- context resolver either excludes planning canvas layout with rationale or includes a compact context-safe summary.


---

# File: docs/planning-canvas/07-acceptance-criteria.md


# Acceptance Criteria

The Planning Canvas v1 is complete when the following are true.

## Schema and repository

- [ ] `data/schema.sql` or the project migration system includes Planning Canvas persistence.
- [ ] A default planning canvas can be created or ensured.
- [ ] Canvas nodes are persisted with a real link to `initiatives(id)`.
- [ ] Canvas node position is stored separately from initiative domain data.
- [ ] Repository/API access follows existing project patterns.
- [ ] Direct durable state mutation outside repositories/API/tools is avoided.
- [ ] Schema context sync is intentionally handled in `src/chat/conversation-context.ts` and `tests/chat/context-schema-sync.test.ts`.

## Canvas view

- [ ] User can open the Planning Canvas route/view.
- [ ] The view contains a top toolbar, left parking lot, and central canvas.
- [ ] The canvas shows a horizontal time-grid background.
- [ ] Month labels are visible.
- [ ] Week subdivisions are visible or otherwise represented.
- [ ] The default viewport opens around the current month.
- [ ] User can pan around the canvas.
- [ ] User can zoom in/out, if supported by the chosen canvas implementation.

## Canvas nodes

- [ ] Placed initiatives render as cards on the canvas.
- [ ] Each card is associated with a persisted `planning_canvas_nodes` row.
- [ ] Card x/y position is stored separately from `initiatives.start_date` and `initiatives.end_date`.
- [ ] Dragging a card updates the canvas node position.
- [ ] Position persists after reload.
- [ ] Cards have a minimum readable width.
- [ ] Short-duration initiatives do not become unreadably narrow.

## Initiative card content

Each initiative card shows available fields:

- [ ] `initiatives.name`,
- [ ] `initiatives.type`,
- [ ] `initiatives.status`,
- [ ] category emoji/name/color accent,
- [ ] `start_date` / `end_date` if present,
- [ ] child count,
- [ ] task count.

Do not show initiative priority unless the codebase has an initiative priority field outside the model overview.

## Parking lot

- [ ] Parking lot lists initiatives that do not have a canvas node.
- [ ] User can search/filter the parking lot by initiative name.
- [ ] User can filter by category.
- [ ] User can filter by initiative type.
- [ ] User can filter by status.
- [ ] Archived initiatives are hidden by default or handled consistently with the existing app convention.
- [ ] User can drag an initiative from the parking lot onto the canvas.
- [ ] Dropping creates a persisted canvas node.
- [ ] The initiative is removed from the parking lot after placement.
- [ ] Reloading preserves the placement.

## Relationships

- [ ] Parent-child relationships render from `initiatives.parent_id` between visible initiatives.
- [ ] Predecessor-successor relationships render from `initiative_relations` between visible initiatives.
- [ ] Arrows point from `predecessor_initiative_id` to `successor_initiative_id`.
- [ ] Parent-child lines are visually different from predecessor-successor arrows.
- [ ] Relationship lines are only rendered when both related nodes are visible.
- [ ] User can show/hide relationship lines.
- [ ] Selecting a node makes its relationships easier to identify, if feasible.

## Inspector

- [ ] Clicking a card opens an inspector/details panel.
- [ ] Inspector shows initiative name.
- [ ] Inspector shows category.
- [ ] Inspector shows initiative type.
- [ ] Inspector shows status.
- [ ] Inspector shows dates if available.
- [ ] Inspector shows summary if available.
- [ ] Inspector shows markdown preview or link if feasible.
- [ ] Inspector shows parent if available.
- [ ] Inspector shows children if available.
- [ ] Inspector shows predecessors/successors if available.
- [ ] Inspector shows tasks if available.
- [ ] Task list shows task title, status, priority, and due date if available.

## Empty state

- [ ] If no nodes are placed, the time grid still renders.
- [ ] Empty state text guides the user to drag initiatives from the parking lot.

## Non-goals validated

- [ ] Moving a card does not silently update actual initiative `start_date` or `end_date` in MVP.
- [ ] Full nested containers are not required.
- [ ] Parent reassignment by dragging is not required.
- [ ] Relationship creation by dragging handles is not required.
- [ ] Full task canvas mapping is not required.
- [ ] Complex Gantt behavior is not required.
- [ ] Formal soft/hard date schema is not required.


---

# File: docs/planning-canvas/08-open-questions.md


# Open Questions

These decisions should be resolved as implementation proceeds. They should not block the first technical spike unless they affect schema or repository design.

## Product behavior

1. Should the app support one global Planning Canvas or multiple named canvases?

2. Should horizontal card movement eventually update actual initiative dates?

3. Should date-linking be explicit per node?

4. Does the product need a formal date mode field later, such as:

```ts
"none" | "soft" | "hard"
```

5. Should tasks appear on the canvas by default later, or only when manually promoted from an initiative details panel?

6. Should child initiatives eventually appear inside parent initiative containers?

7. Should predecessor/successor relationships be editable from the canvas, or only displayed in v1?

8. Should new relationships be creatable by dragging handles between cards?

9. Should category swimlanes exist later, or should categories remain visual accents and filters?

## Technical

1. What canvas/diagram library best fits the existing frontend stack?

2. Does the project already use a drag-and-drop library?

3. Does the app already have a database migration system, or is `data/schema.sql` the canonical schema setup path?

4. How are frontend data calls structured from `web/src/App.tsx` today?

5. Are predecessor/successor relationships available through an existing API endpoint/tool for the web UI, or only repository/tool code?

6. Does the current UI already compute child/task counts, or should the Planning Canvas repository return them in joined queries?

7. Should raw canvas coordinates ever be shown to the chat agent in `conversation-context.ts`?

8. Should the canvas work on mobile, or is desktop the primary target for v1?

## Recommended default decisions for MVP

Use these defaults unless the codebase suggests a better option:

- one default canvas,
- initiative nodes only,
- tasks shown in inspector only,
- parent-child and predecessor-successor lines displayed but not editable,
- canvas position stored separately from initiative data,
- dragging updates canvas node position only,
- no automatic date mutation,
- no nested containers,
- no auto-layout,
- categories used as badges/filters/accents,
- archived initiatives hidden by default,
- raw canvas coordinates excluded from ordinary conversation context.


---

# File: docs/planning-canvas/09-coding-agent-prompt-sequence.md


# Coding Agent Prompt Sequence

Use these prompts to keep implementation controlled.

## Prompt 1: inspect and plan only

```text
Read docs/planning-canvas/00-coding-agent-entry-prompt.md first.

Then read the rest of docs/planning-canvas/.

Inspect the existing codebase, especially:

data/schema.sql
src/repositories/categories.ts
src/repositories/initiatives.ts
src/repositories/initiative-relations.ts
src/repositories/tasks.ts
src/tools/initiatives.ts
src/tools/initiative-relations.ts
src/chat/conversation-context.ts
tests/chat/context-schema-sync.test.ts
web/src/types.ts
web/src/App.tsx

Do not code yet.

Return a concrete implementation plan listing files/components to create or modify, schema changes, repository/API changes, frontend changes, context resolver/test impact, risks, assumptions, and the first implementation phase.
```

## Prompt 2: schema and repository foundation

```text
Implement Phase 1 from docs/planning-canvas/06-implementation-phases.md.

Add Planning Canvas persistence using the existing schema/repository conventions.

Prefer planning_canvases and planning_canvas_nodes, with planning_canvas_nodes.initiative_id as a real FK to initiatives(id) for v1.

Add repository functions for default canvas, list nodes, create node, update position, delete node if needed, and list unmapped initiatives.

Update web/src/types.ts as needed.

Handle src/chat/conversation-context.ts and tests/chat/context-schema-sync.test.ts intentionally. Do not dump raw x/y coordinates into ordinary conversation context unless the existing architecture requires it.

Run relevant tests.
```

## Prompt 3: route and layout shell

```text
Implement Phase 2 from docs/planning-canvas/06-implementation-phases.md.

Create the Planning Canvas route/view and layout shell: top toolbar, left parking lot, central canvas area, and optional inspector panel placeholder.

Reuse existing UI conventions. Do not implement complex canvas behavior yet.
```

## Prompt 4: time-grid canvas

```text
Implement Phase 3 from docs/planning-canvas/06-implementation-phases.md.

Add the horizontal time-grid canvas background with month labels and week subdivisions. The default viewport should open around the current month.

Add basic pan/zoom only if this fits the chosen implementation/library cleanly.
```

## Prompt 5: draggable initiative cards

```text
Implement Phase 4 from docs/planning-canvas/06-implementation-phases.md.

Render placed initiatives as draggable cards using planning_canvas_nodes. Cards should show initiative name, category emoji/color/name, type, status, date range, child count, and task count.

Dragging must update planning_canvas_nodes.x/y only. Do not mutate initiatives.start_date or initiatives.end_date.

Persist positions and verify they survive reload.
```

## Prompt 6: parking lot

```text
Implement Phase 5 from docs/planning-canvas/06-implementation-phases.md.

Add the parking lot for initiatives that do not yet have a canvas node. Include search, category filter, type filter, and status filter. Hide archived by default unless the existing app convention differs.

Dragging an initiative from the parking lot to the canvas should create a planning_canvas_nodes row and remove it from the parking lot.
```

## Prompt 7: relationship lines

```text
Implement Phase 6 from docs/planning-canvas/06-implementation-phases.md.

Render parent-child lines from initiatives.parent_id and predecessor-successor arrows from initiative_relations.

Only render relationships where both initiatives are visible on the canvas.

Use visually distinct styles for hierarchy lines and precedes arrows. Add a show/hide relationships toggle.
```

## Prompt 8: inspector

```text
Implement Phase 7 from docs/planning-canvas/06-implementation-phases.md.

Clicking a card should open an inspector showing name, category, type, status, dates, summary, markdown preview/link, parent, children, predecessors, successors, and tasks.

Task rows should show title, status, priority, and due_at when available.

Read-only is acceptable for MVP unless existing edit components are easy to reuse.
```

## Prompt 9: polish and validation

```text
Implement Phases 8 and 9 from docs/planning-canvas/06-implementation-phases.md.

Add snapping, selected-node styling, empty state, loading/error states, filter polish, and relationship visibility behavior.

Then validate the implementation against docs/planning-canvas/07-acceptance-criteria.md and report which criteria pass or remain incomplete.
```
