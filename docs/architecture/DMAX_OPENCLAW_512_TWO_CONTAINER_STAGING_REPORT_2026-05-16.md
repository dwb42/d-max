# DMAX OpenClaw 2026.5.12 Two-Container Staging Report

Date: 2026-05-16
Scope: isolated staging only. Production compose/container was not touched.

Superseded for production by
`docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PRODUCTION_PROMOTION_VALIDATION_2026-05-16.md`.
Use this file as staging evidence only; `docker-compose.yml` is now the
two-container production topology.

## Result

VPS readiness: ready for a staged VPS promotion behind an internal Docker network, with two operational prerequisites:

- The `dmax-openclaw` state volume must be authorized for Codex OAuth.
- The `dmax-api` gateway client device must be approved once in the OpenClaw gateway after first boot.

After re-auth and backend device approval, the staging path met the latency gates:

- API `/health`: 2.877s after isolated staging restart.
- OpenClaw TCP/ready through API: 7.488s after isolated staging restart.
- First successful synthetic warmup: 8.067s wall.
- Warm simple turns: total P50 2.941s, P95 3.061s; OpenClaw overhead excluding model P50 1.154s, P95 1.340s.
- Warm DMAX tool-call turns: total P50 4.908s, P95 6.583s; OpenClaw overhead excluding model P50 1.087s, P95 1.340s.
- Post-OpenClaw-restart reconnect chat: 6.545s wall.

## Runtime Facts

Containers:

- `dmax-api`: owns SQLite, media, web/static/API, OAuth app routes, Telegram path, and existing voice code.
- `dmax-openclaw`: runs OpenClaw Gateway and owns `OPENCLAW_STATE_DIR`.

Mount proof:

- `dmax-openclaw`: `/app/data/openclaw-state` is read/write volume `dmax-staging-openclaw-state`; no SQLite/data volume is mounted as DMAX database state.
- `dmax-api`: `/app/data` is read/write volume `dmax-staging-data`; `/app/openclaw-state` is the OpenClaw state volume mounted read-only for transcript/trajectory reads.

Versions:

- OpenClaw: `2026.5.12 (f066dd2)`.
- Codex plugin: `@openclaw/codex@2026.5.12`.
- Codex plugin path: `/app/data/openclaw-state/npm/node_modules/@openclaw/codex`.
- Codex runtime package present globally: `@openai/codex@0.130.0`.

Active route:

- Default model: `openai/gpt-5.5`.
- Agent runtime route: `agents.defaults.models["openai/gpt-5.5"].agentRuntime.id = "codex"`.

Active plugin allowlist:

- `openai`
- `codex`
- `dmax-dynamic-tools`

Loaded plugin evidence:

- `codex`: loaded from `/app/data/openclaw-state/npm/node_modules/@openclaw/codex/dist/index.js`, version `2026.5.12`, trusted official install.
- `dmax-dynamic-tools`: loaded from `/app/openclaw/plugins/dmax-dynamic-tools/index.mjs`, contracts expose 47 DMAX tools.

Default-agent tool proof:

- `main.tools.allow.length = 47`.
- Every allowed default-agent tool starts with `d-max__`.
- Non-DMAX tools found in default agent: none.
- Research/web remains separated in `dmax-research`; default `main` does not expose browser/canvas/media/TTS/sandbox/web/research/memory/provider-sprawl tools.

## DMAX Tool Endpoint

Internal endpoint:

- `POST /internal/openclaw/tools/:toolName`
- Protected by `Authorization: Bearer ${DMAX_INTERNAL_TOOL_TOKEN}`.
- Executes through `createToolRunner()` inside `dmax-api`.
- Preserves DMAX result envelopes, including validation/confirmation/error shapes returned by the existing tool runner.

Adapter:

- `openclaw/plugins/dmax-dynamic-tools/index.mjs` no longer imports SQLite, DMAX repositories, or the DMAX MCP registry.
- `openclaw/plugins/dmax-dynamic-tools/http-adapter.mjs` calls `DMAX_TOOL_ENDPOINT_URL`, defaulting to `http://dmax-api:3088/internal/openclaw/tools`.

Direct endpoint proof from `dmax-openclaw`:

- `d-max__listCategories` via `http://dmax-api:3088/internal/openclaw/tools/listCategories`
- HTTP status: 200
- DMAX result: `ok: true`
- Category count in staging DB: 1
- Round trip: 37ms

Codex harness proof:

- Five tool-call trajectories contain `tool.call` and `tool.result` for `d-max__listCategories`.
- Example trace IDs:
  - `oc512-tool-1-1778930992`
  - `oc512-tool-2-1778930997`
  - `oc512-tool-3-1778931002`
  - `oc512-tool-4-1778931006`
  - `oc512-tool-5-1778931010`

## Measurements

Measurement method:

- API route: `POST http://127.0.0.1:49442/api/chat/message`
- Context: `{"type":"global"}`
- Trace IDs were sent with `x-dmax-trace-id`.
- Wall time came from `curl -w '%{time_total}'`.
- OpenClaw overhead excluding model time was computed from `app_prompt_logs.turn_trace` as:
  `sum(preSessionDelayMs + max(0, sessionToEndedMs - sessionToModelCompletedMs))`.

Startup after isolated staging restart:

| Metric | Value |
| --- | ---: |
| API `/health` | 2.877s |
| OpenClaw TCP ready | 7.488s |
| API sees OpenClaw ready | 7.488s |

First successful synthetic warmup:

| Trace | Reply | Wall | OpenClaw overhead excluding model |
| --- | --- | ---: | ---: |
| `oc512-two-container-warmup-1778930912` | `OK` | 8.067s | 2.415s |

Warm simple turns:

| Trace | Wall | OpenClaw overhead excluding model |
| --- | ---: | ---: |
| `oc512-simple-1-1778930965` | 3.056s | 1.340s |
| `oc512-simple-2-1778930968` | 3.061s | 1.154s |
| `oc512-simple-3-1778930971` | 2.906s | 1.036s |
| `oc512-simple-4-1778930974` | 2.941s | 1.025s |
| `oc512-simple-5-1778930977` | 2.853s | 1.218s |

Summary:

- Total P50/P95: 2.941s / 3.061s.
- OpenClaw overhead excluding model P50/P95: 1.154s / 1.340s.

Warm DMAX tool-call turns:

| Trace | Reply | Activity count | Wall | OpenClaw overhead excluding model |
| --- | --- | ---: | ---: | ---: |
| `oc512-tool-1-1778930992` | `TOOL_OK` | 2 | 4.908s | 1.340s |
| `oc512-tool-2-1778930997` | `TOOL_OK` | 2 | 5.005s | 1.026s |
| `oc512-tool-3-1778931002` | `TOOL_OK` | 2 | 4.413s | 1.150s |
| `oc512-tool-4-1778931006` | `TOOL_OK` | 2 | 4.342s | 1.087s |
| `oc512-tool-5-1778931010` | `TOOL_OK` | 2 | 6.583s | 1.033s |

Summary:

- Total P50/P95: 4.908s / 6.583s.
- OpenClaw overhead excluding model P50/P95: 1.087s / 1.340s.

Restart/reconnect:

- Restarted only the isolated staging OpenClaw/API containers for startup measurement.
- Post-restart API to OpenClaw reconnect chat trace: `oc512-reconnect-1778931087`.
- Reply: `OK`.
- Wall: 6.545s.

## Validation Commands

Start isolated staging:

```sh
DMAX_INTERNAL_TOOL_TOKEN="$(openssl rand -hex 24)" \
OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 24)" \
DMAX_STAGING_HOST_PORT=49442 \
docker compose -f docker-compose.staging-512.yml \
  -p dmax-oc512-two-container-staging up -d --build
```

Authorize Codex in the staging OpenClaw state volume:

```sh
docker exec -it dmax-oc512-two-container-staging-dmax-openclaw-1 \
  openclaw models auth login openai-codex
```

Approve the `dmax-api` backend device after first API connection attempt:

```sh
docker exec -it dmax-oc512-two-container-staging-dmax-openclaw-1 \
  openclaw devices list --url ws://127.0.0.1:18789 --token "$OPENCLAW_GATEWAY_TOKEN"

docker exec -it dmax-oc512-two-container-staging-dmax-openclaw-1 \
  openclaw devices approve <requestId> --url ws://127.0.0.1:18789 --token "$OPENCLAW_GATEWAY_TOKEN"
```

Health:

```sh
curl -fsS http://127.0.0.1:49442/health
curl -fsS http://127.0.0.1:49442/api/openclaw/status
```

Warm simple turn:

```sh
TRACE="oc512-simple-$(date +%s)"
curl -fsS --max-time 180 -w '\nwall=%{time_total}\n' \
  -H 'content-type: application/json' \
  -H "x-dmax-trace-id: $TRACE" \
  -d '{"message":"Warm latency check. Do not use tools. Reply with exactly: OK","context":{"type":"global"}}' \
  http://127.0.0.1:49442/api/chat/message
```

Warm DMAX tool turn:

```sh
TRACE="oc512-tool-$(date +%s)"
curl -fsS --max-time 180 -w '\nwall=%{time_total}\n' \
  -H 'content-type: application/json' \
  -H "x-dmax-trace-id: $TRACE" \
  -d '{"message":"Use the DMAX listCategories tool now. After the tool result returns, reply with exactly: TOOL_OK","context":{"type":"global"}}' \
  http://127.0.0.1:49442/api/chat/message
```

## Tests Run

```sh
npm run typecheck
npm run test -- \
  tests/api/internal-openclaw-tools.test.ts \
  tests/openclaw/config-web-tools.test.ts \
  tests/openclaw/dmax-dynamic-tools-plugin.test.ts \
  tests/openclaw/dmax-dynamic-tools-http-adapter.test.ts \
  tests/chat/openclaw-external-gateway.test.ts
```

Additional focused rerun after gateway-client pairing changes:

```sh
npm run test -- tests/chat/openclaw-external-gateway.test.ts tests/api/internal-openclaw-tools.test.ts
```

## Changed Files

Staging/config:

- `.env.example`
- `Dockerfile`
- `docker-compose.staging-512.yml`
- `openclaw/config.staging-512.json`
- `openclaw/plugins/dmax-dynamic-tools/index.mjs`
- `openclaw/plugins/dmax-dynamic-tools/http-adapter.mjs`
- `openclaw/plugins/dmax-dynamic-tools/openclaw.plugin.json`

Runtime code:

- `src/api/server.ts`
- `src/chat/openclaw-agent.ts`
- `src/config/env.ts`

Tests:

- `tests/api/internal-openclaw-tools.test.ts`
- `tests/chat/openclaw-external-gateway.test.ts`
- `tests/openclaw/config-web-tools.test.ts`
- `tests/openclaw/dmax-dynamic-tools-http-adapter.test.ts`
- `tests/openclaw/dmax-dynamic-tools-plugin.test.ts`

Production pin note:

- `Dockerfile` still defaults to `ARG OPENCLAW_VERSION=2026.4.26`.
- Staging compose overrides the build arg to `2026.5.12`.

## Rollback

Stop isolated staging containers without touching production:

```sh
DMAX_INTERNAL_TOOL_TOKEN=x OPENCLAW_GATEWAY_TOKEN=x DMAX_STAGING_HOST_PORT=49442 \
docker compose -f docker-compose.staging-512.yml \
  -p dmax-oc512-two-container-staging down
```

Remove isolated staging volumes only if their auth/state/data should be discarded:

```sh
docker volume rm \
  dmax-oc512-two-container-staging_dmax-staging-data \
  dmax-oc512-two-container-staging_dmax-staging-openclaw-state
```

Revert repo changes:

```sh
git restore .env.example Dockerfile src/api/server.ts src/chat/openclaw-agent.ts src/config/env.ts tests/openclaw/config-web-tools.test.ts
rm -f docker-compose.staging-512.yml \
  openclaw/config.staging-512.json \
  tests/api/internal-openclaw-tools.test.ts \
  tests/chat/openclaw-external-gateway.test.ts \
  tests/openclaw/dmax-dynamic-tools-http-adapter.test.ts \
  tests/openclaw/dmax-dynamic-tools-plugin.test.ts \
  docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_STAGING_REPORT_2026-05-16.md
rm -rf openclaw/plugins/dmax-dynamic-tools
```

## VPS Promotion Checklist

- Provision two services on the VPS internal Docker network: `dmax-api` and `dmax-openclaw`.
- Keep SQLite/media/web/static/API/Telegram on `dmax-api`.
- Keep OpenClaw Gateway and `OPENCLAW_STATE_DIR` on `dmax-openclaw`.
- Mount `dmax-openclaw` state read-only into `dmax-api` only if transcript/trajectory reads remain required.
- Set strong `DMAX_INTERNAL_TOOL_TOKEN` and `OPENCLAW_GATEWAY_TOKEN` from environment/secrets manager.
- Run Codex OAuth authorization inside the `dmax-openclaw` state volume.
- Approve the `dmax-api` backend gateway device once.
- Confirm `openclaw/config.staging-512.json` validates and loads only `openai`, `codex`, and `dmax-dynamic-tools`.
- Confirm `main.tools.allow` count equals the DMAX registry and contains only `d-max__...`.
- Run one warmup, five simple turns, and five `listCategories` tool turns after deployment.
- Confirm no recurring 8-10s OpenClaw overhead and no 20-50s pre-model stalls.
- At staging time, keep production single-container compose unchanged until this staging path is promoted intentionally.
