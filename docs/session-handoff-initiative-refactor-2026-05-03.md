# Session Handoff: Initiative Refactor

Date: 2026-05-03

This handoff documents the completed Project/Projects -> Initiative/Initiatives
refactor so the next session can resume safely after a reset.

## Goal

The refactor goal was a complete technical rename:

- Technical entity: Project -> Initiative.
- Technical collection: Projects -> Initiatives.
- Foreign keys: `project_id` -> `initiative_id`.
- API route: `/api/projects` -> `/api/initiatives`.
- MCP tools: `listProjects/createProject/...` -> `listInitiatives/createInitiative/...`.
- Context: `projects`/`project` -> `initiatives`/`initiative`.

The domain type value `type = "project"` intentionally remains. It is one
initiative type beside `idea` and `habit`, not the technical object name.

## Current State

Implemented and verified:

- SQLite schema now uses `initiatives`.
- `tasks` now uses `initiative_id`.
- `app_state_events` now uses `initiative_id` and `entity_type = "initiative"`.
- App conversation/prompt context now uses `initiatives` and `initiative`.
- Repository file is `src/repositories/initiatives.ts`.
- Tool file is `src/tools/initiatives.ts`.
- Web app types/API/components use Initiative naming.
- Runtime OpenClaw workspace docs have been updated to teach Initiative naming.
- `docs/current-state.md` has been updated and remains the primary implemented-state doc.

Old files are deleted and replaced:

- Deleted: `src/repositories/projects.ts`
- Added: `src/repositories/initiatives.ts`
- Deleted: `src/tools/projects.ts`
- Added: `src/tools/initiatives.ts`
- Deleted: `tests/repositories/categories-projects-tasks.test.ts`
- Added: `tests/repositories/categories-initiatives-tasks.test.ts`
- Deleted: `tests/tools/projects.test.ts`
- Added: `tests/tools/initiatives.test.ts`

## Migration Strategy

Migration logic lives in `src/db/migrate.ts`.

It performs these one-time compatibility migrations:

- Renames legacy table `projects` to `initiatives` when `initiatives` does not already exist.
- Renames legacy `tasks.project_id` to `tasks.initiative_id`.
- Renames legacy `app_state_events.project_id` to `app_state_events.initiative_id`.
- Rebuilds `app_conversations` with context values:
  - `projects` -> `initiatives`
  - `project` -> `initiative`
- Rebuilds `app_prompt_logs` with the same context normalization.
- Rebuilds `app_state_events` with operation/entity normalization:
  - `createProject` -> `createInitiative`
  - `updateProject` -> `updateInitiative`
  - `updateProjectMarkdown` -> `updateInitiativeMarkdown`
  - `archiveProject` -> `archiveInitiative`
  - `entity_type = "project"` -> `"initiative"`

No permanent DB shadow tables or views were added.

## Compatibility Aliases

The intended new HTTP API is `/api/initiatives`.

Temporary HTTP aliases remain in `src/api/server.ts` for old clients/bookmarks:

- `GET /api/projects`
- `POST /api/projects`
- `GET /api/projects/:id`
- `PATCH /api/projects/:id`
- `PATCH /api/projects/order`

Those aliases return the new response shapes (`initiative`/`initiatives`) and
are documented in `docs/current-state.md` as transitional. New code should not
use them.

The API also accepts old query/body shapes only where needed for alias safety:

- `contextType=projects`/`project` is parsed as `initiatives`/`initiative`.
- reorder body `projectIds` is transformed to `initiativeIds`.
- task reorder body `projectId` is transformed to `initiativeId`.

No old MCP tool names are registered. OpenClaw should see only:

- `listInitiatives`
- `getInitiative`
- `createInitiative`
- `updateInitiative`
- `archiveInitiative`
- `updateInitiativeMarkdown`

## Key Files Changed

Core:

- `data/schema.sql`
- `src/db/migrate.ts`
- `src/repositories/initiatives.ts`
- `src/repositories/tasks.ts`
- `src/repositories/app-conversations.ts`
- `src/repositories/state-events.ts`
- `src/core/tool-definitions.ts`
- `src/core/confirmation-policy.ts`
- `src/core/state-event-classifier.ts`
- `src/tools/initiatives.ts`
- `src/tools/tasks.ts`
- `src/tools/index.ts`
- `src/api/server.ts`

Chat/context:

- `src/chat/conversation-context.ts`
- `src/chat/app-chat.ts`

Web:

- `web/src/types.ts`
- `web/src/api.ts`
- `web/src/App.tsx`
- `web/src/styles.css`

Runtime docs:

- `openclaw/workspace/AGENTS.md`
- `openclaw/workspace/TOOLS.md`
- `openclaw/workspace/SOUL.md`
- `docs/current-state.md`
- `docs/memory-map.md`
- `docs/app-ui-plan.md`
- `docs/realtime-voice-plan.md`
- `README.md`
- `package.json`

Tests:

- `tests/db/migrate.test.ts`
- `tests/chat/context-schema-sync.test.ts`
- `tests/chat/conversation-context.test.ts`
- `tests/chat/app-chat.test.ts`
- `tests/core/tool-runner.test.ts`
- `tests/tools/initiatives.test.ts`
- `tests/tools/tasks.test.ts`
- `tests/repositories/categories-initiatives-tasks.test.ts`
- `tests/repositories/app-conversations.test.ts`
- `tests/repositories/state-events.test.ts`

## Verification

These commands passed after the refactor:

```bash
npm run typecheck
npm test
npm run web:build
```

Result details from the final run:

- TypeScript typecheck: passed.
- Vitest: 15 files, 55 tests passed.
- Vite build: passed.
- Vite emitted the existing chunk-size warning for the main bundle; no new build failure.

## Dev Server Note

During the refactor, the local stack was started with:

```bash
npm run dev:raw
```

Observed URLs:

- Web: `http://localhost:5173/`
- API: `http://localhost:3088/`

The foreground dev session was stopped before this handoff was finalized.
After a reset, check whether any leftover processes are still running before
starting another stack:

```bash
lsof -iTCP:5173 -sTCP:LISTEN -n -P
lsof -iTCP:3088 -sTCP:LISTEN -n -P
```

## Follow-Up Checks For Next Session

After a reset, start with:

```bash
git status --short
npm run typecheck
npm test
npm run web:build
```

Then inspect remaining Project references with:

```bash
rg -n "ProjectRepository|projects\\.js|listProjects|createProject|updateProject|archiveProject|updateProjectMarkdown|project_id|projectId|projectIds" src tests web data/schema.sql docs/current-state.md openclaw/workspace README.md package.json --glob '!docs/session-handoff*.md'
```

Expected remaining hits are only compatibility/migration/type-value cases, such as:

- transitional `/api/projects` aliases in `src/api/server.ts`
- legacy migration strings in `src/db/migrate.ts`
- `type = "project"` initiative-type references
- German UI route/view label `Projekte`

If new non-compatibility hits appear, finish the rename before moving on.

## Important Product Decision

Do not reintroduce a mixed Project/Initiative technical model. If an alias is
needed, it must be explicit, temporary, and documented. The intended durable
technical naming is Initiative everywhere.
