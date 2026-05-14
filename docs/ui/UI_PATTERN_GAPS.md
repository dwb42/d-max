# DMAX UI Pattern Gaps

This document is the Phase 2 pattern-gap analysis. It identifies missing canonical patterns, inconsistent existing patterns and component candidates that should be resolved before UI refactoring begins.

This is not a final design decision document. The recommended directions below are inputs for the next governance/design phase.

## 1. Executive Summary

The current DMAX UI has many useful local implementations but too few binding canonical patterns. The most important missing patterns are:

1. Entity detail page pattern
2. Entity list page pattern
3. Entity header pattern
4. Section block and section header pattern
5. Relationship display and relationship management pattern
6. Description/notes/markdown pattern
7. Metadata pattern
8. Contact point and address pattern
9. Time/calendar/sync state pattern
10. Structured UI state pattern

The first reference implementation should be `/organizations/:id` because it already includes identity, description, contact points, addresses, members, relationships and DMAX participations with fewer structural blockers than project or planning routes.

## 2. Missing Canonical Patterns

### GAP-001: Entity detail page pattern

- Pattern name: `EntityDetailPage`
- Current situation: detail routes use separate layouts: category detail, initiative detail, task detail, person detail and organization detail all differ.
- Affected routes/components: `/categories/:name`, `/projects/:id`, `/initiatives/:id`, `/tasks/:id`, `/people/:id`, `/organizations/:id`
- Problem: entity pages do not share identity, primary content, relationship and metadata ordering.
- Recommended canonical direction: create a shared page structure with `EntityHeader`, primary working section, relationship sections, secondary metadata and consistent state handling.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed; design decision needed for section order and density.

### GAP-002: Entity header pattern

- Pattern name: `EntityHeader`
- Current situation: `renderContentHeader`, `InitiativeDetailHeader`, `TaskDetailHeader`, person header and organization header all implement separate title/action/state logic.
- Affected routes/components: all detail routes, app sticky header.
- Problem: entity identity, state, metadata and actions compete differently per route.
- Recommended canonical direction: define header slots for breadcrumb/back, entity type, title, status summary, primary action, secondary actions and compact metadata.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed; design decision needed for what belongs in header vs body.

### GAP-003: Entity list page pattern

- Pattern name: `EntityListPage`
- Current situation: initiatives use top create form plus category sections; people/orgs use stacked create/search/list panels; tasks use bare rows.
- Affected routes/components: `/ideas`, `/projects`, `/habits`, `/tasks`, `/people`, `/organizations`
- Problem: list routes do not share scan/search/filter/create behavior.
- Recommended canonical direction: `PageHeader`, `SearchFilterRow`, optional compact create row/modal, `EntityList`, `EntityRow`, structured states.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed; decision needed on always-visible create vs primary create action.

### GAP-004: Description / notes / markdown pattern

- Pattern name: `DescriptionBlock`
- Current situation: category description edits inline; initiative markdown edits inline full-panel; organization description edits in modal; task notes edit inline; person has no description/context field.
- Affected routes/components: `LifeAreaDetailView`, `InitiativeMarkdownPanel`, `OrganizationDescriptionPanel`, `TaskNotesPanel`
- Problem: equivalent long-form context fields use different display and edit patterns.
- Recommended canonical direction: read-first rendered content with section action; edit in modal/drawer/full editor according to length and workflow.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed; decision needed on modal vs drawer thresholds.

### GAP-005: Relationship display pattern

- Pattern name: `RelationList` / `RelationGroup` / `RelationItem`
- Current situation: participants, party relationships, DMAX participations, project hierarchy, dependencies, calendar bindings and member relationships use unrelated row structures.
- Affected routes/components: `ParticipantsPanel`, `PartyRelationshipsPanel`, `PartyParticipationsPanel`, `OrganizationMembersPanel`, `InitiativeRelationsPanel`, `ProjectStructureList`, calendar/planning surfaces.
- Problem: relationships are hard to scan consistently and relationship direction/action semantics vary.
- Recommended canonical direction: shared grouped relation display with object type, title, relationship type, supporting fact, open action and optional remove action.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed; decisions needed for grouping order and direction labels.

### GAP-006: Relationship management pattern

- Pattern name: `RelationshipManager`
- Current situation: relationship editing is inline in initiative relations, participants and organization members; some relationships are display-only.
- Affected routes/components: `InitiativeRelationsPanel`, `ParticipantsPanel`, `OrganizationMembersPanel`, future relationship editing.
- Problem: read and edit tasks are mixed, and each route invents a different add/remove flow.
- Recommended canonical direction: read-only `RelationList` by default; heavier relation creation/editing in drawer or modal with `RelationPicker` and relationship type controls.
- Priority: high
- Dependency on screenshots/design decisions: design decision needed for drawer vs modal.

### GAP-007: Metadata pattern

- Pattern name: `MetadataGrid` / `TechnicalMetadataDisclosure`
- Current situation: metadata appears as route-specific `dl`, row meta, prompt meta grids, media sidebars and config rows.
- Affected routes/components: task detail, media modal, prompt inspector, config, Google event dialogs, entity rows.
- Problem: primary facts, secondary metadata and technical/debug metadata are not separated consistently.
- Recommended canonical direction: define metadata levels and use `MetadataGrid` for secondary facts; technical metadata goes into collapsed debug/technical disclosure.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed; decision needed for which metadata is user-facing.

### GAP-008: Structured state pattern

- Pattern name: `EmptyState`, `LoadingState`, `ErrorState`, `SaveStateIndicator`
- Current situation: `EmptyState` is title-only and also used for loading/not-found; several routes lack explicit states.
- Affected routes/components: all async routes and panels.
- Problem: users cannot reliably distinguish empty data, loading, failed requests and filtered results.
- Recommended canonical direction: state components with title, short body, optional action, retry and save/failure variants.
- Priority: high
- Dependency on screenshots/design decisions: screenshots useful for density and tone.

### GAP-009: Contact point pattern

- Pattern name: `ContactPointList` / `ContactPointEditor`
- Current situation: `ContactPointsPanel` is reused for people and organizations but is still implemented as a local party panel.
- Affected routes/components: `/people/:id`, `/organizations/:id`, `ContactPointsPanel`, `ContactPointModal`
- Problem: close to reusable, but not yet canonical or aligned with docs naming/state/copy.
- Recommended canonical direction: promote to shared contact point pattern with display row, copy/open/send action affordances, modal editor and consistent empty state.
- Priority: medium
- Dependency on screenshots/design decisions: screenshots needed for row density; decision needed on labels/actions.

### GAP-010: Address pattern

- Pattern name: `AddressBlock` / `AddressEditor`
- Current situation: `AddressesPanel` is organization-only and uses relationship-row styling.
- Affected routes/components: `/organizations/:id`, future person addresses if implemented.
- Problem: addresses do not yet have a canonical human-readable block or shared editor.
- Recommended canonical direction: address display block with label/primary flag, concise address lines, edit/delete actions and modal editor.
- Priority: medium
- Dependency on screenshots/design decisions: screenshots useful; decision needed on whether people get addresses later.

### GAP-011: Time/calendar/sync state pattern

- Pattern name: `DateRangeDisplay`, `TimeBlock`, `CalendarEventLinkBlock`, `LockIndicator`, `SyncStateBadge`
- Current situation: project date modal, calendar event blocks, timeline bars and planning canvas bars all represent time/sync/lock state differently.
- Affected routes/components: `/calendar`, `/calendar/timeline`, `/planning-canvas`, `InitiativeDetailHeader`, `ProjectDateCalendarModal`
- Problem: fixed/flexible/synced/imported/read-only states are not represented by one visual language.
- Recommended canonical direction: shared state badges/indicators and route-specific layouts that reuse the same semantics.
- Priority: high
- Dependency on screenshots/design decisions: screenshots required.

### GAP-012: Modal and drawer pattern

- Pattern name: `EditModal`, `EditDrawer`, `ConfirmModal`, `InspectorModal`
- Current situation: compact modals, party edit modals, markdown modals, planning canvas modals and media modal each use route-specific structures.
- Affected routes/components: contact/address/core edit, description edit, project date edit, Google event dialogs, planning canvas modals, media modal.
- Problem: action placement, title structure, close behavior, error placement and size vary.
- Recommended canonical direction: define modal intent and size variants; use drawers for larger contextual edits where appropriate.
- Priority: high
- Dependency on screenshots/design decisions: screenshots required; decision needed on drawer adoption.

### GAP-013: Utility/debug page pattern

- Pattern name: `UtilityPage` / `DebugInspectorPage`
- Current situation: config, prompt templates and prompt inspector each use dense custom panel layouts.
- Affected routes/components: `/config`, `/prompt-vorlagen`, `/prompts`
- Problem: technical density is necessary but not governed.
- Recommended canonical direction: document utility/debug page rules, including technical metadata, code/pre blocks, side lists and refresh/copy actions.
- Priority: medium
- Dependency on screenshots/design decisions: screenshots needed.

### GAP-014: Context hub pattern

- Pattern name: `ContextHubPage`
- Current situation: no `/context` route exists; people and organizations are top-level nav items.
- Affected routes/components: `/people`, `/organizations`, future communication/relationship context.
- Problem: DMAX's "who/what matters" area lacks a hub pattern.
- Recommended canonical direction: defer implementation, but define whether people/orgs remain top-level or move under a `Context` hub.
- Priority: medium
- Dependency on screenshots/design decisions: product IA decision needed.

### GAP-015: Realtime voice session pattern

- Pattern name: `RealtimeSessionSurface`
- Current situation: `/drive` has custom voice orb and controls.
- Affected routes/components: `/drive`, future voice/realtime routes.
- Problem: acceptable as a one-off now, but future realtime surfaces may duplicate state/error controls.
- Recommended canonical direction: define if a second realtime mode appears.
- Priority: low
- Dependency on screenshots/design decisions: screenshots useful but not urgent.

## 3. Inconsistent Existing Patterns

### Detail page inconsistency

- Current situation: organization detail is read-first; person detail is form-first; initiative detail is panel stack; task detail is metadata/notes/checklist stack.
- Affected routes/components: `/organizations/:id`, `/people/:id`, `/projects/:id`, `/tasks/:id`, `/categories/:name`
- Problem: users must relearn page anatomy by entity type.
- Recommended canonical direction: standardize identity, meaning/context, next action, relationships and metadata ordering.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed.

### List/create/search inconsistency

- Current situation: people/org lists have separate create and search panels; initiative subtype lists have top create form; tasks have only rows.
- Affected routes/components: `/people`, `/organizations`, `/ideas`, `/projects`, `/habits`, `/tasks`
- Problem: list pages do not share creation or scanning affordances.
- Recommended canonical direction: `EntityListPage` with optional create drawer/modal/inline row.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed.

### Description edit inconsistency

- Current situation: four long-text fields use at least three edit patterns.
- Affected routes/components: category, initiative, organization, task.
- Problem: equivalent interactions are unpredictable.
- Recommended canonical direction: `DescriptionBlock`.
- Priority: high
- Dependency on screenshots/design decisions: modal vs drawer decision needed.

### Relationship row inconsistency

- Current situation: relationship rows, task rows, member rows, participant rows and project structure cards differ.
- Affected routes/components: all relationship-heavy surfaces.
- Problem: linked objects are not immediately recognizable across routes.
- Recommended canonical direction: `RelationItem` with variants.
- Priority: high
- Dependency on screenshots/design decisions: screenshots needed.

### Modal inconsistency

- Current situation: modal families include `.compact-modal`, `.party-edit-modal`, `.markdown-modal`, `.planning-canvas-modal`, `.media-modal`.
- Affected routes/components: all modal surfaces.
- Problem: modal hierarchy and action placement can drift.
- Recommended canonical direction: modal intent variants with shared header/body/footer/error slots.
- Priority: high
- Dependency on screenshots/design decisions: screenshots required.

### State inconsistency

- Current situation: `EmptyState` doubles as loading/not-found; some components use muted text instead.
- Affected routes/components: all routes.
- Problem: states are not predictable.
- Recommended canonical direction: structured state components.
- Priority: high
- Dependency on screenshots/design decisions: screenshots useful.

## 4. One-Off UI Patterns That Should Be Eliminated

These are candidates for elimination or formalization. "Eliminate" means replace with a canonical pattern unless a deliberate exception is approved.

| One-off pattern | Current situation | Affected routes/components | Problem | Recommended canonical direction | Priority | Dependency |
|---|---|---|---|---|---|---|
| Route-specific detail headers | Separate header logic per entity | initiative, task, person, organization | inconsistent identity/action layout | `EntityHeader` | high | screenshots |
| Permanent list create forms | Create forms always visible | initiatives, people, organizations | creation competes with scanning | `CreateAction` + compact create flow | high | design decision |
| Person form-first detail | Master data form visible by default | `/people/:id` | CRUD feel | read-first summary + edit modal | high | screenshots |
| Four-column initiative relation editor | Display/edit mixed in one panel | `InitiativeRelationsPanel` | hard to scan relationships | `RelationList` + `RelationshipManager` | high | design decision |
| Task row class reused for parties | `.task-row` used for people/org rows | `/people`, `/organizations` | semantic/class leakage | `EntityRow` | medium | no |
| Description edit variants | inline/modal/button-panel variants | category/initiative/task/org | unpredictable editing | `DescriptionBlock` | high | design decision |
| Planning canvas modal family | own modal class system | planning canvas | modal drift | `EditModal`/canvas modal variant | medium | screenshots |
| Calendar Google event mega-modal | metadata/edit/link modes together | `/calendar` | high cognitive load | event inspector + progressive link flow | high | screenshots |
| Title-only EmptyState | one component for all states | all routes | weak state clarity | structured state components | high | design decision |
| Route-specific metadata blocks | local `dl`/rows/pre grids | task/media/prompt/config/calendar | no metadata hierarchy | `MetadataGrid` | high | screenshots |

## 5. Existing Components That Could Become Canonical

### `Panel`

- Current situation: generic wrapper used widely.
- Affected routes/components: many detail panels.
- Problem: too generic; lacks header/action/description slots.
- Recommended canonical direction: evolve into `SectionBlock` and `SectionHeader`.
- Priority: high
- Dependency: screenshots needed.

### `EmptyState`

- Current situation: title-only state display.
- Affected routes/components: many routes.
- Problem: insufficient for product-grade empty/loading/error states.
- Recommended canonical direction: upgrade into structured `EmptyState`; add `LoadingState` and `ErrorState`.
- Priority: high
- Dependency: design/copy decision.

### `ContactPointsPanel` and `ContactPointModal`

- Current situation: reused for people and organizations.
- Affected routes/components: party detail pages.
- Problem: nearly canonical but still locally named/styled and missing some expected actions.
- Recommended canonical direction: `ContactPointList` and `ContactPointEditor`.
- Priority: medium
- Dependency: screenshots.

### `AddressesPanel` and `AddressModal`

- Current situation: organization-only.
- Affected routes/components: organization detail.
- Problem: useful future canonical component if addresses become broader.
- Recommended canonical direction: `AddressBlock`, `AddressList`, `AddressEditor`.
- Priority: medium
- Dependency: product decision on person addresses.

### `TasksView`

- Current situation: used globally and embedded in initiative detail.
- Affected routes/components: `/tasks`, initiative detail.
- Problem: no built-in page state/filtering; row class is overused.
- Recommended canonical direction: split into `TaskList`, `TaskRow` and `EntityRow` primitives.
- Priority: high
- Dependency: screenshots.

### `RichText`

- Current situation: markdown-ish renderer used across descriptions and chat.
- Affected routes/components: descriptions, notes, chat.
- Problem: useful canonical text renderer but not tied to description/edit pattern.
- Recommended canonical direction: `RichText` inside `DescriptionBlock`/`NotesBlock`.
- Priority: medium
- Dependency: no.

### `AgentDrawer` / `ChatView`

- Current situation: strong local contextual drawer implementation.
- Affected routes/components: global shell.
- Problem: not documented as a pattern.
- Recommended canonical direction: `ContextPanel` / `AgentDrawer` pattern.
- Priority: medium
- Dependency: screenshots.

### Prompt components

- Current situation: `PromptSection`, `TurnTracePanel`, prompt list/detail.
- Affected routes/components: prompt debug routes.
- Problem: valuable debug pattern not documented.
- Recommended canonical direction: `PromptBlock`, `TraceTimeline`, `DebugInspectorPage`.
- Priority: low/medium
- Dependency: screenshots.

## 6. Proposed Shared Component Candidates

| Component candidate | Appears now | Why it should be shared | Routes that benefit | Priority |
|---|---|---|---|---|
| `PageShell` | global app shell | stabilize app layout and drawer/sidebar behavior | all routes | high |
| `PageHeader` | topbar and list headers | consistent titles/actions/subtitles | all list/utility routes | high |
| `EntityDetailPage` | detail route bodies | consistent entity anatomy | category, initiative, task, person, organization | high |
| `EntityHeader` | detail route headers | consistent identity/state/action layout | all detail routes | high |
| `EntityActionBar` | local header/panel actions | one primary action and secondary overflow | all detail/list routes | high |
| `SectionBlock` | `Panel` and route panels | standard section spacing/header/actions | all detail routes | high |
| `SectionHeader` | panel heading rows | consistent section title/action area | all panels | high |
| `DescriptionBlock` | markdown/notes panels | unified read/edit/empty pattern | category, initiative, task, organization | high |
| `MetadataGrid` | route-specific metadata | secondary/technical metadata separation | task, media, prompt, config, calendar | high |
| `EntityListPage` | list routes | consistent scan/filter/create states | people, organizations, tasks, initiatives | high |
| `EntityRow` | task/person/org/initiative rows | consistent row anatomy | all lists | high |
| `RelationList` | relationship panels | core DMAX relationship display | all detail routes | high |
| `RelationPicker` | inline select controls | consistent link-existing flow | participants, relations, members | high |
| `RelationshipManager` | relation editor panels | complex relation creation/editing | initiative, party, future context | high |
| `ContactPointList` | `ContactPointsPanel` | reused party contact surface | person, organization | medium |
| `AddressBlock` | `AddressesPanel` | human-readable addresses | organization, future person | medium |
| `EditModal` | many compact modals | consistent grouped editing | party/contact/address/project date/config | high |
| `EditDrawer` | not implemented yet | better for long/contextual edits | description, relationship manager, planning details | medium |
| `EmptyState` | existing title-only | consistent empty states | all routes | high |
| `LoadingState` | local loading text | distinguish loading from empty | all async routes | high |
| `ErrorState` | error banners/inline errors | consistent retry/recovery | all async routes | high |
| `SaveStateIndicator` | busy disables only | visible save/fail feedback | all edit flows | medium |
| `TimelineBlock` | timeline/canvas bars | shared time-span semantics | timeline, canvas, project detail | medium |
| `CalendarEventLinkBlock` | calendar/project Google bindings | shared calendar relation display | project detail, calendar, canvas | medium |
| `SyncStateBadge` | Google `G`, read-only labels | consistent sync state display | calendar, canvas, config, project detail | medium |
| `ContextPanel` | agent drawer | govern assistant/context side panels | global drawer, future context hub | medium |
| `PromptInspectorPanel` | prompt debug views | consistent debug surfaces | prompts, prompt templates | low |

## 7. Routes That Should Share The Same Pattern

### Entity detail pattern

- `/organizations/:id`
- `/people/:id`
- `/projects/:id`
- `/initiatives/:id`
- `/tasks/:id`
- `/categories/:name`

### Entity list pattern

- `/people`
- `/organizations`
- `/tasks`
- `/ideas`
- `/projects`
- `/habits`

### Description/context pattern

- `/organizations/:id` description
- `/projects/:id` initiative markdown
- `/tasks/:id` notes
- `/categories/:name` description
- future person context if data model supports it

### Relationship pattern

- `OrganizationMembersPanel`
- `PartyRelationshipsPanel`
- `PartyParticipationsPanel`
- `ParticipantsPanel`
- `InitiativeRelationsPanel`
- `ProjectStructureList`

### Time/calendar pattern

- `/calendar`
- `/calendar/timeline`
- `/planning-canvas`
- `ProjectDateCalendarModal`
- initiative/project header date pill

### Utility/debug pattern

- `/config`
- `/prompt-vorlagen`
- `/prompts`
- Google event dialogs
- media modal metadata/analysis surface

## 8. Pattern Decisions Needed Before Refactoring

1. Product language: German vs English.
2. Whether `Initiative` is user-facing or only internal.
3. Default entity detail ordering: context first, next action first, or relationship first by entity type.
4. Whether list page creation is always visible, expandable inline, modal, or drawer.
5. Whether long text editing uses modal, drawer or full-panel edit.
6. Whether relationship editing uses inline controls, modal or drawer.
7. Which metadata is normal user-facing vs technical/debug-only.
8. Whether Planning Canvas keeps a specialized component family or shares time/event primitives with Calendar first.
9. Whether people should eventually have a context/description field; no data model change is allowed in this phase.
10. Whether debug routes should remain visible in normal navigation or move behind a debug/developer grouping.

## 9. Recommended First Reference Implementation Route

Recommended route: `/organizations/:id`.

Why this route is a good first reference:

- It is entity-detail heavy but less specialized than Planning Canvas or Calendar.
- It already avoids the worst raw-form-first pattern by using a description panel and core-data modal.
- It contains multiple reusable relationship and contact/address patterns.
- It can become a bridge between context entities and planning entities.

Patterns it can establish:

- `EntityDetailPage`
- `EntityHeader`
- `DescriptionBlock`
- `SectionBlock`
- `ContactPointList`
- `AddressBlock`
- `RelationList`
- `RelationPicker`
- grouped-field `EditModal`
- `MetadataGrid`
- structured states

Other routes that can reuse the pattern:

- `/people/:id`
- `/projects/:id`
- `/initiatives/:id`
- `/tasks/:id`
- `/categories/:name`

Risks and complexities:

- Organization members are party relationships, not a simple owned subresource.
- Party participations and party relationships have different semantics but similar row shapes.
- Person detail currently lacks organization-style markdown/context memory.
- A reference implementation must avoid implying data-model changes.

Decisions needed before implementation:

- Which organization sections are primary vs secondary.
- Whether contact points and addresses remain equally prominent.
- How relationship add/edit flows should open.
- Whether title click remains edit entry or header gets explicit action.
- Whether metadata appears on the default page or only in a secondary section.

## 10. Suggested Migration Order

### Step 1: Organization detail reference pattern

- Establish `EntityDetailPage`, `EntityHeader`, `SectionBlock`, `DescriptionBlock`, contact/address display, relation display and state components.
- Do not generalize every component prematurely; document the pattern after implementation.

### Step 2: Person detail alignment

- Replace raw master-data-first layout with the new read-first entity detail structure.
- Reuse contact and relationship patterns from organization detail.

### Step 3: Initiative/project detail alignment

- Apply entity header, description block, relation list and metadata rules.
- Separate relation display from relation management.

### Step 4: Task detail alignment

- Apply entity header, notes/description block, checklist section, participants/media sections and metadata grid.

### Step 5: List page normalization

- Align `/people`, `/organizations`, `/tasks`, `/ideas`, `/projects`, `/habits` around `EntityListPage`.

### Step 6: Time surface normalization

- Share time/date/sync indicators across project detail, calendar, timeline and planning canvas.

### Step 7: Utility/debug pattern normalization

- Define stable settings/debug page patterns for config, prompts, prompt templates and technical metadata.

## Screenshots Needed For Pattern Decisions

Capture these before finalizing pattern decisions:

- `/organizations/:id`
- `/people/:id`
- `/projects/:id`
- `/tasks/:id`
- `/categories/:name`
- `/people`
- `/organizations`
- `/projects`
- `/calendar`
- `/planning-canvas`
- `/config`
- `/prompts`
- DMAX agent drawer open on an entity detail route
- Google event modal
- Media modal
