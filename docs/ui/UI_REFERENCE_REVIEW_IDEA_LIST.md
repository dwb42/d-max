# DMAX UI Reference Review: Idea List

## 1. Executive Summary

Phase 18 migrated `/ideas` to the canonical DMAX entity list-page pattern validated by `/categories`, `/people`, `/organizations` and `/projects`.

The idea list now behaves as a scan-first exploratory collection. It no longer uses the older category work-board with a permanent inline create form. Instead, it uses the shared list primitives, keeps idea names as the primary row content, shows category and status as compact secondary information, preserves a simple search affordance, and moves idea creation into a contained `EditModal`.

Readiness status: **Ready as canonical exploratory/action list reference**.

Recommended next phase: migrate `/habits` using `/projects` and `/ideas` as action/planning references while respecting habit-specific recurrence semantics.

## 2. Current State Before Migration

Before Phase 18, `/ideas` used the older `InitiativesView` implementation:

- a full idea creation form was visible by default;
- ideas were grouped by category in a route-local work-board layout;
- category drag/reorder behavior belonged to the old board pattern;
- idea rows used `initiative-row` styling rather than the canonical list row;
- the page felt closer to an input/work board than a scan-first collection;
- the DMAX drawer used generic collection-route behavior rather than a list-safe route class.

The old route was functional, but it was too form-first and board-like for an exploratory list page.

## 3. What Changed In Phase 18

- Added a `/ideas`-specific canonical list view while leaving `/habits` on the existing implementation.
- Replaced the always-visible idea create form with a page-level `Idee hinzufügen` action.
- Added `IdeaCreateModal` using the existing `EditModal` primitive.
- Preserved idea creation fields: category and name.
- Added simple frontend search for idea name, summary/context, status and category.
- Rendered ideas through `EntityListPage`, `EntityList` and `EntityListItem`.
- Kept idea names as primary row content.
- Added subtle initials plus category color as data-backed row identity markers.
- Showed status and category as compact secondary row context.
- Kept optional task count visible only when an idea already has measures attached.
- Added collection and filtered-category empty states.
- Added drawer-safe `/ideas` route behavior so the DMAX drawer does not squeeze rows into unreadable columns.

## 4. Shared Primitives

Shared primitives reused:

- `EntityListPage`
- `EntityList`
- `EntityListItem`
- `EmptyState`
- `ErrorState`
- `EditModal`

No shared list primitive was extended in this phase. The existing row shape handled exploratory objects without a new abstraction.

## 5. Exploratory List Notes

Ideas differ from projects in three ways:

- they are lighter and less committed, so the list does not show project phase or date range by default;
- task counts appear only when tasks already exist, rather than making every idea look execution-heavy;
- category and status are enough to orient the exploratory state without adding scoring or prioritization.

The list intentionally avoids inventing maturity scoring, conversion state or progress indicators that are not part of the current data model.

## 6. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/reference-idea-list/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-idea-list-before-or-current.png` | Pre-migration ideas list from current screenshot inventory | captured |
| `02-idea-list-after-migration.png` | New scan-first idea list with page action and search | pass |
| `03-idea-list-item-density.png` | Compact row density, status/category and short context | pass |
| `04-idea-list-empty-state.png` | Full collection empty state using an intercepted empty ideas response | pass |
| `05-idea-list-create-action.png` | Page-level create action opens contained `EditModal` | pass |
| `06-idea-list-narrow-viewport.png` | Narrow viewport stacking and readable idea rows | pass |
| `07-idea-list-dmax-drawer-safe.png` | DMAX drawer opens without making the list unreadable | pass |

## 7. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 27 test files / 112 tests.

## 8. Review Notes

### Page Header

Status: pass.

The page title is simply `Ideen`, with no decorative icon and no redundant explanatory subtitle. The primary create action is visible but calm.

### Search

Status: pass.

Search remains a small list toolbar. It searches idea name, summary/context, status and category without introducing complex filters.

### List Rows

Status: pass.

Each row shows the idea name first. Secondary information is limited to status, category, short context and task count only when present. Internal IDs and debug metadata are not shown.

### Creation

Status: pass.

The create form is hidden by default. `Idee hinzufügen` opens a compact modal and successful creation navigates to the new idea detail page.

### Empty State

Status: pass.

The empty state is a collection-page empty state, so `EmptyState` is appropriate. It was captured by intercepting the overview response rather than mutating local data.

### Drawer

Status: pass.

The `/ideas` route now uses drawer-safe list behavior. Opening the DMAX drawer keeps the list readable.

## 9. Known Limitations

- Idea maturity, conversion-to-project state and prioritization are not available in the current list data, so they are not shown.
- Search is frontend-only. No reusable `SearchFilterRow` primitive was extracted in this phase.
- The local fixture data has only a few ideas, so dense idea-list behavior was not stress-tested.
- `/habits` and `/tasks` list pages remain unmigrated.

## 10. Readiness Judgment

`/ideas` is **Ready as canonical exploratory/action list reference**.

It validates the list-page pattern for lightweight exploratory planning objects without changing schema, backend APIs or dependencies.

## 11. Recommended Next Phase

Migrate `/habits` next.

Use:

- `/projects` for action/planning list structure;
- `/ideas` for lighter exploratory object density;
- `/categories` for general list-page structure.

Do not migrate `/tasks` in the same phase. Habit recurrence/frequency semantics should be handled deliberately rather than copied from projects.
