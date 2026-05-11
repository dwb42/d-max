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
