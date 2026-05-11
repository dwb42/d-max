# d-max Current State

Date: 2026-05-11

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
  `/initiatives/:id`, `/tasks`, `/tasks/:id`, `/prompt-vorlagen`, and `/prompts`.
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
calendar_entries, calendar_sources,
media_assets, media_links,
app_chat_messages, app_conversations, app_prompt_logs, app_state_events
```

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
`end_date` fields for a bounded initiative time span; those project spans are
editable in the initiative detail header and shown in the `/calendar` all-day
row when they overlap the visible day/week. The product invariant is that
`project_phase`, `start_date`, and `end_date` are meaningful only for
`type = project`; current schemas and repository writes do not yet enforce or
auto-clear those fields for ideas/habits, so callers should not set them on
non-project initiatives.
`planning_canvases` and `planning_canvas_nodes` store a browser-first Planning
Canvas MVP. The repository ensures one `Default` canvas. The current canvas UI
is project-only: it renders and parks only initiatives with `type = project`.
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
such as enabled Google calendar IDs; Google event credentials/tokens are not
stored in SQLite. Google Calendar read-only OAuth stores its local token file at
`GOOGLE_CALENDAR_TOKEN_PATH` under `data/` by default, which is gitignored.
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
`/api/calendar`. Ideas are loose thoughts
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
  local OpenClaw gateway first and only then starts API plus Vite web app; it
  starts the Drive voice agent too when LiveKit env vars are configured.
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

This is the standard local start command. It warms OpenClaw first, starts API
and Vite, and conditionally starts `voice:agent -- --watch` when LiveKit is
configured.

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
- `/planning-canvas`: project-only manual planning canvas. It has a left
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
  default duration when the project has no dates. Zoom changes the time-axis
  scale and horizontal spacing only.
- `/calendar`: day/week planning view with Google-Calendar-style day columns and
  a 10-minute time grid. Local d-max entries can be created by dragging active
  projects or open project tasks into the grid, moved by drag/drop, resized via
  top/bottom handles, deleted, and marked done. Project date ranges appear in
  the all-day row. Configured Google calendar sources are fetched live read-only
  through the Google Calendar API after OAuth is connected in `/config`.
- `/config`: configuration surface for Google calendar sources. It stores
  provider/account/calendar/display metadata and enabled/read-only flags only;
  no credentials or provider tokens.
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
POST /api/calendar/entries
PATCH /api/calendar/entries/:id
POST /api/calendar/entries/:id/complete
DELETE /api/calendar/entries/:id
GET  /api/config/calendar-sources
POST /api/config/calendar-sources
PATCH /api/config/calendar-sources/:id
GET  /api/config/google-calendar/status
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
- Consider frontend code-splitting; `npm run web:build` currently passes but
  warns that the main JavaScript chunk is larger than Vite's default 500 kB
  threshold.

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

Last checked on 2026-05-11:

- `npm run typecheck` passed.
- `npm test` passed: 21 test files, 78 tests.
- `npm run web:build` passed with the known large-chunk warning.

```bash
npm run typecheck
npm test
npm run web:build
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.local.json" openclaw models status --json
```

For implemented behavior, prefer `data/schema.sql`, `src/`, `web/`, and
`tests/` over older planning documents.
