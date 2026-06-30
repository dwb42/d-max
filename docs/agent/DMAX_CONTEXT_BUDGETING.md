# DMAX Context Budgeting

Date: 2026-06-30

## Purpose

DMAX context assembly now treats context as a budgeted resource. The resolver should not only load more data; it should make explicit choices about what is current, parent, child, sibling, neighbor, or background, and it should document those choices in the prompt log debug payload.

The resolver implementation lives in `src/chat/conversation-context.ts`.
Static prompt-section definitions and template listing live in
`src/chat/conversation-prompt-templates.ts` so future context work can inspect
runtime data assembly without loading the full prompt-template catalog.

## Runtime Shape

Each resolved context still produces:

- `agentContextBlock`
- `promptSections.systemInstructions`
- `promptSections.contextData`
- `contextPayload`

`contextPayload` keeps the existing summary fields and adds:

| Field | Meaning |
|---|---|
| `loadedEntities` | Concrete IDs/titles for entities included in the prompt. |
| `omittedEntities` | Concrete IDs/titles omitted because of caps, budget, duplication, missing data, or relevance. |
| `blocks` | Block-level accounting for context sections, including original/emitted chars and truncation. |
| `deduplications` | Places where a potentially repeated block was intentionally summarized or referenced once. |
| `budgets` | Applied mode-level budgets or caps. |

The payload intentionally stores IDs, titles, roles and truncation metadata, not full raw Markdown bodies.

## Budgets and Caps

Current defaults:

| Mode | Budget / Cap |
|---|---|
| `categories` | context data 15000 chars; category markdown 1200 chars/category; initiatives 6/type/category; tasks 4/category; relations 25. Global task list is summarized, not repeated. |
| `category` | context data 14000 chars; category markdown 6500 chars; initiative context total 8500 chars; initiatives 8/type; initiative markdown 1800 chars before total budget; tasks 25; relations 30. |
| `initiatives` | context data 15000 chars; category background 900 chars/category emitted once; initiatives 14/type/category; tasks 30; relations 40. |
| `ideas` | context data 12000 chars; category background 1200 chars; cross-type context 5/type/category; tasks 25; relations 35. |
| `projects` | same collection caps as `ideas`. |
| `habits` | same collection caps as `ideas`; additionally life areas without habits capped at 12 with 500-char category excerpt. |
| `idea` | context data 10000 chars; category background 3000 chars; initiative markdown 7000 chars; children 12; same-category 8/type; tasks 30; media/participants 20. |
| `project` | context data 11000 chars; same detail caps as `idea`. |
| `habit` | context data 10000 chars; same detail caps as `idea`. |
| `task` | context data 9000 chars; category background 2500 chars; initiative markdown 3500 chars; sibling tasks 18; sibling checklist details 8 tasks / 5 items; same-category 5/type; media/participants 20. |
| `tasks` | context data 10000 chars; open tasks 40. |
| `person` | no fixed total context-data cap. Critical SQLite context is emitted completely: identity/description, full local Gmail history, full manual communication history, all relevant party tasks, and related DMAX task/initiative/calendar context. Lower-priority orientation data is capped: contact points 20, addresses 20, other relationships 30. |
| `organization` | no fixed total context-data cap. Critical SQLite context is emitted completely: identity/Markdown, active related people with descriptions and role labels, full local Gmail/manual communication for the organization plus active related people, all relevant party tasks, and related DMAX task/initiative/calendar context. Lower-priority orientation data is capped: contact points 20, addresses 20, other relationships 30. |

Most context modes also pass through a total context-data budget. If a
branch-specific formatter underestimates growth, that total budget can still
truncate the data section and records a `context-data-total` block. `person`
and `organization` are the intentional exception for critical relationship
work: they have no fixed total context-data cap in `contextDataBudgets`, so the
complete local communication/task/DMAX context is emitted unless a future
product decision changes that contract.

## Deduplication

Current deduplication rules:

- `initiatives`: category markdown appears once under `Life area backgrounds`; typed initiative sections reference categories only by ID/name.
- `categories`: open tasks are shown per category. The global open execution surface is reduced to a summary to avoid repeating the same task lines.

Deduplication decisions are documented in `contextPayload.deduplications`.

## Category Detail Budgeting

Category Detail keeps the full life-area coaching prompt, but initiative context is no longer unbounded.

Priority is deterministic:

1. active before paused/completed/archived,
2. more open tasks,
3. earlier project end date,
4. has Markdown,
5. has predecessor/successor relation,
6. most recently updated.

Initiatives beyond per-type cap are recorded in `omittedEntities` with reason `cap`. Initiatives that fit the cap but exceed the remaining initiative context budget are recorded with reason `budget`. Markdown truncation is recorded in `blocks`.

## Habits List Gap Handling

`habits` context now includes:

```text
Life areas without habits:
- #category Category Name: category description excerpt
```

Only categories with a description or at least one initiative are listed. This gives the agent direct evidence for the question: which desired qualities are not yet maintained by habits?

## Prompt Inspector Debug View

The browser Prompt Inspector renders `contextPayload` in a structured debug view before the normal prompt sections.

Sections:

- `Overview`: context mode, title, payload version, data sources, final prompt size, loaded/omitted entity counts, block counts, truncated/omitted block counts, and deduplication count.
- `Loaded Entities`: grouped by role (`current`, `parent`, `child`, `sibling`, `neighbor`, `related`). Each row shows entity type, ID, title, kind, emitted chars and truncation state.
- `Omitted Entities`: shows entities excluded by cap, budget, duplicate, missing data, or relevance. This is the quickest way to see what the agent did not receive.
- `Blocks / Budget & Truncation`: shows block label, kind, original chars, emitted chars, truncation/omission state and reason.
- `Deduplications`: shows source block, duplicate target and reason when repeated context was intentionally summarized or referenced once.
- `Budgets`: pretty-printed budget metadata from the payload.
- `Raw JSON`: the complete raw payload remains available as a fallback for fields not yet surfaced in the structured UI.

The UI is defensive: missing payloads, partial payloads, or legacy string payloads fall back to warnings plus raw output instead of crashing.

## Party Detail Contexts

Person and organization detail contexts intentionally distinguish critical
relationship work from lower-priority orientation data.

Critical context is not count-capped:

- current person/organization identity and description;
- active organization people, including person description, relationship label,
  role label, and salutation/gender signal from the existing person model;
- all stored local Gmail messages linked to the party context, newest first,
  including inbound/outbound direction, sender/recipients, subject, and full
  stored body;
- all manual party timeline entries, newest first;
- all relevant party-owned or participant tasks/measures, open and done;
- related initiative/project/task/calendar context with initiative Markdown.

For organizations, the party context includes direct organization activity plus
activity/communication for active related people so that messages matched to an
employee contact point are still available on the organization page.

Gmail is read-only context here. The agent receives only synchronized SQLite
records from `gmail_messages` and link tables. DMAX does not expose Gmail
live-read, draft, send, archive, trash, or mutation tools to OpenClaw.

Lower-priority orientation data may be capped and documented in the debug
payload:

- contact points;
- postal addresses;
- non-critical extra party relationships;
- technical metadata and auxiliary facts.

The party response guidance asks the agent to detect contradictions between
communication and open measures prompt-contextually, cite evidence, and suggest
changes before mutating DMAX state.

## Open Points

- The text wrapper is still mixed English/German outside Category Detail. This remains intentionally unchanged in Phase 1.5 to avoid broad prompt-template churn.
- `loadedEntities` and `omittedEntities` are diagnostic, not a complete raw data mirror.
- Calendar/workblock context is still partial outside party detail contexts.
- The Prompt Inspector now has a structured debug view, but it is still developer-oriented and not a polished user-facing context explainer.
