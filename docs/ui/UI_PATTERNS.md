# DMAX UI Patterns

This file defines canonical UI patterns for DMAX. Codex should use these patterns before creating new route-specific layouts.

These patterns are the active result of the completed canonical UI refactor. Historical route inventories, debt reports, design decisions, phase reviews and screenshot audits are archived under `archive/completed-ui-refactor/`.

## 1. Canonical entity detail page

Use this pattern for:

- Category detail
- Project detail
- Task detail
- Habit detail
- Person detail
- Organization detail
- Calendar event detail if applicable
- Time block detail if applicable

### Structure

```text
EntityDetailPage
  EntityHeader
    Breadcrumb/back context
    Entity title
    Optional subtype / status / primary context
    Secondary actions menu
    DMAX context action

  Main content
    Primary meaning / context section
    Current action relevance
    Important relationships
    Notes / description / context if not already primary
    Timeline / activity if relevant

  Secondary content
    MetadataGrid
    TechnicalMetadataDisclosure if needed
    Audit details only in debug/utility contexts
```

### Header rules

The header should answer:

- What is this object?
- What is its title/name?
- What is its current state?
- What can I do next?

Do not overload the header with all attributes.

Do not show a title icon or object-type eyebrow by default on normal entity detail pages. Use entity type labels in ambiguous contexts such as mixed lists, relation rows, search results and debug/inspector views.

Do not use a prominent generic `Bearbeiten` button as the default edit path for small high-frequency fields. Prefer direct/inline editing for title/name, subtype, status, priority and compact date controls when safe. Grouped edit modals may remain available as secondary actions.

### Main content rules

The first visible content block should be the most useful block for the current object type.

Examples:

- Project: current purpose, next actions, linked tasks, timeline/time block
- Person: context/description, contact points, linked organizations, linked projects
- Organization: context/description, people, contact points, linked projects
- Category: purpose/scope, linked projects/habits/tasks, satisfaction/current state if used
- Task: action definition, status, owner, due date, linked project/context

### Section copy rules

Section subtitles are optional, not default.

Prefer clear, specific section titles over title plus explanatory subtitle combinations. Use subtitles only when they add real disambiguating value.

Examples:

- `Kontaktwege` does not need `Direkte Wege zur Organisation`.
- `Anschriften` does not need `Postalische Orte und Rechnungsadressen`.
- `Beziehungen` does not need a subtitle when the relation groups already show `Personen`, `Organisationen` or other object groups.
- Relation groups such as `Personen` and `Organisationen` do not need explanatory subtitles when the title is self-explanatory.

### Secondary content rules

Secondary fields should go into consistent metadata areas.

Do not render secondary data as a prominent form at the top of the page.

Default entity detail pages are read-first. Grouped master-data editing belongs in `EditModal` or `EditDrawer`, not in a permanent page form.

## 2. Canonical entity list page

Use this pattern for object collections.

Phase 14 validates the first implementation on `/categories`.
Phase 15 validates the same structure for `/people`.
Phase 16 validates the same structure for `/organizations`.
Phase 17 validates the same structure for `/projects` as the first action/planning list page.
Phase 18 validates the same structure for `/ideas` as the first exploratory/action list page.
Phase 19 validates the same structure for `/habits` as the first routine/action list page.
Phase 20 validates the same structure for `/tasks` as the small operational action list page.
Phase 21 confirms the migrated list pages as a coherent canonical list-page system.

### Structure

```text
EntityListPage
  PageHeader
    title
    short explanation if useful
    primary create action

  SearchFilterRow
    search
    view switch if needed
    important filters only

  Main list/table/card layout
    compact rows or cards
    primary object title
    most important state
    one or two supporting facts
    relation hints if useful

  EmptyState / LoadingState / ErrorState
```

### List rules

Lists are for scanning and navigation, not for showing full object detail.

Each row/card should show:

- title/name
- type if not obvious
- state/status if relevant
- one or two important supporting attributes
- relationship count or preview if useful

Do not show every field in list rows.

Create forms must not be visible by default. Creation starts from the page's primary create action and opens a compact inline create row, modal or drawer depending on workflow size.

For `/categories`, the canonical reference uses:

- a simple page title and page-level create action;
- compact rows via `EntityListPage`, `EntityList` and `EntityListItem`;
- category name as primary row content;
- emoji/color as subtle data-backed identity markers;
- description preview and counts as secondary row content;
- `EditModal` for creation.

For `/people`, the canonical reference adds:

- person name as primary row content;
- subtle data-derived initials as row identity markers;
- salutation/title/name context as compact secondary content;
- simple search as a lightweight list toolbar;
- `EditModal` for creation rather than an always-visible form.

For `/organizations`, the canonical reference adds:

- organization name as primary row content;
- subtle data-derived initials as row identity markers;
- organization type and legal name as compact secondary content;
- simple search as a lightweight list toolbar;
- `EditModal` for creation rather than an always-visible form.

For `/projects`, the canonical reference adds:

- project name as primary row content;
- subtle data-derived initials plus category color as row identity markers;
- status, phase, category and date range as compact secondary content;
- open/done/total task counts as action-planning row stats;
- simple search as a lightweight list toolbar;
- `EditModal` for creation rather than an always-visible form.

For `/ideas`, the canonical reference adds:

- idea name as primary row content;
- subtle data-derived initials plus category color as row identity markers;
- status and category as compact secondary content;
- optional task count only when an idea already has measures attached;
- simple search as a lightweight list toolbar;
- `EditModal` for creation rather than an always-visible form.

For `/habits`, the canonical reference adds:

- habit name as primary row content;
- subtle data-derived initials plus category color as row identity markers;
- status and category as compact secondary content;
- optional task count only when a habit already has measures attached;
- no invented frequency, streak or recurrence placeholders before those semantics are stable in the product model;
- simple search as a lightweight list toolbar;
- `EditModal` for creation rather than an always-visible form.

For `/tasks`, the canonical reference adds:

- task title as primary row content;
- status, priority and due date as compact secondary content, matching the `/tasks/:id` header hierarchy;
- parent initiative/category context as compact orientation;
- row-level status completion and delete actions as calm row actions, not a board or planner;
- no checklist/progress indicators unless the list data already provides them;
- simple search as a lightweight list toolbar;
- `EditModal` for creation rather than an always-visible form.

System-level consolidation rules after Phase 21:

- Use the same top-level rhythm across all migrated entity lists: page title, one calm create action where supported, optional lightweight search, then compact rows.
- Keep create flows hidden behind the page-level action and use `EditModal` for the current compact create forms.
- Keep row navigation predictable. If row actions are present, the main row content remains the openable area; if no row actions are present, the row itself may be openable.
- Leading row actions are reserved for small high-frequency state controls such as task completion. Trailing row actions are reserved for calm secondary row commands.
- Do not extract `SearchFilterRow` until search/filter behavior becomes shared enough to remove real duplication.

## 3. Editing pattern

### Inline editing

Use inline editing only for small, high-frequency fields:

- title/name
- status
- priority
- due date
- start/end date
- short label

Inline editing should be visually calm and should not turn the whole page into a form.

### Modal editing

Use modal editing for small grouped edits where the user should stay anchored to the current page.

Good modal candidates:

- organization master data
- person profile basics
- task status/date/owner group
- quick relation edit
- contact point edit

### Drawer editing

Use drawer editing for larger contextual edits where seeing the underlying page still matters.

Good drawer candidates:

- long description/context editing
- relationship management
- multi-field planning details
- calendar/time-block configuration

### Full-page editing

Use full-page editing rarely.

Only use it when the edit itself is a major workflow.

## 4. Description / notes / markdown pattern

Long text fields should not look like raw textareas by default.

Default mode:

- rendered markdown
- summary-first display for long content
- expand/collapse for long content
- subtle empty state if empty
- click-to-edit content surface where safe
- no mandatory visible heading, edit button or add-description button when the block is self-explanatory

Edit mode:

- modal or drawer for shorter content
- full editor area for longer content

Examples:

- project description
- organization description
- person context
- category scope
- meeting notes

## 5. Relationship display pattern

Relationships are central in DMAX.

Use `RelationList`, `RelationGroup` and `RelationItem` consistently. Use `RelationshipManager` for editing.

### RelationList structure

```text
SectionBlock: Linked objects
  RelationList
    RelationItem
      object type icon/label
      title
      relationship type if available
      one supporting fact
      action: open
```

### Relationship display rules

Show relationships grouped by type when there are many.

Use group subtitles only when they disambiguate the relationship. If a group title such as `Personen` or `Organisationen` already explains the content, omit the subtitle.

Empty relation groups should be visually light. Prefer no empty body, or a tiny inline hint, over a full empty-state block for ordinary "nothing linked yet" cases. Keep section-level add/link actions visible enough even when the relation list is empty.

Use heavy `EmptyState` blocks for meaningful empty pages, empty primary work areas or not-yet-configured major features. Do not use heavy empty-state cards for every empty relation group inside an already meaningful entity page.

Expected calm relation actions by object type:

- `Person verknüpfen`
- `Organisation verknüpfen`
- `Initiative verknüpfen`
- `Maßnahme verknüpfen`

Examples:

- linked projects
- linked tasks
- linked people
- linked organizations
- linked calendar events
- linked time blocks
- linked notes
- linked communication threads

Do not mix unrelated relationship types without grouping.

Reading relationships and editing relationships are separate tasks. Complex add/remove/edit flows open a `RelationshipManager` in a modal or drawer with `RelationPicker`; inline relationship forms are not the default.

For party-to-DMAX-object links, use the section label `Verknüpfte Initiativen und Maßnahmen` unless a later terminology decision replaces it. This section can contain initiatives, projects and habits represented as initiatives, plus tasks / Maßnahmen.

## 6. Metadata pattern

Use `MetadataGrid` for secondary attributes.

Examples:

- created at
- updated at
- owner
- source
- sync state
- technical flags

Metadata should be visually less dominant than main content.

Do not place metadata above the primary working section unless it is directly decision-relevant.

Internal IDs, external provider IDs and technical/debug metadata belong in `TechnicalMetadataDisclosure` or a dedicated debug/inspector surface, not in normal entity detail content.

## 7. Contact point pattern

Use for:

- email addresses
- phone numbers
- websites
- social handles
- messenger handles
- other communication endpoints

### Display rules

`Kontaktwege` is self-explanatory as a section title and generally does not need a subtitle.

Each contact point should show:

- type
- value
- label if available
- primary/secondary state if available
- verification/sync state only if relevant

Actions:

- copy
- open/send/call where applicable
- edit

Avoid showing raw contact point internals.

Contact empty states should be compact. The add action, for example `Kontaktweg hinzufügen`, remains visible enough to be recognized as an action.

## 8. Address pattern

Addresses should be displayed as human-readable blocks, not as raw field grids by default.

`Anschriften` is self-explanatory as a section title and generally does not need a subtitle.

Display:

```text
Street and number
Postal code city
Country
```

Editing can use a modal or drawer with structured fields.

Address empty states should be compact. The add action, for example `Anschrift hinzufügen`, remains visible enough to be recognized as an action.

## 9. Calendar/time pattern

Calendar and time-related UI should clearly distinguish:

- planned but flexible
- locked/fixed
- synced to external calendar
- imported read-only external event
- user-created time block

Locked or externally constrained time should be visibly but not noisily marked.

Avoid making every project date look like a hard commitment.

## 10. Empty state pattern

Empty states should be short and useful.

Structure:

```text
Title: No linked people yet
Description: Add people who are relevant to this project.
Action: Add person
```

Avoid generic empty states such as "No data".

Use full `EmptyState` only when the empty condition is itself important enough to read. Ordinary empty relation groups should instead use a light pattern:

- show only the group title and available action;
- show no body content;
- show a tiny muted inline hint only if necessary;
- collapse the empty body with `emptyMode` or an equivalent light-empty behavior.

## 11. Loading and error states

Every route and major async section should handle:

- loading
- empty
- error
- stale/syncing if relevant

Errors should explain what failed and offer a reasonable next action.

## 12. Confirmation pattern

Use confirmation for destructive or difficult-to-reverse actions.

Do not use confirmation for ordinary save actions.

Destructive actions should be in overflow menus or separated areas, not next to primary constructive actions.

## 13. Primary action pattern

Every page should have at most one visually dominant primary action.

Examples:

- Add task
- Create project
- Link person
- Edit profile
- Schedule time block

Secondary actions should be less prominent or placed in an overflow menu.

## 14. Navigation pattern

Top-level navigation should reflect stable product concepts, not implementation models.

Preferred top-level concepts:

- Categories
- Ideas
- Projects
- Habits
- Tasks
- Context
- Calendar / Timeline if present
- Prompt Templates if present

Avoid exposing internal umbrella terms if they are not meaningful to the user.

On narrow/mobile viewports, use the app-shell mobile navigation pattern:

- desktop sidebar navigation collapses behind a burger button;
- the opened menu is vertical and full-width with icons and text labels;
- it reuses the same navigation item data and active-state behavior as desktop;
- the toggle exposes accessible state such as `aria-expanded`;
- normal route selection closes the menu.

Do not replace this with a wrapped icon grid or horizontal icon rail without updating the active UI docs.

## 15. Copy and terminology pattern

Normal product UI should use concise, calm, user-facing copy.

Rules:

- Use German product labels where the migrated canonical UI has established them, for example `Lebensbereiche`, `Organisationen`, `Personen`, `Projekte`, `Ideen`, `Gewohnheiten`, `Maßnahmen`, `Kontaktwege` and `Anschriften`.
- Do not mix German and English alternatives inside the same normal workflow.
- Avoid technical database terms, raw IDs and implementation-shaped labels in normal UI.
- Use verbs for actions, for example `Person verknüpfen`, `Organisation verknüpfen`, `Maßnahme hinzufügen`.
- Keep empty and error copy specific and short.

## 16. Organization detail reference pattern

As of Phase 5, `/organizations/:id` is the first implemented reference for the canonical entity detail page.

The implemented structure is:

```text
EntityHeader
  organization name
  organization type subtitle
  direct title/type editing
  secondary master-data action

EntityDetailPage
  primary column
    DescriptionBlock
    ContactPointList
    AddressBlock
    SectionBlock: relationships
      RelationGroup: people
      RelationGroup: organizations
    SectionBlock: DMAX contexts
  secondary column
    MetadataGrid
```

Implementation notes:

- The default view is read-first.
- Name and organization type support direct editing from the header; grouped master data editing remains available as a secondary `EditModal`.
- Description editing opens from the description surface itself; long descriptions render with contained expand/collapse behavior.
- Contact points and addresses use read-first lists with modal editors.
- Organization-person relationship creation is contained behind a modal entry point; broader relationship management is deferred.
- IDs and timestamps are secondary metadata and must not move into the primary header.
- The DMAX drawer must receive a complete organization context and must not show raw `contextEntityId` errors.
