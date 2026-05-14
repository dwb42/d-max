# DMAX UI Documentation

This folder defines the active UI governance layer for DMAX.

DMAX is a quiet, precise, relation-heavy power-user workspace for managing categories, projects, tasks, habits, people, organizations, calendar events, time blocks, notes, communication and contextual relationships.

The purpose of these documents is to stop UI drift. Codex should not invent locally plausible screens. It should work inside a coherent product system.

## How Codex should use this folder

Before implementing or changing any frontend UI, read these files:

1. `UI_CURRENT_STATE.md`
2. `UI_PRINCIPLES.md`
3. `UI_PATTERNS.md`
4. `UI_COMPONENTS.md`
5. `UI_REVIEW_CHECKLIST.md`

Completed refactor planning, route inventories, review docs and screenshot audits live in `archive/completed-ui-refactor/`. They are historical evidence, not default coding-agent context.

## Core rule

DMAX frontend work must optimize for a coherent product system, not for locally plausible screens.

Before creating any UI:

1. Identify the canonical pattern.
2. Reuse shared components.
3. Hide or de-emphasize secondary information.
4. Avoid raw form-first detail pages.
5. Document any intentional deviation.

## Recommended `AGENTS.md` instruction

Add this to the repository-level `AGENTS.md`:

```md
## DMAX UI Development Rules

When implementing or modifying frontend UI, follow:

- `docs/ui/UI_CURRENT_STATE.md`
- `docs/ui/UI_PRINCIPLES.md`
- `docs/ui/UI_PATTERNS.md`
- `docs/ui/UI_COMPONENTS.md`
- `docs/ui/UI_REVIEW_CHECKLIST.md`

Do not invent new UI patterns unless explicitly requested.

A UI task is not complete until:

1. The screen follows the DMAX UI principles.
2. Comparable routes use the same pattern.
3. No arbitrary spacing, color, typography or component variant was introduced.
4. Empty, loading and error states are handled.
5. The UI review checklist has been applied.
6. Any remaining visual uncertainty is reported explicitly.
```
