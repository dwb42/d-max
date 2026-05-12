# d-max App UI Notes

Active UI notes. Implemented state belongs in `docs/current-state.md`.

## Current Direction

- Focused operational surfaces for initiative memory, tasks, contextual chat,
  prompt inspection, and Drive Mode.
- Contextual d-max chat stays in a drawer from initiative/task/category contexts.
- Direct UI actions use API routes; natural-language turns route through
  OpenClaw and tools.
- Current primary navigation is organized around life areas, ideas, projects,
  habits, tasks, calendar, planning canvas, Drive Mode, config, and debug prompt
  views. `/projects` is the default product entry surface.
- The Planning Canvas is a project-only operational timeline. It reads
  parent-child and predecessor/successor relations from domain tables; it does
  not own a separate relationship model. Locked project spans keep horizontal
  date movement disabled while still allowing vertical row/prioritization moves.
- The Calendar day/week view separates fixed commitments from flexible project
  planning in its top lanes. Calendar URL parameters are the source of truth for
  the visible day/week and all-day expansion state.
- Calendar and Google-event modals should keep one central save action and
  progressively disclose link/promote controls rather than showing every option
  upfront.
- Media attachments are first-class in initiative and task detail views, with
  modal preview/edit/re-analysis flows. Category, calendar-entry, and chat
  attachment UIs are not first-class yet.

## Near-Term UI Work

- Add UI affordances only where they respect existing API/tool confirmation
  boundaries.
- Keep hierarchy/relation selectors aligned with repository constraints once
  parent-cycle protection is added.
- Improve dense task scanning and filtering without reintroducing extra task
  statuses beyond `open` and `done`.
- Continue route/component code-splitting as routes grow. `/calendar` is already
  split into a lazy route chunk; LiveKit remains in the main startup path until
  Drive-specific lazy loading is explicitly prioritized.
- Continue using `/prompts` as a debug-only route.
