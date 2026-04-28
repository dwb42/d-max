# d-max Tool Instructions

d-max tools are deterministic. Use them for durable state changes.

Do not write directly to the database outside tools.

## Project Markdown

Use adaptive structure, not a hard template.

Short/simple projects:
- `# Overview`
- `# Notes`

Normal projects:
- `# Overview`
- `# Goals`
- `# Context`
- `# Current Focus`
- `# Notes`

Complex projects:
- `# Overview`
- `# Goals`
- `# Scope`
- `# Context`
- `# Decisions`
- `# Open Questions`
- `# Current Focus`
- `# Next Steps`
- `# Notes`

Do not add empty sections just to satisfy a template. Large rewrites require confirmation.

## Confirmation

Require confirmation for:
- deleting tasks
- archiving or completing projects
- large project markdown rewrites
- batch/mass changes

Small risky actions get a short confirmation question. Larger changes get a concise summary before confirmation.

## Thinking Tools

Use Thinking tools for Brainstorm Mode and exploratory input.

Thinking tools are for soft memory:
- thinking spaces
- thinking sessions
- typed thoughts
- thought links
- tensions
- open loops views

They are not a shortcut for creating projects or tasks.

Recommended flow:
1. Use `listThinkingSpaces` to find an existing thinking space.
2. Use `getThinkingContext` to resume an existing thinking space before adding new interpretation.
3. Use `createThinkingSpace` when the topic is genuinely new.
4. Use `createThinkingSession` for a meaningful long text/voice capture.
5. Use `captureThoughts` with typed, atomic thought objects.
6. Use `createTension` for unresolved want/but conflicts.
7. Use `linkThought` when a thought clearly relates to another thought, tension, category, project, or task.
8. Use `renderOpenLoops` or `getThinkingContext` to inspect the current cognitive surface.

Use these meanings consistently:
- `confidence`: how confident the agent is in the interpretation.
- `heat`: recency, recurrence, emphasis, or unresolved pressure.
- `maturity`: how close a thought is to becoming a test, commitment, project, or task.

Commit gates:
- A `possible_project` must be checked with `renderProjectGate` and confirmed before `createProject`.
- A `possible_task` must be checked with `renderTaskGate` and confirmed when speculative before `createTask`.
- If a candidate is not ready, keep it as a thought.

Gate tools are read-only. They do not create execution work.

Use `renderProjectGate` to inspect:
- candidate type
- why clarity
- scope clarity
- category clarity
- next step or success signal

Use `renderTaskGate` to inspect:
- candidate type
- concrete action
- individual executability
- project context or explicit Inbox permission
- speculative vs. committed state

Task extraction from Thinking Memory:
- If no `possible_task` thoughts exist, create candidate thoughts first.
- Run `renderTaskGate` on candidates before creating tasks.
- Treat "make tasks from this" as a request for candidates, not as batch creation confirmation.
- Create only the exact tasks Dietrich confirms.

After confirmed extraction:
- Use `createProject` or `createTask` for the execution entity.
- Use `linkThought` with `relation = extracted_to` from the source thought to the new project/task.
- Use `updateThought` to set `maturity = committed`.
- Use `status = resolved` only when the created entity fully represents the source thought.
