# d-max

Agentic project, task, and thinking memory system.

- Local dev bot: d-max-dev
- Production bot: d-max
- Agent runtime: OpenClaw
- Development assistant: Codex
- Data layer: SQLite

## Current Direction

The original MVP plan is archived at [docs/archive/mvp-plan.md](docs/archive/mvp-plan.md).

The active post-MVP module is the [Thinking System](docs/thinking-system-plan.md). The earlier [Brainstorm Mode](docs/brainstorm-mode-plan.md) plan is archived as the superseded first draft.

d-max runs OpenClaw and the local stdio d-max MCP server. d-max keeps deterministic state in SQLite and exposes category, project, task, and thinking tools to OpenClaw.

## Thinking System

Brainstorm remains a user-facing word, but the durable domain is Thinking Memory:

- thinking spaces
- thinking sessions
- typed thoughts
- thought links
- tensions
- open loops
- project/task extraction gates

Thinking Memory is separate from Execution Memory. Exploratory thoughts may become project/task candidates, but projects and tasks are created only after explicit confirmation.

Key docs:

- [Thinking System Plan](docs/thinking-system-plan.md)
- [Manual Test Guide](docs/thinking-system-manual-test.md)

## Local Setup

Prerequisites:

- Node 22.14+; Node 24 preferred
- npm
- OpenClaw CLI

Install dependencies:

```bash
npm install
```

Create local env:

```bash
cp .env.example .env
```

Initialize the SQLite database:

```bash
npm run setup
```

Start the MCP scaffold:

```bash
npm run mcp
```

Run a local MCP smoke test:

```bash
npm run smoke:mcp
```

The smoke test starts the stdio MCP server, lists tools, and exercises category, project, task, and thinking tools.

Important: `npm run smoke:mcp` is mutating. It creates smoke categories, projects, tasks, thinking spaces, thoughts, and tensions in the configured SQLite database.

## OpenClaw Checks

Install OpenClaw if needed:

```bash
npm install -g openclaw@latest
```

Validate the repo OpenClaw config template:

```bash
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.example.json" openclaw config validate --json
```

Inspect the configured d-max MCP server:

```bash
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.example.json" openclaw mcp show --json
```

The current template was checked against OpenClaw `2026.4.26`.

Run a local embedded OpenClaw agent turn without Telegram:

```bash
OPENCLAW_STATE_DIR=/tmp/d-max-openclaw-state \
OPENCLAW_CONFIG_PATH="$PWD/openclaw/config.local.json" \
openclaw agent --local \
  --model openai-codex/gpt-5.5 \
  --session-id dmax-thinking-manual-test \
  --message "Lass uns brainstormen zu Health Rhythm. Ich will fitter werden, aber abends bin ich oft platt." \
  --json \
  --timeout 240
```

`OPENCLAW_STATE_DIR=/tmp/d-max-openclaw-state` avoids writing OpenClaw runtime plugin state into `~/.openclaw` during sandboxed local tests.

## Verified Local Path

The following local path has been verified:

- Telegram text message -> OpenClaw -> d-max MCP tools -> SQLite
- Telegram voice message -> OpenClaw STT -> d-max MCP tools -> SQLite
- Telegram voice message -> OpenClaw response -> Gemini TTS -> Telegram voice reply
- Voice Brainstorm/Thinking capture -> Thinking tools -> SQLite -> structured response
- Thinking project gate -> confirmed project creation -> `extracted_to` thought link
- Thinking task gate -> confirmed task creation -> `extracted_to` thought links

## Secrets

Do not commit `.env`, Telegram bot tokens, provider API keys, local SQLite files, or OpenClaw local runtime state.
