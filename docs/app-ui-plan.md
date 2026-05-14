# d-max App UI Notes

Active UI notes. Implemented state belongs in `docs/current-state.md`.
Canonical UI rules live in `docs/ui/`. The forward-looking post-refactor
technical roadmap lives in `docs/architecture/DMAX_NEXT_WORK_PLAN.md`.

## Current Direction

- Focused operational surfaces for initiative memory, tasks, relationships,
  contextual chat, prompt inspection, calendar/planning, and Drive Mode.
- Canonical entity detail and list pages are complete. Route-level list
  compositions live under `web/src/pages/lists/`; canonical detail compositions
  live under `web/src/pages/details/`.
- Contextual d-max chat stays in a drawer from list/detail contexts.
- Direct UI actions use API routes; natural-language turns route through
  OpenClaw and tools.
- Current primary navigation is organized around life areas, ideas, projects,
  habits, tasks, people, organizations, calendar, planning canvas, Drive Mode,
  config, and debug prompt views. `/projects` is the default product entry
  surface.
- The Who dimension uses pragmatic operational screens rather than CRM-style
  dashboards. `/people` and `/organizations` use canonical list pages with
  create actions behind modals. `/people/:id` and `/organizations/:id` use the
  canonical detail pattern for identity, contact points, addresses,
  relationships, and DMAX contexts.
- Initiative and task detail pages expose people/organization participation
  through a compact `Beteiligte` panel. Role display should preserve both a
  configured role type and an additional free-text role label when both exist.
- Organization contact points and postal addresses use modal create/edit flows
  with explicit delete confirmation. Avoid reintroducing inline label/value
  editing on the organization detail page.
- Organization members are represented through existing party relationships to
  people. Adding a member creates a `party_relationship`; clicking a member
  navigates to the person detail route.
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
- Relationship-type editing, person postal-address editing, and
  communication-thread UIs remain future work; current Who UI intentionally
  focuses on identity, organization context, contact/address data, membership,
  relationships, and DMAX participation.

## Near-Term UI Work

- Follow `docs/architecture/DMAX_NEXT_WORK_PLAN.md` for next technical phases.
- Recommended first technical workstream: DMAX drawer/context extraction, then a
  narrow `App.tsx` orchestration decomposition.
- Keep config/prompts/debug containment separate from normal entity/list UI.
- Treat task filtering/archived tasks, `RelationshipManager`,
  `TechnicalMetadataDisclosure`, habit recurrence semantics, category
  reordering, and richer contact previews as product-specific follow-up work
  requiring discovery before implementation.
- Continue route/component code-splitting as routes grow. `/calendar` is
  already split into a lazy route chunk; LiveKit remains in the main startup
  path until Drive-specific lazy loading is explicitly prioritized.
