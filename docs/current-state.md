# d-max Current State

Date: 2026-04-30

Short handoff for fresh Codex/OpenClaw sessions. This file describes the
implemented repository state; older plans are historical unless this file or
code says otherwise.

## Snapshot

d-max is Dietrich's agentic project, task, and thinking memory system.

Active interfaces:

- Telegram bot for daily text and voice use.
- Browser app for `/chat`, `/drive`, `/brainstorms`, `/projects`,
  `/projects/:categoryName`, `/projects/:id`, `/tasks`, `/tasks/:id`, and
  `/review`.
- Browser/WebRTC realtime voice prototype using LiveKit, xAI realtime voice,
  and the existing d-max ToolRunner.

Core rule: user-facing language may say Brainstorm; the durable implemented
domain is Thinking Memory. State changes go through tools/API services; SQLite
is the source of truth.

## Data Model

SQLite tables:

```text
categories, projects, tasks,
thinking_spaces, thinking_sessions, thoughts, thought_links, tensions,
app_chat_messages
```

`projects.markdown` is project memory. There is no `brainstorms` table.

## Runtime And Provider State

- Runtime: OpenClaw plus deterministic d-max MCP tools.
- Tools cover categories, projects, tasks, Thinking Memory, open loops, and
  project/task extraction gates.
- Local OpenClaw uses `openai-codex/gpt-5.5`; do not route Telegram/app chat
  back to plain OpenAI API unless explicitly experimenting.
- Verified Telegram paths:
  - text -> OpenClaw -> d-max tools -> SQLite
  - voice -> OpenClaw STT -> d-max tools -> SQLite
  - voice response -> Gemini TTS -> Telegram voice reply
  - Brainstorm/Thinking capture and extraction gates

## Browser App

Run:

```bash
npm run dev:app
```

Starts API, Vite web app, and `voice:agent -- --watch`.

Implemented behavior:

- Vite/React shell with route-level views.
- Header logo links to `/chat`.
- `/chat`: persisted `app_chat_messages`; text and recorded voice messages
  route through OpenClaw so behavior matches Telegram.
- Chat voice message UX: record full message, show sound bar, then send.
- App refreshes data after mutations and via polling; normal navigation should
  not require manual reload.
- `/projects`: grouped by category; clicking a category opens
  `/projects/<category_name>` for that category; category taglines and top
  counters are removed.
- `/projects/:id`: markdown project memory rendered as UI, Back to Projects
  plus Back to current category, linked tasks below project memory, generic
  detail header/tagline removed.
- `/tasks/:id`: task detail with status, priority, due/completed/updated dates,
  notes, Back to Tasks, Back to Project, and status actions.
- `/drive`: LiveKit room creation, browser mic publishing, audio meter,
  start/end controls.

## API Server

Implemented in `src/api/server.ts`.

```text
GET  /health
GET  /api/app/overview
GET  /api/categories
POST /api/categories
GET  /api/projects
GET  /api/projects/:id
GET  /api/tasks
GET  /api/tasks/:id
PATCH /api/tasks/:id
POST /api/tasks/:id/complete
GET  /api/thinking/spaces
GET  /api/thinking/spaces/:id/context
PATCH /api/thinking/thoughts/:id
PATCH /api/thinking/tensions/:id
GET  /api/chat/messages
POST /api/chat/message
POST /api/voice/session
```

Boundary: explicit UI actions use API routes/repositories; natural language
from Telegram, app chat, chat voice messages, and realtime voice uses the
agent/tool boundary.

## Realtime Voice

Current browser-first path:

```text
Browser Drive Mode -> LiveKit room -> d-max LiveKit agent
-> xAI realtime voice session -> voice-safe ToolBridge
-> existing ToolRunner -> SQLite
```

Implemented:

- LiveKit browser token endpoint: `POST /api/voice/session`.
- Browser Drive Mode joins room and publishes mic audio.
- `src/voice/livekit-agent.ts`: watches latest registered room, joins as
  d-max, consumes browser audio, forwards PCM16 to xAI, publishes model audio
  back to LiveKit.
- `src/voice/xai-realtime-session.ts`: xAI realtime WebSocket wrapper.
- `src/voice/drive-mode-instructions.ts`: drive-mode voice policy.
- Transcript capture merges/filters completed transcripts and saves simple
  extracted thoughts into Thinking Memory through `VoiceToolBridge`.
- Voice ToolBridge supports start/resume Brainstorm, capture Thinking Memory,
  render open loops, create pending task actions, and commit confirmed tasks
  through existing tools.
- Tests cover session state, action ledger, audio contracts, event journal,
  Twilio, transcript capture, and tool bridge.

Hardening left:

- Measure end-to-end latency and interruption behavior across LiveKit/xAI.
- Implement robust realtime provider tool-calling, not only transcript capture.
- Improve session event observability and latency metrics.
- Make pending action ledger durable before production voice commits.
- Improve transcript interpretation beyond lightweight heuristics.
- Decide voice event/transcript privacy and retention.

## Telephony

Twilio is no longer first path, but foundation exists:

- `src/voice/server.ts`
- `src/voice/twilio.ts`
- caller allow-listing and TwiML Media Stream tests

Direction: prove browser/WebRTC voice through LiveKit before phone network.

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
