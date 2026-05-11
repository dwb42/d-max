# Open Questions

These decisions should be resolved as implementation proceeds. They should not block the first technical spike unless they affect schema or repository design.

## Current implementation decisions

As of the current d-max implementation, the MVP has resolved several of these
questions:

- one global/default canvas is implemented,
- the canvas is project-only (`type = project`) for both placed timelines and the
  parking lot,
- placed projects are rendered as timeline bars/markers rather than full cards,
- timeline bar horizontal position is derived from `start_date`/`end_date`;
  persisted canvas node `y` controls the visual row,
- dragging a normal timeline bar horizontally updates project dates by whole
  days, while group vertical moves update only `planning_canvas_nodes.y`,
- zoom changes the visual time-axis scale and horizontal spacing only,
- parent-child and predecessor/successor relationships are always shown when
  both endpoint projects are placed,
- predecessor/successor projects can be created from hidden left/right side
  handles on a timeline bar,
- clicking a placed timeline opens the project detail page in a new tab,
- the canvas has a compact edit modal for key project fields,
- `project_phase` controls a planning-vs-doing visual treatment; planning bars
  render lighter than doing bars,
- completed and archived projects are hidden in the unplaced parking lot but
  remain visible once placed on the canvas,
- completed placed projects render muted with a strike-through label,
- parent-only groups can move up/down together by dragging the parent timeline;
  groups with predecessor/successor links move up/down together by dragging a
  predecessor/successor line,
- ordinary conversation context receives only a compact canvas summary, not raw
  coordinates.

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
- project initiative timelines only,
- tasks are not rendered as canvas objects,
- parent-child and predecessor-successor lines displayed without visibility toggles,
- predecessor/successor project creation available through timeline side handles,
- canvas position stored separately from initiative data,
- timeline bar dragging is allowed to update project dates explicitly,
- group vertical dragging updates only canvas node row positions,
- no nested containers,
- no auto-layout,
- categories used as filters and card metadata,
- archived initiatives hidden by default,
- raw canvas coordinates excluded from ordinary conversation context.
