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
