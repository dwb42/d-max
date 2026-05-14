# DMAX UI Debt Report

This report is the Phase 2 code-based UI debt analysis. It uses:

- `docs/ui/UI_ROUTE_INVENTORY.md`
- `docs/ui/UI_PRINCIPLES.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_COPY_LANGUAGE.md`
- `docs/ui/UI_INFORMATION_ARCHITECTURE.md`
- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`
- `web/src/App.tsx`
- `web/src/routes/CalendarRoute.tsx`

No screenshot-based visual audit has been performed yet. Items marked "screenshots needed: yes" should be visually confirmed in the next phase.

## 1. Executive Summary

DMAX has a strong domain model and many useful operational surfaces, but the UI currently reads as a collection of route-local implementations rather than one coherent product system.

The largest debt is systemic:

1. Entity detail pages do not share a canonical `EntityDetailPage` and `EntityHeader` pattern.
2. Person detail still defaults to a raw master-data form, while organization detail uses a read-first description pattern and modal core editing.
3. List pages use inconsistent create/search/list structures and sometimes reuse task row classes for non-task entities.
4. Relationship display is central to the product but appears through several unrelated implementations.
5. Metadata and technical/debug fields are mixed into normal surfaces without a shared `MetadataGrid` or debug-mode boundary.
6. Loading, empty, error and save states are inconsistent and often title-only.
7. Copy mixes German and English and uses multiple names for the same concepts.
8. Calendar, timeline and planning canvas have powerful interactions but use separate one-off time/event patterns.

The highest-leverage first reference implementation candidate is `/organizations/:id`. It already has a more read-first structure than `/people/:id`, includes description, contact points, addresses, members, relationships and DMAX contexts, and can establish reusable patterns for most entity detail pages.

## 2. Top 10 Highest-Impact UI Problems

### 1. Entity detail pages lack one canonical structure

- Route/view/component: `/projects/:id`, `/initiatives/:id`, `/tasks/:id`, `/people/:id`, `/organizations/:id`, `/categories/:name`
- Severity: high
- Type of issue: layout inconsistency, component duplication, weak visual hierarchy
- Problem: each detail route defines its own header, body ordering, section wrappers, editing controls and metadata placement.
- Why it matters: the user must relearn each entity page, and future UI work will continue to create local solutions.
- Recommended direction: define `EntityDetailPage`, `EntityHeader`, `SectionBlock`, `DescriptionBlock`, `RelationList` and `MetadataGrid` reference patterns.
- Scope: systemic
- Screenshots needed: yes

### 2. Person detail opens as a raw master-data form

- Route/view/component: `/people/:id`, `PersonDetailView`
- Severity: high
- Type of issue: editing pattern problem, information overload
- Problem: the first column begins with a permanent editable `Stammdaten` form.
- Why it matters: it makes the detail page feel like admin CRUD instead of a memory/context page for a person.
- Recommended direction: default to read-first identity/context/contact summary; move grouped profile editing into a modal or section-level edit mode.
- Scope: local with systemic implications for entity details
- Screenshots needed: yes

### 3. Relationship displays are fragmented

- Route/view/component: `InitiativeRelationsPanel`, `ParticipantsPanel`, `PartyRelationshipsPanel`, `PartyParticipationsPanel`, `OrganizationMembersPanel`, `ProjectStructureList`, calendar/planning relationships
- Severity: high
- Type of issue: relationship display problem, component duplication
- Problem: linked objects use different row shapes, labels, actions, empty states and direction display.
- Why it matters: relationships are core DMAX value; inconsistent displays make the graph hard to scan and reason about.
- Recommended direction: introduce `RelationList`, `RelationGroup`, `RelationItem`, `RelationPicker` and `RelationshipManager` patterns.
- Scope: systemic
- Screenshots needed: yes

### 4. Editing patterns differ for equivalent content

- Route/view/component: category description, initiative markdown, organization description, task notes, person master data, organization core data
- Severity: high
- Type of issue: editing pattern problem
- Problem: similar markdown/profile fields use inline panel editing, modal editing, title-triggered editing and permanent forms.
- Why it matters: users cannot predict how editing works, and implementation complexity grows route by route.
- Recommended direction: define a description/context pattern and grouped-field `EditModal`/`EditDrawer` rules.
- Scope: systemic
- Screenshots needed: yes

### 5. No shared metadata pattern

- Route/view/component: task detail `dl`, media modal metadata, prompt inspector metadata, config source rows, calendar Google event metadata
- Severity: high
- Type of issue: metadata exposure, component duplication
- Problem: secondary and technical information is displayed through route-specific structures.
- Why it matters: metadata competes with primary work on some screens and is absent or inconsistent on others.
- Recommended direction: introduce `MetadataGrid` with levels: primary facts, secondary metadata, technical/debug metadata.
- Scope: systemic
- Screenshots needed: yes

### 6. List pages do not share a canonical list/create/search pattern

- Route/view/component: `/ideas`, `/projects`, `/habits`, `/tasks`, `/people`, `/organizations`
- Severity: high
- Type of issue: layout inconsistency, component duplication
- Problem: initiative lists use a top create form and category sections; people/org lists use stacked create/search/list panels; tasks use only rows and no empty state.
- Why it matters: frequent scanning and creation workflows feel inconsistent.
- Recommended direction: define `EntityListPage`, `ListToolbar`, `CreateInline`, `SearchFilterRow` and `EntityRow`.
- Scope: systemic
- Screenshots needed: yes

### 7. State handling is inconsistent and often too thin

- Route/view/component: `EmptyState`, `TasksView`, `PeopleView`, `OrganizationsView`, prompt views, planning canvas, timeline
- Severity: high
- Type of issue: missing state handling
- Problem: `EmptyState` is title-only and is used for loading, empty and not-found states. Some routes have no empty/loading/error distinction.
- Why it matters: users cannot reliably tell whether data is missing, loading, failed or filtered out.
- Recommended direction: introduce `EmptyState`, `LoadingState`, `ErrorState`, `SaveStateIndicator` with consistent title/body/action behavior.
- Scope: systemic
- Screenshots needed: no for code confirmation, yes for visual calibration

### 8. Copy language mixes German, English and internal terms

- Route/view/component: global nav, headers, task/project/initiative labels, prompt/config/calendar surfaces
- Severity: medium
- Type of issue: copy inconsistency
- Problem: labels mix `Projects`, `Initiatives`, `Massnahmen`, `Tasks`, `Relations`, `Prompt-Vorlagen`, `Drive Mode`, `Config`, `Stammdaten`.
- Why it matters: the product language is not stable, which weakens user orientation and future component naming.
- Recommended direction: decide one app language and canonical labels before refactoring. If German wins, update `UI_COPY_LANGUAGE.md` globally.
- Scope: systemic
- Screenshots needed: no

### 9. Calendar, timeline and planning canvas duplicate time/event concepts

- Route/view/component: `/calendar`, `/calendar/timeline`, `/planning-canvas`, project date modal
- Severity: medium
- Type of issue: layout inconsistency, relationship display problem
- Problem: project spans, locked/flexible dates, Google events and user-created time blocks are rendered with separate route-specific components.
- Why it matters: time is a central planning dimension and should teach one visual language across routes.
- Recommended direction: define `TimeBlock`, `DateRangeDisplay`, `CalendarEventLinkBlock`, `SyncStateBadge` and `LockIndicator`.
- Scope: systemic
- Screenshots needed: yes

### 10. Debug and configuration surfaces expose technical density without containment rules

- Route/view/component: `/prompts`, `/prompt-vorlagen`, `/config`, Google event dialogs, media modal
- Severity: medium
- Type of issue: information overload, metadata exposure
- Problem: debug/config screens show dense technical data, IDs, trace timings, calendar IDs and prompt blocks with route-specific layouts.
- Why it matters: these surfaces are useful, but they need a deliberate utility/debug pattern so they do not influence normal product UI.
- Recommended direction: define `UtilityPage`, `DebugInspector`, `TechnicalMetadataPanel` and clear debug-only boundaries.
- Scope: systemic
- Screenshots needed: yes

## 3. Route-by-Route UI Debt

### App shell, sidebar and header

- Route/view/component: global `App`, sidebar, `renderContentHeader`
- Severity: high
- Type of issue: layout inconsistency
- Problem: route titles, detail headers, back actions and calendar controls are assembled through branching logic rather than canonical header components.
- Why it matters: every new route can drift in title hierarchy and action placement.
- Recommended direction: create `PageShell`, `PageHeader`, `EntityHeader` and `HeaderActionSlot`.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: sidebar navigation
- Severity: medium
- Type of issue: copy inconsistency
- Problem: nav labels mix German and English: `Lebensbereiche`, `Ideen`, `Projekte`, `Massnahmen`, `Planning Canvas`, `Config`, `Drive`.
- Why it matters: navigation sets the product vocabulary.
- Recommended direction: choose canonical app language and route labels.
- Scope: systemic
- Screenshots needed: no

### DMAX chat drawer

- Route/view/component: `AgentDrawer`, `ChatView`
- Severity: medium
- Type of issue: component duplication, missing pattern
- Problem: contextual chat is a substantial drawer pattern but is not documented as a canonical `ContextPanel`/`AgentDrawer` pattern.
- Why it matters: future contextual panels or assistant surfaces could diverge.
- Recommended direction: document `ContextPanel` with header, history switcher, thread, composer, activity trail and resize behavior.
- Scope: systemic
- Screenshots needed: yes

### `/categories` and `/categories/:name`

- Route/view/component: `LifeAreasView`, `LifeAreaDetailView`
- Severity: medium
- Type of issue: layout inconsistency
- Problem: category overview uses a custom dashboard-like section grid, while category detail uses an initiative-detail-like class and inline markdown editing.
- Why it matters: category pages should be the mental entry point for the system, but their pattern is separate from both list and detail pages.
- Recommended direction: define `CategoryOverviewPage` and `CategoryDetailPage` as explicit variants, or align category detail with `EntityDetailPage`.
- Scope: local with reusable pattern implications
- Screenshots needed: yes

- Route/view/component: category description edit
- Severity: medium
- Type of issue: editing pattern problem
- Problem: description editing is inline full-panel, while organization description uses modal and initiative markdown uses button-panel edit.
- Why it matters: the same kind of content behaves differently across entities.
- Recommended direction: use a shared `DescriptionBlock` with modal or drawer editing.
- Scope: systemic
- Screenshots needed: no

### `/ideas`, `/projects`, `/habits`

- Route/view/component: `InitiativesView`
- Severity: high
- Type of issue: layout inconsistency, information overload
- Problem: an always-visible create form competes with the list content on collection pages.
- Why it matters: collection pages are primarily for scanning; create should be available but not dominate every visit.
- Recommended direction: convert create into a stable primary action that opens inline create, modal or compact create row depending on route.
- Scope: systemic for list pages
- Screenshots needed: yes

- Route/view/component: `ProjectStructureList`
- Severity: medium
- Type of issue: relationship display problem
- Problem: project hierarchy and dependencies are encoded in a specialized list layout with no shared relationship row pattern.
- Why it matters: this is useful relationship data but may be hard to scan without a canonical hierarchy/dependency vocabulary.
- Recommended direction: define `ProjectStructureList` as a candidate canonical relation view or replace with `RelationGroup` variants.
- Scope: local/systemic
- Screenshots needed: yes

### `/projects/:id`, `/initiatives/:id`

- Route/view/component: `InitiativeDetailHeader`
- Severity: high
- Type of issue: weak visual hierarchy, editing pattern problem
- Problem: title, type, status, phase, date range, lock state, Google binding and error can all occupy the same header line.
- Why it matters: primary identity competes with editable metadata and sync state.
- Recommended direction: split identity, state summary and secondary controls inside `EntityHeader`.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: `InitiativeDetailView`
- Severity: high
- Type of issue: information overload
- Problem: markdown, media, participants, tasks and relations are all visible as stacked panels.
- Why it matters: the likely next action is not always obvious; attachments or relation controls can compete with project purpose and tasks.
- Recommended direction: establish object-specific priority ordering and collapse secondary sections by default when not immediately relevant.
- Scope: local/systemic
- Screenshots needed: yes

- Route/view/component: `InitiativeRelationsPanel`
- Severity: high
- Type of issue: relationship display problem, editing pattern problem
- Problem: relation display and relation creation are mixed in one large four-column `<details>` panel.
- Why it matters: reading relationships and editing relationships are different tasks.
- Recommended direction: display a compact grouped `RelationList`; move complex editing into `RelationshipManager` drawer/modal.
- Scope: systemic
- Screenshots needed: yes

### `/tasks` and `/tasks/:id`

- Route/view/component: `/tasks`, `TasksView`
- Severity: high
- Type of issue: missing state handling, layout inconsistency
- Problem: global task list has no explicit empty state and no page-level search/filter/create structure.
- Why it matters: tasks are a daily operational route; blank or undifferentiated task lists reduce trust.
- Recommended direction: use `EntityListPage` with task filters, grouped rows and explicit empty/loading/error states.
- Scope: local/systemic list pattern
- Screenshots needed: yes

- Route/view/component: `TaskDetailView`
- Severity: medium
- Type of issue: weak visual hierarchy
- Problem: due date metadata panel appears before task notes/checklist, while next action/checklist may be more important.
- Why it matters: the task detail should focus on doing or clarifying the task, not only metadata.
- Recommended direction: define task detail ordering: identity/status, action notes, checklist/next steps, people, media, metadata.
- Scope: local
- Screenshots needed: yes

- Route/view/component: `TaskNotesPanel`
- Severity: medium
- Type of issue: missing state handling
- Problem: empty notes render as an empty button-like panel.
- Why it matters: a blank click target is unclear.
- Recommended direction: use `DescriptionBlock`/`NotesBlock` empty state with `Add notes`.
- Scope: local/systemic markdown pattern
- Screenshots needed: yes

### `/people` and `/organizations`

- Route/view/component: `PeopleView`, `OrganizationsView`
- Severity: high
- Type of issue: layout inconsistency, editing pattern problem
- Problem: create forms are always visible before search and list.
- Why it matters: the primary job of a list page is scanning and finding; creation should not be the first visual block every time.
- Recommended direction: use `EntityListPage` with `PageHeader` primary action and collapsible/inline create affordance.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: people/organization rows
- Severity: medium
- Type of issue: component duplication
- Problem: list rows reuse `.task-list` and `.task-row` classes.
- Why it matters: implementation names and visual assumptions from tasks bleed into party lists.
- Recommended direction: create `EntityList`, `EntityRow` and type-specific row content.
- Scope: systemic
- Screenshots needed: no

### `/people/:id`

- Route/view/component: `PersonDetailView`
- Severity: high
- Type of issue: raw form-first detail page
- Problem: `Stammdaten` visible form dominates the first detail pane.
- Why it matters: person pages should prioritize context, relationships and contactability, not profile maintenance.
- Recommended direction: read-first `PersonSummary`/`PersonContext` with `Edit person` modal.
- Scope: local/systemic
- Screenshots needed: yes

- Route/view/component: `PartyRelationshipsPanel`, `PartyParticipationsPanel`
- Severity: medium
- Type of issue: relationship display problem
- Problem: relationships and DMAX contexts are separate panels but visually similar row lists without a higher-level relationship summary.
- Why it matters: a person page should quickly answer "why does this person matter?"
- Recommended direction: group relationships by semantic type and surface most relevant linked objects first.
- Scope: systemic
- Screenshots needed: yes

### `/organizations/:id`

- Route/view/component: `OrganizationDetailView`
- Severity: medium
- Type of issue: layout inconsistency
- Problem: organization detail has a stronger read-first structure than person detail, but still uses route-specific panels and ordering.
- Why it matters: this is close to a reusable entity detail pattern but not yet codified.
- Recommended direction: use as first reference implementation candidate for `EntityDetailPage`.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: `OrganizationMembersPanel`
- Severity: medium
- Type of issue: relationship display problem, editing pattern problem
- Problem: member display and add-member form share the same panel and relationship type select is exposed inline.
- Why it matters: adding a relationship is a heavier action than scanning members.
- Recommended direction: display member list by default; move add/link member into `RelationshipManager` or `RelationPicker` modal/drawer.
- Scope: local/systemic
- Screenshots needed: yes

### `/calendar`

- Route/view/component: `CalendarRoute`
- Severity: medium
- Type of issue: visual hierarchy, information overload
- Problem: sidebar project palette, all-day lanes, timed grid, warnings, loading overlay and event-level actions can all compete.
- Why it matters: calendar planning requires fast spatial understanding.
- Recommended direction: define calendar hierarchy rules for fixed commitments, flexible planning, tasks and Google states.
- Scope: local/systemic time pattern
- Screenshots needed: yes

- Route/view/component: `GoogleEventDialog`
- Severity: high
- Type of issue: information overload, editing pattern problem
- Problem: event metadata, edit fields and multiple link/promote modes can appear in one modal.
- Why it matters: the user must decide among several structurally different actions in a constrained modal.
- Recommended direction: use progressive disclosure with a read summary, primary edit action and separate link/promote flow.
- Scope: local/systemic calendar pattern
- Screenshots needed: yes

### `/calendar/timeline`

- Route/view/component: `TimelineView`
- Severity: medium
- Type of issue: one-off time pattern
- Problem: timeline bars are separate from planning canvas and calendar time/block vocabulary.
- Why it matters: similar project-span concepts should use the same visual grammar.
- Recommended direction: define `TimelineBlock`/`ProjectTimeSpan` shared rules.
- Scope: systemic
- Screenshots needed: yes

### `/planning-canvas`

- Route/view/component: `PlanningCanvasView`
- Severity: high
- Type of issue: power-user workflow, information overload
- Problem: parking, filters, zoom, hidden Google events, Google rows, project bars, relation handles and SVG edges form a dense custom workspace.
- Why it matters: this route is powerful but can become visually noisy and hard to learn.
- Recommended direction: keep the canvas specialized, but extract canonical time state, relation edge, hidden event and inspector/edit modal patterns.
- Scope: local/systemic time and relation patterns
- Screenshots needed: yes

- Route/view/component: planning canvas modals
- Severity: medium
- Type of issue: component duplication
- Problem: planning canvas uses its own modal classes separate from compact modals elsewhere.
- Why it matters: modal behavior and footer action hierarchy can drift.
- Recommended direction: define modal size/intent variants: compact edit, canvas edit, confirmation, inspector.
- Scope: systemic
- Screenshots needed: yes

### `/config`

- Route/view/component: `ConfigView`
- Severity: medium
- Type of issue: metadata exposure, information overload
- Problem: account labels, calendar IDs, access roles, source IDs and read/write flags are densely exposed.
- Why it matters: this is a utility screen, but it still needs hierarchy between operational actions and technical identifiers.
- Recommended direction: define `SettingsPage`, `IntegrationCard`, `TechnicalMetadata` and use collapsed technical details for IDs.
- Scope: local/systemic utility pattern
- Screenshots needed: yes

### `/prompt-vorlagen` and `/prompts`

- Route/view/component: prompt views
- Severity: medium
- Type of issue: debug information exposure, component duplication
- Problem: prompt templates and prompt logs use debug-specific panels and pre blocks but no documented debug inspector pattern.
- Why it matters: debug routes should be intentionally dense without leaking their style into product routes.
- Recommended direction: define `DebugInspectorPage`, `PromptInspectorPanel`, `PromptBlock`, `TraceTimeline`.
- Scope: systemic debug/utility pattern
- Screenshots needed: yes

### `/drive`

- Route/view/component: `DriveView`
- Severity: low
- Type of issue: one-off utility surface
- Problem: Drive Mode is visually specialized and disconnected from other route patterns.
- Why it matters: acceptable for a specialized voice mode, but future voice states need consistent unavailable/error/active semantics.
- Recommended direction: define a small `RealtimeSessionSurface` pattern if more realtime modes are added.
- Scope: local
- Screenshots needed: yes

## 4. Cross-Cutting Systemic UI Debt

| ID | Route/view/component | Problem | Severity | Type | Why it matters | Recommended direction | Scope | Screenshots needed |
|---|---|---|---|---|---|---|---|---|
| UI-DEBT-001 | Entity detail routes | No shared detail page shell/header/body order | high | layout inconsistency | Entity pages feel locally composed | `EntityDetailPage` + `EntityHeader` | systemic | yes |
| UI-DEBT-002 | List routes | Create/search/list patterns differ | high | layout inconsistency | Frequent scanning workflows are inconsistent | `EntityListPage` + `ListToolbar` | systemic | yes |
| UI-DEBT-003 | Relationship panels | Relationship rows/actions differ by route | high | relationship display problem | DMAX graph is harder to understand | `RelationList`, `RelationPicker`, `RelationshipManager` | systemic | yes |
| UI-DEBT-004 | Description/markdown fields | Same content type edits differently | high | editing pattern problem | Editing is unpredictable | `DescriptionBlock` + edit modal/drawer rules | systemic | yes |
| UI-DEBT-005 | Metadata | No metadata hierarchy or grid | high | metadata exposure | Secondary facts compete with primary work | `MetadataGrid` and technical metadata rules | systemic | yes |
| UI-DEBT-006 | State components | Empty/loading/error states inconsistent | high | missing state handling | Users cannot tell blank vs loading vs failed | `EmptyState`, `LoadingState`, `ErrorState` | systemic | yes |
| UI-DEBT-007 | Copy | Mixed language and entity labels | medium | copy inconsistency | Product vocabulary is unstable | decide language and canonical terms | systemic | no |
| UI-DEBT-008 | Time surfaces | Calendar/timeline/canvas use separate time grammar | medium | component duplication | Date/time planning feels fragmented | shared time/event components | systemic | yes |
| UI-DEBT-009 | Modals | Multiple modal families and action layouts | medium | component duplication | Modal behavior can drift | `EditModal`, `ConfirmModal`, `InspectorModal` | systemic | yes |
| UI-DEBT-010 | Debug/utility pages | Technical density lacks containment | medium | metadata exposure | Debug visual language may bleed into product UI | debug/utility page pattern | systemic | yes |

## 5. Visual Hierarchy Problems

- Route/view/component: initiative detail header
- Severity: high
- Type of issue: weak visual hierarchy
- Problem: title, type, status, phase, date range, lock and sync state sit together.
- Why it matters: identity and state are both important, but editable controls should not flatten the hierarchy.
- Recommended direction: keep title dominant, summarize state, move secondary edit controls into a consistent action area or popover.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: person detail
- Severity: high
- Type of issue: weak visual hierarchy
- Problem: editable master-data fields dominate before context and relationships.
- Why it matters: the primary object is a person in context, not a data record.
- Recommended direction: read-first identity/context/contact summary.
- Scope: local/systemic
- Screenshots needed: yes

- Route/view/component: calendar and planning canvas
- Severity: medium
- Type of issue: visual hierarchy
- Problem: many interactive elements can be visible simultaneously.
- Why it matters: planning requires fast visual parsing.
- Recommended direction: establish time surface layering rules and de-emphasize secondary handles until hover/focus where appropriate.
- Scope: systemic
- Screenshots needed: yes

## 6. Information Overload Problems

- Route/view/component: initiative detail
- Severity: high
- Type of issue: information overload
- Problem: all major panels are visible in a single stack.
- Recommended information treatment: keep description/current work visible; convert media/participants/relations into summaries or collapsible sections when not primary.
- Scope: local/systemic
- Screenshots needed: yes

- Route/view/component: Google event dialog
- Severity: high
- Type of issue: information overload
- Problem: metadata, editing and link/promote actions share one modal.
- Recommended information treatment: keep event summary visible; collapse metadata; move link/promote into a guided secondary flow.
- Scope: local/systemic
- Screenshots needed: yes

- Route/view/component: config
- Severity: medium
- Type of issue: metadata exposure
- Problem: calendar IDs and access roles are shown in primary rows.
- Recommended information treatment: keep account/source names visible; move IDs into technical metadata expansion.
- Scope: local/systemic
- Screenshots needed: yes

## 7. Editing Pattern Problems

| Route/view/component | Problem | Severity | Preferred future editing pattern | Scope | Screenshots needed |
|---|---|---|---|---|---|
| `PersonDetailView` | Default detail is raw master-data form | high | modal edit or section-level read-first edit | local/systemic | yes |
| `OrganizationCoreModal` vs person form | Same kind of profile basics use different patterns | high | shared grouped-field `EditModal` | systemic | yes |
| `InitiativeMarkdownPanel`, `TaskNotesPanel`, `LifeAreaDetailView`, `OrganizationDescriptionPanel` | Description/note editing differs across routes | high | `DescriptionBlock` with modal/drawer/full editor rule | systemic | yes |
| `InitiativeRelationsPanel` | Display and complex editing combined | high | read `RelationList`, edit in `RelationshipManager` | systemic | yes |
| `PeopleView`/`OrganizationsView` create forms | Creation permanently visible on list pages | medium | primary create action opening compact create row/modal | systemic | yes |
| Calendar/planning Google event edits | Multiple action modes in one modal | high | guided modal/drawer flow with progressive disclosure | local/systemic | yes |

## 8. Terminology / Copy Problems

- Route/view/component: global app
- Severity: medium
- Type of issue: copy inconsistency
- Problem: UI mixes German and English.
- Why it matters: DMAX cannot enforce consistent route/component patterns while vocabulary is unstable.
- Recommended direction: decide whether product UI is German or English. Current live UI appears mostly German with English technical islands; docs currently prefer English unless product switches.
- Scope: systemic
- Screenshots needed: no

- Route/view/component: initiatives/projects/tasks
- Severity: high
- Type of issue: copy inconsistency
- Problem: `Initiative`, `Projekt`, `Project`, `Task`, `Massnahme`, `Relations` coexist.
- Why it matters: these are core concepts.
- Recommended direction: define canonical German or English labels for Initiative umbrella, Project, Task and Relationship.
- Scope: systemic
- Screenshots needed: no

- Route/view/component: contact/address panels
- Severity: medium
- Type of issue: copy inconsistency
- Problem: docs say Contact Point/Address; UI uses `Kontaktwege`, `Postanschriften`, `Anschrift`, `Kontaktweg`.
- Why it matters: not wrong if German is chosen, but must be documented.
- Recommended direction: update copy rules after language decision.
- Scope: systemic
- Screenshots needed: no

## 9. Relationship Display Problems

- Route/view/component: initiative relations
- Severity: high
- Type of issue: relationship display problem
- Problem: parent/children/predecessors/successors use a custom grid with inline creation.
- Why it matters: direction matters, but dense edit controls can hide the actual relationship meaning.
- Recommended direction: read-first grouped relation sections with action-specific controls.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: party relationships and participations
- Severity: medium
- Type of issue: relationship display problem
- Problem: people/org relationships and DMAX contexts are separate but visually similar lists.
- Why it matters: semantic relationships and participation links have different meanings.
- Recommended direction: use relation type badges and group by object/relationship type.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: calendar/planning time relationships
- Severity: medium
- Type of issue: relationship display problem
- Problem: project-date, calendar-entry and Google binding relationships are displayed differently across surfaces.
- Why it matters: sync and commitment state are core planning information.
- Recommended direction: shared `CalendarEventLinkBlock` and `SyncStateBadge`.
- Scope: systemic
- Screenshots needed: yes

## 10. Metadata Display Problems

- Route/view/component: task detail, media modal, prompt inspector, config, Google event dialogs
- Severity: high
- Type of issue: metadata exposure
- Problem: metadata uses route-local `dl`, grids, row text and preformatted blocks.
- Why it matters: users need consistent separation between primary content, secondary facts and technical details.
- Recommended direction: create `MetadataGrid` plus `TechnicalMetadataDisclosure`.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: prompt inspector and config
- Severity: medium
- Type of issue: debug metadata exposure
- Problem: trace timing, IDs, source IDs and technical fields are primary content.
- Why it matters: acceptable for debug/config, but needs explicit debug/utility styling boundary.
- Recommended direction: define debug/utility page pattern.
- Scope: systemic
- Screenshots needed: yes

## 11. State Handling Problems

| Route/view/component | Problem | Severity | Recommended direction | Scope | Screenshots needed |
|---|---|---|---|---|---|
| `EmptyState` | Title-only; used for loading, missing and empty | high | structured `EmptyState`, `LoadingState`, `ErrorState` | systemic | yes |
| `/tasks` | No empty state for global task list | high | page empty state with next action/filter reset | local | no |
| `PeopleView`, `OrganizationsView` | null loading is passed as empty array | high | distinguish loading from no results | local/systemic | no |
| prompt views | no loading state while fetch is pending | medium | utility loading state | local/systemic | no |
| planning canvas | no clear initial loading state | medium | canvas skeleton/loading overlay | local | yes |
| save flows | many edits disable controls but show no save/failure state | high | `SaveStateIndicator` and inline form errors | systemic | yes |

## 12. Power-User Workflow Problems

- Route/view/component: collection list pages
- Severity: high
- Type of issue: power-user workflow
- Problem: frequent scanning routes start with creation forms rather than dense search/filter/list controls.
- Why it matters: a power user returns to inspect and act more often than to create.
- Recommended direction: prioritize scan/filter/list; keep create one click away.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: relationship management
- Severity: high
- Type of issue: power-user workflow
- Problem: relationship editing requires interacting with local controls that differ by route.
- Why it matters: relationship work is frequent and conceptually central.
- Recommended direction: shared relation picker/manager with keyboard-friendly search.
- Scope: systemic
- Screenshots needed: yes

- Route/view/component: planning canvas and calendar
- Severity: medium
- Type of issue: power-user workflow
- Problem: many controls are mouse/drag heavy; keyboard affordances are not evident from code except some button/focus handling.
- Why it matters: power-user workflows benefit from quick keyboard paths and predictable commands.
- Recommended direction: later define keyboard and command affordances for high-frequency planning actions.
- Scope: systemic
- Screenshots needed: yes

## 13. Prioritized Recommendations

### P0: Establish Detail Page Reference

Use `/organizations/:id` as first reference implementation candidate.

Define:

- `EntityDetailPage`
- `EntityHeader`
- `DescriptionBlock`
- `SectionBlock`
- `RelationList`
- `ContactPointList`
- `AddressBlock`
- `MetadataGrid`
- `EditModal`

### P1: Normalize List Pages

Align `/people`, `/organizations`, `/ideas`, `/projects`, `/habits` and `/tasks` around:

- `EntityListPage`
- `PageHeader`
- `SearchFilterRow`
- `EntityRow`
- `CreateAction`
- structured empty/loading/error states

### P2: Normalize Relationship UI

Create a relation vocabulary before refactoring:

- participant vs party relationship vs hierarchy vs dependency vs calendar binding
- read view vs edit flow
- direction labels and relationship type badges

### P3: Normalize Description / Notes Editing

Use one rule set for:

- category description
- initiative markdown
- task notes
- organization description
- future person context

### P4: Normalize Time / Calendar UI

Align project spans, calendar events, Google events, lock state and sync state across:

- project detail
- calendar
- timeline
- planning canvas

### P5: Normalize Debug / Utility Surfaces

Create debug and settings page patterns so prompt/config density is intentional and isolated.

## 14. Open Questions

1. Should the DMAX product UI be German or English? The docs currently prefer English unless the product switches, but the app is mostly German.
2. Should `Initiative` remain visible as a user-facing umbrella term, or should users primarily see `Project`, `Idea`, `Habit` and `Task`?
3. Should person detail eventually include durable person context/description, or should it stay structured-data-only until the data model changes?
4. Should create forms be visible by default on list pages, or should creation move behind a primary action?
5. Which relationship types are most important for first-class display: participants, party relationships, hierarchy, dependency, calendar binding or all of them?
6. Should Planning Canvas remain a specialized power-user workspace with its own component family, or should some visual language be shared with Calendar/Timeline first?
7. What debug information should be visible in normal product routes versus debug-only routes?

## Recommended First Reference Implementation Route

Recommended route: `/organizations/:id`.

Why this route is a good first reference:

- It already has a read-first description area rather than a permanent raw form.
- It includes several core DMAX entity-detail concepts: identity, description, contact points, addresses, members, relationships and linked DMAX contexts.
- It can establish patterns that apply to both context objects and planning objects.

Patterns it can establish:

- `EntityDetailPage`
- `EntityHeader`
- `DescriptionBlock`
- `SectionBlock`
- `ContactPointList`
- `AddressBlock`
- `RelationList`
- `MetadataGrid`
- grouped-field `EditModal`
- structured empty/loading/error states

Routes that can later reuse the pattern:

- `/people/:id`
- `/projects/:id` and `/initiatives/:id`
- `/tasks/:id`
- `/categories/:name`
- future calendar event/time block detail surfaces

Risks or complexities:

- Organization detail currently has organization-specific member logic.
- Person detail lacks equivalent markdown/context memory in the data model.
- Relationship display spans both party relationships and DMAX participations.
- Changing this route first must not imply a data model change.

Decisions needed before implementation:

- Product language: German vs English.
- Canonical entity header contents and action placement.
- Whether contact points and addresses are equally prominent or one is secondary.
- Whether relationship editing happens inline, in modal or in drawer.
- How much metadata belongs on the default detail page.

## Screenshots Needed For Next Phase

Capture desktop screenshots first, then narrow-width screenshots for responsive checks:

- `/organizations/:id`
- `/people/:id`
- `/projects/:id` or `/initiatives/:id`
- `/tasks/:id`
- `/categories/:name`
- `/people`
- `/organizations`
- `/projects`
- `/tasks`
- `/calendar`
- `/planning-canvas`
- `/config`
- `/prompts`
- open DMAX agent drawer on an entity detail route
- open `GoogleEventDialog`
- open `ProjectDateCalendarModal`
- open `MediaModal`
