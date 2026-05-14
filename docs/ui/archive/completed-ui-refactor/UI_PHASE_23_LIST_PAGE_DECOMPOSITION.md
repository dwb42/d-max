# DMAX UI Phase 23 List Page Decomposition

Date: 2026-05-14

## 1. Purpose

Phase 23 narrows `web/src/App.tsx` by extracting the already-stabilized canonical list-page route compositions.

This is a behavior-preserving decomposition phase, not a new UI migration.

## 2. Extracted Routes

The following list pages moved out of `App.tsx`:

- `/categories`
- `/people`
- `/organizations`
- `/projects`
- `/ideas`
- `/habits`
- `/tasks`

The extracted files are:

- `web/src/pages/lists/CategoryListPage.tsx`
- `web/src/pages/lists/PersonListPage.tsx`
- `web/src/pages/lists/OrganizationListPage.tsx`
- `web/src/pages/lists/ProjectListPage.tsx`
- `web/src/pages/lists/IdeaListPage.tsx`
- `web/src/pages/lists/HabitListPage.tsx`
- `web/src/pages/lists/TaskListPage.tsx`
- `web/src/pages/lists/listUtils.ts`
- `web/src/pages/lists/index.ts`

Each route file contains the route-level list composition and its create modal where applicable.

## 3. What Stayed In App.tsx

`App.tsx` still owns:

- app shell and navigation;
- routing and route context selection;
- data loading and refresh orchestration;
- create/update/delete API calls;
- modal open/close state;
- entity detail route compositions;
- calendar, timeline and planning surfaces;
- config/prompts/debug views;
- DMAX drawer and chat/voice handling;
- shared helpers still used by detail, planning and drawer code.

This keeps the extraction low-risk: `App.tsx` passes data and callbacks into list pages, while the extracted files render the stable list UI.

## 4. State Boundary

List-local UI state moved with the list pages:

- search text for `/people`, `/organizations`, `/projects`, `/ideas`, `/habits` and `/tasks`;
- task delete confirmation state inside `/tasks`;
- create modal form draft/error/busy state.

Application state stayed in `App.tsx`:

- which create modal is open;
- overview, people and organization data;
- refresh behavior;
- navigation after create/open;
- task toggle/delete mutations.

This preserves behavior while removing the large list-rendering blocks from `App.tsx`.

## 5. Intentional Non-Changes

Phase 23 did not:

- extract entity detail pages;
- extract DMAX drawer internals;
- extract calendar/timeline/planning surfaces;
- extract config/prompts/debug views;
- change UI copy or visual hierarchy;
- add screenshots, because visual output was intended to remain unchanged;
- add dependencies or change package files;
- touch backend/API/schema/migrations;
- touch `Dockerfile` or `src/chat/openclaw-agent.ts`.

## 6. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 28 test files / 115 tests.

## 7. Remaining App.tsx Decomposition Candidates

Safe future candidates, if explicitly scoped:

1. Extract canonical detail route compositions.
2. Extract task detail subpanels such as checklist, participants and media.
3. Extract initiative/project detail subpanels and relationship editor pieces.
4. Extract DMAX drawer/context helpers after route extraction stabilizes.
5. Extract calendar/timeline/planning surfaces only after their own canonical pattern work.

## 8. Readiness Judgment

Phase 23 is complete.

The canonical list pages are now route-level modules under `web/src/pages/lists/`, while `App.tsx` remains the orchestrator. This reduces risk for future UI work without changing product behavior.

## 9. Recommended Next Phase

Choose one deliberately:

- narrow extraction of canonical detail pages from `App.tsx`, if maintainability remains the priority;
- config/prompts/debug containment, if utility-view noise is the next product priority;
- calendar/timeline/planning surface audit, if time planning is next.
