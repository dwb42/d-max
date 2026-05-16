# DMAX OpenClaw 2026.5.12 Production Promotion Validation

Date: 2026-05-16
Project: `dmax-two-container-prodtopology`
Scope: fresh local production-topology Compose project only. Existing production-like containers were not touched.

## Result

Repository-side promotion artifacts are in place, and the production topology now starts as two services:

- `dmax-api`: SQLite/media/Google OAuth/API/static web/Telegram/voice owner.
- `dmax-openclaw`: OpenClaw Gateway 2026.5.12 and `OPENCLAW_STATE_DIR` owner.

Fresh local validation reached the OpenClaw gateway transport, API health,
internal DMAX tool endpoint, mount-boundary, config, default-tool, OpenClaw
container restart/reconnect, backend device approval, and Codex-harness chat
latency gates. After re-authenticating OpenClaw-managed Codex OAuth in the
active `dmax-openclaw-state` volume, `npm run validate:prod-topology` passed
the first synthetic warmup, five warm simple turns, five warm
`d-max__listCategories` tool-call turns, OpenClaw overhead P50/P95 gates, and
total wall P50/P95 gates.

No secrets, device codes, OAuth emails, or tokens are recorded here.

## Completion Audit

Objective: make the validated OpenClaw 2026.5.12 two-container architecture the only production architecture.

Concrete success criteria:

- Production `docker-compose.yml` has only the two-container architecture for production traffic: `dmax-api` and `dmax-openclaw`.
- `dmax-api` owns DMAX data/API/static/Telegram/voice concerns and uses an external OpenClaw gateway in production.
- `dmax-openclaw` owns OpenClaw Gateway 2026.5.12, `OPENCLAW_STATE_DIR`, and OpenClaw-managed Codex OAuth state.
- The production default agent uses `openai/gpt-5.5` through `agentRuntime.id = "codex"`, exposes only current `d-max__...` tools, and excludes unrelated default-turn tool/plugin sprawl.
- DMAX deterministic writes still execute in `dmax-api` through `createToolRunner()`, protected by `DMAX_INTERNAL_TOOL_TOKEN`.
- The dynamic OpenClaw plugin remains an HTTP adapter and does not open SQLite or import DMAX repositories.
- Fresh production-topology validation proves startup, readiness, tool visibility/callability, restart/reconnect, and warm simple/tool-call latency gates.
- Docs provide first-boot auth, backend device approval, rollback, validation commands, and a VPS checklist without recording secrets.

Prompt-to-artifact checklist:

| User requirement / gate | Artifact or command checked | Evidence status |
| --- | --- | --- |
| Read canonical repo state first | `AGENTS.md`, `docs/current-state.md`, `docs/memory-map.md`, `README.md`, `data/schema.sql`, `src/core/tool-definitions.ts`, `src/tools/*`, `src/api/server.ts`, `src/chat/*`, `src/voice/*`, `web/src/App.tsx`, `openclaw/workspace/AGENTS.md`, `openclaw/workspace/TOOLS.md`, `tests/` were inspected during promotion work | Done |
| Convert production compose to two services | `docker-compose.yml`; `docker compose -p dmax-two-container-prodtopology config --no-interpolate`; `tests/openclaw/production-compose.test.ts` | Done |
| Add/promote production 2026.5.12 OpenClaw config without account-specific auth metadata | `openclaw/config.production-512.json` and `openclaw/config.production.json`; one-off 2026.5.12 image `openclaw config validate --json` returned valid for both; `tests/openclaw/config-web-tools.test.ts` scans both production config trees for auth emails, token fields, device/user codes, request IDs, and obvious secret prefixes | Done |
| Ensure `main.tools.allow` contains only current `d-max__...` tools | `tests/openclaw/config-web-tools.test.ts`; `openclaw/config.production-512.json`; mirrored `openclaw/config.production.json`; tool count 47, non-DMAX list empty | Done |
| Guard production external gateway requirement and token forwarding | `src/config/env.ts`; `src/chat/openclaw-agent.ts`; `tests/chat/openclaw-external-gateway.test.ts` | Done |
| Keep internal tool endpoint auth and `listCategories` execution | `src/api/server.ts`; `tests/api/internal-openclaw-tools.test.ts`; direct validation call from `dmax-openclaw` to `dmax-api` returned `resultOk: true` | Done |
| Preserve validation / confirmation / error envelopes | `tests/api/internal-openclaw-tools.test.ts` covers validation error, normal tool error, confirmation request, unknown tool | Done |
| Keep dynamic manifest synchronized with DMAX registry | `openclaw/plugins/dmax-dynamic-tools/openclaw.plugin.json`; `tests/openclaw/dmax-dynamic-tools-plugin.test.ts` | Done |
| Prove plugin does not import SQLite/repositories | Recursive scan of `openclaw/plugins/dmax-dynamic-tools/*` in `tests/openclaw/dmax-dynamic-tools-plugin.test.ts` | Done |
| Keep research/web separated in `dmax-research` | `openclaw/config.production-512.json`; mirrored `openclaw/config.production.json`; `tests/openclaw/config-web-tools.test.ts` explicitly keeps web/research and bundled tool groups out of the default agent while allowing `group:web` only through `dmax-research` | Done |
| Validate startup metrics | Fresh isolated `dmax-two-container-prodtopology` run measured API health and gateway ready timing | Done |
| Validate restart/reconnect | Fresh isolated run restarted only `dmax-openclaw`; gateway transport returned to ready state after reconnect. Follow-up audit also approved the fresh backend device request and reached `/api/openclaw/status = ready` | Done |
| Validate first synthetic warmup | `npm run validate:prod-topology -- --project dmax-two-container-prodtopology --api-url http://127.0.0.1:49443`; warmup wall `3.602s`, overhead `1.305s`, one OpenClaw run, no tool activities | Done |
| Validate warm simple turns, 5 runs | Same harness run; 5 simple turns, no tool-call activities, wall P50/P95 `3.322s`/`4.912s`, overhead P50/P95 `1.027s`/`1.185s` | Done |
| Validate warm DMAX tool-call turns, 5 runs | Same harness run; 5 tool turns, each showed `Lebensbereiche laden` start and completion activities for `d-max__listCategories`, wall P50/P95 `4.693s`/`6.600s`, overhead P50/P95 `1.045s`/`1.143s` | Done |
| Validate P50/P95 OpenClaw overhead and total wall targets | Same harness run passed all latency gates | Done |
| Update `AGENTS.md`, `README.md`, and `docs/current-state.md` | All describe the two-container production topology and validation flow; `tests/openclaw/production-rollback-docs.test.ts` guards `AGENTS.md` against stale single-container/current-2026.4.26 production instructions | Done |
| Add promotion validation report | This file | Done |

| Requirement | Evidence | Status |
| --- | --- | --- |
| Production compose runs `dmax-api` and `dmax-openclaw` as separate services | `docker-compose.yml`; `docker compose ... config`; `tests/openclaw/production-compose.test.ts` | Met |
| `dmax-api` owns SQLite, media, web/static/API, Google OAuth, Telegram path, and existing voice code | `docker-compose.yml` mounts `dmax-data:/app/data`; API runs `npm run api:prod`; `src/api/server.ts` starts the API-owned Telegram bridge; `tests/telegram/bot.test.ts`; docs in `README.md` and `docs/current-state.md` | Met |
| `dmax-openclaw` owns Gateway 2026.5.12 and `OPENCLAW_STATE_DIR` | `docker-compose.yml`; `Dockerfile`; `tests/openclaw/production-compose.test.ts` guards `OPENCLAW_VERSION=2026.5.12` and no `latest`; `docker inspect` mount proof; `openclaw --version` | Met |
| `@openclaw/codex@2026.5.12` is installed and loaded from active state dir | `Dockerfile` image package plus compose state-dir seed; runtime proof path `/app/data/openclaw-state/npm/node_modules/@openclaw/codex`; gateway log source path; state-dir bootstrap links global `@openai/codex` into the active state-dir dependency tree | Met |
| Active route is `openai/gpt-5.5` with `agentRuntime.id = "codex"` and token-protected gateway config | `openclaw/config.production-512.json`, mirrored `openclaw/config.production.json`; `tests/openclaw/config-web-tools.test.ts`; gateway log `agent model: openai/gpt-5.5` | Met |
| Default DMAX agent exposes only `d-max__...` tools | `openclaw/config.production-512.json`; mirrored `openclaw/config.production.json`; tool count 47, `nonDmax: []`; config test | Met |
| Browser/canvas/media/TTS/sandbox/web/research/memory/provider sprawl excluded from default turn | `main.tools.allow` is only registry-derived `d-max__...`; research agent is separate | Met |
| Research/web remains separated in `dmax-research` | `openclaw/config.production-512.json`; config test | Met |
| `dmax-dynamic-tools` remains HTTP adapter, no SQLite/repository imports | `openclaw/plugins/dmax-dynamic-tools/*`; recursive plugin scan in `tests/openclaw/dmax-dynamic-tools-plugin.test.ts` | Met |
| Internal `dmax-api` endpoint executes existing tools through `createToolRunner()` and preserves auth/validation/confirmation/error shapes | `src/api/server.ts`; `tests/api/internal-openclaw-tools.test.ts` covers auth, `listCategories`, validation, tool error, confirmation, unknown tool | Met |
| Production `dmax-api` talks to `dmax-openclaw` and does not spawn subprocess | `docker-compose.yml` sets `DMAX_OPENCLAW_GATEWAY_URL`; `command: npm run api:prod`; legacy `start:prod` subprocess entrypoint removed; `src/config/env.ts` production guard; tests verify token forwarding and absence of `start:prod` | Met |
| Production fails fast without `DMAX_OPENCLAW_GATEWAY_URL` | `src/config/env.ts`; `tests/chat/openclaw-external-gateway.test.ts` | Met |
| `dmax-openclaw` must not mount SQLite/DMAX data | `docker inspect` mount proof; exact compose volume allowlist in `tests/openclaw/production-compose.test.ts`; no image-level `/app/data` volume; gateway command unsets inherited API data-path env vars before starting OpenClaw | Met |
| `dmax-api` must not mount Codex auth at `/root/.codex` | `docker-compose.yml`; `docker inspect` mount proof; production compose test | Met |
| Docs describe topology, first-boot auth, backend device approval, rollback, validation commands | `AGENTS.md`, `README.md`, `docs/current-state.md`, this report | Met |
| Fresh local production-topology validation documents versions, route, plugins, default tools, endpoint call, startup, restart, rollback, VPS checklist | This report | Met |
| Codex harness warmup, five simple turns, five tool-call turns, P50/P95 metrics | `npm run validate:prod-topology -- --project dmax-two-container-prodtopology --api-url http://127.0.0.1:49443` passed after provider re-authentication and backend device approval | Met |

Automated verification after the final repo changes:

```sh
npm run typecheck
npm test
npm run web:build
npm run build
```

Result: all passed locally on 2026-05-16 (`npm test`: 36 files, 163 tests).

Focused harness verification:

```sh
npx vitest run --config vitest.config.ts tests/openclaw/prod-topology-validation-harness.test.ts
```

Result: 1 file, 10 tests passed. Coverage includes sanitized model-auth status
reporting, backend pairing request-id redaction, OpenClaw overhead excluding
model time, nearest-rank P50/P95 for five-run sets, exact
`d-max__listCategories` activity gating, unexpected simple-turn tool-use
detection, missing trajectory detection, latency target failures, default
five-run simple/tool validation sample counts, exposed trajectory tool
definition handling, and rejection of production validation sample counts below
five without an uncaught CLI stack trace.

Focused production compose verification:

```sh
npx vitest run --config vitest.config.ts tests/openclaw/production-compose.test.ts
```

Result: 1 file, 9 tests passed. Coverage includes exactly two production
services, the external gateway URL, localhost-only API port binding, no host
port binding for `dmax-openclaw`, OpenClaw token auth command wiring, internal
tool endpoint wiring, required internal tokens, removal of legacy production
subprocess entrypoints, OpenClaw/Codex package pins to 2026.5.12 with no
`latest`, state/data mount separation, inherited API data-path env cleanup in
`dmax-openclaw`, exact `dmax-openclaw` environment key allowlisting, exact
service volume allowlisting, no `.env`/unrelated service-secret inheritance, no
`/root/.codex`, state-dir Codex CLI dependency linking, and no image-level
`/app/data` volume.

Focused production config verification:

```sh
npx vitest run --config vitest.config.ts tests/openclaw/config-web-tools.test.ts
```

Result: 1 file, 13 tests passed. Coverage includes exact current
`d-max__...` tool registry synchronization, production/default route
`openai/gpt-5.5` through `agentRuntime.id = "codex"`, expected production
plugin allowlist, `dmax-research` separation, production config alias mirroring,
and absence of account-specific auth metadata in both production configs.

Focused rollback documentation verification:

```sh
npx vitest run --config vitest.config.ts tests/openclaw/production-rollback-docs.test.ts
```

Result: 1 file, 3 tests passed. Coverage keeps the rollback sections in
`README.md` and this validation report synchronized with the production
promotion artifact list, including the OpenClaw plugin, production config,
validation harness, internal tool tests, Telegram bridge, and rollback-doc
guard itself. It also guards `AGENTS.md` against stale single-container/current
2026.4.26 production instructions.

Focused Telegram bridge verification:

```sh
npx vitest run --config vitest.config.ts tests/telegram/bot.test.ts
```

Result: 1 file, 3 tests passed. Coverage includes authorized Telegram text
routing through the API-owned app-chat service, unauthorized sender ignore
behavior, and startup refusal unless both `TELEGRAM_BOT_TOKEN` and
`TELEGRAM_ALLOWED_USER_IDS` are configured.

Production image config validation:

```sh
DMAX_INTERNAL_TOOL_TOKEN=dummy-internal-token \
OPENCLAW_GATEWAY_TOKEN=dummy-gateway-token \
docker compose -p dmax-config-audit run --rm --no-deps --entrypoint sh dmax-openclaw -lc '
CODEX_PLUGIN_DIR="$OPENCLAW_STATE_DIR/npm/node_modules/@openclaw/codex"
if [ ! -f "$CODEX_PLUGIN_DIR/package.json" ] || ! grep -q "\"version\": \"2026.5.12\"" "$CODEX_PLUGIN_DIR/package.json"; then
  rm -rf "$CODEX_PLUGIN_DIR"
  mkdir -p "$(dirname "$CODEX_PLUGIN_DIR")" "$OPENCLAW_STATE_DIR/npm/node_modules"
  cp -a /usr/local/lib/node_modules/@openclaw/codex "$CODEX_PLUGIN_DIR"
  ln -sfn /usr/local/lib/node_modules/openclaw "$OPENCLAW_STATE_DIR/npm/node_modules/openclaw"
fi
mkdir -p "$OPENCLAW_STATE_DIR/npm/node_modules/@openai"
ln -sfn /usr/local/lib/node_modules/@openai/codex "$OPENCLAW_STATE_DIR/npm/node_modules/@openai/codex"
openclaw --version
openclaw config validate --json
'
```

Result:

```json
{"valid":true,"path":"/app/openclaw/config.production-512.json"}
```

The mirrored production config alias was also validated in the pinned image:

```json
{"valid":true,"path":"/app/openclaw/config.production.json"}
```

Cleanup:

```sh
DMAX_INTERNAL_TOOL_TOKEN=dummy-internal-token \
OPENCLAW_GATEWAY_TOKEN=dummy-gateway-token \
docker compose -p dmax-config-audit down -v --rmi local
```

## Runtime Facts

Versions:

- OpenClaw: `OpenClaw 2026.5.12 (f066dd2)`.
- Codex plugin: `@openclaw/codex@2026.5.12`.
- Codex plugin path: `/app/data/openclaw-state/npm/node_modules/@openclaw/codex`.
- Codex CLI package path: `/app/data/openclaw-state/npm/node_modules/@openai/codex`
  as a symlink to the globally installed image package.

Active route:

- Default model: `openai/gpt-5.5`.
- Agent runtime: `codex`.

Active plugin allowlist:

- `openai`
- `codex`
- `dmax-dynamic-tools`

Fresh isolated runtime plugin proof:

- `openai`: `loaded`, missing dependencies `[]`.
- `codex`: `loaded` from
  `/app/data/openclaw-state/npm/node_modules/@openclaw/codex/dist/index.js`,
  missing dependencies `[]`.
- `dmax-dynamic-tools`: `loaded` from
  `/app/openclaw/plugins/dmax-dynamic-tools/index.mjs`, missing dependencies
  `[]`.

Default-agent tool proof:

- `main.tools.allow.length = 47`.
- Non-DMAX default tools: `[]`.
- Every default-agent tool starts with `d-max__`.
- Research/web remains separated in `dmax-research`.

Mount proof:

- `dmax-api` mounts `dmax-data` read/write at `/app/data`.
- `dmax-api` mounts `dmax-openclaw-state` read-only at `/app/openclaw-state`.
- `dmax-openclaw` mounts only `dmax-openclaw-state` read/write at `/app/data/openclaw-state`.
- `dmax-openclaw` does not mount `dmax-data`.
- `dmax-openclaw` unsets inherited API data-path environment variables before
  starting the gateway.
- `dmax-api` does not mount `/root/.codex`.
- `dmax-api` owns Telegram long polling when Telegram env is configured;
  `dmax-openclaw` keeps `channels.telegram.enabled = false`.

## Measurements

Startup after fresh empty-state project:

| Metric | Value | Gate |
| --- | ---: | ---: |
| API `/health` response | `0.008s` request wall; API was responding within the first observed 8s window | `< 10s` |
| OpenClaw gateway ready from fresh audit start | `12.9s` from gateway startup log to `ready` after the latest compose hardening | `< 20s` preferred |
| API sees OpenClaw gateway transport | `0.039s` request wall in the restart/reconnect probe | passed before auth-backed chat validation |

Initial unauthenticated fresh audit status:

- `dmax-api` `/health`: `{"ok":true}`.
- `dmax-openclaw` container health: healthy.
- `dmax-api` `/api/openclaw/status`: `starting` with backend device pairing
  required. The request id was redacted and is not recorded.
- `dmax-openclaw` process environment check:
  `no_api_data_env_in_openclaw_process`.
- Post-Telegram-bridge isolated smoke:
  - `dmax-api` `/health`: `{"ok":true}`.
  - `dmax-api` log: Telegram bridge skipped because
    `TELEGRAM_ALLOWED_USER_IDS` was not configured.
  - `dmax-openclaw` active plugins: `openai`, `codex`, and
    `dmax-dynamic-tools` all `loaded` with missing dependencies `[]`.
  - Temporary compose project `dmax-two-container-telegram-audit` was removed
    with volumes and local images.

Restart/reconnect:

- Restarted only `dmax-openclaw`.
- Gateway ready after restart: about `2.9s` from gateway startup log to HTTP listening, `3.0s` to ready.
- `dmax-api` reconnected to the restarted gateway transport immediately after the restart command completed.
- End-to-end model turns after restart are intentionally not marked validated until the active `dmax-openclaw-state` volume has usable provider OAuth.

Auth-backed validation:

- Started `dmax-two-container-prodtopology` with the production Compose
  topology.
- Re-authenticated OpenClaw-managed Codex OAuth in the active
  `dmax-openclaw-state` volume, without writing auth material to the repo or
  image.
- Approved the pending backend device request in the production-topology
  OpenClaw state volume. The request id was redacted and is not recorded.
- Verified `dmax-api` `/api/openclaw/status`: `ready`.
- Verified sanitized model status:
  `{"missingProvidersInUse":[]}`.
- Ran `npm run validate:prod-topology -- --project dmax-two-container-prodtopology --api-url http://127.0.0.1:49443`.
- Result: `Production topology validation: PASS`.

Tool endpoint proof:

- Request from inside `dmax-openclaw` to `http://dmax-api:3088/internal/openclaw/tools/listCategories`.
- HTTP status: `200`.
- Response envelope: `{ ok: true, resultOk: true, count: 1 }`.

Auth-backed latency/tool metrics:

| Metric | Value | Gate |
| --- | ---: | ---: |
| Warmup wall / overhead | `3.602s` / `1.305s` | wall `< 10s` |
| Simple wall P50/P95 | `3.322s` / `4.912s` | P95 `< 6s` |
| Simple OpenClaw overhead P50/P95 | `1.027s` / `1.185s` | P50 `< 2s`, P95 `< 5s` |
| Tool wall P50/P95 | `4.693s` / `6.600s` | P95 `< 8s` |
| Tool OpenClaw overhead P50/P95 | `1.045s` / `1.143s` | P50 `< 2s`, P95 `< 5s` |
| Simple actual tool-call activities | `0/0` on all 5 simple samples | no tool calls |
| Tool actual `d-max__listCategories` activities | `1/1` on all 5 tool samples | required tool call/result |

## Production VPS Follow-Up

After commit `6075bfa` was pushed and deployed, a read-only VPS latency check
confirmed the two-container topology on the real production host:

- Checkout: `/docker/d-max/repo`
- Compose project: `repo`
- Containers: `repo-dmax-api-1`, `repo-dmax-openclaw-1`
- API binding: `127.0.0.1:49415`
- Public API base: `https://dmax.b42.io/api/...`

Operational status:

- Both production containers were healthy.
- `/health` was about `1.5ms`.
- `/api/openclaw/status` was about `138ms`.
- OpenClaw model auth was complete with `missingProvidersInUse=[]` and an
  OpenClaw-managed `openai-codex` OAuth profile.

Observed VPS latency characteristics:

- Warm validation simple turns were about `5-11s`.
- Warm validation tool turns were about `7-10s`.
- Slow browser turns around `40-44s` were dominated by `agent.wait`.
- The slow browser examples had about `8k` prompt characters and either tool
  activity or a large reused OpenClaw session file. DMAX internal tool calls in
  those traces completed in `0-1ms`.
- No evidence pointed to API health, status, SQLite, Docker bridge networking,
  `sessions.send`, or the internal tool endpoint as the 40s driver.

Interpretation: use `validate:prod-topology` as the simple/tool-call baseline.
Long browser-chat latency must be evaluated with OpenClaw session size, prompt
size, model reasoning time, and tool repair/retry behavior in mind.

## Validation Commands

Start fresh production-topology project:

```sh
DMAX_INTERNAL_TOOL_TOKEN="$(openssl rand -hex 24)" \
OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 24)" \
DMAX_HOST_PORT=49443 \
docker compose -p dmax-two-container-prodtopology up -d --build
```

Health and topology:

```sh
curl -fsS http://127.0.0.1:49443/health
curl -fsS http://127.0.0.1:49443/api/openclaw/status
docker inspect dmax-two-container-prodtopology-dmax-api-1 --format '{{json .Mounts}}'
docker inspect dmax-two-container-prodtopology-dmax-openclaw-1 --format '{{json .Mounts}}'
```

Authorize model provider in the `dmax-openclaw` state volume:

```sh
docker compose -p dmax-two-container-prodtopology exec dmax-openclaw sh -lc \
  'OPENCLAW_CONFIG_PATH=/app/openclaw/config.production-512.json OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw models auth login --provider openai-codex --method device-code'
```

Approve the `dmax-api` backend device after the first `/api/openclaw/status` or chat attempt:

```sh
docker compose -p dmax-two-container-prodtopology exec dmax-openclaw sh -lc \
  'OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw devices list'

docker compose -p dmax-two-container-prodtopology exec dmax-openclaw sh -lc \
  'OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw devices approve <requestId>'
```

Direct DMAX tool endpoint check from `dmax-openclaw`:

```sh
docker compose -p dmax-two-container-prodtopology exec dmax-openclaw sh -lc \
  'node -e "fetch(\"http://dmax-api:3088/internal/openclaw/tools/listCategories\",{method:\"POST\",headers:{authorization:\"Bearer \"+process.env.DMAX_INTERNAL_TOOL_TOKEN,\"content-type\":\"application/json\"},body:JSON.stringify({input:{},traceId:\"prodtopology-direct-listCategories\"})}).then(async r=>{console.log(r.status); const j=await r.json(); console.log(JSON.stringify({ok:j.ok,resultOk:j.result?.ok,count:j.result?.data?.length ?? null}))})"'
```

After model auth and backend device approval are complete, run the harness:

```sh
npm run validate:prod-topology -- --project dmax-two-container-prodtopology --api-url http://127.0.0.1:49443
```

The harness calls `/health`, `/api/openclaw/status`, then runs
`openclaw models status --json` inside `dmax-openclaw` and keeps only sanitized
`missingProvidersInUse` provider names. If provider auth is complete, it runs one
synthetic warmup, five simple no-tool chat turns, and five
`d-max__listCategories` tool-call turns. It then reads persisted `turn_trace`
rows from the isolated `dmax-api` container and fails if the DMAX fallback reply
appears, no OpenClaw trajectory is present, the simple prompt uses tools, the
tool prompt does not show the `d-max__listCategories` activity, or any latency
target is missed. Validation failure output redacts backend device pairing
request IDs.

## Compose And Config Diffs

Production compose now:

- Uses `dmax-api` and `dmax-openclaw` services.
- Sets `DMAX_OPENCLAW_GATEWAY_URL=http://dmax-openclaw:18789` for `dmax-api`.
- Runs `dmax-api` with `npm run api:prod`, not the legacy managed OpenClaw subprocess.
- Removes the legacy `npm run start:prod` subprocess entrypoint, the stale standalone `start:container` OpenClaw entrypoint, `scripts/start-prod.ts`, and `scripts/start-container.sh`.
- Runs `dmax-openclaw` with OpenClaw Gateway 2026.5.12 on internal port `18789`.
- Seeds `@openclaw/codex@2026.5.12` from the image into the active state dir before gateway start.
- Removes `/root/.codex` and `dmax-codex-auth` from production compose.

Production config now:

- Adds `openclaw/config.production-512.json`.
- Promotes `openclaw/config.production.json` to the same 2026.5.12 two-container production topology, removing the stale `openai-codex/gpt-5.5` production config.
- Uses `openai/gpt-5.5` with `agentRuntime.id = "codex"`.
- Sets `gateway.auth.mode = "token"` to match the production `openclaw gateway run --auth token` command.
- Allows only `openai`, `codex`, and `dmax-dynamic-tools` plugins.
- Keeps `main.tools.allow` at the current 47 `d-max__...` tools.

## Rollback

Stop the two-container validation stack:

```sh
docker compose -p dmax-two-container-prodtopology down
```

Discard only the isolated validation volumes if desired:

```sh
docker volume rm \
  dmax-two-container-prodtopology_dmax-data \
  dmax-two-container-prodtopology_dmax-openclaw-state
```

Restore the previous single-container production layout from git:

```sh
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
```

Do not copy OAuth/device auth state from Docker volumes into the repo or image during rollback.

## VPS Promotion Checklist

- Set strong `DMAX_INTERNAL_TOOL_TOKEN` and `OPENCLAW_GATEWAY_TOKEN` through the VPS environment/secrets layer.
- Build and start `docker-compose.yml`.
- Confirm `dmax-openclaw` mounts only `dmax-openclaw-state`.
- Confirm `dmax-api` mounts `dmax-data` and does not mount `/root/.codex`.
- Run OpenClaw-managed provider auth in `dmax-openclaw`.
- Trigger and approve the `dmax-api` backend device.
- Verify `openclaw models status --json` no longer reports `missingProvidersInUse`.
- Run one synthetic warmup, five simple turns, and five `listCategories` tool-call turns.
- Confirm warm OpenClaw overhead and wall-time latency gates before routing public traffic.
