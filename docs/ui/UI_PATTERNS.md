# DMAX UI Patterns

This file defines canonical UI patterns for DMAX. Codex should use these patterns before creating new route-specific layouts.

`UI_DESIGN_DECISIONS.md` is the Phase 4 binding decision record. The patterns below are governed by the specific decision IDs in that file.

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

### Main content rules

The first visible content block should be the most useful block for the current object type.

Examples:

- Project: current purpose, next actions, linked tasks, timeline/time block
- Person: context/description, contact points, linked organizations, linked projects
- Organization: context/description, people, contact points, linked projects
- Category: purpose/scope, linked projects/habits/tasks, satisfaction/current state if used
- Task: action definition, status, owner, due date, linked project/context

### Secondary content rules

Secondary fields should go into consistent metadata areas.

Do not render secondary data as a prominent form at the top of the page.

Default entity detail pages are read-first. Grouped master-data editing belongs in `EditModal` or `EditDrawer`, not in a permanent page form.

## 2. Canonical entity list page

Use this pattern for object collections.

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
- edit action in the section header

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

## 6. Metadata pattern

Use `MetadataGrid` for secondary attributes.

Examples:

- created at
- updated at
- internal ID
- owner
- source
- external IDs
- sync state
- technical flags

Metadata should be visually less dominant than main content.

Do not place metadata above the primary working section unless it is directly decision-relevant.

Technical/debug metadata belongs in `TechnicalMetadataDisclosure` or a dedicated debug/inspector surface, not in normal entity detail content.

## 7. Contact point pattern

Use for:

- email addresses
- phone numbers
- websites
- social handles
- messenger handles
- other communication endpoints

### Display rules

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

## 8. Address pattern

Addresses should be displayed as human-readable blocks, not as raw field grids by default.

Display:

```text
Street and number
Postal code city
Country
```

Editing can use a modal or drawer with structured fields.

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

## 15. Organization detail reference pattern

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
