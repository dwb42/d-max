# d-max Memory Map

Date: 2026-05-14

This file defines where Markdown-based memory and configuration belongs.

## Active Repo Docs

| File | Role | Store Here | Do Not Store Here |
| --- | --- | --- | --- |
| `README.md` | Human/developer entry point | Setup, run commands, verification commands, links to current state | Detailed architecture, agent behavior rules, stale plans |
| `AGENTS.md` | Codex working rules for this repo | Inspection rules, architecture boundaries, engineering constraints | User-facing agent personality, long product docs |
| `docs/current-state.md` | Implemented-state source of truth | Current runtime, routes, schema, API surface, known hardening | Aspirational plans, historical decisions |
| `docs/app-ui-plan.md` | Active UI notes | Current UI direction and near-term UI work | Implemented-state duplication |
| `docs/realtime-voice-plan.md` | Active voice hardening notes | Current voice path and remaining hardening | Product-wide memory or obsolete architecture |
| `docs/media-attachments-plan.md` | Media attachment implementation notes and follow-up map | Attachment architecture decisions, current v1 capabilities, and remaining media follow-ups | Source-of-truth implemented state that belongs in `docs/current-state.md` |
| `docs/google-calendar-integration-plan.md` | Google Calendar integration plan and follow-up map | Agreed Google Calendar semantics, sync roadmap, current limitations, and future account/sync work | Source-of-truth implemented state that belongs in `docs/current-state.md` |
| `docs/archive/` | Historical docs archive | Superseded plans, dated handoffs, and old spec packs kept for background context | Active source-of-truth state, current implementation instructions, or runtime rules |

## OpenClaw Workspace Memory

| File | Role | Store Here | Do Not Store Here |
| --- | --- | --- | --- |
| `openclaw/workspace/AGENTS.md` | Runtime behavior for d-max agent | Conversation behavior, initiative/task workflow, app/voice behavior | Repo engineering rules, setup docs |
| `openclaw/workspace/TOOLS.md` | Runtime tool-use policy | Durable state rules, confirmation rules, initiative markdown guidance | Architecture history, implementation details |
| `openclaw/workspace/USER.md` | Minimal user context | Stable facts about Dietrich | Sensitive dossier-like notes |
| `openclaw/workspace/SOUL.md` | Minimal product tone | Short desired feel of d-max | Detailed prompts or product plans |
| `openclaw/workspace/IDENTITY.md` | Optional agent identity | Empty or very short identity metadata | Product architecture |
| `openclaw/workspace/HEARTBEAT.md` | Optional heartbeat tasks | Only active heartbeat tasks | General todo lists |

## Rules

- `docs/current-state.md` wins over older plans.
- Durable initiative memory lives in `initiatives.markdown`; durable
  organization description/context memory lives in `organizations.markdown`.
  There is no person Markdown memory field yet.
- Treat `docs/archive/` as historical background only. Do not rely on archived
  specs or handoffs as current behavior without checking code and
  `docs/current-state.md`.
- Code wins over Markdown when they disagree; update Markdown after code
  changes that alter routes, schema, tools, or runtime boundaries.
- Keep OpenClaw workspace files short because they affect runtime behavior.
- Do not reintroduce removed exploratory memory or session-summary concepts
  without an explicit product decision.
