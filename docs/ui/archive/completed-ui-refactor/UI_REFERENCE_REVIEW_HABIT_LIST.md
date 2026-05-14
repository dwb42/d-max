# DMAX UI Reference Review: Habit List

## 1. Executive Summary

Phase 19 migrated `/habits` to the canonical DMAX entity list-page pattern validated by `/categories`, `/people`, `/organizations`, `/projects` and `/ideas`.

The habit list is now a scan-first routine-oriented collection. It no longer uses the older category work-board with a permanent inline create form. Instead, it uses the shared list primitives, keeps habit names as the primary row content, shows status and life area as compact secondary information, preserves simple search, and moves habit creation into a contained `EditModal`.

Readiness status: **Ready as canonical habit/routine list reference**.

Recommended next phase: migrate `/tasks` using `/projects`, `/ideas`, `/habits` and `/tasks/:id` as action-object references.

## 2. Current State Before Migration

Before Phase 19, `/habits` used the older `InitiativesView` implementation:

- a full habit creation form was visible by default;
- habits were grouped by category in a route-local work-board layout;
- category drag/reorder behavior belonged to the old board pattern;
- habit rows used `initiative-row` styling rather than the canonical list row;
- the page felt closer to an input/work board than a scan-first collection;
- the DMAX drawer used generic collection-route behavior rather than a list-safe route class.

The old route was functional, but it was too form-first and board-like for a routine-oriented list page.

## 3. What Changed In Phase 19

- Added a `/habits`-specific canonical list view while leaving `/tasks` untouched.
- Replaced the always-visible habit create form with a page-level `Gewohnheit hinzufügen` action.
- Added `HabitCreateModal` using the existing `EditModal` primitive.
- Preserved habit creation fields: category and name.
- Added simple frontend search for habit name, summary/context, status and category.
- Rendered habits through `EntityListPage`, `EntityList` and `EntityListItem`.
- Kept habit names as primary row content.
- Added subtle initials plus category color as data-backed row identity markers.
- Showed status and category as compact secondary row context.
- Kept optional task count visible only when a habit already has measures attached.
- Added collection and filtered-category empty states.
- Added drawer-safe `/habits` route behavior so the DMAX drawer does not squeeze rows into unreadable columns.

## 4. Shared Primitives

Shared primitives reused:

- `EntityListPage`
- `EntityList`
- `EntityListItem`
- `EmptyState`
- `ErrorState`
- `EditModal`

No shared list primitive was extended in this phase. The existing row shape handled routine-oriented objects without a new abstraction.

## 5. Habit / Routine List Notes

Habits differ from projects and ideas in three ways:

- they are ongoing/routine-oriented, so the list should feel lighter than a project list and less exploratory than an idea list;
- task counts appear only when tasks already exist, rather than making every habit look like a tracker;
- status and life area are enough to orient the current list because habit frequency and recurrence semantics are not fully developed yet.

This phase intentionally does **not** add frequency, streak, recurrence, completion scoring or tracker behavior.

## 6. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/reference-habit-list/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-habit-list-before-or-current.png` | Pre-migration habits list from current screenshot inventory | captured |
| `02-habit-list-after-migration.png` | New scan-first habit list with page action and search | pass |
| `03-habit-list-item-density.png` | Compact row density, status/category and optional task count | pass |
| `04-habit-list-empty-state.png` | Full collection empty state using an intercepted empty habits response | pass |
| `05-habit-list-create-action.png` | Page-level create action opens contained `EditModal` | pass |
| `06-habit-list-narrow-viewport.png` | Narrow viewport stacking and readable habit rows | pass |
| `07-habit-list-dmax-drawer-safe.png` | DMAX drawer opens without making the list unreadable | pass |

## 7. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 27 test files / 112 tests.

## 8. Review Notes

### Page Header

Status: pass.

The page title is simply `Gewohnheiten`, with no decorative icon and no redundant explanatory subtitle. The primary create action is visible but calm.

### Search

Status: pass.

Search remains a small list toolbar. It searches habit name, summary/context, status and category without introducing complex filters.

### List Rows

Status: pass.

Each row shows the habit name first. Secondary information is limited to status, category, short context where it is not merely the title, and task count only when present. Internal IDs and debug metadata are not shown.

### Creation

Status: pass.

The create form is hidden by default. `Gewohnheit hinzufügen` opens a compact modal and successful creation navigates to the new habit detail page.

### Empty State

Status: pass.

The empty state is a collection-page empty state, so `EmptyState` is appropriate. It was captured by intercepting the overview response rather than mutating local data.

### Drawer

Status: pass.

The `/habits` route now uses drawer-safe list behavior. Opening the DMAX drawer keeps the list readable.

## 9. Known Limitations

- Habit frequency, streak, recurrence and completion semantics are intentionally deferred because the current data model and deterministic agent behavior do not yet support them as a stable product concept.
- Search is frontend-only. No reusable `SearchFilterRow` primitive was extracted in this phase.
- The local fixture data has a small habit set, so very dense habit-list behavior was not stress-tested.
- `/tasks` remains the last unmigrated action/list route in this sequence.

## 10. Readiness Judgment

`/habits` is **Ready as canonical habit/routine list reference**.

It validates the list-page pattern for routine-oriented planning objects without changing schema, backend APIs or dependencies.

## 11. Recommended Next Phase

Migrate `/tasks` next.

Use:

- `/projects` for action/planning row state and compact task/count handling;
- `/ideas` for lighter action-object density;
- `/habits` for routine/action list density;
- `/tasks/:id` for the task action-object detail reference.

Do not redesign calendar, timeline or planning canvas as part of the task list migration.
