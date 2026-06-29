# DMAX UI Current State

Last updated: 2026-06-25

This is the short active handover for frontend UI work. Historical planning, phase reviews, route inventories and screenshot audits are archived under `archive/completed-ui-refactor/`.

## Completed Canonical UI

Canonical detail pages are complete and extracted:

- `/organizations/:id`
- `/projects/:id` and `/initiatives/:id`
- `/people/:id`
- `/tasks/:id`
- `/categories/:name`

Canonical list pages are complete and extracted:

- `/categories`
- `/people`
- `/organizations`
- `/projects`
- `/ideas`
- `/habits`
- `/tasks`

Route-level UI compositions now live under:

- `web/src/pages/lists/`
- `web/src/pages/details/`

`web/src/App.tsx` remains responsible for app shell, routing, data loading, mutation callbacks, DMAX drawer/chat behavior and unreworked surfaces.

Current mobile DMAX drawer behavior is part of the app-shell contract: on
narrow/mobile viewports the contextual drawer opens as a full-viewport fixed
surface, contains its own scrolling, locks the page behind it, and keeps a DMAX
button visible in the drawer header so the user can close it again.

## Active UI Primitives

Use the shared primitives in `web/src/components/ui/` before creating route-local UI:

- `EntityDetailPage`
- `EntityHeader`
- `EntityListPage`, `EntityList`, `EntityListItem`
- `InlineEditableText`
- `SectionBlock`, `SectionHeader`
- `DescriptionBlock`
- `MetadataGrid`
- `RelationList`, `RelationGroup`, `RelationItem`
- `EmptyState`
- `ErrorState`
- `EditModal`, `ConfirmModal`
- `RichText`

Party/contact primitives live under `web/src/components/party/`.

## Current Party Communication UI

`/people/:id` uses the main content column as a party communication surface.
It shows party-owned measures first, then manual communication notes, then the
Gmail email timeline. The right sidebar is ordered as Kontakt, Beschreibung,
Anschriften, DMAX-Kontexte, and Metadaten. E-Mail rows are compact by default,
newest-first, and optimized for temporal scanning: direction icon/label plus
date/time, subject, and a preview stripped of quoted reply history when
recognizable. Expanding a message reveals headers/body and small right-aligned
actions for reply, reply-all, forward, archive, and trash. Archive/trash require
the connected Gmail mailbox to have the `gmail.modify` OAuth scope.

## Active Guidance Docs

Default UI context should stay small:

- `UI_CURRENT_STATE.md`
- `UI_PRINCIPLES.md`
- `UI_PATTERNS.md`
- `UI_COMPONENTS.md`
- `UI_REVIEW_CHECKLIST.md`

Consult `archive/completed-ui-refactor/` only when a task explicitly needs historical phase evidence, screenshot evidence or old migration rationale.

## Deferred Work

The completed refactor intentionally did not cover:

- calendar, timeline and planning-canvas redesign;
- config, prompt and debug surface containment;
- DMAX drawer/context extraction;
- broader app-shell or `App.tsx` orchestration decomposition;
- `SearchFilterRow`;
- `RelationshipManager`;
- `TechnicalMetadataDisclosure`;
- category reordering management;
- richer list-level contact previews;
- task archive/filtering;
- habit frequency, recurrence or streak logic.
