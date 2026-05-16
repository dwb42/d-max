# OpenClaw 2026.5.12 DMAX MCP Staging - 2026-05-16

## Scope

Staging-only diagnosis for OpenClaw `2026.5.12` with the official `@openclaw/codex` plugin. Production config, production data, and the existing production-like container were not changed or restarted.

## Final Staging Variant

Artifacts live under `/tmp/dmax-openclaw-512-dmax-mcp/`.

- Image: `d-max-openclaw-staging:2026.5.12-dmax-mcp`
- Container: `dmax-oc512-bundleenv-20260516102810`
- Port: `127.0.0.1:49420`
- Volume: `dmax-oc512-bundleenv-20260516102810-data`
- Config: `/tmp/dmax-openclaw-512-dmax-mcp/config.staging-512-noapps-env-bundle.json`
- Bundle: `/tmp/dmax-openclaw-512-dmax-mcp/dmax-mcp-bundle-env`
- OpenClaw: `2026.5.12 (f066dd2)`
- Codex plugin: `@openclaw/codex@2026.5.12`
- Codex plugin path: `/app/data/openclaw-web-state/npm/node_modules/@openclaw/codex/dist/index.js`
- Codex native runtime: `@openai/codex 0.130.0`
- Model route: `openai/gpt-5.5` with `agents.defaults.models["openai/gpt-5.5"].agentRuntime.id = "codex"`

Active OpenClaw plugins in the final variant:

- `d-max-mcp-bundle-env`
- `openai`
- `codex`

Default DMAX agent config was reduced to a DMAX MCP allowlist only: 47 `d-max__...` tool names. Research/web is separated as `dmax-research`; the default agent does not allow research/session tools.

## Config Changes Proven In Staging

Relative to the initial 2026.5.12 staging config, the final reversible staging config:

- Uses `openai/gpt-5.5`, not legacy `openai-codex/gpt-5.5`.
- Installs and loads official `@openclaw/codex` from the active `OPENCLAW_STATE_DIR`.
- Sets `plugins.allow` to `["openai", "codex", "d-max-mcp-bundle-env"]`.
- Sets `plugins.slots.memory = "none"`.
- Sets `plugins.entries.codex.config.codexPlugins.enabled = false`.
- Sets `plugins.entries.codex.config.appServer.approvalPolicy = "never"`.
- Sets `plugins.entries.codex.config.appServer.sandbox = "read-only"`.
- Defines `mcp.servers.d-max` and bundle `.mcp.json` with:
  - `command: "npm"`
  - `args: ["run", "mcp"]`
  - `cwd: "/app"`
  - `env.NODE_ENV: "production"`
  - `env.DATABASE_PATH: "/app/data/dmax.sqlite"`
  - `env.DMAX_SCHEMA_PATH: "/app/schema.sql"`
  - `env.DMAX_MEDIA_STORAGE_DIR: "/app/data/media"`

The explicit MCP env is required because `/app/data` is a mounted volume and hides the repo `data/schema.sql`; the Docker image exposes the schema at `/app/schema.sql`.

## MCP Proof

Direct MCP server proof succeeded inside staging with the same command/env:

- `npm run mcp` started.
- Registered 47 DMAX tools.
- `listCategories` was callable and returned `ok: true`.

Representative direct probe:

```sh
docker exec dmax-oc512-mcpenv-20260516102424 sh -lc 'node <direct-mcp-client-probe>'
```

Result:

```json
{
  "toolCount": 47,
  "hasListCategories": true
}
```

OpenClaw config proof also succeeded:

```sh
OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-noapps-env-bundle.json \
OPENCLAW_STATE_DIR=/app/data/openclaw-web-state \
openclaw mcp list --json
```

Result included `d-max` with the env shown above.

## Codex Harness Blocker

The Codex harness still does not expose DMAX MCP tools to the model.

Evidence from final container:

- OpenClaw bundle plugin is active: `d-max-mcp-bundle-env` loaded.
- `openclaw mcp list --json` shows `d-max`.
- Codex session binding includes both:
  - `userMcpServersFingerprint` with `d-max` and env.
  - `mcpServersFingerprint` for bundle MCP.
- The actual Codex turn has `toolCount: 0`.
- `ALL_TOOLS` inside the Codex turn lists Codex-native/built-in tools and an unrelated Apps MCP, but no DMAX tools.
- Explicit prompt to call `d-max__listCategories` or `mcp__d_max__listCategories` returned `NOT_AVAILABLE`.
- No `mcp_tool_call_started` event for DMAX appeared.

Trace IDs:

- Tool list: `oc512-bundleenv-tools-1778920165`
- Explicit DMAX MCP probe: `oc512-bundleenv-explicit-mcp-1778920185`

This means config is sufficient to start DMAX MCP directly and to pass MCP config into OpenClaw/Codex session metadata, but insufficient to make `@openclaw/codex` / Codex app-server materialize those MCP servers as callable model tools.

Separate thin-agent blocker:

- Even with `codexPlugins.enabled=false`, `approvalPolicy=never`, and `sandbox=read-only`, Codex app-server still reports features including `ShellTool`, `Apps`, `ToolSearch`, `Plugins`, `InAppBrowser`, `BrowserUse`, `ComputerUse`, and `ImageGeneration`.
- `ALL_TOOLS` still includes built-in shell/control tools such as `exec_command`, `apply_patch`, `spawn_agent`, and the unrelated `mcp__codex_apps__tripadvisor_*` tools.

Config alone did not make the Codex harness MCP-only.

## Metrics

Final variant startup:

- External `/health`: `13.837s`
- OpenClaw ready from logs: about `12.526s`
- API listening from logs: about `12.824s`

First harness turn in final variant:

- Tool-list diagnostic: `10.270s` wall
- Trace `oc512-bundleenv-tools-1778920165`

Warm simple turns, 7 runs:

| Trace | Total ms | OpenClaw pre-model ms |
|---|---:|---:|
| `oc512-bundleenv-simple-1-1778920218` | 3515 | 965 |
| `oc512-bundleenv-simple-2-1778920221` | 3035 | 823 |
| `oc512-bundleenv-simple-3-1778920225` | 3383 | 784 |
| `oc512-bundleenv-simple-4-1778920228` | 4754 | 817 |
| `oc512-bundleenv-simple-5-1778920233` | 3151 | 975 |
| `oc512-bundleenv-simple-6-1778920236` | 3671 | 802 |
| `oc512-bundleenv-simple-7-1778920240` | 3209 | 781 |

Warm simple-turn summary:

- Total P50: `3383ms`
- Total P95: `4754ms`
- OpenClaw pre-model P50: `817ms`
- OpenClaw pre-model P95: `975ms`

Warm MCP-tool-call metrics from the Codex harness are blocked because the harness does not expose DMAX MCP tools. Direct MCP callability was proven separately.

## Reproduce

```sh
set -a
. /tmp/dmax-openclaw-512-dmax-mcp/run.env
set +a

docker exec "$STAGE4_CONTAINER" sh -lc \
  'OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-noapps-env-bundle.json OPENCLAW_STATE_DIR=/app/data/openclaw-web-state openclaw plugins list --json'

docker exec "$STAGE4_CONTAINER" sh -lc \
  'OPENCLAW_CONFIG_PATH=/app/staging/config.staging-512-noapps-env-bundle.json OPENCLAW_STATE_DIR=/app/data/openclaw-web-state openclaw mcp list --json'

docker exec "$STAGE4_CONTAINER" node dist/scripts/analyze-chat-turn.js oc512-bundleenv-explicit-mcp-1778920185
```

## Rollback

All runtime changes are staging-only. Remove the isolated containers and volumes:

```sh
docker rm -f \
  dmax-oc512-dmaxmcp-20260516101143 \
  dmax-oc512-noapps-20260516102057 \
  dmax-oc512-mcpenv-20260516102424 \
  dmax-oc512-bundleenv-20260516102810

docker volume rm \
  dmax-oc512-dmaxmcp-20260516101143-data \
  dmax-oc512-noapps-20260516102057-data \
  dmax-oc512-mcpenv-20260516102424-data \
  dmax-oc512-bundleenv-20260516102810-data

rm -rf /tmp/dmax-openclaw-512-dmax-mcp
```

No production container or production config rollback is needed.

## Next Technical Change

Config-only staging is blocked. The next change should be one of:

1. Fix `@openclaw/codex` / OpenClaw Codex app-server integration so thread-level `mcp_servers` and bundle MCP servers are converted into actual model-callable Codex tools.
2. Add a DMAX-specific OpenClaw dynamic-tool bridge for the Codex harness that exposes the DMAX MCP allowlist as OpenClaw dynamic tools, bypassing native Codex MCP materialization.
3. If Codex app-server intentionally always exposes native Shell/Apps/ToolSearch for ChatGPT auth, document Codex harness as unsuitable for the normal DMAX MCP-only default agent and use a separate non-Codex MCP runtime for ordinary DMAX chat turns.
