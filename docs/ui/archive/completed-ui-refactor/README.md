# Completed UI Refactor Archive

Archived on: 2026-05-14

This folder contains historical planning, audit, review and screenshot evidence from the completed DMAX canonical UI refactor.

## What Is Archived

- Phase and handover documents: `UI_PHASE_*.md`, the long `UI_REFACTOR_HANDOVER.md`.
- Route inventory, debt and audit documents: `UI_ROUTE_INVENTORY.md`, `UI_DEBT_REPORT.md`, `UI_PATTERN_GAPS.md`, `UI_SCREENSHOT_*.md`.
- Historical design/planning documents: `UI_DESIGN_DECISIONS.md`, `UI_COMPONENT_EXTRACTION_PLAN.md`, `UI_ENTITY_DETAIL_CANONICAL_PATTERN.md`, `UI_COPY_LANGUAGE.md`, `UI_INFORMATION_ARCHITECTURE.md`.
- Per-route review documents: `UI_REFERENCE_REVIEW_*.md`.
- Screenshot artifacts under `screenshots/`.

## Why It Is Archived

The canonical detail-page and list-page refactor is complete. Keeping every phase and review document in the active `docs/ui/` root made future coding-agent context too large and too history-heavy.

## When To Consult This Archive

Use this archive only when you need historical evidence, old screenshot comparisons, phase-specific rationale, or migration review details.

Do not load these files into default coding-agent context for ordinary frontend work. Use the active docs in `docs/ui/` instead:

- `UI_CURRENT_STATE.md`
- `UI_PRINCIPLES.md`
- `UI_PATTERNS.md`
- `UI_COMPONENTS.md`
- `UI_REVIEW_CHECKLIST.md`
