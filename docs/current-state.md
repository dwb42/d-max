# d-max Current State

Date: 2026-05-01

Short handoff for fresh Codex/OpenClaw sessions. This file describes the
implemented repository state; older plans are historical unless this file or
code says otherwise.

## Snapshot

d-max is Dietrich's agentic project, task, and project-memory system.

Active interfaces:

- Telegram bot for daily text and voice use.
- Browser app for `/drive`, `/projects`, `/projects/:categoryName`,
  `/projects/:id`, `/tasks`, `/tasks/:id`, and `/prompts`.
- Browser/WebRTC realtime voice prototype using LiveKit and xAI realtime voice.

SQLite is the source of truth. Durable state changes go through tools/API
services.

## Data Model

SQLite tables:

```text
categories, projects, tasks,
app_chat_messages, app_conversations, app_prompt_logs, app_state_events
```

`projects.markdown` is required project memory. There are no exploratory memory
tables or session-summary tables.

## Runtime And Provider State

- Runtime: OpenClaw plus deterministic d-max MCP tools.
- Tools cover categories, projects, and tasks.
- Local OpenClaw uses `openai-codex/gpt-5.5`; do not route Telegram/app chat
  back to plain OpenAI API unless explicitly experimenting.

## Browser App

Run:

```bash
npm run dev:app
```

Starts API, Vite web app, and `voice:agent -- --watch`.

Implemented behavior:

- Vite/React shell with route-level views.
- Header logo links to `/projects`.
- There is no standalone global chat page; d-max chat UI is the contextual
  drawer used from overview/category/project/task contexts.
- Chat voice message UX: record full message, show sound bar, then send.
- App refreshes data after mutations and via polling; normal navigation should
  not require manual reload.
- Agent/tool state writes emit `app_state_events`; the browser subscribes via
  SSE and refetches visible state without a manual page reload.
- `/projects`: grouped by category; clicking a category opens
  `/projects/<category_name>` for that category.
- `/projects/:id`: markdown project memory rendered as UI, Back to Projects
  plus Back to current category, linked tasks below project memory.
- `/tasks/:id`: task detail with status, priority, due/completed/updated dates,
  notes, Back to Tasks, Back to Project, and status actions.
- `/drive`: LiveKit room creation, browser mic publishing, audio meter,
  start/end controls.
- `/prompts`: debug view for prompts sent to OpenClaw.

## API Server

Implemented in `src/api/server.ts`.

```text
GET  /health
GET  /api/app/overview
GET  /api/categories
POST /api/categories
PATCH /api/categories/order
GET  /api/projects
GET  /api/projects/:id
PATCH /api/projects/order
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
GET  /api/state/events
POST /api/voice/session
```

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

- Drive Mode can speak/listen through xAI, but durable project/task commits from
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
