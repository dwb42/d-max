# d-max Current State

Date: 2026-05-14

Short handoff for fresh Codex/OpenClaw sessions. This file describes the
implemented repository state; older plans are historical unless this file or
code says otherwise.

## Snapshot

d-max is Dietrich's agentic initiative, task, and initiative-memory system.

Active interfaces:

- Telegram bot for daily text and voice use.
- Browser app for `/drive`, `/categories`, `/categories/:categoryName`,
  `/calendar`, `/calendar/timeline`, `/config`, `/ideas`, `/ideas/:categoryName`, `/projects`,
  `/projects/:categoryName`, `/habits`, `/habits/:categoryName`,
  `/initiatives/:id`, `/tasks`, `/tasks/:id`, `/people`, `/people/:id`,
  `/organizations`, `/organizations/:id`,
  `/prompt-vorlagen`, and `/prompts`.
- Browser/WebRTC realtime voice prototype using LiveKit and xAI realtime voice.

SQLite is the source of truth. Durable state changes go through tools/API
services.

## Data Model

SQLite tables:

```text
categories, initiatives, initiative_relations,
planning_canvases, planning_canvas_nodes,
tasks,
task_checklist_items,
calendar_entries, calendar_sources, calendar_event_bindings, calendar_event_visibility,
media_assets, media_links,
parties, people, organizations, relationship_types, party_relationships,
participant_role_types, entity_participants, party_contact_points, party_addresses,
app_chat_messages, app_conversations, app_prompt_logs, app_state_events
```

The Who dimension is implemented as a party identity layer. `parties` stores
the shared `person` or `organization` identity and display name; `people`
stores person fields including `first_name`, `last_name`, `salutation`
(`mr`, `mrs`, `unknown`), `academic_title`, and `name_suffix`;
`organizations` stores organization name, legal name, organization type, and
Markdown description/context memory. There is no person Markdown memory yet.
`relationship_types`
stores configured directed or symmetric relationship kinds such as `works_for`,
`founder_of`, `member_of`, `knows`, `partner_of`, and `mentor_of`.
`party_relationships` connects people and organizations with optional role
label, start/end dates, and active/inactive status; symmetric relationships are
canonicalized by the repository so A-B and B-A do not create duplicate edges.
`participant_role_types` stores configured roles, and `entity_participants`
assigns a party to an `initiative`, `task`, or `calendar_entry`; categories are
not participant targets. Because `entity_participants.entity_id` is polymorphic,
the repository validates target existence instead of relying on one database FK.
`party_contact_points` stores email, phone, WhatsApp, Signal, Telegram,
LinkedIn, website, and other contact routes with primary/preferred and future
send/receive flags. These flags are already modeled because contact points are
intended to become executable communication channels later, but provider-based
sending is not wired yet. `party_addresses` stores multiple physical addresses
per party. The browser surfaces `/people` and `/organizations` list/create
screens plus `/people/:id` and `/organizations/:id` detail pages. Detail pages
can edit core person/organization fields, add/delete/prefer contact points,
show party relationships, and show DMAX contexts where that party participates.
The organization detail page edits core fields in a header-triggered modal,
shows a full-width Markdown description panel, manages contact points and
postal addresses through modals with delete confirmation, and shows/adds
organization members via party relationships.
Initiative and task detail pages include a `Beteiligte` panel to add/remove
people or organizations with configured participant roles plus optional
free-text role labels. Relationship-type editing and calendar-entry
participant editing are available through API/tools or schema but are not
first-class browser workflows yet.

`initiatives.markdown` is required initiative memory. `initiatives.type` segments
the current technical Initiative object into `idea`, `project`, and `habit`;
existing initiatives default to `project`. `initiatives.project_phase` stores a
project-only phase with values `planning` and `doing`; existing initiatives
default to `doing`. The field is exposed through the API/tools/frontend as
`projectPhase`, included in OpenClaw context for project initiatives, editable
from the project detail header and Planning Canvas project edit modal, and used
as a Planning Canvas visual treatment. `initiatives.parent_id` stores one
optional parent initiative, giving initiatives a simple parent/children
hierarchy separate from the directed sequencing graph. Parent/children links
are editable in the initiative detail `Relations` panel and via
`updateInitiative(parentId)`. Parent hierarchy cycle-protection is not yet
implemented at the repository/API/tool layer, so callers should avoid creating
parent loops. The browser relation selector filters obvious ancestor/descendant
candidates, but that UI guard is not a data-integrity guarantee.
`initiative_relations` stores directed `precedes` edges between initiatives
across all initiative types, supports many-to-many predecessor and successor
links, rejects self-relations and duplicate edges, and the repository prevents
cycles. Initiatives with `type = project` may have nullable `start_date` and
`end_date` fields for a bounded initiative time span plus `is_locked`, exposed
as `isLocked`, to mark the span as fixed. Those project spans are editable in
the initiative detail header modal, shown in the `/calendar` all-day area when
they overlap the visible day/week, and marked with a lock icon in project
detail, `/calendar`, and `/planning-canvas` when locked. The project detail
timeframe modal is the canonical UI for changing `start_date`, `end_date`, and
`is_locked`; it uses an icon-only open/closed lock toggle, one `OK` save action,
and a compact Google Calendar section for creating, showing, or unlinking the
project span's Google binding. The product invariant is that `project_phase`,
`start_date`, `end_date`, and `is_locked` are meaningful only for
`type = project`; current schemas and repository writes do not yet enforce or
auto-clear those fields for ideas/habits, so callers should not set them on
non-project initiatives.
`planning_canvases` and `planning_canvas_nodes` store a browser-first Planning
Canvas MVP. The repository ensures one `Default` canvas. The current canvas UI
renders and parks only initiatives with `type = project`, and also shows Google
Calendar all-day or multi-day events from enabled sources as time bars in a
dedicated top lane, stacking only events that would otherwise overlap.
As temporary title-based special logic, Google events whose title contains
`Bianka` and `Kinder` or `Dietrich` and `Kinder` are treated as childcare coverage: they use the
uppermost Google lane, all other all-day Google events render below them,
Bianka/Dietrich overlaps are allowed and highlighted, and gaps between
childcare coverage blocks are marked.
The Planning Canvas Google lane
filters out German holidays, birthdays, and Google events already linked to a
placed project span. Pure Google event lanes are marked with a small Google
icon at the lane start and do not show a text status/Google lane pill. Editable
all-day or multi-day Google events can be opened in an edit modal by clicking
the event and resized from their left/right edges on the Planning Canvas; full
event dragging is disabled, and every resize date change opens a confirmation
modal before the Google event is updated. Dragging right across a pure Google
lane creates a new all-day Google event after title/calendar confirmation.
Hovering a Google event reveals an eye-off control that hides the
event on the Planning Canvas. Recurring Google events ask whether to hide only
the visible instance or the whole series. Hidden Google event rules are
restorable from the lower area of the left Planning Canvas sidebar and affect
only the selected surface.
Nodes persist manual layout state (`x`, `y`, optional `width`/`height`,
`collapsed`) for an initiative on that canvas; the rendered horizontal timeline
bar position is derived from the project's `start_date`/`end_date`, while the
persisted node `y` controls the visual row. Canvas layout does not create a
separate relationship model; parent-child hierarchy and `initiative_relations`
are read from the domain tables and rendered as lines when both endpoints are
placed on the canvas. The canvas background uses week-sized columns around the
current default ten-month range and lightly darker weekend bands inside each
week. It shows a red vertical today line without a text pill.
Project timeline bars/markers are the primary canvas objects; project cards are
not rendered on the canvas. Timeline bars use category color, but projects with
`project_phase = planning` render in a lighter category-derived color than
`doing` projects. Completed placed projects remain visible on the canvas with a
muted, strike-through label. Archived placed projects also remain visible on
the canvas. Completed and archived unplaced projects are hidden from the left
parking lot.
Dragging a normal timeline bar moves both project dates by whole days; dragging
its left or right handle updates the project start or end date; dragging it
vertically moves it between visual rows. Dragging an undated project from the
parking lot onto the canvas assigns the dropped day as `start_date` and a
one-week default span when `end_date` is missing. Clicking a placed timeline bar
opens the initiative detail page in a new tab; the pencil control opens the
Planning Canvas edit modal. Hovering a timeline bar reveals edit, predecessor,
and successor controls; predecessor/successor creation creates the project,
creates the appropriate `precedes` relation, and places the new timeline on the
anchor's lane.
Locked project spans (`is_locked = 1`) render with a lock icon and
small top-right badge on the Planning Canvas. Dragging the timeline bar can
still move the project vertically between visual rows, but horizontal date
movement is ignored. Start/end markers and resize handles cannot change locked
dates, resize handles are hidden, and the Planning Canvas edit modal leaves
date inputs disabled so timeframe changes go through the project detail modal.
Project timeline bars with an active Google Calendar project-span binding render
a Google icon badge in the lower-right corner.
Parent-child and predecessor/successor relation lines connect timeline
bars/markers directly; predecessor/successor lines do not use arrowheads. A
parent-only group can be moved up/down in rows by dragging the parent timeline
bar, moving parent and children in sync without changing any project dates. A
related group that includes predecessor/successor edges can be moved up/down by
dragging a predecessor/successor line; only the involved
`planning_canvas_nodes.y` values change. Browser API mutations emit
`planning_canvas_node` app state events. There are no OpenClaw/MCP tools for
canvas layout yet.
Tasks have a deliberately small
`open`/`done` status model; legacy non-`done` task statuses are migrated to
`open`. `task_checklist_items` stores simple checklist items
inside tasks. Items have only a name, `todo`/`done` status, and persisted order;
checklist completion does not automatically complete the parent task. Deleting
a task deletes its checklist items and task media links, but not the underlying
deduplicated media asset files.
`calendar_entries` stores local d-max calendar time blocks
for project focus, task work, and standalone appointments. Entries have concrete
`start_at`/`end_at` timestamps and a simple `open`/`done` status. A task can have
multiple calendar entries; completing a task calendar entry also completes the
linked task. `calendar_sources` stores non-secret calendar source configuration
such as enabled Google calendar IDs and the Google account label DMAX should use
for access. A calendar source is the durable DMAX-side selection that makes a
Google calendar visible in `/calendar` and eligible for sync/write operations;
disabling a source removes that calendar from DMAX without deleting the Google
calendar or account token. The current `calendar_sources` schema still has a
unique `(provider, calendar_id)` constraint, so if the same Google calendar is
re-added through its own account after being seen as a shared calendar, DMAX
reuses/updates the existing source row rather than storing duplicate rows.
Google event credentials/tokens are not stored in SQLite. Google Calendar OAuth
stores its legacy local token file at `GOOGLE_CALENDAR_TOKEN_PATH` under
`data/` by default, and account-specific tokens beside it under
`${GOOGLE_CALENDAR_TOKEN_PATH}.accounts/`; both locations are gitignored.
`calendar_event_bindings` stores the identity layer for Google sync. It can
connect one concrete DMAX time object (`calendar_entry` or a project
initiative's date span) to one Google calendar event, with at most one active
binding per local time object and per external provider event. Linked
`calendar_entry` rows sync title/start/end with linked timed Google events.
Linked project spans sync `initiative.name`, `start_date`, and `end_date` with
linked Google all-day events and timed Google events that span multiple dates;
timed multi-day events are normalized to date-only project spans in DMAX. Sync
runs lazily when `/api/calendar` is loaded,
uses last-edit-wins for shared fields unless the project span is locked, marks
external deletion/read-only/error states on the binding, and surfaces sync
warnings in the calendar UI. Read-only sync warnings preserve the concrete
Google reason where known, for example events owned by an external organizer.
Locked project spans remain DMAX-authoritative for the linked Google event so
Google-side date moves do not shift the project.
`calendar_event_visibility` stores DMAX-side Google event hide rules by surface
(`planning_canvas`, `calendar`, or `global`) without mutating Google Calendar.
It supports single external events, one recurring instance keyed by
`recurring_event_id` plus `original_start_at`, and complete recurring series
keyed by `recurring_event_id`. The current browser UI uses this for Planning
Canvas Google event hiding; `/calendar` is prepared as a future surface but does
not yet expose hide controls.
`media_assets` stores metadata for uploaded media files and `media_links`
connects those assets to d-max entities. Binary media files are stored outside
SQLite under `DMAX_MEDIA_STORAGE_DIR` (`data/media` by default, gitignored).
Current first-class attachment UI is implemented for initiative and task detail
pages. Assets can be images, audio, video, documents, or other allowed files;
the API serves files through `/api/media/assets/:id/file` rather than exposing
filesystem paths. Immediately after upload, d-max attempts to derive text for
the asset: text/Markdown files are excerpted locally, audio/video files are
transcribed with the configured OpenAI transcription model, and images/PDFs are
summarized through the configured OpenAI media-analysis model when
`OPENAI_API_KEY` is available. Analysis failures do not reject the upload; the
asset stores a short status summary instead. Stored analysis text can be edited
from the media modal, and media can be re-analyzed with an optional user focus
prompt. OpenClaw/app chat receives media metadata plus truncated derived text
(`summary`, `text_excerpt`, `transcript`) through context/tools; it does not
receive or read raw binary files directly. The `media_links.entity_type` schema
already includes `category`, `initiative`, `task`, `calendar_entry`, and
`app_chat_message` for forward compatibility, but current first-class API/tool
validation supports attachment operations only for categories, initiatives, and
tasks. Browser upload UI exists for initiatives and tasks only.
Configured and authorized Google calendar sources are fetched live in
`/api/calendar` using the account token indicated by each source's
`account_label`, with legacy-token fallback for older sources. Google event
fetch returns partial calendar results when individual Google sources or auth
refresh fail, includes warning metadata, and normalizes richer Google event
metadata such as provider IDs, links, ETag/update data, recurring status,
`recurringEventId`, `originalStartTime`, `iCalUID`, organizer, attendees,
ownership, editability, and read-only reason. Events from
external organizers are included when their calendar source is active, but
remain read-only in DMAX. Event-list reads use Google partial-response fields,
a short in-memory per-source/range cache, in-flight request deduplication, and
an 8s Google fetch timeout so a slow provider call does not keep `/calendar`
loading indefinitely. Loading a calendar range also prefetches the following
two one-week ranges in the background so near-future week navigation can hit the
local cache. Cache entries are invalidated after Google event
create/update/delete, binding link/unlink, OAuth, and calendar-source changes.
Google OAuth now
requests calendar write scope; existing read-only token files may need
reconnecting before write actions succeed. Ideas are loose thoughts
without time binding, and habits are ongoing practices without a clear
start/end. Categories are life areas; their `description` field is Markdown for
scope, current situation/satisfaction, target state, and high-level measures.
Categories also have an auto-assigned `color` used by the timeline UI and an
auto-assigned `emoji` used by the life-area UI. The agent tools do not expose
emoji editing. `Inbox` is a system category used as the fallback when category
placement is unclear. There are no exploratory memory tables or session-summary
tables.

## Runtime And Provider State

- Runtime: OpenClaw plus deterministic d-max MCP tools.
- Historical OpenClaw/browser-chat latency handoffs are archived under
  `docs/archive/session-handoffs/`. The latest preserved latency handoff is
  `docs/archive/session-handoffs/session-handoff-openclaw-latency-2026-05-02.md`;
  read it as background before continuing latency work, then verify against
  current code and runtime behavior.
- Tools cover categories, initiatives, tasks, and task checklist items.
  Initiative tools expose the `type` field for `idea`, `project`, and `habit`,
  `parentId`, `projectPhase` for `type=project`, plus `startDate`/`endDate` for
  time-bounded `type=project` initiatives. Parent/children hierarchy uses
  `updateInitiative(parentId)`.
  Initiative relation tools can list, create, delete, and graph directed
  predecessor/successor links; natural language like "B follows A" maps to A
  precedes B.
  Checklist tools can list, create, update, delete, and reorder items inside a
  task. Media tools can list, link, update, remove, and reorder existing media
  attachments for categories, initiatives, and tasks; browser/API upload creates
  the underlying binary assets.
- Browser app-chat context includes initiative/task media summaries and
  initiative precedence/parent context, but the static `OPENCLAW_TOOL_CONTEXT`
  summary in `src/chat/app-chat.ts` currently omits the initiative-relation
  tool names even though the MCP tools are registered and allowed.
- Risky tool calls return `requiresConfirmation` unless the ToolRunner is
  invoked with an explicit trusted confirmation context. Normal MCP/OpenClaw
  tool calls cannot self-confirm by setting `confirmed: true`.
- The API server warms the local OpenClaw gateway on startup. App chat also
  watches the OpenClaw session file as a fallback when the gateway request does
  not return its final payload reliably.
- Local development is started through `npm run dev`. That command warms the
  local OpenClaw gateway first and only then starts the API in watch mode plus
  the Vite web app; it starts the Drive voice agent too when LiveKit env vars
  are configured. API changes under `src/` restart the local API automatically.
- The web-chat OpenClaw config is intentionally narrow. It keeps the browser
  chat path on OpenClaw/Codex while disabling OpenClaw memory-core for this
  runtime; d-max initiative memory remains the SQLite/markdown source of truth.
- During OpenClaw cold start, d-max treats a bound gateway port as an existing
  startup in progress and does not repeatedly restart the gateway.
- The browser polls `/api/openclaw/status` every 15s. The status is shown in the
  global `DMAX` agent button, not as a separate sidebar item.
- Local OpenClaw uses `openai-codex/gpt-5.5`; do not route Telegram/app chat
  back to plain OpenAI API unless explicitly experimenting.

## Browser App

Run:

```bash
npm run dev
```

This is the standard local start command. It warms OpenClaw first, starts the
API in watch mode and Vite, and conditionally starts `voice:agent -- --watch`
when LiveKit is configured.

Implemented behavior:

- Vite/React shell with route-level views.
- Sidebar brand is minimal: a lime `D` mark plus `MAX`, no subline. It links to
  `/projects`.
- Main sidebar navigation items are real links. Normal clicks use client-side
  navigation; Ctrl/Cmd-click and middle-click open the route in a new tab.
- A global `DMAX` button is fixed at the top right of the main app area. It
  opens/closes the contextual d-max drawer for the current route context, or
  falls back to Global Chat when no route context is available.
- The `DMAX` button represents the OpenClaw agent and includes availability:
  green dot for `ready` with no extra text, yellow dot plus `Starting...` for
  `starting`, and red dot plus `Offline` for `unavailable`. Tooltips explain
  each state. There is intentionally no restart click yet; that would need a
  separate backend restart endpoint.
- There is no standalone global chat page; d-max chat UI is the contextual
  drawer used from overview/category/initiative/task contexts.
- Chat voice message UX: record full message, show sound bar, then send.
- App chat rejects concurrent turns in the same conversation before persisting
  a duplicate user message.
- App refreshes data after mutations and via polling; normal navigation should
  not require manual reload.
- Agent/tool state writes emit `app_state_events`; the browser subscribes via
  SSE and refetches visible state without a manual page reload.
- `/categories`: first main navigation item. Shows all categories as
  life areas and groups their initiatives by `idea`, `project`, and `habit`.
  Category rows show the category emoji instead of the color dot.
  There is intentionally no category creation UI in this view; new life areas
  are created through DMAX/agent flows.
- `/categories/:categoryName`: life-area detail page with category name,
  editable Markdown description, and grouped initiatives (`idea`, `project`,
  `habit`).
- `/ideas`, `/projects`, and `/habits`: separate grouped-by-category pages.
  Each page shows only its own type, has a compact create row with the type
  implied by the page, and no type filters. The `/projects` create row supports
  optional start/end dates; when the end/till picker is empty and start/from is
  set, opening the end picker primes the native calendar to the start month.
  The `/projects` page groups predecessor/successor projects next to each other
  in horizontal rows and renders child projects underneath their parents.
  Category clicks stay within the current type page.
- `/calendar/timeline`: active `type=project` initiatives with both
  `start_date` and `end_date`, grouped by category color on a horizontal
  timeline. Defaults to previous month through six months ahead, with controls
  for 3/6/12/18 months ahead. Bars are clipped to the visible range and open the
  initiative detail when clicked.
- `/planning-canvas`: manual project planning canvas with a top lane for Google
  Calendar all-day and multi-day events. It has a left
  parking lot of unplaced projects with search and category filters, a
  scrollable/pannable weekly-grid canvas, a red vertical today line, and
  editable project timeline bars. Unplaced project rows show project name,
  category, status, and open task count; clicking one opens its initiative
  detail in a new tab, while dragging it places it on the canvas. Unplaced
  projects with status `completed` or `archived` are hidden from the parking
  lot, but placed projects with those statuses remain visible on the canvas.
  Weekend portions of each week are shaded slightly darker than weekdays. Dated
  project spans render as category-colored time bars or start/end markers on
  snapped visual lanes. Projects in `projectPhase = planning` render lighter
  than `doing` projects; completed projects render muted with a strike-through
  label. Clicking a placed timeline opens the initiative detail in a new tab,
  while the pencil control opens the compact edit modal. Dragging a time bar
  shifts the project date range; dragging the left or right handle changes the
  start or end date, and dragging vertically moves the bar between rows unless
  it is the parent handle of a parent-only group. Parent-only groups move
  vertically together by dragging the parent timeline; groups with predecessor
  or successor links move vertically together by dragging the relation line.
  These group moves update only `planning_canvas_nodes.y`, not project dates.
  Hovering a bar reveals edit, predecessor, and successor controls. The canvas
  always renders visible parent-child and predecessor/successor lines between
  placed timelines when both endpoints are visible; predecessor/successor lines
  are plain lines without arrowheads and there are no relation visibility
  toggles. Dragging from the parking lot creates a
  `planning_canvas_nodes` row and assigns a dropped start date plus one-week
  default duration when the project has no dates. Hovering a Google top-lane
  event reveals an eye-off hide action; recurring Google events offer
  instance-vs-series hiding. A lower-left sidebar button such as `2 Google
  Termine ausgeblendet` opens the restore list. Zoom changes the time-axis
  scale and horizontal spacing only.
- `/calendar`: day/week planning view with Google-Calendar-style day columns and
  a 10-minute time grid. Local d-max entries can be created by dragging active
  projects or open project tasks into the grid, moved by drag/drop, resized via
  top/bottom handles, deleted, and marked done. Project date ranges and
  multi-day timed events appear in the all-day area. That area is split into
  `Fixierte Zeitraeume` for Google all-day/multi-day events plus locked project
  spans, and `Flexible Planung` for unlocked project spans; the flexible lane is
  collapsible and compact by default. Linked project spans render as the DMAX
  project event with a small Google badge rather than duplicating the Google
  event. The selected calendar view is encoded in the URL as
  `/calendar?view=day|week&date=YYYY-MM-DD&allDay=0|1`, so reloads, direct
  links, and browser back/forward preserve the visible timeframe. Configured
  Google calendar sources are fetched live through the Google Calendar API after
  OAuth is connected in `/config`. Google-only events are clickable and open a
  compact metadata/edit modal showing calendar, time, editability, last Google
  update, organizer, and attendees when available. Writable, non-recurring,
  self-organized Google-only events can be edited in the modal without creating
  DMAX objects. Link/promote choices for existing project, new project,
  project entry, existing task, or new task are progressively disclosed and
  committed through the modal's single `Speichern` action. Local timed DMAX
  `calendar_entries` can be published to a writable Google calendar from their
  calendar card. Linked events can be unlinked, with an explicit prompt for
  whether the Google event should also be deleted. Google source/auth/sync
  failures appear as dismissible warning banners instead of failing the entire
  calendar view. The frontend calendar view is split into a lazy-loaded
  `CalendarRoute` chunk so non-calendar routes do not parse the calendar UI
  module at startup.
- `/config`: configuration surface for Google Calendar accounts and DMAX
  calendar sources. It has a single `Google-Konto hinzufuegen` action that
  opens an OAuth modal, then renders one card per known Google account. Each
  card shows the account label with `(verbunden)` in green or `(getrennt)` in
  red, account-level reconnect/disconnect controls, and the calendars available
  through that account. Calendar rows can be added to or removed from DMAX; this
  toggles the corresponding `calendar_sources.enabled` selection. The separate
  `DMAX-Kalenderquellen` section lists only active DMAX-side calendar source
  selections. Source rows store provider/account/calendar/display metadata and
  enabled/read-only flags only; no credentials or provider tokens. Writable
  Google calendar sources can be toggled to allow DMAX write actions; calendars
  discovered from Google default to read-only unless Google reports owner/writer
  access.
- `/initiatives/:id`: type badge, editable basic fields (name, category, status,
  summary, `projectPhase` for `type=project`, and start/end dates for
  `type=project`), markdown initiative memory rendered as UI, media attachments
  with upload/preview/caption/remove controls, linked tasks, and a bottom
  `Relations` panel. `Relations` shows Parent, Children, Predecessors, and
  Successors in a two-by-two grid, starts collapsed when the initiative has no
  relations, and uses compact list rows with `I`/`P` markers for idea/project
  rows. Relation selectors are grouped by category: the current initiative's
  category appears first, remaining categories are alphabetical, and only
  `idea` and `project` candidates are selectable (`habit` is hidden from these
  selectors). Each relation group can also create a new `idea` or `project` and
  immediately attach it as parent, child, predecessor, or successor. Media
  attachments open a modal for images, PDFs, text documents, audio, video, and
  generic documents. Linked task rows show due dates when present, use only the
  left completion toggle for open/done, and expose a right-side delete action
  with a confirmation dialog explaining that notes, checklist, and media links
  are removed too.
- `/tasks/:id`: task detail with an open/done status toggle, priority,
  due/completed/updated dates, checklist items, notes, media attachments with
  upload/preview/caption/remove controls and the same media modal, Back to
  Tasks, and Back to Initiative. Checklist items can be created, renamed,
  checked off, deleted, and reordered in the task detail view only.
- `/drive`: LiveKit room creation, browser mic publishing, audio meter,
  start/end controls.
- `/prompts`: debug view for prompts sent to OpenClaw.
- `/prompt-vorlagen`: accordion overview of the conversation contexts defined in
  `src/chat/conversation-context.ts`, with route and prompt template per context.
  Current route contexts include `categories`, `category`, `ideas`, `idea`,
  `projects`, `project`, `habits`, `habit`, `tasks`, and `task`; legacy
  `initiatives`/`initiative` remains accepted for compatibility.

## API Server

Implemented in `src/api/server.ts`.

```text
GET  /health
GET  /api/app/overview
GET  /api/calendar
GET  /api/calendar/hidden-events
POST /api/calendar/hidden-events
DELETE /api/calendar/hidden-events/:id
POST /api/calendar/entries
PATCH /api/calendar/entries/:id
POST /api/calendar/entries/:id/complete
POST /api/calendar/google-only-events
DELETE /api/calendar/entries/:id
POST /api/calendar/google-events
PATCH /api/calendar/google-events
POST /api/calendar/bindings/from-google
DELETE /api/calendar/bindings/:id
GET  /api/config/calendar-sources
POST /api/config/calendar-sources
PATCH /api/config/calendar-sources/:id
GET  /api/config/google-calendar/status
GET  /api/config/google-calendar/accounts
POST /api/config/google-calendar/auth-url
GET  /api/config/google-calendar/calendars
GET  /api/config/google-calendar/oauth/callback
POST /api/config/google-calendar/disconnect
GET  /api/categories
POST /api/categories
PATCH /api/categories/:id
PATCH /api/categories/order
GET  /api/initiatives
POST /api/initiatives
GET  /api/initiatives/:id
PATCH /api/initiatives/:id
PATCH /api/initiatives/order
GET  /api/initiative-relations
POST /api/initiative-relations
DELETE /api/initiative-relations/:id
GET  /api/initiative-graph
GET  /api/planning-canvas
POST /api/planning-canvas/nodes
PATCH /api/planning-canvas/nodes/:id
DELETE /api/planning-canvas/nodes/:id
GET  /api/tasks
GET  /api/tasks/:id
PATCH /api/tasks/:id
DELETE /api/tasks/:id
POST /api/tasks/:id/complete
PATCH /api/tasks/order
POST /api/tasks/:id/checklist-items
PATCH /api/tasks/:id/checklist-items
PATCH /api/tasks/:id/checklist-items/order
PATCH /api/tasks/:id/checklist-items/:itemId
DELETE /api/tasks/:id/checklist-items/:itemId
POST /api/media/attachments
GET  /api/media/assets/:id
PATCH /api/media/assets/:id
POST /api/media/assets/:id/analyze
GET  /api/media/assets/:id/file
GET  /api/media/links
POST /api/media/links
PATCH /api/media/links/:id
PATCH /api/media/links/order
DELETE /api/media/links/:id
GET  /api/chat/conversations
POST /api/chat/conversations
GET  /api/chat/messages
GET  /api/chat/activity
POST /api/chat/message
POST /api/chat/message/stream
POST /api/chat/voice/transcribe
GET  /api/debug/prompts
GET  /api/debug/prompt-templates
GET  /api/state/events
POST /api/voice/session
```

Compatibility: `/api/projects`, `/api/projects/:id`, and
`/api/projects/order` are still accepted as transitional HTTP aliases for old
bookmarks/clients, but new code should use `/api/initiatives`.

Boundary: explicit UI actions use API routes/repositories. Telegram and app
chat natural-language turns use OpenClaw plus d-max tools. Browser Drive Mode
currently bridges realtime audio to xAI; it does not yet perform durable
ToolRunner state changes.

## Realtime Voice

Current browser-first path:

```text
Browser Drive Mode -> LiveKit room -> d-max LiveKit agent
-> xAI realtime voice session
```

Implemented:

- LiveKit browser token endpoint: `POST /api/voice/session`.
- Browser Drive Mode joins room and publishes mic audio.
- `src/voice/livekit-agent.ts`: watches latest registered room, joins as
  d-max, consumes browser audio, forwards PCM16 to xAI, publishes model audio
  back to LiveKit.
- `src/voice/xai-realtime-session.ts`: xAI realtime WebSocket wrapper.
- `src/voice/drive-mode-instructions.ts`: drive-mode voice policy.

Hardening left:

- Measure end-to-end latency and interruption behavior across LiveKit/xAI.
- Implement robust realtime provider tool-calling.
- Improve session event observability and latency metrics.
- Make pending action ledger durable before production voice commits.

Known issue:

- Drive Mode can speak/listen through xAI, but durable initiative/task commits from
  realtime voice are not wired after the exploratory memory removal.

## Known Hardening

- Add repository/API/tool-level cycle protection for `initiatives.parent_id`.
- Enforce project-only semantics for `project_phase`, `start_date`, and
  `end_date`, or explicitly clear those fields when an initiative becomes an
  idea or habit.
- Align media API schemas with implemented support: either narrow accepted
  `entityType` values to category/initiative/task or implement
  `calendar_entry` and `app_chat_message` attachment validation and UI.
- Add initiative-relation tools to the browser app-chat static tool-context
  summary so OpenClaw receives the same high-level affordance list that the MCP
  registry exposes.
- Continue advanced Google Calendar integration from
  `docs/google-calendar-integration-plan.md`: a first pragmatic multi-account
  OAuth/token UI exists, but a first-class connected-account table, account
  metadata from Google identity APIs, background sync/webhooks, recurrence for
  habits, attendee/location/reminder fields, default target calendars, and
  deeper sync history are still future work.
- Frontend build uses manual Vite chunks for React, LiveKit, and icons; keep an
  eye on chunk sizes as the browser app grows.

## Environment And Secrets

See `.env.example`.

Core keys: `DATABASE_PATH`, `DMAX_API_PORT`, `DMAX_OPENCLAW_CONFIG_PATH`,
`DMAX_OPENCLAW_STATE_DIR`, `DMAX_OPENCLAW_MODEL`,
`DMAX_OPENCLAW_SESSION_ID`.

Realtime keys: `XAI_API_KEY`, `XAI_REALTIME_MODEL`, `LIVEKIT_URL`,
`LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`.

Telegram/OpenClaw keys: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`;
provider credentials are handled by local OpenClaw/Codex/Gemini config.

Never commit `.env`, local OpenClaw auth state, provider keys, or SQLite runtime
data.

## Verification

Last checked on 2026-05-12:

- `npm run typecheck` passed.
- `npm test` passed: 24 test files, 89 tests.
- `npm run web:build` passed without Vite large-chunk warnings.

```bash
npm run typecheck
npm test
npm run web:build
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.local.json" openclaw models status --json
```

For implemented behavior, prefer `data/schema.sql`, `src/`, `web/`, and
`tests/` over older planning documents.
