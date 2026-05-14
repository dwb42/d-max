# Codex Instructions For d-max

## Freshness

Before advising on architecture/features or saying a capability is missing,
inspect the current repo. Start with:

```text
docs/current-state.md
docs/memory-map.md
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

Code is authoritative when Markdown disagrees.

## Product Boundaries

d-max is Dietrich's agentic initiative, task, relationship, and initiative-memory system:

```text
Telegram d-max-dev -> local OpenClaw -> d-max tools -> local SQLite
Telegram d-max -> VPS OpenClaw -> d-max tools -> production SQLite
Browser contextual chat -> d-max API -> OpenClaw local agent -> tools -> SQLite
Browser /drive -> LiveKit -> d-max voice agent -> xAI realtime
```

Local OpenClaw currently uses `openai-codex/gpt-5.5`. Do not switch Telegram or
app chat back to a direct/plain model API path unless Dietrich explicitly asks
for a provider experiment.

## Data Rules

- Initiative: umbrella object for ideas, projects, habits, goals,
  explorations, or workstreams.
- Project: initiative with `type = project`.
- Project/initiative hierarchy: `initiatives.parent_id`; no separate
  subprojects table.
- Category: dynamic life/business area.
- Task: deterministic actionable unit connected to an initiative.
- Initiative memory: durable markdown stored in `initiatives.markdown`.
- `initiatives.markdown` is required initiative memory.
- Who dimension: people and organizations are first-class parties. People and
  organizations may participate in initiatives/tasks/calendar entries via
  `entity_participants`, and categories are not participant targets.
- Do not add exploratory memory tables or session-summary tables unless product
  direction changes.
- Context resolver synchronization is mandatory: whenever data structure,
  attributes, relationships, or new domain classes/tables change, inspect
  `src/chat/conversation-context.ts` and verify that OpenClaw still receives
  complete and correct context. Update resolver logic and tests when needed.
- `tests/chat/context-schema-sync.test.ts` intentionally guards this. If its
  schema signature fails after a model change, inspect the context resolver and
  prompt sections before updating the expected signature.

## Engineering Rules

- Prefer simple, explicit TypeScript and small modules.
- Keep deterministic data layer separate from prompts.
- SQLite is the source of truth.
- The agent may reason, summarize, and propose; durable state changes go
  through tools/API services.
- Telegram/app natural-language paths use OpenClaw and tools; direct UI actions
  use API routes/repositories.
- Browser Drive Mode currently bridges realtime audio only; durable voice tool
  commits are not wired.
- Add setup/dev/test scripts when needed.
- Never commit secrets, `.env`, provider keys, local SQLite runtime data, or
  OpenClaw auth state.
