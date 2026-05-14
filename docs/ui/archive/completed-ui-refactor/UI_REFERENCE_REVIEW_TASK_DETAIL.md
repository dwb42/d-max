# DMAX UI Reference Review: Task Detail

## 1. Executive Summary

Phase 12 migrated `/tasks/:id` to the canonical DMAX entity detail pattern.

The task detail page is now a compact action-oriented entity page:

- `EntityHeader` makes the task title dominant.
- Status, priority and due date are near the title as direct controls.
- The default page is read-first/action-first, not a raw form.
- Notes, checklist, parent context, participants and media are organized as canonical sections.
- Parent project/category context uses relation-style rows.
- Secondary task facts use `MetadataGrid`.
- Invalid task routes show user-facing not-found copy.
- The contextual DMAX drawer opens with task scope and preserves a readable page layout.

The migration validates the entity detail system for small operational action objects.

Phase 12.6 applied human feedback and makes `/tasks/:id` ready as the canonical action-object reference.

## 2. What Changed

- Replaced the route-specific `TaskDetailHeader` surface with `EntityHeader`.
- Added direct title editing with `InlineEditableText`.
- Kept status, due date and priority editable, but moved them into the header facts area.
- Replaced the old detail metadata panel with `MetadataGrid`.
- Converted task notes to the canonical headingless `DescriptionBlock` interaction with an `EditModal`.
- Converted the checklist into a `SectionBlock` with lightweight empty handling.
- Added a `Kontext` section for parent project and category using `RelationList` / `RelationItem`.
- Rendered participants and media as canonical section-style surfaces.
- Added task-specific user-facing load/not-found handling.
- Removed the default `MetadataGrid` subtitle so normal metadata does not imply technical/debug content.

## 3. Canonical Patterns Reused

- `EntityDetailPage`
- `EntityHeader`
- `InlineEditableText`
- `SectionBlock`
- `DescriptionBlock`
- `RelationList`
- `RelationItem`
- `MetadataGrid`
- `EmptyState`
- `ErrorState`
- `EditModal`

## 4. Task-Specific Adaptations

Tasks are smaller and more operational than organizations, people or projects.

Adaptations:

- Notes appear before checklist so the page first explains what the task is about, then shows concrete checklist items.
- Status, priority and due date are header-level facts rather than hidden metadata.
- Notes use `DescriptionBlock` as a headingless context surface.
- Parent project and category are shown as context relations, not as a full relationship-management area.
- Participants and media retain route-local behavior, but participant creation is now hidden behind a section action and `EditModal`.

## 5. Screenshot Inventory

Screenshots are saved in `docs/ui/screenshots/reference-task-detail/`.

| Filename | Route / state | Demonstrates | Density | Sufficient |
|---|---|---|---|---|
| `01-task-detail-normal.png` | `/tasks/1` normal | Canonical task detail layout, header controls, notes, context, metadata | medium | yes |
| `02-task-detail-notes.png` | `/tasks/1` notes area | Headingless `DescriptionBlock` for task notes | low | yes |
| `03-task-detail-checklist.png` | `/tasks/37` checklist populated | Checklist as primary action/progress section | medium | yes |
| `04-task-detail-participants.png` | `/tasks/1` participants section | Section-style participant surface and lightweight empty state | medium | yes |
| `05-task-detail-media.png` | `/tasks/1` media section | Section-style media upload area with sparse data | medium | yes |
| `06-task-detail-dmax-drawer-open.png` | `/tasks/1` DMAX drawer open | Drawer scoped to task context and readable main page | high | yes |
| `07-task-detail-not-found.png` | `/tasks/999999` | User-facing task not-found state | low | yes |
| `08-task-detail-narrow-viewport.png` | `/tasks/1` narrow viewport | Responsive stacking and readable header/actions | high | yes |
| `09-task-status-or-date-edit.png` | `/tasks/1` due date edit | Direct header-level due date editing | medium | yes |
| `10-task-notes-edit.png` | `/tasks/1` notes edit modal | Notes editing through `EditModal` | medium | yes |

Missing later screenshots:

- Task with populated participants.
- Task with populated media attachments and media modal.
- Successful DMAX drawer response after sending a new task-scoped message.

## 5A. Phase 12.6 hardening after human feedback

Status: **Ready as canonical action-object reference**.

Human feedback requested a focused hardening pass before category migration. Implemented changes:

- Removed the parent project name from directly under the task title. Parent project/category context remains available in the lower `Kontext` relation section and in secondary metadata.
- Kept the task title as a standalone dominant header without a default icon or entity-type eyebrow.
- Reordered the header facts to `Status`, `Priorität`, `Fällig`.
- Changed due-date editing so clicking the visible due-date control opens the native date picker directly where the browser supports it. The implementation uses native `input[type=date]` with `showPicker()` and falls back to a programmatic input click.
- Removed the visible intermediate date input from the header.
- Kept due-date display free of an artificial trailing period.
- Moved task notes before checklist.
- Removed redundant empty checklist copy such as `Noch keine Checklisteneinträge.`
- Removed redundant empty participant copy such as `Noch keine Beteiligten.`
- Hid the participant add form behind `Beteiligte hinzufügen` and moved the current add fields into `EditModal`.

Screenshot evidence is saved in `docs/ui/screenshots/reference-task-detail-hardening/`.

| Filename | Demonstrates | Result |
|---|---|---|
| `01-task-detail-header-after-hardening.png` | Parent project no longer appears as title subtitle; header facts are status, priority, due date | pass |
| `02-task-detail-description-before-checklist.png` | Notes/description appears before checklist | pass |
| `03-task-detail-empty-checklist-lightweight.png` | Empty checklist has no redundant empty sub-line and keeps add input available | pass |
| `04-task-detail-participants-lightweight.png` | Empty participants section is light and only shows the section action | pass |
| `05-task-detail-participant-add-modal.png` | Participant add fields open in `EditModal` | pass |
| `06-task-detail-due-date-edit.png` | Clicking due date opens the native Chromium date picker in the captured environment | pass with browser caveat |
| `07-task-detail-narrow-viewport-after-hardening.png` | Narrow viewport remains readable and stacked | pass |

Validation after Phase 12.6:

- `npm run typecheck`: passed.
- `npm run web:build`: passed.
- `npm test`: passed, 27 test files / 112 tests.

Known limitations:

- Native date picker rendering is browser/OS-controlled. The screenshot captured Chromium's picker, but other browsers may render different chrome or expose a different picker affordance.
- Populated task participants and task media still need fixture-backed visual validation.
- The checklist implementation remains route-local. Do not extract a generic checklist component unless another route needs the same behavior.

Recommended next phase after acceptance: migrate `/categories/:name` to the canonical entity detail pattern.

## 6. Header Review

Status: pass.

The task title is visually dominant. There is no decorative title icon and no entity-type eyebrow. Status, priority and due date are close enough to the title to support action. The route no longer depends on a generic prominent `Bearbeiten` button.

Direct editing is available for the title, status, priority and due date. This matches the task-specific need for fast operational updates.

## 7. Read-First vs Action-First Review

Status: pass.

The page is not form-first. The default view presents the task, its current operational state and its work areas. Editing remains available through direct controls and contained modals.

For tasks, the canonical detail pattern is read-first and action-first: the user can scan the object and immediately act without seeing a raw master-data form.

## 8. Notes / Description Review

Status: pass.

Task notes use the canonical `DescriptionBlock` behavior:

- no visible `Beschreibung` heading
- no default visible edit/add button
- quiet empty state
- click-to-edit surface
- contained editing in `EditModal`

Task notes now appear before checklist so the user can understand the task before working through checklist items.

## 9. Checklist Review

Status: pass with caveat.

The checklist now appears directly after notes. It is compact, calm and visibly connected to task execution. Empty checklist state is lightweight, and populated checklist state preserves existing toggle, edit, delete and reorder behavior.

Caveat: the checklist still uses task-specific local implementation rather than a shared checklist component. That is acceptable for Phase 12 because no other migrated route needs this exact behavior yet.

## 10. Parent Project / Category Context Review

Status: pass.

The task context section shows the parent initiative/project and category as relation-style rows. The project row navigates to the parent initiative/project. The category row navigates to the relevant collection category route.

This keeps parent context visible without building a full relationship manager.

## 11. Participants Review

Status: partial pass.

Participants now render as a section-style surface. The empty state is lightweight and the add/link fields are hidden by default behind a `Beteiligte hinzufügen` section action that opens `EditModal`.

Caveat: local fixture data has no populated task participants, so populated visual validation is still missing.

## 12. Media / Attachments Review

Status: partial pass.

Media attachments render as a section-style surface and preserve the existing upload/drop behavior.

Caveat: local fixture data has no task media attachments, so populated media rows and task media modal were not visually validated.

## 13. Metadata Review

Status: pass.

Task metadata is secondary and user-facing:

- status
- priority
- due date
- parent project
- category
- checklist count when present
- participant/media counts when present
- created/updated/completed timestamps

Internal IDs and raw technical fields are not shown in normal metadata.

## 14. DMAX Drawer Review

Status: pass with caveat.

The task-scoped DMAX drawer opens from `/tasks/:id`, shows the task title as DMAX context, and does not expose raw `contextEntityId` or stack-like technical errors. The main page remains readable while the drawer is open.

Caveat: the screenshot validates layout and existing conversation rendering, not a fresh successful agent response.

## 15. Error / Empty / Loading State Review

Status: pass.

- `/tasks/999999` shows user-facing not-found copy.
- Loading uses a calm `EmptyState`.
- Empty checklist and participant states are lightweight and omit redundant empty sub-lines.
- Empty notes use the canonical quiet description surface.
- Empty media state remains a drop/upload work area, which is appropriate because upload is the primary interaction.

## 16. Narrow Viewport Review

Status: pass.

The header wraps cleanly, controls remain accessible, main content stacks, and metadata moves below the primary content. No horizontal overflow was visible in the captured narrow screenshot.

## 17. Remaining Issues

- Task participants and task media need populated fixture data for a stronger visual review.
- The task checklist remains route-local and may deserve extraction only if another route needs checklist behavior.
- The native date picker is browser/OS-controlled; the app directly invokes the native picker in Chromium via `showPicker()`, but visual chrome may differ by browser.

## 18. Questions For Human Product Review

- Are status, priority and due date correctly weighted in the header after the Phase 12.6 order change?
- Should task parent context stay as its own section, or eventually become a compact header context affordance?
- Should a future relationship manager replace the contained participant add modal, or is this modal sufficient for task detail?

## 19. Recommended Next Phase

Recommended next phase: `/categories/:name` migration.

Phase 12.6 addresses the focused task-detail feedback. Do not migrate list pages, calendar/timeline/planning, utility/debug routes or broad app shell surfaces as part of the category migration.
