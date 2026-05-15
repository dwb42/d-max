# DMAX UI Review Checklist

Use this checklist before completing any UI task.

A UI task is not done until this checklist has been applied.

Use this checklist together with `UI_CURRENT_STATE.md`, `UI_PRINCIPLES.md`, `UI_PATTERNS.md` and `UI_COMPONENTS.md`.

## 1. Product coherence

- Does this screen feel like part of DMAX rather than a standalone implementation?
- Does it use the canonical page pattern for this object type?
- Does it reuse shared components before introducing new ones?
- Are any new visual patterns documented?
- Would a comparable route look and behave similarly?

## 2. Primary object clarity

- Is the primary object obvious within three seconds?
- Is the object type clear?
- Is the title/name visually dominant enough?
- Does the header avoid default decorative title icons and unnecessary entity-type eyebrows?
- Is the current state/status clear?
- Is the main next action clear?

## 3. Information hierarchy

- Is the most important content shown first?
- Is secondary metadata de-emphasized?
- Are technical fields hidden or placed in metadata sections?
- Is anything visible only because it exists in the database?
- Can any visible field be hidden, collapsed or moved?

## 4. Cognitive load

- Does the screen show too much at once?
- Are there too many cards, borders, badges or buttons?
- Are repeated elements visually heavier than necessary?
- Is there enough grouping to make the screen scannable?
- Does the UI help the user think, decide or act?

## 5. Editing quality

- Is the default state a good reading/understanding state, not a raw form?
- Are permanent master-data forms avoided on detail pages?
- Are edits intentional and clear?
- Are inline edits used only for small high-frequency fields?
- Are grouped fields edited in a modal or drawer?
- Are description/context blocks editable through a quiet direct interaction rather than mandatory visible edit/add buttons?
- Are save/cancel actions consistent?
- Are validation and save states handled?

## 6. Actions

- Is there at most one visually dominant primary action?
- Are secondary actions consistently placed?
- Are destructive actions separated or protected?
- Are repeated actions named consistently?
- Are actions placed where the user expects them?
- Are useful section-level actions visible enough even when empty relation groups render no heavy empty block?
- Are link actions named consistently, for example `Person verknüpfen`, `Organisation verknüpfen`, `Initiative verknüpfen`, `Maßnahme verknüpfen`?

## 7. Copy and terminology

- Are object names consistent with the active product terminology in `UI_PATTERNS.md`?
- Is German/English terminology mixed unnecessarily in normal user workflows?
- Are section labels specific and useful?
- Does each section subtitle add real value, or can it be removed?
- Does the section explain itself through title and content rather than redundant helper text?
- Are buttons written as clear verbs?
- Are error and empty states specific?
- Is there any unnecessary explanatory copy?

## 8. Relationships

- Are linked objects shown in a consistent relationship pattern?
- Are relationships grouped when necessary?
- Are relation group subtitles omitted when the group title is self-explanatory?
- Is the relationship type clear where relevant?
- Are relationship display and dense relationship management separated when inline controls become too heavy?
- Can the user open related objects easily?
- Are relation actions such as link/unlink/edit clear?
- Are read-only relationship display and relationship editing separated?
- Does `Verknüpfte Initiativen und Maßnahmen` label party-to-initiative/task links where applicable?

## 9. Empty states

- Does every empty section have a useful empty state?
- Is the empty state specific to the section?
- Does it suggest a reasonable next action?
- Does it avoid generic "No data" language?
- Are ordinary empty relationship groups visually light rather than heavy cards?
- Are empty relationship groups creating a wall of absence?
- Is a full `EmptyState` used only when the absence itself is important enough to explain?

## 10. Loading states

- Is the route loading state handled?
- Are important async sections loading safely?
- Is the loading state calm and consistent?
- Does the UI avoid layout jumps where possible?

## 11. Error states

- Are data fetch errors handled?
- Are save errors handled?
- Does error copy explain what failed?
- Is retry possible where appropriate?
- Does the UI avoid losing unsaved user input?
- Are raw technical errors hidden from normal user-facing copy?

## 12. Responsiveness and density

- Does the layout work at common desktop widths?
- Does the layout degrade acceptably at narrower widths?
- Does mobile navigation remain usable without turning into a dense icon grid?
- Does the DMAX drawer open as a full-screen surface on narrow/mobile viewports,
  keep a visible DMAX close/toggle button, and contain scrolling without moving
  the page behind it?
- Is information density appropriate for a power-user tool?
- Is the screen compact without feeling cramped?

## 13. Accessibility basics

- Are buttons and links semantically correct?
- Are form fields labeled?
- Can modals/drawers be closed predictably?
- Is focus behavior reasonable?
- Are icons accompanied by labels or accessible names where needed?
- Is color not the only way to communicate state?

## 14. Visual consistency

- Are spacing, typography and alignment consistent?
- Are there arbitrary new colors, shadows or borders?
- Are badges/buttons/cards using shared variants?
- Are sections aligned to the same grid/rhythm?
- Does the screen avoid visual noise?

## 15. Scope control

- Did the change avoid unrelated feature work?
- Did the change preserve existing business logic?
- Did it avoid data model changes unless explicitly requested?
- Did it avoid broad route rewrites unless requested?

## 16. Final agent report

Before marking the task complete, the agent should report:

1. Which canonical pattern was used.
2. Which shared components were reused or added.
3. Which visual or UX issues were improved.
4. Which checks were run.
5. Any remaining visual uncertainty.
6. Any intentional deviation from the design system.

## 17. Entity List Consolidation

For migrated list pages, also verify:

- The page title and primary create action use consistent product language.
- Create forms are not visible by default.
- Search, when present, is compact and does not become a filter dashboard.
- Row titles/names carry the row.
- Secondary facts are limited, ordered and useful.
- Description previews are contained.
- Row actions do not break row navigation.
- Leading/trailing row actions have accessible names.
- Drawer-open and narrow-viewport states keep the list readable.

## Fast pass/fail rules

Fail the UI review if any of these are true:

- The detail page defaults to a raw form without a strong reason.
- A new one-off component was created where a shared one existed.
- Technical metadata appears before primary content.
- Technical/debug metadata is shown in normal UI without disclosure.
- Comparable routes now use different layouts without documentation.
- The screen shows all fields instead of prioritizing information.
- Empty/loading/error states are missing for the main route.
- Copy uses inconsistent names for the same concept.
