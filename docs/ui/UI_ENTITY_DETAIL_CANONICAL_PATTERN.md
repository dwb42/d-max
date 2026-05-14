# DMAX Canonical Entity Detail Pattern

## 1. Status

Status: accepted as the Phase 8 canonical direction.

Evidence:

- `/organizations/:id` validates the pattern for a context/contact-oriented entity.
- `/projects/:id` and `/initiatives/:id` validate the pattern for a complex planning/action-oriented entity.
- `/tasks/:id` validates the pattern for a small operational action entity.
- `/categories/:name` validates the pattern for a life-area/category entity.
- Reference reviews:
  - `docs/ui/UI_REFERENCE_REVIEW_ORGANIZATION_DETAIL.md`
  - `docs/ui/UI_REFERENCE_REVIEW_INITIATIVE_PROJECT_DETAIL.md`
  - `docs/ui/UI_REFERENCE_REVIEW_TASK_DETAIL.md`
  - `docs/ui/UI_REFERENCE_REVIEW_CATEGORY_DETAIL.md`

This document is the canonical source for future entity detail migrations unless a later decision document supersedes it.

## 2. Canonical Anatomy

Entity detail pages must use this anatomy:

```text
EntityDetailPage
  Route/header context
    Back/breadcrumb actions
    DMAX context action

  EntityHeader
    Dominant title/name
    Optional primary context near title
    Optional small direct-edit controls
    Optional grouped secondary actions

  Primary content column
    DescriptionBlock or primary context surface
    Primary action relevance area
    Relationship/participant sections
    Entity-specific working sections

  Secondary content column or trailing section
    MetadataGrid
    TechnicalMetadataDisclosure only if needed

  Contextual DMAX drawer
    Overlay or otherwise preserve readable main content
```

The default state is read-first. The user should understand the object before seeing editing UI.

## 3. Page Shell Behavior

- Entity detail pages use a stable detail grid with a primary content column and a secondary metadata area.
- The primary column contains the working content. The metadata column must not compete with it.
- On narrow viewports, the layout stacks into one column without horizontal overflow.
- When the contextual DMAX drawer is open, the page must remain readable. The drawer should overlay or otherwise avoid forcing three cramped columns.
- The route should provide user-facing loading, not-found and error states.

## 4. Entity Header Pattern

### Canonical rules

- Do not show a default decorative icon next to the main entity title.
- Do not show a mandatory entity-type eyebrow above the title on normal entity detail pages.
- The title/name is the dominant header element.
- Useful subtype, status, category, date or context information may sit near the title when it changes interpretation or action.
- Primary edit should not be a prominent generic `Bearbeiten` button by default.
- Inline/direct editing is preferred for small, high-frequency fields when safe:
  - title/name
  - subtype/type
  - status
  - phase
  - priority
  - due date or compact date range
- Grouped editing may remain available for grouped master data, but it should be secondary.
- Header actions should be predictable and quiet. Do not add actions merely because the entity supports them.

### When entity type labels are allowed

Entity type labels are useful in ambiguous contexts:

- mixed search results
- relation rows
- mixed object lists
- debug/inspector surfaces
- modals where the object context is not otherwise clear

They are not default chrome for normal detail pages.

## 5. Description / Context Pattern

`DescriptionBlock` is the canonical display for durable markdown, notes or context memory.

Rules:

- No mandatory visible heading such as `Beschreibung` when the surface is self-explanatory.
- No default visible `Bearbeiten` button inside the block.
- No default visible `Beschreibung hinzufügen` button.
- Empty descriptions use a quiet empty surface, for example `Noch keine Beschreibung vorhanden.`
- Clicking the description/content surface may enter edit mode when safe and clear.
- Long content must be contained by default with expand/collapse, max-height or an equivalent progressive disclosure pattern.
- Description must not dominate action-oriented pages so much that tasks, current actions or relationships disappear below a markdown wall.
- Edit mode should use a modal or drawer, not a permanent textarea in the default page.

Entity examples:

- Organization: description/context is primary context.
- Project/initiative: markdown is initiative memory, but tasks/next actions must stay visible.
- Task: notes are secondary to the action statement and status.
- Person: context/notes may become primary if a person context field exists later.
- Category: purpose/scope description should orient the life area.

## 6. Primary Action Relevance Area

Each entity type defines one early area that helps the user act.

Examples:

- Organization: contact points, addresses and people/member relationships.
- Project/initiative: tasks/next actions immediately after description.
- Task: status, due date, checklist and parent project context.
- Person: contact points and organization/project participations.
- Category/life area: linked projects, habits and active tasks.

This area should appear before secondary metadata and before dense relationship management.

## 7. Section and Action Pattern

Use `SectionBlock` and `SectionHeader` for detail sections.

Rules:

- Section titles are concise and specific.
- Optional descriptions are short and useful.
- Omit section descriptions when the title already identifies the content. Do not add subtitles only to restate obvious section meaning.
- Prefer clear section titles over title plus helper text. For example, `Kontaktwege`, `Anschriften`, `Beziehungen`, `Personen` and `Organisationen` usually stand on their own.
- Section-level actions such as adding contact points, addresses, tasks, people, relations or media must be visible enough to be recognized as actions.
- Section actions should not be visually loud, but they must not disappear as low-contrast text.
- One section-level primary action may be emphasized where appropriate.
- Empty sections should be visually lighter than populated sections.
- Avoid walls of equally heavy boxes for many empty sections.

## 8. Relationship Pattern

Relationships are first-class DMAX content.

Canonical display components:

- `RelationList`
- `RelationGroup`
- `RelationItem`

Rules:

- Use grouped relationship presentation where relationship types differ.
- Show relationship direction where it changes meaning:
  - parent / child
  - predecessor / successor
  - member / organization
  - participant / project
- Relationship display and relationship management are distinct:
  - display should be read-first and scannable;
  - dense add/link/edit flows should move to a `RelationshipManager`, modal or drawer when they become too heavy.
- Empty relationship groups should be compact, subordinate and often visually empty. Do not render heavy "nothing here" panels for ordinary empty relation groups.
- Add/link/remove actions should be consistent and protected where destructive.
- Relation rows may use icons/type initials in mixed-object contexts, but icons are not required for the main entity title.

Organization detail uses `Verknüpfte Initiativen und Maßnahmen` for initiative/task participation links. This label should be preferred for organization-to-DMAX-object links unless a later product language decision renames it.

Expected link action labels:

- `Person verknüpfen`
- `Organisation verknüpfen`
- `Initiative verknüpfen`
- `Maßnahme verknüpfen`

Use these as section-level actions when the backend/data model supports the link. Keep them visible enough to be recognized as actions, even when the relation body is empty.

## 9. Metadata Pattern

Use `MetadataGrid` for secondary facts.

Rules:

- Normal metadata shows user-relevant secondary facts only.
- Do not show internal IDs in normal metadata.
- Technical/debug metadata belongs in `TechnicalMetadataDisclosure`, debug pages or inspector surfaces.
- Metadata must not compete with primary content.
- Metadata should be omitted when empty rather than padded with placeholders.
- Created/updated timestamps are secondary and should not appear above the working content.

Organization metadata may include:

- legal name if not already prominent
- organization type if not already in header
- contact/address/relationship counts
- updated timestamp

Project/initiative metadata may include:

- type
- category/life area
- status
- phase
- date range
- lock/sync state
- task counts
- participant/relation/media counts
- updated timestamp

Task metadata may include:

- status
- priority
- due date
- parent project/initiative
- category/life area
- checklist count
- participant/media counts
- created/updated/completed timestamps

## 10. Editing Behavior

Default pages are read-first.

Use inline/direct editing for:

- title/name
- compact subtype/status/priority fields
- compact dates when the editor is small and safe

Use `EditModal` for:

- grouped organization master data
- grouped person basics
- compact contact point or address editing
- short grouped task fields
- markdown editing when a contained editor is enough

Use `EditDrawer` or a future `RelationshipManager` for:

- dense relationship management
- larger planning edits
- long contextual edits where the page context should stay visible

Modals must:

- close with Escape;
- save with Enter from single-line text fields where safe;
- place `Speichern` before `Abbrechen` in tab order when saving is the default commit action;
- use custom confirmation modals rather than system popups.

## 11. Contextual DMAX Drawer

The DMAX drawer is part of entity detail behavior.

Rules:

- The DMAX action appears in the route/header area.
- The drawer must show a user-facing context label, for example `DMAX-Kontext` plus the current entity name.
- The drawer must not expose raw context terms such as `contextEntityId`.
- Opening the drawer must not squeeze the entity detail page into unreadable columns.
- Gateway or context failures must be shown as calm user-facing errors.
- Context passing must use the current entity identity and type expected by the chat/conversation system.

## 12. Loading, Empty and Error States

Each detail route must handle:

- route-level loading;
- entity not found;
- load failure;
- empty description/context;
- empty relationship groups;
- empty entity-specific sections;
- save failure for editable fields;
- DMAX drawer context failure.

Error copy must be user-facing. Raw API errors, stack-like messages, IDs and internal context names are not normal UI.

## 13. Entity-Specific Adaptations

### Organization

Primary purpose: context/contact-oriented party detail.

Canonical structure:

- title/name
- organization type near the title
- description/context
- contact points
- addresses
- people/members
- relationships and participations
- secondary metadata

Organization-specific notes:

- Contact points and addresses are primary working sections.
- Organization type is primary context, not technical metadata.
- Grouped master data may remain available but should not dominate.

### Project / Initiative

Primary purpose: planning/action-oriented initiative memory and execution detail.

Canonical structure:

- title/name
- type/status/phase/category/date context near the title
- contained markdown description/context
- tasks/next actions near the top
- participants
- relationships/dependencies
- media/attachments
- time/calendar references
- secondary metadata

Project-specific notes:

- Long markdown must not push tasks out of view.
- Tasks are a primary action relevance area.
- Relationship editing may be denser than organization relationships; if it remains visually heavy, move management into a dedicated modal/drawer later.
- Date/calendar state can appear near the title when it is central to project interpretation.

### Person

Likely adaptation:

- identity/name as dominant title
- role/context subtitle if available
- contact points
- linked organizations
- relationships
- participations in initiatives/tasks/calendar entries
- notes/context if a field exists later
- secondary metadata

Person-specific caution:

- There is no person markdown field yet. Do not invent one during UI migration.
- Default person detail must not be a master-data form.

### Task

Likely adaptation:

- action statement/title as dominant title
- status and priority near title
- due date and parent project/category context
- checklist if present
- notes
- participants/media if present
- secondary metadata

Task-specific caution:

- A task is an actionable unit, so status, due date and checklist are more important than descriptive metadata.
- Destructive delete actions must be protected by `ConfirmModal`.

### Category / Life Area

Likely adaptation:

- title/name as dominant identity
- purpose/scope/description
- linked projects
- linked habits
- linked tasks
- current state/satisfaction only if product data exists
- secondary metadata

Category-specific caution:

- Categories are not participant targets per current data rules.
- Do not treat categories like people/organizations in participation UI.

## 14. Implementation Guardrails

- Do not copy route-local component implementations into new routes.
- Extract canonical components before migrating the next entity detail route.
- Keep entity-specific composition separate from generic components.
- Do not add schema fields to satisfy UI shape without a product/data decision.
- Do not make the pattern heavier to support rare cases. Use optional slots and progressive disclosure.

## 15. Next Phase Recommendation

Recommended next phase: **Phase 9A: Extract canonical components first**.

Reason:

- The pattern is validated on both organization and project/initiative detail.
- Further migrations should reuse shared primitives rather than copy embedded `App.tsx` implementations.
- `/people/:id`, `/tasks/:id` and `/categories/:name` need the shared detail system before migration.
