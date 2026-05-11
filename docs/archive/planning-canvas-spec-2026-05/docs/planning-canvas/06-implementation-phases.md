# Implementation Phases

Current implementation note: the Planning Canvas MVP has already shipped with a
narrower project-only scope and some deviations from this original phase plan.
Before continuing implementation, read `docs/current-state.md` and
`08-open-questions.md` for the resolved decisions.

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
