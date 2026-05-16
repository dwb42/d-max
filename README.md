# d-max

Agentic initiative, task, and initiative-memory system for Dietrich.

## Current State

Read [docs/current-state.md](docs/current-state.md) first. It is the source of
truth for implemented routes, schema, runtime boundaries, and hardening work.

Read [docs/memory-map.md](docs/memory-map.md) for where Markdown memory belongs.

Agent context/prompt architecture notes live in [docs/agent/](docs/agent/).
Frontend UI governance lives in [docs/ui/](docs/ui/).
Forward-looking post-UI-refactor technical planning lives in
[docs/architecture/DMAX_NEXT_WORK_PLAN.md](docs/architecture/DMAX_NEXT_WORK_PLAN.md).

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
gateway first and then starts the API in watch mode and the Vite web app. API
changes under `src/` restart the local API automatically. If LiveKit is
configured, it also starts the Drive voice agent in watch mode.

Open `http://localhost:5173`.

Run only the MCP server:

```bash
npm run mcp
```

Run the mutating MCP smoke test:

```bash
npm run smoke:mcp
```

## Production Deployment

The production path is a two-container Docker Compose topology:

- `dmax-api`: owns SQLite, media, Google OAuth token files, Telegram/API/static
  web routes, and the current voice code.
- `dmax-openclaw`: owns OpenClaw Gateway 2026.5.12, `OPENCLAW_STATE_DIR`, and
  OpenClaw-managed Codex OAuth state.

`dmax-api` talks to `dmax-openclaw` over the internal Docker network at
`http://dmax-openclaw:18789`; production fails fast if
`DMAX_OPENCLAW_GATEWAY_URL` is missing.

```bash
cp .env.example .env
docker compose build
docker compose up -d
```

Minimum production `.env` settings:

```bash
NODE_ENV=production
DMAX_WEB_BASE_URL=https://dmax.example.com
GOOGLE_OAUTH_REDIRECT_URI=https://dmax.example.com/api/config/google-calendar/oauth/callback
DMAX_HOST_PORT=49415
DMAX_INTERNAL_TOOL_TOKEN=<strong random value>
OPENCLAW_GATEWAY_TOKEN=<strong random value>
```

Set the provider secrets the enabled features need, for example
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_ALLOWED_USER_IDS`, `GEMINI_API_KEY`,
`XAI_API_KEY`, LiveKit credentials, and Google OAuth credentials.
`OPENAI_API_KEY` is only required for direct API-key fallback paths or media
analysis/transcription features that still use OpenAI APIs directly.
`DMAX_WEB_BASE_URL` and `GOOGLE_OAUTH_REDIRECT_URI` must point at the public
domain.

Terminate TLS in a reverse proxy such as Caddy or Nginx and proxy the public
domain to `127.0.0.1:${DMAX_HOST_PORT}`. `docker-compose.yml` binds only
`dmax-api` to localhost; `dmax-openclaw` is exposed only on the internal Docker
network.

Persistent runtime data lives in the named volume `dmax-data` mounted at
`/app/data` in `dmax-api`. This includes SQLite, uploaded media, and Google
OAuth token files. OpenClaw runtime state lives separately in
`dmax-openclaw-state` mounted at `/app/data/openclaw-state` in
`dmax-openclaw`; `dmax-api` mounts that volume read-only at `/app/openclaw-state`
only for transcript/trajectory reads. Database migrations run automatically
when the API server starts.

Telegram is owned by `dmax-api`, not `dmax-openclaw`. When
`TELEGRAM_BOT_TOKEN` and `TELEGRAM_ALLOWED_USER_IDS` are set, `dmax-api` starts
an allowlisted Telegram long-polling bridge and routes authorized text messages
through the existing app-chat/OpenClaw tool path. `dmax-openclaw` keeps its
Telegram channel disabled.

## Production Deployment — Codex/OAuth

Production OpenClaw uses `openai/gpt-5.5` with `agentRuntime.id = "codex"`.
The production image pins OpenClaw 2026.5.12 and `dmax-openclaw` seeds
`@openclaw/codex@2026.5.12` into its active `OPENCLAW_STATE_DIR` at boot.
Codex OAuth state belongs only in the `dmax-openclaw-state` volume. Do not copy
OAuth tokens into the repo, the image, `.env`, or `/root/.codex`.

First-time Codex OAuth login on the VPS:

1. In the ChatGPT account, open `chatgpt.com/#settings`, then Security,
   Advanced Security, and enable "Autorisierung per Gerätecode für Codex
   aktivieren".
2. Start the OpenClaw-managed ChatGPT device-code login inside
   `dmax-openclaw`:

   ```bash
   docker compose exec dmax-openclaw sh -lc \
     'OPENCLAW_CONFIG_PATH=/app/openclaw/config.production-512.json OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw models auth login --provider openai-codex --method device-code'
   ```

3. Complete the browser device authorization shown by that command. Do not
   paste device codes, account emails, or tokens into issue trackers, docs, or
   chat logs.
4. Trigger the first backend connection from `dmax-api`:

   ```bash
   curl -fsS http://127.0.0.1:${DMAX_HOST_PORT:-49415}/api/openclaw/status
   ```

5. Approve the backend gateway device request inside `dmax-openclaw`:

   ```bash
   docker compose exec dmax-openclaw sh -lc \
     'OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw devices list'

   docker compose exec dmax-openclaw sh -lc \
     'OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw devices approve <requestId>'
   ```

6. Restart `dmax-openclaw`, then verify `dmax-api` reconnects:

   ```bash
   docker compose restart dmax-openclaw
   curl -fsS http://127.0.0.1:${DMAX_HOST_PORT:-49415}/api/openclaw/status
   ```

Re-login when tokens are revoked or when switching accounts:

```bash
docker compose down
docker volume rm <project>_dmax-openclaw-state
docker compose up -d
```

Then repeat the first-time login steps. The volume is the source of truth for
Codex OAuth state.

Production smoke checks:

```bash
curl -i http://localhost:${DMAX_HOST_PORT:-49415}/health
curl -I http://localhost:${DMAX_HOST_PORT:-49415}/
curl -I http://localhost:${DMAX_HOST_PORT:-49415}/unknown/spa/route
curl -fsS http://localhost:${DMAX_HOST_PORT:-49415}/api/openclaw/status
docker compose exec dmax-openclaw openclaw --version
docker compose exec dmax-openclaw sh -lc \
  'OPENCLAW_CONFIG_PATH=/app/openclaw/config.production-512.json OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw plugins list --json'
```

After Codex OAuth and backend device approval are complete, run the production
topology latency/tool-call harness from the repo checkout:

```bash
DMAX_HOST_PORT=${DMAX_HOST_PORT:-49415} \
npm run validate:prod-topology -- --project <compose-project-name>
```

Expected production OpenClaw version is `OpenClaw 2026.5.12 (f066dd2)`.
The default agent in `openclaw/config.production-512.json` allows only
`d-max__...` tools. Web/research remains separated in the `dmax-research`
agent.

Rollback to the prior single-container production layout is a git operation,
not a token-copy operation:

```bash
docker compose down
git restore \
  AGENTS.md \
  .env.example \
  Dockerfile \
  README.md \
  docker-compose.yml \
  docs/current-state.md \
  openclaw/config.production.json \
  package.json \
  scripts/start-container.sh \
  scripts/start-prod.ts \
  src/api/server.ts \
  src/chat/openclaw-agent.ts \
  src/config/env.ts \
  tests/openclaw/config-web-tools.test.ts
rm -f \
  docker-compose.staging-512.yml \
  docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PLAN.md \
  docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PRODUCTION_PROMOTION_VALIDATION_2026-05-16.md \
  docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PROMOTION_PLAN_2026-05-16.md \
  docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_STAGING_REPORT_2026-05-16.md \
  docs/archive/session-handoffs/session-handoff-openclaw-512-dmax-dynamic-tools-staging-2026-05-16.md \
  docs/archive/session-handoffs/session-handoff-openclaw-512-dmax-mcp-staging-2026-05-16.md \
  docs/archive/session-handoffs/session-handoff-openclaw-512-staging-2026-05-16.md \
  docs/archive/session-handoffs/session-handoff-openclaw-512-two-container-plan-2026-05-16.md \
  openclaw/config.production-512.json \
  openclaw/config.staging-512.json \
  scripts/validate-prod-topology.ts \
  src/telegram/bot.ts \
  tests/api/internal-openclaw-tools.test.ts \
  tests/chat/openclaw-external-gateway.test.ts \
  tests/openclaw/dmax-dynamic-tools-http-adapter.test.ts \
  tests/openclaw/dmax-dynamic-tools-plugin.test.ts \
  tests/openclaw/prod-topology-validation-harness.test.ts \
  tests/openclaw/production-compose.test.ts \
  tests/openclaw/production-rollback-docs.test.ts \
  tests/telegram/bot.test.ts
rm -rf openclaw/plugins/dmax-dynamic-tools src/telegram tests/telegram
docker compose build
docker compose up -d
```

Never copy OAuth/device auth state from Docker volumes into the repo or image
during rollback.

The API server serves the Vite build directly. `/assets/*` responses are cached
with immutable long-term cache headers; `index.html` and SPA fallbacks use
`Cache-Control: no-cache`.

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

Media uploads and generated chat audio replies default to local files under `data/media` with metadata in SQLite.
Override with `DMAX_MEDIA_STORAGE_DIR` and `DMAX_MEDIA_MAX_UPLOAD_BYTES` when
needed. Uploaded media is analyzed immediately when possible:
text/Markdown locally, audio/video through `OPENAI_TRANSCRIBE_MODEL`, and
images/PDFs through `OPENAI_MEDIA_ANALYSIS_MODEL` when `OPENAI_API_KEY` is set.
Stored analysis text can be edited in the media modal, and media analysis can
be regenerated with an optional user focus prompt. OpenClaw/app chat receives
media metadata and derived text, not raw file bytes.
Chat Drawer voice-input replies can additionally generate stored TTS audio via
`OPENAI_TTS_MODEL` and `OPENAI_TTS_VOICE`; the drawer keeps the text reply,
shows a touch-friendly audio player with seeking, and attempts autoplay after
generation when browser policy allows it.

## OpenClaw Checks

```bash
npm install -g openclaw@2026.5.12
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

Last context-sync verification: 2026-05-15. The commands below passed locally.

```bash
npm run typecheck
npm test
npm run web:build
docker compose build
docker compose up -d --force-recreate
curl -i http://localhost:49415/health
curl -I http://localhost:49415/
```

## Secrets

Do not commit `.env`, Telegram bot tokens, provider API keys, local SQLite
files, or OpenClaw local runtime/auth state.
