# Coding Agent Prompt Sequence

Use these prompts to keep implementation controlled.

Current implementation note: these prompts are the original build sequence.
For follow-up work, first inspect `docs/current-state.md` and
`08-open-questions.md`; the shipped MVP is project-only and differs from some
older inspector/toggle assumptions below.

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
