# Session Handoff: OpenClaw 2026.5.12 Staging Measurement

Date: 2026-05-16

## User Goal

Dietrich wanted a clean "step 1" before changing the Docker architecture:
measure whether OpenClaw `2026.5.12` can improve latency in the current DMAX
setup, without touching production or blindly applying architecture changes.

The broader architecture question remains: DMAX and OpenClaw currently run in
one production container. Splitting them into separate containers is likely the
right direction later, because it would allow independent OpenClaw upgrades and
avoid restarting OpenClaw during normal DMAX deploys. This session focused only
on the prerequisite measurement.

## Local/Repo State

Working directory:

```text
/Users/dw/Projects/d-max
```

Intentional repo change:

```text
Dockerfile
```

`Dockerfile` was changed to make the OpenClaw package version a build arg:

```diff
+ARG OPENCLAW_VERSION=2026.4.26
-  && npm install -g openclaw@2026.4.26 @openai/codex \
+  && npm install -g openclaw@${OPENCLAW_VERSION} @openai/codex \
```

Reason: allow isolated staging builds such as:

```bash
docker build --build-arg OPENCLAW_VERSION=2026.5.12 \
  -t d-max-openclaw-staging:2026.5.12 .
```

No commit was made.

Existing local dev environment:

- `npm run dev` was started earlier and left running.
- Vite/API/voice dev stack was not stopped.

Existing Docker container:

```text
d-max-d-max-1
```

was left untouched. It exposed `127.0.0.1:49415->3088/tcp`.

Important drift found:

- Repo/Dockerfile default pin was `openclaw@2026.4.26`.
- Existing running Docker container reported `OpenClaw 2026.4.29 (a448042)`.

Do not assume current production-like Docker state exactly matches the repo.

## OpenClaw 2026.5.12 Build

Docker available:

```text
Docker version 29.4.3
Docker Compose version v5.1.3
```

Staging image built:

```text
d-max-openclaw-staging:2026.5.12
```

Image manifest/id recorded during the run:

```text
sha256:332c144f375fe07ed130da71f86854eec11c9a46123b9d3ad0ebcf0fca234544
```

Version check:

```text
OpenClaw 2026.5.12 (f066dd2)
```

Docker build emitted one unrelated warning:

```text
SecretsUsedInArgOrEnv for GOOGLE_CALENDAR_TOKEN_PATH
```

## Major Finding: 2026.5.12 Is Not Drop-In

Initial staging with current config failed:

```text
Agent failed before reply:
Requested agent harness "codex" is not registered.
```

Meaning:

- DMAX/OpenClaw asks for `agentRuntime.id = "codex"`.
- OpenClaw must have a registered agent harness named `codex`.
- In `2026.5.12`, the Codex harness is no longer automatically available from
  the core install in this setup.
- It is provided by the official external plugin:

```text
@openclaw/codex
```

OpenClaw CLI output explicitly said:

```text
plugins.entries.codex: plugin not installed: codex
install the official external plugin with:
openclaw plugins install @openclaw/codex
```

`openclaw plugins search codex` showed:

```text
@openclaw/codex code-plugin | official | v2026.5.12
OpenClaw Codex harness and model provider plugin
Install: openclaw plugins install clawhub:@openclaw/codex
```

Critical detail:

The plugin must be installed into the active OpenClaw state dir, not just copied
into `/app/openclaw/extensions`.

For production/staging DMAX this means:

```text
OPENCLAW_STATE_DIR=/app/data/openclaw-web-state
```

The successful installation path was:

```text
/app/data/openclaw-web-state/extensions/codex
```

Installing into `/app/openclaw/extensions/codex` alone made
`openclaw plugins list` show a codex plugin in some CLI contexts, but the
Gateway still did not load the harness for the DMAX state.

## Staging Config Migration Attempt

A temporary migrated config was generated outside the repo:

```text
/tmp/dmax-openclaw-512-production-config.json
```

Key changes relative to existing `openclaw/config.production.json`:

```json
{
  "agents": {
    "defaults": {
      "model": {
        "primary": "openai/gpt-5.5"
      },
      "models": {
        "openai/gpt-5.5": {}
      },
      "agentRuntime": {
        "id": "codex"
      }
    }
  },
  "messages": {
    "visibleReplies": "automatic"
  },
  "plugins": {
    "entries": {
      "openai": {
        "enabled": true
      },
      "codex": {
        "enabled": true,
        "config": {
          "discovery": {
            "enabled": false
          },
          "appServer": {
            "mode": "guardian"
          }
        }
      }
    }
  }
}
```

Also required for the DMAX API process:

```text
DMAX_OPENCLAW_MODEL=openai/gpt-5.5
```

Without this env override, DMAX still passed the old model
`openai-codex/gpt-5.5`, producing:

```text
model not allowed: openai-codex/gpt-5.5
```

## Measurement Setup

Successful measurement used:

```text
Container name: dmax-oc-20260512
Port: 127.0.0.1:49416:3088
Image: d-max-openclaw-staging:2026.5.12-codex-config
Volume: dmax-staging-20260512-measure2:/app/data
Codex auth mount: $HOME/.codex:/root/.codex
```

Important env:

```text
NODE_ENV=production
DMAX_OPENCLAW_MODEL=openai/gpt-5.5
OPENCLAW_AGENT_RUNTIME=codex
DMAX_OPENCLAW_PREWARM=0
DMAX_OPENCLAW_LATENCY_TRACE=1
DMAX_CHAT_TURN_DIAGNOSTICS=1
DMAX_CHAT_TURN_DIAGNOSTICS_DIR=/app/data/diagnostics/chat-turns
DMAX_OPENCLAW_LATENCY_TRACE_DIR=/app/data/diagnostics/openclaw-latency
```

The successful measurement volume was intentionally left in place:

```text
dmax-staging-20260512-measure2
```

All failed/intermediate staging containers were removed. Older intermediate
volumes were removed except the successful measurement volume.

## Startup Measurement

Successful run after installing `@openclaw/codex` into the active state:

```text
start_ms=1778917192514
health_ms=5396
ready_ms=5499
status={"openClaw":{"state":"ready","detail":"OpenClaw gateway health check succeeded."}}
```

Gateway log for the same run:

```text
gateway http server listening (9 plugins: browser, canvas, codex,
device-pair, file-transfer, memory-core, phone-control, talk-voice, telegram;
3.1s)
gateway ready
```

This is within the target startup range.

## Agent Turn Measurements

### First Real Turn After Restart

Trace:

```text
oc512-codex-state-turn1-1778917212
```

User message:

```text
Antworte exakt mit OK.
```

Result:

```text
reply: OK
total: 15.666s
OpenClaw overhead to model start: 8.701s
model time: 6.910s
toolCount: 30
input tokens: 31,692
output tokens: 2
```

Largest gaps:

```text
8.646s openclaw_sessions_send_finished -> openclaw_session_started
6.910s openclaw_session_started -> openclaw_model_completed
```

Interpretation:

- DMAX/API overhead before `sessions.send` was tiny.
- The first turn still paid an OpenClaw/Codex warm stage of about 8.7s before
  model start.
- This is not a 30-50s regression, but it is above the target for first
  warmup.

### Warm Simple Turns

Five warm turns after the first turn:

```text
turn=2 elapsed_ms=4975 reply=OK
turn=3 elapsed_ms=3312 reply=OK
turn=4 elapsed_ms=2848 reply=OK
turn=5 elapsed_ms=4016 reply=OK
turn=6 elapsed_ms=2620 reply=OK
```

Parsed DMAX/OpenClaw trajectory:

```text
id=2 total=4901 agentToModel=961 model=3912 toolCount=30
id=3 total=3210 agentToModel=536 model=2653 toolCount=30
id=4 total=2743 agentToModel=586 model=2139 toolCount=30
id=5 total=3916 agentToModel=597 model=3303 toolCount=30
id=6 total=2529 agentToModel=540 model=1979 toolCount=30
```

Warm OpenClaw overhead to model start:

```text
P50: 586ms
P95: 961ms
min: 536ms
max: 961ms
```

Interpretation:

- Warm per-turn overhead is comfortably under the target.
- Current warm total response time is mostly model time, not OpenClaw overhead.

### MCP Tool Attempt

Trace:

```text
oc512-mcp-turn-1778917322
```

Prompt asked the agent to use `d-max__listCategories`/`listCategories`.

Result:

```text
reply: `listCategories` ist hier nicht verfügbar...
total: 5572ms
agentToModel: 552ms
model: 4994ms
toolCount: 30
input tokens: 588
output tokens: 23
```

Interpretation:

- The MCP server is configured (`openclaw mcp list` showed `d-max`), but the
  Codex harness/tool projection did not expose the d-max MCP tools in the turn.
- This makes MCP-tool latency unmeasured in this session.
- It also shows the current default agent is not yet the intended DMAX
  MCP-only/thin agent.

## Important Current Config Problem

Even in the successful `2026.5.12` staging run, the default agent loaded too
much:

```text
9 plugins: browser, canvas, codex, device-pair, file-transfer, memory-core,
phone-control, talk-voice, telegram
```

And the agent saw:

```text
toolCount: 30
```

The active prompt/trajectory showed generic OpenClaw dynamic tools such as
browser, sessions, web_search, web_fetch, media, tts, etc. It did not expose the
expected DMAX MCP tool names.

This is baseline evidence only. It is not the target architecture/config.

## Architecture Implication

Splitting DMAX and OpenClaw into separate containers still looks strategically
right, but the measurement showed a nearer operational issue:

OpenClaw `2026.5.12` requires stateful external plugin installation for Codex.

If OpenClaw becomes its own container, that becomes cleaner:

- OpenClaw image/state/plugin lifecycle can be managed independently.
- DMAX app deploys do not restart OpenClaw.
- OpenClaw upgrades can be staged against an isolated state volume.
- Codex plugin install/upgrade can be treated as OpenClaw runtime maintenance,
  not as a DMAX app rebuild side effect.

But before splitting, the next config task is to make the default DMAX agent
thin/MCP-only and verify tool projection.

## Sources Checked

External/current sources were checked because the user asked about current
OpenClaw releases:

```text
https://github.com/openclaw/openclaw/releases
https://docs.openclaw.ai/concepts/agent-runtimes
https://docs.openclaw.ai/plugins/codex-harness
https://docs.openclaw.ai/cli/plugins
```

Local OpenClaw CLI/docs also confirmed:

- `openclaw plugins search codex`
- `openclaw plugins inspect codex --json`
- `openclaw plugins list --json`
- `openclaw logs --limit ... --plain`

## Cleanup / Artifacts

Removed:

- failed/intermediate staging containers
- failed/intermediate staging volumes:
  - `dmax-staging-20260512-data`
  - `dmax-staging-20260512-data2`
  - `dmax-staging-20260512-data3`
  - `dmax-staging-20260512-measure1`

Left intentionally:

```text
dmax-staging-20260512-measure2
```

for diagnostics and reproducibility.

Staging images created:

```text
d-max-openclaw-staging:2026.5.12
d-max-openclaw-staging:2026.5.12-codex-plugin
d-max-openclaw-staging:2026.5.12-codex-config
```

These are local staging artifacts only.

## Recommended Next Steps

1. Keep `Dockerfile` build arg or formalize it with a documented staging build
   command.
2. Do not upgrade production directly to `2026.5.12` yet.
3. Decide how `@openclaw/codex` should be installed for production:
   - baked into OpenClaw image/state initialization, or
   - one-time state volume migration, or
   - separate OpenClaw container init job.
4. Fix default agent/tool projection:
   - expose only DMAX MCP tools for normal chat,
   - avoid browser/canvas/media/TTS/sessions/web tools in the normal DMAX turn,
   - keep research/web in a separate research agent.
5. Re-run measurements with:
   - `DMAX_OPENCLAW_PREWARM=1`,
   - thin MCP-only default agent,
   - explicit plugin allowlist,
   - MCP tool call verified.
6. Then evaluate container split with measured startup/restart behavior.

## Restart Prompt

Use this prompt in a new session:

```text
Wir setzen die DMAX/OpenClaw-Latenzarbeit fort. Bitte lies zuerst:

docs/archive/session-handoffs/session-handoff-openclaw-512-staging-2026-05-16.md
docs/archive/session-handoffs/session-handoff-openclaw-latency-2026-05-02.md
docs/archive/session-handoffs/session-handoff-default-agent-tool-latency-2026-05-03.md
docs/current-state.md
openclaw/config.production.json
src/chat/openclaw-agent.ts
src/core/tool-definitions.ts
openclaw/workspace/AGENTS.md
openclaw/workspace/TOOLS.md

Kontext:
- OpenClaw 2026.5.12 wurde isoliert gemessen.
- Es ist kein Drop-in-Upgrade: der Codex Harness kommt als offizielles externes Plugin @openclaw/codex und muss im aktiven OPENCLAW_STATE_DIR installiert sein.
- Erfolgreiche Staging-Messung nutzte dmax-staging-20260512-measure2.
- Startup war gut: /health ca. 5.4s, OpenClaw ready ca. 5.5s.
- Erster Agent-Turn nach Restart: 15.666s total, davon ca. 8.701s OpenClaw bis Modellstart.
- Warme simple Turns: OpenClaw overhead bis Modellstart P50 586ms, P95 961ms.
- Der Default-Agent sah noch 30 Tools und lud Browser/Canvas/Telegram/Voice/Memory; das ist nicht der Zielzustand.
- DMAX MCP Tools waren im Codex-Harness-Turn nicht verfügbar, obwohl openclaw mcp list den Server d-max zeigte.
- Repo hat aktuell eine absichtliche Dockerfile-Änderung: ARG OPENCLAW_VERSION=2026.4.26 und npm install -g openclaw@${OPENCLAW_VERSION}.

Aufgabe:
Prüfe als nächsten Schritt sauber, wie wir in OpenClaw 2026.5.12 den normalen DMAX Default-Agent wirklich dünn/MCP-only konfigurieren und die d-max MCP Tools im Codex-Harness sichtbar machen. Keine Produktion ändern, keine Secrets ausgeben, bestehende Container nicht anfassen, erst Diagnose und reversible Staging-Änderungen.
```
*** End Patch
