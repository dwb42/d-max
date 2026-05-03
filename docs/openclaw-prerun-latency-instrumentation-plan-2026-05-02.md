# OpenClaw Pre-Run Latency Instrumentation Plan

Date: 2026-05-02

## Goal

Measure exactly what happens inside OpenClaw between:

```text
d-max openclaw_sessions_send_finished
```

and:

```text
OpenClaw trajectory session.started
```

Current measurements show this pre-run block is the dominant warm latency source
for browser contextual chat, usually around 18-21 seconds, with occasional much
larger cold/outlier delays. d-max can currently measure the block boundary, but
not the internal OpenClaw phases.

## Strict UX Constraints

- Do not merge chat sessions.
- Do not reduce context separation.
- Do not reduce answer quality.
- Do not remove or simplify UI/UX features.
- Any UX-changing latency hypothesis may only be tested once in isolation,
  measured, documented, and then fully reverted.
- Browser app chat must stay on OpenClaw with d-max MCP tools.

## Current Known State

- d-max app chat uses distinct OpenClaw sessions per app conversation:

```text
explicit:dmax-web-chat-{conversationId}
```

- The shared OpenClaw session experiment was rejected and reverted.
- Web/app overhead is not the bottleneck.
- Warm session creation/prewarm is usually small.
- The remaining dominant block is OpenClaw internal time before
  `session.started`.
- `agent.wait` can return `ok` before the actual assistant transcript is written;
  d-max now waits longer for the transcript so it returns the real answer instead
  of a false error.

## Required Measurement Approach

Instrument OpenClaw itself with temporary local white-box spans. d-max-side
diagnostics cannot explain the pre-run block because OpenClaw trajectory starts
too late, at `session.started`.

Use an env flag so instrumentation is isolated:

```text
OPENCLAW_PRERUN_TRACE=1
```

Write NDJSON events to a local diagnostics file, for example:

```text
data/diagnostics/openclaw-prerun/2026-05-02.ndjson
```

Each event should include:

- timestamp
- runId
- sessionKey
- sessionId when available
- phase name
- start/end or duration
- process pid
- any safe non-secret details

Do not log secrets, OAuth tokens, prompt text, or full user content.

## Candidate OpenClaw Files

Inspect and instrument the installed OpenClaw runtime under:

```text
/opt/homebrew/lib/node_modules/openclaw/dist/
```

Likely files:

```text
server-methods-b3jaTRE_.js
chat-CTjpvvH8.js
dispatch-gfPCX7Ws.js
queue-B4CxW4nn.js
queue-helpers-9H6nRHKM.js
selection-D9uTvvsw.js
```

The exact hashed filenames may change after OpenClaw updates. Re-discover them
with `rg`:

```bash
rg -n "handleSessionSend|sessions.send|dispatchInboundMessage|enqueueFollowupRun|scheduleFollowupDrain|session.started" /opt/homebrew/lib/node_modules/openclaw/dist -g '*.js'
```

## Spans To Add

Add spans around the path from `sessions.send` to `session.started`:

```text
sessions.send entered
chat.send entered
user transcript append start/end
dispatchInboundMessage start/end
queue enqueue start/end
queue drain start
queue debounce start/end
dispatchReplyFromConfig start
run attempt entered
```

Inside the embedded agent run setup, add spans before `session.started`:

```text
repairSessionFileIfNeeded start/end
prewarmSessionFile start/end
SessionManager.open start/end
bootstrapHarnessContextEngine start/end
prepareSessionManagerForRun start/end
createPreparedEmbeddedPiSettingsManager start/end
resourceLoader.reload start/end
splitSdkTools / tool allowlist start/end
createEmbeddedAgentSessionWithResourceLoader start/end
applySystemPromptOverride start/end
session.setActiveToolsByName start/end
trajectory session.started
```

## Expected Output Shape

After instrumentation, each run should produce a breakdown like:

```text
sessions.send ack:                         7 ms
queue/debounce:                         1000 ms
dispatch setup:                           40 ms
session file repair/prewarm:              12 ms
SessionManager.open:                      80 ms
context engine bootstrap:               4300 ms
resourceLoader.reload:                  8200 ms
agent session creation:                 5100 ms
tool allowlist/system prompt setup:       50 ms
total before session.started:          19700 ms
```

The numbers above are examples, not current facts.

## Execution Plan After Session Reset

1. Read this file plus:

```text
docs/session-handoff-openclaw-latency-2026-05-02.md
docs/current-state.md
src/chat/openclaw-agent.ts
src/chat/app-chat.ts
src/api/server.ts
openclaw/config.web.json
```

2. Confirm app and API state:

```bash
lsof -iTCP:5173 -sTCP:LISTEN -n -P
lsof -iTCP:3088 -sTCP:LISTEN -n -P
lsof -iTCP:18789 -sTCP:LISTEN -n -P
curl -sS http://localhost:3088/api/openclaw/status
```

3. Patch OpenClaw runtime locally with guarded pre-run trace spans.

4. Restart API/OpenClaw with the instrumentation flag:

```bash
OPENCLAW_PRERUN_TRACE=1 npm run api
```

5. Run at least 3 measured browser-context chat simulations:

- create a new conversation for a context
- prewarm the context
- send first message
- send follow-up in the same conversation

6. Correlate:

- d-max diagnostics: `data/diagnostics/chat-turns/*.ndjson`
- app prompt logs: `app_prompt_logs.turn_trace`
- OpenClaw trajectory files:

```text
data/openclaw-web-state/agents/main/sessions/*.trajectory.jsonl
```

- new pre-run trace file:

```text
data/diagnostics/openclaw-prerun/*.ndjson
```

7. Report:

- total pre-run time
- per-phase durations
- largest phase
- whether phase is queue, context engine, resource loader, MCP/tool setup,
  session manager, or embedded agent creation
- whether an optimization is UX-neutral

8. If any instrumentation changes were made directly under the global OpenClaw
   install, either revert them after analysis or document exactly what remains.

## Important Prior Negative Result

Testing `messages.queue.debounceMsByChannel.webchat = 0` did not remove the
dominant pre-run block. It was reverted. Do not assume queue debounce is the main
cause without the new pre-run trace proving it.

