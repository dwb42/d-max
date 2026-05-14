# DMAX Context Response Contracts

Date: 2026-05-14

## Purpose

DMAX context assembly already tells the agent which view and data context are active. Response contracts add the second half: how the agent should answer in that context.

They are not rigid templates. They are response guidance inside the runtime instructions. The agent should answer the concrete user question first, use only the relevant sections, and keep short questions short.

## Runtime Source

The implementation lives in `src/chat/conversation-context.ts`.

`listPromptTemplates()` uses the same `buildPromptSections()` path as runtime context assembly. This keeps `/prompt-vorlagen` aligned with the actual instructions sent in the OpenClaw message block.

Shared policy is emitted for every context:

- answer the concrete user question first,
- use context actively without repeating it unnecessarily,
- name gaps and uncertainty clearly,
- do not create or mutate durable objects unless explicitly asked,
- mark suggestions as suggestions,
- ask at most one precise clarification question when needed,
- do not automatically end every answer with a question,
- formulate a clear next step as a suggestion when that is enough,
- answer in the user's language where possible,
- use response structures as guidance, not as a fixed form.

## Contracts by Context Mode

| Context Mode | Response Logic |
|---|---|
| `categories` | Reflect the whole life-area model: auffaellige Lebensbereiche, well-described areas, underdefined areas, tensions, gaps between life areas and initiatives, next clarification step. |
| `category` | Clarify the life area before judging initiatives: Scope, current state, pain/tension, target quality, initiative fit, gaps, one next good question. |
| `initiatives` | Compare initiatives against life-area descriptions: fitting initiatives, discrepancies, underserved life areas, overweighting or avoidance patterns, possible missing initiatives, recommended focus. |
| `ideas` | Perform creative portfolio pattern recognition: clusters, recurring motives, links to projects/habits, maturity levels, adjacent ideas, next exploration. |
| `projects` | Review project portfolio and attention: acute attention needs, scope/goal ambiguity, task gaps, blockers/dependencies, time relevance, next project decision. |
| `habits` | Review qualities and maintenance: maintained qualities, unmaintained qualities, unclear habits, unrealistic habits, missing maintenance actions, next maintenance impulse. |
| `idea` | Treat one idea as a possibility space: motivation, possible directions, analogies, hypotheses, research fields, later condensation, small experiments. |
| `project` | Act as scope clarifier and implementation architect: motivation, goal/result, scope/non-scope, Definition of Done, timeframe, risks/blockers/dependencies, task structure, next step. |
| `habit` | Structure quality maintenance: desired quality, meaning, current state, target level, maintenance actions, frequencies, minimum version, obstacles, next maintenance impulse. |
| `task` | Help operationally: task clarity, outcome, split, context fit, sibling-task neighborhood, simplest path, executability, follow-up tasks where useful. |

## Phase 2.2 Fine Tuning

Phase 2.2 did not change the architecture. It only tightened selected response guidance after qualitative acceptance with real prompt logs.

Changes:

- `idea` detail now favors concentrated exploration. Phase 2.4 sharpened this further: normal exploratory questions should produce about 5-7 prioritized points total across variants, hypotheses, research/input fields, and possible condensation. They should not produce 3-5 points per subgroup.
- `project` detail now emphasizes project definition before task expansion: if goal, scope, or Definition of Done are unclear, the agent should first clarify those and name at most the 3 most important task-structure gaps or next clarification steps.
- `category` detail now makes labels more explicit for life-area clarification questions: Scope, Aktueller Zustand, Schmerz / Spannung, Zielbild / gewuenschte Qualitaet, Passung der Initiativen, Luecken, and next clarification step.
- Closing questions are no longer encouraged automatically. The shared policy now says to ask a question only when it is necessary for the next useful step; otherwise, provide a clear suggested next step.

These are still guidance rules, not output templates. The agent should continue to answer the concrete user question first and omit irrelevant sections.

## Phase 2.4 Idea Detail Patch

Phase 2.4 only changes `idea` detail guidance. It does not change context assembly, data models, UI, or tools.

The reason: runtime spotcheck showed that "3-5 variants plus 3-5 hypotheses plus 3-5 research fields" still produced long answers. The new rule is a total answer budget:

- normal free exploration: about 5-7 prioritized points total,
- maximum 3-4 short sections,
- choose the strongest points instead of filling every category,
- broader maps, long lists, and complete variant spaces only on explicit request.

The idea should still be treated as a possibility space and should not become a premature project or task list.

## Non-Template Rule

The section names are preferred patterns for analysis questions. They should not be emitted mechanically for every message.

For example:

- A short task question can receive a short operational answer.
- A category audit can use multiple structured sections.
- An unclear request should produce at most one good clarification question.
- An explicit execution request should lead to concrete support or tool use rather than a full reflective analysis.

## Open Points

- The outer prompt wrapper remains mixed English/German outside Category Detail. This is existing behavior and was not changed in Phase 2.
- The contracts guide response shape but do not enforce structured output. If strict machine-readable answers are needed later, that should be a separate product decision.
- Response contracts currently live in `conversation-context.ts` beside context instruction builders. If this grows further, extracting a small prompt module may become useful.
