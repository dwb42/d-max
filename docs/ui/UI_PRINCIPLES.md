# DMAX UI Principles

## Phase 4 decision status

`UI_DESIGN_DECISIONS.md` is the binding Phase 4 decision record. When this file and `UI_DESIGN_DECISIONS.md` differ in specificity, follow the more specific decision in `UI_DESIGN_DECISIONS.md`.

## Product character

DMAX is a quiet, precise, high-density but low-noise workspace for a power user.

It should feel more like a personal operating system for thinking, planning and acting than like a generic admin dashboard.

The UI should be:

- calm
- elegant
- compact
- consistent
- text-clear
- relation-aware
- keyboard-friendly where practical
- optimized for repeated daily use
- restrained in visual decoration

The UI should not feel:

- clumsy
- noisy
- bloated
- randomly composed
- form-first
- debug-first in normal workflows
- like a raw CRUD backend
- like every field deserves equal visibility
- like unrelated screens were built by different teams

## Central design goal

DMAX helps the user understand, structure and act on a complex personal system of objects and relationships.

The interface should therefore make complexity navigable. It should not simply display all available complexity at once.

## Core principles

### 1. Coherent product system over locally plausible screens

Every route must feel like part of the same product.

Do not solve each screen independently. Reuse the same page structures, entity headers, action patterns, relation displays, metadata areas and editing patterns.

### 2. Progressive disclosure over information dumping

Only show information by default when it helps the user understand the object, decide what to do next or act.

Secondary information should be collapsed, de-emphasized, moved into metadata sections, placed behind drawers/modals or shown only in context.

### 3. One canonical pattern per object type

Entity detail pages should share a common structure.

Entity list pages should share a common structure.

Editing grouped fields should follow one pattern.

Relationship displays should follow one pattern.

Avoid one-off route-specific UI unless the difference is intentional and documented.

### 4. Primary object first

Every screen should make the primary object obvious within three seconds.

A user should immediately understand:

- What object am I looking at?
- What state is it in?
- What are the most important related objects?
- What is the likely next action?

### 5. Actions should be stable and predictable

Primary actions should appear in consistent locations.

Destructive actions should be visually and interaction-wise separated from ordinary actions.

Secondary actions should not compete with the primary action.

### 6. Editing should feel intentional

Do not make entity detail pages look like permanent raw edit forms.

Default page state should be reading, understanding and acting.

Editing is a deliberate mode or interaction.

Use inline editing for small high-frequency fields. Use modals or drawers for grouped fields.

Permanent master-data forms are not allowed as the default entity detail view.

### 7. Metadata is secondary by default

Technical fields, audit fields, IDs, timestamps and rarely used attributes should not dominate the screen.

Metadata belongs in a consistent secondary area.

### 8. Relationships are first-class

DMAX is relation-heavy. Relationships between categories, projects, tasks, people, organizations, calendar events, time blocks, notes and communication are core product value.

Relationship UI must be easy to scan, consistent and action-oriented.

### 9. Text clarity over decoration

Good labels, short descriptions and clear hierarchy matter more than decorative UI.

Do not add icons, colors, shadows or extra cards merely to make the screen look designed.

Section titles should do more work than explanatory subtitles. If a title and the contained items already make the section clear, omit the subtitle.

### 10. Compact, not cramped

DMAX should support dense information, but it must remain visually calm.

Density is achieved through hierarchy, grouping and consistent spacing, not through squeezing everything into the viewport.

Absence should be quiet. Ordinary empty relationship groups should not create heavy "nothing here" blocks or a wall of empty boxes.

## Visual attitude

Preferred direction:

- understated
- editorial
- structured
- precise
- somewhat premium
- less SaaS-dashboard, more calm workspace

Avoid:

- colorful dashboard widgets
- oversized cards everywhere
- multiple competing panels
- random badges
- noisy borders
- excessive explanatory copy
- duplicate action buttons
- raw database field exposure

## Default decision rule

When in doubt, show less, structure better and make the next action clearer.

Do not fix a confusing screen by adding more visible information.

For Phase 5, `/organizations/:id` is the first reference implementation route for the entity detail pattern. The organization contextual DMAX drawer bug identified in `UI_SCREENSHOT_AUDIT.md` must be investigated or contained during that implementation phase, not in this decision phase.
