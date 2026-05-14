# DMAX UI Reference Review: Category List

## 1. Executive Summary

Phase 14 migrated `/categories` into the first canonical DMAX entity list-page reference.

The category list now behaves as a scan-first overview of Lebensbereiche. It no longer opens every category into a work-board with nested idea/project/habit columns. Instead, it shows compact category rows with meaningful identity markers, short context previews and secondary counts. Category creation starts from a page-level action and opens a contained modal.

Readiness status: **Ready as canonical list-page reference**.

Recommended next phase: migrate the next simple entity list route, likely `/people` or `/organizations`, using the new category list reference.

## 2. Current State Before Migration

Before Phase 14, `/categories` used the old `LifeAreasView` work-board pattern:

- each category rendered as a large section;
- categories exposed nested idea/project/habit groups by default;
- each nested group had inline create affordances;
- empty nested groups rendered visible empty copy;
- the page behaved more like a dashboard/work board than a list;
- there was no normal category create action on the list page;
- the DMAX drawer could use the generic list-page squeeze behavior.

The page was useful for managing category-contained work, but it was not a clean list-page reference.

## 3. What Changed In Phase 14

- Introduced minimal reusable list primitives:
  - `EntityListPage`
  - `EntityList`
  - `EntityListItem`
- Replaced the old category work-board body with a compact list of categories.
- Kept category names as the primary row content.
- Kept emoji/color as subtle data-driven identity markers, not decorative page chrome.
- Added category description previews where available.
- Added compact secondary counts for projects, ideas, habits and tasks.
- Moved category creation behind a page-level `Lebensbereich hinzufügen` action and `EditModal`.
- Added a full collection empty state for the no-category case.
- Added drawer-safe layout behavior for the `/categories` list route.

## 4. Shared Primitives

New shared primitives added in `web/src/components/ui/EntityListPage.tsx`:

- `EntityListPage`
- `EntityList`
- `EntityListItem`

Existing primitives reused:

- `EmptyState`
- `EditModal`
- `ErrorState`

The primitives are intentionally small. They define the basic list wrapper, list body and row/card shape only. Search/filter primitives remain deferred until a route actually needs them.

## 5. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/reference-category-list/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-category-list-before-or-current.png` | Pre-migration category work-board/list state from current screenshot inventory | captured |
| `02-category-list-after-migration.png` | New scan-first category list with page action | pass |
| `03-category-list-item-density.png` | Compact row density and secondary counts | pass |
| `04-category-list-empty-state.png` | Full collection empty state using an intercepted empty overview response | pass |
| `05-category-list-create-action.png` | Page-level create action opens contained modal | pass |
| `06-category-list-narrow-viewport.png` | Narrow viewport stacking and readable list rows | pass |
| `07-category-list-dmax-drawer-safe.png` | DMAX drawer opens without squeezing the list into unreadable columns | pass |

## 6. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 27 test files / 112 tests.

## 7. Review Notes

### Page Header

Status: pass.

The page title is simply `Lebensbereiche`, with no decorative icon and no redundant explanation. The primary create action is visible but calm.

### List Rows

Status: pass.

Each row shows the category name first, followed by a short meta line, optional description preview and compact counts. The rows avoid internal IDs and full metadata.

### Creation

Status: pass.

The create form is no longer an always-visible page form. `Lebensbereich hinzufügen` opens a small `EditModal` with name and optional description. After creation, the app navigates to the new category detail page.

### Empty State

Status: pass.

The empty state is a real collection-page empty state, so `EmptyState` is appropriate. It was captured by intercepting the overview response rather than mutating local data.

### Drawer

Status: pass.

The `/categories` route now uses drawer-safe list behavior. Opening the DMAX drawer keeps the list readable.

## 8. Known Limitations

- Search/filter/sort primitives remain deferred; `/categories` did not need them yet.
- Category reordering is no longer exposed on the `/categories` list page. It previously existed only through the old work-board drag behavior. Reordering still exists in the API but needs a calmer explicit list-management pattern later.
- The new list primitives have only been validated on `/categories`; the next list migration should pressure-test whether row actions, search and richer empty states need extraction.
- Other list pages remain unmigrated and still use route-local patterns.

## 9. Readiness Judgment

`/categories` is **Ready as canonical list-page reference**.

It establishes the first scan-first DMAX list pattern without changing schema, backend APIs or dependencies.

## 10. Recommended Next Phase

Migrate the next simple entity list page using this reference. Good candidates:

- `/people`, because it has a straightforward list/search/create shape;
- `/organizations`, because organization detail and party components are already mature.

Avoid migrating multiple list pages in one phase.
