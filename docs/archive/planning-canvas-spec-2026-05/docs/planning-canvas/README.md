# Planning Canvas Spec Pack v2 — d-max Model-Aligned

This folder contains the implementation specification for the new **Planning Canvas** feature, updated to match the current d-max SQLite data model for categories, initiatives, initiative relationships, and tasks.

The Planning Canvas is a Miro-like, time-aware planning view for arranging initiatives over a soft timeline. It helps the user model hierarchy, sequencing, dependency, category context, and future planning intent in a more flexible way than a calendar or list.

## Current implementation note

The implemented d-max MVP has narrowed the canvas to projects only. It uses a
single default canvas, manual persisted `planning_canvas_nodes.x/y` positions,
a horizontal month grid with a red Today line, fixed-size project cards, and
zoom that changes only the time-axis scale. Parent-child lines and
predecessor/successor arrows render when both endpoint projects are placed.
Predecessor/successor projects can be created from hidden left/right side
handles on a project card. For the authoritative implemented state, read
`docs/current-state.md`.

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
