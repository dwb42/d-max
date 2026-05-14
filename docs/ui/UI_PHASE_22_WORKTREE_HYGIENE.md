# DMAX UI Phase 22 Worktree Hygiene And Boundary Review

Date: 2026-05-14

## 1. Purpose

Phase 22 is a stabilization and boundary review after completing the canonical entity detail and list-page refactor phases.

This phase does not migrate a route and does not start calendar, timeline, planning, utility/debug or broad `App.tsx` decomposition work.

## 2. Current Worktree Inventory

Observed `git status --porcelain=v1 -uall` during Phase 22:

### Canonical UI Refactor Code

- `web/src/App.tsx`
  - Phase 21 list consolidation changes only:
    - `Massnahmen` to `Maßnahmen` for task collection labels.
    - `/tasks` collection DMAX context now resolves to `{ type: "tasks" }` instead of falling back to global chat.
- `web/src/components/ui/EntityListPage.tsx`
  - Phase 21 accessibility consistency:
    - openable `EntityListItem` rows without trailing actions now receive an accessible open label.

### Shared Component Files

- `web/src/components/ui/EntityListPage.tsx`
  - Existing shared list primitive.
  - No new shared primitive added in Phase 22.

### UI Docs

- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_REFACTOR_HANDOVER.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_LIST_PAGE_SYSTEM.md`
- `docs/ui/UI_PHASE_22_WORKTREE_HYGIENE.md`

### Screenshot / Doc Artifacts

- `docs/ui/screenshots/list-page-system-review/01-categories-list-final.png`
- `docs/ui/screenshots/list-page-system-review/02-people-list-final.png`
- `docs/ui/screenshots/list-page-system-review/03-organizations-list-final.png`
- `docs/ui/screenshots/list-page-system-review/04-projects-list-final.png`
- `docs/ui/screenshots/list-page-system-review/05-ideas-list-final.png`
- `docs/ui/screenshots/list-page-system-review/06-habits-list-final.png`
- `docs/ui/screenshots/list-page-system-review/07-tasks-list-final.png`
- `docs/ui/screenshots/list-page-system-review/08-list-page-drawer-safe-example.png`
- `docs/ui/screenshots/list-page-system-review/09-list-page-narrow-viewport-example.png`
- `docs/ui/screenshots/list-page-system-review/10-task-row-actions-example.png`

### Package / Playwright Files

- `package.json`: no current diff.
- `package-lock.json`: no current diff.

`@playwright/test` is present in `devDependencies`. It was added in earlier commit `104a78b` as part of the screenshot workflow:

- `package.json`: `@playwright/test`
- `package-lock.json`: `@playwright/test`, `playwright`, `playwright-core`, optional `fsevents`

Recommendation: keep these package changes if Playwright remains the accepted screenshot capture tool. They are already committed, so separating them now would require history rewriting or a later explicit revert. Do not revert automatically.

### Unrelated Voice / Audio UI Diffs

No current dirty voice/audio UI code diff was observed in `web/src/App.tsx` or `web/src/styles.css`.

The voice/audio UI work appears to be committed separately in `a9c52d9` (`Improve chat voice audio controls`), which touched:

- `web/src/App.tsx`
- `web/src/styles.css`

Phase 22 did not modify or revert that work.

Current dirty documentation related to voice/audio and OpenClaw runtime, outside the canonical list/detail UI refactor:

- `README.md`
- `docs/current-state.md`
- `docs/ui/UI_ROUTE_INVENTORY.md`

### Unknown / Needs Review Files

- `Dockerfile`
- `src/chat/openclaw-agent.ts`

These files are currently dirty and outside the UI refactor scope.

- `Dockerfile` changes production image cleanup after global OpenClaw installation.
- `src/chat/openclaw-agent.ts` changes OpenClaw gateway client module loading and candidate export resolution.

They should be reviewed, validated and committed separately from the canonical UI refactor work.

## 3. Refactor Boundary

Belongs to the completed canonical UI refactor:

- Entity detail reference routes:
  - `/organizations/:id`
  - `/projects/:id`
  - `/initiatives/:id`
  - `/people/:id`
  - `/tasks/:id`
  - `/categories/:name`
- Entity list reference routes:
  - `/categories`
  - `/people`
  - `/organizations`
  - `/projects`
  - `/ideas`
  - `/habits`
  - `/tasks`
- Shared primitives:
  - entity detail primitives under `web/src/components/ui`
  - entity list primitives under `web/src/components/ui/EntityListPage.tsx`
  - party contact/address primitives under `web/src/components/party`
- Documentation and screenshot evidence under `docs/ui/`.

Remains deferred:

- calendar/timeline/planning surfaces
- config/prompts/debug containment
- app-shell and mobile-first redesign
- broad `App.tsx` decomposition
- `SearchFilterRow` extraction
- `RelationshipManager`
- `TechnicalMetadataDisclosure`
- category reordering management
- richer contact/address/relation previews at list level
- completed task archive/filtering
- habit frequency/recurrence/streak logic

## 4. App.tsx Risk Review

Major migrated UI regions still inside `web/src/App.tsx`:

- navigation and route context:
  - `primaryNavItems`
  - `getRouteConversationContext`
  - `renderContentHeader`
- list routes:
  - `LifeAreasView`
  - `IdeasView`
  - `ProjectsView`
  - `HabitsView`
  - `TasksListView`
  - `PeopleView`
  - `OrganizationsView`
- create modals:
  - `CategoryCreateModal`
  - `IdeaCreateModal`
  - `ProjectCreateModal`
  - `HabitCreateModal`
  - `TaskCreateModal`
  - `PersonCreateModal`
  - `OrganizationCreateModal`
- detail routes:
  - `LifeAreaDetailView`
  - `InitiativeDetailView`
  - `TaskDetailView`
  - `PersonDetailView`
  - `OrganizationDetailView`
- DMAX drawer/context:
  - `DmaxAgentButton`
  - `AgentDrawer`
  - `ChatView`
  - conversation/context helper functions

Later extraction candidates, in low-risk order:

1. Move list route view components and their create modals into route-local frontend modules without changing behavior.
2. Move task detail subpanels (`TaskChecklistPanel`, participants, media attachments) into focused components.
3. Extract DMAX drawer/context helpers only after route UI consolidation is stable.
4. Leave calendar/timeline/planning extraction until those surfaces have their own canonical pattern.

Do not start decomposition until it is explicitly scoped.

## 5. Documentation Consistency

Phase 22 confirms:

- `UI_REFACTOR_HANDOVER.md` reflects completed phases through Phase 21.
- `UI_COMPONENTS.md` documents `EntityListItem` leading/trailing/openable behavior.
- `UI_PATTERNS.md` documents canonical list-page anatomy and Phase 21 consolidation rules.
- `UI_REVIEW_CHECKLIST.md` includes list-page consolidation checks.
- `UI_REFERENCE_REVIEW_LIST_PAGE_SYSTEM.md` records the list-page system readiness judgment.

## 6. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 28 test files / 115 tests.

## 7. Next-Phase Recommendation

Recommended next phase: **narrow `App.tsx` decomposition for canonical list pages**.

Rationale:

- Calendar/timeline/planning is a large new surface class and should not start while `App.tsx` still contains most migrated route compositions.
- Config/prompts/debug containment is valuable, but it introduces a different utility/inspector pattern and does not reduce the immediate risk of touching a very large `App.tsx`.
- A narrow extraction of already-stabilized list pages can reduce maintenance risk without changing product behavior or starting a new UI surface.

Suggested scope if chosen:

- Extract only the migrated list route components and their create modals.
- Keep APIs, schemas, drawer behavior and route behavior unchanged.
- Do not extract detail pages in the same phase.
- Do not introduce new design primitives.

## 8. Proposed Commit Grouping

Recommended grouping for the current state:

1. Phase 21 list-system consolidation:
   - `web/src/App.tsx`
   - `web/src/components/ui/EntityListPage.tsx`
   - `docs/ui/UI_COMPONENTS.md`
   - `docs/ui/UI_PATTERNS.md`
   - `docs/ui/UI_REVIEW_CHECKLIST.md`
   - `docs/ui/UI_REFACTOR_HANDOVER.md`
   - `docs/ui/UI_REFERENCE_REVIEW_LIST_PAGE_SYSTEM.md`
   - `docs/ui/screenshots/list-page-system-review/`
2. Phase 22 hygiene documentation:
   - `docs/ui/UI_PHASE_22_WORKTREE_HYGIENE.md`
   - any Phase 22 handover adjustments
3. OpenClaw gateway client module loading:
   - `Dockerfile`
   - `src/chat/openclaw-agent.ts`
   - separate from UI refactor work

Package/Playwright setup is already committed in `104a78b`; no current package commit is needed unless the user later decides to revert or split history.
