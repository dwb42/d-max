# DMAX UI Reference Review: List Page System

## 1. Executive Summary

Phase 21 reviewed the migrated canonical list pages as one UI system:

- `/categories`
- `/people`
- `/organizations`
- `/projects`
- `/ideas`
- `/habits`
- `/tasks`

The review confirmed that the migrated list pages now share one scan-first structure: calm page header, optional lightweight search, compact `EntityListItem` rows, hidden-by-default create flows through `EditModal`, proportionate collection empty states and drawer-safe layout behavior.

Readiness status: **Ready as canonical list-page system**.

Recommended next phase: choose the next surface class deliberately: calendar/timeline/planning if time planning is the priority, config/prompts/debug containment if utility-view noise is the priority, or broader `App.tsx` decomposition if maintainability is the priority.

## 2. Canonical List-Page Anatomy

The established list anatomy is:

```text
topbar / page header
  title
  one calm primary create action where creation is supported

EntityListPage
  optional entity-list-toolbar for simple search
  EmptyState / ErrorState when relevant
  EntityList
    EntityListItem
      optional marker
      primary title/name
      compact secondary facts
      optional contained description preview
      optional compact stats
      optional leading action
      optional trailing actions
```

Rules confirmed in this phase:

- List pages are for scanning and navigation, not full object detail.
- Object names carry the row.
- Create forms are not visible by default.
- Search remains lightweight and frontend-only where present.
- Collection-level empty states may use `EmptyState`.
- Internal IDs and debug metadata are absent.
- Drawer-open state must not make rows unreadable.

## 3. List Families

### Life Areas

`/categories` is the life-area list reference.

It uses category name as the row anchor, emoji/color as subtle data-backed identity markers, and compact counts for related projects, ideas, habits and tasks. Category reordering remains deferred to a later explicit management pattern.

### Contact / Context

`/people` and `/organizations` are contact/context list references.

They keep names dominant, use subtle initials as identity markers and show only available compact secondary context. The current list APIs do not provide contact-point, address or relationship previews, so those remain detail-page content.

### Planning / Action

`/projects`, `/ideas` and `/habits` are planning/action list references.

Projects show more execution context: status, phase, category, date range and task counts. Ideas and habits stay lighter: status/category plus short context, with task counts only when already attached.

Habit frequency, recurrence and streak semantics are intentionally deferred.

### Small Operational Actions

`/tasks` is the small operational action list reference.

Task rows keep title first, then status, priority and due date, matching `/tasks/:id`. Parent initiative/category context is present but secondary. Status toggle and delete are row actions, not board controls.

## 4. Shared Primitives

Shared primitives:

- `EntityListPage`: list surface wrapper.
- `EntityList`: repeated-item body.
- `EntityListItem`: compact scan row/card.

`EntityListItem` responsibilities now include:

- optional marker;
- primary title;
- compact meta line;
- optional contained description preview;
- optional stats;
- optional leading action for task status-like controls;
- optional trailing actions for calm row-level commands;
- openable main content with an accessible label.

Phase 21 added an accessibility consistency fix: openable rows without trailing actions now also receive an `aria-label` derived from `openLabel` or the title.

## 5. Consolidation Findings

The review found no major route drift across the migrated list pages.

Small inconsistencies found and fixed:

- The task list page header used `Maßnahmen`, while the sidebar/context labels still used `Massnahmen`.
- The `/tasks` list DMAX drawer was visually safe, but the route context helper omitted the `tasks` collection and therefore opened as `Global Chat`.
- Openable `EntityListItem` rows without trailing actions did not apply the same accessible open label behavior as rows with actions.

No broader abstraction was extracted. A future `SearchFilterRow` remains deferred because the current search controls are simple and route-local enough.

## 6. Screenshot Evidence

Screenshots are saved in `docs/ui/screenshots/list-page-system-review/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-categories-list-final.png` | Final category list reference | pass |
| `02-people-list-final.png` | Final people list reference | pass |
| `03-organizations-list-final.png` | Final organization list reference | pass |
| `04-projects-list-final.png` | Final project/action list reference | pass |
| `05-ideas-list-final.png` | Final idea/exploratory list reference | pass |
| `06-habits-list-final.png` | Final habit/routine list reference | pass |
| `07-tasks-list-final.png` | Final task/action list reference | pass |
| `08-list-page-drawer-safe-example.png` | Drawer-safe list behavior | pass |
| `09-list-page-narrow-viewport-example.png` | Narrow viewport behavior | pass |
| `10-task-row-actions-example.png` | Task leading/trailing row actions | pass |

## 7. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 28 test files / 115 tests.

## 8. Known Limitations

- Search remains frontend-only and route-local.
- `SearchFilterRow` is still conceptual.
- Category reordering is deferred.
- Contact/address/relation previews for people and organizations are not available at list level.
- Completed task archive/filtering is deferred because the overview currently provides open tasks.
- Dense mobile app-shell behavior is still deferred; this phase only checks list-level narrow readability.
- Calendar, timeline, planning canvas, config, prompts and other utility/debug surfaces remain outside the canonical entity list-page system.

## 9. Readiness Judgment

The canonical list-page system is **Ready**.

The migrated entity list pages now feel like one product system rather than seven separate route migrations. Remaining work is mostly about future surface classes and maintainability, not list-page readiness.

## 10. Recommended Next Phase

Choose one next phase based on product priority:

- calendar/timeline/planning surfaces, if time planning is next;
- config/prompts/debug containment, if utility-view noise is next;
- broader `App.tsx` decomposition, if maintainability is next.
