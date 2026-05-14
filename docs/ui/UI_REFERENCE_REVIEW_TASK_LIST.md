# DMAX UI Reference Review: Task List

## 1. Executive Summary

Phase 20 migrated `/tasks` to the canonical DMAX entity list-page pattern validated by `/categories`, `/people`, `/organizations`, `/projects`, `/ideas` and `/habits`.

The task list is now a scan-first operational action collection. It no longer uses the older task-row styling as the route default. Instead, it uses the shared list primitives, keeps task titles as the primary row content, shows status, priority, due date and parent context as compact secondary information, preserves simple search, keeps destructive actions subtle, and moves list-level task creation into a contained `EditModal`.

Readiness status: **Ready as canonical task/action list reference**.

Recommended next phase: run a consolidation/review pass across all canonical list pages before moving into calendar/timeline/planning, utility/debug surfaces or broader `App.tsx` cleanup.

## 2. Current State Before Migration

Before Phase 20, `/tasks` used the older `TasksView` route rendering:

- task rows used `task-row` styling rather than the canonical list row;
- there was no list-page search toolbar;
- status, due date, parent context and priority were visible, but priority used raw values such as `normal`;
- destructive delete buttons were persistently visible on each row;
- the page had no contained list-level create action;
- the DMAX drawer used generic route behavior rather than a list-safe route class.

The old route was functional, but it felt like an older operational row list rather than a canonical scan-first entity list.

## 3. What Changed In Phase 20

- Added a `/tasks`-specific canonical list view while leaving the initiative-detail task section behavior intact.
- Added a page-level `Maßnahme hinzufügen` action.
- Added `TaskCreateModal` using the existing `EditModal` primitive.
- Preserved task creation through the existing API and required parent initiative context.
- Added simple frontend search for task title, notes, status, priority, due date, parent initiative and category.
- Rendered the task collection through `EntityListPage`, `EntityList` and `EntityListItem`.
- Extended `EntityListItem` narrowly so rows can combine an openable main area with calm row actions.
- Kept task titles as primary row content.
- Showed status, priority and due date in the same hierarchy as the canonical task detail header.
- Showed parent initiative and category as compact context.
- Kept status toggle and delete behavior, but moved them into calmer row action placement.
- Added collection empty state.
- Added drawer-safe `/tasks` route behavior so the DMAX drawer does not squeeze rows into unreadable columns.

## 4. Shared Primitives

Shared primitives reused:

- `EntityListPage`
- `EntityList`
- `EntityListItem`
- `EmptyState`
- `ErrorState`
- `EditModal`
- `ConfirmModal`

Shared primitive extended:

- `EntityListItem` now supports a separate leading action and row actions while keeping the main row content openable. This was needed for task rows because status completion is a useful row-level action, while the title/content area should still open `/tasks/:id`.

## 5. Task / Action List Notes

Tasks differ from projects, ideas and habits in three ways:

- they are smaller operational objects, so the title must stay dominant and row density must remain compact;
- status, priority and due date are important but secondary to the title, matching the `/tasks/:id` header hierarchy;
- parent initiative/category context is useful for orientation, but the list avoids becoming a project board or planner.

This phase intentionally does **not** add kanban, sprint, calendar, recurring-task or automation behavior.

## 6. Alignment With `/tasks/:id`

The list follows the accepted task detail hierarchy:

- task title first;
- status second;
- priority third;
- due date last in the task fact sequence;
- parent context is present but not promoted above the title;
- due dates use readable date formatting without artificial trailing punctuation.

Opening a row navigates to `/tasks/:id`, preserving the canonical task detail page as the primary place for notes, checklist, participants, media and detailed editing.

## 7. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/reference-task-list/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-task-list-before-or-current.png` | Pre-migration tasks list from current screenshot inventory | captured |
| `02-task-list-after-migration.png` | New scan-first task list with page action and search | pass |
| `03-task-list-item-density.png` | Compact row density, status/priority/due date and parent context | pass |
| `04-task-list-empty-state.png` | Full collection empty state using an intercepted empty tasks response | pass |
| `05-task-list-create-action.png` | Page-level create action opens contained `EditModal` | pass |
| `06-task-list-narrow-viewport.png` | Narrow viewport stacking and readable task rows | pass |
| `07-task-list-dmax-drawer-safe.png` | DMAX drawer opens without making the list unreadable | pass |

## 8. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 28 test files / 115 tests.

## 9. Review Notes

### Page Header

Status: pass.

The page title is simply `Maßnahmen`, with no decorative icon and no redundant explanatory subtitle. The primary create action is visible but calm.

### Search

Status: pass.

Search remains a small list toolbar. It searches task title, notes, status, priority, due date and parent context without introducing a broad filtering surface.

### List Rows

Status: pass.

Each row shows the task title first. Secondary information is limited to status, priority, due date and parent initiative/category context. Internal IDs and debug metadata are not shown.

### Creation

Status: pass.

The create form is hidden by default. `Maßnahme hinzufügen` opens a compact modal with parent context, title, priority and optional due date, then navigates to the new task detail page after successful creation.

### Empty State

Status: pass.

The empty state is a collection-page empty state, so `EmptyState` is appropriate. It was captured by intercepting the overview response rather than mutating local data.

### Drawer

Status: pass.

The `/tasks` route now uses drawer-safe list behavior. Opening the DMAX drawer keeps the list readable.

## 10. Known Limitations

- `/api/app/overview` currently provides open tasks only, so the default `/tasks` list is effectively an open-task list. Completed task archive/list filtering remains outside this phase.
- Checklist progress is not shown because the overview data does not include checklist counts and no per-row enrichment was added.
- Search is frontend-only. No reusable `SearchFilterRow` primitive was extracted in this phase.
- The create modal uses the browser-native date input, whose placeholder/chrome is browser-controlled.

## 11. Readiness Judgment

`/tasks` is **Ready as canonical task/action list reference**.

It validates the list-page pattern for small operational action objects without changing schema, backend APIs or dependencies.

## 12. Recommended Next Phase

Run a list-page consolidation/review pass across:

- `/categories`
- `/people`
- `/organizations`
- `/projects`
- `/ideas`
- `/habits`
- `/tasks`

Use that pass to align minor row/action/search differences before moving into calendar/timeline/planning, config/prompts/debug views or broader `App.tsx` cleanup.
