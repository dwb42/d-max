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

Current implementation note: the implemented MVP is project-only. The Planning
Canvas renders and parks initiatives with `type = project`; idea and habit
initiatives are excluded from this view.

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

Current implementation note: the implemented MVP does not have a right-side
details panel. Project cards open the project detail page in a new tab, and a
card pencil button opens a compact edit modal.

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

Current implementation note: relation creation by freeform connector dragging is
still not implemented. The current canvas does support a narrower flow: hidden
left/right side handles create a new predecessor/successor project, persist the
`precedes` relation, and place the new project card next to the anchor.

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
