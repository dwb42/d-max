# d-max MVP Plan

Date: 2026-04-28

## Goal

d-max is an agentic project and task memory system for Dietrich.

Canonical public GitHub repository:
- https://github.com/dwb42/d-max

Core components:
- OpenClaw as gateway and agent runtime
- Telegram as user interface
- Telegram voice messages as an input mode
- optional Telegram voice messages as an output mode
- future real-time voice conversation mode for hands-free use while driving
- SQLite as deterministic source of truth
- TypeScript d-max tools for categories, projects, and tasks
- project-level markdown memory stored in `projects.markdown`

## Deployment

MVP production boundary:
- One Docker container runs both OpenClaw and the d-max MCP server.
- OpenClaw owns Telegram, agent runtime, channel sessions, STT, and TTS surfaces.
- d-max MCP owns tools, repositories, and SQLite access.
- OpenClaw starts/connects to the local stdio d-max MCP server inside the same container.
- SQLite lives on a persistent Docker volume.

Later production boundary, if needed:
- Split into `openclaw` and `d-max-mcp` containers.
- Move from stdio MCP to HTTP/streamable MCP transport if operational needs justify it.

Keep the app container-friendly from the start:
- explicit env config
- no committed secrets
- deterministic startup scripts
- clean separation between app code, SQLite storage path, and OpenClaw/Gateway config

## Initial Usage

Initial usage scenarios:
- Dietrich tells d-max the categories he uses to structure his life, such as Business, Friends, Family, Relationships, Health & Fitness, Spiritual Health, and similar dynamic areas.
- d-max reflects/paraphrases what it heard, asks clarifying questions when useful, and creates the corresponding categories through tools.
- Dietrich names projects and explains what they are about.
- d-max reflects/paraphrases the project description, then gradually creates the project structure.
- Dietrich describes what he is currently working on, what he has committed to, and next tasks.
- After initial feeding, Dietrich can ask which projects exist, what open tasks exist, what was completed this week, what is coming up this week, or what he intended to do in a category.

Onboarding/category learning:
- Do not seed hard-coded life categories in the MVP.
- d-max learns Dietrich's categories through the onboarding dialog.
- d-max reflects what it heard, asks clarifying questions when useful, and creates categories visibly through tools.
- Exception: system capture areas such as `Inbox` may be created automatically when needed for unassigned task capture.

Empty-system behavior:
- If the database has no categories/projects yet, d-max actively starts onboarding.
- It briefly explains that it has no structure yet and asks Dietrich to describe the life/business categories he wants to use.
- Onboarding should feel conversational, not like a rigid setup wizard.

## Architecture

Use OpenClaw as an installed gateway/runtime, not as code hand-rolled inside d-max.

Local development flow:

```text
Telegram d-max-dev
-> local OpenClaw Gateway / Agent Runtime
-> local stdio d-max MCP server
-> d-max TypeScript repositories
-> local SQLite database
```

Production flow:

```text
Telegram d-max
-> VPS Docker container
-> OpenClaw Gateway / Agent Runtime process
-> local stdio d-max MCP server process
-> production SQLite database volume
```

Preferred MVP tool boundary:

```text
OpenClaw
-> local stdio d-max MCP server
-> MCP adapter
-> provider-neutral d-max tool runner
-> validated d-max tools
-> repository layer
-> SQLite
```

Rules:
- OpenClaw owns Telegram, sessions, routing, model runtime, and channel behavior.
- d-max owns schema, deterministic state changes, repositories, and typed tools.
- The agent may reason, summarize, and propose, but durable state changes must go through tools.
- MCP is an adapter, not the core tool implementation.
- Do not introduce a second agentic layer next to OpenClaw in the MVP.
- Project scoping, category onboarding, task capture, and weekly review are OpenClaw workflow instructions, not separate TypeScript agents.
- Future xAI realtime voice should call the same provider-neutral `tool-runner` as the MCP adapter.

## OpenClaw

OpenClaw should be installed as a local CLI/runtime.

Requirements:
- Node 22.14+ minimum
- Node 24 recommended

Install options:

```bash
npm install -g openclaw@latest
```

or:

```bash
curl -fsSL https://openclaw.ai/install.sh | bash
```

Initialize:

```bash
openclaw setup
```

or:

```bash
openclaw onboard --install-daemon
```

Config policy:
- Commit repo templates under `openclaw/`.
- Keep real local/production config and secrets outside git.

Commit:
- `openclaw/config.example.json`
- `openclaw/workspace/AGENTS.md`
- `openclaw/workspace/SOUL.md`
- `openclaw/workspace/TOOLS.md`
- README setup instructions

Do not commit:
- `.env`
- `openclaw/config.local.json`
- bot tokens
- provider API keys
- machine-specific token files
- runtime logs/state

## Telegram

Use OpenClaw's built-in Telegram channel rather than writing a separate Telegram bot wrapper for the MVP.

Target local bot:
- `d-max-dev`

Command policy:
- Do not design a Telegram command-based UX for the MVP.
- Dietrich controls d-max through natural language prompting.
- `/start` may exist only as a technical Telegram/OpenClaw entry point if required.
- Avoid `/projects`, `/tasks`, `/categories`, `/review`, `/voice`, and `/text` as MVP product commands.

Access policy:
- Development: `pairing` is acceptable.
- Production: use an allowlist with Dietrich's Telegram user ID.
- Do not run an open bot.

## Voice

Inbound voice:
- Dietrich can send Telegram voice messages to `d-max-dev`.
- d-max processes voice messages as normal user input after transcription.
- Prefer OpenClaw's built-in media/audio speech-to-text capability.
- First STT provider: OpenAI.

Outbound voice:
- Use OpenClaw `messages.tts`.
- Telegram voice-message output should be supported through OpenClaw TTS when provider support and audio format are compatible.
- First TTS provider: Gemini `gemini-3.1-flash-tts-preview`.
- Verify exact Gemini TTS model name and OpenClaw provider support during implementation.

Voice default:
- `inbound` mode.
- Voice input should receive a voice response.
- Text input should receive text.
- Text remains fallback for long, structured, or failed TTS responses.

Important UX rule:
- Voice output does not replace durable structured state.
- If a voice command creates or updates categories, projects, tasks, or project markdown, the state change still goes through d-max tools and SQLite.
- For long responses, prefer concise spoken summaries plus full text when useful.

Future real-time voice:
- Not part of MVP.
- Target provider under consideration: xAI `grok-voice-think-fast-1.0`.
- Treat realtime voice as another conversation transport/session adapter, not as a separate business logic path.

## TypeScript Stack

Conservative Node TypeScript setup:
- Node 24 preferred
- TypeScript
- `tsx` for dev scripts
- `better-sqlite3` for SQLite
- `zod` for tool input validation
- official TypeScript MCP SDK for exposing d-max tools to OpenClaw
- `vitest` for tests

OpenClaw itself is not embedded directly as an app dependency unless later required. Treat it as the gateway/runtime process and integrate through MCP or plugin APIs.

## Folder Structure

```text
d-max/
  AGENTS.md
  README.md
  package.json
  tsconfig.json
  .env.example
  Dockerfile
  docker-compose.example.yml

  data/
    .gitkeep
    schema.sql
    seed.sql

  docs/
    mvp-plan.md

  scripts/
    setup-db.ts

  src/
    config/
      env.ts

    core/
      tool-definitions.ts
      tool-runner.ts
      confirmation-policy.ts

    db/
      connection.ts
      migrate.ts

    repositories/
      categories.ts
      projects.ts
      tasks.ts

    tools/
      categories.ts
      projects.ts
      tasks.ts
      index.ts

    mcp/
      server.ts
      adapter.ts
      tool-registry.ts

    main.ts

  openclaw/
    config.example.json
    workspace/
      AGENTS.md
      SOUL.md
      TOOLS.md

  tests/
    repositories/
    tools/
    core/
```

## SQLite Schema

MVP tables only:
- `categories`
- `projects`
- `tasks`

Do not add `project_events` in the MVP.

Database path policy:
- SQLite files live under `data/` by default.
- Local dev default: `data/dmax.dev.sqlite`.
- Production default via env: `DATABASE_PATH=/app/data/dmax.sqlite`.
- SQLite runtime files are excluded from git.

Project status values:
- `active`
- `paused`
- `completed`
- `archived`

Task status values:
- `open`
- `in_progress`
- `blocked`
- `done`
- `cancelled`

Task priority values:
- `low`
- `normal`
- `high`
- `urgent`

Draft schema:

```sql
categories
- id integer primary key
- name text not null unique
- description text
- is_system integer not null default 0
- created_at text not null
- updated_at text not null

projects
- id integer primary key
- category_id integer not null references categories(id)
- parent_id integer references projects(id)
- name text not null
- status text not null default 'active'
- summary text
- markdown text not null default ''
- is_system integer not null default 0
- created_at text not null
- updated_at text not null

tasks
- id integer primary key
- project_id integer not null references projects(id)
- title text not null
- status text not null default 'open'
- priority text not null default 'normal'
- notes text
- due_at text
- created_at text not null
- updated_at text not null
- completed_at text
```

Indexes:

```sql
create index idx_projects_category_id on projects(category_id);
create index idx_projects_parent_id on projects(parent_id);
create index idx_tasks_project_id on tasks(project_id);
create index idx_tasks_status on tasks(status);
create index idx_tasks_priority on tasks(priority);
create index idx_tasks_due_at on tasks(due_at);
```

## Product Rules

Task/project rule:
- Tasks must belong directly to a real project.
- `tasks.project_id` is required.
- Do not support projectless tasks in the MVP.
- Support a system capture area for quick unassigned tasks:
  - Category: `Inbox`
  - Project: `Inbox`
- If Dietrich gives a concrete task without enough project context, d-max may create it in the `Inbox` project instead of interrupting capture flow.
- d-max should later help review and move Inbox tasks into real projects.

Project/category rule:
- Projects must belong directly to a category.
- `projects.category_id` is required.
- Do not support uncategorized projects in the MVP.
- If Dietrich gives a project without enough category context, d-max asks which category it belongs to before creating it.

Project hierarchy:
- Use `projects.parent_id`.
- Support subprojects, but use them sparingly.
- Set `parent_id` only when Dietrich clearly describes a hierarchy or says that one project belongs under another.
- Do not proactively over-structure large initiatives into subprojects.

Ideas:
- Do not add a separate `ideas` table in the MVP.
- Larger or independent ideas are represented as projects in an `Ideen`/`Ideas` category.
- Ideas that belong to an existing project can be stored in that project's markdown.
- Ideas become tasks only when they are actionable commitments.

Task capture:
- Create tasks automatically when Dietrich states clear actionable commitments.
- Ask before creating tasks from tentative or speculative language.
- If project context is missing but the task is concrete, use the `Inbox` project.

Task completion:
- If Dietrich says a task is done and exactly one matching open/in-progress/blocked task can be identified, mark it `done` and set `completed_at` to now.
- If multiple tasks could match, or the task identity is unclear, ask a clarifying question before updating state.

Due dates:
- Set `tasks.due_at` only when Dietrich gives an explicit or clearly inferable time reference.
- Do not set `due_at` for vague language such as "soon", "sometime", or "eventually" without clarification.
- Interpret relative dates in the Europe/Berlin timezone.

Priority:
- `priority` and `due_at` are separate concepts.
- The mapping from natural language to priority is handled by the OpenClaw agentic layer, not deterministic regex rules.
- Deterministic tools validate allowed priority values but do not infer priority from raw language.

Week/review semantics:
- "This week" uses the Europe/Berlin calendar week, Monday through Sunday.
- "Completed this week" means tasks with `status = done` and `completed_at` inside the current Berlin calendar week.
- Markdown notes do not count as completed tasks unless d-max also created/updated deterministic task records.

Reporting:
- Answer overview questions briefly, grouped by relevant structure, and offer drilldown.
- Group projects by category and tasks by project.
- Avoid exhaustive long readouts by default, especially for voice.
- Provide more detail when Dietrich asks for it.

Language:
- Respond in the language Dietrich uses in the current conversation.
- Preserve project names, category names, task titles, and other proper names as Dietrich says/writes them.
- Mixed German/English naming is acceptable when it reflects Dietrich's wording.

## Project Markdown

`projects.markdown` is the flexible project memory area for everything that does not belong in deterministic columns.

It should capture:
- goals
- scope
- context
- decisions
- notes
- brainstorming results
- evolving project understanding

Use adaptive structure, not a hard template.

For short/simple projects, use compact structure such as:
- `# Overview`
- `# Notes`

For normal projects with goals/context/current work, use standard structure such as:
- `# Overview`
- `# Goals`
- `# Context`
- `# Current Focus`
- `# Notes`

For complex, mature, or multi-part projects, use expanded structure such as:
- `# Overview`
- `# Goals`
- `# Scope`
- `# Context`
- `# Decisions`
- `# Open Questions`
- `# Current Focus`
- `# Next Steps`
- `# Notes`

Rules:
- Do not add empty sections just to satisfy a template.
- Prefer useful structure over exhaustive structure.
- If Dietrich gives rich context, organize it clearly.
- If Dietrich gives only a short idea, keep the markdown light.
- Over time, move information from markdown into structured tables when searchability or deterministic workflows require it.

Markdown update rule:
- MVP uses whole-document replacement via `updateProjectMarkdown(projectId, markdown)`.
- The tool should use the current markdown before producing the replacement.
- d-max should summarize meaningful markdown changes when reflecting back to Dietrich.
- Large rewrites require confirmation.
- Patch-style or section-based markdown update tools may be added later.

## OpenClaw Workflow Instructions

These are OpenClaw instruction patterns, not deterministic DB tools:
- `categoryOnboarding`
- `projectScoping`
- `taskCapture`
- `weeklyReview`

Boundary:

```text
OpenClaw workflow instruction
-> interpret, reflect, ask, and orchestrate
-> call deterministic d-max tools for durable state changes
-> repository
-> SQLite
```

Project scoping behavior:
- Use when Dietrich describes a new project or expands an existing one.
- Reflect what was heard in concise bullets.
- Identify likely category, project name, goals, context, current focus, and possible tasks.
- If category is unclear, ask before creating the project.
- If project identity is unclear, ask whether this is new or belongs to an existing project.
- Choose markdown structure based on complexity and information density.
- Create or update the project through deterministic tools only.
- Create tasks only when Dietrich stated actionable commitments.
- Confirm what was saved.

## Tools

Category tools:
- `listCategories`
- `createCategory`
- `updateCategory`

Project tools:
- `listProjects`
- `getProject`
- `createProject`
- `updateProject`
- `archiveProject`
- `updateProjectMarkdown`

Task tools:
- `listTasks`
- `createTask`
- `updateTask`
- `completeTask`
- `deleteTask`

Each tool should:
- validate input with `zod`
- call a repository function
- return structured JSON
- avoid prompt-specific logic
- avoid hidden side effects outside its stated operation

Confirmation policy:
- Require confirmation before destructive or high-impact changes.
- Require confirmation for deleting tasks, archiving/completing projects, large project markdown rewrites, and batch/mass changes.
- Ambiguous voice commands should be clarified before durable state changes.
- Confirmation style is situational:
  - small risky actions get a short explicit confirmation question
  - larger changes get a concise summary before confirmation
- Dietrich can confirm or reject in natural language.
- Implement confirmation handling centrally in `src/core/confirmation-policy.ts` and `src/core/tool-runner.ts`.
- MVP confirmation flow can be stateless/simple: risky call returns `requiresConfirmation`, agent asks, confirmed call is retried with `confirmed: true`.

Example confirmation result:

```json
{
  "ok": false,
  "requiresConfirmation": true,
  "confirmationKind": "archive_project",
  "summary": "Archive project 'Health Reset'?",
  "proposedAction": {
    "tool": "archiveProject",
    "input": { "projectId": 12 }
  }
}
```

## Implementation Phases

1. Scaffold TypeScript project files and scripts.
2. Install/configure OpenClaw locally and create `openclaw/workspace`.
3. Configure Telegram `d-max-dev` through OpenClaw.
4. Configure Telegram voice input and OpenClaw TTS output mode.
5. Build SQLite schema, connection, and setup script.
6. Build repository layer for categories, projects, and tasks.
7. Build provider-neutral core tool runner and confirmation policy.
8. Build d-max tool layer with validation.
9. Expose tools through local MCP adapter/server.
10. Register d-max MCP server with OpenClaw.
11. Add repository and tool tests.
12. Update README with local setup, dev bot workflow, and voice settings.
13. Add Docker/devops handoff notes for the MVP one-container production shape, with a documented later path to two containers.
14. Later phase: add scheduler/notification support for due tasks and reminders.
15. Later phase: prototype real-time voice adapter against xAI or an OpenClaw voice surface, reusing the same d-max tool runner.

## Test Strategy

MVP automated tests:
- Repository tests
- Tool tests
- `tool-runner` tests
- `confirmation-policy` tests
- date/week helper tests, especially Europe/Berlin calendar-week logic

MVP manual/smoke tests:
- OpenClaw Gateway startup
- MCP registration with OpenClaw
- local stdio MCP smoke test via `npm run smoke:mcp`
- Telegram message roundtrip
- Telegram voice note transcription
- Gemini TTS voice reply

Do not build full end-to-end automated tests for OpenClaw, Telegram, STT, or TTS in the MVP unless a concrete blocker makes them necessary.

## Open Questions

MVP technical verification:
- exact MCP SDK package and OpenClaw MCP registration shape
- exact Gemini TTS model name and OpenClaw provider support
- exact one-container startup shape for running OpenClaw plus d-max MCP

Later/non-MVP:
- realtime voice access path: phone/SIP, WebRTC/LiveKit, OpenClaw Talk Mode, OpenClaw Voice Call plugin, or custom lightweight client
- whether xAI `grok-voice-think-fast-1.0` should be the first realtime provider
- how realtime provider function calling should map onto the d-max tool runner
