# Codex Context Management

Date: 2026-06-30

## Purpose

This document keeps DMAX coding-agent sessions small without sacrificing the
quality of architecture, debugging, or implementation work.

The target is not to avoid reading code. The target is to avoid loading broad,
repeated, low-signal code and documentation into the Codex conversation before
the task has identified what matters.

## Baseline Problem

The old `AGENTS.md` freshness instruction told Codex to start architecture or
feature work by inspecting a large fixed list:

```text
docs/current-state.md
docs/memory-map.md
README.md
data/schema.sql
src/core/tool-definitions.ts
src/tools/*
src/api/server.ts
src/chat/*
src/voice/*
web/src/App.tsx
openclaw/workspace/AGENTS.md
openclaw/workspace/TOOLS.md
tests/
```

That list is useful as a map, but expensive as a default context load. Some
single files are large enough to dominate a Codex coding session:

| File | Why It Is Expensive |
| --- | --- |
| `web/src/App.tsx` | Large monolithic frontend surface. Read only route/component ranges relevant to the task. |
| `src/chat/conversation-context.ts` | Large resolver/prompt module. Search for mode, function, or constant first. |
| `src/chat/openclaw-agent.ts` | Large OpenClaw gateway/session adapter. Search for session/gateway function names first. |
| `src/api/server.ts` | Large API router. Search for route path or repository/service name first. |
| `docs/current-state.md` | Valuable implemented-state handoff, but too large for default full loading. Search section headings or terms first. |
| `tests/` | Useful for behavior, but only load tests relevant to the touched module. |

## Optimized Workflow

1. Read `docs/memory-map.md` first.
2. Use targeted `rg -n` searches for concrete symbols, route paths, table names,
   tool names, or user-facing labels.
3. Open only small line windows around matches.
4. Load `docs/current-state.md` sections only when they answer a current-state
   question not already answered by code.
5. Load tests adjacent to the module being changed, not the whole test tree.
6. When working on frontend UI, load the active `docs/ui/*.md` governance docs
   and the comparable route/component files, not archived UI history.
7. When a broad audit is truly required, cap output and explicitly record the
   reason.

## Measurement

Run:

```bash
npm run diagnostics:codex-context
```

The script estimates approximate token cost for:

- `legacy-freshness-bulk`: the old fixed list if treated as a default load.
- `optimized-entry`: the recommended small entry set.

The estimate uses `ceil(chars / 4)`. It is not tokenizer-exact, but it is stable
enough to compare repo-context strategies.

Latest local measurement on 2026-06-30:

| Profile | Files | Approx Tokens | Interpretation |
| --- | ---: | ---: | --- |
| `legacy-freshness-bulk` | 86 | 266,706 | Old fixed list if loaded as default context. |
| `optimized-entry` | 3 | 6,481 | New starting point before targeted code reads. |
| Savings | - | 260,225 / 97.6% | Available budget preserved for task-specific code, tests, and reasoning. |

High-impact extraction measurement:

| Change | Before | After | Approx Savings | Quality Risk |
| --- | ---: | ---: | ---: | --- |
| Extract prompt/debug surfaces from `web/src/App.tsx` to `web/src/pages/debug/PromptDebugPages.tsx` | `App.tsx`: 345,744 chars | `App.tsx`: 324,470 chars | ~5,319 tokens when App shell is inspected directly | Low; UI output and route wiring are unchanged, with `tsc` verifying the module boundary. |
| Extract config/OAuth surface from `web/src/App.tsx` to `web/src/pages/config/ConfigView.tsx` | `App.tsx`: 324,470 chars | `App.tsx`: 299,444 chars | ~6,257 tokens when App shell is inspected directly | Low; behavior moved behind the existing `/config` route, with `tsc` and `vite build` verifying the module boundary. |
| Extract chat/agent/drive surfaces from `web/src/App.tsx` to `web/src/pages/chat/ChatSurfaces.tsx` | `App.tsx`: 299,444 chars | `App.tsx`: 267,364 chars | ~8,020 tokens when App shell is inspected directly | Low; LiveKit/session orchestration remains in `App.tsx`, presentational chat surfaces moved to a focused module. |
| Extract Planning Canvas surface from `web/src/App.tsx` to `web/src/pages/planning/PlanningCanvasView.tsx` | `App.tsx`: 267,364 chars | `App.tsx`: 161,591 chars | ~26,444 tokens when App shell is inspected directly | Low to medium; large interactive surface moved mechanically, with date/layout helpers kept local and `tsc` plus `vite build` verifying the module boundary. |
| Extract initiative/timeline/onboarding surfaces from `web/src/App.tsx` to `web/src/pages/overview/InitiativeSurfaces.tsx` | `App.tsx`: 161,591 chars | `App.tsx`: 118,218 chars | ~10,844 tokens when App shell is inspected directly | Low to medium; mostly legacy route/list code plus current timeline/onboarding moved mechanically, with route wiring unchanged and `tsc` plus `vite build` verifying the boundary. |
| Combined `App.tsx` route extraction so far | `App.tsx`: 345,744 chars | `App.tsx`: 118,218 chars | ~56,882 tokens when App shell is inspected directly | Low to medium; route wiring remains in `App.tsx`, domain-heavy screens move to dedicated files. |
| Extract static conversation prompt templates from `src/chat/conversation-context.ts` to `src/chat/conversation-prompt-templates.ts` | `conversation-context.ts`: 157,604 chars | `conversation-context.ts`: 114,658 chars | ~10,737 tokens when the resolver file is inspected directly | Low; public exports remain compatible, prompt rendering tests pass. The old `src/chat/*` bulk wildcard does not benefit because it loads both files. |
| Extract API request schemas from `src/api/server.ts` to `src/api/request-schemas.ts` | `server.ts`: 127,010 chars | `server.ts`: 109,712 chars | ~4,325 tokens when the server file is inspected directly | Low; route behavior is unchanged, schemas remain shared Zod objects, API/chat/calendar tests pass. |
| Extract API HTTP/query helpers from `src/api/server.ts` to `src/api/http-utils.ts` and `src/api/query-parsers.ts` | `server.ts`: 109,712 chars | `server.ts`: 102,049 chars | ~1,916 tokens when the server file is inspected directly | Low; repository-bound route logic stayed in `server.ts`, pure parsing/HTTP helpers moved and focused API/chat/calendar tests pass. |
| Combined `server.ts` extraction so far | `server.ts`: 127,010 chars | `server.ts`: 102,049 chars | ~6,241 tokens when the server file is inspected directly | Low; request schemas and stateless helpers are separated from route orchestration. |
| Extract OpenClaw activity/trajectory parsing from `src/chat/openclaw-agent.ts` to `src/chat/openclaw-activities.ts` | `openclaw-agent.ts`: 106,689 chars | `openclaw-agent.ts`: 77,778 chars | ~7,228 tokens when the gateway orchestrator is inspected directly | Low; public exports remain compatible, activity parsing tests pass. The old `src/chat/*` bulk wildcard reloads both files. |

Quality checks for the latest extraction:

- `npm run typecheck`: pass
- `npm run web:build`: pass; Vite still reports the pre-existing circular chunk warning.
- `npm test -- tests/chat/conversation-context.test.ts tests/chat/context-schema-sync.test.ts`: pass
- `npm test -- tests/api/internal-openclaw-tools.test.ts tests/api/party-activity-summaries.test.ts tests/chat/app-chat.test.ts tests/calendar/calendar-service.test.ts`: pass
- `npm test -- tests/chat/openclaw-agent.test.ts tests/chat/openclaw-external-gateway.test.ts tests/api/internal-openclaw-tools.test.ts`: pass

## Current Stop Line

After the implemented high-impact moves, the largest remaining direct reads are:

| File | Approx Tokens | Reason To Avoid Blind Splitting |
| --- | ---: | --- |
| `web/src/App.tsx` | ~29,555 | Mostly app shell, route wiring, data loading, and mutation orchestration. Further splits should be tied to route work. |
| `src/chat/conversation-context.ts` | ~28,665 | Resolver logic and formatter logic are tightly coupled to context budgeting/debug payloads. Split only with focused resolver tests. |
| `src/api/server.ts` | ~25,513 | Remaining code is mostly route orchestration with repository/service closures. Split by route group only when actively changing that surface. |
| `src/chat/openclaw-agent.ts` | ~19,445 | Remaining code is gateway/session orchestration. Further split should be based on gateway lifecycle boundaries, not token cost alone. |

This is the quality-preserving stop point for broad context optimization. Future
work should continue with context-on-demand and task-scoped extraction, not with
automatic decomposition of orchestration files.

## Quality Guardrails

The optimized workflow must not reduce answer quality by making the agent guess.
Use these checks before finalizing architecture or code changes:

- Did the agent inspect the authoritative code path for the claim?
- Did it inspect schema/migration code if data shape changed?
- Did it inspect tests or add tests for changed behavior?
- Did it inspect `src/chat/conversation-context.ts` when data structure,
  relationships, or agent-visible context changed?
- For UI work, did it inspect active `docs/ui/*.md` and comparable current
  routes/components?

If any answer is no, load the missing targeted line ranges. Do not compensate by
loading broad files wholesale.

## Implemented High-Impact Measures

| Measure | Status | Expected Token Savings | Quality Impact |
| --- | --- | --- | --- |
| Replace default bulk freshness list with targeted candidate map | Implemented in `AGENTS.md` | High | Low risk; preserves mandatory freshness while preventing unnecessary full-file reads. |
| Add explicit large-file read rules | Implemented in `AGENTS.md` | Very high | Low risk; code remains authoritative through targeted search and line reads. |
| Add reproducible Codex context measurement script | Implemented via `npm run diagnostics:codex-context` | High for future tuning | Positive; makes context cost visible before changing rules. |
| Extract prompt/debug surfaces from `web/src/App.tsx` | Implemented in `web/src/pages/debug/PromptDebugPages.tsx` | Very high for prompt/debug work; ~5.3k tokens removed from `App.tsx` | Low risk; dedicated debug surface matches active UI guidance and preserves route wiring. |
| Extract config/OAuth surface from `web/src/App.tsx` | Implemented in `web/src/pages/config/ConfigView.tsx` | Very high for config/OAuth work; ~6.3k tokens removed from `App.tsx` | Low risk; route behavior is unchanged and checks pass. |
| Extract chat/agent/drive surfaces from `web/src/App.tsx` | Implemented in `web/src/pages/chat/ChatSurfaces.tsx` | Very high for chat/voice UI work; ~8.0k tokens removed from `App.tsx` | Low risk; stateful orchestration stayed in `App.tsx`, presentation moved out. |
| Extract Planning Canvas surface from `web/src/App.tsx` | Implemented in `web/src/pages/planning/PlanningCanvasView.tsx` | Very high for planning-canvas work; ~26.4k tokens removed from `App.tsx` | Low to medium risk; the move is large, but behavior is contained and verified by typecheck/build. |
| Extract initiative/timeline/onboarding surfaces from `web/src/App.tsx` | Implemented in `web/src/pages/overview/InitiativeSurfaces.tsx` | Very high for app-shell work; ~10.8k tokens removed from `App.tsx` | Low to medium risk; current route wiring stayed in `App.tsx`, moved surfaces are mechanically preserved and typecheck/build pass. |
| Extract conversation prompt templates from resolver | Implemented in `src/chat/conversation-prompt-templates.ts` | High for resolver work; ~10.7k tokens removed from direct `conversation-context.ts` reads | Low risk; only static templates/instructions moved, resolver behavior covered by existing tests. |
| Extract API request schemas from server | Implemented in `src/api/request-schemas.ts` | High for API work; ~4.3k tokens removed from direct `server.ts` reads | Low risk; schema objects moved without route logic changes and focused API tests pass. |
| Extract API HTTP/query helpers from server | Implemented in `src/api/http-utils.ts` and `src/api/query-parsers.ts` | Medium to high for API work; ~1.9k additional tokens removed from direct `server.ts` reads | Low risk; moved functions are stateless and focused API/chat/calendar tests pass. |
| Extract OpenClaw activity parsing from gateway orchestrator | Implemented in `src/chat/openclaw-activities.ts` | High for OpenClaw gateway work; ~7.2k tokens removed from direct `openclaw-agent.ts` reads | Low risk; public exports preserved and OpenClaw activity/gateway tests pass. |
| Continue splitting `web/src/App.tsx` into smaller modules | Partial | Very high | Remaining extractions should stay route/domain-scoped and include typecheck/build or focused UI checks. |
