# DMAX UI Design Decisions

This document converts the Phase 1 route inventory, Phase 2 debt/gap analysis and Phase 3 screenshot audit into concrete UI decisions for later implementation.

This is a decision document, not an implementation plan. Do not change application code based only on this file without a scoped implementation phase.

Evidence sources:

- `docs/ui/UI_ROUTE_INVENTORY.md`
- `docs/ui/UI_DEBT_REPORT.md`
- `docs/ui/UI_PATTERN_GAPS.md`
- `docs/ui/UI_SCREENSHOT_INVENTORY.md`
- `docs/ui/UI_SCREENSHOT_AUDIT.md`
- `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_DETAIL.md`
- `docs/ui/UI_REFERENCE_REVIEW_INITIATIVE_PROJECT_DETAIL.md`
- `docs/ui/UI_ENTITY_DETAIL_CANONICAL_PATTERN.md`

## Phase 8 consolidation note

Phase 8 consolidates the accepted entity detail direction in `UI_ENTITY_DETAIL_CANONICAL_PATTERN.md` and the extraction plan in `UI_COMPONENT_EXTRACTION_PLAN.md`.

The validated reference pages are:

- `/organizations/:id` for context/contact-oriented detail pages.
- `/projects/:id` and `/initiatives/:id` for planning/action-oriented detail pages.

Next recommended implementation phase: Phase 9A, extracting canonical entity detail components before migrating another route.

## 1. Executive Summary

DMAX must become a coherent, read-first, relationship-aware power-user workspace. The current UI is visually restrained, but screenshots and code inventory show that it is assembled from route-local layouts, route-local editing patterns and route-local relationship displays.

The binding design direction is:

- Use one canonical anatomy for entity detail pages.
- Use one canonical anatomy for entity list pages.
- Make default detail views read-first, not form-first.
- Treat relationships as first-class product information.
- Move grouped editing into intentional modals or drawers.
- Keep metadata secondary and technical information contained.
- Govern calendar, timeline and planning surfaces with a shared time vocabulary.
- Treat debug/config/media surfaces as utility/inspector surfaces, not as normal entity pages.
- Use `/organizations/:id` as the first reference implementation route in Phase 5.

The organization contextual DMAX drawer bug found in Phase 3 must be investigated in Phase 5. The bug must not be fixed in this phase.

## 2. Product UI Direction

### UI-DEC-001: Product feel

- Decision: DMAX must feel like a calm personal operating system for thinking, planning, deciding and acting, not like an admin CRUD backend, generic dashboard, form-first CRM or debug console.
- Rationale: The product value is making a complex personal system legible. More visible information does not solve that complexity.
- Evidence from audit: `01`, `03`, `06`, `08`, `14`, `15` show restrained visuals but route-local structure, form-first detail and debug density.
- Applies to: all frontend routes and shared components.
- Implementation implications: new UI must optimize for primary object clarity, scan speed, relationship clarity and progressive disclosure before visual decoration.
- Components involved: `PageShell`, `EntityListPage`, `EntityDetailPage`, `EntityHeader`, `SectionBlock`, `RelationList`, `MetadataGrid`.
- Priority: high.
- Status: accepted.

### UI-DEC-002: Read-first default

- Decision: Default entity detail views must be read-first. Permanent raw forms are not allowed as the default detail-page experience.
- Rationale: Entity pages are for understanding and acting first; editing is an intentional mode.
- Evidence from audit: `06-person-detail.png` confirms the person detail page currently feels like an admin form.
- Applies to: `/people/:id`, `/organizations/:id`, `/projects/:id`, `/initiatives/:id`, `/tasks/:id`, `/categories/:name`.
- Implementation implications: grouped master-data forms move into `EditModal` or `EditDrawer`; only small high-frequency fields may use inline edit.
- Components involved: `EntityDetailPage`, `EntityHeader`, `EditModal`, `EditDrawer`, `InlineEditableField`.
- Priority: high.
- Status: accepted.

### UI-DEC-003: Progressive disclosure before more content

- Decision: UI complexity must be solved by prioritizing, grouping, summarizing, collapsing, hiding or moving content into drawers/modals, not by adding more visible sections.
- Rationale: DMAX is high-density by domain, so hierarchy is more important than total visible data.
- Evidence from audit: `08-project-detail.png` shows markdown overload; `14-config.png` and `18-media-modal.png` show technical density competing with primary content.
- Applies to: all routes, especially project detail, config, prompts, media modal and calendar.
- Implementation implications: introduce summary/expanded states, metadata disclosures and section-level ordering rules before route migration.
- Components involved: `DescriptionBlock`, `SectionBlock`, `MetadataGrid`, `TechnicalMetadataDisclosure`, `InspectorModal`.
- Priority: high.
- Status: accepted.

## 3. Language And Terminology Decision

### UI-DEC-004: Product language

- Decision: The recommended product language for normal user-facing DMAX UI is German. This needs human confirmation before broad copy migration.
- Rationale: Current primary navigation and most operational labels are already German, and DMAX is a personal system for a German-speaking power user. Keeping English docs while the UI is mostly German creates implementation ambiguity.
- Evidence from audit: `01`, `02`, `05`, `09`, `14`, `15`, `16` confirm mixed German/English labels such as `Lebensbereiche`, `Massnahmen`, `Planning Canvas`, `Config`, `Prompt Inspector`, `Drive Mode`.
- Applies to: normal product UI, entity pages, lists, modals, empty/error states, navigation.
- Implementation implications: Phase 5 should not perform broad copy migration unless confirmed. When copy is touched in a migrated route, use the German vocabulary table below.
- Components involved: all user-facing components.
- Priority: high.
- Status: needs human confirmation.

### UI-DEC-005: Technical/internal copy boundary

- Decision: Technical/internal terms must not appear in normal user flows. They are allowed only in debug, config or inspector surfaces.
- Rationale: Normal DMAX surfaces should explain user meaning, not implementation structure.
- Evidence from audit: `26-organization-detail-agent-error.png` exposes `contextEntityId`; `15-prompts.png` intentionally shows debug trace terms; `14-config.png` shows calendar IDs and scopes.
- Applies to: all normal routes, DMAX drawer errors, entity metadata, config/debug exceptions.
- Implementation implications: map technical errors to user-facing copy; keep raw IDs, trace labels and API-shaped fields inside `TechnicalMetadataDisclosure` or debug pages.
- Components involved: `ErrorState`, `TechnicalMetadataDisclosure`, `DebugInspectorPage`, `ContextPanel`.
- Priority: high.
- Status: accepted.

### Recommended Vocabulary

This table is the default direction if German is confirmed.

| Concept | Recommended user-facing term | Avoid in normal UI | Status |
|---|---|---|---|
| Category / Lebensbereich | Lebensbereich | Category, Bucket, Area | needs human confirmation |
| Idea / Idee | Idee | Initiative, Workstream | needs human confirmation |
| Project / Projekt | Projekt | Initiative, Workstream | needs human confirmation |
| Habit / Gewohnheit / Maßnahme | Gewohnheit | Routine unless explicitly meant | needs human confirmation |
| Task / Aufgabe | Aufgabe | Maßnahme, Todo, Action Item | needs human confirmation |
| Person | Person | Kontakt as entity name | needs human confirmation |
| Organization / Organisation | Organisation | Firma as generic entity label, Account, Org | needs human confirmation |
| Contact Point / Kontaktweg | Kontaktweg | Contact Point, Channel, Medium | needs human confirmation |
| Address / Adresse | Adresse | Location unless not postal | needs human confirmation |
| Relationship / Beziehung / Verbindung | Beziehung | Link when semantic meaning exists | needs human confirmation |
| Calendar Event / Termin / Kalenderereignis | Termin | Calendar Event in normal UI | needs human confirmation |
| Time Block / Zeitblock | Zeitblock | Slot, Booking | needs human confirmation |
| Timeline / Zeitachse | Zeitachse | Timeline if German UI is confirmed | needs human confirmation |
| Planning Canvas | Planungscanvas or Planning Canvas | Planning Canvas mixed arbitrarily | needs human confirmation |
| DMAX agent drawer / DMAX context panel | DMAX-Kontext | Chat drawer, Agent drawer | needs human confirmation |

## 4. App Shell And Navigation Decisions

### UI-DEC-006: Navigation vocabulary

- Decision: Sidebar labels must use the confirmed product language consistently and must represent user concepts, not implementation concepts.
- Rationale: Navigation is the strongest product vocabulary signal.
- Evidence from audit: `01-app-shell-categories.png` shows mixed German and English navigation.
- Applies to: sidebar, top-level routes, active-state labels.
- Implementation implications: after language confirmation, align nav labels in one pass; do not rename routes unless explicitly scoped.
- Components involved: `PageShell`, sidebar navigation.
- Priority: high.
- Status: proposed.

### UI-DEC-007: Page header responsibility

- Decision: Collection/utility routes use `PageHeader`; entity routes use `EntityHeader`. Route-specific headers are not allowed unless documented as a specialized surface.
- Rationale: Current header branching creates inconsistent title, action and metadata placement.
- Evidence from inventory: `renderContentHeader`, `InitiativeDetailHeader`, `TaskDetailHeader` and calendar controls differ. Audit confirms detail header inconsistency in `03`, `06`, `08`, `10`, `17`.
- Applies to: all route headers.
- Implementation implications: Phase 5 must introduce header slots before migrating organization detail.
- Components involved: `PageHeader`, `EntityHeader`, `EntityActionBar`.
- Priority: high.
- Status: accepted.

### UI-DEC-008: Debug/config navigation separation

- Decision: Debug, config and utility views may remain in secondary navigation, but they must use a distinct `UtilityPage` or `DebugInspectorPage` pattern and must not influence normal entity/list design.
- Rationale: Dense technical surfaces are useful, but they should not define product UI defaults.
- Evidence from audit: `14-config.png`, `15-prompts.png`, `16-prompt-templates.png`, `27-drive-mode.png`.
- Applies to: `/config`, `/prompts`, `/prompt-vorlagen`, `/drive`, media inspector surfaces.
- Implementation implications: do not reuse debug layout patterns for normal entity pages.
- Components involved: `UtilityPage`, `DebugInspectorPage`, `InspectorModal`, `TechnicalMetadataDisclosure`.
- Priority: medium.
- Status: accepted.

### UI-DEC-008A: Mobile app-shell navigation

- Decision: On narrow/mobile viewports, DMAX uses a burger-triggered vertical
  navigation menu with icons and labels instead of an always-visible wrapped or
  horizontally scrolling icon rail.
- Rationale: The full desktop navigation set is too dense for the mobile header.
  A closed burger keeps the primary object near the top of the viewport, while
  the opened vertical menu preserves scanability through text labels.
- Applies to: global app shell, primary navigation, secondary navigation,
  collapsed-sidebar state on narrow viewports.
- Implementation implications: The mobile menu reuses the same `NavItem` data
  and `renderNavItem` behavior as desktop navigation. It must keep accessible
  button labeling, expose `aria-expanded`, and close after normal route
  selection. Desktop sidebar behavior remains unchanged.
- Components involved: `PageShell`, sidebar navigation, mobile navigation
  toggle.
- Priority: high.
- Status: accepted.

### UI-DEC-008B: Mobile DMAX drawer scroll containment

- Decision: When the contextual DMAX drawer is open on narrow/mobile viewports,
  the app-shell background must not scroll. Scroll gestures inside the drawer
  stay inside the drawer, primarily in the chat thread or old-chat list.
- Rationale: A full-screen contextual drawer behaves like the active surface on
  mobile. Letting the page behind it scroll creates loss of place and makes the
  drawer feel broken.
- Applies to: contextual DMAX drawer, chat thread, old-chat list, app shell with
  `.with-agent-drawer` on narrow viewports.
- Implementation implications: The mobile drawer uses viewport-height
  containment (`100dvh`), the app shell is overflow-hidden while the drawer is
  open, and drawer scrollable regions use contained overscroll behavior.
- Components involved: `ContextPanel`/`AgentDrawer`, `PageShell`, `ChatView`.
- Priority: high.
- Status: accepted.

## 5. Entity List Page Decisions

### UI-DEC-009: Canonical entity list anatomy

- Decision: Entity collection routes must use `EntityListPage` with `PageHeader`, optional concise description, one primary create action, `SearchFilterRow`, list body, and structured empty/loading/error states.
- Rationale: Lists are for scanning and navigation first, creation second.
- Evidence from audit: `02`, `05`, `07`, `09`, `23`, `24` show incompatible list/create/search behavior.
- Applies to: `/organizations`, `/people`, `/projects`, `/tasks`, `/ideas`, `/habits`, category/life-area list.
- Implementation implications: always-visible create forms should be removed from default list state during route migration.
- Components involved: `EntityListPage`, `PageHeader`, `SearchFilterRow`, `EntityRow`, `EmptyState`, `LoadingState`, `ErrorState`.
- Priority: high.
- Status: accepted.

### UI-DEC-010: Create action on list pages

- Decision: Create forms must not be visible by default on list pages. Creation starts from a primary action and opens a compact inline create row, modal or drawer depending on workflow size.
- Rationale: Always-visible forms make sparse lists feel like data-entry screens.
- Evidence from audit: `02-organizations-list.png`, `05-people-list.png`, `07-projects-list.png`.
- Applies to: `/organizations`, `/people`, `/projects`, `/ideas`, `/habits`; later `/tasks` if task creation is added to the list.
- Implementation implications: one visible primary create action per list page; create fields hidden until requested.
- Components involved: `PageHeader`, `EntityActionBar`, `EditModal`, `EditDrawer`, compact create row variant.
- Priority: high.
- Status: accepted.

### UI-DEC-011: List row content

- Decision: List rows/cards show only title/name, object type if needed, primary state, one or two supporting facts and compact relationship hints. They must not show full descriptions or full metadata.
- Rationale: Lists are scanning surfaces, not detail pages.
- Evidence from audit: project list `07` shows uneven card density; task list `09` is dense but lacks filter/grouping hierarchy.
- Applies to: all entity lists.
- Implementation implications: define `EntityRow` variants before migrating people/organizations/project lists.
- Components involved: `EntityRow`, `RelationHint`, `MetadataGrid` only for compact secondary facts if needed.
- Priority: high.
- Status: accepted.

### UI-DEC-012: Destructive list actions

- Decision: Destructive actions must not be persistently prominent on every list row. They belong in secondary overflow or reveal-on-intent controls with confirmation.
- Rationale: Always-visible delete icons compete with scanning and increase accidental-action risk.
- Evidence from audit: `09-tasks-list.png`.
- Applies to: `/tasks`, future entity rows, relationship rows.
- Implementation implications: task row migration should move delete into a secondary action pattern.
- Components involved: `EntityActionBar`, row overflow menu, `ConfirmModal`.
- Priority: medium.
- Status: accepted.

## 6. Entity Detail Page Decisions

### UI-DEC-013: Canonical entity detail anatomy

- Decision: Entity detail routes must use this order: `EntityHeader`, primary meaning/context section, current action relevance, relationships, secondary metadata, technical disclosure if needed.
- Rationale: The user should understand the object and next action before seeing secondary facts or editing controls.
- Evidence from audit: `03`, `06`, `08`, `10`, `11` confirm incompatible detail structures.
- Applies to: `/organizations/:id`, `/people/:id`, `/projects/:id`, `/initiatives/:id`, `/tasks/:id`, `/categories/:name`.
- Implementation implications: Phase 5 should establish the anatomy on `/organizations/:id`.
- Components involved: `EntityDetailPage`, `EntityHeader`, `DescriptionBlock`, `RelationList`, `MetadataGrid`, `SectionBlock`.
- Priority: high.
- Status: accepted.

### UI-DEC-014: Entity detail edit entry points

- Decision: Entity detail pages must expose edit entry points as section/header actions. They must not render grouped forms in the default page body.
- Rationale: Read and edit tasks have different cognitive modes.
- Evidence from audit: `06-person-detail.png` is form-first; `03-organization-detail.png` is closer to read-first but still has inline member creation.
- Applies to: person profile data, organization core data, category description, task metadata, project dates.
- Implementation implications: person master data moves to `EditModal`; organization member add moves to `RelationshipManager`.
- Components involved: `EditModal`, `EditDrawer`, `RelationshipManager`, `SectionHeader`.
- Priority: high.
- Status: accepted.

### UI-DEC-015: Empty sections on detail pages

- Decision: Empty detail sections must be useful but visually subordinate. Ordinary empty relationship groups should collapse, render no body, or use a tiny inline hint when they are not the current primary workflow. Heavy empty-state cards are reserved for meaningful empty pages, major empty work areas or absence that is itself action-relevant.
- Rationale: Empty boxes with equal weight make sparse entities feel busier than they are.
- Evidence from audit: `03`, `06`, `11`, `24` show empty panels/columns competing with populated content.
- Applies to: relationships, contact points, addresses, tasks, notes, descriptions.
- Implementation implications: `RelationList` / `RelationGroup` must support light empty behavior such as hidden empty body, inline hint, or full card only when justified. `EmptyState` must not be the automatic default for every empty relation group.
- Components involved: `EmptyState`, `SectionBlock`, `RelationList`, `RelationGroup`, `DescriptionBlock`.
- Priority: high.
- Status: accepted.

## 7. Entity Header Decisions

### UI-DEC-016: Entity header slots

- Decision: `EntityHeader` must have stable slots: breadcrumb/back context, title/name, one optional subtitle/context line, compact state summary, secondary actions, and DMAX context action. Entity type labels and title icons are optional contextual aids, not default detail-page chrome.
- Rationale: Headers must answer what this object is, where it sits, what state it is in and what can happen next.
- Evidence from audit: `08-project-detail.png` shows title, type, status, phase and date competing; `03` and `06` differ in header structure. Human review after Phase 7A found that default title icons and object-type eyebrows add noise on normal entity detail pages.
- Applies to: all detail routes.
- Implementation implications: do not add arbitrary pills into headers; route-specific metadata must be classified before display. Use inline/direct editing for small high-frequency fields such as title/name and subtype where safe. Reserve entity type labels for ambiguous contexts such as mixed lists, relation rows, search results and debug/inspector views.
- Components involved: `EntityHeader`, `EntityTitle`, `EntityStatusBadge`, `EntityActionBar`, `ContextPanelButton`.
- Priority: high.
- Status: accepted.

### UI-DEC-017: Header metadata limits

- Decision: Headers may show only metadata that changes immediate interpretation or action: subtype, status/state, category/parent context, critical date state and sync/lock state. IDs, created/updated timestamps, legal/internal fields and debug state must not appear in the header.
- Rationale: Header overload weakens primary object clarity.
- Evidence from audit: project header in `08` and date modal in `17` show how state/date/sync controls can crowd identity.
- Applies to: all entity headers.
- Implementation implications: secondary metadata goes into `MetadataGrid`; technical metadata into disclosure.
- Components involved: `EntityHeader`, `MetadataGrid`, `TechnicalMetadataDisclosure`.
- Priority: high.
- Status: accepted.

## 8. Section And Layout Decisions

### UI-DEC-018: Section block usage

- Decision: `SectionBlock` is the default detail-page section primitive. It must include a consistent `SectionHeader`, optional description, action slot, body and compact empty state. Section descriptions are optional, not default, and must be omitted when the title and content are self-explanatory.
- Rationale: Current panels use similar visual boxes without shared hierarchy.
- Evidence from audit: `03`, `06`, `08`, `10`, `11`, `14` show many bordered boxes of equal weight.
- Applies to: all detail pages, utility pages where appropriate.
- Implementation implications: existing generic `Panel` should evolve into `SectionBlock` or be wrapped by it during migration. Do not add subtitles like `Direkte Wege zur Organisation`, `Postalische Orte und Rechnungsadressen` or generic relationship explanations when titles such as `Kontaktwege`, `Anschriften` and `Beziehungen` are enough.
- Components involved: `SectionBlock`, `SectionHeader`, `EmptyState`.
- Priority: high.
- Status: accepted.

### UI-DEC-019: Bordered box discipline

- Decision: Do not wrap every concept in a separate card. Use cards only for repeated items, modal/inspector surfaces or sections that need clear containment. Page sections should rely on spacing and headers before extra boxes.
- Rationale: Too many equally weighted boxes create quiet but real visual noise.
- Evidence from audit: `03`, `06`, `14`, `18` show too many containers with similar weight.
- Applies to: all routes.
- Implementation implications: Phase 5 should define `SectionBlock` visual weight before component migration.
- Components involved: `SectionBlock`, `EntityRow`, `RelationItem`, `InspectorModal`.
- Priority: medium.
- Status: accepted.

## 9. Description And Markdown Decisions

### UI-DEC-020: DescriptionBlock default behavior

- Decision: Long text and markdown fields must use `DescriptionBlock` with rendered read mode, summary-first display, expand/collapse for long content, and a compact quiet empty state. On normal entity detail pages, the description surface may be headingless and click-to-edit; visible edit/add buttons are not required by default.
- Rationale: Long markdown is important memory, but it must not dominate every visit.
- Evidence from audit: `08-project-detail.png` shows project detail dominated by markdown; `03` and `11` show shorter description panels. Human review after Phase 7A found that a visible `Beschreibung` heading and repeated edit/add buttons made the organization description area feel like a labeled form section.
- Applies to: organization description, future person context, project markdown, category description, task notes, habit description.
- Implementation implications: full project markdown should not fill the first viewport by default; define summary extraction or max visible height.
- Components involved: `DescriptionBlock`, `RichText`, `EditDrawer`, `EditModal`.
- Priority: high.
- Status: accepted.

### UI-DEC-021: Description editing

- Decision: Short descriptions edit in `EditModal`; long markdown/context edits in `EditDrawer` or a dedicated editor mode. Inline full-panel textarea editing is not the default.
- Rationale: Equivalent text fields currently use inconsistent edit patterns.
- Evidence from debt/gaps: category, initiative, task and organization text fields use different patterns. Audit confirms visual inconsistency in `03`, `08`, `10`, `11`.
- Applies to: descriptions, notes, initiative memory, organization markdown.
- Implementation implications: Phase 5 organization description can use modal initially, but the pattern must allow drawer for longer content.
- Components involved: `DescriptionBlock`, `EditModal`, `EditDrawer`, `SaveStateIndicator`.
- Priority: high.
- Status: accepted.

## 10. Relationship Display Decisions

### UI-DEC-022: Relationship display is core UI

- Decision: Relationships must use canonical `RelationList`, `RelationGroup` and `RelationItem` patterns. Relationship display is not a secondary afterthought.
- Rationale: DMAX's value is the graph of categories, projects, tasks, people, organizations and time.
- Evidence from audit: `03`, `06`, `08`, `11`, `13` show fragmented linked-object visuals.
- Applies to: members, participants, linked initiatives/tasks, party relationships, DMAX participations, category-contained initiatives, predecessor/successor/dependency relations, calendar links.
- Implementation implications: relationship sections must be migrated before route-specific relationship managers multiply.
- Components involved: `RelationList`, `RelationGroup`, `RelationItem`, `RelationshipTypeBadge`.
- Priority: high.
- Status: accepted.

### UI-DEC-023: Relationship item anatomy

- Decision: A `RelationItem` must show object type, title/name, relationship direction/type if meaningful, one supporting fact, and open action. Remove/edit actions are secondary.
- Rationale: Relationship rows should be scannable before they are editable.
- Evidence from audit: `03` member add row, `06` relationship panels, `13` planning edges and `07` project structures all use different semantics.
- Applies to: all relationship rows.
- Implementation implications: define relation direction labels before broad migration.
- Components involved: `RelationItem`, `RelationshipTypeBadge`, `EntityRow`.
- Priority: high.
- Status: accepted.

### UI-DEC-024: Relationship management

- Decision: Relationship reading and relationship editing must be separated. `RelationList`, `RelationGroup` and `RelationItem` are display primitives. Section/group-level link actions may be visible, but complex add/remove/edit flows open `RelationshipManager` in a drawer or modal with `RelationPicker`; inline relationship forms are not default.
- Rationale: Inline relationship editing competes with reading current relationships.
- Evidence from audit: `03-organization-detail.png` shows inline member creation; Phase 2 identifies `InitiativeRelationsPanel` as a four-column display/edit mix.
- Applies to: organization members, participants, party relationships, initiative dependencies, DMAX participations.
- Implementation implications: relationship sections should keep add/link actions visible but calm. Use labels such as `Person verknüpfen`, `Organisation verknüpfen`, `Initiative verknüpfen` and `Maßnahme verknüpfen` when the backend/data model supports those links. Do not turn empty relation groups into heavy "nothing here" blocks.
- Components involved: `RelationshipManager`, `RelationPicker`, `RelationList`, `EditDrawer`, `EditModal`.
- Priority: high.
- Status: accepted.

## 11. Contact Point And Address Decisions

### UI-DEC-025: Contact points

- Decision: Contact points use `ContactPointList` and `ContactPointEditor`. Display rows show type, value, optional label, primary/preferred state and copy/open/edit actions. `Kontaktwege` is normally self-explanatory and does not need a subtitle.
- Rationale: Contact points are reused by people and organizations and are close to canonical already.
- Evidence from audit: `03`, `19`, `25` show the same contact point modal/list pattern across parties.
- Applies to: `/people/:id`, `/organizations/:id`.
- Implementation implications: promote current party contact implementation into a shared component during organization reference work. Keep `Kontaktweg hinzufügen` visible enough when the list is empty, but keep the empty copy compact.
- Components involved: `ContactPointList`, `ContactPointEditor`, `EditModal`, `EmptyState`.
- Priority: high.
- Status: accepted.

### UI-DEC-026: Addresses

- Decision: Addresses use `AddressBlock` and `AddressEditor`. Display mode is human-readable address lines; edit mode is a structured modal/drawer. `Anschriften` is normally self-explanatory and does not need a subtitle.
- Rationale: Addresses should not look like raw postal field grids outside editing.
- Evidence from audit: `03` shows address display; `20` shows raw address edit fields.
- Applies to: organizations now; people later if person addresses are added.
- Implementation implications: organization reference route should keep address display compact and move editing to `AddressEditor`. Keep `Anschrift hinzufügen` visible enough when the list is empty, but keep the empty copy compact.
- Components involved: `AddressBlock`, `AddressEditor`, `EditModal`, `EmptyState`.
- Priority: medium.
- Status: accepted.

## 12. Metadata And Technical Information Decisions

### UI-DEC-027: Metadata levels

- Decision: DMAX uses three metadata levels: primary facts, secondary metadata and technical/debug metadata.
- Rationale: Current UI mixes these levels inconsistently.
- Evidence from audit: `14`, `15`, `18`, `21`; Phase 2 finding 5.
- Applies to: entity detail pages, config, prompt inspector, media modal, Google event dialog, calendar sync state.
- Implementation implications: classify fields before rendering them. Primary facts may appear in header/body; secondary facts use `MetadataGrid`; technical facts use `TechnicalMetadataDisclosure` or debug page.
- Components involved: `EntityHeader`, `MetadataGrid`, `TechnicalMetadataDisclosure`, `InspectorModal`.
- Priority: high.
- Status: accepted.

### UI-DEC-028: Technical metadata containment

- Decision: IDs, raw timestamps, route/context IDs, sync payload details, OpenClaw trace events and raw API/database terms must be hidden from normal product screens.
- Rationale: Technical density should support debugging, not normal thinking/planning.
- Evidence from audit: `15-prompts.png` and `14-config.png` are valid debug/config density; `26` is invalid normal-flow technical copy.
- Applies to: all normal routes; debug/config exceptions.
- Implementation implications: `TechnicalMetadataDisclosure` must be added before metadata-heavy route refactors.
- Components involved: `TechnicalMetadataDisclosure`, `DebugInspectorPage`, `ErrorState`.
- Priority: high.
- Status: accepted.

## 13. Editing Pattern Decisions

### UI-DEC-029: Editing method matrix

- Decision: Editing method is chosen by field scope:
  - Inline edit: title/name, status, priority, short date field, small high-frequency value.
  - Section-level edit: description/notes quick action, contact/address section action.
  - `EditModal`: small grouped master data, contact point, address, date group.
  - `EditDrawer`: long markdown/context, relationship management, multi-field planning.
  - Dedicated edit mode: only for a major workflow such as future full markdown editor.
  - `ConfirmModal`: destructive or difficult-to-reverse actions.
- Rationale: Current equivalent content uses inconsistent edit patterns.
- Evidence from audit: `06`, `17`, `19`, `20`, `08`; Phase 2 finding 4.
- Applies to: all edit flows.
- Implementation implications: stop introducing route-local form behavior; every edit entry point declares its method.
- Components involved: `InlineEditableField`, `EditModal`, `EditDrawer`, `RelationshipManager`, `ConfirmModal`, `SaveStateIndicator`.
- Priority: high.
- Status: accepted.

### UI-DEC-030: Save/cancel and unsaved state

- Decision: Modal/drawer forms must have consistent footer actions and keyboard behavior: cancel secondary, save primary, destructive actions separated, `Escape` closes the modal, `Enter` in single-line text fields submits the form, and tab order from the last field moves to the primary save action before cancel. Unsaved, saving, saved and failed states must be visible where edits can persist.
- Rationale: Save behavior is currently implicit or route-local.
- Evidence from audit: modal screenshots `17`, `19`, `20`; Phase 2 state handling issues.
- Applies to: all edit modals, drawers and inline edits.
- Implementation implications: add `SaveStateIndicator` before broad edit migration where feasible. Keep DOM tab order aligned with save-first keyboard flow even when visual layout keeps cancel left and save right.
- Components involved: `FormActions`, `SaveStateIndicator`, `EditModal`, `EditDrawer`, `InlineEditableField`.
- Priority: high.
- Status: accepted.

## 14. Modal And Drawer Decisions

### UI-DEC-031: Modal variants

- Decision: Use named modal variants:
  - `EditModal` for small grouped edits.
  - `EditDrawer` for larger contextual edits where page context matters.
  - `InspectorModal` for media, calendar event inspection and dense read-mostly content.
  - `ConfirmModal` for destructive confirmation.
- Rationale: Current modal families differ by route and CSS class rather than workflow intent.
- Evidence from audit: `17`, `18`, `19`, `20`, `21`; Phase 2 gap `GAP-012`.
- Applies to: all modals and drawers.
- Implementation implications: modal refactors should classify each existing modal by intent before restyling.
- Components involved: `EditModal`, `EditDrawer`, `InspectorModal`, `ConfirmModal`.
- Priority: high.
- Status: accepted.

### UI-DEC-032: Modal content rules

- Decision: Modals may contain dense forms only when the user intentionally entered edit mode. Inspector modals may contain dense metadata only if primary content remains dominant and metadata is grouped or collapsible.
- Rationale: Modal density should not become an excuse for dumping all data.
- Evidence from audit: `18-media-modal.png` shows viewer, metadata, caption, analysis and re-analysis at once.
- Applies to: media modal, Google event dialog, project date modal, contact/address modals.
- Implementation implications: media modal should become `InspectorModal`; technical metadata should move into disclosure.
- Components involved: `InspectorModal`, `MetadataGrid`, `TechnicalMetadataDisclosure`, `EditModal`.
- Priority: medium.
- Status: accepted.

## 15. Contextual DMAX Agent Drawer Decisions

### UI-DEC-033: ContextPanel behavior

- Decision: The DMAX contextual drawer is a `ContextPanel`. On entity detail pages the DMAX button appears in or adjacent to `EntityHeader` as a stable contextual action. A successful drawer open shows current context label, conversation controls, message thread, composer and optional activity trail.
- Rationale: Contextual chat is a major product surface and must be governed like other drawers.
- Evidence from inventory: `AgentDrawer`, `ChatView`, `DmaxAgentButton`; audit `04-project-detail-dmax-drawer.png`.
- Applies to: all entity detail routes and context-capable utility routes.
- Implementation implications: Phase 5 organization reference must account for drawer layout and context action placement.
- Components involved: `ContextPanel`, `ContextPanelButton`, `EntityHeader`, `ErrorState`.
- Priority: high.
- Status: accepted.

### UI-DEC-034: Context error handling

- Decision: Contextual-agent technical errors must be translated into user-facing `ErrorState` copy. Raw errors such as `contextEntityId is required for organization conversations` must not appear in the normal UI.
- Rationale: The user needs to know that DMAX context could not open, not see schema/API internals.
- Evidence from audit: `26-organization-detail-agent-error.png`.
- Applies to: DMAX drawer open failures, chat prewarm/open failures, entity context mismatch.
- Implementation implications: Phase 5 must investigate and fix or contain the `/organizations/:id` context bug while implementing the organization reference route.
- Components involved: `ContextPanel`, `ErrorState`, `EntityHeader`.
- Priority: high.
- Status: accepted.

## 16. Time, Calendar, Timeline And Planning Decisions

### UI-DEC-035: Shared time vocabulary

- Decision: Time-related surfaces must share first-level semantics: `DateRangeDisplay`, `TimeBlock`, `CalendarEventLinkBlock`, `SyncStateBadge` and `LockIndicator`.
- Rationale: Calendar, timeline, planning canvas and project date controls currently teach separate time languages.
- Evidence from audit: `12`, `13`, `17`, `22`.
- Applies to: `/calendar`, `/calendar/timeline`, `/planning-canvas`, project date controls, Google event dialogs.
- Implementation implications: do not redesign calendar/planning fully in Phase 5; only define and reuse semantic indicators when touched by the organization reference route if needed.
- Components involved: `DateRangeDisplay`, `TimeBlock`, `CalendarEventLinkBlock`, `SyncStateBadge`, `LockIndicator`.
- Priority: medium.
- Status: accepted.

### UI-DEC-036: Calendar/planning redesign deferral

- Decision: Detailed calendar, timeline and planning canvas redesign is deferred. Phase 5 may only fix time semantics that intersect the first reference route.
- Rationale: These surfaces are complex enough to require their own implementation phase.
- Evidence from audit: `12-calendar.png` and `13-planning-canvas.png` show high-density specialized workflows.
- Applies to: `/calendar`, `/calendar/timeline`, `/planning-canvas`.
- Implementation implications: avoid broad calendar/canvas refactors during organization reference implementation.
- Components involved: time/calendar components above.
- Priority: medium.
- Status: accepted.

## 17. Debug, Config And Utility Surface Decisions

### UI-DEC-037: Utility/debug page containment

- Decision: Utility and debug pages use separate governed patterns: `UtilityPage` for user-facing configuration and `DebugInspectorPage` for developer/trace inspection.
- Rationale: Technical density is acceptable only when the surface is explicitly utility/debug.
- Evidence from audit: `14-config.png`, `15-prompts.png`, `16-prompt-templates.png`, `27-drive-mode.png`.
- Applies to: `/config`, `/prompts`, `/prompt-vorlagen`, `/drive`, media inspector surfaces.
- Implementation implications: config/debug pages should not be used as visual references for entity/list pages.
- Components involved: `UtilityPage`, `DebugInspectorPage`, `PromptInspectorPanel`, `InspectorModal`.
- Priority: medium.
- Status: accepted.

## 18. Empty, Loading, Error And Save-State Decisions

### UI-DEC-038: Structured state components

- Decision: DMAX must use canonical state components: `EmptyState`, `LoadingState`, `ErrorState`, `SaveStateIndicator`, `IntegrationState` and `MissingDataState`.
- Rationale: Current states are title-only, missing or semantically mixed.
- Evidence from Phase 2: `EmptyState` doubles as loading/not-found; audit partially confirms inconsistent states and raw error in `26`.
- Applies to: all routes and async sections.
- Implementation implications: organization reference route should introduce structured empty/error states for description, contact points, addresses, members, relationships and DMAX contexts.
- Components involved: state components listed above.
- Priority: high.
- Status: accepted.

### UI-DEC-039: Error copy

- Decision: Error states must state what failed and what the user can do. Technical details may be available in disclosure only on debug/config surfaces.
- Rationale: Raw technical errors break product trust and leak implementation.
- Evidence from audit: `26-organization-detail-agent-error.png`.
- Applies to: route load errors, save failures, DMAX drawer context errors, integration errors.
- Implementation implications: introduce user-facing error mapping before fixing individual UI surfaces.
- Components involved: `ErrorState`, `IntegrationState`, `TechnicalMetadataDisclosure`.
- Priority: high.
- Status: accepted.

## 19. Component System Decisions

The following component system is the canonical target. Component names may be adapted to local file names, but the concepts and responsibilities must remain stable.

| Component | Purpose | Applies to | Must contain | Must not contain | First priority | First reference route |
|---|---|---|---|---|---|---|
| `PageShell` | Stable app frame | all routes | sidebar, main content, optional drawer slots | route business logic | high | yes |
| `PageHeader` | Header for list/utility pages | lists, utilities | title, optional description, primary action | entity-specific metadata | high | no |
| `EntityListPage` | Canonical collection page | people, orgs, tasks, initiatives | header, search/filter, list body, states | always-visible create form | high | no |
| `SearchFilterRow` | Compact filtering | lists | search, important filters | full advanced config by default | high | no |
| `EntityRow` | Scannable list item | all lists | title, state, 1-2 facts, relation hint | full description, raw metadata | high | no |
| `EntityDetailPage` | Canonical detail anatomy | all entity details | header, primary content, relationships, metadata | permanent raw form | high | yes |
| `EntityHeader` | Identity/action summary | all detail pages | breadcrumb, title, optional subtype/status, secondary actions, DMAX entry | mandatory type eyebrow/icon, IDs, audit timestamps, full field list | high | yes |
| `EntityActionBar` | Stable action placement | headers/sections | primary action, secondary actions, overflow | multiple competing primary buttons | high | yes |
| `SectionBlock` | Detail section primitive | detail pages | header, body, optional action/state | arbitrary decorative card nesting | high | yes |
| `SectionHeader` | Section title/action row | sections | title, optional description/action | route-local action chaos | high | yes |
| `DescriptionBlock` | Read-first markdown/text | descriptions/notes | summary, expand, quiet click-to-edit surface, empty state | raw textarea default, mandatory heading/action buttons | high | yes |
| `RelationList` | Relationship display | detail pages | grouped relation items | unrelated mixed rows without grouping | high | yes |
| `RelationGroup` | Relationship grouping | relation-heavy pages | type/count, items, compact empty state | full edit form | high | yes |
| `RelationItem` | Linked object row | relationships | type, title, relation label, supporting fact, open action | raw IDs, heavy metadata | high | yes |
| `RelationshipManager` | Relationship editing | members, participants, dependencies | picker, relation type, add/remove/edit controls | default read-only display | high | yes |
| `RelationPicker` | Find/link existing objects | relationship edits | search, type filter, selected state | raw select-only flows for complex relations | high | yes |
| `MetadataGrid` | Secondary metadata | details, modals | labeled secondary facts | primary content or technical dumps | high | yes |
| `TechnicalMetadataDisclosure` | Debug/technical containment | config/debug/modals | collapsible technical facts | always-open technical content in normal UI | high | no |
| `EditModal` | Small grouped edit | master data, contact, address, date group | header, form, footer, errors | long contextual editor | high | yes |
| `EditDrawer` | Larger contextual edit | long text, relationship manager | header, body, footer, save state | tiny one-field edit | medium | yes |
| `InspectorModal` | Dense read-mostly inspection | media, Google event | primary viewer/summary, grouped metadata/actions | unmanaged all-data dump | medium | no |
| `ConfirmModal` | Destructive confirmation | deletes/unlinks/archive | consequence, cancel, destructive confirm | ordinary save confirmation | medium | no |
| `EmptyState` | Empty content/page | all routes | specific title, helpful body, optional action | generic "No data" | high | yes |
| `LoadingState` | Loading content/page | async routes | calm loading indicator/copy | fake empty state | high | yes |
| `ErrorState` | Recoverable failures | async/routes/drawer | what failed, action, optional details | raw technical message as main copy | high | yes |
| `SaveStateIndicator` | Save lifecycle | edits | idle/saving/saved/failed | hidden failed save | medium | yes |
| `IntegrationState` | External service state | Google, LiveKit, OpenClaw | connected/disconnected/error/retry | raw provider exception only | medium | no |
| `MissingDataState` | Incomplete object state | sparse details | what is missing, why it matters, action | generic empty state | medium | yes |
| `ContactPointList` | Contact display | people/orgs | type, value, label, primary/preferred, actions | raw DB fields | high | yes |
| `ContactPointEditor` | Contact editing | people/orgs | typed fields, booleans, validation, footer | route-specific form shape | high | yes |
| `AddressBlock` | Human-readable address | orgs, future people | label, address lines, primary, actions | raw field grid | high | yes |
| `AddressEditor` | Address editing | orgs, future people | postal fields, validation, footer | display-only layout | medium | yes |
| `ContextPanel` | DMAX drawer | context-capable routes | context label, conversations, thread, composer, activity | raw context errors | high | yes |
| `DateRangeDisplay` | Date range | projects/tasks/calendar | missing/flexible/locked/synced states | ambiguous date text | medium | no |
| `TimeBlock` | Planned time block | calendar/planning | time, title, source/state | external event semantics without label | medium | no |
| `CalendarEventLinkBlock` | Calendar relation | project/calendar | event title, date/time, source, sync state | raw calendar IDs by default | medium | no |
| `SyncStateBadge` | Sync state | Google/calendar/media | synced/imported/read-only/error | one-off `G` badges without meaning | medium | no |
| `LockIndicator` | Fixed/flexible time | project/time surfaces | locked/flexible state | loud decorative lock | medium | no |
| `UtilityPage` | User-facing settings utility | config/drive | header, sections, integration states | entity detail layout assumptions | medium | no |
| `DebugInspectorPage` | Developer/trace utility | prompts/templates | side list, detail inspector, technical metadata | normal product tone | medium | no |

## 20. First Reference Implementation Decision

### UI-DEC-040: First reference route

- Decision: `/organizations/:id` remains the first reference implementation route for Phase 5.
- Rationale: It contains identity, description, contact points, addresses, members, relationships, DMAX participations/context and the DMAX contextual action without the severe markdown overload of project detail.
- Evidence from audit: `03-organization-detail.png`, `19-contact-point-modal.png`, `20-address-modal.png`, `26-organization-detail-agent-error.png`.
- Applies to: Phase 5 implementation scope.
- Implementation implications: implement first canonical components on organization detail; use the result to migrate person detail next, then project/task/category details.
- Components involved: `EntityDetailPage`, `EntityHeader`, `SectionBlock`, `DescriptionBlock`, `ContactPointList`, `AddressBlock`, `RelationList`, `RelationshipManager`, `MetadataGrid`, `EditModal`, `EmptyState`, `ErrorState`, `ContextPanel`.
- Priority: high.
- Status: accepted.

What `/organizations/:id` should establish:

- Read-first entity detail anatomy.
- Stable entity header.
- Section blocks and section actions.
- Description block behavior.
- Contact point and address display/edit patterns.
- Relationship display and relationship management entry point.
- Secondary metadata placement.
- DMAX context action placement and error behavior.

Routes that should later reuse the pattern:

- `/people/:id`
- `/projects/:id` and `/initiatives/:id`
- `/tasks/:id`
- `/categories/:name`
- future habit/detail routes

Risks:

- The organization DMAX drawer bug must be fixed or contained in Phase 5.
- Sparse local organization data may under-test dense relationship display.
- Overfitting the organization route could fail project/task detail needs if component slots are too narrow.

Must be handled in Phase 5:

- Investigate and fix or contain the `/organizations/:id` DMAX drawer context bug: `contextEntityId is required for organization conversations`.
- Preserve existing behavior and data model.
- Avoid route-wide redesign beyond the reference route.

Phase 5 implementation outcome:

- `/organizations/:id` now uses the first implemented `EntityDetailPage` reference anatomy in `web/src/App.tsx`.
- The route now uses `EntityHeader`, `SectionBlock`, `DescriptionBlock`, `RelationList`, `RelationGroup`, `RelationItem`, `MetadataGrid`, `EditModal`, `ContactPointList`, `AddressBlock`, `EmptyState` and `ErrorState`.
- The existing `ContactPointModal` and `AddressModal` remain the current editor equivalents.
- The full `RelationshipManager` remains deferred; organization-person relationship creation is contained behind an edit modal.
- The organization/person DMAX drawer context bug was fixed at the client query-param boundary by sending `contextEntityId` from `partyId`.
- Contextual drawer load failures are now contained behind user-facing copy instead of exposing the raw `contextEntityId` error.

Must not be attempted in first reference implementation:

- Broad app-wide language migration unless explicitly confirmed.
- Full calendar/timeline/planning canvas redesign.
- Prompt/config/debug redesign.
- Data model changes.
- Moving people/organizations under a new `/context` route.
- Full project markdown redesign beyond component compatibility.

## 21. Decisions Intentionally Deferred

### UI-DEC-041: Language finalization

- Decision: German is recommended, but final product language requires human confirmation.
- Rationale: Copy migration affects all routes and should not be hidden inside the first component refactor.
- Evidence from audit: mixed UI copy is confirmed.
- Applies to: all UI text.
- Implementation implications: Phase 5 may align only copied/touched route labels if human confirms; otherwise keep existing copy where not directly part of reference route.
- Components involved: all.
- Priority: high.
- Status: needs human confirmation.

### UI-DEC-042: Context hub IA

- Decision: Creating a `/context` hub for people, organizations and relationships is deferred.
- Rationale: No `/context` route exists, and introducing it would be a product IA change beyond UI stabilization.
- Evidence from route inventory: people and organizations are top-level routes; `/context` does not exist.
- Applies to: navigation and IA.
- Implementation implications: keep people and organizations routes as-is during Phase 5.
- Components involved: sidebar, `EntityListPage`.
- Priority: medium.
- Status: accepted.

### UI-DEC-043: Full calendar/planning redesign

- Decision: Full redesign of calendar, timeline and planning canvas is deferred.
- Rationale: These are specialized high-density workflows requiring a dedicated phase.
- Evidence from audit: `12`, `13`, `22`.
- Applies to: `/calendar`, `/calendar/timeline`, `/planning-canvas`.
- Implementation implications: define shared semantics now; implement later.
- Components involved: time/calendar components.
- Priority: medium.
- Status: accepted.

### UI-DEC-044: Mobile/narrow layout decisions

- Decision: Final responsive layout decisions are deferred until mobile/narrow screenshots are captured.
- Rationale: Phase 3 captured desktop only.
- Evidence from screenshot inventory: mobile, tablet and narrow desktop screenshots are missing.
- Applies to: all canonical components.
- Implementation implications: Phase 5 should avoid hard-coding desktop-only assumptions, especially for drawer/detail layouts.
- Components involved: `PageShell`, `EntityDetailPage`, `ContextPanel`, modals.
- Priority: medium.
- Status: proposed.

## 22. Open Questions For Human Review

- Confirm product language: German normal UI or English normal UI?
- If German is confirmed, should `Planning Canvas`, `Drive Mode`, `Config` and `Prompt Inspector` also be translated?
- Should `Lebensbereich` remain the public term for category?
- Should `Maßnahmen` continue to mean tasks, or should the UI switch to `Aufgaben`?
- Should organization legal name and type be visible as secondary metadata or only inside edit modal?
- Should member linking on organization detail use modal or drawer first?
- Should empty relationship sections collapse by default or show compact empty states?
- Should project markdown summary be generated from markdown headings or from a stored summary field?
- Should the DMAX drawer be resizable in the first reference implementation, or should resizing remain as current behavior until a later shell pass?
- Should debug/config routes stay in sidebar or move behind a utility/debug area later?

## 23. Implementation Implications For The Next Phase

Phase 5 should be a narrow reference implementation, not a broad app refactor.

Recommended Phase 5 scope:

1. Implement or extract the first shared primitives needed by `/organizations/:id`.
2. Migrate `/organizations/:id` to `EntityDetailPage`.
3. Make the organization route read-first and remove inline relationship creation from default reading flow.
4. Promote contact point and address surfaces into canonical patterns.
5. Add structured empty/error states for organization sections.
6. Add `MetadataGrid` placement for secondary organization facts if needed.
7. Investigate and fix or contain the organization DMAX drawer context bug.
8. Document any unresolved visual uncertainty after implementation.

Recommended first component batch:

1. `EntityDetailPage`
2. `EntityHeader`
3. `SectionBlock`
4. `SectionHeader`
5. `DescriptionBlock`
6. `RelationList`
7. `RelationGroup`
8. `RelationItem`
9. `MetadataGrid`
10. `EditModal`
11. `ContactPointList`
12. `ContactPointEditor`
13. `AddressBlock`
14. `AddressEditor`
15. `EmptyState`
16. `ErrorState`
17. `ContextPanel` error handling integration

Phase 5 must not:

- Refactor all detail pages at once.
- Refactor list pages before the detail reference is stable.
- Redesign calendar/timeline/planning.
- Rewrite config/prompt/debug surfaces.
- Perform data model changes.
- Change package dependencies unless separately requested.
- Treat the language recommendation as final without human confirmation.
