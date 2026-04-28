# d-max Thinking System Plan

Date: 2026-04-28

Status: Active Post-MVP Module

## Product Decision

"Brainstorm Mode" remains a user-facing phrase, but the durable software model
is the Thinking System.

The Thinking System is the soft, exploratory memory layer between raw
conversation and committed execution objects.

```text
Telegram text/voice
-> OpenClaw thinking workflow
-> d-max thinking tools
-> SQLite thinking memory
-> optional confirmed extraction to projects/tasks
```

## Core Principle

d-max has two memory worlds:

- Thinking Memory: thoughts, tensions, uncertainty, project candidates, task candidates, open loops.
- Execution Memory: categories, projects, tasks, project markdown.

The agent may interpret Thinking Memory, but it must not silently promote it
into Execution Memory. Projects and tasks require explicit confirmation and
must still be created through the existing deterministic tools.

## First Slice

Build the smallest vertical slice that proves the new behavior:

- Thinking Spaces
- Thinking Sessions
- Thoughts
- Thought Links
- Tensions
- Open Loops View

Do not build experiments, mental diff, or automatic extraction yet.

## Domain Objects

### Thinking Space

A persistent thematic thinking area, such as:

- Health Rhythm
- d-max Architecture
- Business Direction
- Family Logistics

A space outlives any single Telegram message or voice note.

### Thinking Session

A concrete capture event inside a thinking space. A session can store raw input
and a short summary, but it is not the source of truth.

### Thought

An atomic semantic unit extracted from conversation.

Suggested thought types:

```text
observation
desire
constraint
question
hypothesis
option
fear
pattern
possible_project
possible_task
decision
discarded
```

Suggested statuses:

```text
active
parked
resolved
contradicted
discarded
```

Suggested maturity values:

```text
spark
named
connected
testable
committed
operational
```

### Thought Link

A reference from one thought to another thought or execution entity.

Suggested relation values:

```text
supports
contradicts
causes
blocks
refines
repeats
answers
depends_on
candidate_for
extracted_to
mentions
context
```

Links are references, not ownership.

### Tension

An explicit unresolved conflict.

Examples:

```text
want: "More energy"
but: "Evenings are low-capacity"
pressure: medium
```

Suggested statuses:

```text
unresolved
parked
resolved
discarded
```

## Agent Workflow

For exploratory, ambiguous, multi-topic, emotional, strategic, or unresolved
input:

1. Identify or create a thinking space.
2. Capture the input as a thinking session when useful.
3. Compile the message into typed thoughts.
4. Link new thoughts to existing thoughts or execution entities when clear.
5. Create tensions for unresolved want/but conflicts.
6. Render a concise cognitive view.
7. Ask before promoting anything into projects or tasks.

## Commit Gates

Project candidates should not become projects unless:

- the why is clear
- the scope boundary is clear enough
- the category is clear
- there is at least one next step or success signal
- Dietrich confirms creation

Task candidates should not become tasks unless:

- there is a concrete verb
- the action is individually executable
- project context is clear, or Inbox is explicitly appropriate
- Dietrich confirms when the item is speculative

## Open Loops View

The first cognitive view should answer:

- Which tensions are unresolved?
- Which active thoughts are hot or recent?
- Which possible projects/tasks exist but are not committed?
- What should the agent recommend as the next thinking move?

## First Implementation Tools

```text
listThinkingSpaces
getThinkingSpace
getThinkingContext
createThinkingSpace
updateThinkingSpace
createThinkingSession
captureThoughts
listThoughts
updateThought
linkThought
listThoughtLinks
createTension
updateTension
renderOpenLoops
renderProjectGate
renderTaskGate
```

`getThinkingContext` is the preferred resume tool for the agent. It should
return the space, recent sessions, active thoughts, unresolved tensions,
candidate thoughts, links, and the current open loops projection in one call.

`renderProjectGate` and `renderTaskGate` are read-only extraction gates. They
evaluate whether a candidate is ready, needs clarification, or is blocked before
the agent asks for confirmation and uses execution tools.

## Deferred

- experiments
- commitments
- mental diff
- view snapshots
- embeddings
- automatic extraction workflows
- chat-history source identifiers

These should be added only after the first slice proves that d-max can capture
and retrieve real thinking cleanly.
