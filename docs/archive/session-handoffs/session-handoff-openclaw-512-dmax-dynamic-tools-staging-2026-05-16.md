# OpenClaw 2026.5.12 DMAX Dynamic Tool Staging - 2026-05-16

## Scope

This is the follow-up to the MCP-only staging attempt. Production config, production data, and the existing production-like container were not changed or restarted.

The tested path was a reversible DMAX OpenClaw dynamic-tool bridge:

- keep the official `@openclaw/codex` plugin installed from the active `OPENCLAW_STATE_DIR`;
- use the 2026.5.12 canonical model route `openai/gpt-5.5`;
- expose DMAX deterministic tools as OpenClaw dynamic tools named `d-max__...`;
- keep browser/canvas/media/TTS/sandbox/web/research/plugin sprawl out of the default DMAX allowlist;
- keep research/web as a separate `dmax-research` agent.

## Repo Changes

Staging-only source additions:

- `openclaw/plugins/dmax-dynamic-tools/package.json`
- `openclaw/plugins/dmax-dynamic-tools/openclaw.plugin.json`
- `openclaw/plugins/dmax-dynamic-tools/index.mjs`
- `tests/openclaw/dmax-dynamic-tools-plugin.test.ts`

The plugin imports the production-built DMAX tool runner from `/app/dist`, registers all DMAX tools as OpenClaw dynamic tools, converts the existing Zod input schemas to JSON Schema, and executes tools through `createToolRunner()` with `openDatabase()`.

The existing Dockerfile default pin remains `ARG OPENCLAW_VERSION=2026.4.26`. Staging images were built with:

```sh
docker build \
  --build-arg OPENCLAW_VERSION=2026.5.12 \
  -t d-max-openclaw-staging:2026.5.12-dmax-dynamic-tools .
```

Validation passed:

```sh
npm run test -- tests/openclaw/config-web-tools.test.ts tests/openclaw/dmax-dynamic-tools-plugin.test.ts
npm run build
```

## Staging Config

Primary artifacts:

- temp dir: `/tmp/dmax-openclaw-512-dynamic-tools/`
- final API config copy: `/tmp/dmax-openclaw-512-dynamic-tools/config.staging-512-dynamic-tools-auth.json`
- current run env: `/tmp/dmax-openclaw-512-dynamic-tools/run-authapi3.env`
- image: `d-max-openclaw-staging:2026.5.12-dmax-dynamic-tools`
- current API container: `dmax-oc512-dynamic-authapi3-20260516115334`
- API port: `127.0.0.1:49432`
- data/state volume: `dmax-oc512-dynamic-final4-20260516113753-data`

Important runtime env:

```sh
DMAX_OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-dynamic-tools-auth.json
DMAX_OPENCLAW_STATE_DIR=/app/data/openclaw-web-state
DMAX_OPENCLAW_MODEL=openai/gpt-5.5
```

Important config shape:

- `agents.defaults.model.primary = "openai/gpt-5.5"`
- `agents.defaults.models["openai/gpt-5.5"].agentRuntime.id = "codex"`
- no `models.providers.openai` override in the final auth config
- `plugins.allow = ["openai", "codex", "dmax-dynamic-tools"]`
- `plugins.load.paths` includes `/app/data/openclaw-web-state/npm/node_modules/@openclaw/codex` and `/app/openclaw/plugins/dmax-dynamic-tools`
- default `main` agent allows only 47 `d-max__...` dynamic tools
- `dmax-research` is separate and allows `group:web` plus a read-oriented DMAX subset
- `plugins.slots.memory = "none"`
- `plugins.entries.codex.config.codexPlugins.enabled = false`
- `plugins.entries.codex.config.appServer.approvalPolicy = "never"`
- `plugins.entries.codex.config.appServer.sandbox = "read-only"`

## Plugin And Auth State

OpenClaw:

- version: `2026.5.12 (f066dd2)`
- official Codex plugin: `@openclaw/codex@2026.5.12`
- Codex plugin path: `/app/data/openclaw-web-state/npm/node_modules/@openclaw/codex/dist/index.js`
- Codex native runtime dependency: `@openai/codex 0.130.0`

The official plugin was installed with the OpenClaw plugin installer into the active state dir:

```sh
OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-dynamic-tools-final.json \
OPENCLAW_STATE_DIR=/app/data/openclaw-web-state \
openclaw plugins install @openclaw/codex@2026.5.12 --pin --force
```

`openclaw plugins inspect codex --json` reported the official npm state path above and `trustedOfficialInstall: true`.

`openclaw plugins inspect dmax-dynamic-tools --json` reported:

- status: `loaded`
- source: `/app/openclaw/plugins/dmax-dynamic-tools/index.mjs`
- contracts.tools: `47`

The active OpenClaw-managed `openai-codex` OAuth profile was refreshed inside the isolated staging `OPENCLAW_STATE_DIR`. Do not copy this auth state into the repo or image.

## Measurements

Startup from `authapi3` logs:

- process start: `2026-05-16T09:53:35.674Z`
- OpenClaw ready: `2026-05-16T09:53:49.118Z` = about `13.4s`
- DMAX API listening: `2026-05-16T09:53:49.402Z` = about `13.7s`
- external `/health` poll started after container creation returned: `6.678s`

### Pre-Reauth Auth Failure

First DMAX API warmup turn before refreshing the staging Codex OAuth profile:

- trace: `oc512-authapi3-first-1778925240`
- route: `/api/chat/message`
- model env: `openai/gpt-5.5`
- wall: `95.165s`
- result: `OpenClaw completed the run but no assistant reply was written to the session transcript.`

Trace summary:

- `sessions.create`: ok in about `53ms`
- `sessions.send`: ok in about `6ms`
- `agent.wait`: ok after about `4.9s`
- reply wait: timed out after `90.1s`
- session file contained only the session header
- no runtime trajectory file was written for the DMAX session

Direct CLI/probe after the same auth setup showed the underlying failure:

```text
[agents/harness] Codex agent harness failed; not falling back to embedded PI backend
OAuth token refresh failed for openai-codex:
OpenAI Codex token refresh failed (401): Could not validate your token.
code: token_expired
```

This was resolved by refreshing Codex auth inside the active staging state dir. The login command wrote credentials successfully; a read-only config write failed with `EBUSY`, but that was not blocking because the mounted staging config already contained the target route.

Earlier in the same staging session, before this auth-specific blocker was isolated, the bridge had already proven that OpenClaw can compile a runtime context with `toolCount: 47` for the DMAX dynamic tools. That proof was not a successful target Codex-harness turn because it went through the fallback/direct path.

### Post-Reauth Successful Measurements

Codex probe after the staging auth refresh:

- status: `ok`
- latency: `10493ms`
- active route: `openai/gpt-5.5`
- allowed models: `["openai/gpt-5.5"]`
- OAuth provider present: `openai-codex`
- missing providers: none observed

First successful DMAX API warmup after reauth:

- trace: `oc512-authapi3-reauth-first-1778926084`
- API wall: `3129ms`
- trace total: `3083ms`
- session started: `1211ms`
- model completed: `3060ms`
- default-agent tool count: `47`
- reply: `OK`

Warm simple turns, 8 runs:

| Trace | Total ms | Pre-session overhead ms | Session-to-model-completed ms | Tool count |
| --- | ---: | ---: | ---: | ---: |
| `oc512-authapi3-simple-1-1778926269` | 2829 | 1239 | 1577 | 47 |
| `oc512-authapi3-simple-2-1778926272` | 2406 | 980 | 1410 | 47 |
| `oc512-authapi3-simple-3-1778926275` | 2703 | 979 | 1714 | 47 |
| `oc512-authapi3-simple-4-1778926279` | 3137 | 936 | 2185 | 47 |
| `oc512-authapi3-simple-5-1778926283` | 3380 | 996 | 2372 | 47 |
| `oc512-authapi3-simple-6-1778926287` | 2881 | 1174 | 1685 | 47 |
| `oc512-authapi3-simple-7-1778926290` | 2623 | 974 | 1634 | 47 |
| `oc512-authapi3-simple-8-1778926294` | 2708 | 1060 | 1633 | 47 |

Warm simple summary:

- total P50/P95: `2708ms` / `3380ms`
- OpenClaw overhead excluding model time, measured as pre-session delay, P50/P95: `980ms` / `1239ms`
- time to model completed P50/P95: `2693ms` / `3368ms`
- session-to-model-completed P50/P95: `1634ms` / `2372ms`

Warm DMAX tool-call turns, 6 runs. Each prompt required one `d-max__listCategories` call and an exact `TOOL_OK` reply.

| Trace | Total ms | Pre-session overhead ms | Session-to-model-completed ms | Tool count | Tool result |
| --- | ---: | ---: | ---: | ---: | --- |
| `oc512-authapi3-tool-listCategories-1-1778926425` | 5401 | 1288 | 4097 | 47 | success |
| `oc512-authapi3-tool-listCategories-2-1778926431` | 5040 | 998 | 4027 | 47 | success |
| `oc512-authapi3-tool-listCategories-3-1778926437` | 6796 | 971 | 5808 | 47 | success |
| `oc512-authapi3-tool-listCategories-4-1778926445` | 5368 | 952 | 4397 | 47 | success |
| `oc512-authapi3-tool-listCategories-5-1778926451` | 4749 | 1163 | 3573 | 47 | success |
| `oc512-authapi3-tool-listCategories-6-1778926457` | 5210 | 988 | 4207 | 47 | success |

Warm DMAX tool-call summary:

- total P50/P95: `5210ms` / `6796ms`
- OpenClaw overhead excluding model time, measured as pre-session delay, P50/P95: `988ms` / `1288ms`
- time to model completed P50/P95: `5195ms` / `6779ms`
- session-to-model-completed P50/P95: `4097ms` / `5808ms`

Tool-call proof from trajectory JSONL:

- all 6 warm tool trajectories contain `type:"tool.call"` with `name:"d-max__listCategories"`
- all 6 contain `type:"tool.result"` with `name:"d-max__listCategories"` and `success:true`
- observed result payload returned live DMAX category data, including the `Inbox` category

## Current Result

The OpenClaw 2026.5.12 DMAX dynamic-tool path is viable in isolated staging:

1. The official `@openclaw/codex` plugin is installed and loaded from the active `OPENCLAW_STATE_DIR`.
2. The canonical `openai/gpt-5.5` route and `agentRuntime.id = "codex"` are configured.
3. A refreshed staging `openai-codex` OAuth profile probes successfully.
4. The default `main` agent is reduced to the 47 DMAX dynamic tools only.
5. Browser, canvas, media, TTS, sandbox, web/research, provider/plugin sprawl, and unrelated dynamic tools are excluded from the default DMAX turn.
6. Research/web is separated into the `dmax-research` agent.
7. DMAX dynamic tools are visible and callable from the Codex harness.
8. Warm OpenClaw overhead excluding model time is below target: simple P95 `1239ms`, DMAX tool-call P95 `1288ms`.

Total warm DMAX tool-call latency P95 is `6796ms`, but this includes model deliberation plus the actual dynamic tool round trip. The measured OpenClaw pre-model/session setup overhead does not show the previous 8-10s warm overhead or 20-50s pre-model stalls after reauth.

## Secondary Findings

- OpenClaw 2026.5.12 docs say onboarding no longer imports OAuth material from `~/.codex`; mounting the old Codex CLI token volume is not sufficient.
- `DMAX_OPENCLAW_MODEL` must be explicitly set to `openai/gpt-5.5` in 2026.5.12 staging. The repo env default is still `openai-codex/gpt-5.5`, which is legacy for this route.
- The first API container attempt was blocked by stale staging device-pairing state with only `operator.write`; resetting the isolated staging device-pairing files allowed the API container to start.
- `openclaw agent` CLI can be misleading during this diagnosis: when Gateway pairing fails, it falls back to an embedded PI path and may show direct OpenAI `401 Missing bearer` errors that are not the target Codex-harness route.

## Reproduce

Build and run:

```sh
docker build \
  --build-arg OPENCLAW_VERSION=2026.5.12 \
  -t d-max-openclaw-staging:2026.5.12-dmax-dynamic-tools .

set -a
. /tmp/dmax-openclaw-512-dynamic-tools/run-authapi3.env
set +a

curl -fsS "http://127.0.0.1:${PORT}/health"
```

Inspect plugins:

```sh
docker exec "$CONTAINER" sh -lc \
  'OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-dynamic-tools-auth.json \
   OPENCLAW_STATE_DIR=/app/data/openclaw-web-state \
   openclaw plugins inspect codex --json'

docker exec "$CONTAINER" sh -lc \
  'OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-dynamic-tools-auth.json \
   OPENCLAW_STATE_DIR=/app/data/openclaw-web-state \
   openclaw plugins inspect dmax-dynamic-tools --json'
```

Probe auth without printing secrets:

```sh
docker exec "$CONTAINER" sh -lc \
  'OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-dynamic-tools-auth.json \
   OPENCLAW_STATE_DIR=/app/data/openclaw-web-state \
   openclaw models status --probe --probe-provider openai-codex --json'
```

Run and analyze the successful post-reauth DMAX warmup:

```sh
TRACE="oc512-authapi3-reauth-first-1778926084"
docker exec "$CONTAINER" node dist/scripts/analyze-chat-turn.js "$TRACE"
```

Summarize the stored warm simple and tool-call runs from the staging SQLite database:

```sh
docker exec "$CONTAINER" node - <<'NODE'
const Database=require("better-sqlite3");
const db=new Database("/app/data/dmax.sqlite",{readonly:true});
const rows=db.prepare("select id, turn_trace from app_prompt_logs where turn_trace like ? order by id").all("%oc512-authapi3-simple-%");
console.log(rows.map(({id,turn_trace}) => {
  const j=JSON.parse(turn_trace);
  const r=j.openClaw.runs?.[0] || {};
  return {id, traceId:j.traceId, totalMs:j.timing?.totalMs, preSessionDelayMs:r.sessionStartedAtMs-r.sendFinishedAtMs, toolCount:r.toolCount};
}));
NODE
```

Prove the DMAX tool call from trajectory files:

```sh
docker exec "$CONTAINER" node - <<'NODE'
const fs=require("fs");
const Database=require("better-sqlite3");
const db=new Database("/app/data/dmax.sqlite",{readonly:true});
const rows=db.prepare("select id, turn_trace from app_prompt_logs where turn_trace like ? order by id").all("%oc512-authapi3-tool-listCategories-%");
console.log(rows.map(({id,turn_trace}) => {
  const j=JSON.parse(turn_trace);
  const events=fs.readFileSync(j.openClaw.trajectoryFile,"utf8").trim().split(/\n/).map(JSON.parse);
  return {
    id,
    traceId:j.traceId,
    call: events.some(e => e.type==="tool.call" && e.data?.name==="d-max__listCategories"),
    resultSuccess: events.some(e => e.type==="tool.result" && e.data?.name==="d-max__listCategories" && e.data?.success===true),
    toolCount:j.openClaw.runs?.[0]?.toolCount
  };
}));
NODE
```

## Rollback

Remove only the isolated staging containers and temp files. Do not remove the production-like container.

```sh
docker rm -f \
  dmax-oc512-dynamic-authapi3-20260516115334 \
  dmax-oc512-dynamic-final4-20260516113753 \
  dmax-oc512-dynamic-final2-20260516113004 \
  dmax-oc512-bundleenv-20260516102810 \
  dmax-oc512-mcpenv-20260516102424 \
  dmax-oc512-noapps-20260516102057 \
  dmax-oc512-dmaxmcp-20260516101143

docker volume rm dmax-oc512-dynamic-final4-20260516113753-data

rm -rf /tmp/dmax-openclaw-512-dynamic-tools
```

Also remove the repo-side staging bridge if abandoning this path:

```sh
rm -rf openclaw/plugins/dmax-dynamic-tools
rm -f tests/openclaw/dmax-dynamic-tools-plugin.test.ts
```

The Dockerfile build arg change is intentionally reversible and keeps the production default at `2026.4.26`.

## Completion Status

Path 2 is complete for isolated staging. The native OpenClaw MCP-server exposure issue was bypassed by the reversible `dmax-dynamic-tools` bridge, which exposes the same DMAX deterministic tool surface to the 2026.5.12 Codex harness as `d-max__...` dynamic tools. Production remains untouched.

Before promotion, decide whether to keep this bridge as the staging/production integration path or continue investigating native OpenClaw MCP tool exposure as a separate upstream compatibility issue.
