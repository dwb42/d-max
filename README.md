# d-max

Agentic project and task memory system.

- Local dev bot: d-max-dev
- Production bot: d-max
- Agent runtime: OpenClaw
- Development assistant: Codex
- Data layer: SQLite

## MVP Direction

See [docs/mvp-plan.md](docs/mvp-plan.md) for the current product and architecture plan.

The MVP runs OpenClaw and the local stdio d-max MCP server in one Docker container. d-max keeps deterministic state in SQLite and exposes category, project, and task tools to OpenClaw.

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

The smoke test starts the stdio MCP server, lists tools, and creates a category, project, task, and Inbox task in the configured SQLite database.

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

## Verified Local Path

The following local path has been verified:

- Telegram text message -> OpenClaw -> d-max MCP tools -> SQLite
- Telegram voice message -> OpenClaw STT -> d-max MCP tools -> SQLite
- Telegram voice message -> OpenClaw response -> Gemini TTS -> Telegram voice reply

## Secrets

Do not commit `.env`, Telegram bot tokens, provider API keys, local SQLite files, or OpenClaw local runtime state.
