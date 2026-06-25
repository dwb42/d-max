# Codex Instructions For DMAX

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

DMAX is Dietrich's agentic initiative, task, relationship, and initiative-memory system:

```text
Telegram d-max-dev -> local OpenClaw -> DMAX tools -> local SQLite
Telegram d-max -> VPS dmax-api container -> dmax-openclaw gateway -> DMAX tools -> production SQLite
Browser contextual chat -> DMAX API -> dmax-openclaw gateway -> tools -> SQLite
Browser /drive -> LiveKit -> DMAX voice agent -> xAI realtime
```

Local OpenClaw currently uses `openai-codex/gpt-5.5`. Do not switch Telegram or
app chat back to a direct/plain model API path unless Dietrich explicitly asks
for a provider experiment.

Production OpenClaw uses the Dockerfile pin `openclaw@2026.5.12` plus
OpenClaw-managed Codex OAuth. Production is a two-container Docker Compose
topology: `dmax-api` owns SQLite/media/Google OAuth/static web/API/Telegram,
and `dmax-openclaw` owns OpenClaw Gateway, `OPENCLAW_STATE_DIR`, and Codex
OAuth state in the `dmax-openclaw-state` volume. Never copy OAuth tokens into
the repo, image, `.env`, or `/root/.codex`, and do not reintroduce the old
single-container subprocess production path unless Dietrich explicitly asks
for a rollback.

The current VPS deployment checkout lives at `/docker/d-max/repo` with Compose
project name `repo`, so production containers are normally
`repo-dmax-api-1` and `repo-dmax-openclaw-1`. Treat VPS shell work as
read-only diagnostics unless Dietrich explicitly approves deploy, restart, or
volume operations.

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
- Initiative mindmaps use `graph_layout_nodes` scoped as
  `initiative:<initiativeId>`. The browser/API repository may read/write root,
  branch, task, media, and freestyle layout nodes; agent tools may mutate only
  freestyle nodes and should treat derived root/branch/task/media nodes as
  read-only context. The browser renders initiative mindmaps with deterministic
  radial auto-layout by default; persisted freestyle `x/y` remains an API/tool
  capability and a lightweight side/order hint, not the browser's rendered
  coordinate source of truth. Same-parent mindmap siblings should keep compact
  uniform vertical spacing, while adjacent parent clusters use a larger uniform
  spacing derived from measured subtree extents to avoid visible child-node
  collisions.
- Organization description/context memory: durable markdown stored in
  `organizations.markdown`. People have a lightweight free-text description in
  `people.description`; there is no person markdown field yet.
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
- Google Workspace file work is isolated in the `dmax-google-workspace`
  OpenClaw subagent and uses `gog`, not DMAX database tools. Workspace writes
  require explicit target/change confirmation and OAuth/keyring state must stay
  outside the repo.
- Add setup/dev/test scripts when needed.
- Production deploy is two-container Docker Compose behind a reverse proxy:
  `dmax-api` serves API/static web/Telegram and talks to the internal
  `dmax-openclaw` gateway over Docker networking.
- Never commit secrets, `.env`, provider keys, local SQLite runtime data, or
  OpenClaw/Codex auth state.

## DMAX UI Governance

When working on frontend UI, route layouts, entity pages, list pages, forms, modals, drawers, navigation, visual hierarchy, UX behavior, component structure, spacing, typography, copy labels, or frontend interaction patterns, you must follow the DMAX UI system documented in:

- `docs/ui/UI_CURRENT_STATE.md`
- `docs/ui/UI_PRINCIPLES.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`

DMAX frontend work must optimize for a coherent product system, not for locally plausible screens.

Completed UI refactor planning, phase reviews, route inventories and screenshot audits are archived under `docs/ui/archive/completed-ui-refactor/`. Do not load archived UI history into default context unless the task explicitly asks for historical refactor evidence.

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
