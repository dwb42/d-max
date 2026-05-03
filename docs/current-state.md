# d-max Current State

Date: 2026-05-03

Short handoff for fresh Codex/OpenClaw sessions. This file describes the
implemented repository state; older plans are historical unless this file or
code says otherwise.

## Snapshot

d-max is Dietrich's agentic initiative, task, and initiative-memory system.

Active interfaces:

- Telegram bot for daily text and voice use.
- Browser app for `/drive`, `/categories`, `/categories/:categoryName`,
  `/calendar/timeline`, `/ideas`, `/ideas/:categoryName`, `/projects`,
  `/projects/:categoryName`, `/habits`, `/habits/:categoryName`,
  `/initiatives/:id`, `/tasks`, `/tasks/:id`, `/prompt-vorlagen`, and `/prompts`.
- Browser/WebRTC realtime voice prototype using LiveKit and xAI realtime voice.

SQLite is the source of truth. Durable state changes go through tools/API
services.

## Data Model

SQLite tables:

```text
categories, initiatives, tasks,
app_chat_messages, app_conversations, app_prompt_logs, app_state_events
```

`initiatives.markdown` is required initiative memory. `initiatives.type` segments the
current technical Initiative object into `idea`, `project`, and `habit`; existing
initiatives default to `project`. Initiatives with `type = project` may have
nullable `start_date` and `end_date` fields for a bounded initiative time span;
ideas are loose thoughts without time binding, and habits are ongoing practices
without a clear start/end. Categories are life areas; their `description` field
is Markdown for scope, current situation/satisfaction, target state, and
high-level measures. Categories also have an auto-assigned `color` used by the
timeline UI and an auto-assigned `emoji` used by the life-area UI. The agent
tools do not expose emoji editing. `Inbox` is a system category used as the
fallback when category placement is unclear. There are no exploratory memory
tables or session-summary tables.

## Runtime And Provider State

- Runtime: OpenClaw plus deterministic d-max MCP tools.
- Current OpenClaw/browser-chat latency handoff:
  `docs/session-handoff-openclaw-latency-2026-05-02.md`. Read it before
  continuing latency work; it captures the measured bottlenecks, recent
  OpenClaw agent changes, and next targets.
- Tools cover categories, initiatives, and tasks. Initiative tools expose the
  `type` field for `idea`, `project`, and `habit`, plus `startDate`/`endDate`
  for time-bounded `type=project` initiatives.
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
  optional start/end dates. Category clicks stay within the current type page.
- `/calendar/timeline`: active `type=project` initiatives with both
  `start_date` and `end_date`, grouped by category color on a horizontal
  timeline. Defaults to previous month through six months ahead, with controls
  for 3/6/12/18 months ahead. Bars are clipped to the visible range and open the
  initiative detail when clicked.
- `/initiatives/:id`: type badge, editable basic fields (name, category, status,
  summary, and start/end dates for `type=project`), markdown initiative memory
  rendered as UI, Back to the current type page/category, linked tasks below
  initiative memory.
- `/tasks/:id`: task detail with status, priority, due/completed/updated dates,
  notes, Back to Tasks, Back to Initiative, and status actions.
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
GET  /api/categories
POST /api/categories
PATCH /api/categories/:id
PATCH /api/categories/order
GET  /api/initiatives
POST /api/initiatives
GET  /api/initiatives/:id
PATCH /api/initiatives/:id
PATCH /api/initiatives/order
GET  /api/tasks
GET  /api/tasks/:id
PATCH /api/tasks/:id
POST /api/tasks/:id/complete
PATCH /api/tasks/order
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

```bash
npm run typecheck
npm test
npm run web:build
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.local.json" openclaw models status --json
```

For implemented behavior, prefer `data/schema.sql`, `src/`, `web/`, and
`tests/` over older planning documents.
