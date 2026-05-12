# d-max

Agentic initiative, task, and initiative-memory system for Dietrich.

## Current State

Read [docs/current-state.md](docs/current-state.md) first. It is the source of
truth for implemented routes, schema, runtime boundaries, and hardening work.

Read [docs/memory-map.md](docs/memory-map.md) for where Markdown memory belongs.

## Local Setup

```bash
npm install
cp .env.example .env
npm run setup
```

Run the app stack:

```bash
npm run dev
```

`npm run dev` is the default local entrypoint. It warms the local OpenClaw
gateway first and then starts the API and Vite web app. If LiveKit is configured,
it also starts the Drive voice agent in watch mode.

Open `http://localhost:5173`.

Run only the MCP server:

```bash
npm run mcp
```

Run the mutating MCP smoke test:

```bash
npm run smoke:mcp
```

LiveKit Drive Mode requires `LIVEKIT_URL`, `LIVEKIT_API_KEY`, and
`LIVEKIT_API_SECRET`. xAI realtime voice requires `XAI_API_KEY`.

Google Calendar integration requires a Google OAuth web client:

```bash
GOOGLE_OAUTH_CLIENT_ID=...
GOOGLE_OAUTH_CLIENT_SECRET=...
GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3088/api/config/google-calendar/oauth/callback
```

Then open `/config`, connect Google, and add the calendar IDs that should appear
in `/calendar`. The config UI supports multiple Google accounts: connect each
account via OAuth, then enable the calendars DMAX should read/write from that
account. Those enabled selections are stored as DMAX calendar sources.

Media uploads default to local files under `data/media` with metadata in SQLite.
Override with `DMAX_MEDIA_STORAGE_DIR` and `DMAX_MEDIA_MAX_UPLOAD_BYTES` when
needed. Uploaded media is analyzed immediately when possible:
text/Markdown locally, audio/video through `OPENAI_TRANSCRIBE_MODEL`, and
images/PDFs through `OPENAI_MEDIA_ANALYSIS_MODEL` when `OPENAI_API_KEY` is set.
Stored analysis text can be edited in the media modal, and media analysis can
be regenerated with an optional user focus prompt. OpenClaw/app chat receives
media metadata and derived text, not raw file bytes.

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
  --session-id dmax-manual-test \
  --message "Lege im Projekt Health Rhythm eine Aufgabe an: Trainingsplan prüfen." \
  --json \
  --timeout 240
```

## Verification

Last context-sync verification: 2026-05-12. The commands below passed locally.

```bash
npm run typecheck
npm test
npm run web:build
```

## Secrets

Do not commit `.env`, Telegram bot tokens, provider API keys, local SQLite
files, or OpenClaw local runtime/auth state.
