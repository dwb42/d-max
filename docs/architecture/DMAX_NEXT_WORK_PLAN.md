# DMAX Next Work Plan

Last updated: 2026-05-15

This is the forward-looking technical plan after the completed canonical UI refactor. It is intentionally not a phase history. Future coding-agent sessions should use this file with the active UI docs, not the archived UI refactor planning set.

Active UI context:

- `docs/ui/UI_CURRENT_STATE.md`
- `docs/ui/UI_PRINCIPLES.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`

Historical UI refactor evidence lives in `docs/ui/archive/completed-ui-refactor/` and should only be loaded when a task explicitly needs old screenshots, route inventory, or phase rationale.

## 1. Current Baseline

The canonical UI refactor is complete.

Completed and extracted canonical detail pages:

- `/organizations/:id`
- `/projects/:id` and `/initiatives/:id`
- `/people/:id`
- `/tasks/:id`
- `/categories/:name`

Completed and extracted canonical list pages:

- `/categories`
- `/people`
- `/organizations`
- `/projects`
- `/ideas`
- `/habits`
- `/tasks`

Current frontend structure:

- List route compositions live in `web/src/pages/lists/`.
- Detail route compositions live in `web/src/pages/details/`.
- Shared UI primitives live in `web/src/components/ui/`.
- Party/contact primitives live in `web/src/components/party/`.
- `web/src/App.tsx` is still large, roughly 8k lines at this writing.

`App.tsx` still owns:

- route parsing and route switching;
- app shell and navigation;
- content header composition;
- data loading and refresh orchestration;
- mutation callback implementations;
- create/edit modal open state that crosses route boundaries;
- DMAX drawer state, route-to-context mapping, chat streaming, voice-message handling, audio reply playback;
- utility/debug routes such as config, prompt templates and prompt inspector;
- calendar, timeline and planning-canvas surfaces.

The main next decision is whether to reduce shell/drawer technical risk first or to move into product-specific feature work. The recommended default is to extract DMAX drawer/context code first, then do one narrow orchestration decomposition pass, then contain utility/debug surfaces.

Calendar, timeline and planning-canvas work remains deferred. Those surfaces are large enough to need their own audit and canonical time/planning pattern rather than opportunistic cleanup during drawer or orchestration work.

## 2. Workstream A: DMAX Drawer / Context Extraction

### Why This Is The Best Next Technical Extraction

The DMAX drawer is central to the product and still crosses too many concerns inside `App.tsx`:

- route-to-conversation-context mapping;
- scoped context label selection;
- OpenClaw status polling and prewarming;
- drawer open/close state;
- conversation selection and creation;
- streaming chat turn handling;
- activity display;
- voice-message recording/transcription flow;
- assistant audio reply generation/playback;
- user-facing error mapping;
- drawer shell and resize behavior.

Extracting it reduces risk before calendar/planning or config/debug work, because the drawer appears across nearly every route. It also creates a better boundary for future agent/chat experience improvements.

### In Scope

- Move drawer visual components out of `App.tsx`.
- Move route/context helper functions into a focused module.
- Move user-facing chat/context error mapping into a focused module.
- Keep behavior and copy stable unless the extraction requires a small naming cleanup.
- Keep OpenClaw and chat API contracts unchanged.
- Preserve mobile full-screen drawer behavior, the visible DMAX close/toggle
  affordance, drawer scroll containment, and DMAX scoped context labels.
- Preserve voice-message and audio-reply behavior.

### Out Of Scope

- No agent backend changes.
- No prompt, context resolver, schema, or OpenClaw runtime changes.
- No redesign of the drawer UX.
- No new chat features.
- No broad app-shell refactor.
- No calendar/planning work.
- No migration of `/drive` durable voice tool behavior.

### Candidate Files And Components

Current code to extract from `web/src/App.tsx`:

- `getRouteConversationContext`
- `conversationContextKey`
- `contextualAgentErrorMessage`
- `loadPersistedChatMessages`
- `chatMessageFromPersisted`
- `attachActivitiesToLastAssistant`
- `DmaxAgentButton`
- `AgentDrawer`
- `ChatView`
- `ChatAudioPlayer`
- `ActivityTrail`
- voice-message helpers that are specific to the chat drawer

Likely new structure:

```text
web/src/dmax-drawer/
  DmaxAgentButton.tsx
  AgentDrawer.tsx
  ChatView.tsx
  ChatAudioPlayer.tsx
  ActivityTrail.tsx
  context.ts
  errors.ts
  chatMessages.ts
  types.ts
  index.ts
```

If a feature-style folder is preferred:

```text
web/src/features/dmax-drawer/
```

Use one folder, not both.

### Implementation Phases

#### A1. Extract Visual Drawer Shell Only

Move `DmaxAgentButton`, `AgentDrawer`, `ChatView`, `ChatAudioPlayer` and `ActivityTrail` into a drawer folder.

Keep all state, API calls and handlers in `App.tsx`.

Validation:

- Typecheck/build/tests.
- Smoke the drawer on one list route and one detail route if there is any visual doubt.
- Confirm the drawer still opens with the correct label.
- Confirm old chats, new chat, close, streaming, voice-message controls and audio reply UI still render.

Risk:

- Prop surface will be large.
- This does not yet reduce orchestration complexity.

Decision point:

- If props become too wide, stop after visual extraction and document the next state extraction boundary rather than inventing a broad drawer controller.

#### A2. Extract Context Label And Mapping Logic

Move `getRouteConversationContext` and `conversationContextKey` into a drawer context module.

Keep `App.tsx` as the owner of current route and loaded entity data.

Validation:

- Unit-test context key/mapping if practical.
- Check all canonical list/detail routes map to the expected context.
- Check fallback is still `Global Chat`.

Risk:

- Context labels depend on loaded details. Do not move data loading into the drawer module.

Decision point:

- Decide whether route context types should stay UI-local or become a shared frontend domain helper. Keep them UI-local unless backend/context resolver code needs the same mapping.

#### A3. Extract Chat Error/User-Facing Copy Mapping

Move `contextualAgentErrorMessage` and related user-facing mapping into `errors.ts`.

Keep raw technical errors out of normal UI.

Validation:

- Typecheck/build/tests.
- Add a small unit test only if an existing frontend test pattern exists; otherwise keep this as a pure helper and rely on current test suite.

Risk:

- Debug views may still need raw errors. Do not use the normal user-facing mapper for debug inspector surfaces unless explicitly intended.

#### A4. Extract Drawer State/Orchestration Later

Only after A1-A3 are stable, consider extracting a `useDmaxDrawer` hook that owns:

- drawer open/close state;
- selected conversation state;
- load context;
- select conversation;
- start new conversation;
- chat message state;
- chat busy/activity state.

Keep route, data loading and app refresh callbacks in `App.tsx`.

Risk:

- This touches streaming, voice messages, abort handling, audio generation and refresh-after-chat. It is the highest-risk drawer extraction.

Recommendation:

1. Do A1 first.
2. Then A2.
3. Then A3.
4. Defer A4 until the extracted visual/context modules have been used for at least one cycle.

## 3. Workstream B: App.tsx Orchestration Decomposition

### What Still Makes App.tsx Large

Even after list/detail extraction, `App.tsx` still contains:

- route parser/path helpers;
- app shell markup and nav rendering;
- topbar/content header rendering for all views;
- data loading effects for overview, details, people, organizations, prompts and calendar;
- mutation callbacks for categories, initiatives, tasks, people, organizations, parties, relationships and calendar;
- modal open state for create/edit flows;
- DMAX drawer/chat/voice handling;
- `/drive` voice surface;
- config, prompt templates and prompt inspector;
- planning canvas and timeline;
- many formatting and debug helper functions.

### Already Extracted

- Canonical list pages under `web/src/pages/lists/`.
- Canonical detail pages under `web/src/pages/details/`.
- Shared UI primitives under `web/src/components/ui/`.
- Party contact/address components under `web/src/components/party/`.

### What To Decompose Next

Prefer extraction that reduces risk without moving business behavior too far:

#### B1. Route Switch / Render Composition Extraction

Create a route rendering component that receives already-loaded data and callbacks from `App.tsx`.

Possible file:

```text
web/src/app/AppRoutes.tsx
```

Keep state and API calls in `App.tsx`. Move only the conditional render body and route content selection.

Recommended safe first step:

- Extract content body route rendering, not the app shell.
- Keep `renderContentHeader` in `App.tsx` until drawer/app-shell extraction is clearer.

#### B2. Data Loading Hooks / Helpers

Group route data loading into hooks only after render composition is clearer.

Possible files:

```text
web/src/app/useAppData.ts
web/src/app/useRouteDetails.ts
```

Risks:

- Loading and refresh interactions are shared across mutations.
- Bad extraction can create stale data or double fetches.

Recommendation:

- Do not start here unless a testable data boundary is clear.

#### B3. Mutation Callback Grouping

Group related mutation callbacks by domain:

```text
web/src/app/mutations/categories.ts
web/src/app/mutations/initiatives.ts
web/src/app/mutations/tasks.ts
web/src/app/mutations/parties.ts
web/src/app/mutations/calendar.ts
```

Risks:

- Many callbacks currently depend on `refresh`, navigation and current detail setters.
- This may require passing too many setters around.

Recommendation:

- Defer until after route rendering and drawer extraction.

#### B4. Modal Orchestration Boundaries

Create a small app-shell modal state module only if modal state keeps spreading.

Risks:

- Create modals already live with extracted list pages, but open flags still live in `App.tsx`.
- Moving modal open state may not reduce complexity enough to justify the indirection.

Recommendation:

- Defer unless a future feature adds more global modal state.

#### B5. App-Shell Layout Boundaries

Extract shell and navigation after drawer extraction:

```text
web/src/app/AppShell.tsx
web/src/app/navigation.tsx
```

Risks:

- The shell currently coordinates mobile nav, sidebar collapse, drawer width, drawer open state and route active state.

Recommendation:

- Do not extract shell before drawer visual/context extraction.

## 4. Workstream C: Config / Prompts / Debug Containment

### Why These Surfaces Are Different

Config, prompt templates and prompt inspector are utility/debug surfaces. They are allowed to be denser and more technical than canonical entity pages, but they should not leak debug-first patterns into normal product UI.

Current targets in `App.tsx` include:

- `ConfigView`
- `PromptTemplatesView`
- `PromptInspectorView`
- `ContextPayloadDebugView`
- `TurnTracePanel`
- prompt/context debug tables and badges

### What Containment Means

Containment does not mean making debug pages look like entity pages. It means:

- clear route-level utility/debug framing;
- technical metadata grouped and collapsible;
- raw JSON and prompt text behind intentional disclosures;
- stable copy that makes it clear when a view is debug/inspector-only;
- visual density that remains readable;
- no reuse of debug styling as normal entity/list styling.

### Possible Phases

#### C1. Inventory Current Utility / Debug Routes

Inspect `/config`, `/prompts`, `/prompt-vorlagen`, media/Google event modals if relevant, and `/drive` only as a separate voice utility surface.

Deliverable:

- A short current-state doc.
- No code changes unless there is a clear broken state.

#### C2. Define Utility / Debug UI Principles

Create active guidance for utility/debug pages in `docs/ui/UI_PATTERNS.md` or a small `docs/ui/UI_UTILITY_DEBUG_PATTERN.md` if the pattern is large enough.

Keep it concise.

#### C3. Contain Technical Metadata And Raw Prompt Surfaces

Use collapsible sections and clearer grouping for raw prompts, context payloads, IDs and trace data.

Do not hide critical debug data so much that the inspector loses its purpose.

#### C4. Improve Error / Copy Boundaries

Normal UI should map raw technical errors to user-facing copy. Debug routes may expose raw details, but the route should clearly be an inspector/debug surface.

#### C5. Extract Reusable Utility Components Only If Useful

Possible components:

- `UtilityPage`
- `DebugInspectorPage`
- `TechnicalMetadataDisclosure`
- `DebugSection`
- `JsonDisclosure`

Recommendation:

- Do not extract these before C1/C2. Let the current utility/debug surfaces show what is actually reusable.

## 5. Workstream D: Product-Specific Deferred Work

### D1. Task Filtering / Archived Tasks / Task Views

Current problem:

- `/tasks` currently shows open tasks from the overview data.
- Completed task archive/filtering is deferred.
- There is no full task view system for open, done, archived, due soon, overdue, category, project or priority views.

Why deferred:

- The canonical task list migration focused on scan-first UI and behavior preservation.
- Adding archives/views may require API and product semantics.

Required product decisions:

- What is the difference between done, archived and hidden?
- Should completed tasks remain visible in context pages?
- Which views matter first: open, done, overdue, by project/category, priority?
- Should archived tasks be queryable globally and per project/category?

Likely data/API implications:

- Existing overview may need completed/archived task support or a dedicated task list endpoint.
- Task repository may need filters.
- Context resolver may need to decide whether archived tasks are included.

Likely UI implications:

- `/tasks` may need lightweight tabs or filters.
- Task detail may need archive state if archive is distinct from done.
- Entity detail task sections may need compact filters.

First safe discovery task:

- Inspect task schema, repositories, API routes and overview query. Document what task states exist today and which filters can be frontend-only versus API-backed.

When to do it:

- Do this when task management is the next product priority.

Dependencies:

- Could benefit from `SearchFilterRow`.
- Does not require drawer extraction, but drawer extraction reduces unrelated App risk first.

### D2. RelationshipManager

Current problem:

- Relationship display is canonical, but relationship editing remains route-local and uneven.
- Project predecessor/successor/dependency editing is still dense.
- Party-to-DMAX-object linking exists, but there is no general management surface.

Why deferred:

- Relationship semantics are product-sensitive.
- A generic manager could easily over-abstract different relationship types.

Required product decisions:

- Which relationship types need management first?
- Should the manager support people, organizations, initiatives, tasks and dependencies in one surface or separate scoped variants?
- Should it create new entities inline or only link existing ones?
- What deletion/unlink confirmation rules apply?

Likely data/API implications:

- Existing party relationships, initiative relations and entity participants have different APIs.
- A generic UI may need adapter layers rather than a generic backend endpoint.

Likely UI implications:

- Read-only `RelationList` remains the default.
- `RelationshipManager` opens in `EditModal` or drawer.
- It needs search/pick, selected relation editing, remove/unlink and possibly create-new.

First safe discovery task:

- Inventory current relationship APIs/types and route-level link/edit forms. Propose one scoped manager target, likely party-to-DMAX links or organization/person relationships, before generalizing.

When to do it:

- After drawer/context extraction or after config/debug containment, unless relationship editing becomes the immediate product blocker.

Dependencies:

- Uses active relation patterns.
- May need search/filter primitives.

### D3. TechnicalMetadataDisclosure

Current problem:

- Normal entity pages hide internal IDs and debug data, but utility/debug surfaces still expose raw metadata directly.
- There is no reusable disclosure component for technical metadata.

Why deferred:

- Canonical entity pages intentionally removed technical noise first.
- Utility/debug containment was not part of the entity refactor.

Required product decisions:

- Which technical details are useful to Dietrich in normal UI, if any?
- Which fields belong only in debug routes?
- Should disclosures be available on normal detail pages for power-user inspection?

Likely data/API implications:

- Usually none if using existing frontend data.
- If debug metadata needs new fields, API changes must be explicit and scoped.

Likely UI implications:

- A `TechnicalMetadataDisclosure` component can render raw IDs, provider IDs, sync state, prompt trace IDs and JSON snippets.
- It should be visually quiet and collapsed by default outside debug routes.

First safe discovery task:

- Inventory where raw IDs, provider IDs, sync payloads and JSON snippets currently appear. Start with `/config`, `/prompts` and calendar/media dialogs.

When to do it:

- During Workstream C.

Dependencies:

- Best after utility/debug principles are defined.

### D4. Habit Frequency / Recurrence Semantics

Current problem:

- Habit list/detail UI intentionally does not invent frequency, recurrence, streak or completion semantics.
- The current model does not yet express a mature habit engine.

Why deferred:

- This is domain/product logic, not presentation cleanup.
- It likely affects schema, tools, deterministic agent behavior and context resolver.

Required product decisions:

- What is a habit in DMAX: recurring task generator, reflective routine, checklist, streak tracker, or loose ongoing initiative?
- Does frequency produce tasks or only describe intent?
- How are misses, pauses, completions and streaks represented?
- What should the agent do with habit recurrence?

Likely data/API implications:

- Schema changes may be needed.
- Tools and repositories may need recurrence behavior.
- `src/chat/conversation-context.ts` and `tests/chat/context-schema-sync.test.ts` must be reviewed if schema/context changes.

Likely UI implications:

- Habit list may show frequency/status only after data semantics exist.
- Habit detail may need recurrence settings, recent activity and generated tasks.

First safe discovery task:

- Document current habit fields, APIs and tool behavior. Write a product semantics proposal before touching schema.

When to do it:

- When habit/routine behavior becomes a core product priority.

Dependencies:

- None required, but task filtering/archived tasks may influence generated task behavior.

### D5. Category Reordering

Current problem:

- Category reordering exists historically, but the canonical category list does not expose old work-board/reordering behavior by default.

Why deferred:

- Reordering needs a calm explicit management pattern, not persistent drag noise on the default list.

Required product decisions:

- Is category order still meaningful?
- Should reorder be a dedicated mode?
- Should system categories be reorderable?
- How should order affect navigation and list display?

Likely data/API implications:

- Existing reorder API may already exist.
- Need to confirm constraints around system categories.

Likely UI implications:

- Add a secondary `Reihenfolge bearbeiten` action or management modal.
- Avoid default drag handles on every category row unless in reorder mode.

First safe discovery task:

- Inspect existing category reorder API and old UI behavior. Propose a dedicated reorder mode without implementing it.

When to do it:

- When category organization becomes a priority.

Dependencies:

- Could follow App shell/list stability work.

### D6. Richer Contact Previews

Current problem:

- `/people` and `/organizations` list pages are intentionally sparse because list APIs do not provide contact/address/relation previews.

Why deferred:

- Enriching rows could cause per-row fetches or noisy list rows.
- It needs API decisions and hierarchy rules.

Required product decisions:

- Which preview facts are worth showing: primary email, phone, organization, role, city, linked project count?
- Should previews prioritize contactability or context?
- How much density is acceptable on contact lists?

Likely data/API implications:

- People/organization list endpoints may need aggregated primary contact data.
- Avoid N+1 detail fetches.

Likely UI implications:

- `EntityListItem` can already support compact meta/stats.
- Need a row preview policy so lists do not become mini detail pages.

First safe discovery task:

- Inspect people/organization API list payloads and repositories. Propose one minimal preview payload that avoids per-row enrichment.

When to do it:

- After maintainability work, or sooner if contact scanning becomes the product priority.

Dependencies:

- Could benefit from `SearchFilterRow`, but not required.

### D7. Other Deferred Product-Specific Components

Potential future components from the active docs:

- `SearchFilterRow`
- `UtilityPage`
- `DebugInspectorPage`
- `RelationPicker`
- `EditDrawer`
- `InspectorModal`
- `DateRangeDisplay`
- `CalendarEventLinkBlock`
- `TimeBlockCard`
- `LockIndicator`
- `SaveStateIndicator`
- `IntegrationState`
- `CommunicationThreadPreview`

Rule:

- Do not build these just because they are named. Create them only when at least one concrete route needs the component and the abstraction removes real duplication or risk.

## 6. Recommended Sequence

Default recommendation:

1. Workstream A: DMAX drawer/context extraction.
2. Workstream B: one small App.tsx orchestration extraction, likely route render composition.
3. Workstream C: config/prompts/debug containment.
4. Product-specific features based on priority.

Why:

- Drawer/context is cross-cutting and product-central.
- Orchestration extraction lowers future code risk.
- Utility/debug containment reduces noise before new feature work.
- Product-specific features often require data/API decisions and should not be mixed with cleanup.

Alternative if maintainability is the priority:

1. A1 visual drawer extraction.
2. A2 context mapping extraction.
3. B1 route render extraction.
4. B5 app shell/navigation extraction.
5. B2/B3 only after boundaries are stable.

Alternative if product velocity is the priority:

1. D1 task filtering discovery.
2. D2 RelationshipManager discovery.
3. Implement one scoped product feature.
4. Return to A/B extraction before broadening.

Alternative if agent/chat experience is the priority:

1. A1 visual drawer extraction.
2. A2 context mapping extraction.
3. A3 error mapping extraction.
4. A4 `useDmaxDrawer` orchestration extraction.
5. Then improve chat UX or context handling with a cleaner boundary.

Alternative if task management is the priority:

1. D1 task filtering/archived tasks discovery.
2. Define task state/archive semantics.
3. Add API-backed task views.
4. Revisit `SearchFilterRow` only after concrete filter needs are known.

## 7. Ready-To-Use Phase Prompt Skeletons

### Phase 26: DMAX Drawer / Context Extraction

```text
DMAX Stabilization - Phase 26: DMAX Drawer / Context Extraction

Read AGENTS.md, docs/architecture/DMAX_NEXT_WORK_PLAN.md, active docs/ui guidance, web/src/App.tsx and current drawer/chat code.

Scope: behavior-preserving extraction only. Extract the DMAX drawer visual components and route-to-context helpers from App.tsx into focused frontend modules. Do not redesign the drawer, change OpenClaw/chat APIs, alter schemas, or touch calendar/planning/config surfaces.

Preserve: scoped context labels, mobile drawer containment, old chats, new chat, streaming, abort, voice-message controls, audio replies and user-facing error mapping.

Run: npm run typecheck, npm run web:build, npm test.

Deliver: files changed, extracted boundaries, what remains in App.tsx, validation, risks and next recommended drawer extraction step.
```

### Phase 27: App.tsx Orchestration Decomposition

```text
DMAX Stabilization - Phase 27: Narrow App.tsx Orchestration Decomposition

Read AGENTS.md, docs/architecture/DMAX_NEXT_WORK_PLAN.md, active docs/ui guidance, web/src/App.tsx, web/src/pages/lists and web/src/pages/details.

Scope: behavior-preserving extraction of route rendering/orchestration only. Do not redesign UI, change APIs, move data loading unless explicitly justified, or touch drawer internals unless Phase 26 has already defined that boundary.

Preferred first step: extract route body rendering into a small app-level module while keeping state, API calls, mutation callbacks and shell behavior in App.tsx.

Run: npm run typecheck, npm run web:build, npm test.

Deliver: files changed, exact boundary moved, state intentionally left in App.tsx, validation and next decomposition candidate.
```

### Phase 28: Config / Prompts / Debug Containment

```text
DMAX Stabilization - Phase 28: Config / Prompts / Debug Containment

Read AGENTS.md, docs/architecture/DMAX_NEXT_WORK_PLAN.md, active docs/ui guidance, web/src/App.tsx sections for ConfigView, PromptTemplatesView, PromptInspectorView and ContextPayloadDebugView.

First inspect and document current utility/debug surfaces. Then make only focused containment improvements if scoped: clearer utility/debug framing, collapsible technical metadata, raw JSON/prompt containment and user-facing copy boundaries.

Do not make debug pages look like entity pages. Do not hide data needed for debugging. Do not change prompt/backend/OpenClaw behavior.

Run: npm run typecheck, npm run web:build, npm test.

Deliver: current-state summary, any code/docs changed, validation, remaining debug-surface limitations and whether reusable utility components are justified.
```

### Phase 29: Task Filtering And Archived Tasks Discovery

```text
DMAX Product Discovery - Phase 29: Task Filtering / Archived Tasks / Task Views

Read AGENTS.md, docs/architecture/DMAX_NEXT_WORK_PLAN.md, active docs/ui guidance, task schema/repositories/API/tools, web/src/pages/lists/TaskListPage.tsx and web/src/pages/details/TaskDetailPage.tsx.

This is discovery first. Do not implement filters, archive behavior, schema changes or UI changes until the current task state model is documented.

Answer: what task states exist, how done/completed is represented, whether archive exists, what APIs return open/completed tasks, what context resolver includes, and what first safe implementation phase should be.

Run validation only if code/docs change.
```

### Phase 30: RelationshipManager Discovery

```text
DMAX Product Discovery - Phase 30: RelationshipManager Discovery

Read AGENTS.md, docs/architecture/DMAX_NEXT_WORK_PLAN.md, active docs/ui guidance, relationship-related schema/repositories/API/tools, RelationList components and current detail page relationship/link forms.

This is discovery and design only. Do not implement a generic RelationshipManager yet.

Inventory current relationship surfaces: party relationships, initiative relations, entity participants, task participants and project dependencies. Propose the first scoped RelationshipManager target and explain why it should or should not be generic.

Run validation only if code/docs change.
```

## 8. Validation Checklist For Future Phases

Default validation after code changes:

- `npm run typecheck`
- `npm run web:build`
- `npm test`

For UI changes, also apply:

- active UI docs in `docs/ui/`;
- relevant route smoke checks;
- screenshots only when visual output changes or review evidence is requested.

For data/model/context changes, also inspect:

- `data/schema.sql`
- relevant repositories and API routes;
- `src/chat/conversation-context.ts`
- `tests/chat/context-schema-sync.test.ts`

## 9. Open Questions

- Should the next priority be maintainability, agent/chat experience, utility/debug containment or product feature velocity?
- Should DMAX drawer extraction use `web/src/dmax-drawer/` or `web/src/features/dmax-drawer/` as the standard feature folder shape?
- Should task archive semantics be product-defined before any list filtering UI?
- Should relationship management start with one scoped manager or an adapter-driven generic manager?
- Should calendar/timeline/planning get an audit phase before any extraction, or wait until task/project semantics are more mature?
