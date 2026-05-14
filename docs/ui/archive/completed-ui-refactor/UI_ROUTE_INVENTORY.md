# DMAX UI Route Inventory

This document is a factual inventory of the current frontend UI as of Phase 1 of UI stabilization.

Scope inspected:

- `web/src/App.tsx`
- `web/src/routes/CalendarRoute.tsx`
- `web/src/styles.css` at a structural level only
- `web/src/api.ts` and `web/src/types.ts` only where needed to understand UI data surfaces

This inventory does not make redesign decisions. It records current routes, page/view structures, editing patterns, relationship patterns, metadata patterns, action placement, state handling and route-specific UI implementations visible in code.

## Current Frontend Shape

The frontend app lives under `web/src`.

Important files:

- `web/src/App.tsx`: main app shell, route parsing, most page/view components, contextual chat drawer, planning canvas, timeline, config, list/detail surfaces, party/contact/address/media/prompt components.
- `web/src/routes/CalendarRoute.tsx`: lazy-loaded calendar planner route and Google Calendar event dialogs.
- `web/src/styles.css`: global CSS class system for the shell, panels, routes, modals and route-specific components.

The app uses a lightweight internal router based on `window.location.pathname` and `history.pushState`, not React Router.

## Route Map

| Route/path | Current view | Primary purpose | Primary entity | Surface type | Main components |
|---|---|---|---|---|---|
| `/`, `/chat` | `lifeAreas` | Default entry to category/life-area overview | Category / initiative groups | List/dashboard-like overview | `App`, `LifeAreasView`, `LifeAreaInitiativeGroups` |
| `/categories`, `/lebensbereiche` | `lifeAreas` | Life area overview grouped by category and initiative type | Category | List/dashboard-like overview | `LifeAreasView`, `LifeAreaInitiativeGroups`, `EmptyState` |
| `/categories/:name`, `/lebensbereiche/:name` | `lifeArea` | Category detail with description and grouped initiatives | Category | Detail page | `LifeAreaDetailView`, `LifeAreaInitiativeGroups`, `RichText`, `EmptyState` |
| `/ideas` | `ideas` | Idea collection grouped by category | Initiative with `type=idea` | List page + inline create | `InitiativesView`, `InitiativeTypeBadge`, `EmptyState` |
| `/ideas/:categoryName` | `ideas` with category filter | Idea collection filtered to one category | Initiative with `type=idea` | Filtered list page | `InitiativesView` |
| `/projects` | `projects` | Project collection grouped by category and hierarchy/relation rows | Initiative with `type=project` | List/structure page + inline create | `InitiativesView`, `ProjectStructureList`, `ProjectStructureCard` |
| `/projects/:categoryName` | `projects` with category filter | Project collection filtered to one category | Initiative with `type=project` | Filtered list/structure page | `InitiativesView`, `ProjectStructureList` |
| `/projects/:id`, `/initiatives/:id` | `initiative` | Initiative/project/idea/habit detail | Initiative | Detail page | `InitiativeDetailHeader`, `InitiativeDetailView`, `InitiativeMarkdownPanel`, `MediaAttachmentsPanel`, `ParticipantsPanel`, `TasksView`, `InitiativeRelationsPanel` |
| `/habits` | `habits` | Habit collection grouped by category | Initiative with `type=habit` | List page + inline create | `InitiativesView`, `InitiativeTypeBadge`, `EmptyState` |
| `/habits/:categoryName` | `habits` with category filter | Habit collection filtered to one category | Initiative with `type=habit` | Filtered list page | `InitiativesView` |
| `/tasks` | `tasks` | Task list | Task | List page | `TasksView` |
| `/tasks/:id` | `task` | Task detail | Task | Detail page | `TaskDetailHeader`, `TaskDetailView`, `TaskDueDateEditor`, `TaskNotesPanel`, `MediaAttachmentsPanel`, `ParticipantsPanel`, `TaskChecklistPanel` |
| `/people` | `people` | Person list/search/create | Person | List page + create form | `PeopleView` |
| `/people/:id` | `person` | Person detail | Person | Detail page | `PersonDetailView`, `ContactPointsPanel`, `PartyRelationshipsPanel`, `PartyParticipationsPanel` |
| `/organizations` | `organizations` | Organization list/search/create | Organization | List page + create form | `OrganizationsView` |
| `/organizations/:id` | `organization` | Organization detail | Organization | Detail page | `OrganizationDetailView`, `OrganizationDescriptionPanel`, `ContactPointsPanel`, `AddressesPanel`, `OrganizationMembersPanel`, `PartyRelationshipsPanel`, `PartyParticipationsPanel` |
| `/calendar` | `calendar` | Day/week calendar planner with project/task drag-to-calendar and Google Calendar integration | Calendar events / projects / tasks | Calendar planner | `CalendarRoute`, `CalendarHeaderControls`, `CalendarDayColumn`, `CalendarEventBlock`, `GoogleEventDialog` |
| `/calendar/timeline` | `timeline` | Project timeline by category | Project | Timeline view | `TimelineView`, `TimelineGrid` |
| `/planning-canvas` | `planningCanvas` | Canvas for project spans, dependencies and Google all-day/multi-day events | Project / Google event | Canvas/timeline utility | `PlanningCanvasView`, planning canvas modals |
| `/config` | `config` | Google Calendar source/account configuration | Calendar source/account | Settings/configuration view | `ConfigView` |
| `/prompt-vorlagen` | `promptTemplates` | Prompt template inspection | Prompt template | Utility/debug view | `PromptTemplatesView`, `PromptSection` |
| `/prompts` | `prompts` | OpenClaw prompt log inspector | Prompt log | Debug utility view | `PromptInspectorView`, `TurnTracePanel`, `PromptSection` |
| `/drive` | `drive` | LiveKit voice Drive Mode | Voice session | Utility/voice mode | `DriveView`, `SoundWave` |

Routes requested but not present as route paths:

- No `/context` route is defined. People and organizations are top-level nav routes at `/people` and `/organizations`.
- No `/context/people` or `/context/organizations` paths are defined.
- No `/prompt-templates` path is defined; current path is `/prompt-vorlagen`.
- No dedicated calendar event detail route is defined; calendar and Google event interactions use dialogs inside `/calendar` and `/planning-canvas`.

## App Shell

### App Shell / Layout

Route/path/name: global app shell.

Primary purpose: persistent application frame, route rendering, global error banner, contextual DMAX agent drawer, navigation and sticky content header.

Primary entity type: none.

Main components used: `App`, `renderContentHeader`, `renderNavItem`, `DmaxAgentButton`, `AgentDrawer`, `ResizeHandle`, route-specific page components.

Surface type: app-shell surface.

Current layout structure: `.app-shell` with fixed/sidebar navigation, `.main`, `.content-sticky-header`, `.content-scroll-area`, and optional right-side `.agent-drawer`. Shell class changes for collapsed sidebar and open agent drawer.

Current narrow/mobile behavior: the shell collapses to one column. The desktop
sidebar navigation is hidden behind a burger button in the sidebar header. When
opened, the mobile navigation renders as a vertical full-width icon+label menu
using the same navigation item data as desktop. When the contextual DMAX drawer
is open on narrow viewports, the shell is fixed to the viewport and background
scroll is suppressed.

Current editing pattern: shell has local UI state for sidebar collapse and agent drawer width persisted in `localStorage`; no domain editing.

Current relationship display pattern: none directly, but route context is resolved into a `ConversationContext` for the agent drawer.

Current metadata display pattern: OpenClaw status is compressed into the `DmaxAgentButton` state.

Current action placement pattern: primary navigation in left sidebar; DMAX agent button in sticky content header; route-level actions appear either in topbar/header or inside panels.

Empty state handling: `shouldShowOnboarding` renders `OnboardingView` when there are no user categories, initiatives or tasks. Some route loading states use `EmptyState`.

Loading state handling: data loading is implicit in null state plus simple `EmptyState` titles for some routes.

Error state handling: top-level `error` renders `.error-banner`; individual views also maintain local error banners/inline errors.

Similar routes/surfaces: all route pages share this shell.

Observed one-off/route-specific implementations: internal route parser, manual `window.history` navigation, custom shell/sidebar classes, custom sticky content header.

### Sidebar / Navigation

Route/path/name: global sidebar.

Primary purpose: primary and secondary navigation.

Primary entity type: none.

Main components used: `primaryNavItems`, `secondaryNavItems`, `renderNavItem`.

Surface type: navigation/app-shell surface.

Current layout structure: `.sidebar` with `.sidebar-main`, `.sidebar-header`, `.primary-nav`, `.secondary-nav`, brand button and collapse toggle. On narrow/mobile viewports, `.primary-nav` and `.secondary-nav` are hidden and `.mobile-nav` is opened from `.mobile-nav-toggle` as a vertical menu with icons and text labels.

Current editing pattern: sidebar collapse is a local toggle persisted to `localStorage`.

Current relationship display pattern: active state maps detail routes back to their collection nav item.

Current metadata display pattern: none.

Current action placement pattern: brand navigates to `/projects`; collapse toggle in sidebar header; primary nav above secondary nav.

State handling: active state and collapsed state only.

Mobile state handling: the mobile menu has local open/closed state, exposes
`aria-expanded`, and closes after a normal client-side route selection.

Similar routes/surfaces: all routes.

Observed one-off/route-specific implementations: navigation labels are currently German/mixed language; active mapping is custom in `renderNavItem`.

### Header / Top Bar

Route/path/name: global content header.

Primary purpose: route title/subtitle or entity detail header with back buttons.

Primary entity type: varies by route.

Main components used: `renderContentHeader`, `InitiativeDetailHeader`, `TaskDetailHeader`, `CalendarHeaderControls`.

Surface type: app-shell/header surface.

Current layout structure: detail routes render `.content-header-title` with `.back-actions` and entity-specific header content; collection/utility routes render `.topbar`.

Current editing pattern: initiative and task detail headers support inline title edits and pill/select edits; organization detail opens `OrganizationCoreModal` from the title button.

Current relationship display pattern: initiative detail header includes category back-link; task detail header includes parent initiative back-link.

Current metadata display pattern: headers show type/status/date/phase fields for initiatives, priority/status for tasks, salutation/type for parties.

Current action placement pattern: back buttons above detail heading; calendar date controls in topbar for `/calendar`; DMAX agent button outside header content on the right.

Empty/loading/error handling: detail headers show fallback titles such as `Person`, `Organisation`, `Maßnahme` while detail data is null; route content handles loading.

Similar routes/surfaces: entity detail headers for initiative/task/person/organization; collection topbars for list/utility views.

Observed one-off/route-specific implementations: separate header implementations per entity type; calendar has its own header controls.

### DMAX Chat Drawer / Context Panel

Route/path/name: global contextual DMAX agent drawer.

Primary purpose: contextual chat with persisted conversations and voice-message input.

Primary entity type: route-derived `ConversationContext`.

Main components used: `DmaxAgentButton`, `AgentDrawer`, `ChatView`, `ActivityTrail`, `ChatAudioPlayer`, `VoiceMessageWaveform`, `VoiceProcessingIndicator`, `ResizeHandle`.

Surface type: drawer/context panel.

Current layout structure: right-side `.agent-drawer` with header/actions, optional old-chat list, `ChatView` thread and composer. Width is resizable via `ResizeHandle` on desktop. On narrow/mobile viewports, the drawer is a full-screen fixed surface using viewport-height containment; the app-shell background is locked while open, and scroll gestures are contained in the drawer-owned chat thread or old-chat list.

Current editing pattern: chat text composer, voice recording/transcribing controls, assistant audio playback/seeking for TTS replies, old conversation selection, new chat action.

Current relationship display pattern: route context determines conversation context and label; old conversations are listed by title and timestamp.

Current metadata display pattern: chat activity trail shows tool/activity status; OpenClaw status shown in agent button.

Current action placement pattern: drawer header has old chats, new chat and close actions; composer has voice and send actions; active voice recording separates the large send action from the smaller discard action; pending assistant message has abort button; generated audio replies show a large Play/Pause control plus seek slider inside the assistant message.

Empty state handling: old chat list shows `Keine alten Chats`; chat has a welcome assistant message initialized in state.

Loading state handling: pending assistant message displays loading dots and elapsed time; voice transcribing displays processing indicator; pending TTS audio replies show an inline audio-generation indicator.

Error state handling: stream/transcription errors are represented in chat state or top-level error handling depending on caller.

Similar routes/surfaces: available on most routes through the same drawer.

Observed one-off/route-specific implementations: custom drawer and chat components live in `App.tsx`; not separated into shared component files.

## Route Details

### `/categories`, `/lebensbereiche`, `/`, `/chat`

Primary purpose: overview of categories/life areas and their initiatives grouped by initiative type.

Primary entity type: Category with nested initiatives.

Main components used: `LifeAreasView`, `LifeAreaInitiativeGroups`, `InitiativeTypeInitial`, `EmptyState`.

Surface type: list/dashboard-like overview.

Current layout structure: `.life-area-view` containing one `.life-area-section` per category. Each section has heading, optional description, and a `.life-area-type-grid` with separate idea/project/habit groups.

Current editing pattern: inline create form opens per type group from a plus icon. Initiative rows can be drag-reordered within a type group when reorder handler is supplied.

Current relationship display pattern: category-to-initiative containment grouped by initiative type.

Current metadata display pattern: category count and initiative status/date line in rows; system badge for system categories.

Current action placement pattern: category title opens category detail; plus icon in each type heading creates an initiative; row click opens initiative detail.

Empty state handling: `Noch keine Lebensbereiche`; per group text `Keine ...`.

Loading state handling: route renders `EmptyState title="Lebensbereiche werden geladen"` while overview is null.

Error state handling: creation errors bubble to top-level `error-banner`.

Similar routes/pattern candidates: `/ideas`, `/projects`, `/habits` also show initiatives grouped by category.

Observed one-off/route-specific implementations: category overview is a custom grouped dashboard rather than the same structure as `InitiativesView`.

### `/categories/:name`, `/lebensbereiche/:name`

Primary purpose: category detail with editable description and grouped initiatives.

Primary entity type: Category.

Main components used: `LifeAreaDetailView`, `LifeAreaInitiativeGroups`, `RichText`, `EmptyState`.

Surface type: detail page.

Current layout structure: `.initiative-detail.life-area-detail` with a description panel followed by grouped initiative sections.

Current editing pattern: description toggles into an inline full textarea form inside the panel; initiative creation is inline within `LifeAreaInitiativeGroups`.

Current relationship display pattern: category-to-initiatives grouped by type.

Current metadata display pattern: header displays category emoji/name/system badge and description first line or initiative count.

Current action placement pattern: back button in header; description edit button in panel header; create buttons inside type group headings.

Empty state handling: `Lebensbereich nicht gefunden`; `Noch keine Beschreibung`; per-type empty group text.

Loading state handling: missing category currently appears as not found.

Error state handling: update errors are not locally displayed in this component.

Similar routes/pattern candidates: initiative detail and organization description panels both render markdown/description with edit affordance.

Observed one-off/route-specific implementations: description editor is inline here, while organization description uses a modal and initiative markdown turns the whole panel into an editor.

### `/ideas`, `/ideas/:categoryName`, `/projects`, `/projects/:categoryName`, `/habits`, `/habits/:categoryName`

Primary purpose: collection pages for initiative subtypes.

Primary entity type: Initiative filtered by `type`.

Main components used: `InitiativesView`, `ProjectStructureList`, `ProjectStructureCard`, `InitiativeTypeBadge`, `EmptyState`.

Surface type: list page with inline create.

Current layout structure: `.initiative-grid` starts with `.entry-create` form, followed by `.initiative-category` sections. Project routes use `ProjectStructureList`; idea/habit routes use `.initiative-category-list` rows.

Current editing pattern: create form is always visible at top. Category and non-project initiative ordering uses drag/drop when available. Project rows are not reordered here; project hierarchy/relation rows are rendered structurally.

Current relationship display pattern: projects show parent/child hierarchy and predecessor/successor row grouping through `ProjectStructureList`; ideas/habits show only category grouping and task count.

Current metadata display pattern: row meta shows date range for projects, status and task count. Category heading shows count.

Current action placement pattern: create submit button in top form; category title opens category-filter route; row/card click opens detail.

Empty state handling: `Keine ${pluralLabel.toLowerCase()} in dieser Ansicht`.

Loading state handling: collection routes depend on overview being loaded; no local loading state in `InitiativesView`.

Error state handling: graph relation fetch failure silently clears relations; create errors bubble to top-level `error-banner`.

Similar routes/pattern candidates: ideas/projects/habits share `InitiativesView`; projects diverge through `ProjectStructureList`.

Observed one-off/route-specific implementations: project list has specialized hierarchy/relation rendering; top create form changes shape when project dates are present.

### `/projects/:id`, `/initiatives/:id`

Primary purpose: detail page for initiative/project/idea/habit.

Primary entity type: Initiative.

Main components used: `InitiativeDetailHeader`, `InitiativeDetailView`, `InitiativeMarkdownPanel`, `MediaAttachmentsPanel`, `ParticipantsPanel`, `TasksView`, `TaskCreateInlineForm`, `InitiativeRelationsPanel`, `ProjectDateCalendarModal`.

Surface type: detail page.

Current layout structure: header is rendered in app sticky header. Body `.initiative-detail` stacks markdown, media, participants, tasks and relations panels.

Current editing pattern: title inline edit; type/status/phase as pill selects; project date/calendar/lock in modal; markdown panel toggles to full inline editor; task create inline; relation create/link inline forms; media caption inline and modal.

Current relationship display pattern: participants in `ParticipantsPanel`; tasks embedded via `TasksView`; initiative hierarchy and predecessor/successor in `InitiativeRelationsPanel` using four columns.

Current metadata display pattern: type/status/phase/date/lock/system badge in header; task count in embedded task rows; relation status labels. No dedicated metadata grid.

Current action placement pattern: back buttons in header; editable header pills next to title; panel-level add/upload/edit actions inside panel headers or inline controls.

Empty state handling: `Loading initiative...`; `Noch keine Massnahmen`; participant/relation/media empty messages.

Loading state handling: null detail renders `EmptyState title="Loading initiative..."`.

Error state handling: header save errors inline near header; relation errors mostly use top-level error or implicit failure; media/participants have inline errors.

Similar routes/pattern candidates: task detail shares participants/media and inline title editing; category detail and organization detail share markdown/description concepts.

Observed one-off/route-specific implementations: `InitiativeRelationsPanel` is a custom relationship manager; project date and Google Calendar binding modal is initiative-specific; markdown edit pattern differs from organization/category.

### `/tasks`

Primary purpose: task list across initiatives.

Primary entity type: Task.

Main components used: `TasksView`.

Surface type: list page.

Current layout structure: `.task-list` containing `.task-row` articles.

Current editing pattern: status toggle inline. Delete uses `window.confirm` if delete handler exists.

Current relationship display pattern: each task can show parent initiative name from `initiativeById`.

Current metadata display pattern: priority badge, due-date pill, initiative name.

Current action placement pattern: status toggle at row start; delete icon at row end; row click opens task detail.

Empty state handling: no empty state inside global `/tasks` rendering when task array is empty.

Loading state handling: depends on overview; no local loading state.

Error state handling: delete/toggle errors handled by parent refresh/top-level flow, no local error display.

Similar routes/pattern candidates: embedded task list in initiative detail uses same `TasksView`; people/organization list rows reuse `.task-row` class.

Observed one-off/route-specific implementations: task list is a generic component reused as an embedded panel and page without a page-level header/filter/create pattern.

### `/tasks/:id`

Primary purpose: task detail with due date, notes, media, participants and checklist.

Primary entity type: Task.

Main components used: `TaskDetailHeader`, `TaskDetailView`, `TaskDueDateEditor`, `TaskNotesPanel`, `MediaAttachmentsPanel`, `ParticipantsPanel`, `TaskChecklistPanel`.

Surface type: detail page.

Current layout structure: header in sticky app header; body `.task-detail` stacks detail panel, notes panel, media panel, participants panel and checklist panel.

Current editing pattern: title inline edit; status button; priority select; due date inline date editor; notes toggle into inline textarea form; checklist inline create/edit/toggle/delete/reorder; media modal/inline caption.

Current relationship display pattern: parent initiative back-link in header; participants through `ParticipantsPanel`; no broader linked-object section.

Current metadata display pattern: due date and completed timestamp in `dl.detail-list`; priority/status in header.

Current action placement pattern: header pills/buttons near title; panel-level actions inside each panel; checklist actions inline per row.

Empty state handling: `Loading task...`; checklist has no explicit empty message beyond create form; notes panel renders empty button if no notes.

Loading state handling: null detail renders `EmptyState title="Loading task..."`.

Error state handling: media/participants have inline errors; task header/date/notes/checklist mostly rely on disabled/busy state without visible save errors.

Similar routes/pattern candidates: initiative detail shares participants/media/task rows; task header resembles initiative header.

Observed one-off/route-specific implementations: checklist panel is task-specific; due date editor is inline and local to task detail.

### `/people`

Primary purpose: list, search and create people.

Primary entity type: Person.

Main components used: `PeopleView`.

Surface type: list page with create form.

Current layout structure: `.stacked-layout` with a create `.panel.compact-form`, search panel, then `.task-list` row list.

Current editing pattern: create person form is always visible at top.

Current relationship display pattern: none in list rows.

Current metadata display pattern: salutation, academic title, first/last name and suffix in row meta.

Current action placement pattern: create button at end of form; row click opens detail.

Empty state handling: `Noch keine Personen`; `Keine Personen gefunden`.

Loading state handling: parent passes `peopleList ?? []`, so unloaded state is indistinguishable from empty in this view.

Error state handling: create errors are not displayed locally in `PeopleView`.

Similar routes/pattern candidates: `/organizations` has the same stacked create/search/list structure.

Observed one-off/route-specific implementations: uses `.task-list` and `.task-row` classes for party list rows.

### `/people/:id`

Primary purpose: person detail with master data, contact points, party relationships and DMAX participations.

Primary entity type: Person.

Main components used: `PersonDetailView`, `Panel`, `ContactPointsPanel`, `ContactPointModal`, `PartyRelationshipsPanel`, `PartyParticipationsPanel`.

Surface type: detail page.

Current layout structure: `.split-view.party-detail-layout` with two `.detail-pane` columns. Left: master-data form and contact points. Right: relationships and DMAX contexts.

Current editing pattern: master data is a visible detail form; contact points use add/edit modal; contact delete uses `window.confirm`.

Current relationship display pattern: `PartyRelationshipsPanel` lists semantic party relationships; `PartyParticipationsPanel` lists linked initiatives/tasks as button rows.

Current metadata display pattern: salutation appears in header subtitle; master fields are visible form fields; no dedicated metadata grid.

Current action placement pattern: save button inside master form; contact add button in panel actions; relationship/context rows open linked objects where supported.

Empty state handling: `Person wird geladen`; contact points `Noch keine Kontaktwege`; relationships `Noch keine Beziehungen`; participations `Noch keine Beteiligungen`.

Loading state handling: null detail renders loading empty state.

Error state handling: master form and contact modal/panel show inline errors.

Similar routes/pattern candidates: `/organizations/:id` shares contact, relationship and participation panels.

Observed one-off/route-specific implementations: person master data is inline form, while organization core data is a modal opened from header.

### `/organizations`

Primary purpose: list, search and create organizations.

Primary entity type: Organization.

Main components used: `OrganizationsView`.

Surface type: list page with create form.

Current layout structure: `.stacked-layout` with create `.panel.compact-form`, search panel, then `.task-list` rows.

Current editing pattern: create organization form is always visible at top.

Current relationship display pattern: none in list rows.

Current metadata display pattern: organization type and legal name in row meta.

Current action placement pattern: create button at end of form; row click opens detail.

Empty state handling: `Noch keine Organisationen`; `Keine Organisationen gefunden`.

Loading state handling: parent passes `organizationList ?? []`, so unloaded state is indistinguishable from empty in this view.

Error state handling: create errors are not displayed locally in `OrganizationsView`.

Similar routes/pattern candidates: `/people` has the same stacked create/search/list structure.

Observed one-off/route-specific implementations: uses `.task-list` and `.task-row` classes for organization rows.

### `/organizations/:id`

Primary purpose: organization detail with description, contact points, addresses, members, relationships and DMAX participations.

Primary entity type: Organization.

Main components used: `OrganizationDetailView`, `OrganizationCoreModal`, `OrganizationDescriptionPanel`, `ContactPointsPanel`, `AddressesPanel`, `AddressModal`, `OrganizationMembersPanel`, `PartyRelationshipsPanel`, `PartyParticipationsPanel`.

Surface type: detail page.

Current layout structure: `.organization-detail-layout`; description panel spans first; contact points and addresses in `.organization-detail-grid`; members panel; secondary grid for relationships and DMAX contexts.

Current editing pattern: core data modal opened by title button in header; description modal with markdown textarea; contact/address add/edit modals; member relationship inline create form; delete uses `window.confirm`.

Current relationship display pattern: members are filtered person party relationships in `OrganizationMembersPanel`; all party relationships shown in `PartyRelationshipsPanel`; linked DMAX contexts shown in `PartyParticipationsPanel`.

Current metadata display pattern: organization type in header subtitle; legal name/type only in core modal; contact/address flags in list row text; no dedicated metadata grid.

Current action placement pattern: title button opens core modal; description edit button in panel header; contact/address add buttons in panel action area; member create form below list.

Empty state handling: `Organisation wird geladen`; `Noch keine Beschreibung.` rendered as rich text; contact/address/members/relationships/participations empty muted messages.

Loading state handling: null detail renders loading empty state.

Error state handling: modals/panels use inline errors.

Similar routes/pattern candidates: `/people/:id` shares party contact, relationship and participation panels.

Observed one-off/route-specific implementations: organization detail uses an organization-specific layout and core-data modal rather than the person detail inline form.

### `/calendar`

Primary purpose: day/week calendar planner with fixed/flexible all-day lanes, timed event grid, project/task drag-to-calendar and Google Calendar linking/editing.

Primary entity type: Calendar event, task, project.

Main components used: `CalendarRoute`, `CalendarHeaderControls`, `CalendarAllDayEventButton`, `CalendarDayColumn`, `CalendarEventBlock`, `CalendarProjectHoverCard`, `StandaloneEntryDialog`, `GoogleEventDialog`, `PublishGoogleEventDialog`.

Surface type: calendar/timeline planner.

Current layout structure: `.calendar-planner` with left `.calendar-planner-sidebar` for active project/task palette and right `.calendar-workspace` with `.calendar-frame`, all-day lanes and timed day columns.

Current editing pattern: drag/drop creates or moves DMAX calendar entries; resize handles adjust timed entries; double-click blank day area opens standalone entry dialog; Google events open modal for edit/link/create target; DMAX entries can be completed/deleted/published/unlinked inline.

Current relationship display pattern: project sidebar lists active projects and nested open tasks; all-day events and timed events link back to projects/tasks or Google events.

Current metadata display pattern: event source/color, time range, Google binding badge, lock icon, warnings and read-only status in Google event modal.

Current action placement pattern: calendar mode/date controls in global topbar; all-day row toggles in frame; event-level actions inside event block; modal actions in footer.

Empty state handling: sidebar project tasks show `Keine offenen Massnahmen`; no full-calendar empty state when there are no events.

Loading state handling: lazy route suspense fallback `Kalender wird geladen`; route-level `busy` overlay `Lade...`.

Error state handling: `calendarLoadError` error banner; sync warning banners; modal-level error banners.

Similar routes/pattern candidates: `/planning-canvas` also displays Google all-day/multi-day events and project time bars.

Observed one-off/route-specific implementations: calendar route has its own layout/components in `web/src/routes/CalendarRoute.tsx`; Google event modal is specific to calendar route.

### `/calendar/timeline`

Primary purpose: project timeline showing active projects with start/end dates grouped by category.

Primary entity type: Project.

Main components used: `TimelineView`, `TimelineGrid`, `EmptyState`.

Surface type: timeline view.

Current layout structure: `.timeline-panel` with toolbar, range select, horizontal scroll frame, category rows and positioned bars.

Current editing pattern: no editing in this view.

Current relationship display pattern: category-to-project grouping; bar click opens project detail.

Current metadata display pattern: date range in toolbar; category row count; bar title tooltip includes project/date range.

Current action placement pattern: range select in toolbar; project bars are clickable.

Empty state handling: `Keine aktiven datierten Projekte in diesem Zeitraum`.

Loading state handling: no local loading state; uses overview data from parent.

Error state handling: none local.

Similar routes/pattern candidates: `/planning-canvas` also represents project time spans.

Observed one-off/route-specific implementations: custom timeline grid and bar layout.

### `/planning-canvas`

Primary purpose: operational canvas for project placement, date spans, relation edges, related project creation and Google all-day/multi-day event overlays.

Primary entity type: Project and Google calendar event.

Main components used: `PlanningCanvasView`, `PlanningCanvasProjectModal`, `PlanningCanvasRelatedProjectModal`, `PlanningCanvasGoogleEventChangeModal`, `PlanningCanvasGoogleEventCreateModal`, `PlanningCanvasGoogleEventEditModal`, `GoogleCalendarGlyph`, `GoogleCalendarTimebarBadge`.

Surface type: canvas/timeline utility view.

Current layout structure: `.planning-canvas-view` with left `.planning-canvas-parking` search/filter/zoom/unplaced initiatives/hidden Google events and right `.planning-canvas-stage-wrap` scrollable/pannable/zoomable canvas with time header, Google rows, project time bars, markers and SVG edges.

Current editing pattern: drag unplaced initiatives to canvas; drag/resize project time bars and Google bars; modal edit for project fields; modal create predecessor/successor; modal confirm Google time changes; modal create/edit Google events; hide/restore Google events.

Current relationship display pattern: project relation edges drawn as SVG parent/child or predecessor/successor paths; relation handles on time bars create related projects.

Current metadata display pattern: parking items show category/status/open count; bars show status/phase/lock/Google binding; hidden Google popover shows date/scope metadata.

Current action placement pattern: search/filter and zoom in left rail; edit/relationship/hide handles directly on bars; modal footer actions.

Empty state handling: `No unplaced initiatives` when parking list is empty.

Loading state handling: no explicit initial loading state for null canvas beyond empty parking list condition; data load errors use banner.

Error state handling: route-level `error-banner`; modal-level error banners/forms.

Similar routes/pattern candidates: `/calendar` and `/calendar/timeline` share date/time/project concepts.

Observed one-off/route-specific implementations: highly custom canvas layout, gestures, SVG relation rendering, hidden Google event popover and planning-canvas-specific modals.

### `/config`

Primary purpose: Google Calendar account/source configuration.

Primary entity type: Google account, Google calendar, DMAX calendar source.

Main components used: `ConfigView`, `EmptyState`.

Surface type: settings/configuration view.

Current layout structure: `.config-layout` containing `.config-section`, account list/cards, calendar picker, manual source form and source list.

Current editing pattern: add-account modal; calendar source toggles; manual source create form; disconnect/reconnect account actions.

Current relationship display pattern: Google accounts contain calendars; DMAX sources reference account/calendar IDs.

Current metadata display pattern: account connected/scope status, calendar access role/id, source account/calendar ID/read-only state.

Current action placement pattern: add account button near section header; account actions in account card header; calendar add/remove button per row; source checkboxes inline.

Empty state handling: `Noch kein Google-Konto verbunden`; `Noch keine aktiven Kalenderquellen`; `Keine Kalender geladen.`

Loading state handling: per-account calendar loading text `Kalender werden geladen...`.

Error state handling: route-level and per-account `error-banner`; config hints for missing OAuth config or old scopes.

Similar routes/pattern candidates: utility/debug views use toolbar/panel structures but config is settings-specific.

Observed one-off/route-specific implementations: Google account/source cards and manual source form are config-specific.

### `/prompt-vorlagen`

Primary purpose: inspect prompt template definitions.

Primary entity type: Prompt template.

Main components used: `PromptTemplatesView`, `PromptSection`, `EmptyState`.

Surface type: utility/debug view.

Current layout structure: `.prompt-template-view` with toolbar and accordion-like `.prompt-template-row.panel` list.

Current editing pattern: no editing; rows expand/collapse.

Current relationship display pattern: route/context metadata shown per template.

Current metadata display pattern: route and effective/display context in row meta.

Current action placement pattern: refresh button in toolbar; row trigger opens detail.

Empty state handling: `Keine Prompt-Vorlagen geladen.`

Loading state handling: no local loading state while templates fetch.

Error state handling: load failure goes through top-level `error-banner`.

Similar routes/pattern candidates: `/prompts` prompt inspector.

Observed one-off/route-specific implementations: prompt section/pre blocks are debug-specific.

### `/prompts`

Primary purpose: inspect logged OpenClaw prompts and turn traces.

Primary entity type: Prompt log.

Main components used: `PromptInspectorView`, `TurnTracePanel`, `PromptSection`, `EmptyState`.

Surface type: debug utility view.

Current layout structure: `.prompt-inspector` with toolbar, side prompt log list and prompt detail pane.

Current editing pattern: no editing; select prompt, refresh logs, copy final prompt.

Current relationship display pattern: prompt context type/entity/conversation metadata; turn trace events and OpenClaw runs.

Current metadata display pattern: `.prompt-meta.panel` grid, trace timing summaries and preformatted prompt sections.

Current action placement pattern: refresh in toolbar; copy button in metadata panel; prompt rows in side list.

Empty state handling: `Noch keine OpenClaw-Prompts geloggt.` and `Kein Prompt ausgewählt.`

Loading state handling: no local loading state while prompt logs fetch.

Error state handling: load errors through top-level `error-banner`.

Similar routes/pattern candidates: `/prompt-vorlagen`.

Observed one-off/route-specific implementations: debug-specific prompt log list, prompt meta grid and trace panels.

### `/drive`

Primary purpose: LiveKit voice Drive Mode.

Primary entity type: Voice session.

Main components used: `DriveView`, `SoundWave`.

Surface type: voice utility view.

Current layout structure: `.drive-layout` with voice orb, control buttons and context/status area.

Current editing pattern: start/end voice session only.

Current relationship display pattern: none.

Current metadata display pattern: LiveKit room connection state and room name.

Current action placement pattern: primary start/stop button and secondary end-session button below orb.

Empty state handling: none.

Loading state handling: voice state `connecting` changes orb label.

Error state handling: `voiceError` renders `.error-banner`.

Similar routes/pattern candidates: none; this is a specialized voice surface.

Observed one-off/route-specific implementations: custom voice orb/waveform.

## Major Modal, Drawer and Panel Surfaces

### Shared/Recurring Panels

| Component | Current use | Current structure | Editing pattern | State handling |
|---|---|---|---|---|
| `Panel` | Generic wrapper for many detail sections | `<section className="panel"><h3>...` | None by itself | None by itself |
| `EmptyState` | Used across routes and panels | `<div className="empty-state">{title}</div>` | None | Title-only empty/loading messaging |
| `RichText` | Markdown-ish rendering for initiative/category/org descriptions and chat | Parses headings, paragraphs, lists, links, bold | None | No error state |
| `TasksView` | `/tasks` and initiative detail task section | `.task-list` rows | Status toggle, optional delete/reorder/open | No built-in empty state |
| `ParticipantsPanel` | Initiative and task detail | `Panel` with relationship list and create form | Inline add/remove participants | Muted empty text, inline error |
| `MediaAttachmentsPanel` | Initiative and task detail | Drop/upload panel, media grid, media modal | Upload, reorder, caption edit, delete, analysis edit/reanalyze in modal | Busy text, inline error |

### Contact, Address and Party Relationship Surfaces

| Component | Current use | Current structure | Editing pattern | State handling |
|---|---|---|---|---|
| `ContactPointsPanel` | Person and organization detail | `Panel`, relationship-list rows | Add/edit via `ContactPointModal`; delete confirm | Muted empty text, inline error |
| `ContactPointModal` | Contact point add/edit | `.modal-backdrop` + `.compact-modal.party-edit-modal` form | Modal form | Inline error, busy disables |
| `AddressesPanel` | Organization detail | `Panel`, relationship-list rows | Add/edit via `AddressModal`; delete confirm | Muted empty text, inline error |
| `AddressModal` | Address add/edit | `.modal-backdrop` + `.compact-modal.party-edit-modal` form | Modal form | Inline error, busy disables |
| `PartyRelationshipsPanel` | Person and organization detail | `Panel`, relationship-list rows | Display only | Muted empty text |
| `PartyParticipationsPanel` | Person and organization detail | `Panel`, relationship-list button rows | Display and navigate only | Muted empty text |
| `OrganizationMembersPanel` | Organization detail | `Panel`, relationship-list and inline create form | Inline member relationship creation | Muted empty text, inline error |

### Initiative / Task Detail Panels

| Component | Current use | Current structure | Editing pattern | State handling |
|---|---|---|---|---|
| `InitiativeDetailHeader` | Initiative detail header | Inline title plus type/status/phase/date pills | Inline title, select pills, date modal | Inline header error |
| `ProjectDateCalendarModal` | Project date and Google binding | `.compact-modal.project-date-calendar-modal` | Modal date/lock/save and Google create/unlink | Error banners and config hints |
| `InitiativeMarkdownPanel` | Initiative detail body | Button-like panel, textarea form in edit mode | Inline full-panel edit | Busy disables, no visible error |
| `InitiativeRelationsPanel` | Initiative detail body | `<details>` panel with four relation columns | Inline select/link/create/remove controls | Busy per relation, no local error banner |
| `TaskDetailHeader` | Task detail header | Inline title plus status and priority controls | Inline title, status toggle, priority select | Busy disables, no visible error |
| `TaskDueDateEditor` | Task detail metadata panel | Button switches to date input | Inline date edit | Busy disables, no visible error |
| `TaskNotesPanel` | Task detail body | Button-like panel, textarea form in edit mode | Inline full-panel edit | Busy disables, no visible error |
| `TaskChecklistPanel` | Task detail body | Checklist rows plus create form | Inline create/edit/toggle/delete/reorder | Busy per item, no visible error |

### Calendar / Planning Modals

| Component | Current use | Current structure | Editing pattern | State handling |
|---|---|---|---|---|
| `StandaloneEntryDialog` | `/calendar` blank-slot create | `.modal-backdrop` + `.compact-modal` | Modal create | Disabled submit until title |
| `GoogleEventDialog` | `/calendar` Google event edit/link | `.compact-modal.google-event-modal` with metadata, optional edit form and link sections | Modal edit/link/create target | Error banner, busy disables |
| `PublishGoogleEventDialog` | `/calendar` publish DMAX event to Google | `.compact-modal` | Modal source select/create | Error banner, config hint |
| `PlanningCanvasProjectModal` | `/planning-canvas` project edit | `.planning-canvas-modal` | Modal form | Error banner, busy disables |
| `PlanningCanvasRelatedProjectModal` | `/planning-canvas` predecessor/successor create | `.planning-canvas-modal` | Modal create | Error banner, busy disables |
| `PlanningCanvasGoogleEventChangeModal` | `/planning-canvas` Google date-change confirm | `.planning-canvas-modal` | Confirmation modal | Busy disables |
| `PlanningCanvasGoogleEventCreateModal` | `/planning-canvas` Google event create | `.planning-canvas-modal` | Modal create | Config hint, busy disables |
| `PlanningCanvasGoogleEventEditModal` | `/planning-canvas` Google event edit | `.planning-canvas-modal` | Modal edit | Form error, busy disables |
| `planning-canvas-hide-modal` | `/planning-canvas` recurring Google event hide choice | `.compact-modal.planning-canvas-hide-modal` | Choice modal | No local error; parent error banner |

### Media Modal

Route/path/name: `MediaModal`.

Primary purpose: preview media attachment, edit caption/analysis and trigger re-analysis.

Primary entity type: Media attachment/asset.

Surface type: modal.

Current layout structure: `.media-modal-backdrop` with `.media-modal`, header, viewer area and metadata aside.

Current editing pattern: caption input saves on blur; analysis section toggles between read and textarea edit; re-analysis prompt textarea and button.

Current relationship display pattern: attachment belongs to initiative/task through parent panel.

Current metadata display pattern: `media-meta-list` displays type, MIME, size and upload timestamp.

Current action placement pattern: close in header; save/reanalyze actions inside metadata sections.

Empty/loading/error handling: empty analysis text through `ExpandableText`; inline error for save/reanalysis failures.

Observed one-off/route-specific implementations: media preview logic and modal metadata layout are specialized.

## Current Shared Class/Component Vocabulary Observed

Observed general-purpose components/classes:

- `Panel`
- `EmptyState`
- `RichText`
- `ActivityTrail`
- `DmaxAgentButton`
- `AgentDrawer`
- `ChatView`
- `ResizeHandle`
- `primary-action`
- `secondary-action`
- `small-button`
- `icon-button`
- `panel`
- `modal-backdrop`
- `compact-modal`
- `error-banner`
- `inline-error`
- `relationship-list`
- `relationship-row`
- `task-list`
- `task-row`

Observed route-specific component families:

- `LifeAreasView` / `LifeAreaDetailView` / `LifeAreaInitiativeGroups`
- `InitiativesView` / `ProjectStructureList` / `ProjectStructureCard`
- `InitiativeDetailHeader` / `InitiativeDetailView` / `InitiativeRelationsPanel`
- `TaskDetailHeader` / `TaskDetailView` / `TaskChecklistPanel`
- `PeopleView` / `PersonDetailView`
- `OrganizationsView` / `OrganizationDetailView`
- `CalendarRoute` and calendar subcomponents
- `PlanningCanvasView` and planning canvas subcomponents
- `ConfigView`
- `PromptTemplatesView` / `PromptInspectorView`
- `DriveView`

## Similar Routes / Pattern Candidates Noted

These are factual similarity observations for later phases, not redesign decisions:

- `/people` and `/organizations` both use stacked create/search/list pages.
- `/people/:id` and `/organizations/:id` both use party contact, relationship and participation panels.
- `/ideas`, `/projects` and `/habits` all use `InitiativesView`, with project-specific structural rendering.
- `/projects/:id` or `/initiatives/:id` and `/tasks/:id` both use editable detail headers, participants and media panels.
- `/calendar`, `/calendar/timeline` and `/planning-canvas` all represent project/calendar time information but use separate custom layouts.
- `ContactPointsPanel` and `AddressesPanel` share panel/list/modal patterns.
- `PromptTemplatesView` and `PromptInspectorView` share prompt/debug block patterns.

## Observed One-Off / Route-Specific UI Implementations

This is an inventory of visible one-off implementations, not a recommendation:

- Manual route parser and navigation in `App.tsx`.
- Detail header variants implemented separately for initiative, task, person and organization.
- Category detail markdown edit is inline; initiative markdown edit is inline full-panel; organization description edit is modal.
- Person core data is a visible inline form; organization core data is modal from the page title.
- Project list uses custom `ProjectStructureList` relation/hierarchy rendering.
- Initiative relation management is a custom `<details>` panel with four relationship columns.
- Planning Canvas has route-specific parking, zoom, gesture, SVG edge and Google event overlays.
- Calendar route has route-specific project/task palette, all-day lane structure, event blocks and Google event dialog.
- Config route has route-specific Google account/source cards and manual source form.
- Prompt debug routes use route-specific preformatted prompt panels.
- People/organization list rows reuse task row classes.
- `EmptyState` is title-only and used for both true empty and loading states.
- Metadata appears through route-specific `dl`, row meta, prompt meta or modal sidebars rather than a shared metadata component.

## Areas Not Present Or Not Separately Routed

- No separate context hub route.
- No separate contact point route.
- No separate address route.
- No separate relationship management route.
- No separate calendar event detail route.
- No separate prompt template detail route; prompt template details expand inline.
- Browser Drive Mode is present as `/drive`, but durable voice tool commit UI is not visible in the inspected frontend.

## Status Values For Future Audit Phases

Use these values if this file is extended into an audit tracker:

- `not reviewed`
- `reviewed`
- `needs refactor`
- `in progress`
- `aligned`
- `intentional exception`

## Priority Values For Future Audit Phases

Use these values if this file is extended into a debt/refactor tracker:

- `high`
- `medium`
- `low`
