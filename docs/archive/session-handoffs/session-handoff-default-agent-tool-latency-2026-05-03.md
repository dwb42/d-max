# Handoff: Default-Agent Tool Latency Experiment

Date: 2026-05-03

## Goal For Next Fresh Session

Run one more focused experiment to make the d-max Default-Agent capable of using
more OpenClaw tools without paying avoidable latency on normal turns.

The desired shape is:

- Default-Agent may have a richer tool surface if a proposed loading strategy
  keeps warm baseline latency low.
- After every measure/code patch, run warm measurements.
- For every measure, verify both:
  - tool availability: which tools the Default-Agent actually sees and can call.
  - pre-session latency: especially time before `session.started`.

Do not rely on impressions. Use trace data.

## Current State Before Reset

Current architecture name:

```text
mcp-only-fast-path
```

Meaning: the Default-Agent remains the OpenClaw-backed main agent, but all
local OpenClaw tools are skipped via early pruning. Only explicitly allowed
d-max MCP tools are available.

Current repo state has Default-Agent restored to `mcp-only-fast-path`:

- `openclaw/config.web.json`
  - `agents.list[main]` exists and is `default: true`.
  - Main allowlist contains only the 14 d-max MCP tools:
    - `d-max__listCategories`
    - `d-max__createCategory`
    - `d-max__updateCategory`
    - `d-max__listInitiatives`
    - `d-max__getInitiative`
    - `d-max__createInitiative`
    - `d-max__updateInitiative`
    - `d-max__archiveInitiative`
    - `d-max__updateInitiativeMarkdown`
    - `d-max__listTasks`
    - `d-max__createTask`
    - `d-max__updateTask`
    - `d-max__completeTask`
    - `d-max__deleteTask`
  - Main does not allow `web_search`, `web_fetch`, `x_search`,
    `sessions_spawn`, `sessions_yield`, `subagents`, or `session_status`.
  - `dmax-research` is still defined separately with web tools, but Main cannot
    currently call it because Main has no session/subagent local tools.

- `openclaw/workspace/AGENTS.md`
  - Web Research section was removed again.
  - Default prompt should no longer claim direct web tooling.

- `src/chat/openclaw-agent.ts`
  - Gateway spawn env includes:
    - `DMAX_OPENCLAW_EARLY_PRUNE_LOCAL_TOOLS=1`
    - `DMAX_OPENCLAW_AUTO_YIELD_AFTER_SPAWN=0`
    - `NODE_ENV=test` to avoid OpenClaw pricing refresh startup stalls.
  - There are many existing diagnostics/prewarm changes in this file. Do not
    blindly revert unrelated changes.

- OpenClaw global dist patch still matters:
  - `/opt/homebrew/lib/node_modules/openclaw/dist/selection-D9uTvvsw.js`
  - `/opt/homebrew/lib/node_modules/openclaw/dist/pi-tools-oOiy-pNP.js`
  - `/opt/homebrew/lib/node_modules/openclaw/dist/openclaw-tools-C7Or31if.js`
  - Controlled by `DMAX_OPENCLAW_EARLY_PRUNE_LOCAL_TOOLS=1`.
  - Semantics: if explicit allowlist exists, build only allowed local tools
    early; MCP tools still materialize.

At handoff time the web app was running:

- Vite: `http://localhost:5173/`
- API: `http://localhost:3088/`
- Processes seen:
  - `npm run api`
  - `tsx src/api/server.ts`
  - `openclaw-gateway`
  - `vite --host 0.0.0.0`

After a reset, check process state before assuming these are still alive.

## Key Measured Baselines

### Best Current Baseline: mcp-only-fast-path

Trace: `mcp-only-restored-warm-1`

- Input: `test: antworte exakt mit OK`
- Total: `5.715s`
- `toolCount`: `14`
- `preSessionDelayMs`: `2.817s`
- `session.started` at `2.817s`
- Answer: `OK`

This is the baseline to preserve.

Recent practical project turn after `mcp-only-fast-path` restore:

Trace: `browser-chat-20260502225459-5ee9dfe0`

- Input: `in welcher reihenfolge sollte ich aufgaben abarbeiten?`
- Total: `7.771s`
- `toolCount`: `14`
- `preSessionDelayMs`: `2.780s`

Cold restart trace, do not use as warm baseline:

Trace: `mcp-only-restored-ok-1`

- Total: `152.241s`
- `toolCount`: `14`
- `preSessionDelayMs`: `150.284s`
- Cause: gateway/OpenClaw cold startup path, not representative warm latency.

### Direct Web Tools In Default-Agent

Config temporarily allowed:

- 14 d-max MCP tools
- `web_search`, `web_fetch`, `x_search`
- `sessions_spawn`, `sessions_yield`, `subagents`, `session_status`

Trace: `default-web-tools-warm-ok-2`

- Input: `test: antworte exakt mit OK`
- Total: `12.806s`
- `toolCount`: `21`
- `preSessionDelayMs`: `10.440s`

Trace: `default-web-tools-warm-web-2`

- Input: one-sentence OpenClaw Session Tools web research
- Total: `30.721s`
- `toolCount`: `21`
- `preSessionDelayMs`: `10.272s`
- Direct `web_search` was used.
- `web_search` took `7.928s`.
- No `sessions_spawn`.

Conclusion from this round:

- Direct web tools worked functionally.
- Tool count became exactly 21.
- No browser/runtime/fs/media leakage.
- But warm pre-session delay increased from roughly `2.8s` to roughly `10.3s`.

### Previous Spawn/Subagent Path

Trace: `orchestrator-spawn-test-1777758457`

- Total: `156.045s`
- Main `toolCount`: `18`
- Main `preSessionDelayMs`: `2.970s`
- Functional spawn worked.
- Root problem: parent spent about `103s` in a second LLM call just to call
  `sessions_yield`.
- Child `dmax-research` itself was not the main long pole.

Research agent tool build from that run:

- `tools_raw_created`: about `7345.9ms`
- Final research tool list:
  - `web_search`
  - `web_fetch`
  - `x_search`
  - `d-max__getInitiative`
  - `d-max__listCategories`
  - `d-max__listInitiatives`
  - `d-max__listTasks`
- No browser/runtime/fs/media/session tools in the child.

Conclusion:

- Do not reintroduce the old Main `sessions_spawn` + `sessions_yield` workflow
  without a specific fix.

## Measurement Method To Reuse

### Start API With Diagnostics

Prefer starting API like this when measuring OpenClaw internals:

```sh
DMAX_CHAT_TURN_DIAGNOSTICS=1 DMAX_OPENCLAW_LATENCY_TRACE=1 npm run api
```

If Vite is needed:

```sh
npm run web
```

Check processes:

```sh
ps -axo pid,ppid,etime,command \
  | rg 'openclaw-gateway|npm run api|tsx src/api/server.ts|vite --host' \
  | rg -v rg
```

Restart API/gateway when config changes:

```sh
kill <npm-api-pid> <tsx-pid> <openclaw-gateway-pid> || true
DMAX_CHAT_TURN_DIAGNOSTICS=1 DMAX_OPENCLAW_LATENCY_TRACE=1 npm run api
```

Keep in mind: first turn after restart is usually cold and should not be used as
warm baseline.

### Standard Warm Ping

Use a unique trace id for every run:

```sh
time curl -sS -X POST http://localhost:3088/api/chat/message \
  -H 'content-type: application/json' \
  -H 'x-dmax-trace-id: <trace-id>' \
  --data '{"message":"test: antworte exakt mit OK","context":{"type":"global"},"source":"app_text"}'
```

Run at least one cold/throwaway turn after gateway restart, then 2-3 warm pings.

Analyze:

```sh
npm run diagnostics:chat-turn -- <trace-id>
```

Fast SQL overview:

```sh
sqlite3 -header -column data/dmax.dev.sqlite "
select
  id,
  conversation_id,
  created_at,
  substr(user_input,1,100) as input,
  json_extract(turn_trace,'$.traceId') as trace_id,
  json_extract(turn_trace,'$.totalMs') as total_ms,
  json_extract(turn_trace,'$.openClaw.runs[0].toolCount') as tool_count,
  json_extract(turn_trace,'$.openClaw.runs[0].preSessionDelayMs') as pre_ms
from app_prompt_logs
order by id desc
limit 20;"
```

### Tool Availability Verification

Primary indicators:

- `trajectory openclaw_session_started {"toolCount": ...}`
- `trace.metadata.data.config.redacted.agents.list[main].tools.allow`
- `context.compiled.data.systemPrompt` includes available tool names.
- `openclaw.selection.final_tool_policy` when latency trace/prerun logs are
  available.

Commands:

```sh
jq -r '
  select(.type=="session.started" or .type=="model.completed" or .type=="session.ended")
  | [.type,.ts,.runId,(.data.toolCount//""),(.data.usage.total//"")]
  | @tsv
' data/openclaw-web-state/agents/main/sessions/<session-id>.trajectory.jsonl
```

Search for exact run:

```sh
rg -n "<trace-id>|<run-id>|session.started|model.completed|session.ended|tools_raw_created|early_prune|final_tool_policy" \
  data/diagnostics data/openclaw-web-state/agents/main/sessions
```

For recent prerun tail:

```sh
tail -n 160 data/diagnostics/openclaw-prerun/2026-05-02.ndjson \
  | rg "<run-id>|early_prune|tools_raw_created|final_tool_policy|before_session_started_event"
```

### Capability Smoke Tests

After each patch, test both simple latency and actual tool availability.

1. Simple non-tool turn:

```text
test: antworte exakt mit OK
```

2. d-max MCP read turn:

```text
Liste meine offenen Aufgaben kurz.
```

3. If web tools are supposed to be available directly:

```text
Recherchiere bitte kurz im Web, was OpenClaw Session Tools sind, und gib mir 1 Satz mit Quelle.
```

Expected evidence:

- Direct availability: session transcript shows `web_search` or `web_fetch`.
- No direct availability: model should not hallucinate research; either says it
  cannot web search or uses whatever new specialist mechanism is being tested.

4. If specialist delegation via MCP tool is tested:

```text
Recherchiere bitte kurz im Web, was OpenClaw Session Tools sind, und gib mir 1 Satz mit Quelle.
```

Expected evidence:

- Main tool count remains near `mcp-only-fast-path` target.
- Main calls only d-max MCP specialist tool, e.g. `d-max__callSpecialistAgent`.
- Specialist performs actual `web_search`/`web_fetch`.
- Final answer includes source-backed result.

## Evaluation Criteria After Each Patch

Record a small table after each measure:

| Measure | Trace | Total | preSessionDelayMs | toolCount | tools available | tool call evidence | verdict |
|---|---:|---:|---:|---:|---|---|---|

Targets:

- Normal warm ping:
  - ideal: `4-6s`
  - acceptable: `<8s`
  - caution: `8-12s`
  - reject unless justified: `>12s`
- `preSessionDelayMs`:
  - ideal: `~2-3s`
  - acceptable: `<5s`
  - caution: `5-8s`
  - reject unless justified: `>8-10s`
- Tool availability must match the patch's intent exactly.
- No unexpected browser/runtime/fs/media tools in Default-Agent unless the patch
  explicitly requires them.

## Architectural Notes From Previous Discussion

Avoid API-level intent routing if possible. User explicitly does not want an
intent router in d-max API because it makes the system less agentic.

Preferred agentic alternative discussed:

- Add a d-max MCP tool such as `d-max__callSpecialistAgent`.
- Default-Agent decides to call that tool when it needs web research.
- Tool implementation calls a warm OpenClaw specialist agent.
- Specialist has web tools.
- Result returns to Default-Agent.
- Default-Agent still has only MCP tools, maybe 15 instead of 14.

Important risk:

- MCP tool calling OpenClaw while parent OpenClaw turn is active could deadlock
  or contend with gateway/session state.
- If same-gateway recursion is flaky, use a separate warm OpenClaw
  gateway/process for the specialist.

But for the next session, Dietrich wants to first share a researched solution
for making a Default-Agent have more tools without latency. Listen to that
proposal first before implementing the specialist-tool idea.

## What Not To Forget

- Use `rg`, not slow grep.
- Use `apply_patch` for file edits.
- Do not revert unrelated dirty worktree changes.
- Code is authoritative over Markdown.
- The Default-Agent latency target matters more than broad tool availability.
- Always compare against `mcp-only-restored-warm-1` and recent project turn:
  - `5.715s`, `toolCount=14`, `preSessionDelayMs=2.817s`
  - `7.771s`, `toolCount=14`, `preSessionDelayMs=2.780s`
