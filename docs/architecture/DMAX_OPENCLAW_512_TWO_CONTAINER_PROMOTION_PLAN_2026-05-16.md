# DMAX OpenClaw 2026.5.12 Two-Container Promotion Plan

Date: 2026-05-16
Purpose: make the validated two-container OpenClaw architecture the only production architecture for DMAX.

Superseded for production by
`docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PRODUCTION_PROMOTION_VALIDATION_2026-05-16.md`.
This file records the promotion plan; the current production state is described
in `README.md`, `docs/current-state.md`, and the production promotion
validation report.

This document is written so the session can be reset before execution. It captures the current state, target state, concrete goals, validation gates, rollback requirements, and a copy-ready `/goal` prompt for a coding agent.

## Current State To Preserve

Validated staging report:

- `docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_STAGING_REPORT_2026-05-16.md`

Validated staging architecture:

- `dmax-api` owns SQLite, media, web/static/API, Google OAuth, Telegram path, and current voice code.
- `dmax-openclaw` owns OpenClaw Gateway 2026.5.12 and `OPENCLAW_STATE_DIR`.
- `@openclaw/codex@2026.5.12` is installed in the active OpenClaw state volume.
- Active route is `openai/gpt-5.5` with `agentRuntime.id = "codex"`.
- Default `main` agent exposes only `d-max__...` tools.
- Research/web capability is separated into `dmax-research`, not default `main`.
- `dmax-dynamic-tools` is an HTTP adapter to `dmax-api` and does not open SQLite or import DMAX repositories.
- Internal endpoint is `POST /internal/openclaw/tools/:toolName`, protected by `DMAX_INTERNAL_TOOL_TOKEN`, and executes through `createToolRunner()`.
- API can target an external OpenClaw Gateway with `DMAX_OPENCLAW_GATEWAY_URL`.
- API reconnects after OpenClaw restart.

Validated staging metrics:

- API `/health`: `2.877s`.
- OpenClaw ready through API: `7.488s`.
- First synthetic warmup: `8.067s`.
- Warm simple total P50/P95: `2.941s / 3.061s`.
- Warm simple OpenClaw overhead excluding model P50/P95: `1.154s / 1.340s`.
- Warm DMAX tool-call total P50/P95: `4.908s / 6.583s`.
- Warm DMAX tool-call OpenClaw overhead excluding model P50/P95: `1.087s / 1.340s`.
- Post-restart reconnect chat: `6.545s`.

Validated tests:

```sh
npm run typecheck
npm run test -- \
  tests/api/internal-openclaw-tools.test.ts \
  tests/openclaw/config-web-tools.test.ts \
  tests/openclaw/dmax-dynamic-tools-plugin.test.ts \
  tests/openclaw/dmax-dynamic-tools-http-adapter.test.ts \
  tests/chat/openclaw-external-gateway.test.ts
```

Operational prerequisites discovered in staging:

- Codex OAuth must be authorized inside the `dmax-openclaw` state volume.
- The `dmax-api` backend gateway device must be approved once after first boot.
- Do not copy Codex/OAuth tokens into the repo or image.
- Do not expose device codes, OAuth emails, or tokens in docs/log summaries.

## Target Architecture

Production should become:

```text
reverse proxy
  -> dmax-api
       - SQLite owner
       - media owner
       - web/static/API owner
       - Google OAuth owner
       - Telegram path owner
       - inactive/current voice code owner
       - internal DMAX tool endpoint owner
       -> internal Docker network -> dmax-openclaw

dmax-openclaw
  - OpenClaw Gateway 2026.5.12
  - active OPENCLAW_STATE_DIR volume
  - @openclaw/codex@2026.5.12 installed in that state dir
  - Codex OAuth auth state
  - dmax-dynamic-tools HTTP adapter plugin
  - no SQLite mount
  - no DMAX repository imports
```

The old production architecture should no longer be production-capable:

- No production OpenClaw subprocess spawned from `dmax-api`.
- No production Codex auth volume mounted into `dmax-api` at `/root/.codex`.
- No production path where `dmax-openclaw` can open DMAX SQLite.
- No default-agent non-DMAX tool exposure.

Local development may keep a clearly documented local-only fallback if it remains useful, but production must fail fast unless the external gateway configuration is present.

## Specific Goals

### Goal 1: Promote Compose To Two Services

Make `docker-compose.yml` represent the two-container production topology:

- `dmax-api`
  - Builds/runs the API server and static web app.
  - Mounts `dmax-data:/app/data`.
  - Mounts OpenClaw state read-only only if transcript/trajectory reads require it.
  - Sets `DMAX_OPENCLAW_GATEWAY_URL=http://dmax-openclaw:18789`.
  - Sets `DMAX_OPENCLAW_MODEL=openai/gpt-5.5`.
  - Requires `DMAX_INTERNAL_TOOL_TOKEN` and `OPENCLAW_GATEWAY_TOKEN`.
  - Does not mount `/root/.codex`.

- `dmax-openclaw`
  - Builds/runs OpenClaw Gateway 2026.5.12.
  - Owns `dmax-openclaw-state:/app/data/openclaw-state`.
  - Uses `OPENCLAW_CONFIG_PATH=/app/openclaw/config.production-512.json` or the promoted equivalent.
  - Runs `openclaw gateway run --port 18789 --auth token --bind lan`.
  - Installs/ensures `@openclaw/codex@2026.5.12` in the active `OPENCLAW_STATE_DIR`.
  - Sets `DMAX_TOOL_ENDPOINT_URL=http://dmax-api:3088/internal/openclaw/tools`.
  - Does not mount `dmax-data` or any DMAX SQLite path.

Acceptance:

- `docker compose config` shows exactly these ownership boundaries.
- `docker inspect` proves `dmax-openclaw` has no SQLite/DMax data mount.
- `docker inspect` proves `dmax-api` does not mount Codex auth at `/root/.codex`.

### Goal 2: Promote OpenClaw Config

Create a production two-container OpenClaw config, likely:

- `openclaw/config.production-512.json`

It should be based on `openclaw/config.staging-512.json` but use production-safe names/paths and no account-specific auth metadata.

Acceptance:

- Route is `openai/gpt-5.5`.
- `agentRuntime.id = "codex"`.
- Plugin allowlist is only `openai`, `codex`, `dmax-dynamic-tools`.
- `main.tools.allow` is exactly the current DMAX tool registry, all prefixed `d-max__`.
- `dmax-research` remains separate for web/research.
- No browser/canvas/media/TTS/sandbox/memory/provider-sprawl tools in default `main`.

### Goal 3: Make External Gateway Required In Production

Harden `src/chat/openclaw-agent.ts` and environment validation so production cannot silently fall back to old subprocess spawning.

Expected behavior:

- In `NODE_ENV=production`, startup or first OpenClaw use fails clearly if `DMAX_OPENCLAW_GATEWAY_URL` is missing.
- In production, `dmax-api` never spawns `openclaw gateway run`.
- Local/test modes can still use the current local subprocess fallback if desired.

Acceptance:

- Unit test proves production without `DMAX_OPENCLAW_GATEWAY_URL` fails fast.
- Existing external gateway test still passes.
- No production compose path lacks `DMAX_OPENCLAW_GATEWAY_URL`.

### Goal 4: Make Tool Execution Boundary The Only DMAX Tool Path For OpenClaw

Keep `dmax-dynamic-tools` as the only default dynamic tool bridge.

Acceptance:

- Plugin tests prove no imports of SQLite, repositories, `createToolRunner`, or DMAX MCP registry from the OpenClaw plugin.
- Tool manifest remains synchronized with `src/tools/index.ts`.
- `dmax-api` endpoint auth tests pass.
- `listCategories` runs through `createToolRunner()` in `dmax-api`.

### Goal 5: Clean Up Legacy Production Auth/Runtime Docs

Update docs that still describe the old single-container subprocess production layout:

- `README.md`
- `docs/current-state.md`
- `docs/memory-map.md` if doc ownership changes are needed.
- Any deploy/runbook docs that mention `dmax-codex-auth:/root/.codex` as production OpenClaw auth.

Acceptance:

- Docs say production is two-container.
- Docs say Codex OAuth state belongs to `dmax-openclaw` OpenClaw state volume.
- Docs include first-boot auth and backend device approval steps.
- Docs include rollback.
- Docs do not include secrets, emails, device codes, or tokens.

### Goal 6: Validate With A Fresh Production-Topology Project

Run a fresh local validation using production topology, not the old staging compose name if possible.

Suggested project:

```sh
DMAX_INTERNAL_TOOL_TOKEN="$(openssl rand -hex 24)" \
OPENCLAW_GATEWAY_TOKEN="$(openssl rand -hex 24)" \
DMAX_HOST_PORT=49443 \
docker compose -p dmax-two-container-prodtopology up -d --build
```

Then authorize Codex and approve the backend gateway device in that project’s OpenClaw state volume.

Acceptance metrics should match the staging report gates:

- API `/health` `< 10s`.
- OpenClaw ready `< 20s` preferred, `< 30s` hard gate.
- API plus OpenClaw usable `< 30s` preferred, `< 45s` hard gate.
- First synthetic warmup `< 10s`.
- Warm simple turns, 5 runs:
  - OpenClaw overhead excluding model P50 `< 2s`.
  - OpenClaw overhead excluding model P95 `< 5s`.
  - Total P95 `< 6s`.
- Warm DMAX tool turns, 5 runs:
  - OpenClaw overhead excluding model P50 `< 2s`.
  - OpenClaw overhead excluding model P95 `< 5s`.
  - Total P95 `< 8s`.
- `d-max__listCategories` has trajectory `tool.call` and `tool.result`.
- Restarting only `dmax-openclaw` is recovered by `dmax-api` without restarting `dmax-api`.

### Goal 7: Leave A Rollback Path

Even if the new topology becomes the only committed production architecture, preserve a documented rollback path.

Acceptance:

- Rollback docs include how to stop the two-container stack.
- Rollback docs include how to restore the prior single-container compose from git.
- Rollback docs clearly state that OAuth/device auth state volumes must not be copied into the repo.

## Recommended Execution Phases

### Phase 0: Preflight

- Read this plan, the staging report, current state docs, Dockerfile, compose files, OpenClaw configs, OpenClaw agent code, API server code, plugin files, and tests.
- Confirm git status and identify pre-existing untracked session handoff docs.
- Do not touch any running production-like container.

### Phase 1: Production Compose Promotion

- Convert `docker-compose.yml` to `dmax-api` + `dmax-openclaw`.
- Decide whether to keep `docker-compose.staging-512.yml` as an isolated test helper or remove/rename it after production topology exists.
- Keep `Dockerfile` default `OPENCLAW_VERSION=2026.4.26` only if the production compose build arg explicitly overrides to `2026.5.12`. If the new architecture is now the only production architecture and fresh validation passes, it is acceptable to intentionally change the production build path to 2026.5.12, but document why.

### Phase 2: Production OpenClaw Config

- Add/promote `openclaw/config.production-512.json`.
- Keep account-specific auth out of repo config.
- Ensure plugin paths use the production OpenClaw state dir.

### Phase 3: Production Fail-Fast Guard

- Add production guard for missing `DMAX_OPENCLAW_GATEWAY_URL`.
- Add tests.

### Phase 4: Docs And Runbooks

- Update `README.md` and `docs/current-state.md`.
- Add auth/device approval and rollback commands.

### Phase 5: Fresh Validation

- Bring up a fresh production-topology project locally.
- Authorize Codex in the OpenClaw state volume.
- Approve the API backend device.
- Run measurements.
- Save results to a new promotion validation report under `docs/architecture/`.

### Phase 6: Cleanup

- Remove or mark obsolete old staging-only artifacts if they are superseded.
- Keep only what is needed for ongoing production/development.

## Risks And Decisions

### Image Split

Initial promotion can keep one Dockerfile and one built image used by both services. This minimizes code churn.

Later cleanup can split API and OpenClaw images so `dmax-api` no longer includes OpenClaw packages and `dmax-openclaw` no longer includes API runtime baggage.

### Local Dev Fallback

The local subprocess fallback can remain if it is explicitly local/test-only. Production must not use it.

### Auth State Migration

Do not attempt to migrate old `/root/.codex` production auth into the new repo or image. Prefer fresh Codex OAuth in the `dmax-openclaw` state volume.

### Backend Device Approval

The `dmax-api` backend gateway device approval is an operational step. It should be documented. Avoid building an insecure bypass unless OpenClaw provides a supported bootstrap flow that preserves scopes.

## Copy-Ready `/goal` Prompt

```text
/goal Make the validated DMAX OpenClaw 2026.5.12 two-container architecture the only production architecture.

Read first:
- AGENTS.md
- docs/current-state.md
- docs/memory-map.md
- README.md
- docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PROMOTION_PLAN_2026-05-16.md
- docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_STAGING_REPORT_2026-05-16.md
- docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PLAN.md
- Dockerfile
- docker-compose.yml
- docker-compose.staging-512.yml
- openclaw/config.production.json
- openclaw/config.staging-512.json
- src/chat/openclaw-agent.ts
- src/config/env.ts
- src/api/server.ts
- src/core/tool-definitions.ts
- src/mcp/server.ts
- openclaw/plugins/dmax-dynamic-tools/*
- tests/openclaw/*
- tests/api/internal-openclaw-tools.test.ts
- tests/chat/openclaw-external-gateway.test.ts

Objective:
Promote the validated two-container staging path into the sole production architecture:
1. Production compose runs `dmax-api` and `dmax-openclaw` as separate services.
2. `dmax-api` owns SQLite, media, web/static/API, Google OAuth, Telegram path, and existing voice code.
3. `dmax-openclaw` owns OpenClaw Gateway 2026.5.12 and its `OPENCLAW_STATE_DIR`.
4. `@openclaw/codex@2026.5.12` is installed and loaded from the active `dmax-openclaw` `OPENCLAW_STATE_DIR`.
5. The active route is `openai/gpt-5.5` with `agentRuntime.id = "codex"`.
6. The default DMAX agent is thin and exposes only `d-max__...` tools.
7. Browser, canvas, media, TTS, sandbox, web/research, memory, provider/plugin sprawl, and unrelated dynamic tools are excluded from the default DMAX turn.
8. Research/web remains separated in `dmax-research`.
9. `dmax-dynamic-tools` remains an HTTP adapter and never opens SQLite or imports DMAX repositories in the OpenClaw container.
10. The internal `dmax-api` tool endpoint executes existing DMAX tools through `createToolRunner()`, preserves validation/confirmation/error result shapes, and is protected by `DMAX_INTERNAL_TOOL_TOKEN`.
11. Production `dmax-api` talks to `dmax-openclaw` over the internal Docker network and does not spawn OpenClaw as its own subprocess.
12. Production `dmax-api` must fail fast if `NODE_ENV=production` and `DMAX_OPENCLAW_GATEWAY_URL` is missing.
13. Production `dmax-openclaw` must not mount SQLite or the DMAX data volume.
14. Production `dmax-api` must not mount Codex auth at `/root/.codex`.
15. Docs must describe the new production topology, first-boot Codex auth, backend device approval, rollback, and validation commands.

Hard constraints:
- Do not touch or restart any existing production-like container unless explicitly instructed.
- Do not expose secrets, device codes, OAuth profile emails, or tokens.
- Do not copy Codex/OAuth tokens into the repo or image.
- Do not patch OpenClaw dist files.
- Keep all changes reversible through git and documented rollback commands.
- Prefer compose/config/env/docs/tests over broad source patches.
- Keep OpenClaw workspace prompt files short; do not add runtime prompt bloat.
- Preserve DMAX data ownership: SQLite remains the source of truth and durable writes go through tools/API services.

Implementation requirements:
- Convert production `docker-compose.yml` to the two-service topology.
- Add or promote a production 2026.5.12 OpenClaw config, e.g. `openclaw/config.production-512.json`, based on the validated staging config but without account-specific auth metadata.
- Keep or improve tests proving `main.tools.allow` contains only current `d-max__...` tools.
- Add tests/guards proving production requires an external OpenClaw gateway URL.
- Keep tests proving the internal OpenClaw tool endpoint requires auth and can run `listCategories`.
- Keep tests proving the dynamic tool manifest is synchronized with the DMAX tool registry and plugin code does not import SQLite/DMAX repositories.
- Update `README.md` and `docs/current-state.md` to make the two-container architecture the documented production state.
- Add a promotion validation report under `docs/architecture/` after fresh local production-topology validation.

Validation:
Run a fresh local production-topology compose project, separate from any existing production-like container, and document:
- OpenClaw version and Codex plugin version/path.
- Active model/runtime route.
- Active plugin list.
- Active default-agent tool list.
- Proof that all default-agent tools are `d-max__...` only.
- Proof that `d-max__listCategories` is visible and callable from the Codex harness via the internal `dmax-api` endpoint.
- Startup metrics: API `/health`, OpenClaw ready, API sees OpenClaw ready, first synthetic warmup.
- Warm simple-turn metrics, 5 runs.
- Warm DMAX tool-call metrics, 5 runs.
- P50/P95 OpenClaw overhead excluding model time where measurable.
- Total P50/P95 wall times.
- Compose/config diffs.
- Restart/reconnect result for `dmax-openclaw`.
- Rollback instructions.
- VPS promotion checklist.

Latency targets:
- `dmax-api` `/health` < 10s after container start.
- OpenClaw Gateway ready < 20s preferred, < 30s hard gate.
- API + OpenClaw usable < 30s preferred, < 45s hard gate.
- First synthetic OpenClaw warmup < 10s.
- Warm simple DMAX chat turns: OpenClaw overhead excluding model time P50 < 2s and P95 < 5s; total wall P95 < 6s.
- Warm DMAX tool-call turns: OpenClaw overhead excluding model time P50 < 2s and P95 < 5s; total wall P95 < 8s.
- No regular 8-10s warm OpenClaw overhead.
- No 20-50s pre-model stalls.
- Default-agent tool count equals the DMAX tool surface and contains no non-DMAX tools.

Stop condition:
Stop only when the production-topology repo changes meet the goals above with reproducible commands, documented rollback, validation evidence, and a VPS promotion checklist, or when the exact blocking stage is identified and documented with evidence explaining what technical change is needed next.

Work style:
Proceed in checkpoints. After each checkpoint, record what changed, what was measured, and what remains. Keep production untouched. Keep final output concise and include paths/commands needed to reproduce validation.
```

## Reset Handoff Summary

Use this summary after resetting the session:

- The staging implementation is already validated and documented in `DMAX_OPENCLAW_512_TWO_CONTAINER_STAGING_REPORT_2026-05-16.md`.
- The next task is not to rediscover staging. It is to promote that topology into production compose/config/docs and remove production reliance on API-owned OpenClaw subprocess/auth.
- At promotion-planning time, `docker-compose.yml` was still old single-service production (`d-max`) with `dmax-codex-auth:/root/.codex`.
- Current staging compose is `docker-compose.staging-512.yml` and already proves the target architecture.
- The most important production hardening change is: `NODE_ENV=production` must require `DMAX_OPENCLAW_GATEWAY_URL`.
- The second most important production hardening change is: `dmax-openclaw` must not mount SQLite/DMAX data and `dmax-api` must not mount Codex auth.
- After code/config changes, validate using a fresh compose project name and do not touch existing production-like containers.
