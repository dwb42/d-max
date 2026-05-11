# Acceptance Criteria

The Planning Canvas v1 is complete when the following are true.

Current implementation note: these criteria describe the original v1 target.
The current implemented MVP is documented in `docs/current-state.md` and has
resolved differences: project-only canvas, no right inspector, no relationship
visibility toggles, card click opens project detail in a new tab, and hidden
side handles create predecessor/successor projects.

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
