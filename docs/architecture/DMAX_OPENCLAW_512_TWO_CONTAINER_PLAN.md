# DMAX OpenClaw 2026.5.12 Two-Container Plan

Last updated: 2026-05-16

Superseded for production by
`docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PRODUCTION_PROMOTION_VALIDATION_2026-05-16.md`.
This file records the planning state that led to the promoted topology.

## Goal

Move DMAX from the former single-container OpenClaw subprocess layout to a
production-ready two-container layout:

```text
reverse proxy
  -> dmax-api
       - HTTP API
       - static web build
       - Telegram path through OpenClaw
       - inactive/low-priority voice code remains here
       - SQLite owner
       - media files
       - Google OAuth files
       - DMAX tool execution endpoint
       -> internal Docker network -> dmax-openclaw

dmax-openclaw
  - OpenClaw Gateway 2026.5.12
  - active OPENCLAW_STATE_DIR volume
  - @openclaw/codex installed in that state dir
  - OpenClaw-managed Codex OAuth
  - dmax-dynamic-tools plugin
  - no direct SQLite access in the final state
  - calls dmax-api internal tool endpoint for DMAX tools
```

The target state is not a broad microservice split. Telegram remains part of
the DMAX/OpenClaw path, and voice remains in `dmax-api` because it is not an
active development focus. The only required process split is OpenClaw runtime
isolation.

## Session Learnings To Preserve

OpenClaw 2026.5.12 can deliver good warm latency for DMAX if the runtime is
kept thin and configured through supported OpenClaw mechanisms:

- Do not patch OpenClaw dist/runtime files to suppress native tools.
- Use explicit plugin and agent allowlists instead.
- Install the official `@openclaw/codex` plugin into the active
  `OPENCLAW_STATE_DIR`; a global package install is not sufficient.
- Use the 2026.5.12 route `openai/gpt-5.5` with `agentRuntime.id = "codex"`,
  not the legacy `openai-codex/gpt-5.5` route.
- Keep Codex OAuth state OpenClaw-managed in the active OpenClaw state volume.
  Do not copy Codex/OAuth tokens into the repo or image.
- The default DMAX agent must be thin: only `d-max__...` tools.
- Browser, canvas, media, TTS, sandbox, web/research, memory, provider/plugin
  sprawl, and unrelated dynamic tools must not be visible in normal DMAX turns.
- Web/research belongs in a separate `dmax-research` agent, not in the default
  DMAX turn.
- Native OpenClaw MCP-server exposure was not reliable enough in the 2026.5.12
  staging run; the reproducible path is the `dmax-dynamic-tools` bridge.
- After Codex re-auth in the active state dir, warm OpenClaw overhead excluding
  model time was good: simple-turn P95 about `1239ms`, DMAX tool-call P95 about
  `1288ms`.

## Target Latency Gates

These are staging gates before production promotion:

- `/health` on `dmax-api`: `< 10s` after container is considered started.
- OpenClaw Gateway ready: `< 20s` preferred, `< 30s` hard gate.
- DMAX API ready including OpenClaw status check: `< 30s` preferred, `< 45s`
  hard gate.
- First synthetic OpenClaw warmup turn after ready: `< 10s`.
- Warm simple DMAX chat turns, 5-10 runs:
  - OpenClaw overhead excluding model time P50 `< 2s`
  - OpenClaw overhead excluding model time P95 `< 5s`
  - total wall P95 target `< 6s`
- Warm DMAX tool-call turns, 5-10 runs:
  - OpenClaw overhead excluding model time P50 `< 2s`
  - OpenClaw overhead excluding model time P95 `< 5s`
  - total wall P95 target `< 8s`
- No repeated warm 8-10s OpenClaw overhead.
- No 20-50s pre-model stalls.
- Default-agent tool count equals the DMAX tool surface and contains only
  `d-max__...` tools.

The overhead metric should be taken from the OpenClaw turn trace where
available, using the pre-session/pre-model setup interval rather than total
model/tool execution time.

## Final Architecture

### `dmax-api`

Responsibilities:

- Run migrations.
- Own SQLite and all durable DMAX writes.
- Own media storage.
- Own Google OAuth files and calendar sync/write logic.
- Serve the browser app unless a later deployment explicitly splits static
  hosting.
- Keep Telegram integration here if it is already part of the DMAX/OpenClaw
  path.
- Keep current voice code here.
- Expose an internal DMAX tool execution endpoint for `dmax-openclaw`.
- Call the external OpenClaw Gateway through an internal Compose network URL.

Non-goals:

- Do not spawn OpenClaw as a subprocess in the final two-container layout.
- Do not store Codex/OpenClaw auth state.
- Do not run the OpenClaw plugin installer.

Required new config shape:

```text
DMAX_OPENCLAW_GATEWAY_URL=http://dmax-openclaw:<gateway-port>
DMAX_OPENCLAW_MODEL=openai/gpt-5.5
DMAX_INTERNAL_TOOL_TOKEN=<secret in env/compose only>
```

### `dmax-openclaw`

Responsibilities:

- Run OpenClaw Gateway 2026.5.12.
- Own `OPENCLAW_STATE_DIR`.
- Load `@openclaw/codex@2026.5.12` from the active state dir.
- Own OpenClaw-managed Codex OAuth state.
- Load the DMAX dynamic tools plugin.
- Expose only the OpenClaw Gateway to the internal Docker network.
- Call the internal DMAX API tool endpoint for all `d-max__...` tool execution.

Non-goals:

- Do not expose the OpenClaw Gateway publicly.
- Do not mount SQLite in the final state.
- Do not write DMAX durable state directly.
- Do not bake OAuth secrets into the image.

Required config shape:

```text
OPENCLAW_STATE_DIR=/app/data/openclaw-state
OPENCLAW_CONFIG_PATH=/app/openclaw/config.production-512.json
DMAX_TOOL_ENDPOINT_URL=http://dmax-api:<api-port>/internal/openclaw/tools
DMAX_INTERNAL_TOOL_TOKEN=<same secret as dmax-api, env/compose only>
```

## Tool Endpoint Design

The final `dmax-dynamic-tools` plugin should not import DMAX repositories or
open SQLite. It should be a thin OpenClaw adapter:

```text
OpenClaw Codex harness
  -> dmax-dynamic-tools plugin
  -> POST /internal/openclaw/tools/:toolName on dmax-api
  -> existing DMAX tool runner
  -> SQLite
```

Endpoint requirements:

- Internal-only route, not exposed through the public reverse proxy.
- Authenticated with a shared internal token from environment variables.
- Accepts JSON tool input and returns the existing DMAX tool result envelope.
- Uses the same `createToolRunner()` path as the MCP server and current dynamic
  tool bridge.
- Records diagnostic events for tool name, duration, success/failure, and trace
  id.
- Must not log secrets or full sensitive payloads.
- Must preserve confirmation semantics such as `requiresConfirmation`.

Suggested endpoint shape:

```http
POST /internal/openclaw/tools/:toolName
Authorization: Bearer <DMAX_INTERNAL_TOOL_TOKEN>
Content-Type: application/json

{
  "input": {},
  "traceId": "..."
}
```

Suggested response shape:

```json
{
  "ok": true,
  "result": {
    "ok": true,
    "data": {}
  }
}
```

## OpenClaw Config Policy

The default agent must remain explicitly allowlisted:

```text
main.tools.allow = [
  "d-max__listCategories",
  "... all current DMAX tools ..."
]
```

Forbidden in `main`:

```text
group:web
browser
canvas
media
tts
sandbox
memory
research
gateway/admin tools
unrelated provider/plugin dynamic tools
```

Research/web must be separate:

```text
dmax-research.tools.allow = [
  "group:web",
  "d-max__listCategories",
  "d-max__listInitiatives",
  "d-max__getInitiative",
  "d-max__listInitiativeRelations",
  "d-max__getInitiativeGraph",
  "d-max__listTasks"
]
```

Plugin policy:

```text
plugins.allow = ["openai", "codex", "dmax-dynamic-tools"]
plugins.load.paths includes:
  - active state-dir @openclaw/codex path
  - packaged dmax-dynamic-tools plugin path
plugins.slots.memory = "none"
plugins.entries.codex.config.codexPlugins.enabled = false
```

## Implementation Phases

### Phase 1: Preserve Current Working Staging Path

- Keep production unchanged.
- Keep the Dockerfile default `ARG OPENCLAW_VERSION=2026.4.26` unless a fresh
  verified production plan changes it.
- Keep the existing 2026.5.12 staging image path using a build arg.
- Keep `dmax-dynamic-tools` as the proven Codex-harness tool exposure path.
- Add or keep tests that assert the plugin manifest mirrors the DMAX tool
  registry.

Exit criteria:

- Current dynamic-tools staging still passes focused tests.
- No production container is touched.

### Phase 2: Add Internal Tool Endpoint To `dmax-api`

- Add an internal route under `/internal/openclaw/tools/:toolName`.
- Protect it with `DMAX_INTERNAL_TOOL_TOKEN`.
- Route execution through `createToolRunner()` and the normal SQLite-owned API
  process.
- Add tests for:
  - unauthorized request rejected;
  - unknown tool rejected;
  - valid read tool works;
  - validation errors are surfaced;
  - confirmation result shape is preserved if applicable.

Exit criteria:

- `dmax-api` can execute at least `listCategories` through the internal route.
- Route is not publicized in frontend docs or UI.
- No secret values are committed.

### Phase 3: Convert `dmax-dynamic-tools` To HTTP Adapter

- Change the plugin so it no longer imports `dist/src/db/connection.js`.
- Change the plugin so it no longer imports DMAX repositories.
- Keep the tool contract generation in sync with DMAX tool definitions.
- Execute tools by POSTing to the internal `dmax-api` tool endpoint.
- Include trace id propagation where available.
- Keep returned OpenClaw tool output compatible with the current working
  `textResult()` behavior.

Exit criteria:

- The OpenClaw container can load the plugin without a SQLite volume.
- A Codex-harness turn calls `d-max__listCategories` successfully via
  `dmax-api`.

### Phase 4: Split Compose Into Two Containers In Staging

- Add a staging Compose layout with `dmax-api` and `dmax-openclaw`.
- `dmax-api` owns `dmax-data`.
- `dmax-openclaw` owns `dmax-openclaw-state`.
- `dmax-openclaw` receives no direct SQLite mount in the final staging
  validation.
- `dmax-api` talks to OpenClaw through the internal Docker network URL.
- Reverse proxy/public host binding points only to `dmax-api`.
- Add healthchecks and startup ordering, but do not rely only on
  `depends_on`; the API must tolerate OpenClaw reconnects.

Exit criteria:

- `dmax-api` `/health` works.
- `dmax-openclaw` ready/probe works.
- `/api/openclaw/status` from `dmax-api` sees the external gateway.
- Restarting `dmax-openclaw` does not require restarting `dmax-api` after the
  gateway is ready again.

### Phase 5: Reproduce Codex/Auth Setup

- Install `@openclaw/codex@2026.5.12` into the active
  `dmax-openclaw` state dir.
- Authenticate Codex inside that state dir with the OpenClaw-managed flow.
- Verify with:

```sh
openclaw models status --probe --probe-provider openai-codex --json
```

Exit criteria:

- Probe status is `ok`.
- Active route is `openai/gpt-5.5`.
- No missing providers.
- No token, device code, profile email, or OAuth secret is copied to the repo
  or final report.

### Phase 6: Staging Measurement Gate

Run and record:

- OpenClaw version.
- Codex plugin version/path.
- Active model/runtime route.
- Active plugin list.
- Default-agent tool list and count.
- Proof that all default-agent tools are `d-max__...`.
- Proof that `d-max__listCategories` is callable from the Codex harness.
- Startup metrics.
- First synthetic warmup.
- 5-10 warm simple turns.
- 5-10 warm DMAX tool-call turns.
- P50/P95 OpenClaw overhead excluding model time.
- Total P50/P95 wall times.
- Config diffs.
- Rollback instructions.

Exit criteria:

- Latency gates above pass, or a precise blocker is documented with evidence.
- No production state has been modified.

### Phase 7: VPS Promotion Plan

Only after Phase 6 passes:

- Prepare production Compose changes.
- Keep `dmax-openclaw` private on the Docker network.
- Keep public reverse proxy pointing only to `dmax-api`.
- Create a named `dmax-openclaw-state` volume.
- Run Codex auth in the production `dmax-openclaw` state dir.
- Run the same staging measurement gate on VPS before considering the deploy
  complete.

Exit criteria:

- Browser DMAX chat works.
- Telegram DMAX chat works.
- DMAX tool calls work from Codex harness.
- OpenClaw restart/reconnect test passes.
- Latency remains within gates.

## Rollback Principles

- Production-like existing containers must not be restarted during staging work.
- New staging containers and volumes must use unique names.
- Rollback is `docker rm -f` for staging containers plus removal of staging
  volumes and temp files.
- Repo changes must be reversible and focused:
  - config files;
  - compose files;
  - internal tool endpoint;
  - `dmax-dynamic-tools` adapter;
  - tests;
  - documentation.
- Never remove or copy OAuth token volumes as part of ordinary rollback.

## Required Tests And Checks

Minimum automated checks:

- Dynamic tool manifest matches `src/tools/index.js`.
- Default `main` agent allows only `d-max__...` tools.
- Research tools are only available through `dmax-research`.
- Internal tool endpoint requires auth.
- Internal tool endpoint can execute `listCategories`.
- Dynamic plugin HTTP adapter maps success and failure responses correctly.
- API can target an external OpenClaw Gateway URL without spawning a local
  OpenClaw subprocess.

Minimum live checks:

- `openclaw plugins inspect codex --json`
- `openclaw plugins inspect dmax-dynamic-tools --json`
- `openclaw models status --probe --probe-provider openai-codex --json`
- `/api/openclaw/status`
- simple DMAX chat turn
- DMAX `listCategories` tool-call turn
- Telegram simple turn
- Telegram DMAX tool-call turn
- OpenClaw container restart/reconnect

## Coding Agent Goal Prompt

```text
/goal Implement the DMAX OpenClaw 2026.5.12 two-container staging path with
OpenClaw isolated from the API process and DMAX tool execution centralized in
dmax-api, then measure and document whether it is VPS-ready.

Read first:
- docs/current-state.md
- docs/memory-map.md
- README.md
- docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PLAN.md
- docs/archive/session-handoffs/session-handoff-openclaw-512-dmax-dynamic-tools-staging-2026-05-16.md
- Dockerfile
- docker-compose.yml
- openclaw/config.production.json
- src/chat/openclaw-agent.ts
- src/core/tool-definitions.ts
- src/mcp/server.ts
- src/api/server.ts
- openclaw/plugins/dmax-dynamic-tools/*
- tests/openclaw/*

Objective:
Build the reversible staging-only version of the target architecture:
1. dmax-api remains the owner of SQLite, media, Google OAuth, web/static
   serving, Telegram path, and inactive/low-priority voice code.
2. dmax-openclaw runs OpenClaw Gateway 2026.5.12 in a separate container with
   its own OPENCLAW_STATE_DIR volume.
3. @openclaw/codex@2026.5.12 is installed and loaded from the active
   dmax-openclaw OPENCLAW_STATE_DIR.
4. The OpenClaw route is the 2026.5.12 Codex route:
   openai/gpt-5.5 with agentRuntime.id = codex.
5. The normal DMAX default agent is thin and exposes only d-max__... tools.
6. Browser, canvas, media, TTS, sandbox, web/research, memory,
   provider/plugin sprawl, and unrelated dynamic tools are excluded from the
   default DMAX turn.
7. Research/web capability remains separated in dmax-research or is explicitly
   documented as out of scope for the default turn.
8. dmax-dynamic-tools no longer opens SQLite or imports DMAX repositories in
   the OpenClaw container. It calls an authenticated internal dmax-api tool
   endpoint instead.
9. The internal dmax-api tool endpoint executes existing DMAX tools through
   createToolRunner(), preserves validation/confirmation/error result shapes,
   and is protected by an env-provided internal token.
10. dmax-api talks to dmax-openclaw over the internal Docker network instead
    of spawning OpenClaw as its own subprocess in the final staging layout.
11. d-max MCP/dynamic tools are visible and callable from the Codex harness,
    with proof from trajectory/tool-call evidence.
12. Startup, first warmup, warm simple turns, and warm DMAX tool-call turns
    are measured cleanly and documented.

Hard constraints:
- Do not modify production.
- Do not touch or restart the existing production-like container unless
  explicitly instructed.
- Do not expose secrets, device codes, OAuth profile emails, or tokens.
- Do not copy Codex/OAuth tokens into the repo or image.
- Keep all changes reversible.
- Prefer config, Docker/Compose/env, plugin allowlists, agent/tool
  configuration, tests, and documented staging setup before source-code
  patches.
- Do not patch OpenClaw dist files.
- Keep the existing Dockerfile default OPENCLAW_VERSION=2026.4.26 unless there
  is a separately justified and freshly verified production change.

Implementation requirements:
- Add an internal dmax-api endpoint for OpenClaw dynamic tool execution.
- Add tests proving the endpoint requires auth and can run at least
  listCategories.
- Convert dmax-dynamic-tools into an HTTP adapter that calls that endpoint.
- Keep the dynamic tool manifest synchronized with the DMAX tool registry.
- Add or update staging Compose/config files for dmax-api + dmax-openclaw.
- Ensure dmax-openclaw does not need direct SQLite access in the final staging
  validation.
- Ensure dmax-api can target an external OpenClaw Gateway URL and reconnect
  after dmax-openclaw restarts.
- Add tests/guards proving main.tools.allow contains only d-max__... tools.
- Document rollback commands.

Validation:
Run isolated staging measurements and produce a report with:
- OpenClaw version and Codex plugin version/path.
- Active model/runtime route.
- Active plugin list.
- Active default-agent tool list.
- Proof that all default-agent tools are d-max__... only.
- Proof that d-max__listCategories is visible and callable from the Codex
  harness via dmax-api internal tool endpoint.
- Startup metrics: /health, OpenClaw ready, dmax-api ready, first synthetic
  warmup.
- Warm simple-turn metrics, 5-10 runs.
- Warm DMAX tool-call metrics, 5-10 runs.
- P50/P95 OpenClaw overhead excluding model time where measurable.
- Total P50/P95 wall times.
- Config and Compose diffs.
- Restart/reconnect result for dmax-openclaw.
- Rollback instructions.
- VPS promotion checklist.

Latency targets:
- dmax-api /health < 10s after container start is considered ready.
- OpenClaw Gateway ready < 20s preferred, < 30s hard gate.
- dmax-api + OpenClaw usable < 30s preferred, < 45s hard gate.
- First synthetic OpenClaw warmup < 10s.
- Warm simple DMAX chat turns: OpenClaw overhead excluding model time P50 < 2s
  and P95 < 5s; total wall P95 target < 6s.
- Warm DMAX tool-call turns: OpenClaw overhead excluding model time P50 < 2s
  and P95 < 5s; total wall P95 target < 8s.
- No regular 8-10s warm OpenClaw overhead.
- No 20-50s pre-model stalls.
- Default-agent tool count equals the DMAX tool surface and contains no
  non-DMAX tools.

Stop condition:
Stop only when the staging setup either meets the targets above with
reproducible commands, documented rollback, and a VPS promotion checklist, or
when the exact blocking stage is identified and documented with evidence
explaining why the current config/code is insufficient and what technical
change is needed next.

Work style:
Proceed in checkpoints. After each checkpoint, record what changed, what was
measured, and what remains. If a measurement fails, diagnose the specific stage
before changing architecture. Keep production untouched. Keep the final output
concise but include enough commands and paths that the run can be reproduced.
```
