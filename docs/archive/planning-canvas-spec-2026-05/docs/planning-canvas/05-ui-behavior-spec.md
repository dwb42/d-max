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

Current implementation note: d-max currently shows parent-child and
predecessor-successor relationship lines permanently on the Planning Canvas.
There are no relation visibility toggles in the implemented UI.

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

Current implementation note: clicking a project card opens the project detail
route in a new browser tab. A pencil button on the card opens a compact edit
modal for key project fields. There is no right-side inspector panel in the
implemented Planning Canvas.

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
