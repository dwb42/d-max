# d-max App UI Notes

Active UI notes. Implemented state belongs in `docs/current-state.md`.

## Current Direction

- Focused operational surfaces for initiative memory, tasks, contextual chat,
  prompt inspection, and Drive Mode.
- Contextual d-max chat stays in a drawer from initiative/task/category contexts.
- Direct UI actions use API routes; natural-language turns route through
  OpenClaw and tools.

## Near-Term UI Work

- Keep initiative and task reordering stable across refreshes.
- Improve dense task scanning and filtering.
- Add initiative/task creation forms only where they do not bypass agent
  confirmation rules.
- Continue using `/prompts` as a debug-only route.
