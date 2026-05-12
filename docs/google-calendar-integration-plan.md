# Google Calendar Integration Plan

Date: 2026-05-12

Implementation status:

- Phase 1: implemented.
- Phase 2: implemented.
- Phase 3: implemented for core manual linking and DMAX-to-Google creation.
- Phase 4: implemented for lazy title/time/all-day sync, last-edit-wins, and
  sync status/warnings.
- Phase 5: partially implemented for pragmatic multi-account OAuth/token
  handling, account-card config UI, richer read-only metadata display, and
  calendar-load performance hardening. Background sync/webhooks, recurrence,
  default calendars, and durable sync history remain future work.

This plan captures the agreed future direction for DMAX and Google Calendar.
It is intentionally more detailed than `docs/current-state.md`: this file is
the implementation plan, while `docs/current-state.md` should only be updated
as slices become real.

## Intent

DMAX is not adding a simple calendar sync feature. Google Calendar integration
is a foundational layer between:

- meaning: DMAX initiatives, projects, habits, tasks, context, relationships
- time: calendar events, external commitments, invitations, notifications

DMAX and Google Calendar are two perspectives on the same planning reality.
They are not identical and must remain loosely coupled.

## Non-Negotiable Principles

1. No dual-world thinking.
   DMAX and Google Calendar are not treated as unrelated systems. They can both
   express time objects in the same life/work reality.

2. Loose coupling.
   Objects can exist in DMAX only, Google only, or be explicitly linked.
   Linking is optional, reversible, and visible.

3. DMAX owns meaning.
   DMAX is the source of truth for initiatives, tasks, habits, project memory,
   dependencies, priorities, category context, and planning relationships.

4. Google owns interoperability.
   Google Calendar is used for external visibility, notifications, invitations,
   shared calendars, and practical calendar interoperability.

5. Explicit linking.
   DMAX should never silently infer durable semantic meaning from a Google
   event. Promotion/linking requires an explicit user action.

6. One planning surface.
   The long-term user expectation is to work primarily in DMAX while seeing and
   editing relevant calendar commitments there.

## Agreed Product Rules

### Object States

DMAX must support these states:

- Google-only event: exists only in Google, visible in DMAX live from Google.
- DMAX-only temporal object: DMAX project dates or calendar entries with no
  Google event.
- Linked object: DMAX time object and Google event are explicitly connected.
- Promotion flow: Google event becomes meaningful by linking to or creating a
  DMAX project/task/calendar entry.

Google-only events are not cached durably in DMAX for the first core. They are
loaded live from Google, with a short in-memory event-list cache for UI
performance only.

### Time Object Mapping

Project date spans and intra-day work sessions are intentionally different.

Project span:

```text
Google all-day/multi-day event <-> initiative(type=project).startDate/endDate
```

Work/session/appointment time:

```text
Google timed event <-> calendar_entry <-> optional task / initiative
```

Rules:

- `initiative.startDate` and `initiative.endDate` are inclusive DMAX dates.
- Google all-day events use Google's exclusive end date internally; provider
  code hides that conversion.
- `calendar_entries` represent concrete sessions, appointments, or work blocks.
- Tasks do not own date spans directly. A task can have multiple
  `calendar_entries`.
- Multiple task sessions preserve useful planning/work history.
- `standalone` `calendar_entries` may also be linked to Google timed events.

### Cardinality

- One project span can have at most one active Google binding.
- One `calendar_entry` can have at most one active Google binding.
- A task or project may indirectly have many Google events through multiple
  `calendar_entries`.

### Sync Fields

The first sync core covers only:

- title
- start
- end
- all-day vs timed

Future fields such as description/notes, location, Meet link, attendees, and
reminders should be supported by the model later, but are intentionally out of
scope for the first core.

Title mapping:

- Project all-day event title syncs with `initiative.name`.
- Timed event title syncs with `calendar_entries.title`.
- A timed event linked to a task never automatically changes `tasks.title`.

### Edit Rules

For linked objects:

- Time is bidirectionally synchronized.
- Title is bidirectionally synchronized according to the mapping above.
- Last edit wins for shared sync fields.
- If both sides changed since the last sync, DMAX resolves automatically using
  last edit wins and informs the user.
- DMAX semantic fields remain DMAX-owned and are not overwritten by Google.

Google-only events:

- Remain Google-only even when edited from DMAX.
- Editing a Google-only event from DMAX writes directly to Google.
- Editing a Google-only event does not create a `calendar_entry`, task, project,
  or habit.
- A separate explicit promote/link action creates DMAX meaning.

Editable Google-only events:

- Only editable if their `calendar_source` is explicitly write-enabled.
- Events from external organizers are read-only in the first core.
- The calendar edit modal shows organizer and attendees when Google provides
  them.
- Recurring Google events are visible but not editable, promotable, or linkable
  in the first core.

### Deletion And Unlinking

If a linked Google event is deleted in Google:

- DMAX object remains unchanged.
- Binding becomes `external_deleted` or is marked as broken.
- Project dates / `calendar_entry` remain intact.

If a linked DMAX `calendar_entry` is deleted in DMAX:

- UI asks whether the Google event should also be deleted.
- No silent provider deletion.

When unlinking:

- Binding is removed.
- DMAX object remains.
- UI asks whether to also delete the Google event.

### Offline / Failure Behavior

DMAX remains locally editable when Google is unavailable or a write fails.

- Save DMAX change locally.
- Mark binding as `pending_sync` or `sync_error`.
- Retry on the next calendar refresh.
- If the source is now read-only, local edits are allowed but sync is marked
  blocked.

### Sync Trigger

First core:

- Sync happens lazily when opening/refreshing the DMAX calendar view.
- No background daemon.
- No Google push/webhooks.
- `/api/calendar` uses a short in-memory event-list cache keyed by source and
  requested range, joins concurrent identical Google requests, asks Google for
  partial response fields only, and times out slow Google fetches instead of
  blocking the whole calendar view indefinitely.
- Loading a range prefetches the following two one-week ranges in the
  background. This is a UI latency optimization only, not durable sync.

Later:

- Webhooks or incremental sync can be considered after the core is stable.

### User Notifications

Sync conflicts or important sync outcomes should produce dismissible banners.
Clicking/dismissing a banner marks that information as done/acknowledged.

This implies a small notification/state mechanism for sync messages, but the
first implementation can keep it simple.

### Multi-Account

The current implementation supports account-specific OAuth token files keyed by
`calendar_sources.accountLabel`, while preserving the original legacy token as a
fallback for existing sources. This is enough to connect the same calendar as
its own Google account instead of as a read-only shared calendar from another
account.

The `/config` UI exposes this as account cards: each known Google account can be
connected, disconnected, reconnected, and can list calendars available in that
account. Adding/removing a calendar in a card toggles the durable DMAX
`calendar_sources` selection. The separate DMAX calendar sources area shows the
active source rows DMAX will actually load in `/calendar`.

`calendar_sources.accountLabel` is still manual text and the current schema
keeps `unique(provider, calendar_id)`, so the same Google calendar is not stored
as duplicate source rows across accounts. When a previously shared/read-only
calendar is later added through its own account, DMAX reuses/updates the
existing source row. A fuller connected account model with Google identity
metadata remains future work.

## Current Calendar UX

The `/calendar` day/week view separates fixed commitments from flexible project
planning. Google all-day/multi-day events and locked project spans render in
`Fixierte Zeitraeume`. Unlocked project spans render in the collapsible
`Flexible Planung` lane. Multi-day timed Google events are treated like
all-day/multi-day events for lane placement.

The Google event modal keeps provider metadata compact, uses one central
`Speichern` action for edits and link/promote operations, and progressively
reveals link/promote fields only after the user chooses the target mode. The
project detail timeframe modal remains the canonical place to change a project
span and its lock status; it shows only a compact Google Calendar binding
summary plus create/unlink actions.

## Architecture Overview

Use a binding layer between DMAX time objects and external provider events.

Current core objects:

- `calendar_entries`: DMAX-owned timed calendar entries.
- `initiatives`: projects can have `startDate`/`endDate` spans.
- `calendar_sources`: configured Google calendars.
- Google events: loaded live through the provider.

New conceptual object:

- `calendar_event_bindings`: optional connection between a DMAX time object and
  a Google event.

Provider-specific code should be isolated in `src/calendar/google-calendar-*`.
The rest of DMAX should reason about normalized calendar events and bindings.

Do not introduce a generic provider framework before there is a second provider.
Keep the abstraction small and Google-shaped for now, but avoid sprinkling raw
Google API details through API/UI/business logic.

## Implemented Binding Model

The current binding table:

```sql
create table calendar_event_bindings (
  id integer primary key,
  local_entity_type text not null check (
    local_entity_type in ('calendar_entry', 'initiative_project_span')
  ),
  local_entity_id integer not null,
  provider text not null check (provider in ('google')),
  calendar_source_id integer references calendar_sources(id),
  external_calendar_id text not null,
  external_event_id text not null,
  external_etag text,
  external_updated_at text,
  sync_status text not null default 'synced' check (
    sync_status in (
      'synced',
      'pending_sync',
      'sync_error',
      'external_deleted',
      'sync_blocked_readonly'
    )
  ),
  sync_message text,
  last_synced_at text,
  unlinked_at text,
  created_at text not null,
  updated_at text not null
);
```

Recommended indexes/constraints:

- Unique active binding for `(local_entity_type, local_entity_id)` where
  `unlinked_at is null`.
- Unique active binding for provider event identity:
  `(provider, external_calendar_id, external_event_id)` where `unlinked_at is null`.
- Index by `calendar_source_id`.
- Index by `sync_status`.

Potential later extensions:

- `connected_calendar_accounts` for multi-account OAuth identities.
- `sync_notifications` or reuse/extend `app_state_events` if dismissible
  banners need durability.
- Additional sync field snapshots when expanding beyond title/time.
- Recurrence model for habit tasks/routines.

## Sync Strategy

### Initial Link

Initial linking is a user decision, not normal sync.

If DMAX and Google values differ, UI asks which side should set the initial
shared fields:

- use Google values in DMAX
- push DMAX values to Google
- cancel

After initial link, normal last-edit-wins sync applies.

### Lazy Sync On Calendar Load

When `/api/calendar` loads:

1. Load DMAX entries/project spans for the visible range.
2. Load Google events live from configured sources.
3. Load active bindings for relevant DMAX objects and visible Google events.
4. For each linked object:
   - detect external deletion
   - compare local updated time and external updated time against last sync
   - apply last-edit-wins for core fields
   - update binding status/message
5. Return calendar view with:
   - DMAX events
   - Google-only events
   - linked state
   - editability flags
   - sync messages/statuses

### Write From DMAX

When editing a linked DMAX object:

- Update DMAX locally first.
- If linked source is writable and event is editable, write to Google.
- If Google write succeeds, update binding metadata to `synced`.
- If Google write fails, keep local change and mark `pending_sync` or
  `sync_error`.
- If source is read-only, mark `sync_blocked_readonly`.

### Write Google-Only From DMAX

When editing a Google-only event from DMAX:

- Do not create a DMAX object.
- Write core fields directly to Google if source/event is editable.
- Reload calendar view after success.

### Conflict Resolution

If both sides changed since last sync:

- Last edit wins.
- DMAX automatically overwrites the older side when possible.
- DMAX creates a dismissible user-facing banner describing what happened.
- If the losing side cannot be written, mark binding as sync error/blocked.

## UX Flows

### Calendar View

Events should visually communicate:

- Google-only
- DMAX-only
- linked/synced
- linked/pending sync
- linked/sync error
- external organizer/read-only
- recurring/not yet integrable

Google-only events are clickable. The modal shows core fields:

- title
- start
- end
- all-day vs timed
- source calendar
- editability/read-only reason
- recurring warning if applicable

If editable, the modal can edit core fields directly in Google.

### Create Google Event From DMAX

For a DMAX `calendar_entry` or project span:

1. User chooses "create Google event" / "publish to Google".
2. UI asks for target Google calendar.
3. DMAX creates the Google event.
4. DMAX stores binding.
5. Google event gets a minimal marker description, e.g.:

```text
Created by DMAX
Linked DMAX object: calendar_entry:123
```

Later, this can move to Google `extendedProperties.private`.

### Link Google Timed Event

Timed Google events can be promoted through explicit choices:

- link with existing project: creates/links a `calendar_entry` with
  `initiativeId`
- link with existing task: creates/links a `calendar_entry` with `taskId`
- create new task under selected project: creates task and `calendar_entry`

Timed Google events cannot create new projects directly.

The new `calendar_entry.title` initially uses the Google event title.

### Link Google All-Day / Multi-Day Event

All-day/multi-day Google events can be promoted through explicit choices:

- link to existing project span
- create new project

If the existing project already has different dates/name, UI asks which side
sets the initial values.

### Unlink

When unlinking:

1. UI confirms unlink.
2. UI asks whether to delete the Google event too.
3. DMAX removes/deactivates the binding.
4. DMAX object remains.

### Deletion

When deleting a linked DMAX `calendar_entry`:

1. UI asks whether to also delete the linked Google event.
2. DMAX deletes local entry.
3. If requested, DMAX attempts Google deletion.
4. If Google deletion fails, UI shows the error.

For project spans, clearing dates or removing the binding should similarly ask
whether to delete the linked Google all-day event.

## Implementation Roadmap

### Phase 1: Read-Only Hardening And Metadata Foundation

Goal: make the current Google read path robust and binding-ready.

Tasks:

- Ensure `/api/calendar` survives Google auth/source failures and returns
  partial results plus errors/status.
- Add Google event metadata to the normalized event model:
  - calendar/source IDs
  - external event ID
  - html link
  - etag
  - updated timestamp
  - recurring flag
  - organizer self flag
  - editable flag
  - read-only reason
- Implement pagination for `events.list` and `calendarList.list`.
- Tighten all-day inclusive/exclusive conversion tests.
- Make recurring events visible but clearly not integrable/editable.
- Make Google-only events clickable in the UI and show read-only/editability
  state in a modal.
- Keep OAuth scope read-only during this phase.

Tests:

- Google provider event conversion.
- All-day end-date conversion.
- Timed event timezone conversion for current local assumptions.
- Pagination.
- Provider/source failure does not fail entire calendar view.

### Phase 2: Binding Schema And UI Signals

Goal: introduce link identity without full sync complexity.

Tasks:

- Add `calendar_event_bindings` table and repository.
- Add schema migration and context-sync inspection.
- Include binding status in calendar API responses.
- Show linked/unlinked/sync-status indicators in:
  - calendar view
  - initiative/project detail
  - task detail where relevant
  - list views later as needed
- Add dismissible sync/info banner infrastructure if not already enough via
  existing state events.

Tests:

- Repository constraints for one active binding per local time object.
- Binding status serialization in calendar view.
- Migration/schema signature updates.

### Phase 3: Manual Linking And Create Google Event

Goal: first controlled write path.

Tasks:

- Expand OAuth scope from read-only to calendar write only when this phase
  begins.
- Align source `readOnly` / write-enabled UI with actual OAuth and calendar
  capabilities.
- Add target-calendar selection when creating Google event from DMAX.
- Create Google event from:
  - `calendar_entry`
  - project span
  - standalone calendar entry
- Store binding after successful create.
- Add minimal marker description to DMAX-created Google events.
- Add manual link/promote UI for:
  - timed Google event -> existing project calendar entry
  - timed Google event -> existing task calendar entry
  - timed Google event -> new task under selected project
  - all-day Google event -> existing project span
  - all-day Google event -> new project
- Initial link dialog asks which side sets starting shared values.

Tests:

- Google write request construction.
- Binding created after provider success.
- Initial link choice updates correct side.
- Timed event cannot create new project.
- Recurring event cannot be linked/promoted.

### Phase 4: Bidirectional Core Sync

Goal: synced linked objects for title/time/all-day.

Tasks:

- Implement lazy sync in calendar load.
- Implement last-edit-wins conflict resolution.
- Implement pending sync retry on calendar refresh.
- Implement source read-only block status.
- Implement external deletion status.
- Show dismissible conflict/sync banners.
- Support editing Google-only events directly from DMAX when source/event is
  editable and non-recurring.

Tests:

- DMAX newer pushes to Google.
- Google newer pulls into DMAX.
- Both changed uses last-edit-wins and creates notification.
- Google write failure leaves local change and marks pending/error.
- External Google deletion keeps DMAX object and marks binding.
- Read-only source blocks provider write but keeps local DMAX edit.

### Phase 5: Advanced Flows

Not first core. Keep these as follow-up tracks.

- Multi-account OAuth/account model. First pragmatic token-per-account support
  exists; a first-class account table, account identity metadata, and richer
  account lifecycle remain follow-up work.
- Background sync or Google push/webhooks.
- Event descriptions/notes/location/Meet links/attendees/reminders.
- Recurrence model for habit initiatives and recurring tasks.
- Series-aware Google recurring event sync.
- Project/category/default target calendars.
- Better sync logs/history.
- Import/reporting views such as "when did I work on this project?"

## Current-Code Review Anchors

Relevant current files:

- `src/calendar/google-calendar-auth.ts`
- `src/calendar/google-calendar-provider.ts`
- `src/calendar/calendar-service.ts`
- `src/repositories/calendar-entries.ts`
- `src/repositories/calendar-sources.ts`
- `src/api/server.ts`
- `web/src/App.tsx`
- `web/src/api.ts`
- `web/src/types.ts`
- `data/schema.sql`
- `docs/current-state.md`

Original issues addressed by the implementation:

- Google token refresh failure can fail the whole calendar endpoint.
- Google event pagination is not implemented.
- Google provider tests are missing.

Known remaining design limitations:

- OAuth/account model has account-specific token files, but no first-class
  connected-account table or Google identity metadata yet.
- `calendar_sources` still has a unique `(provider, calendar_id)` constraint;
  adding the same calendar through a different account updates/reuses the
  existing source instead of storing parallel source rows.
- Timezone handling strips provider timezone into local wall-clock strings.
- Dismissible sync banners are UI-local rather than durable acknowledged
  notification records.

## Open Decisions

These are intentionally deferred:

- Exact durable shape of dismissible sync notifications.
- Whether marker data should move from visible Google description to
  `extendedProperties.private`.
- Exact first-class multi-account schema and whether to introduce
  `connected_calendar_accounts`.
- Exact recurrence model for habit tasks.
- Whether `calendar_entries.status` should later add `cancelled`.

Current decision for cancelled/failed sessions:

- Do not change status model now.
- Cancelled/failed calendar entries have no special behavior in the first core
  and remain as normal open/todo entries.
- Revisit status expansion later.
