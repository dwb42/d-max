# DMAX UI Current State

Last updated: 2026-06-30

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

`/people/:id` and `/organizations/:id` share the same party communication
surface. The main content column shows open party-owned measures first and then
`Historie`, which combines manual communication entries, Gmail messages, and
completed party-owned measures. The right sidebar for people is ordered as
Kontakt, Beschreibung, Anschriften, DMAX-Kontexte, and Metadaten. The right
sidebar for organizations adds compact relationship panels between Anschriften
and DMAX-Kontexte: Kontakt, Beschreibung, Anschriften, Personen,
Organisationen, DMAX-Kontexte, Metadaten.
Person and organization sidebars now include a compact `Aktivität` summary card
from the shared party activity source. Organization `Personen` can render as a
CRM-style activity list for active related people. Task detail `Beteiligte` uses
the same badges and next-action widget for participant people, organizations,
and organization rollups.

Party detail headers use the established person/organization icon, show a
DMAX-context breadcrumb when a party is attached to a task, initiative, or
calendar entry, and fall back to the people/organizations list when no context
exists. Context breadcrumbs prefer primary links and task contexts before
initiative contexts.

Party contact and address rows are compact relation rows with executable
behavior where available. E-mail rows open the Gmail compose flow, website/URL
rows open external links in a new tab with normalized domain display, phone rows
use `tel:` links and normalize German `+49`/`0049`/leading-`49` numbers for
display and copy, and address rows open Google Maps search links. Phone and
address rows include icon-only copy actions with transient feedback.

E-mail timeline rows are compact by default, newest-first, and optimized for
temporal scanning: direction icon/label plus date/time, subject, and a preview
stripped of quoted reply history when recognizable. Expanding a message reveals
headers/body and small right-aligned actions for reply, reply-all, forward,
archive, and trash. Archive/trash require the connected Gmail mailbox to have
the `gmail.modify` OAuth scope.

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
