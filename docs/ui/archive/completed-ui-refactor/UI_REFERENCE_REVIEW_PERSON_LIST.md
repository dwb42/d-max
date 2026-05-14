# DMAX UI Reference Review: Person List

## 1. Executive Summary

Phase 15 migrated `/people` to the canonical DMAX entity list-page pattern established by `/categories`.

The people list now behaves as a scan-first contact/context collection. It no longer shows a permanent person creation form above the list. Instead, it uses the shared list primitives, keeps person names as the primary row content, shows compact identity context when available, preserves simple search, and moves creation into a contained `EditModal`.

Readiness status: **Ready as canonical person/contact list reference**.

Recommended next phase: migrate `/organizations` using the people list, category list and organization detail references.

## 2. Current State Before Migration

Before Phase 15, `/people` used an older route-local list pattern:

- a full person creation form was visible by default;
- search lived in a separate panel below the create form;
- person rows reused the task-row visual style;
- rows used a generic people icon rather than person-specific identity;
- the page felt closer to an admin contact form than a read-first list;
- the DMAX drawer used the generic collection-route behavior rather than a list-safe route class.

The existing behavior was functional, but it did not yet validate the canonical list-page pattern for people/contact entities.

## 3. What Changed In Phase 15

- Replaced the always-visible create form with a page-level `Person hinzufügen` action.
- Added `PersonCreateModal` using the existing `EditModal` primitive.
- Preserved the existing person fields: salutation, academic title, first name, last name and suffix.
- Preserved simple search, but restyled it as a compact list toolbar.
- Replaced old `task-row` list rows with `EntityListPage`, `EntityList` and `EntityListItem`.
- Kept person display name as the primary row content.
- Added subtle data-derived initials as row identity markers.
- Kept salutation/title/name suffix as compact secondary row context when available.
- Added a useful full collection empty state.
- Added drawer-safe `/people` route behavior so the DMAX drawer does not squeeze the list into unreadable columns.

## 4. Shared Primitives

Shared primitives reused:

- `EntityListPage`
- `EntityList`
- `EntityListItem`
- `EmptyState`
- `EditModal`
- `ErrorState`

No new list component abstraction was introduced. The only shared style addition is a lightweight `entity-list-toolbar` class for simple list search controls.

## 5. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/reference-person-list/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-person-list-before-or-current.png` | Pre-migration people list from current screenshot inventory | captured |
| `02-person-list-after-migration.png` | New scan-first people list with page action and search | pass |
| `03-person-list-item-density.png` | Compact row density and person identity context | pass |
| `04-person-list-empty-state.png` | Full collection empty state using an intercepted empty people response | pass |
| `05-person-list-create-action.png` | Page-level create action opens contained `EditModal` | pass |
| `06-person-list-narrow-viewport.png` | Narrow viewport stacking and readable list rows | pass |
| `07-person-list-dmax-drawer-safe.png` | DMAX drawer opens without making the list unreadable | pass |

## 6. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 27 test files / 112 tests.

## 7. Review Notes

### Page Header

Status: pass.

The page title is simply `Personen`, with no decorative icon and no redundant explanatory subtitle. The primary create action is visible but calm.

### Search

Status: pass.

The existing simple search behavior is preserved. It remains a small list tool rather than a large filter surface.

### List Rows

Status: pass.

Each row shows the person name first. Secondary information is limited to salutation, academic title, separate first/last name context and suffix where available. Internal IDs and debug metadata are not shown.

### Creation

Status: pass.

The create form is hidden by default. `Person hinzufügen` opens a compact modal and successful creation navigates to the new person detail page.

### Empty State

Status: pass.

The empty state is a collection-page empty state, so `EmptyState` is appropriate. It was captured by intercepting the people response rather than mutating local data.

### Drawer

Status: pass.

The `/people` route now uses drawer-safe list behavior. Opening the DMAX drawer keeps the list readable.

## 8. Known Limitations

- Person contact points, addresses and relationship counts are not available in the list API response, so the list does not preview email, phone, organization or participation context yet.
- Search remains a simple frontend-only text filter. No reusable `SearchFilterRow` component was extracted in this phase.
- The local fixture data is sparse, so dense multi-person row behavior was not visually stress-tested.
- `/organizations` and the remaining list pages are still unmigrated.

## 9. Readiness Judgment

`/people` is **Ready as canonical person/contact list reference**.

It validates the list-page pattern for a sparse contact/context entity without changing schema, backend APIs or dependencies.

## 10. Recommended Next Phase

Migrate `/organizations` using:

- the `/people` list reference for contact/context list behavior;
- the `/categories` list reference for compact list-page structure;
- the `/organizations/:id` detail reference for organization-specific content hierarchy.

Avoid migrating multiple list pages in one phase.
