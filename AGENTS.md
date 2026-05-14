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
- Organization description/context memory: durable markdown stored in
  `organizations.markdown`. There is no person markdown field yet.
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

## DMAX UI Governance

When working on frontend UI, route layouts, entity pages, list pages, forms, modals, drawers, navigation, visual hierarchy, UX behavior, component structure, spacing, typography, copy labels, or frontend interaction patterns, you must follow the DMAX UI system documented in:

- `docs/ui/UI_PRINCIPLES.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_COPY_LANGUAGE.md`
- `docs/ui/UI_INFORMATION_ARCHITECTURE.md`
- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`

DMAX frontend work must optimize for a coherent product system, not for locally plausible screens.

Before creating or modifying UI:

1. Identify the relevant canonical pattern.
2. Reuse existing shared components where possible.
3. Avoid one-off route-specific UI.
4. Avoid showing information only because data exists.
5. Prefer progressive disclosure over information dumping.
6. Keep terminology consistent across routes.
7. Do not introduce new colors, spacing, typography, shadows, card styles, layout primitives or interaction patterns unless the UI documentation is updated accordingly.

A UI task is not complete until:

1. The relevant `docs/ui/` rules have been applied.
2. Comparable routes use consistent patterns.
3. Empty, loading and error states are handled.
4. The UI review checklist has been applied.
5. Any remaining visual uncertainty is explicitly reported.

Hard rule:

Do not solve UI complexity by adding more visible information. Prefer prioritizing, grouping, hiding, collapsing, simplifying and reusing canonical patterns.
