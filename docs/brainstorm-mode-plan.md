# d-max Brainstorm Mode Plan

Date: 2026-04-28

Status: Superseded / Archived Draft

Superseded by: `docs/thinking-system-plan.md`

Note: This plan captured the first post-MVP Brainstorm Mode concept. It has
been intentionally superseded by the broader Thinking System design, where
"brainstorm" remains a user-facing mode but the durable domain model is based
on thinking spaces, thoughts, links, and tensions.

## Context

The original d-max MVP is complete and archived in `docs/archive/mvp-plan.md`.

The next product module is Brainstorm Mode.

Brainstorm Mode exists because Dietrich wants to use d-max with long voice messages that may contain:
- multiple life categories
- multiple possible projects
- thoughts about existing projects
- emerging ideas
- possible tasks
- priorities and concerns
- corrections and refinements inside the same message

These messages should not be forced immediately into projects and tasks.

## Core Decision

Brainstorming is a first-class domain object.

It is not:
- a second agentic layer
- a special project
- just a note inside `projects.markdown`
- an immediate task extraction flow

It is:
- a persistent thinking/scoping session
- a structured markdown workspace
- a place to reflect, clarify, prioritize, and refine
- a source from which projects and tasks may later be extracted

## Architecture

The agentic behavior still lives in OpenClaw instructions.

Durable state still goes through deterministic tools.

```text
Telegram text/voice
-> OpenClaw agent
-> Brainstorm workflow instructions
-> d-max brainstorm tools
-> repositories
-> SQLite
```

No additional agent runtime should be introduced.

## Data Model

Add two post-MVP tables:

```sql
brainstorms
- id integer primary key
- title text not null
- status text not null default 'active'
- summary text
- markdown text not null default ''
- created_at text not null
- updated_at text not null
- closed_at text
```

Suggested status values:

```text
active
distilled
archived
```

```sql
brainstorm_links
- id integer primary key
- brainstorm_id integer not null references brainstorms(id)
- entity_type text not null
- entity_id integer not null
- relation text not null
- created_at text not null
```

Suggested `entity_type` values:

```text
category
project
task
```

Suggested `relation` values:

```text
mentions
context
source
candidate
extracted_to
```

## Why Links Matter

Markdown is good for thinking, but insufficient for retrieval.

`brainstorm_links` should support questions like:
- Which brainstorms mention project d-max?
- Which brainstorms relate to Health and Fitness?
- Which projects were extracted from this brainstorm?
- Which tasks came out of this brainstorm?

## Chat History References

Do not hard-code OpenClaw chat-history dependency in the first Brainstorm Mode implementation.

Possible later fields:

```sql
source_session_id text
source_ref text
```

But only add these when OpenClaw exposes stable session/message identifiers that are useful for this purpose.

For the first implementation, persist:
- `summary`
- `markdown`
- structured links

## Brainstorm Workflow

Activation should be explicit or strongly implied.

Examples:
- "Lass uns brainstormen."
- "Ich möchte mal Gedanken sortieren."
- "Ich erzähle dir mal ausführlich..."
- "Lass uns das noch nicht als Projekt anlegen."
- "Mach daraus erstmal ein Brainstorm."

The agent may also ask:

```text
Das klingt eher nach einem Brainstorm als nach direkter Projekt-/Task-Erfassung. Soll ich dafür eine Brainstorm-Session öffnen?
```

Flow:

1. Dietrich starts or confirms a brainstorm.
2. d-max creates a `brainstorms` row.
3. d-max reflects and structures the message.
4. d-max writes/updates `brainstorms.markdown`.
5. Dietrich adds, removes, prioritizes, sharpens, or corrects.
6. d-max updates the brainstorm markdown.
7. d-max links mentioned existing categories/projects/tasks.
8. Dietrich asks to extract projects or tasks.
9. d-max proposes extraction candidates first.
10. Dietrich confirms or corrects.
11. d-max creates projects/tasks through existing tools.
12. d-max links created entities back to the brainstorm with `relation = extracted_to`.
13. Brainstorm remains available and may become `distilled` or `archived`.

## Default Behavior

Long exploratory voice message:
- Default to brainstorm/reflection if Brainstorm Mode is active.
- If Brainstorm Mode is not active, ask whether to open a brainstorm instead of immediately creating projects/tasks.

Short imperative message:
- Execute the requested deterministic action if clear.

Ambiguous message:
- Reflect and ask.

Extraction request:
- Suggest candidates first.
- Commit to projects/tasks only after confirmation.

## Markdown Semantics

`brainstorms.markdown` is the flexible working surface.

It should capture:
- raw themes
- structured reflection
- possible categories
- possible projects
- possible tasks
- open questions
- decisions
- prioritization
- extracted entities

Use adaptive structure. Do not force one template.

Possible sections:

```md
# Summary

# Raw Themes

# Categories Mentioned

# Existing Projects Mentioned

# Possible Projects

# Possible Tasks

# Open Questions

# Decisions

# Extracted Entities
```

Rules:
- Do not create empty sections just to satisfy a template.
- Preserve uncertainty.
- Distinguish "possible task" from committed task.
- Distinguish "possible project" from created project.
- Do not remove original thinking just because something was extracted.
- Prefer moving extracted material under `# Extracted Entities` or marking it as processed.

## Tools

New deterministic tools likely needed:

```text
listBrainstorms
getBrainstorm
createBrainstorm
updateBrainstorm
updateBrainstormMarkdown
linkBrainstormEntity
unlinkBrainstormEntity
closeBrainstorm
```

Potential later tools:

```text
listBrainstormLinks
archiveBrainstorm
```

Avoid implementing `extractProjectFromBrainstorm` as a deterministic tool at first.

Extraction should be an OpenClaw workflow:

```text
OpenClaw proposes extraction
-> Dietrich confirms
-> existing createProject/createTask/updateProjectMarkdown tools run
-> linkBrainstormEntity records extracted_to relation
```

## Critical Product Rules

- Brainstorm Mode should not auto-create projects/tasks from long exploratory speech.
- Brainstorm Mode should not overwrite existing project markdown without explicit intention.
- Existing categories/projects/tasks may be pulled into context through links.
- Links are references, not ownership.
- A brainstorm can reference multiple categories, projects, and tasks.
- A project/task can be linked to multiple brainstorms.

## Open Questions

- Should a brainstorm have a `scope` field, or should scope be inferred from links?
- Should `brainstorm_links` include `note` or `metadata`?
- Should `entity_type` be constrained with a check constraint, or kept flexible?
- Should brainstorm markdown updates require confirmation for large rewrites?
- How should active brainstorm selection work in Telegram conversations?
- Should there be one "current active brainstorm" per Telegram session?
- Should Brainstorm Mode support multiple active brainstorms at the same time?

## Recommended First Implementation

1. Update `AGENTS.md` to define Brainstorm as a post-MVP core concept.
2. Add SQLite tables:
   - `brainstorms`
   - `brainstorm_links`
3. Add repositories:
   - `BrainstormRepository`
   - `BrainstormLinkRepository`
4. Add tools:
   - `listBrainstorms`
   - `getBrainstorm`
   - `createBrainstorm`
   - `updateBrainstormMarkdown`
   - `linkBrainstormEntity`
   - `closeBrainstorm`
5. Add tests for repositories and tools.
6. Update OpenClaw workspace instructions with Brainstorm Mode behavior.
7. Test through Telegram text first.
8. Test through long Telegram voice messages.
