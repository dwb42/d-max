# DMAX UI Phase 24 Detail Page Decomposition

Date: 2026-05-14

## 1. Purpose

Phase 24 narrows `web/src/App.tsx` by extracting the already-stabilized canonical entity detail route compositions.

This phase is behavior-preserving. It does not migrate new routes, redesign UI, change APIs, change schemas or alter dependencies.

## 2. Extracted Routes

The following canonical detail pages moved out of `App.tsx`:

- `/categories/:name`
- `/people/:id`
- `/organizations/:id`
- `/projects/:id`
- `/initiatives/:id`
- `/tasks/:id`

The new detail-page files are:

- `web/src/pages/details/CategoryDetailPage.tsx`
- `web/src/pages/details/PersonDetailPage.tsx`
- `web/src/pages/details/OrganizationDetailPage.tsx`
- `web/src/pages/details/ProjectDetailPage.tsx`
- `web/src/pages/details/TaskDetailPage.tsx`
- `web/src/pages/details/SharedDetailPanels.tsx`
- `web/src/pages/details/detailUtils.tsx`
- `web/src/pages/details/index.ts`

`ProjectDetailPage.tsx` intentionally covers both `/projects/:id` and `/initiatives/:id`, matching the existing shared implementation.

## 3. What Stayed In App.tsx

`App.tsx` still owns:

- app shell and navigation;
- route parsing and route context selection;
- data loading and refresh orchestration;
- create/update/delete API calls;
- modal open state owned by the app shell, such as person and organization core modals;
- DMAX drawer and chat/voice handling;
- calendar, timeline and planning surfaces;
- config/prompts/debug views;
- remaining orchestration helpers used by non-extracted surfaces.

This preserves the current behavior boundary: `App.tsx` coordinates data and callbacks, while extracted detail pages render canonical detail compositions.

## 4. State Boundary

Detail-local state moved with the extracted pages:

- category description edit modal state;
- project/initiative relationship editing state;
- project date/calendar modal state;
- initiative markdown edit state;
- task notes, checklist, due-date and participant/media panel state;
- person and organization detail section state;
- organization relation/participation link modal state.

Application state stayed in `App.tsx`:

- loaded detail objects;
- route-level load errors;
- refresh behavior after mutations;
- person/organization core modal open flags;
- navigation callbacks;
- API mutation implementations;
- DMAX drawer context and conversation state.

## 5. Intentional Non-Changes

Phase 24 did not:

- change visual hierarchy or copy;
- change canonical detail primitives;
- redesign relationship management;
- introduce `RelationshipManager`;
- extract DMAX drawer internals;
- extract calendar/timeline/planning surfaces;
- extract config/prompts/debug views;
- change backend/API/schema/migrations;
- add dependencies or run package installs;
- touch `Dockerfile` or `src/chat/openclaw-agent.ts`;
- create screenshots, because visual output was intended to remain unchanged.

## 6. Validation

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 28 test files / 115 tests.

## 7. Remaining App.tsx Decomposition Candidates

Safe future candidates, if explicitly scoped:

1. Config/prompts/debug containment or extraction.
2. Calendar/timeline/planning surface audit and later extraction.
3. DMAX drawer/context helper extraction.
4. App shell/navigation decomposition.
5. Further cleanup of duplicated detail/list helper utilities after behavior is stable.

## 8. Readiness Judgment

Phase 24 is complete.

Canonical list pages and canonical detail pages now live in route-level modules under `web/src/pages/`. `App.tsx` remains large, but it is now closer to an orchestrator for routes, data, drawer/chat and unreworked surfaces rather than the home of all canonical entity UI.

## 9. Recommended Next Phase

Choose one deliberately:

- config/prompts/debug containment, if utility-view noise is the product priority;
- calendar/timeline/planning surface audit, if time planning is next;
- DMAX drawer/context extraction, if app-shell maintainability is next;
- further App shell/orchestration decomposition, if codebase maintainability remains the priority.
