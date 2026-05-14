# DMAX UI Components

This file defines the canonical component vocabulary for DMAX. Codex should reuse these components before introducing new UI primitives.

`UI_DESIGN_DECISIONS.md` is the Phase 4 binding decision record. Component priorities and first-reference-route participation are defined there.

Component names may be adapted to the actual frontend framework, but the concepts should remain stable.

`UI_ENTITY_DETAIL_CANONICAL_PATTERN.md` and `UI_COMPONENT_EXTRACTION_PLAN.md` are the Phase 8 references for extracting entity detail primitives from the validated organization and project/initiative implementations.

## Component creation rule

Before creating a new route-specific component, check whether one of the canonical components below can be reused or extended.

If a new component is needed, it should be:

1. reusable across at least two routes, or
2. explicitly documented as intentionally route-specific.

## Layout components

### `PageShell`

Wraps the main application page area.

Responsibilities:

- stable page width behavior
- main content spacing
- optional sticky header support
- consistent background and page rhythm

Should not contain route-specific business logic.

### `PageHeader`

Used for top-level list/index pages.

Contains:

- page title
- concise description if useful
- primary action
- optional secondary actions

### `EntityListPage`

Canonical wrapper for list pages.

Contains:

- `PageHeader`
- `SearchFilterRow`
- list/card/table area
- empty/loading/error states

Must not show a create form by default.

Implementation:

- `web/src/components/ui/EntityListPage.tsx`
- Introduced in Phase 14 for `/categories`
- Reused in Phase 15 for `/people`
- Reused in Phase 16 for `/organizations`
- Reused in Phase 17 for `/projects`
- Reused in Phase 18 for `/ideas`
- Reused in Phase 19 for `/habits`
- Reused in Phase 20 for `/tasks`

Current implementation status:

- `EntityListPage` wraps the list surface.
- `EntityList` provides the repeated-item list body.
- `EntityListItem` provides the first reusable scan row/card shape and is now validated for category rows, sparse person rows, organization rows, project/action rows, idea/exploratory rows, habit/routine rows and task/action rows.
- `EntityListItem` supports a separate leading row action and trailing actions when a row must remain openable while preserving calm row-level actions, as validated by `/tasks`.
- Openable `EntityListItem` rows must expose an accessible open label through `openLabel` or the default title-derived label.
- `PageHeader` and `SearchFilterRow` remain conceptual until a list route needs them as extracted primitives.

### `SearchFilterRow`

Compact search and filtering controls for entity list pages.

Should contain:

- search input
- important filters only
- optional view switch

Should not contain advanced configuration by default.

### `EntityRow`

Canonical row/card for list scanning.

Should contain:

- title/name
- primary state
- one or two supporting facts
- relationship hint if useful
- compact open affordance

Should not contain full descriptions, raw IDs or full metadata.

Implementation note: `EntityListItem` is the current frontend implementation name for the first reusable entity row primitive.

### `EntityDetailPage`

Canonical wrapper for detail pages.

Contains:

- `EntityHeader`
- main content sections
- secondary metadata area
- empty/loading/error states

Validated by:

- `/organizations/:id`
- `/projects/:id` / `/initiatives/:id`

## Entity components

### `EntityHeader`

Canonical header for entity detail pages.

Should support:

- title/name
- optional entity type only when context is ambiguous
- optional title icon only for special status/context cases
- status/state
- key dates or primary metadata
- inline/direct editing for small high-frequency fields where safe
- secondary actions menu
- optional breadcrumb/back navigation

Should not show all fields. Normal entity detail pages should not show a mandatory icon or object-type eyebrow next to/above the title.

Should not rely on a prominent generic `Bearbeiten` button for small high-frequency edits. Prefer direct editing for safe title/name/subtype/status fields.

### `EntityTitle`

Displays and optionally edits the title/name of an entity.

Should support:

- display mode
- inline edit mode if appropriate
- validation errors
- loading/saving state

### `EntityStatusBadge`

Displays status/state consistently.

Examples:

- active
- archived
- planned
- in progress
- blocked
- done
- locked
- synced

Avoid creating route-specific badge styles.

### `EntityActionBar`

Groups primary and secondary actions for an entity.

Rules:

- one visually dominant primary action
- secondary actions grouped predictably
- destructive actions separated

## Section components

### `SectionBlock`

Canonical content section.

Contains:

- optional section title
- optional description
- optional action area
- section body

Descriptions are optional, not default. Do not pass a description that merely restates a self-explanatory title.

Use for:

- descriptions
- related objects
- notes
- contact points
- addresses
- metadata
- timeline/activity

### `SectionHeader`

Header inside `SectionBlock`.

Contains:

- title
- optional small description
- optional action with enough affordance for section-level add/link/create actions

The title should usually carry the section meaning. Use the description only for genuine disambiguation.

### `MetadataGrid`

Displays secondary fields in a consistent layout.

Use for:

- dates
- owner
- sync state
- created/updated timestamps
- technical attributes

Rules:

- never use it as the primary content block unless metadata is the product value of the page
- keep labels consistent
- hide empty fields unless explicitly useful
- do not show internal IDs in normal user-facing metadata
- technical/debug attributes belong in `TechnicalMetadataDisclosure` or utility/debug surfaces, not in the normal detail-page `MetadataGrid`

### `TechnicalMetadataDisclosure`

Contains technical/debug fields that should not be visible by default in normal product UI.

Use for:

- internal IDs
- raw provider IDs
- sync payload details
- trace/debug fields
- created/updated timestamps when not user-relevant

### `DescriptionBlock`

Displays a markdown description/context field.

Default mode:

- rendered markdown
- concise empty state
- optional heading only when it adds orientation
- click-to-edit surface when editing is available
- no mandatory visible edit/add button
- long content contained by default with expand/collapse or equivalent behavior

Edit mode:

- modal/drawer/full editor depending on length and complexity

## Relationship components

### `RelationList`

Canonical component for linked objects.

Should support:

- grouping by object type
- compact relation rows
- quiet empty behavior: full card, small inline hint, or no rendered empty body depending on context
- object type label/icon
- relationship type
- title/name
- one supporting fact
- open action
- unlink/remove action where appropriate

### `RelationGroup`

Groups related objects by type or semantic relationship.

Should contain:

- group label
- count if useful
- compact empty state only when the absence itself needs explanation
- `RelationItem` rows

Should not contain the full relationship edit form.

Do not use heavy empty-state panels for ordinary empty relationship groups. If the group title and add/link action are enough, render no empty body.

Use `emptyMode` or an equivalent light-empty behavior for ordinary empty relation groups:

- `none`: render only the group header/action and no empty body;
- `inline`: render a tiny muted hint;
- default/card: reserve for empty states that need explanation.

### `RelationCard`

Use when relationships need more context than a list row.

Avoid overusing cards. Prefer lists for dense relation-heavy pages.

### `RelationPicker`

Used to add/link existing objects.

Should support:

- search
- type filtering
- create-new option if allowed
- clear selected result state

### `RelationshipManager`

Intentional relationship editing surface.

Use for:

- adding/removing members
- linking participants
- editing predecessor/successor/dependency relationships
- managing DMAX participations/context links

Should open in a modal or drawer, not replace the default read-only relationship list.

### `RelationshipTypeBadge`

Displays relationship meaning consistently.

Examples:

- owns
- works for
- related to
- precedes
- follows
- involved in
- responsible for

## Contact and communication components

### `ContactPointList`

Displays email addresses, phone numbers, websites and messenger handles.

Implementation:

- `web/src/components/party/ContactPointList.tsx`
- Used by `/organizations/:id` and `/people/:id`

Each item should support:

- type
- value
- label
- primary flag if available
- preferred flag if available
- edit action
- delete action

`Kontaktwege` is a self-explanatory section title. Do not add a subtitle unless it disambiguates the contact-point meaning for that route.

The add action, usually `Kontaktweg hinzufügen`, remains visible even when the list is empty.

### `ContactPointEditor`

Modal or drawer editor for contact points.

Implementation:

- `web/src/components/party/ContactPointList.tsx`

Should not expose internal database fields.

### `ContactPointItem`

Renders one contact point row inside `ContactPointList`.

Should show contact type, value, optional label and primary/preferred metadata without route-specific party assumptions.

### `AddressBlock`

Human-readable address display.

Implementation:

- `web/src/components/party/AddressBlock.tsx`
- Used by `/organizations/:id` and `/people/:id`

`Anschriften` is a self-explanatory section title. Do not add a subtitle unless the route needs to distinguish postal, billing or location meaning.

The add action, usually `Anschrift hinzufügen`, remains visible even when the list is empty.

### `AddressList`

Displays address rows and empty state inside `AddressBlock`.

### `AddressEditor`

Structured address form.

Implementation:

- `web/src/components/party/AddressBlock.tsx`

Should be opened intentionally, not shown as default raw fields.

### `CommunicationThreadPreview`

Preview of recent communication if implemented.

Should show:

- channel
- counterpart
- latest message summary
- date/time
- linked object if relevant

## Time and calendar components

### `DateRangeDisplay`

Displays start/end dates consistently.

Should distinguish:

- missing date
- flexible planned date
- fixed/locked date
- externally synced date

### `CalendarEventLink`

Displays a linked calendar event.

Canonical name for future implementation: `CalendarEventLinkBlock`.

Should show:

- title
- date/time
- calendar/source
- sync state
- open action

### `TimeBlockCard`

Displays a user-planned work block.

Should distinguish from external calendar events.

### `LockIndicator`

Displays whether a project/date/time block is locked/fixed.

Should be subtle but clear.

## State components

### `EmptyState`

Use for empty content sections and empty pages.

Structure:

- specific title
- short helpful explanation
- optional action

Bad:

- "No data"
- "Nothing found"

Better:

- "No linked people yet"
- "Add people who are relevant to this project."

### `LoadingState`

Use for route loading and section loading.

Should be consistent and not visually noisy.

### `ErrorState`

Use when data fetching or saving fails.

Should include:

- what failed
- useful context
- retry action if possible

### `SaveStateIndicator`

Use for editing/saving flows.

Should distinguish:

- idle
- saving
- saved
- failed

### `IntegrationState`

Displays external service state.

Use for:

- Google Calendar connected/disconnected/error
- OpenClaw/DMAX drawer availability
- LiveKit voice session state

### `MissingDataState`

Displays an incomplete but load-successful object state.

Use when an object is missing useful content such as description, relationships, contact points or addresses.

## Form components

### `InlineEditableField`

For small direct edits only.

### `EditModal`

For small grouped edits.

### `EditDrawer`

For larger contextual edits.

### `InspectorModal`

For dense read-mostly inspection surfaces such as media and Google Calendar event details.

Primary content must remain dominant; metadata should be grouped or collapsible.

### `ConfirmModal`

For destructive or difficult-to-reverse actions.

Do not use confirmation modals for ordinary save actions.

### `FieldGroup`

Groups related fields.

### `FormActions`

Consistent save/cancel placement.

Rules:

- primary save action on the right if following common modal conventions
- cancel as secondary
- tab order from the last form field goes to the primary save action before cancel
- `Escape` closes the active modal
- `Enter` in a single-line text field submits the modal form
- destructive actions separated

## Context components

### `ContextPanel`

Canonical contextual DMAX drawer.

Should contain:

- current context label
- conversation controls
- message thread
- composer
- activity trail when useful
- user-facing error state for context failures

Should not expose raw context schema errors in normal UI.

## Utility/debug components

### `UtilityPage`

For user-facing configuration and operational utility routes.

### `DebugInspectorPage`

For prompt traces and developer-facing inspection.

Debug surfaces may be technically dense, but they must not define normal entity/list page patterns.

## Anti-components

Avoid creating these patterns:

### `RandomCard`

A card created only because a section needed visual separation.

Use `SectionBlock` instead.

### `RouteSpecificMetadataPanel`

Metadata must use `MetadataGrid` unless there is a documented exception.

### `RawEntityFormAsPage`

Detail pages should not default to raw forms.

### `OneOffBadge`

Badges should use shared status/type/relationship badge components.

### `LocalButtonVariant`

Button variants should come from the shared design system.

## Done rule for components

A UI change is not complete if it introduces a new component that could reasonably have been a variant or composition of an existing canonical component.

## Phase 5 implementation status

The first reference implementation for `/organizations/:id` introduced or reused these frontend components. Core primitives now live in `web/src/components/ui`, and party contact/address primitives now live in `web/src/components/party`.

- Implemented: `EntityDetailPage`, `EntityHeader`, `SectionBlock`, `SectionHeader`, `DescriptionBlock`, `RelationList`, `RelationGroup`, `RelationItem`, `MetadataGrid`, `EditModal`, `EmptyState`, `ErrorState`.
- Implemented for person and organization routes by composition: `ContactPointList`, `ContactPointItem`, `ContactPointEditor`, `AddressBlock`, `AddressList`, `AddressEditor`.
- Partially implemented by contained modal: relationship creation for organization-person links. A full `RelationshipManager` remains conceptual.
- Reused existing shell/drawer: the contextual DMAX drawer remains the existing `AgentDrawer`/`DmaxAgentButton` implementation. Phase 5 fixed the missing organization/person `contextEntityId` client query parameter and added user-facing containment for context-load errors.

These components are now the implementation reference for later detail-route migrations. Do not fork organization-specific copies for people, projects, tasks or categories unless a later design decision explicitly requires a variant.
