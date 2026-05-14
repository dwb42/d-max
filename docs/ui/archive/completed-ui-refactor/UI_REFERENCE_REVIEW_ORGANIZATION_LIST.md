# DMAX UI Reference Review: Organization List

## 1. Executive Summary

Phase 16 migrated `/organizations` to the canonical DMAX entity list-page pattern validated by `/categories` and `/people`.

The organization list now behaves as a scan-first contact/context collection. It no longer shows a permanent organization creation form above the list. Instead, it uses the shared list primitives, keeps organization names as the primary row content, shows legal/type context only as compact secondary information, preserves simple search, and moves creation into a contained `EditModal`.

Readiness status: **Ready as canonical organization/contact list reference**.

Recommended next phase: migrate one action/planning list page, likely `/projects`, using the category, people and organization list references plus the project/initiative detail reference.

## 2. Current State Before Migration

Before Phase 16, `/organizations` used the older route-local list pattern:

- a full organization creation form was visible by default;
- search lived in a separate panel below the create form;
- organization rows reused the task-row visual style;
- rows used a generic building icon instead of a quiet data-derived marker;
- the page felt closer to a lightweight CRM/admin form than a read-first list;
- the DMAX drawer used the generic collection-route behavior rather than a list-safe route class.

The route was functional, but it was not yet aligned with the canonical list-page references.

## 3. What Changed In Phase 16

- Replaced the always-visible create form with a page-level `Organisation hinzufügen` action.
- Added `OrganizationCreateModal` using the existing `EditModal` primitive.
- Preserved the existing create fields: name, legal name and organization type.
- Preserved simple search, but restyled it as a compact list toolbar.
- Replaced old `task-row` list rows with `EntityListPage`, `EntityList` and `EntityListItem`.
- Kept organization display name as the primary row content.
- Added subtle data-derived initials as row identity markers.
- Kept organization type and legal name as compact secondary row context when available.
- Added a useful full collection empty state.
- Added drawer-safe `/organizations` route behavior so the DMAX drawer does not squeeze the list into unreadable columns.

## 4. Shared Primitives

Shared primitives reused:

- `EntityListPage`
- `EntityList`
- `EntityListItem`
- `EmptyState`
- `EditModal`
- `ErrorState`

No new list component abstraction was introduced. The existing lightweight list toolbar pattern from `/people` was reused.

## 5. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/reference-organization-list/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-organization-list-before-or-current.png` | Pre-migration organization list from current screenshot inventory | captured |
| `02-organization-list-after-migration.png` | New scan-first organization list with page action and search | pass |
| `03-organization-list-item-density.png` | Compact row density and organization type context | pass |
| `04-organization-list-empty-state.png` | Full collection empty state using an intercepted empty organizations response | pass |
| `05-organization-list-create-action.png` | Page-level create action opens contained `EditModal` | pass |
| `06-organization-list-narrow-viewport.png` | Narrow viewport stacking and readable list rows | pass |
| `07-organization-list-dmax-drawer-safe.png` | DMAX drawer opens without making the list unreadable | pass |

## 6. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 27 test files / 112 tests.

## 7. Review Notes

### Page Header

Status: pass.

The page title is simply `Organisationen`, with no decorative title icon and no redundant explanatory subtitle. The primary create action is visible but calm.

### Search

Status: pass.

The existing simple search behavior is preserved. It remains a small list tool rather than a large filter surface.

### List Rows

Status: pass.

Each row shows the organization name first. Secondary information is limited to organization type and legal name when available. Internal IDs and debug metadata are not shown.

### Creation

Status: pass.

The create form is hidden by default. `Organisation hinzufügen` opens a compact modal and successful creation navigates to the new organization detail page.

### Empty State

Status: pass.

The empty state is a collection-page empty state, so `EmptyState` is appropriate. It was captured by intercepting the organizations response rather than mutating local data.

### Drawer

Status: pass.

The `/organizations` route now uses drawer-safe list behavior. Opening the DMAX drawer keeps the list readable.

## 8. Known Limitations

- Organization contact points, addresses, relationship counts and participation counts are not available in the list API response, so the list does not preview those details.
- Search remains a simple frontend-only text filter. No reusable `SearchFilterRow` component was extracted in this phase.
- The local fixture data has only two organizations, so very dense organization-list behavior was not stress-tested.
- Action/planning list pages remain unmigrated and may reveal additional row/stat needs.

## 9. Readiness Judgment

`/organizations` is **Ready as canonical organization/contact list reference**.

It validates the list-page pattern for a contact/context entity with organization-specific secondary facts without changing schema, backend APIs or dependencies.

## 10. Recommended Next Phase

Migrate one action/planning list page next, likely `/projects`.

Use:

- `/categories` for general list-page structure;
- `/people` and `/organizations` for scan-first list behavior;
- `/projects/:id` and `/initiatives/:id` for project/initiative content hierarchy.

Avoid migrating projects, ideas and habits together in one phase.
