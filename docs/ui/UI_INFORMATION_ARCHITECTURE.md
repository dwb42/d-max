# DMAX UI Information Architecture

This file defines how information should be organized across DMAX.

`UI_DESIGN_DECISIONS.md` is the Phase 4 binding decision record. This file describes information hierarchy; the decision file defines which hierarchy choices are accepted, proposed or deferred.

DMAX contains many object types and relationships. The interface should make this complexity legible by grouping information according to user intent, not database structure.

## Top-level navigation

Recommended top-level navigation concepts:

1. Categories
2. Ideas, if still distinct from projects
3. Projects
4. Habits
5. Tasks
6. Context
7. Calendar / Timeline, if implemented as a major surface
8. Prompt Templates, if implemented

## Context area

The `Context` area is the main integration point for:

- people
- organizations
- relationships
- contact points
- addresses
- communication history if implemented
- links to projects, tasks, habits, meetings, notes and calendar events

Context should not feel like a generic CRM bolted onto the app.

It should feel like DMAX's memory of who and what matters.

Creating a dedicated `/context` hub is deferred. Current people and organization routes remain top-level until a later IA phase explicitly changes that.

## Object hierarchy

The product should distinguish between object types but make cross-object relationships easy to see.

### Core planning objects

- Category
- Project
- Habit
- Task
- Time Block
- Calendar Event

### Context objects

- Person
- Organization
- Contact Point
- Address
- Relationship
- Communication Thread / Message if implemented

### Supporting objects

- Note
- Prompt Template
- Attachment / Document if implemented
- Activity / Event log if implemented

## Entity detail information hierarchy

For every entity detail page, organize information in this order:

### 1. Identity

What is this object?

Examples:

- title/name
- type
- state/status
- category/context

### 2. Purpose / meaning

Why does this object matter?

Examples:

- description
- scope
- current situation
- target state
- decision context

### 3. Current action relevance

What should happen next?

Examples:

- next tasks
- active time blocks
- open relationships
- upcoming calendar events
- pending communication

### 4. Relationships

What is this object connected to?

Examples:

- linked people
- linked organizations
- linked projects
- linked tasks
- linked calendar events
- linked notes

### 5. Metadata

What secondary or technical information exists?

Examples:

- created at
- updated at
- owner
- source
- IDs
- sync state

Metadata should rarely appear before purpose or action relevance.

Technical/debug metadata is not part of normal entity detail hierarchy. It belongs in `TechnicalMetadataDisclosure`, `UtilityPage` or `DebugInspectorPage`.

## Object-specific priorities

### Category

Primary information:

- scope/purpose
- current situation
- target state
- satisfaction/priority if used
- linked projects
- linked habits
- linked tasks

Secondary information:

- sort order
- system flag
- created/updated timestamps

### Project

Primary information:

- title
- purpose/description
- state
- date range
- locked/flexible time state
- next tasks
- linked calendar events/time blocks
- linked people/organizations

Secondary information:

- internal IDs
- sync state
- created/updated timestamps

### Task

Primary information:

- action statement
- status
- due date
- owner/responsible person if used
- linked project/category/context

Secondary information:

- created/updated timestamps
- internal IDs
- technical ordering fields

### Habit

Primary information:

- habit definition
- frequency/rhythm
- current state
- linked category/project if relevant
- recent tracking/status if implemented

Secondary information:

- internal IDs
- created/updated timestamps

### Person

Primary information:

- name
- short context/description
- contact points
- linked organizations
- linked projects/tasks/events
- relationship meaning

Secondary information:

- internal IDs
- created/updated timestamps

### Organization

Primary information:

- display name
- short context/description
- people connected to the organization
- contact points
- addresses
- linked projects/tasks/events

Secondary information:

- legal name, if not central
- organization type, if not central
- internal IDs
- created/updated timestamps

Legal name and type should be editable, but they do not need to appear as a prominent raw form at the top of the default detail page.

## List page information hierarchy

List pages should optimize scanning.

Each item should show:

1. title/name
2. state/status if relevant
3. one or two essential supporting attributes
4. relation hints if useful
5. compact action/open affordance

Do not show long descriptions, full metadata or many action buttons in list rows.

## Relationship density

When an object has many relationships:

- group by type
- show counts
- show top/recent/most relevant items
- provide "show all" or detail expansion
- avoid one giant mixed list

Example:

```text
Relationships
  People · 3
  Organizations · 1
  Projects · 4
  Tasks · 12
  Calendar events · 2
```

## Progressive disclosure rules

Hide or collapse information when:

- it is technical
- it is rarely used
- it is not needed for the next decision
- it duplicates information shown elsewhere
- it is only relevant during editing
- it makes the primary object harder to understand

Show information by default when:

- it defines the object
- it changes the next action
- it clarifies an important relationship
- it prevents a likely mistake
- it is frequently used

## Route consistency rule

Routes for similar objects should share layout and interaction patterns.

Comparable groups:

- Person detail and Organization detail
- Project detail and Habit detail where relevant
- Project detail and Task detail where action/state patterns overlap
- Category detail and Project detail where context/description/linked objects overlap
- List pages across all entity types

## Debug/developer information

Developer/debug information should not be visible in ordinary UI unless the product intentionally has a developer mode.

Examples to hide or de-emphasize:

- internal IDs
- raw JSON
- raw sync payloads
- database timestamps
- low-level source flags

If needed, place them in:

- collapsed metadata section
- debug drawer
- developer-only route
