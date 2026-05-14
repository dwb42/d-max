# DMAX UI Screenshot Audit

This is the Phase 3 screenshot-based visual audit. It uses the screenshots in `docs/ui/screenshots/current/` and checks them against the Phase 0-2 UI governance documents.

This audit is intentionally strict. It does not propose implementation changes. It identifies visual debt, pattern gaps and evidence needed before Phase 4 design decisions.

## 1. Executive Summary

The screenshots confirm the Phase 2 diagnosis. DMAX has a usable and restrained base style, but the UI does not yet behave like one coherent product system.

The biggest visual issue is not loud color or decoration. The bigger issue is local composition: each route decides its own layout, editing shape, section density, action placement and relationship display. The result is a calm-looking UI that still feels structurally inconsistent.

The strongest reference candidate remains `/organizations/:id`. The organization detail screenshot shows the right raw ingredients for the future entity detail pattern: identity header, description, contact points, addresses, members, relationships and DMAX contexts. It is not final-quality yet, but it is a better reference base than the person detail, project detail or task detail screenshots.

The audit also surfaced one new important issue: attempting to open the DMAX drawer on `/organizations/:id` produced `contextEntityId is required for organization conversations` instead of opening the drawer. This should be treated as a contextual-agent integration bug or context-shape mismatch before organization detail becomes the reference route.

## 2. Screenshots Captured

Captured screenshots:

- `01-app-shell-categories.png`
- `02-organizations-list.png`
- `03-organization-detail.png`
- `04-project-detail-dmax-drawer.png`
- `05-people-list.png`
- `06-person-detail.png`
- `07-projects-list.png`
- `08-project-detail.png`
- `09-tasks-list.png`
- `10-task-detail.png`
- `11-category-detail.png`
- `12-calendar.png`
- `13-planning-canvas.png`
- `14-config.png`
- `15-prompts.png`
- `16-prompt-templates.png`
- `17-project-date-calendar-modal.png`
- `18-media-modal.png`
- `19-contact-point-modal.png`
- `20-address-modal.png`
- `21-google-event-dialog.png`
- `22-timeline.png`
- `23-ideas-list.png`
- `24-habits-list.png`
- `25-person-contact-point-modal.png`
- `26-organization-detail-agent-error.png`
- `27-drive-mode.png`

All screenshots are desktop viewport screenshots at 1440 x 1100.

## 3. Screenshots Missing Or Insufficient

- Working DMAX drawer on `/organizations/:id`; blocked by the organization context error.
- Editable Google event dialog and link/promote modes; only a read-only recurring event was captured.
- Relationship manager as a dedicated modal/drawer; only inline member add and empty relationship panels were captured.
- Mobile and narrow desktop versions of all canonical candidate routes.
- Error, loading, save-failure and retry states. The screenshots only show ordinary loaded states plus the organization agent error.
- Disconnected Google Calendar state.
- Detail routes with richer relationship data: organization with members, person with relationships, task with checklist/media/participants together.
- Lower scrolled project relation panel.

## 4. Overall Visual Diagnosis

DMAX looks restrained but not yet governed. The dominant visual language is light panels, thin borders, compact text and a dark left nav. That gives the UI a calm baseline. The problem is that the same primitives are used without enough hierarchy.

Many pages appear as a stack of bordered boxes. The boxes are visually polite, but they do not always answer the core questions: what object is this, what matters most, what relationship should I inspect, and what action should I take next?

List pages often start with forms. Detail pages often expose editable controls too early. Relationship-heavy pages show relationships as separate local panels rather than one shared graph language. Debug/config pages are useful but dense, and their technical density is not visually contained as a deliberate utility pattern.

The current UI is not visually chaotic. It is structurally under-specified.

## 5. Top 10 Visual Problems

| # | Screenshot | Route/view | Problem | Severity | Why it matters | Recommended direction | Scope | First-route influence |
|---|---|---|---|---|---|---|---|---|
| 1 | `03`, `06`, `08`, `10`, `11` | entity details | Detail pages do not share one visual anatomy | high | The user must relearn where identity, context, relationships, actions and metadata live. | Define `EntityDetailPage`, `EntityHeader`, `SectionBlock`, `RelationList`, `MetadataGrid`. | systemic | yes |
| 2 | `06-person-detail.png` | `/people/1` | Person detail is a permanent master-data form | high | It reads as admin CRUD, not a context/memory page. | Replace default form-first view with read-first identity/context/contact summary and section edit. | local/systemic | yes |
| 3 | `08-project-detail.png` | `/projects/1` | Project detail opens with a long markdown wall | high | The primary next action, tasks and relationships are pushed below a high-text block. | Summarize long description by default; expose full markdown through `DescriptionBlock` expansion/edit. | systemic | yes |
| 4 | `02`, `05`, `07`, `23`, `24` | list pages | List pages use incompatible create/search/list structures | high | Scanning and creation feel different per object type. | Define `EntityListPage`, `PageHeader`, `SearchFilterRow`, `CreateAction`, `EntityRow`. | systemic | yes |
| 5 | `03`, `06`, `08`, `11`, `13` | relationships | Relationship display has no shared visual language | high | DMAX is relation-heavy, but linked objects do not become a coherent graph. | Define grouped `RelationList` and separate `RelationshipManager`. | systemic | yes |
| 6 | `14`, `15`, `18`, `21` | config/debug/media/calendar modals | Technical metadata competes with user-facing content | high | Utility/debug data is useful but visually leaks into normal product language. | Define `MetadataGrid` and `TechnicalMetadataDisclosure`; govern utility pages separately. | systemic | no |
| 7 | `12`, `13`, `22`, `17` | calendar/timeline/planning | Time/event concepts are visually duplicated | medium | Fixed spans, flexible spans, Google events, project bars and locks use route-local semantics. | Define shared `DateRangeDisplay`, `TimeBlock`, `SyncStateBadge`, `LockIndicator`. | systemic | no |
| 8 | `17`, `18`, `19`, `20`, `21` | modals | Modal hierarchy and form density are inconsistent | medium | Modal size, labels, footer actions and metadata treatment vary by workflow. | Define modal intent/size variants and form footer rules. | systemic | yes |
| 9 | `01`, `02`, `05`, `09`, `14`, `15` | nav/copy/surfaces | Copy mixes German, English and internal terms | medium | Navigation and labels do not establish a stable product vocabulary. | Make one language decision and align labels in `UI_COPY_LANGUAGE.md`. | systemic | yes |
| 10 | `26-organization-detail-agent-error.png` | `/organizations/2` | Organization DMAX drawer fails with technical error | high | The contextual agent is a core surface; the error is exposed as raw technical copy. | Fix context propagation and define contextual-agent error copy/state. | local/systemic | yes |

## 6. Top 10 Highest-Leverage Visual Improvements

| # | Improvement | Evidence | Priority | Why it has leverage |
|---|---|---|---|---|
| 1 | Canonical `EntityDetailPage` | `03`, `06`, `08`, `10`, `11` | high | Stabilizes the most important route family. |
| 2 | Canonical `EntityHeader` | `03`, `06`, `08`, `10`, `17` | high | Fixes identity/action/metadata competition across details. |
| 3 | `SectionBlock` and `SectionHeader` | almost all detail screenshots | high | Replaces route-local panels with predictable section rhythm. |
| 4 | Read-first person/organization pattern | `03`, `06` | high | Converts CRM-like pages into DMAX context pages. |
| 5 | `DescriptionBlock` with summary/expand/edit | `03`, `08`, `10`, `11` | high | Prevents long text and empty descriptions from dominating pages. |
| 6 | `RelationList` plus `RelationshipManager` | `03`, `06`, `08`, `11`, `13` | high | Gives DMAX a coherent relationship language. |
| 7 | `EntityListPage` and `EntityRow` | `02`, `05`, `07`, `09`, `23`, `24` | high | Normalizes create/search/scan behavior. |
| 8 | `MetadataGrid` and technical disclosure | `14`, `15`, `18`, `21` | high | Separates primary facts from debug/config detail. |
| 9 | Modal system: `EditModal`, `InspectorModal`, `ConfirmModal` | `17`, `18`, `19`, `20`, `21` | medium/high | Prevents every workflow from inventing modal structure. |
| 10 | Time/calendar visual vocabulary | `12`, `13`, `22`, `17` | medium | Aligns calendar, timeline, planning canvas and project date controls. |

## 7. Screenshot-By-Screenshot Audit

| Screenshot | Route/view | Problem | Severity | Why it matters | Recommended direction | Scope | Influence first route |
|---|---|---|---|---|---|---|---|
| `01-app-shell-categories.png` | `/categories` | Category overview is a dashboard-like grid with many light boxes, counts and plus actions. | medium | It is scannable but visually unlike entity lists and category detail. | Decide whether category overview is a governed `CategoryOverviewPage` or an entity list variant. | systemic | yes |
| `01-app-shell-categories.png` | `/categories` | Navigation labels mix `Lebensbereiche`, `Ideen`, `Projekte`, `Massnahmen`, `Planning Canvas`, `Config`, `Drive`. | medium | The sidebar is the product vocabulary source. | Choose English or German globally before refactoring. | systemic | yes |
| `02-organizations-list.png` | `/organizations` | The first visible block is a create form, not the list. | high | A sparse list page feels like a data-entry screen. | Move create to a primary action or collapsed create row under `EntityListPage`. | systemic | yes |
| `02-organizations-list.png` | `/organizations` | Create, search and list are three separate bordered panels with weak hierarchy. | medium | The page has too much visible structure for one item. | Use one page header, one toolbar and one list surface. | systemic | yes |
| `03-organization-detail.png` | `/organizations/2` | Organization detail is the best reference candidate but still has too many equally weighted boxes. | medium | Description, contact, address, members, relationships and contexts have similar weight despite different importance. | Use `EntityDetailPage` with primary, relationship and metadata regions. | systemic | yes |
| `03-organization-detail.png` | `/organizations/2` | Member relationship creation is inline and visible by default. | medium | Relationship editing competes with reading members. | Show member relationships read-first; move add/link into `RelationshipManager`. | systemic | yes |
| `04-project-detail-dmax-drawer.png` | `/projects/1` | Drawer consumes roughly half the page and compresses a high-density project detail view. | medium | Contextual help should not make the underlying object unreadable. | Define `ContextPanel` width, content compression and responsive behavior. | systemic | yes |
| `04-project-detail-dmax-drawer.png` | `/projects/1` | Drawer body is mostly empty while the project page remains visually dense. | medium | The drawer state does not yet communicate context value. | Add structured drawer empty/welcome state and context summary rules. | systemic | no |
| `05-people-list.png` | `/people` | Person list repeats the organization list's form-first structure. | high | It confirms the list page problem is systemic. | Same `EntityListPage` pattern as organizations. | systemic | yes |
| `06-person-detail.png` | `/people/1` | Master data form dominates the person detail page. | high | The default state is editing, not understanding the person. | Convert to read-first identity/context/contact/relationship summary. | local/systemic | yes |
| `06-person-detail.png` | `/people/1` | Empty relationships and DMAX contexts sit beside the form with equal card weight. | medium | Empty secondary panels compete with primary identity. | Use grouped relationships with meaningful empty states lower in the page. | systemic | yes |
| `07-projects-list.png` | `/projects` | Create form, grouped category sections and variable card widths create uneven scanning. | high | Project scanning is a core workflow and should be predictable. | Define project list variant of `EntityListPage` with relation-aware rows. | systemic | yes |
| `07-projects-list.png` | `/projects` | Some project cards are wide rows while others become shorter cards. | medium | The list reads as assembled layout rather than intentional hierarchy. | Normalize project row/card dimensions and metadata positions. | local/systemic | no |
| `08-project-detail.png` | `/projects/1` | Long markdown fills the first viewport. | high | The user has to read too much before seeing tasks, relations or next actions. | Summarize, collapse or split markdown into purpose/current focus/notes. | systemic | yes |
| `08-project-detail.png` | `/projects/1` | Header exposes type, status, phase and date as pills in one line. | medium | Identity and editable metadata compete in the header. | Use `EntityHeader` with title, state summary and secondary edit controls. | systemic | yes |
| `09-tasks-list.png` | `/tasks` | Task rows are dense but lack filters, grouping and create/search affordances. | high | Tasks are a daily operating surface and need fast narrowing. | Define task list toolbar and task row states. | systemic | no |
| `09-tasks-list.png` | `/tasks` | Delete icons are visible on every row. | medium | Destructive affordances compete with scanning. | Move destructive actions into secondary row menu or reveal-on-intent pattern. | systemic | yes |
| `10-task-detail.png` | `/tasks/1` | Task detail does not clearly separate action definition, notes, checklist, participants and metadata. | medium | Task pages should support doing, not just inspecting. | Define task detail order and `TaskChecklistBlock`/`NotesBlock`. | local/systemic | no |
| `11-category-detail.png` | `/categories/Reisen` | Category detail mixes detail header, description and three-column initiative list. | medium | It is neither a pure detail page nor a canonical list page. | Decide category detail as governed detail/list hybrid. | systemic | yes |
| `11-category-detail.png` | `/categories/Reisen` | Empty idea/habit columns consume horizontal space. | medium | Empty relationship groups are visually equal to populated project list. | Collapse or de-emphasize empty groups; prioritize populated relationships. | local/systemic | yes |
| `12-calendar.png` | `/calendar` | Calendar is powerful but visually dense: sidebar, all-day lanes, timed grid and event colors all compete. | medium | Planning requires fast spatial comprehension. | Define time hierarchy for fixed commitments, flexible plans, tasks and Google state. | systemic | no |
| `12-calendar.png` | `/calendar` | Event labels truncate and colors vary without an obvious shared semantic key. | medium | The user must infer event meaning from local visual conventions. | Add shared `CalendarEventLinkBlock`/legend/state semantics where needed. | systemic | no |
| `13-planning-canvas.png` | `/planning-canvas` | Canvas uses many colors, lanes, edges, icons and truncated labels. | high | It is operationally rich but visually expensive. | Preserve canvas power but document it as a specialized governed surface. | local/systemic | no |
| `13-planning-canvas.png` | `/planning-canvas` | Google event rows and project bars use a separate visual language from calendar/timeline. | medium | Time concepts do not reinforce each other across routes. | Share `TimeBlock`, `SyncStateBadge`, `LockIndicator`. | systemic | no |
| `14-config.png` | `/config` | Google config shows accounts, calendars, source IDs, roles, buttons and warning copy in one dense stack. | high | Useful configuration becomes hard to parse and risks bleeding debug density into product UI. | Define `SettingsPage`, `MetadataGrid` and technical disclosure rules. | systemic | no |
| `15-prompts.png` | `/prompts` | Prompt inspector is raw and dense, with many technical timeline events and metadata cards. | medium | Debug surfaces need density, but they should be explicitly debug-only. | Define `DebugInspectorPage`, `TraceTimeline`, `PromptBlock`. | systemic | no |
| `16-prompt-templates.png` | `/prompt-vorlagen` | Utility route naming and structure are disconnected from the rest of the app. | low/medium | It reinforces mixed terminology and utility-page drift. | Govern utility pages separately and align route label language. | systemic | no |
| `17-project-date-calendar-modal.png` | Project date modal | Modal is small, centered and form-like, while underlying project detail remains visually overwhelming. | medium | Date/sync editing is important but visually isolated from time semantics elsewhere. | Define date/sync modal variant and reuse time vocabulary. | systemic | yes |
| `18-media-modal.png` | Media modal | PDF, metadata, caption, analysis and re-analysis are all visible at once. | high | It is powerful but high-density; metadata competes with content inspection. | Use `InspectorModal` with primary viewer, collapsible metadata and analysis sections. | systemic | no |
| `19-contact-point-modal.png` | Contact point modal | Checkbox labels are visually separated and form hierarchy is basic. | medium | Contact point editing should feel deliberate and polished because it will repeat across parties. | Define `ContactPointEditor` using modal form slots and clearer boolean controls. | systemic | yes |
| `20-address-modal.png` | Address modal | Address editing uses raw postal fields without a read-first address pattern behind it. | medium | Address UI should support human-readable display and compact edit. | Define `AddressBlock` and `AddressEditor`. | systemic | yes |
| `21-google-event-dialog.png` | Google event dialog | Read-only Google event metadata is clean enough, but it is still a route-local modal pattern. | medium | Calendar event inspection should share metadata/action rules with other inspector modals. | Define `CalendarEventInspector` or modal variant. | systemic | no |
| `22-timeline.png` | Timeline | Timeline bars truncate labels heavily and do not share enough semantics with planning canvas. | medium | Time planning surfaces should reinforce each other. | Use shared project bar/time block vocabulary. | systemic | no |
| `23-ideas-list.png` | Ideas list | Initiative subtype list confirms route-specific collection pattern. | medium | Ideas/projects/habits should feel like sibling collections. | Align under `EntityListPage` with subtype-specific content. | systemic | yes |
| `24-habits-list.png` | Habits list | Sparse habit view shows empty sections without a stronger empty-state action. | medium | Sparse states should help the user decide what to do next. | Use structured empty states and create action. | systemic | yes |
| `25-person-contact-point-modal.png` | Person contact modal | Same form as organization contact point, which is good reuse, but not yet polished as canonical. | medium | This is a candidate to promote rather than duplicate further. | Promote to `ContactPointEditor`. | systemic | yes |
| `26-organization-detail-agent-error.png` | Organization DMAX attempt | Technical error appears as a top banner: `contextEntityId is required...`. | high | It breaks a core contextual workflow and exposes implementation language. | Fix context shape and add user-facing contextual-agent error state. | local/systemic | yes |
| `27-drive-mode.png` | Drive Mode | Strong primary action exists, but the page uses a large decorative/status card and sparse technical state. | medium | Voice mode should be an operational surface, not a disconnected one-off. | Define `RealtimeSessionSurface` only if Drive grows beyond this route. | local | no |

## 8. Confirmation/Correction Of Phase 2 Findings

| Phase 2 finding | Screenshot result | Evidence |
|---|---|---|
| Entity detail pages lack one canonical structure. | confirmed | `03`, `06`, `08`, `10`, `11` use different page anatomy. |
| Person detail opens as a raw master-data form. | confirmed | `06-person-detail.png` is dominated by `Stammdaten` form controls. |
| Relationship displays are fragmented. | confirmed | `03`, `06`, `08`, `11`, `13` use different relationship and linked-object visuals. |
| Equivalent content uses inconsistent editing patterns. | confirmed | `17`, `19`, `20`, plus description/edit behavior visible on `03`, `08`, `11`. |
| No shared metadata pattern exists. | confirmed | `14`, `15`, `18`, `21` all display metadata differently. |
| List pages do not share create/search/list behavior. | confirmed | `02`, `05`, `07`, `09`, `23`, `24`. |
| Empty/loading/error/save states are inconsistent. | partially confirmed | Empty states vary visually; loading/save/error need more targeted screenshots. `26` confirms raw error exposure. |
| Copy mixes German, English and internal terms. | confirmed | Sidebar and route labels mix `Lebensbereiche`, `Massnahmen`, `Planning Canvas`, `Config`, `Drive`, `Prompt Inspector`. |
| Calendar, timeline and planning canvas duplicate time/event concepts. | confirmed | `12`, `13`, `22`, `17` use separate time visuals. |
| Debug/config surfaces expose technical density without containment rules. | confirmed | `14`, `15`, `18`, `21`. |

The screenshots reveal one more important issue: organization contextual chat appears broken or miswired in the current local state.

## 9. Recommended First Reference Implementation Route

`/organizations/:id` should remain the recommended first reference implementation route.

Supporting screenshots:

- `03-organization-detail.png`
- `19-contact-point-modal.png`
- `20-address-modal.png`
- `26-organization-detail-agent-error.png`

Why it remains the best candidate:

- It has the broadest useful entity-detail ingredient set without the severe markdown overload of project detail.
- It can establish identity, description, contact points, addresses, members, relationships, DMAX contexts and empty states.
- It is already more read-first than `/people/:id`.
- It can directly inform `/people/:id`, then project/task/category detail patterns.

Canonical patterns it can establish:

- `EntityDetailPage`
- `EntityHeader`
- `SectionBlock`
- `DescriptionBlock`
- `ContactPointList`
- `AddressBlock`
- `RelationList`
- `RelationshipManager`
- `MetadataGrid`
- `EditModal`
- `EmptyState`
- `ContextPanel` integration rules

Risks:

- The organization contextual DMAX drawer currently errors instead of opening.
- The route has little relationship data in the captured local sample, so relation density needs another example before finalizing `RelationList`.
- If the first reference overfits sparse organization data, it may not handle richer people/project pages well.

Decisions needed before implementation:

- App language: English vs German.
- What belongs in the entity header versus the body.
- Whether member linking belongs in a modal or drawer.
- How empty relationship sections should collapse or de-emphasize.
- Whether organization legal name/type are primary facts or metadata.

## 10. Recommended Canonical Patterns To Define In Phase 4

Define these before implementation starts:

1. `EntityDetailPage`
2. `EntityHeader`
3. `EntityListPage`
4. `SectionBlock` / `SectionHeader`
5. `DescriptionBlock`
6. `RelationList` / `RelationItem` / `RelationGroup`
7. `RelationshipManager` / `RelationPicker`
8. `MetadataGrid` / `TechnicalMetadataDisclosure`
9. `EditModal` / `InspectorModal` / `ConfirmModal`
10. `EmptyState` / `LoadingState` / `ErrorState` / `SaveStateIndicator`
11. `ContactPointList` / `ContactPointEditor`
12. `AddressBlock` / `AddressEditor`
13. `ContextPanel`
14. `DateRangeDisplay` / `TimeBlock` / `SyncStateBadge` / `LockIndicator`
15. `DebugInspectorPage`

## 11. Recommended Components To Implement First

First implementation batch:

1. `EntityDetailPage`
2. `EntityHeader`
3. `SectionBlock`
4. `SectionHeader`
5. `DescriptionBlock`
6. `RelationList`
7. `MetadataGrid`
8. `EditModal`
9. `ContactPointList`
10. `AddressBlock`
11. `EmptyState`
12. `ErrorState`

Second batch:

1. `EntityListPage`
2. `EntityRow`
3. `SearchFilterRow`
4. `RelationshipManager`
5. `RelationPicker`
6. `ContextPanel`
7. `InspectorModal`
8. `TechnicalMetadataDisclosure`
9. `CalendarEventLinkBlock`
10. `TimeBlock`

## 12. Open Questions Before Design Decisions

- Should the product UI be English or German? Current screenshots visually confirm the mixed-language problem.
- Should categories remain `Lebensbereiche` in the UI, or should docs switch to German and define that explicitly?
- What is the primary default block for organization and person detail: description/context, relationships, or contactability?
- Should empty relationship sections remain visible, collapse, or show only a compact summary?
- Should create forms on list pages ever be always visible, or always open from a primary action?
- Should DMAX drawer be a right-side panel for all route contexts, or only for contexts with enough object identity?
- Should technical config/debug surfaces use the same visual system or a deliberate utility/debug variant?
- How much long markdown should be visible by default on project detail?
- Which time concept is canonical: project span, time block, calendar event, or planning bar?
- Should destructive list-row actions be visible by default?

## 13. Risks If Implementation Starts Too Early

- Refactoring without a binding detail-page pattern will recreate route-local layouts.
- Using `/organizations/:id` without fixing the contextual-agent error will bake a broken integration into the reference route.
- Refactoring person detail before deciding read-first party layout could create another one-off pattern.
- Refactoring project detail before deciding description summarization could preserve markdown overload inside nicer components.
- Building relationship components before deciding direction labels and grouping could make fragmented relationships look more polished without making them clearer.
- Migrating calendar/timeline/planning surfaces before defining shared time semantics could deepen inconsistency.
- Updating copy route by route before language choice will make terminology drift worse.
- Building shared modals without modal intent variants will only standardize borders, not interaction quality.
- Treating debug/config pages as normal entity pages could contaminate the product UI with technical-density patterns.
- Skipping mobile/narrow screenshots could produce a desktop-only reference pattern that breaks the drawer/sidebar/detail relationship.
