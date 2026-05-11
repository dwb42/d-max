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
  not own a separate relationship model.
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
- Consider frontend route/component code-splitting; the current production
  build passes but emits Vite's large-chunk warning.
- Continue using `/prompts` as a debug-only route.
