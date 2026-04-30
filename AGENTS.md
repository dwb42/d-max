# d-max Agent Instructions

## Freshness

Before advising on architecture/features or saying a capability is missing,
inspect the current repo. Start with:

```text
docs/current-state.md
README.md
data/schema.sql
src/core/tool-definitions.ts
src/tools/*
src/api/server.ts
src/chat/*
src/voice/*
web/src/App.tsx
openclaw/workspace/AGENTS.md
openclaw/workspace/TOOLS.md
tests/
```

Archived/superseded plans are context, not current state.

## Product

d-max is Dietrich's agentic project, task, and thinking memory system:

```text
Telegram d-max-dev -> local OpenClaw -> d-max tools -> local SQLite
Telegram d-max -> VPS OpenClaw -> d-max tools -> production SQLite
Browser /chat -> d-max API -> OpenClaw local agent -> tools -> SQLite
Browser /drive -> LiveKit -> d-max voice agent -> xAI realtime -> ToolRunner -> SQLite
```

Local OpenClaw currently uses `openai-codex/gpt-5.5`. Do not switch Telegram or
app chat back to a direct/plain model API path unless Dietrich explicitly asks
for a provider experiment.

## Concepts

- Project: major initiative, goal, exploration, or workstream.
- Project hierarchy: `projects.parent_id`; no separate subprojects table.
- Category: dynamic life/business area.
- Task: deterministic actionable unit connected to a project.
- Brainstorm: user-facing exploratory thinking/scoping language.
- Thinking Memory: durable internal brainstorm domain: spaces, sessions,
  typed thoughts, thought links, tensions, open loops, extraction gates.

## Data Model

Implemented tables:

```text
categories, projects, tasks,
thinking_spaces, thinking_sessions, thoughts, thought_links, tensions,
app_chat_messages
```

Rules:

- `projects.markdown` is required project memory.
- Do not add `project_events` for the MVP.
- Do not add `brainstorms`/`brainstorm_links` unless product direction changes;
  Brainstorm is language, Thinking Memory is the implemented model.
- Context resolver synchronization is mandatory: whenever data structure,
  attributes, relationships, or new domain classes/tables change, inspect
  `src/chat/conversation-context.ts` and verify that OpenClaw still receives
  complete and correct context. Update resolver logic and tests when needed.
- `tests/chat/context-schema-sync.test.ts` intentionally guards this. If its
  schema signature fails after a model change, do not simply update the
  signature; first review the context resolver and prompt sections, then update
  the expected signature as an explicit acknowledgement.

## Engineering Rules

- Prefer simple, explicit TypeScript and small modules.
- Keep deterministic data layer separate from prompts.
- SQLite is the source of truth.
- The agent may reason, summarize, and propose; durable state changes go
  through tools/API services.
- Natural language/voice paths use ToolRunner/OpenClaw; direct UI actions use
  API routes/repositories.
- Add setup/dev/test scripts when needed.
- Never commit secrets, `.env`, provider keys, local SQLite runtime data, or
  OpenClaw auth state.
