# DMAX UI Refactor Handover

Last updated: 2026-05-14

This file is the durable handover for continuing the DMAX UI stabilization/refactor without relying on chat history.

## 1. Current UI Refactor Status

The DMAX UI refactor has moved from governance and audit into incremental implementation.

Canonical entity detail language is now validated across five entity types:

- `/organizations/:id` for context/contact entities.
- `/projects/:id` and `/initiatives/:id` for complex planning/action entities.
- `/people/:id` for sparse person/context entities.
- `/tasks/:id` for small operational action entities.
- `/categories/:name` for life-area/category detail.

Core reusable UI primitives have been extracted under `web/src/components/ui`. Party contact/address components have been extracted under `web/src/components/party`.

Phase 21 consolidated the canonical list-page system across `/categories`, `/people`, `/organizations`, `/projects`, `/ideas`, `/habits` and `/tasks`. The migrated list pages now share a stable scan-first anatomy, compact row model, hidden-by-default create flows, lightweight search where present and drawer-safe behavior.

Phase 22 reviewed worktree hygiene, refactor boundaries, package/Playwright state and next-surface readiness.

Phase 23 completed a narrow `App.tsx` decomposition pass for the stabilized canonical list pages. The canonical list route compositions now live under `web/src/pages/lists/`, while `App.tsx` still owns routing, data loading, mutations, modal open state, drawer/chat handling and non-list surfaces.

Phase 24 completed the same narrow decomposition for canonical detail pages. The canonical detail route compositions now live under `web/src/pages/details/`, while `App.tsx` remains responsible for route orchestration, data loading, API mutation callbacks, drawer/chat handling and unreworked surfaces.

App-shell mobile hardening after Phase 24 changed two shell-level behaviors:
mobile navigation now uses a burger button that opens a vertical icon+label
menu, and the mobile contextual DMAX drawer locks the background page while
keeping scroll gestures inside the drawer's chat/old-chat scroll regions.

Do not start calendar/timeline/planning, utility/debug pages, or broad `App.tsx` cleanup before explicit scope.

## 2. Completed Phases

| Phase | Status | What changed | Key files | Validation / limitations |
|---|---|---|---|---|
| Phase 0: UI governance activated | complete | Created/confirmed `docs/ui/` governance layer and root `AGENTS.md` UI governance rules. | `AGENTS.md`, `docs/ui/*` | Documentation only. No app code. |
| Phase 1: route inventory | complete | Factual inventory of frontend routes, views and surfaces. | `docs/ui/UI_ROUTE_INVENTORY.md` | Code-based inventory only; no critique. |
| Phase 2: UI debt and pattern gaps | complete | Structured critique and missing canonical pattern analysis. | `docs/ui/UI_DEBT_REPORT.md`, `docs/ui/UI_PATTERN_GAPS.md` | Code/inventory-based; screenshot severity deferred. |
| Phase 3: screenshot audit | complete | Captured current-state screenshots and visual audit. | `docs/ui/screenshots/current/`, `docs/ui/UI_SCREENSHOT_INVENTORY.md`, `docs/ui/UI_SCREENSHOT_AUDIT.md` | Confirmed `/organizations/:id` as first reference route; found DMAX drawer context bug. |
| Phase 4: design decisions | complete | Turned inventory/debt/screenshots into binding UI decisions. | `docs/ui/UI_DESIGN_DECISIONS.md`, governance docs | Documentation only. |
| Phase 5: organization reference implementation | complete | Refactored `/organizations/:id` into first canonical entity detail reference; fixed/contained DMAX drawer context issue. | `web/src/App.tsx`, `web/src/api.ts`, `web/src/styles.css`, docs | Validation passed at the time: `npm run typecheck`, `npm run web:build`, `npm test`. Components still embedded in `App.tsx`. |
| Phase 6: organization visual review | complete | Captured post-implementation screenshots and reviewed reference readiness. | `docs/ui/screenshots/reference-organization-detail/`, `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_DETAIL.md` | Status was `Needs focused hardening before migration`. |
| Phase 7A: organization hardening | complete | Fixed drawer squeeze, narrow layout breakage, raw not-found copy, heavy empty relationships, visible `Interne ID`, and missing drawer context label. | `web/src/App.tsx`, `web/src/styles.css`, reference review/screenshots | Status improved to `Ready after minor fixes`. |
| Phase 7A.5: human product review | complete | Classified human feedback around header simplicity, direct editing, section actions and description block behavior. | `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_DETAIL.md` | Analysis/planning only. |
| Phase 7A.6: organization product-feedback implementation | complete | Removed default title icon/type eyebrow, made title/type direct-edit, refined description click-to-edit, strengthened section actions. | `web/src/App.tsx`, `web/src/styles.css`, organization screenshots | No route migration. |
| Phase 8: consolidate organization + project learnings | complete | Documented canonical entity detail anatomy and component extraction plan. | `docs/ui/UI_ENTITY_DETAIL_CANONICAL_PATTERN.md`, `docs/ui/UI_COMPONENT_EXTRACTION_PLAN.md`, governance docs | Documentation only. |
| Phase 9A: extract canonical components | complete | Extracted shared entity/detail primitives from `App.tsx`. Updated organization/project to use them. | `web/src/components/ui/*`, `web/src/App.tsx`, `docs/ui/UI_COMPONENT_EXTRACTION_PLAN.md` | Validation passed at the time; screenshots under `docs/ui/screenshots/entity-component-extraction/`. |
| Phase 10: person detail migration | complete | Migrated `/people/:id` to canonical detail pattern. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_PERSON_DETAIL.md`, screenshots | Sparse fixture data limits populated visual validation. |
| Phase 11A: party contact/address extraction | complete | Extracted party-neutral contact/address display and editors. | `web/src/components/party/*`, `web/src/App.tsx`, `docs/ui/UI_COMPONENTS.md`, `docs/ui/UI_COMPONENT_EXTRACTION_PLAN.md` | Behavior preserved for people/organizations. Sparse fixture data remains a limitation. |
| Phase 11B: relationship section simplification/link actions | complete | Removed redundant subtitles, lightened empty relation groups, renamed DMAX context section, added organization/initiative/task link actions where supported. | `web/src/App.tsx`, shared relation components, docs/screenshots | No full `RelationshipManager`. |
| Phase 11B.5: relationship rules docs consolidation | complete | Generalized no-redundant-subtitle, lightweight relation empty state, visible calm section action, and relation display/management boundary rules. | `docs/ui/UI_PRINCIPLES.md`, `UI_PATTERNS.md`, `UI_COMPONENTS.md`, `UI_DESIGN_DECISIONS.md`, `UI_ENTITY_DETAIL_CANONICAL_PATTERN.md`, `UI_REVIEW_CHECKLIST.md` | Documentation only. |
| Phase 12: task detail migration | complete in current session | Migrated `/tasks/:id` to canonical entity detail pattern using shared primitives. | `web/src/App.tsx`, `web/src/styles.css`, `web/src/components/ui/MetadataGrid.tsx`, `docs/ui/UI_REFERENCE_REVIEW_TASK_DETAIL.md`, screenshots | Latest validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Populated task participant/media states not validated. |
| Phase 12.5: task detail human feedback | complete | Human review requested focused hardening for task header hierarchy, due-date interaction, content ordering, lightweight empty states and participant add flow. | chat feedback; this handover | Planning/feedback only. No route migration. |
| Phase 12.6: task detail focused hardening | complete | Implemented human feedback: removed parent project subtitle from task header, reordered header facts to status/priority/due date, made due-date click open the native picker directly/as directly as feasible, moved notes before checklist, removed redundant empty checklist/participant copy, and moved participant add flow into `EditModal`. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_TASK_DETAIL.md`, `docs/ui/screenshots/reference-task-detail-hardening/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Native date picker chrome is browser/OS-controlled; Chromium picker was captured. Populated task participant/media states still not validated. |
| Phase 13: category detail migration | complete | Migrated `/categories/:name` to the canonical entity detail pattern for Lebensbereiche: title-first header, headingless category context, related projects/ideas/habits/tasks as lightweight relation sections, secondary metadata and drawer-safe context. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_CATEGORY_DETAIL.md`, `docs/ui/screenshots/reference-category-detail/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Category detail still derives data from overview; long category markdown was not stress-tested because fixture descriptions are short. |
| Phase 14: category list reference | complete | Migrated `/categories` from the old work-board style to the first canonical list-page reference. Added minimal list primitives, compact scan rows, contained create modal, collection empty state and drawer-safe list behavior. | `web/src/App.tsx`, `web/src/styles.css`, `web/src/components/ui/EntityListPage.tsx`, `docs/ui/UI_REFERENCE_REVIEW_CATEGORY_LIST.md`, `docs/ui/screenshots/reference-category-list/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Search/filter and richer row actions remain deferred. Category reordering needs a calmer explicit management pattern later. |
| Phase 15: person list migration | complete | Migrated `/people` to the canonical list-page pattern. Removed the always-visible create form, added a calm page-level create action and `EditModal`, preserved search, rendered people through `EntityListPage`/`EntityList`/`EntityListItem`, and added drawer-safe list behavior. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_PERSON_LIST.md`, `docs/ui/screenshots/reference-person-list/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Person list API remains sparse, so contact/organization previews are deferred. |
| Phase 16: organization list migration | complete | Migrated `/organizations` to the canonical list-page pattern. Removed the always-visible create form, added a calm page-level create action and `EditModal`, preserved search, rendered organizations through `EntityListPage`/`EntityList`/`EntityListItem`, and added drawer-safe list behavior. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_LIST.md`, `docs/ui/screenshots/reference-organization-list/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Organization list API remains sparse, so contact/address/relation previews are deferred. |
| Phase 17: project list migration | complete | Migrated `/projects` to the canonical list-page pattern as the first action/planning list reference. Removed the always-visible create form, added a calm page-level create action and `EditModal`, added simple search, rendered projects through `EntityListPage`/`EntityList`/`EntityListItem`, showed status/phase/category/date and task counts compactly, and added drawer-safe list behavior. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_PROJECT_LIST.md`, `docs/ui/screenshots/reference-project-list/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Project hierarchy and predecessor/successor relations remain on detail/planning surfaces rather than the default list. |
| Phase 18: idea list migration | complete | Migrated `/ideas` to the canonical list-page pattern as the first exploratory/action list reference. Removed the always-visible create form, added a calm page-level create action and `EditModal`, added simple search, rendered ideas through `EntityListPage`/`EntityList`/`EntityListItem`, showed status/category and short context compactly, and added drawer-safe list behavior. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_IDEA_LIST.md`, `docs/ui/screenshots/reference-idea-list/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Idea maturity/conversion/scoring are not shown because they are not available in the current list data. |
| Phase 19: habit list migration | complete | Migrated `/habits` to the canonical list-page pattern as the first routine/action list reference. Removed the always-visible create form, added a calm page-level create action and `EditModal`, added simple search, rendered habits through `EntityListPage`/`EntityList`/`EntityListItem`, showed status/category and short context compactly, kept task counts only when present, and added drawer-safe list behavior. | `web/src/App.tsx`, `web/src/styles.css`, `docs/ui/UI_REFERENCE_REVIEW_HABIT_LIST.md`, `docs/ui/screenshots/reference-habit-list/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. Habit frequency/streak/recurrence semantics were intentionally not invented. |
| Phase 20: task list migration | complete | Migrated `/tasks` to the canonical list-page pattern as the small operational action list reference. Added a calm page-level create action and `EditModal`, added simple search, rendered tasks through `EntityListPage`/`EntityList`/`EntityListItem`, showed title/status/priority/due date/parent context compactly, preserved status toggle/delete behavior as calm row actions, and added drawer-safe list behavior. | `web/src/App.tsx`, `web/src/styles.css`, `web/src/components/ui/EntityListPage.tsx`, `docs/ui/UI_REFERENCE_REVIEW_TASK_LIST.md`, `docs/ui/screenshots/reference-task-list/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. The overview API provides open tasks only; completed task archive/filtering remains deferred. |
| Phase 21: list-page consolidation and regression review | complete | Reviewed all migrated canonical list pages as one system. Fixed task list/product label drift from `Massnahmen` to `Maßnahmen`, fixed `/tasks` collection DMAX context so the drawer no longer opens as `Global Chat`, added accessible open labels to openable `EntityListItem` rows without row actions, documented the final list-page system and refreshed consolidated screenshots. | `web/src/App.tsx`, `web/src/components/ui/EntityListPage.tsx`, `docs/ui/UI_REFERENCE_REVIEW_LIST_PAGE_SYSTEM.md`, `docs/ui/UI_REFACTOR_HANDOVER.md`, `docs/ui/UI_COMPONENTS.md`, `docs/ui/UI_PATTERNS.md`, `docs/ui/UI_REVIEW_CHECKLIST.md`, `docs/ui/screenshots/list-page-system-review/` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. No new route migration. |
| Phase 22: worktree hygiene and boundary review | complete | Classified the current worktree, confirmed package/Playwright state, identified unrelated non-UI `src/chat/openclaw-agent.ts` changes, reviewed `App.tsx` extraction risks and documented deferred boundaries before the next major surface. | `docs/ui/UI_PHASE_22_WORKTREE_HYGIENE.md`, `docs/ui/UI_REFACTOR_HANDOVER.md` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. No route migration and no app code changes for Phase 22. |
| Phase 23: narrow list-page decomposition | complete | Extracted canonical list page route compositions and their create modals from `App.tsx` into `web/src/pages/lists/`. `App.tsx` remains the orchestrator for routing, data, mutations, modal open state and drawer/chat behavior. | `web/src/App.tsx`, `web/src/pages/lists/*`, `docs/ui/UI_PHASE_23_LIST_PAGE_DECOMPOSITION.md`, `docs/ui/UI_REFACTOR_HANDOVER.md` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. No visual redesign and no screenshots required. |
| Phase 24: narrow detail-page decomposition | complete | Extracted canonical detail page route compositions from `App.tsx` into `web/src/pages/details/`. Category, person, organization, project/initiative and task detail pages now live in route-level modules with shared detail panels/utilities where needed. | `web/src/App.tsx`, `web/src/pages/details/*`, `docs/ui/UI_PHASE_24_DETAIL_PAGE_DECOMPOSITION.md`, `docs/ui/UI_REFACTOR_HANDOVER.md` | Validation passed: `npm run typecheck`, `npm run web:build`, `npm test` on 2026-05-14. No visual redesign and no screenshots required. |

## 3. Current Canonical UI Principles

- DMAX is read-first, not form-first.
- UI should be calm, compact, precise and low-noise.
- Do not show default decorative title icons on normal entity detail pages.
- Do not show mandatory entity-type eyebrow labels on normal entity detail pages.
- Titles should carry meaning; redundant subtitles are avoided.
- Section subtitles are optional, not default.
- Use subtitles only when they add real disambiguating value.
- Description/context blocks are headingless and click-to-edit where safe.
- Long descriptions must be contained with expand/collapse or equivalent behavior.
- Section actions should be visible but calm.
- Empty relationship groups should be lightweight or visually empty.
- Heavy `EmptyState` blocks are reserved for meaningful empty pages/work areas, not every empty relation group.
- Relationship display and relationship management are separate concerns.
- `RelationList`, `RelationGroup` and `RelationItem` are display primitives, not a full manager.
- Metadata is secondary and uses `MetadataGrid`.
- Internal IDs are not shown in normal metadata.
- Technical/debug metadata belongs in debug surfaces or a future `TechnicalMetadataDisclosure`.
- DMAX drawer overlays or otherwise avoids squeezing main content into unreadable columns.
- DMAX drawer should show scoped user-facing context labels.
- On narrow/mobile viewports, the DMAX drawer is the active full-screen surface:
  background page scrolling is locked and drawer scrolling is contained.
- Mobile app-shell navigation uses a burger-triggered vertical menu with icons
  and labels; do not return to a wrapped icon grid or horizontal icon rail
  without updating the app-shell decision docs.
- Technical/chat/API errors must be mapped to user-facing copy in normal UI.

## 4. Validated Reference Pages

| Page | Role in UI system | Current judgment |
|---|---|---|
| `/organizations/:id` | Context/contact entity reference | Accepted direction after hardening and human feedback. |
| `/projects/:id` / `/initiatives/:id` | Complex planning/action entity reference | Accepted direction for comparison; dense relationship editor remains a known caveat. |
| `/people/:id` | Sparse person/context entity reference | Migrated and acceptable; populated data validation still needed. |
| `/tasks/:id` | Small operational action entity reference | Ready as canonical action-object reference after Phase 12.6 hardening. |
| `/categories/:name` | Life-area/category reference | Ready as canonical life-area/category reference after Phase 13 migration. |
| `/categories` | Entity list page reference | Ready as first canonical list-page reference after Phase 14 migration. |
| `/people` | Person/contact list page reference | Ready as canonical person/contact list reference after Phase 15 migration. |
| `/organizations` | Organization/contact list page reference | Ready as canonical organization/contact list reference after Phase 16 migration. |
| `/projects` | Project/action list page reference | Ready as canonical project/action list reference after Phase 17 migration. |
| `/ideas` | Exploratory/action list page reference | Ready as canonical exploratory/action list reference after Phase 18 migration. |
| `/habits` | Habit/routine list page reference | Ready as canonical habit/routine list reference after Phase 19 migration. |
| `/tasks` | Task/action list page reference | Ready as canonical task/action list reference after Phase 20 migration. |
| Entity list-page system | Cross-route list reference | Ready as canonical list-page system after Phase 21 consolidation. |

## 5. Extracted Shared Components

Shared UI primitives:

- `web/src/components/ui/EntityDetailPage.tsx`
- `web/src/components/ui/EntityHeader.tsx`
- `web/src/components/ui/EntityListPage.tsx`
- `EntityListPage`, `EntityList`, `EntityListItem` exported from `EntityListPage.tsx`
- `web/src/components/ui/InlineEditableText.tsx`
- `web/src/components/ui/SectionBlock.tsx`
- `web/src/components/ui/SectionHeader` exported from `SectionBlock.tsx`
- `web/src/components/ui/DescriptionBlock.tsx`
- `web/src/components/ui/MetadataGrid.tsx`
- `web/src/components/ui/RelationList.tsx`
- `RelationList`, `RelationGroup`, `RelationItem` exported from `RelationList.tsx`
- `web/src/components/ui/EmptyState.tsx`
- `web/src/components/ui/ErrorState.tsx`
- `web/src/components/ui/EditModal.tsx`
- `EditModal`, `ConfirmModal`, `handleModalEscape`, `useModalEscape` exported from `EditModal.tsx`
- `web/src/components/ui/RichText.tsx`
- `RichText`, `renderInlineMarkup` exported from `RichText.tsx`
- `web/src/components/ui/index.ts`

Party components:

- `web/src/components/party/ContactPointList.tsx`
- `ContactPointList`, `ContactPointItem`, `ContactPointEditor`, `ContactPointInput`
- `web/src/components/party/AddressBlock.tsx`
- `AddressBlock`, `AddressList`, `AddressEditor`, `AddressInput`
- `web/src/components/party/index.ts`

Deferred components/helpers:

- `RelationshipManager`
- `TechnicalMetadataDisclosure`
- `ContextPanel` / extracted DMAX drawer helpers
- `DmaxAgentButton`
- Generic checklist component
- Search/filter list primitives

## 6. Route Migration Status

| Route | Status | Notes | Review doc | Screenshots | Next action |
|---|---|---|---|---|---|
| `/organizations/:id` | migrated/reference | Context/contact reference; hardening done; relationship link actions added. | `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_DETAIL.md` | `docs/ui/screenshots/reference-organization-detail/`, hardening, phase7a6, relationship simplification | No immediate migration work; only fix regressions if shared components change. |
| `/projects/:id` / `/initiatives/:id` | migrated/reference | Complex planning detail; tasks visible, markdown contained; relationship editor still dense/route-local. | `docs/ui/UI_REFERENCE_REVIEW_INITIATIVE_PROJECT_DETAIL.md` | `docs/ui/screenshots/reference-initiative-project-detail/` | Defer relationship manager decision. |
| `/people/:id` | migrated | Uses canonical detail and party components; sparse data. | `docs/ui/UI_REFERENCE_REVIEW_PERSON_DETAIL.md` | `docs/ui/screenshots/reference-person-detail/` | Revalidate with populated contact/relation data later. |
| `/tasks/:id` | migrated/reference | Ready as canonical action-object reference. Notes appear before checklist; header facts are status/priority/due date; parent context stays in lower context/metadata; empty checklist/participant states are lightweight; participant add flow opens in `EditModal`. | `docs/ui/UI_REFERENCE_REVIEW_TASK_DETAIL.md` | `docs/ui/screenshots/reference-task-detail/`, `docs/ui/screenshots/reference-task-detail-hardening/` | No immediate migration work; only fix regressions if shared components change. |
| `/categories/:name` | migrated/reference | Ready as canonical life-area/category reference. Category name is dominant; description/context is primary; projects, ideas, habits and derived tasks render as lightweight related work; metadata is secondary. | `docs/ui/UI_REFERENCE_REVIEW_CATEGORY_DETAIL.md` | `docs/ui/screenshots/reference-category-detail/` | No immediate migration work; only fix regressions if shared components change. |
| `/categories` | migrated/reference | First canonical list-page reference. Scan-first category rows; compact counts; create action opens `EditModal`; drawer-safe list behavior. | `docs/ui/UI_REFERENCE_REVIEW_CATEGORY_LIST.md` | `docs/ui/screenshots/reference-category-list/` | Stable; only fix regressions from shared list primitive changes. |
| `/organizations` | migrated/reference | Organization/contact list reference. Scan-first rows; simple search; create action opens `EditModal`; drawer-safe list behavior. | `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_LIST.md` | `docs/ui/screenshots/reference-organization-list/` | Stable; only fix regressions from shared list primitive changes. |
| `/people` | migrated/reference | Person/contact list reference. Scan-first rows; simple search; create action opens `EditModal`; drawer-safe list behavior. | `docs/ui/UI_REFERENCE_REVIEW_PERSON_LIST.md` | `docs/ui/screenshots/reference-person-list/` | Stable; only fix regressions from shared list primitive changes. |
| `/projects` | migrated/reference | Project/action list reference. Scan-first rows; simple search; create action opens `EditModal`; status/phase/category/date and task counts are compact secondary facts. | `docs/ui/UI_REFERENCE_REVIEW_PROJECT_LIST.md` | `docs/ui/screenshots/reference-project-list/` | Stable; only fix regressions from shared list primitive changes. |
| `/ideas` | migrated/reference | Exploratory/action list reference. Scan-first rows; simple search; create action opens `EditModal`; status/category and short context are compact secondary facts. | `docs/ui/UI_REFERENCE_REVIEW_IDEA_LIST.md` | `docs/ui/screenshots/reference-idea-list/` | Stable; only fix regressions from shared list primitive changes. |
| `/habits` | migrated/reference | Habit/routine list reference. Scan-first rows; simple search; create action opens `EditModal`; status/category and short context are compact secondary facts; task count appears only when present. | `docs/ui/UI_REFERENCE_REVIEW_HABIT_LIST.md` | `docs/ui/screenshots/reference-habit-list/` | Stable; only fix regressions from shared list primitive changes. |
| `/tasks` | migrated/reference | Task/action list reference. Scan-first rows; simple search; create action opens `EditModal`; status/priority/due date and parent context are compact secondary facts; status toggle/delete remain calm row actions. | `docs/ui/UI_REFERENCE_REVIEW_TASK_LIST.md` | `docs/ui/screenshots/reference-task-list/`, `docs/ui/screenshots/list-page-system-review/` | Stable; only fix regressions from shared list primitive changes. |
| `/calendar` | deferred | Time surface intentionally not redesigned. | audit/debt docs | current screenshots | Defer to time/calendar/planning phase. |
| `/calendar/timeline` | deferred | Time surface intentionally not redesigned. | audit/debt docs | current screenshots | Defer to time/calendar/planning phase. |
| `/planning-canvas` | deferred | Time/planning surface intentionally not redesigned. | audit/debt docs | current screenshots | Defer to time/calendar/planning phase. |
| `/config` | deferred | Utility/debug density still pending containment rules. | audit/debt docs | current screenshots | Defer to config/utility phase. |
| `/prompts` | deferred | Prompt inspector/debug surface still dense. | audit/debt docs | current screenshots | Defer to utility/debug phase. |
| `/prompt-vorlagen` | deferred | Prompt template utility surface pending. | audit/debt docs | current screenshots | Defer to utility/debug phase. |
| `/drive` | deferred | Voice surface out of current detail-pattern scope. | inventory/screenshot audit | current screenshots | Defer unless Drive Mode phase is scoped. |

## 7. Component Extraction Status

Completed:

- Core entity/detail primitives extracted to `web/src/components/ui`.
- First minimal entity list primitives extracted to `web/src/components/ui/EntityListPage.tsx`.
- Party contact/address primitives extracted to `web/src/components/party`.
- Organization, project/initiative, person, task and category detail consume shared primitives where appropriate. `/categories`, `/people`, `/organizations`, `/projects`, `/ideas`, `/habits` and `/tasks` consume the first list primitives.
- Canonical list-page route compositions and create modals are extracted to `web/src/pages/lists/`.
- Canonical detail-page route compositions are extracted to `web/src/pages/details/`.

Partially complete:

- DMAX drawer, calendar/timeline/planning surfaces, config/prompts/debug surfaces and app-shell orchestration remain in `web/src/App.tsx`.
- `ParticipantsPanel`, `MediaAttachmentsPanel`, task checklist, project relationship editing and detail-page utilities now live under `web/src/pages/details/`; they are still route-level/detail-level code, not generalized product primitives.
- `MetadataGrid` is extracted and now has no default explanatory subtitle.
- `RelationList` supports `emptyMode` for card/inline/none empty behavior.

Deferred:

- `RelationshipManager` is not finalized.
- `TechnicalMetadataDisclosure` is not broadly implemented.
- DMAX drawer/context helpers are still app-shell coupled.
- Search/filter list primitives are not extracted/migrated.

## 8. Important Product / Design Decisions

- Entity detail pages use one canonical anatomy: header, primary content, relationship/work sections, secondary metadata, contextual DMAX drawer.
- Normal detail pages should not show default title icons or mandatory entity-type eyebrows.
- Small high-frequency fields may use direct/inline editing.
- Grouped master-data editing remains available through `EditModal`, but should not dominate.
- Description blocks should not show mandatory headings/edit/add buttons.
- Long markdown must be contained by default.
- Tasks are action-first: title, status, due date, priority and checklist are primary.
- Projects are planning/action objects: long markdown is important but tasks must remain visible.
- Organizations/people are context/contact objects: contact/address/relationships are primary.
- Relationship display is scannable; dense relationship editing belongs in a future manager/modal/drawer.
- Metadata is secondary; no internal IDs in normal UI.
- Destructive confirmations should use `ConfirmModal`, not system popups.
- Modals should support Escape close; modal forms should support Enter submit where appropriate; tab order should reach Save before Cancel where implemented by footer ordering.

## 9. Important Human Feedback That Changed The UI Language

- Remove the default icon next to entity titles.
- Remove default object-type labels above normal detail titles.
- Keep useful subtype/status/context near the title when it helps understanding.
- Avoid a prominent generic `Bearbeiten` header button for small common edits.
- Prefer direct title/name/type/status/date editing when safe.
- Description/context areas should be headingless content surfaces.
- Description edit/add buttons should not be visible by default when click-to-edit is clear.
- Section-level actions such as `Kontaktweg hinzufügen`, `Anschrift hinzufügen`, `Person verknüpfen`, `Organisation verknüpfen`, `Initiative verknüpfen`, `Maßnahme verknüpfen` must remain discoverible.
- Remove redundant section subtitles when section titles are self-explanatory.
- Empty relationship groups should not create heavy "nothing here" panels.
- `DMAX-Kontexte` was simplified to `Verknüpfte Initiativen und Maßnahmen` for party-to-DMAX-object links.

## 10. Current Screenshots And Review Docs

Important review docs:

- `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_INITIATIVE_PROJECT_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_PERSON_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_TASK_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_CATEGORY_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_CATEGORY_LIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_PERSON_LIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_LIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_PROJECT_LIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_IDEA_LIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_HABIT_LIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_TASK_LIST.md`
- `docs/ui/UI_REFERENCE_REVIEW_LIST_PAGE_SYSTEM.md`
- `docs/ui/UI_PHASE_22_WORKTREE_HYGIENE.md`
- `docs/ui/UI_PHASE_23_LIST_PAGE_DECOMPOSITION.md`
- `docs/ui/UI_PHASE_24_DETAIL_PAGE_DECOMPOSITION.md`

Important screenshot directories:

- `docs/ui/screenshots/current/`
- `docs/ui/screenshots/reference-organization-detail/`
- `docs/ui/screenshots/reference-organization-detail-hardening/`
- `docs/ui/screenshots/reference-organization-detail-phase7a6/`
- `docs/ui/screenshots/reference-initiative-project-detail/`
- `docs/ui/screenshots/entity-component-extraction/`
- `docs/ui/screenshots/reference-person-detail/`
- `docs/ui/screenshots/contact-address-extraction/`
- `docs/ui/screenshots/relationship-section-simplification/`
- `docs/ui/screenshots/reference-task-detail/`
- `docs/ui/screenshots/reference-task-detail-hardening/`
- `docs/ui/screenshots/reference-category-detail/`
- `docs/ui/screenshots/reference-category-list/`
- `docs/ui/screenshots/reference-person-list/`
- `docs/ui/screenshots/reference-organization-list/`
- `docs/ui/screenshots/reference-project-list/`
- `docs/ui/screenshots/reference-idea-list/`
- `docs/ui/screenshots/reference-habit-list/`
- `docs/ui/screenshots/reference-task-list/`
- `docs/ui/screenshots/list-page-system-review/`

## 11. Known Limitations

- `RelationshipManager` is not finalized.
- `TechnicalMetadataDisclosure` is still conceptual/not broadly implemented.
- DMAX drawer helpers are still app-shell coupled.
- Calendar/timeline/planning are intentionally deferred.
- Normal entity list pages are migrated; calendar/planning/utility list-like surfaces are still deferred.
- `/categories`, `/people`, `/organizations`, `/projects`, `/ideas`, `/habits` and `/tasks` have been migrated as canonical list-page references.
- Broad copy/language cleanup is still pending.
- `web/src/App.tsx` still contains route orchestration, planning, drawer/chat and utility/debug logic and should not be broadly refactored without explicit scope.
- Sparse fixture data limits visual validation for populated person contact/address/relationship states.
- Sparse fixture data limits visual validation for populated task participant/media states.
- Sparse fixture data limits visual validation for long category markdown containment.
- Project relationship editor is still dense and route-local; do not freeze it as canonical `RelationshipManager`.
- Project hierarchy and predecessor/successor relationships are intentionally not displayed in the `/projects` list by default.
- Idea maturity, conversion-to-project state and scoring are not displayed in `/ideas` because those fields are not available in the current list data.
- Habit frequency, streak, recurrence and completion semantics are not displayed in `/habits` because those concepts are not stable in the current data model/deterministic agent behavior.
- `/tasks` currently shows the open tasks available from `/api/app/overview`; completed task archive/filtering remains deferred.
- Participant add/link forms remain inline in some sections until a dedicated relationship manager exists.

## 12. Open Risks

- Future migrations may accidentally copy route-local task/project behavior instead of using shared primitives.
- Global changes to `RelationList`, `SectionBlock`, `MetadataGrid`, modal helpers or app-shell drawer CSS can regress all migrated entity routes.
- DMAX drawer success/error behavior has mostly been visually checked for layout/context, not exhaustive live-agent behavior.
- Utility/debug surfaces remain dense and may conflict with the low-noise UI language if touched without a scoped phase.
- Many UI docs/components/screenshots are currently untracked or modified; a new session must inspect `git status` before editing.
- The current worktree includes application-code changes from multiple UI phases. A new session must review current diffs before continuing and must not assume a clean baseline.

## 13. Current Completion Status

The canonical entity detail and list-page UI refactor is complete through Phase 24.

Completed list-page extraction:

- `web/src/pages/lists/CategoryListPage.tsx`
- `web/src/pages/lists/PersonListPage.tsx`
- `web/src/pages/lists/OrganizationListPage.tsx`
- `web/src/pages/lists/ProjectListPage.tsx`
- `web/src/pages/lists/IdeaListPage.tsx`
- `web/src/pages/lists/HabitListPage.tsx`
- `web/src/pages/lists/TaskListPage.tsx`
- `web/src/pages/lists/listUtils.ts`
- `web/src/pages/lists/index.ts`

`App.tsx` still owns:

- routing and navigation;
- overview/person/organization data ownership;
- create/update/delete API calls;
- modal open state;
- entity detail routes;
- calendar/timeline/planning surfaces;
- config/prompts/debug surfaces;
- DMAX drawer, chat and voice handling.

Completed detail-page extraction:

- `web/src/pages/details/CategoryDetailPage.tsx`
- `web/src/pages/details/PersonDetailPage.tsx`
- `web/src/pages/details/OrganizationDetailPage.tsx`
- `web/src/pages/details/ProjectDetailPage.tsx`
- `web/src/pages/details/TaskDetailPage.tsx`
- `web/src/pages/details/SharedDetailPanels.tsx`
- `web/src/pages/details/detailUtils.tsx`
- `web/src/pages/details/index.ts`

Validation after Phase 24:

- `npm run typecheck`: passed on 2026-05-14.
- `npm run web:build`: passed on 2026-05-14.
- `npm test`: passed on 2026-05-14, 28 test files / 115 tests.

## 14. Recommended Next Phase

Choose one next phase deliberately:

- narrow extraction of canonical detail pages from `App.tsx`, if maintainability remains the priority;
- config/prompts/debug containment, if reducing utility-view noise is the product priority;
- calendar/timeline/planning surface audit, if time planning is next.

Do not start any of these without explicit scope.

## 15. Files A New Session Must Read First

- `AGENTS.md`
- `docs/ui/UI_PRINCIPLES.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_DESIGN_DECISIONS.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`
- `docs/ui/UI_ENTITY_DETAIL_CANONICAL_PATTERN.md`
- `docs/ui/UI_COMPONENT_EXTRACTION_PLAN.md`
- `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_INITIATIVE_PROJECT_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_PERSON_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_TASK_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_LIST_PAGE_SYSTEM.md`
- `docs/ui/UI_PHASE_22_WORKTREE_HYGIENE.md`
- `docs/ui/UI_PHASE_23_LIST_PAGE_DECOMPOSITION.md`
- `docs/ui/UI_PHASE_24_DETAIL_PAGE_DECOMPOSITION.md`
- `docs/ui/UI_REFACTOR_HANDOVER.md`
- `web/src/App.tsx`
- `web/src/styles.css`
- `web/src/components/ui/*`
- `web/src/components/party/*`
- `web/src/api.ts`
- `web/src/types.ts`

For architecture/data changes, also follow the broader `AGENTS.md` freshness list.

## 16. Files A New Session Should Avoid Changing Without Explicit Scope

- `data/schema.sql`
- migrations / database files
- package files and dependencies
- `src/chat/conversation-context.ts` unless data model/context shape changes
- OpenClaw configuration and workspace files
- app-shell navigation/drawer internals unless the phase explicitly scopes drawer work
- calendar/timeline/planning implementation files unless the phase explicitly scopes time/planning surfaces
- list-page routes unless the phase explicitly scopes list migration
- unrelated entity routes when migrating a single route

## 17. Testing Commands And Validation Expectations

Standard validation commands:

```bash
npm run typecheck
npm run web:build
npm test
```

Latest known validation:

- `npm run typecheck`: passed on 2026-05-14 after Phase 22.
- `npm run web:build`: passed on 2026-05-14 after Phase 22.
- `npm test`: passed on 2026-05-14 after Phase 22, 28 test files / 115 tests.

Screenshot validation expectations:

- For entity detail migrations, capture desktop normal, drawer open, not-found, narrow viewport, and key edit/modal states.
- Save screenshots under a route/phase-specific folder in `docs/ui/screenshots/`.
- Update the corresponding `UI_REFERENCE_REVIEW_*.md` file.

## 18. Git Status Summary

Before Phase 21, Phase 20 had been committed and pushed as `104a78b`. Voice/audio UI work was committed separately as `a9c52d9`.

Current UI-related worktree changes:

- `web/src/App.tsx`
- `web/src/components/ui/EntityListPage.tsx`
- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`
- `docs/ui/UI_REFACTOR_HANDOVER.md`
- `docs/ui/UI_REFERENCE_REVIEW_LIST_PAGE_SYSTEM.md`
- `docs/ui/UI_PHASE_22_WORKTREE_HYGIENE.md`
- `docs/ui/screenshots/list-page-system-review/`

Current non-UI / unknown worktree change:

- `Dockerfile`
- `README.md`
- `docs/current-state.md`
- `docs/ui/UI_ROUTE_INVENTORY.md`
- `src/chat/openclaw-agent.ts`

Package files:

- `package.json`: no current diff.
- `package-lock.json`: no current diff.
- `@playwright/test` is already present from commit `104a78b`.

Important: inspect `git diff` and `git status --short` before new edits. Do not revert existing changes unless explicitly requested.

## 19. Handoff Summary In 20 Bullets Or Fewer

1. UI governance is active in `AGENTS.md` and `docs/ui/`.
2. Canonical entity detail pattern is documented in `UI_ENTITY_DETAIL_CANONICAL_PATTERN.md`.
3. Core entity UI primitives are extracted in `web/src/components/ui`.
4. Party contact/address components are extracted in `web/src/components/party`.
5. `/organizations/:id` is the original context/contact reference.
6. `/projects/:id` and `/initiatives/:id` validate complex planning/action detail.
7. `/people/:id` is migrated and validates person/context detail with sparse data.
8. `/tasks/:id` is migrated and ready as canonical action-object reference after Phase 12.6.
9. `/categories/:name` is migrated and ready as canonical life-area/category reference after Phase 13.
10. `/categories` is migrated and ready as the first canonical list-page reference after Phase 14.
11. `/people` is migrated and ready as the canonical person/contact list reference after Phase 15.
12. `/organizations` is migrated and ready as the canonical organization/contact list reference after Phase 16.
13. `/projects` is migrated and ready as the canonical project/action list reference after Phase 17.
14. `/ideas` is migrated and ready as the canonical exploratory/action list reference after Phase 18.
15. `/habits` is migrated and ready as the canonical habit/routine list reference after Phase 19.
16. `/tasks` is migrated and ready as the canonical task/action list reference after Phase 20.
17. Phase 21 consolidated `/categories`, `/people`, `/organizations`, `/projects`, `/ideas`, `/habits` and `/tasks` into a ready canonical list-page system.
18. List system screenshots are under `docs/ui/screenshots/list-page-system-review/`.
19. Next recommended phase is narrow `App.tsx` decomposition for canonical list pages, unless product priority calls for calendar/planning or utility/debug containment first.
20. Inspect status before editing and avoid unrelated route or schema work.
