# Session Handoff: OpenClaw Latency

Date: 2026-05-02

## Latest Update: Cold Prewarm Patch

This section captures the latest patch and measurements from the OpenClaw
Cold-Prewarm round. It supersedes the older "8.5-9s" bottleneck notes below for
the current state of debugging.

### Patch Implemented

Goal: move the very expensive cold `ensureRuntimePluginsLoaded(...)` /
`openclaw.dispatch.runtime_plugins_load_end` work out of the first real user
chat turn.

Repo files changed by the focused patch:

```text
src/config/env.ts
src/chat/openclaw-agent.ts
```

No global OpenClaw dist files were changed in this patch.

New env flags:

```text
DMAX_OPENCLAW_PREWARM=1
DMAX_OPENCLAW_PREWARM_TIMEOUT_MS=60000
DMAX_OPENCLAW_PREWARM_WAIT_FOR_COMPLETION=1
```

Default behavior:

- `DMAX_OPENCLAW_PREWARM` defaults to `0`, so the patch is opt-in.
- Timeout defaults to `60000`.
- `WAIT_FOR_COMPLETION` defaults to `0`.

Main implementation:

- `prewarmOpenClawGatewayOnce(...)` in `src/chat/openclaw-agent.ts`.
- Internal session key: `explicit:dmax-openclaw-warmup`.
- Internal prompt:

```text
System warmup. Do not use tools. Reply with exactly: OK
```

Trigger points:

- `warmOpenClawGateway(...)` after Gateway readiness.
- `warmOpenClawGatewayForDev(...)` after Gateway readiness.
- Guard before real app/user OpenClaw chat turns.
- Guard after Gateway restart before retrying a real user turn.

Important implementation details:

- Uses a module-level `gatewayPrewarmPromise` to dedupe parallel prewarm calls.
- Tracks completion/failure by a gateway key based on state dir plus current
  listener PID(s) on port `18789`.
- Resets prewarm completion/failure markers on Gateway restart.
- Uses the existing Gateway client and session cache/registry logic.
- Does not create or write a normal d-max app conversation.
- Does not call the d-max context resolver.
- Does not expose the warmup reply in UI.
- In `send_only` mode it still waits for the OpenClaw run to reach
  `session.started` by polling the local OpenClaw trajectory summary. This is
  intentional: a raw `sessions.send` ACK happens before the cold plugin load and
  would otherwise mark prewarm complete too early.
- In `wait_for_completion` mode it additionally calls `agent.wait`.
- Errors and timeouts are logged as failed prewarm events and do not crash the
  API server.

Diagnostics added:

```text
openclaw.prewarm.started
openclaw.prewarm.session_create_start
openclaw.prewarm.session_create_done
openclaw.prewarm.sessions_send_start
openclaw.prewarm.sessions_send_done
openclaw.prewarm.session_started_seen
openclaw.prewarm.agent_wait_start
openclaw.prewarm.agent_wait_done
openclaw.prewarm.done
openclaw.prewarm.failed
```

### Verification

Commands run after the patch:

```bash
npm run typecheck
npm test -- tests/chat/openclaw-agent.test.ts
```

Both passed.

### Measurements From Prewarm Patch

Measurement flags used:

```text
OPENCLAW_PRERUN_TRACE=1
DMAX_OPENCLAW_LATENCY_TRACE=1
DMAX_CHAT_TURN_DIAGNOSTICS=1
```

For B/C measurement runs, `DMAX_OPENCLAW_PREWARM_TIMEOUT_MS=360000` was used so
that the warmup would not timeout before OpenClaw reached `session.started`.
The production/default timeout remains `60000`.

#### Scenario A: Prewarm Disabled

Env:

```text
DMAX_OPENCLAW_PREWARM=0
```

Notes:

- First attempted chat while Gateway was still starting returned:
  `OpenClaw gateway is listening but not responsive yet.`
- The first successful real user turn used:
  `traceId=prewarm-a2-1777743362`
  `runId=explicit:dmax-web-chat-59-1777743378897`

Measured:

```text
HTTP total: 217.546790s
turn_trace totalMs: 217544
dmax.sessions_send.after: 16.9ms
dmax.agent_wait.after: 201003.8ms
openclaw.dispatch.runtime_plugins_load_end: 36051.7ms
openclaw.pi_embedded.runtime_plugins_loaded: 0.9ms
openclaw.pi_embedded.model_resolved: 25349.0ms
openclaw.pi_embedded.auth_profile_initialized: 3304.4ms
openclaw.selection.tools_raw_created: 123852.8ms
openclaw.embedded.before_session_started_event: 2026-05-02T17:39:36.851Z
```

Interpretation:

- Without prewarm, the user turn paid a 36.1s dispatch plugin-load cost.
- In this same cold run, the largest measured span was actually
  `openclaw.selection.tools_raw_created` at 123.9s.

#### Scenario B: Prewarm Enabled, send_only

Env:

```text
DMAX_OPENCLAW_PREWARM=1
DMAX_OPENCLAW_PREWARM_WAIT_FOR_COMPLETION=0
DMAX_OPENCLAW_PREWARM_TIMEOUT_MS=360000
```

Warmup:

```text
traceId=openclaw-prewarm-20260502174113-75b4bb05
runId=explicit:dmax-openclaw-warmup-1777743692445
openclaw.prewarm.done durationMs: 217864.4ms
openclaw.prewarm.session_create_done durationMs: 18904.2ms
openclaw.prewarm.sessions_send_done durationMs: 12.2ms
openclaw.prewarm.session_started_seen durationMs: 198946.9ms
openclaw.dispatch.runtime_plugins_load_end: 35405.1ms
openclaw.pi_embedded.model_resolved: 26013.1ms
openclaw.pi_embedded.auth_profile_initialized: 3358.1ms
openclaw.selection.tools_raw_created: 124173.7ms
```

First real user turn after warmup:

```text
traceId=prewarm-b-user-1777744015
runId=explicit:dmax-web-chat-60-1777744016041
HTTP total: 23.390296s
turn_trace totalMs: 23388
dmax.sessions_send.after: 9.7ms
dmax.agent_wait.after: 22634.0ms
openclaw.dispatch.runtime_plugins_load_end: 1.3ms
openclaw.pi_embedded.runtime_plugins_loaded: 0.9ms
openclaw.pi_embedded.model_resolved: 22.2ms
openclaw.pi_embedded.auth_profile_initialized: 174.9ms
openclaw.selection.tools_raw_created: 18290.1ms
openclaw.embedded.before_session_started_event: 2026-05-02T17:47:16.823Z
```

Interpretation:

- The prewarm moved the 35.4s cold dispatch plugin load into the internal
  warmup session.
- The first real user turn saw plugin load at 1.3ms.
- Provider/model/auth setup also looked warmed.
- A warm ~18.3s `tools_raw_created` span remained.

#### Scenario C: Prewarm Enabled, wait_for_completion

Env:

```text
DMAX_OPENCLAW_PREWARM=1
DMAX_OPENCLAW_PREWARM_WAIT_FOR_COMPLETION=1
DMAX_OPENCLAW_PREWARM_TIMEOUT_MS=360000
```

Warmup:

```text
traceId=openclaw-prewarm-20260502174843-bd91b3f5
runId=explicit:dmax-openclaw-warmup-1777744123936
openclaw.prewarm.done durationMs: 197388.0ms
openclaw.prewarm.agent_wait_done durationMs: 197056.0ms
openclaw.dispatch.runtime_plugins_load_end: 34745.3ms
openclaw.pi_embedded.model_resolved: 25543.0ms
openclaw.pi_embedded.auth_profile_initialized: 3320.4ms
openclaw.selection.tools_raw_created: 122021.2ms
```

First real user turn after warmup:

```text
traceId=prewarm-c-user-1777744330
runId=explicit:dmax-web-chat-61-1777744354042
HTTP total: 47.550781s
turn_trace totalMs: 47547
dmax.sessions_send.after: 9.7ms
dmax.agent_wait.after: 23579.8ms
openclaw.dispatch.runtime_plugins_load_end: 1.3ms
openclaw.pi_embedded.runtime_plugins_loaded: 0.9ms
openclaw.pi_embedded.model_resolved: 24.1ms
openclaw.pi_embedded.auth_profile_initialized: 176.7ms
openclaw.selection.tools_raw_created: 18432.4ms
openclaw.embedded.before_session_started_event: 2026-05-02T17:52:55.358Z
```

Interpretation:

- `wait_for_completion` also moved the cold dispatch plugin load out of the
  first user turn.
- It did not clearly improve the first user turn over `send_only`.
- The higher HTTP total in C was affected by a slow `sessions.create` before
  `sessions.send` for the new real user session: about 23.8s.
- The warm pre-run issue remained: `tools_raw_created` was 18.4s.

### Updated Diagnosis

Confirmed:

- d-max app preparation is not the dominant latency.
- `sessions.send` ACK is normally milliseconds once a session exists.
- `agent.wait` is waiting on the real OpenClaw run, not causing the latency by
  itself.
- Cold `ensureRuntimePluginsLoaded(...)` / dispatch runtime plugin load can be
  moved out of the first real user turn by the new prewarm.
- Provider/model/auth cold setup is also largely warmed by the prewarm path.

Current primary warm suspect:

```text
openclaw.selection.tools_raw_created
```

Evidence:

- After prewarm, first real user turns still took about 23s.
- In both B and C post-prewarm user turns, `openclaw.selection.tools_raw_created`
  was about 18.3-18.4s.
- `openclaw.dispatch.runtime_plugins_load_end` was only 1.3ms in those same
  user turns.
- `openclaw.pi_embedded.model_resolved` was only 22-24ms in those same user
  turns.
- `openclaw.pi_embedded.auth_profile_initialized` was about 175-177ms in those
  same user turns.

### Tool Allowlist Status

Do not change this as part of the prewarm patch. It is still known wrong and
should be fixed separately.

Current warning observed:

```text
tools.allow allowlist contains unknown entries (...)
```

Known actually registered d-max MCP tool names:

```text
d-max__listCategories
d-max__createCategory
d-max__updateCategory
d-max__listInitiatives
d-max__getInitiative
d-max__createInitiative
d-max__updateInitiative
d-max__archiveInitiative
d-max__updateInitiativeMarkdown
d-max__listTasks
d-max__createTask
d-max__updateTask
d-max__completeTask
d-max__deleteTask
```

The bad entries are lower-case/case-mismatched variants such as:

```text
d-max__createproject
d-max__listtasks
```

### Next Debug Plan

Continue with exactly one focused area:

```text
Split and diagnose openclaw.selection.tools_raw_created.
```

Concrete next steps:

1. Find the exact implementation behind `openclaw.selection.tools_raw_created`
   in the installed OpenClaw dist code.
2. Add env-gated spans inside that block only, behind `OPENCLAW_PRERUN_TRACE=1`.
3. Split at least:
   - MCP runtime lookup/reuse
   - MCP server connection, if any
   - `tools/list`
   - schema conversion/materialization
   - allowlist filtering
   - bundled/runtime tool merge
   - any filesystem/config reads in this path
4. Run one warm baseline with prewarm enabled and confirm which subspan accounts
   for the ~18s.
5. Only then propose a fix. Likely candidates are cache/reuse of tool/schema
   materialization, removing per-turn tool raw creation, or fixing allowlist
   behavior if it is proven relevant.

Avoid:

- Do not refactor d-max broadly.
- Do not switch providers/models.
- Do not change the tool allowlist in the same patch unless the measurement
  proves it blocks diagnosis.
- Do not modify global OpenClaw dist without documenting exact file, marker, and
  rollback.

## Latest Update: Tool Raw Creation Debugging

This section captures the focused `openclaw.selection.tools_raw_created`
debugging round after the cold-prewarm fix.

### Confirmed Baseline

Warm baseline with prewarm enabled:

```text
traceId=toolsraw-baseline-1777745598
conversationId=62
prompt=ping
DMAX_OPENCLAW_PREWARM=1
DMAX_OPENCLAW_PREWARM_TIMEOUT_MS=60000
OPENCLAW_PRERUN_TRACE=1
DMAX_OPENCLAW_LATENCY_TRACE=1
DMAX_CHAT_TURN_DIAGNOSTICS=1
```

Measured:

```text
HTTP total: 29.515s
openclaw.selection.tools_raw_created: 10171.9ms
openclaw.selection.tools_raw.openclaw_tools_done: 10046.7ms
openclaw.selection.tools_raw.provider_tools_done: 9889.2ms
openclaw.selection.tools_raw.bundle_mcp_session_runtime: 96.6ms
openclaw.selection.tools_raw.bundle_mcp_tools_materialized: 472.1ms
final effective tools at session.started: 14
```

Interpretation:

- The remaining warm bottleneck is not MCP `tools/list`.
- The dominant subspan is OpenClaw local/provider tool creation.
- MCP tool materialization is visible but much smaller than the provider/local
  tool path.
- OpenClaw builds local/provider tools even when the final d-max browser-chat
  allowlist only needs external MCP tools.

### Final d-max MCP Tools

The final effective OpenClaw tools for the d-max browser-chat turn are the
14 d-max MCP tools:

```text
d-max__listCategories
d-max__createCategory
d-max__updateCategory
d-max__listInitiatives
d-max__getInitiative
d-max__createInitiative
d-max__updateInitiative
d-max__archiveInitiative
d-max__updateInitiativeMarkdown
d-max__listTasks
d-max__createTask
d-max__updateTask
d-max__completeTask
d-max__deleteTask
```

These map to local d-max capabilities over SQLite-backed project, task,
category, and initiative-memory operations.

### Local OpenClaw Tools Built Then Filtered

The expensive path builds local OpenClaw/provider tools that are not needed for
the normal d-max browser-chat tool policy:

```text
read
edit
write
exec
process
apply_patch
canvas
nodes
cron
message
tts
image_generate
music_generate
video_generate
gateway
agents_list
update_plan
sessions_list
sessions_history
sessions_send
sessions_spawn
sessions_yield
subagents
session_status
web_search
web_fetch
image
pdf
browser
memory_search
memory_get
code_execution
x_search
```

The useful extra capabilities of these local OpenClaw tools are web/browser
research, file and code operations, subagent/session orchestration, media
generation, automations, memory/provider extras, and other generic agent
runtime functions. For normal d-max browser chat, only the d-max MCP tools are
required for durable product state changes.

### Allowlist Finding

`openclaw/config.web.json` currently contains lowercase/case-mismatched entries
such as:

```text
d-max__createproject
d-max__listtasks
```

The actual MCP names are CamelCase, for example:

```text
d-max__createInitiative
d-max__listTasks
```

This mismatch causes tool-allow warnings and should be cleaned up, but it was
not the measured root cause of the warm 10-18s `tools_raw_created` cost. In the
measured baseline, final effective tools still resolved to the expected 14 d-max
MCP tools.

### Temporary Hotpatch Result

A temporary env-gated OpenClaw dist hotpatch was tested and then fully restored.
The hotpatch skipped local OpenClaw tool creation when the effective allowlist
contained only external MCP-style names such as `d-max__listTasks`.

Post-hotpatch measurement:

```text
traceId=toolsraw-fix-1777746248
conversationId=63
prompt=ping
openclaw.selection.tools_raw_created: 99.4ms
prewarm openclaw.selection.tools_raw_created: 163.1ms
HTTP total: 18.65s
```

Interpretation:

- Skipping local/provider tool creation reduced `tools_raw_created` from about
  10.2s in the instrumented baseline to about 0.1s in the real user turn.
- The remaining end-to-end time was then dominated by other phases, especially
  session preparation and model response, not `tools_raw_created`.
- The hotpatch was not kept because it touched global OpenClaw dist files and
  should be replaced by a deliberate upstream/configurable fix.

### Global OpenClaw Instrumentation Restored

Temporary instrumentation was applied only for diagnosis and then restored from
backups. Files touched:

```text
/opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js
/opt/homebrew/lib/node_modules/openclaw/dist/pi-tools-oOiy-pNP.js
/opt/homebrew/lib/node_modules/openclaw/dist/openclaw-tools-C7Or31if.js
/opt/homebrew/lib/node_modules/openclaw/dist/tools-DHEGJXyc.js
/opt/homebrew/lib/node_modules/openclaw/dist/tool-policy-pipeline-ChGQVHbp.js
```

Backup pattern:

```text
<file>.dmax-toolsraw-bak
```

Restore path used:

```bash
cp <file>.dmax-toolsraw-bak <file>
node --check <file>
```

No permanent global OpenClaw dist patch should remain from this round.

### Current Recommendation

Implement an OpenClaw-side, allowlist-aware local-tool skip/cache:

- If the effective tool allowlist contains only external MCP names
  (`server__tool`), skip local/provider tool creation.
- If a local tool name such as `web_search`, `web_fetch`, `browser`, `read`, or
  `exec` is explicitly allowed, build local tools for that turn/session.
- Cache provider/local tool schema materialization per gateway process where
  possible, keyed by config, provider/model, workspace/sandbox permissions, and
  effective allowlist.

Small d-max-side cleanup that remains valid regardless of the OpenClaw fix:

- Correct `openclaw/config.web.json` tool allow entries to CamelCase d-max MCP
  names so allowlist warnings disappear and the intended policy is explicit.

## Latest Update: MCP-Only Tool Calling Patch

This section captures the working state after testing an MCP-only OpenClaw tool
path for d-max browser chat.

### Implemented Behavior

The d-max browser-chat OpenClaw config now explicitly allows only the 14 d-max
MCP tools with their CamelCase OpenClaw names:

```text
d-max__listCategories
d-max__createCategory
d-max__updateCategory
d-max__listInitiatives
d-max__getInitiative
d-max__createInitiative
d-max__updateInitiative
d-max__archiveInitiative
d-max__updateInitiativeMarkdown
d-max__listTasks
d-max__createTask
d-max__updateTask
d-max__completeTask
d-max__deleteTask
```

A temporary global OpenClaw dist patch adds:

```text
DMAX_OPENCLAW_MCP_ONLY_TOOLS=1
```

When this flag is set and the effective allowlist contains only MCP-style names
(`server__tool`) or `bundle-mcp`, OpenClaw skips local/provider tool creation in
the embedded selection path. MCP discovery and MCP tool materialization still
run, so d-max tools remain available.

If a future config explicitly allows a local OpenClaw tool such as
`web_search`, `web_fetch`, `browser`, `read`, or `exec`, the skip condition does
not apply and local/provider tools can be built again.

### Files Changed

Repo file:

```text
openclaw/config.web.json
```

Global OpenClaw dist file:

```text
/opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js
```

Backup:

```text
/opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js.dmax-mcp-only-20260502225304.bak
```

Rollback:

```bash
cp /opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js.dmax-mcp-only-20260502225304.bak \
  /opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js
node --check /opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js
```

Runtime disable without restoring the file:

```text
DMAX_OPENCLAW_MCP_ONLY_TOOLS=0
```

### Verification

Commands:

```bash
node --check /opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.web.json" openclaw config validate --json
npm run typecheck
```

All passed.

### Measurements

Baseline with corrected config but without `DMAX_OPENCLAW_MCP_ONLY_TOOLS=1`:

```text
traceId=mcp-only-baseline-1777755351
conversationId=64
openclaw.selection.tools_raw_created: 17852.5ms
final effective tool count: 14
```

Patched warm `ping` turns with `DMAX_OPENCLAW_MCP_ONLY_TOOLS=1`:

```text
traceId=mcp-only-patched-warm-1-1777755823
HTTP total: 3.974s
openclaw.selection.tools_raw_created: 0.073ms
final effective tool count: 14

traceId=mcp-only-patched-warm-2-1777755827
HTTP total: 4.886s
openclaw.selection.tools_raw_created: 0.177ms
final effective tool count: 14

traceId=mcp-only-patched-warm-3-1777755832
HTTP total: 5.324s
openclaw.selection.tools_raw_created: 0.064ms
final effective tool count: 14
```

Browser UI test on project 7:

```text
traceId=browser-chat-20260502211205-816a1066
context: initiative:7
Browser/API end-to-end: 6.7s
sessions.send finished: 121ms
openclaw.selection.tools_raw_created: 0.073ms
final effective tool count: 14
MCP calls: completeTask x2
MCP call duration: 1-2ms each
```

Read-only MCP smoke:

```text
traceId=mcp-only-tool-smoke-1777755877
prompt: Liste meine offenen Aufgaben kurz.
MCP calls: listTasks, listInitiatives
openclaw.selection.tools_raw_created: 0.061ms
final effective tool count: 14
```

### Result

The previous warm `tools_raw_created` cost of roughly `18s` is eliminated for
the MCP-only browser-chat path. Remaining latency is OpenClaw run setup, MCP
runtime/materialization, model reasoning/generation, and any actual tool calls.

The current architectural opening is to keep the default d-max agent fast and
MCP-only, then route occasional web/search/browser work through an explicitly
separate agent or backend orchestration tool that enables local OpenClaw web
tools only for that delegated run.

## Current Goal

Reduce latency for browser DMAX chat via OpenClaw, especially contextual chats such
as `http://localhost:5173/initiatives/1`.

The user wants low latency and asked to measure precisely before making further
changes. The latest direction was to keep optimizing end to end, but this handoff
captures the exact state so a fresh session can continue safely.

## Important Product Constraints

- Keep browser chat on the OpenClaw path.
- Do not switch app chat or Telegram back to a direct/plain model API path unless
  explicitly requested.
- SQLite remains the source of truth.
- Durable state changes must go through tools/API services.
- Context resolver synchronization is mandatory when data model or domain context
  changes.

## Runtime State Observed

- API server: `npm run api` on port `3088`.
- Web app: Vite on port `5173`.
- OpenClaw gateway: port `18789`.
- `.env` uses `DATABASE_PATH=./data/dmax.dev.sqlite`.
- Vite proxies `/api` to `http://localhost:3088`.

## Changes Already Made In This Latency Work

### OpenClaw Pricing Fetch Bypass

File: `src/chat/openclaw-agent.ts`

The gateway spawn environment now sets `NODE_ENV: "test"` so OpenClaw 2026.4.26
skips gateway model-pricing refresh during local web gateway startup. This removed
the previously observed 60 second OpenRouter/LiteLLM pricing timeouts.

Observed before this change:

- Trace `browser-chat-20260502122009-9f24b18d`.
- Total turn time: about `77.949s`.
- App-side preparation: milliseconds.
- `sessions.create`: about `0.3s`.
- `sessions.send`: about `0.27s`.
- `agent.wait`: about `74.8s`.
- OpenClaw logs showed:
  - `OpenRouter pricing fetch failed (timeout 60s)`
  - `LiteLLM pricing fetch failed (timeout 60s)`

### Persistent Gateway WebSocket

File: `src/chat/openclaw-agent.ts`

`callOpenClawGateway(...)` now reuses a persistent gateway client instead of
creating and stopping a `GatewayClient` for every RPC.

Added helper concepts:

- `gatewayConnection`
- `getOpenClawGatewayConnection`
- `invalidateOpenClawGatewayConnection`

### Prepared Session Cache And In-Flight Deduplication

File: `src/chat/openclaw-agent.ts`

`prepareOpenClawSession(...)` now:

- checks an in-memory prepared-session cache,
- reads OpenClaw's local session registry before calling the gateway,
- joins an in-flight create promise for the same context,
- only calls `sessions.create` when no existing session is found,
- caches successful prepared sessions.

Added helper concepts:

- `preparedSessionsByKey`
- `preparedSessionPromisesByKey`
- `GATEWAY_SESSION_CREATE_TIMEOUT_MS = 30_000`
- `getCachedPreparedSession`
- `cachePreparedSession`
- `readPreparedSessionFromRegistry`
- `preparedSessionCacheKey`
- `openClawRegistrySessionKey`

OpenClaw registry path used:

```text
data/openclaw-web-state/agents/main/sessions/sessions.json
```

## Verification Already Done

`npm run typecheck` passed after the OpenClaw agent changes.

Full tests were not confirmed after the latest set of changes in the interrupted
session.

## Measured Improvements

After restarting the API, prewarm for an existing initiative context became
effectively instant:

```text
GET /api/openclaw/status
status: ready
total: about 0.032s

POST /api/openclaw/prewarm
body: {"context":{"type":"initiative","initiativeId":1}}
total: about 0.0037s
openClawSessionId: 2176023a-14ba-4b7d-8654-ce15a75da831
```

Previously, the same prewarm could time out at `3s` while OpenClaw continued
creating the session in the background.

## Current Remaining Bottleneck

The app/OpenClaw RPC overhead is now down to milliseconds for an existing session.
The remaining latency is inside OpenClaw after `sessions.send`.

Measured chat turns:

```text
Trace: codex-fast-smoke-1777725270
Total: about 13.647s
sessions.create: skipped/cached at about 35ms
sessions.send: done by about 39ms
openclaw_session_started: about 8.747s
model completed/done: about 13.64s

Trace: codex-fast-smoke2-1777725344
Total: about 16.212s
sessions.create: skipped/cached at about 34ms
sessions.send: done by about 37ms
openclaw_session_started: about 8.573s
model completed/done: about 16.205s
```

Current latency split:

- d-max preparation and gateway send path: milliseconds.
- OpenClaw internal queue/dispatch/run-start delay: about `8.5s`.
- Model generation: about `5-8s` for the tested context.

## Direct OpenClaw Turn Check

A direct `runOpenClawAgentTurn(...)` benchmark with the existing session showed
the same kind of run-start delay, so this is not specific to the browser
streaming endpoint.

Prompt:

```text
Antworte nur mit: ok
```

Result:

```json
{"text":"ok","activities":0,"sessionId":"2176023a-14ba-4b7d-8654-ce15a75da831"}
```

Observed run:

```text
run id: 2176023a-14ba-4b7d-8654-ce15a75da831-1777725386916
session.started: 12:36:35.905Z
model.completed: 12:36:38.358Z
```

The run id timestamp implies the message was sent at roughly `12:36:26.916Z`,
which means about `9s` passed before `session.started`.

## OpenClaw Internals Inspected So Far

Installed OpenClaw files inspected under:

```text
/opt/homebrew/lib/node_modules/openclaw/dist/
```

Findings:

- `sessions.send` in `server-methods-b3jaTRE_.js` delegates to
  `handleSessionSend`.
- `handleSessionSend` calls `chatHandlers["chat.send"]`.
- `chat.send` in `chat-CTjpvvH8.js` validates and responds immediately with
  `{runId, status: "started"}`.
- It then calls `dispatchInboundMessage(...)`.
- Queue code in `queue-B4CxW4nn.js` has
  `DEFAULT_QUEUE_DEBOUNCE_MS = 1000`.
- `resolveQueueSettings` uses `messages.queue.debounceMs ?? 1000`.
- `waitForQueueDebounce` in `queue-helpers-9H6nRHKM.js` returns immediately only
  when `process.env.OPENCLAW_TEST_FAST === "1"`, otherwise it waits
  `queue.debounceMs`.

This explains about `1s`, not the full observed `8.5-9s`. Continue inspecting
dispatch and queue-drain internals.

Likely next files to inspect:

```text
/opt/homebrew/lib/node_modules/openclaw/dist/dispatch-gfPCX7Ws.js
/opt/homebrew/lib/node_modules/openclaw/dist/get-reply-eY9NJdyX.js
/opt/homebrew/lib/node_modules/openclaw/dist/queue-helpers-9H6nRHKM.js
```

## Next Optimization Targets

### 1. OpenClaw Queue/Dispatch Delay

Find the exact source of the remaining `8.5-9s` delay before
`openclaw_session_started`.

Likely candidates:

- queue debounce,
- channel-specific collect mode,
- dispatch delay,
- worker/run startup delay,
- another OpenClaw bootstrap guard before the model request starts.

Configuration-based fix is preferred over broad test flags.

Possible config directions to verify:

```json
{
  "messages": {
    "queue": {
      "debounceMs": 0
    }
  }
}
```

or a channel-specific equivalent if OpenClaw supports it for web/app chat.

Use `OPENCLAW_TEST_FAST=1` only after checking side effects, because it may alter
more than queue debounce.

### 2. Model Runtime

Model generation still takes about `5-8s`.

The user explicitly deprioritized model/profile changes earlier. Do not switch
models as the first move. First remove unnecessary OpenClaw delay.

### 3. Frontend Activity Stream Noise

The browser stream currently appears to include stale OpenClaw activity entries
from older turns because `/api/chat/message/stream` reads session activities from
offset `0` before the new turn.

This is not the primary latency issue, but should be fixed later by reading only
new activity after the current turn start or after the initial session-file size.

## Useful Commands

Typecheck:

```bash
npm run typecheck
```

Run tests:

```bash
npm test
```

Analyze a trace:

```bash
npm run diagnostics:chat-turn -- <traceId>
```

Check OpenClaw status:

```bash
curl -sS http://localhost:3088/api/openclaw/status
```

Prewarm initiative context:

```bash
curl -sS -w '\nHTTP %{http_code} total=%{time_total}s\n' \
  -X POST http://localhost:3088/api/openclaw/prewarm \
  -H 'content-type: application/json' \
  -d '{"context":{"type":"initiative","initiativeId":1}}'
```

Fast browser-chat smoke turn:

```bash
trace="codex-fast-smoke-$(date +%s)"
curl -sS -N -w "\nHTTP %{http_code} total=%{time_total}s trace=$trace\n" \
  -X POST http://localhost:3088/api/chat/message/stream \
  -H 'content-type: application/json' \
  -H "x-dmax-trace-id: $trace" \
  -d '{"message":"Antworte nur mit: ok","conversationId":1,"context":{"type":"initiative","initiativeId":1},"source":"app_text"}'
```

## Caution For Next Session

The working tree is dirty and includes many existing changes. Do not revert
unrelated files. Treat existing modifications as user or prior-session work.

Current known task created during testing:

```text
Task id 32: Termin mit Hersteller in München vereinbaren
```

Do not delete it unless explicitly requested.
