# d-max

Agentic project, task, and thinking memory system for Dietrich.

## Read First

For a fresh-session handoff, start with [Current State](docs/current-state.md).
It is the compact source of truth for implemented features, routes, provider
state, and open hardening work.

## System

- Local dev bot: d-max-dev
- Production bot: d-max
- Runtime: OpenClaw
- Data layer: SQLite
- Development assistant: Codex
- Browser app: Vite/React
- Realtime voice prototype: LiveKit plus xAI realtime voice

d-max exposes deterministic MCP tools for categories, projects, tasks, and
Thinking Memory. The database is the source of truth; agentic state changes go
through tools.

## Implemented Interfaces

- Telegram text and voice.
- Browser routes: `/chat`, `/drive`, `/brainstorms`, `/projects`,
  `/projects/:categoryName`, `/projects/:id`, `/tasks`, `/tasks/:id`,
  `/review`.
- App chat persists to SQLite and routes through OpenClaw so behavior matches
  Telegram.
- Chat voice messages are recorded with a sound bar, then sent as complete
  messages.
- Drive Mode creates a LiveKit room; the d-max LiveKit agent bridges browser
  audio to xAI realtime voice and can capture transcripts into Thinking Memory.

## Thinking System

Brainstorm is user-facing language. Thinking Memory is the durable model:

```text
thinking spaces, sessions, typed thoughts, thought links, tensions,
open loops, project/task extraction gates
```

Exploratory thoughts may become project/task candidates, but execution entities
are created only after confirmation.

Key docs:

- [Current State](docs/current-state.md)
- [Thinking System Plan](docs/thinking-system-plan.md)
- [Manual Test Guide](docs/thinking-system-manual-test.md)
- [Realtime Voice Plan](docs/realtime-voice-plan.md)
- [App UI Plan](docs/app-ui-plan.md)
- [Archived MVP Plan](docs/archive/mvp-plan.md)

## Local Setup

```bash
npm install
cp .env.example .env
npm run setup
```

Run the MCP server:

```bash
npm run mcp
```

Run the mutating MCP smoke test:

```bash
npm run smoke:mcp
```

Run the browser app, API server, and LiveKit voice agent watcher:

```bash
npm run dev:app
```

Open `http://localhost:5173`.

LiveKit Drive Mode requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and
`LIVEKIT_API_SECRET`. xAI realtime voice requires `XAI_API_KEY`.

## OpenClaw Checks

```bash
npm install -g openclaw@latest
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.example.json" openclaw config validate --json
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.example.json" openclaw mcp show --json
```

Local embedded agent turn:

```bash
OPENCLAW_STATE_DIR=/tmp/d-max-openclaw-state \
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.local.json" \
openclaw agent --local \
  --model openai-codex/gpt-5.5 \
  --session-id dmax-thinking-manual-test \
  --message "Lass uns brainstormen zu Health Rhythm. Ich will fitter werden, aber abends bin ich oft platt." \
  --json \
  --timeout 240
```

## Verification

```bash
npm run typecheck
npm test
npm run web:build
```

Verified local paths are summarized in [Current State](docs/current-state.md).

## Secrets

Do not commit `.env`, Telegram bot tokens, provider API keys, local SQLite
files, or OpenClaw local runtime/auth state.
