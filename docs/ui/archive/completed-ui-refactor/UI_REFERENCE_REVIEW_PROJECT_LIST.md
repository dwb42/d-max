# DMAX UI Reference Review: Project List

## 1. Executive Summary

Phase 17 migrated `/projects` to the canonical DMAX entity list-page pattern validated by `/categories`, `/people` and `/organizations`.

The project list now behaves as the first scan-first action/planning collection. It no longer uses the old grouped project-structure board with a permanent inline create form. Instead, it uses the shared list primitives, keeps project names as the primary row content, shows status, phase, category, date range and task counts as compact secondary information, preserves a simple search affordance, and moves project creation into a contained `EditModal`.

Readiness status: **Ready as canonical project/action list reference**.

Recommended next phase: migrate `/ideas` or `/habits` using `/projects` as the action/planning list reference. `/ideas` is likely the simpler next migration.

## 2. Current State Before Migration

Before Phase 17, `/projects` used the older `InitiativesView` implementation:

- a full project creation form was visible by default;
- projects were grouped by category in a route-local board-like layout;
- project rows used `initiative-row` and `ProjectStructureCard` styling rather than the canonical list row;
- predecessor/successor and parent/child structure could make the list feel like a planning canvas rather than a scan page;
- status and task counts were visible, but labels were uneven and not aligned with the newer list references;
- the DMAX drawer used generic collection-route behavior rather than a list-safe route class.

The old route was functional, but it was too board-like and form-first for the canonical list-page language.

## 3. What Changed In Phase 17

- Added a `/projects`-specific canonical list view while leaving `/ideas` and `/habits` on the existing implementation.
- Replaced the always-visible project create form with a page-level `Projekt hinzufügen` action.
- Added `ProjectCreateModal` using the existing `EditModal` primitive.
- Preserved project creation fields: category, name, phase, start date and end date.
- Added simple frontend search for project name, summary/context, status, phase and category.
- Rendered projects through `EntityListPage`, `EntityList` and `EntityListItem`.
- Kept project names as primary row content.
- Added subtle initials plus category color as data-backed row identity markers.
- Showed status, phase, category and date range as compact secondary row context.
- Showed task counts as compact list stats: open, done and total measures.
- Added collection and filtered-category empty states.
- Added drawer-safe `/projects` route behavior so the DMAX drawer does not squeeze rows into unreadable columns.

## 4. Shared Primitives

Shared primitives reused:

- `EntityListPage`
- `EntityList`
- `EntityListItem`
- `EmptyState`
- `ErrorState`
- `EditModal`

No new shared list primitive was introduced. The existing list row primitive was sufficient for action/planning rows once project-specific meta and task stats were prepared in route-local helpers.

## 5. Action/Planning List Notes

Project rows differ from contact/context rows in three ways:

- state matters more, so status and phase are part of the compact meta line;
- time matters more, so the date range is shown when available;
- action load matters more, so open/done/total task counts are visible as row stats.

The list still avoids exposing all project metadata. Parent/child and predecessor/successor structure remain on project detail/planning surfaces rather than the default list page.

## 6. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/reference-project-list/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-project-list-before-or-current.png` | Pre-migration projects list from current screenshot inventory | captured |
| `02-project-list-after-migration.png` | New scan-first project list with page action and search | pass |
| `03-project-list-item-density.png` | Compact row density, status/phase/category/date and task stats | pass |
| `04-project-list-empty-state.png` | Full collection empty state using an intercepted empty projects response | pass |
| `05-project-list-create-action.png` | Page-level create action opens contained `EditModal` | pass |
| `06-project-list-narrow-viewport.png` | Narrow viewport stacking and readable project rows | pass |
| `07-project-list-dmax-drawer-safe.png` | DMAX drawer opens without making the list unreadable | pass |

## 7. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 27 test files / 112 tests.

## 8. Review Notes

### Page Header

Status: pass.

The page title is simply `Projekte`, with no decorative icon and no redundant explanatory subtitle. The primary create action is visible but calm.

### Search

Status: pass.

The new search remains a small list toolbar. It does not introduce a broad filter surface.

### List Rows

Status: pass.

Each row shows the project name first. Secondary information is limited to status, phase, category, date range and task counts. Internal IDs and debug metadata are not shown.

### Creation

Status: pass.

The create form is hidden by default. `Projekt hinzufügen` opens a compact modal and successful creation navigates to the new project detail page.

### Empty State

Status: pass.

The empty state is a collection-page empty state, so `EmptyState` is appropriate. It was captured by intercepting the overview response rather than mutating local data.

### Drawer

Status: pass.

The `/projects` route now uses drawer-safe list behavior. Opening the DMAX drawer keeps the list readable.

## 9. Known Limitations

- Project hierarchy and predecessor/successor relations are intentionally not shown in the list. They remain in project detail/planning surfaces.
- Search is frontend-only. No reusable `SearchFilterRow` primitive was extracted in this phase.
- Task counts are derived only from the overview data. No per-row enrichment was added.
- The narrow viewport remains very dense because the existing app shell/sidebar is still not a fully mobile-first pattern.
- `/ideas`, `/habits` and `/tasks` list pages remain unmigrated.

## 10. Readiness Judgment

`/projects` is **Ready as canonical project/action list reference**.

It validates the list-page pattern for action/planning entities without changing schema, backend APIs or dependencies.

## 11. Recommended Next Phase

Migrate `/ideas` next if the goal is to validate the action/planning list pattern on a structurally simpler initiative type.

Use:

- `/projects` for action/planning row state and compact task/count handling;
- `/categories` for general list-page structure;
- `/people` and `/organizations` for scan-first density and modal create behavior.

Avoid migrating `/ideas`, `/habits` and `/tasks` together in one phase.
