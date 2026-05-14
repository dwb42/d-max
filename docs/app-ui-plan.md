# d-max App UI Notes

Active UI notes. Implemented state belongs in `docs/current-state.md`.

## Current Direction

- Focused operational surfaces for initiative memory, tasks, contextual chat,
  prompt inspection, and Drive Mode.
- Contextual d-max chat stays in a drawer from initiative/task/category contexts.
- Direct UI actions use API routes; natural-language turns route through
  OpenClaw and tools.
- Current primary navigation is organized around life areas, ideas, projects,
  habits, tasks, people, organizations, calendar, planning canvas, Drive Mode,
  config, and debug prompt views. `/projects` is the default product entry
  surface.
- The Who dimension uses pragmatic operational screens rather than CRM-style
  dashboards. `/people` and `/organizations` provide list/create/search
  surfaces. `/people/:id` and `/organizations/:id` are two-column detail
  surfaces: core data and contact points on the left, relationships and DMAX
  contexts on the right. The layout uses a dedicated `party-detail-layout`
  rather than the generic narrow-list `split-view`.
- Initiative and task detail pages expose people/organization participation
  through a compact `Beteiligte` panel. Role display should preserve both a
  configured role type and an additional free-text role label when both exist.
- Contact-point creation uses its own responsive `contact-point-create-form`
  because the participant creation grid is too wide for detail cards. Contact
  point controls must stay within the card and wrap before overlapping adjacent
  panels.
- The Planning Canvas is a project-only operational timeline. It reads
  parent-child and predecessor/successor relations from domain tables; it does
  not own a separate relationship model. Locked project spans keep horizontal
  date movement disabled while still allowing vertical row/prioritization moves.
- The Planning Canvas also shows Google all-day/multi-day commitments in a
  read-only top lane. Google events can be hidden from this surface; hidden
  rules are restored through the lower-left sidebar button rather than through
  controls floating over the canvas.
- The Calendar day/week view separates fixed commitments from flexible project
  planning in its top lanes. Calendar URL parameters are the source of truth for
  the visible day/week and all-day expansion state.
- Calendar and Google-event modals should keep one central save action and
  progressively disclose link/promote controls rather than showing every option
  upfront.
- Media attachments are first-class in initiative and task detail views, with
  modal preview/edit/re-analysis flows. Category, calendar-entry, and chat
  attachment UIs are not first-class yet.
- Relationship editing, address editing, and communication-thread UIs remain
  future work; current Who UI intentionally focuses on identity, contact
  points, and participation.

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
