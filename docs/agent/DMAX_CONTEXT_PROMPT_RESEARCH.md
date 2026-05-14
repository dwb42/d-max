# DMAX Context Prompt Research

Date: 2026-05-14

Status: historical baseline research from before the Phase 1-2.4 context/prompt
implementation. It is useful for understanding the original gaps, but it is no
longer the source of truth for current runtime behavior. For the implemented
state, use `docs/current-state.md`, `docs/agent/DMAX_CONTEXT_BUDGETING.md`, and
`docs/agent/DMAX_CONTEXT_RESPONSE_CONTRACTS.md`.

## 1. Executive Summary

Der Browser-Chat baut aktuell keinen separaten OpenClaw-Systemprompt pro View. Stattdessen erzeugt `src/chat/conversation-context.ts` einen textuellen Kontextblock und sendet diesen zusammen mit der Nutzernachricht als `message` in eine OpenClaw-Session. Die globalen Runtime-Instructions kommen aus dem OpenClaw-Workspace (`openclaw/workspace/AGENTS.md`, `TOOLS.md`, `USER.md`, `SOUL.md`), die d-max Tools kommen als MCP-Tools aus `src/mcp/server.ts`.

Wichtigste Dateien:

| Zweck | Datei |
|---|---|
| Context-Typen, Prompt-Templates, Resolver | `src/chat/conversation-context.ts` |
| Chat-Turn, Prompt-Log, OpenClaw-Sessionbindung | `src/chat/app-chat.ts` |
| OpenClaw Gateway/Session Send/Wait | `src/chat/openclaw-agent.ts` |
| Chat-/SSE-/Debug-API | `src/api/server.ts` |
| View -> ConversationContext Mapping | `web/src/App.tsx` |
| Frontend API/SSE Client | `web/src/api.ts` |
| Runtime-Agent-Instructions | `openclaw/workspace/*.md` |
| Tool surface | `openclaw/config.web.json`, `src/mcp/server.ts`, `src/tools/*` |

Bereits gut umgesetzt sind: zentrale Context-Resolver-Pipeline, Prompt-Logging mit finalem Prompt, Prompt-Vorlagen-UI, einige sinnvolle Nachbarschaftsdaten fuer Kategorie-, Initiative- und Task-Kontexte, Media-/Participant-Einbindung in Detailkontexten und Tests fuer Context-Schema-Synchronisation.

Groesste Luecken im Vergleich zum Zielbild: nur `category` hat echte detail-spezifische Facilitation-Instructions; Ideen/Projekte/Gewohnheiten teilen generische Initiative-Instructions. Parent-/Child-Initiativen werden nicht in den Kontext geladen. Kategorie-Markdown wird in Initiative-/Task-Details nicht geladen. Kalender-/Zeitblockdaten werden nicht in Agent-Kontexte geladen. Listenansichten bekommen nur typgleiche Initiativen plus offene Tasks, aber keine komprimierten Cross-Type-Kontexte, Kategorie-Zielbilder oder Aufmerksamkeits-/Diskrepanzlogik. Es gibt Truncation-Limits, aber kein explizites Token-Budget oder semantische Komprimierung.

## 2. Research Scope

Untersucht wurden die in `AGENTS.md` geforderten Einstiegspunkte: `docs/current-state.md`, `docs/memory-map.md`, `README.md`, `data/schema.sql`, `src/core/tool-definitions.ts`, `src/tools/*`, `src/api/server.ts`, `src/chat/*`, `src/voice/*`, `web/src/App.tsx`, `openclaw/workspace/AGENTS.md`, `openclaw/workspace/TOOLS.md` und `tests/`.

Zusaetzlich untersucht wurden:

- `web/src/api.ts`, `web/src/types.ts`
- `src/mcp/server.ts`, `src/mcp/tool-registry.ts`
- `openclaw/config.web.json`, `openclaw/config.local.json`
- `src/diagnostics/chat-turns.ts`
- relevante Tests unter `tests/chat/`

Nicht untersucht wurden: archivierte historische Spezifikationen als Quelle fuer aktuellen Ist-Stand, echte OpenClaw-interne Prompt-Zusammensetzung ausserhalb dieses Repos und produktive OpenClaw-Sessiondateien.

## 3. Current Architecture Overview

Tatsaechliche Browser-App-Chat-Pipeline:

```text
Frontend route in web/src/App.tsx
  -> getRouteConversationContext(...)
  -> agent drawer stores ConversationContext
  -> streamChatMessage(...) posts to /api/chat/message/stream
  -> src/api/server.ts parses chatMessageBody
  -> AppChatService.prepareMessageTurn(...)
  -> resolveConversationContext(db, context)
  -> buildContextualAgentMessage(userMessage, resolved)
  -> AppPromptLogRepository stores systemInstructions/contextData/finalPrompt
  -> runOpenClawSessionTurn(finalPrompt, sessionKey)
  -> OpenClaw sessions.send + agent.wait
  -> d-max MCP tools available through OpenClaw config
  -> answer persisted in app_chat_messages
  -> SSE streams synthetic answer deltas back to UI
```

Important nuance: `systemInstructions` in `app_prompt_logs` is a readable extracted section, not a separate OpenClaw system-role message. The actual message string sent to OpenClaw is `resolved.agentContextBlock + "\n\nUser message:\n" + userMessage` (`src/chat/conversation-context.ts:683`).

OpenClaw adds its own runtime layer from the configured workspace:

```text
openclaw/config.web.json
  -> agents.defaults.workspace = openclaw/workspace
  -> OpenClaw loads workspace memory/instructions
  -> MCP server d-max exposes tools from src/tools/*
```

Drive Mode is separate:

```text
Browser /drive
  -> /api/voice/session
  -> LiveKit room
  -> src/voice/livekit-agent.ts
  -> src/voice/xai-realtime-session.ts
  -> buildDriveModeInstructions()
```

Drive Mode currently sends only concise realtime instructions to xAI and does not use `conversation-context.ts`.

## 4. Relevant Files and Functions

| Area | File | Function / Component | Purpose | Notes |
|---|---|---|---|---|
| Frontend route context | `web/src/App.tsx:482` | `getRouteConversationContext` | Maps current route/data to `ConversationContext` | Category-filtered collection routes map to `category`, not list-specific context. |
| Frontend context key | `web/src/App.tsx:543` | `conversationContextKey` | Stable key for drawer/context changes | Used to reopen drawer on route context change. |
| Agent drawer open/send | `web/src/App.tsx:706`, `web/src/App.tsx:794`, `web/src/App.tsx:905` | `agentTarget`, `submitChatMessage`, `loadContextualAgent` | Keeps active context, sends chat, loads old chats | Sends only `ConversationContext`, not entity payloads. |
| Frontend API | `web/src/api.ts:883` | `streamChatMessage` | Posts to SSE endpoint and handles `conversation`, `activity`, `answer_delta`, `done` | Final answer is chunked by backend after OpenClaw completes. |
| Context type frontend | `web/src/types.ts:507` | `ConversationContext` | Frontend discriminated union | Mirrors backend schema. |
| API chat endpoints | `src/api/server.ts:1165`, `1177`, `1201` | `/api/chat/conversations`, `/api/chat/message`, `/api/chat/message/stream` | Conversation/session APIs | Streaming endpoint also polls OpenClaw activity. |
| Debug APIs | `src/api/server.ts:1332`, `1337` | `/api/debug/prompts`, `/api/debug/prompt-templates` | Prompt log and template inspection | Used by `/prompts` and `/prompt-vorlagen`. |
| Context schema | `src/chat/conversation-context.ts:25` | `conversationContextSchema` | Backend context union | Authoritative validator for API input. |
| Context resolver | `src/chat/conversation-context.ts:359` | `resolveConversationContext` | Loads DB data and formats context lines | Main context builder. |
| Prompt builder | `src/chat/conversation-context.ts:683`, `690`, `763` | `buildContextualAgentMessage`, `buildPromptSections`, `buildGermanCategoryPromptSections` | Builds final text and readable sections | Only `category` has German facilitation mode. |
| Prompt templates | `src/chat/conversation-context.ts:72` | `promptTemplateSpecs`, `listPromptTemplates` | Human-visible templates | Templates cover only desired ten core modes plus global. |
| Chat service | `src/chat/app-chat.ts:180` | `prepareMessageTurn` | Resolves context, persists user msg, builds/logs prompt | Stores exact `finalPrompt`. |
| OpenClaw session | `src/chat/app-chat.ts:62`, `src/chat/openclaw-agent.ts:1151` | default runner, `runOpenClawGatewaySessionTurn` | Sends prompt to OpenClaw session | Uses per-conversation explicit session key. |
| OpenClaw config | `openclaw/config.web.json:8` | `agents` | Workspace/model/tools | `openai-codex/gpt-5.5`, MCP `d-max`. |
| MCP server | `src/mcp/server.ts:24`, `34` | `McpServer`, tool registration loop | Exposes deterministic tools to OpenClaw | Tool schemas/descriptions come from `src/tools/*`. |
| Runtime prompts | `openclaw/workspace/AGENTS.md`, `TOOLS.md`, `USER.md`, `SOUL.md` | Workspace Markdown | Global OpenClaw behavior/memory | Loaded by OpenClaw, not in d-max prompt log. |
| Prompt persistence | `src/repositories/app-prompt-logs.ts:7`, `85` | `AppPromptLog`, `create` | Stores final prompt and diagnostic sections | Backed by `app_prompt_logs`. |
| Prompt UI | `web/src/App.tsx:9320`, `9374` | `PromptTemplatesView`, `PromptInspectorView` | Shows templates/logs | Can copy final prompt. |
| Tests | `tests/chat/conversation-context.test.ts`, `app-chat.test.ts`, `context-schema-sync.test.ts` | various | Verifies resolver/logging/schema sync | No snapshot tests, but explicit containment assertions. |
| Drive voice | `src/voice/drive-mode-instructions.ts:1`, `src/voice/xai-realtime-session.ts:45` | `buildDriveModeInstructions`, `session.update` | xAI realtime instructions | Separate from OpenClaw and DB context. |

## 5. Current Prompt Components

| Prompt Component | File | Global / Contextual | Used When | Inputs | Notes |
|---|---|---|---|---|---|
| OpenClaw runtime behavior | `openclaw/workspace/AGENTS.md` | Global | Every OpenClaw agent session using workspace | Static Markdown | Includes language behavior, initiative/task workflow, Who dimension, app/voice note. |
| OpenClaw tool policy | `openclaw/workspace/TOOLS.md` | Global | Every OpenClaw agent session using workspace | Static Markdown | Tool-use rules, confirmation policy, category/initiative guidance. |
| User memory | `openclaw/workspace/USER.md` | Global | Every workspace session | Static Markdown | Stable Dietrich facts. Sensitive; not repeated here. |
| Product tone | `openclaw/workspace/SOUL.md` | Global | Every workspace session | Static Markdown | Short tone statement. |
| Identity | `openclaw/workspace/IDENTITY.md` | Global optional | Workspace session | Static Markdown | Currently no custom identity. |
| Heartbeat | `openclaw/workspace/HEARTBEAT.md` | Global optional | Workspace session | Static Markdown | Empty. |
| Browser contextual context block | `src/chat/conversation-context.ts:690` | Contextual | Every browser app chat turn | DB-resolved context lines + context type | Sent as text in `message`. |
| Category detail German block | `src/chat/conversation-context.ts:763` | Contextual | `context.type === "category"` | Category, initiatives, tasks, relations | Only mode with detailed desired facilitation structure. |
| Context-specific add-on | `src/chat/conversation-context.ts:808` | Contextual | Currently only `category` | None beyond type | Other types return `[]`; no idea/project/habit/task-specific facilitation. |
| Final browser prompt | `src/chat/conversation-context.ts:683` | Contextual | Every app chat turn | `agentContextBlock`, user message | Shape: context block, blank line, `User message:`. |
| Tool summary in prompt log | `src/chat/app-chat.ts:408` | Diagnostic/logging | Stored with each prompt log | Static string | Not sent in `finalPrompt`; OpenClaw receives actual MCP tool schemas separately. |
| MCP tool descriptions | `src/tools/*.ts`, registered in `src/mcp/server.ts:34` | Global runtime tool layer | OpenClaw tool discovery/calls | Zod schemas, tool descriptions | Includes list/create/update categories, initiatives, tasks, relations, media, parties. |
| OpenClaw prewarm prompt | `src/chat/openclaw-agent.ts:77` | Operational | Gateway prewarm only | Static string | `"System warmup. Do not use tools. Reply with exactly: OK"`. |
| Drive Mode instructions | `src/voice/drive-mode-instructions.ts:1` | Voice global | xAI realtime session update | Static string | No DB/view context. |
| xAI capability spike prompt | `src/voice/xai-realtime-provider.ts:51` | Voice prototype | Generic provider path | Static string | Not the LiveKit Drive path. |
| Research subagent prompts | `openclaw/workspace/dmax-research/AGENTS.md`, `TOOLS.md` | OpenClaw subagent | Only if OpenClaw uses `dmax-research` | Static Markdown | Configured in `openclaw/config.web.json:80`; read-only/web-oriented. |

Interpolated data sources in contextual prompts are not template-rendered from `promptTemplateSpecs`; the templates are documentation/inspection views. Runtime data is assembled directly in `resolveConversationContext` by reading repositories and formatting strings.

## 6. Current Context Types

| Context Type | Defined Where | Used By Views | Current Behavior | Gap |
|---|---|---|---|---|
| `global` | Backend `conversationContextSchema`; frontend `ConversationContext` | Fallback, `/drive`, `/calendar`, `/config`, `/prompts`, `/prompt-vorlagen` | Minimal instruction to use tools if state is needed | No view-specific calendar/drive context. |
| `categories` | `conversation-context.ts:27`, `app-conversations.ts:6` | `/categories` | All categories, truncated descriptions, initiatives per category, active initiatives, relations, planning canvas summary, open tasks | Good overview data, but no dedicated desired overview prompt for tensions/conflicts/life-area quality gaps. |
| `initiatives` | `conversation-context.ts:32`, `app-conversations.ts:11` | `/calendar/timeline`, `/planning-canvas` | Same data path as `categories`, title `Initiatives` | No separate initiative portfolio prompt; calendar/planning-specific data mostly absent except canvas count. |
| `ideas` | `conversation-context.ts:28` | `/ideas` | Ideas grouped by category, relations touching ideas, open tasks connected to ideas | No category descriptions, no project/habit adjacency, no idea maturity/cluster prompt. |
| `projects` | `conversation-context.ts:29` | `/projects` | Projects grouped by category, project dates/phase/lock, relations, open tasks | No category descriptions/goal mismatch context; no DoD/scope-specific prompt. |
| `habits` | `conversation-context.ts:30` | `/habits` | Habits grouped by category, relations, open tasks | No frequency model exists; no desired-quality/pflegehandlungen-specific prompt. |
| `tasks` | `conversation-context.ts:31` | `/tasks` | Open tasks with initiative/category refs | No initiative markdown/category background; no cross-task conflict/reorder prompt. |
| `category` | `conversation-context.ts:35` | `/categories/:categoryName`, `/ideas/:categoryName`, `/projects/:categoryName`, `/habits/:categoryName` | Category description, all initiatives in category split by type with markdown, relations touching category, open tasks | Strongest mode; still lacks participants/media/calendar/parent-child and other categories for conflict checks. |
| `idea` | `conversation-context.ts:36` | `/initiatives/:id` when loaded initiative type is `idea` | Initiative header, category name/color, markdown, predecessors/successors, media, participants, tasks | Same generic instructions as all initiative details; no idea-specific creative opening prompt; no category markdown/siblings. |
| `project` | `conversation-context.ts:37` | `/initiatives/:id` when type `project` | Same as idea plus project phase/date/lock in header | No project-specific DoD/scope/milestone prompt; no category markdown/sibling projects/children/calendar blocks. |
| `habit` | `conversation-context.ts:38` | `/initiatives/:id` when type `habit` | Same as idea with habit type; tasks included | No frequency/recurrence data model; no habit-specific instruction; no category desired-quality context. |
| `initiative` | `conversation-context.ts:39` | `/initiatives/:id` before detail has loaded | Same resolver branch as idea/project/habit after DB lookup | Temporary generic fallback; can produce `Type: initiative` even if actual DB type is known in header. |
| `task` | `conversation-context.ts:40` | `/tasks/:id` | Task, checklist, notes, media, participants, initiative header, category, initiative markdown excerpt, predecessors/successors, sibling tasks | Strong task neighborhood; lacks category markdown, task calendar entries, initiative child/parent hierarchy. |
| `people` | `conversation-context.ts:33` | `/people` | People list with preferred contact summary | Outside desired ten modes. |
| `organizations` | `conversation-context.ts:34` | `/organizations` | Organization list with preferred contact summary | Outside desired ten modes. |
| `person` | `conversation-context.ts:41` | `/people/:id` | Person detail, contacts, addresses, relationships, participations | No communication history. |
| `organization` | `conversation-context.ts:42` | `/organizations/:id` | Organization detail incl. markdown, contacts, addresses, relationships, participations | No participant target expansion. |

## 7. Context Data by View / Level

### 7.1 Category Overview / Lebensbereiche-Overview

- Current object: no single object; `context.type = "categories"`.
- Loaded from DB: `categories.list()`, `initiatives.list()`, all `precedes` relations, all non-done tasks.
- Parent context: none.
- Child entities: every category's initiatives, capped at 20 initiatives per category.
- Neighbor entities: all precedence relations, capped at 40.
- Markdown fields: category `description` truncated to 1200 chars; initiative `summary` or first markdown line only.
- Tasks: open tasks across all categories, ranked and capped at 25.
- Timeline/deadline/frequency: task due dates; project date ranges; planning canvas placed/unplaced counts only.
- People/organizations: not included.
- Calendar: not included.
- Payload shape: formatted text lines under `Context data:`.
- Missing data: full category descriptions, initiative markdown bodies, participants, media, calendar entries, inter-category conflict model, explicit overview facilitation prompt.
- Evidence: `resolveConversationContext` branch at `src/chat/conversation-context.ts:387`.

### 7.2 Kategorie Detail / einzelner Lebensbereich

- Current object: `categories.findById(categoryId)`.
- Loaded from DB: all initiatives in category, open tasks for those initiatives, relations touching those initiatives.
- Parent context: none.
- Child entities: ideas, projects, habits in category, each with markdown body truncated to 3000 chars.
- Neighbor entities: predecessor/successor relations where either endpoint is in category.
- Markdown fields: category `description` up to 7000 chars; initiative markdown up to 3000 chars each.
- Tasks: open tasks in category, ranked and capped at 25.
- Timeline/deadline/frequency: project date range and lock in formatted initiative context; task due dates.
- People/organizations: not included.
- Calendar: not included.
- Payload shape: German `Kontextdaten:` plus German facilitation instructions.
- Missing data: participants, media attachments, calendar entries, parent/child hierarchy, other categories for conflict checks.
- Evidence: `src/chat/conversation-context.ts:522` and German prompt builder at `src/chat/conversation-context.ts:763`.

### 7.3 Initiativen-Overview

- Current object: no single object; `context.type = "initiatives"`.
- Used by: `/calendar/timeline` and `/planning-canvas` (`web/src/App.tsx:503`).
- Behavior: identical data loading to `categories` branch, with title `Initiatives`.
- Loaded: all categories, all initiatives, active initiatives, all relations, open tasks, planning canvas placed/unplaced summary.
- Missing data: no initiative-overview-specific prompt; no category goal quality analysis; no attention/activity history; no list of calendar entries or canvas layout details beyond counts.
- Evidence: same branch as category overview, `src/chat/conversation-context.ts:387`.

### 7.4 Ideenliste

- Current object: no single object; `context.type = "ideas"`.
- Loaded from DB: categories, initiatives filtered to `type = "idea"`, relations touching those ideas, open tasks whose `initiativeId` is an idea.
- Parent context: category id/name/color only for grouping.
- Child entities: open tasks connected to ideas.
- Neighbor entities: precedence relations touching ideas; no projects/habits in same category unless connected by relation endpoint name.
- Markdown fields: summary or first markdown line only.
- Tasks: open idea tasks, ranked, capped at 25.
- Timeline/deadline/frequency: task due dates only; ideas have no dates.
- People/organizations/media/calendar: not included.
- Missing data: category descriptions, sibling projects/habits, idea clusters, maturity signals, related tasks beyond same idea, full markdown.
- Evidence: `src/chat/conversation-context.ts:431`.

### 7.5 Projektliste

- Current object: no single object; `context.type = "projects"`.
- Loaded from DB: categories, initiatives filtered to `type = "project"`, relations touching projects, open tasks for those projects.
- Parent context: category id/name/color only for grouping.
- Child entities: open project tasks.
- Neighbor entities: precedence relations touching projects.
- Markdown fields: summary or first markdown line only.
- Timeline/deadline/frequency: project phase, start/end, lock; task due dates.
- People/organizations/media/calendar: not included.
- Missing data: category descriptions, full project markdown, Definition of Done, milestones unless encoded in markdown first line, calendar work blocks, sibling non-project initiatives in category.
- Evidence: `src/chat/conversation-context.ts:431`.

### 7.6 Gewohnheitenliste

- Current object: no single object; `context.type = "habits"`.
- Loaded from DB: categories, initiatives filtered to `type = "habit"`, relations touching habits, open tasks for habits.
- Parent context: category id/name/color only.
- Child entities: open habit tasks.
- Neighbor entities: precedence relations touching habits.
- Markdown fields: summary or first markdown line only.
- Timeline/deadline/frequency: task due dates only. There is no habit frequency schema in `data/schema.sql`.
- People/organizations/media/calendar: not included.
- Missing data: frequencies, recurring reminders, desired quality, Pflegehandlungen unless in markdown summary.
- Evidence: `src/chat/conversation-context.ts:431`; schema has initiative `type = habit` but no frequency columns (`data/schema.sql:15`).

### 7.7 Einzelne Idee

- Current object: `initiatives.findById(initiativeId)` with context type `idea`.
- Loaded parent: category id/name/color.
- Child entities: tasks in same initiative, ranked and capped at 30.
- Neighbor entities: predecessors and successors.
- Markdown fields: full initiative markdown truncated to 7000 chars.
- Media: initiative media attachments capped at 20 with metadata and derived text.
- People/organizations: `entityParticipants` for initiative capped at 20.
- Timeline/deadline/frequency: header includes `time span: none` if no dates; no calendar.
- Missing data: category markdown, sibling ideas/projects/habits in same category, parent/child hierarchy, related media on category, idea-specific creative prompt.
- Evidence: shared initiative detail branch `src/chat/conversation-context.ts:601`.

### 7.8 Einzelnes Projekt

- Current object: `initiatives.findById(initiativeId)` with context type `project`.
- Loaded parent: category id/name/color.
- Child entities: tasks in same initiative, ranked and capped at 30.
- Neighbor entities: predecessors and successors.
- Markdown fields: full initiative markdown truncated to 7000 chars.
- Media: initiative media attachments capped at 20.
- People/organizations: initiative participants capped at 20.
- Timeline/deadline/frequency: project phase, start/end, lock in header.
- Calendar: not loaded, although `calendar_entries` and Google bindings exist in schema.
- Missing data: category markdown/target quality, parent/child initiatives, milestones unless in markdown/tasks, task checklist details, calendar work blocks, project-specific prompt for DoD/scope/risks.
- Evidence: shared branch `src/chat/conversation-context.ts:601`; project header formatter `src/chat/conversation-context.ts:843`.

### 7.9 Einzelne Gewohnheit

- Current object: `initiatives.findById(initiativeId)` with context type `habit`.
- Loaded parent: category id/name/color.
- Child entities: tasks in same habit initiative, ranked and capped at 30.
- Neighbor entities: predecessors and successors.
- Markdown fields: full initiative markdown truncated to 7000 chars.
- Media/participants: same as idea/project.
- Timeline/deadline/frequency: no dedicated frequency data; start/end normally none but schema does not enforce non-project clearing.
- Missing data: frequency model, recurring tasks/reminders, desired quality from category markdown, habit-specific instruction.
- Evidence: shared branch `src/chat/conversation-context.ts:601`; current-state notes that project-only fields are not enforced for non-projects.

### 7.10 Einzelner Task

- Current object: `tasks.findById(taskId)`.
- Loaded parent: initiative, category.
- Child entities: checklist items for the task.
- Neighbor entities: sibling tasks in same initiative, ranked and capped at 18; initiative predecessors/successors.
- Markdown fields: initiative markdown excerpt truncated to 3500 chars.
- Media: task media attachments capped at 20.
- People/organizations: task participants capped at 20.
- Timeline/deadline/frequency: task due/completed; initiative start/end/lock; no calendar entries.
- Payload shape: formatted text under `Context data:`.
- Missing data: category markdown, initiative participants, task calendar work blocks, checklist of sibling tasks, parent/child initiative hierarchy.
- Evidence: task branch `src/chat/conversation-context.ts:641`.

## 8. Prompt + Data Assembly Pipeline

### 8.1 Task Detail example

```text
/tasks/:id
-> routeFromPath returns { view: "task", taskId }
-> getRouteConversationContext returns { type: "task", taskId }
-> streamChatMessage sends { message, conversationId, context }
-> /api/chat/message/stream parses chatMessageBody
-> prepareMessageTurn resolves task context:
   - task
   - checklist
   - task media
   - task participants
   - initiative
   - category
   - initiative markdown excerpt
   - initiative predecessor/successor relations
   - sibling tasks
-> finalPrompt = context block + User message
-> prompt log stores readable sections
-> OpenClaw session receives finalPrompt
```

Evidence: frontend mapping `web/src/App.tsx:519`, submit `web/src/App.tsx:823`, API SSE `src/api/server.ts:1201`, task resolver `src/chat/conversation-context.ts:641`.

### 8.2 Projekt Detail example

```text
/initiatives/:id
-> if initiativeDetail has loaded, context type = initiativeDetail.initiative.type
-> for project: { type: "project", initiativeId }
-> resolver loads initiative, category, tasks, media, participants, predecessors, successors
-> project phase/date/lock appear in formatted initiative header
```

Evidence: `web/src/App.tsx:511`, `src/chat/conversation-context.ts:601`.

### 8.3 Kategorie Detail example

```text
/categories/:categoryName
or /ideas/:categoryName
or /projects/:categoryName
or /habits/:categoryName
-> all map to { type: "category", categoryId }
-> resolver loads category description, all category initiatives split by type,
   relations touching category initiatives, open tasks in category
-> category-specific German facilitation prompt is appended
```

Evidence: route mapping `web/src/App.tsx:490`, resolver `src/chat/conversation-context.ts:522`, instructions `src/chat/conversation-context.ts:813`.

### 8.4 Ideenliste example

```text
/ideas
-> { type: "ideas" }
-> resolver filters initiatives by type="idea"
-> groups them by category
-> includes relations touching those idea ids
-> includes open tasks connected to ideas
```

Evidence: `web/src/App.tsx:495`, `src/chat/conversation-context.ts:431`.

## 9. Neighbor Context and Task Structure Handling

| Question | Current Answer | Evidence |
|---|---|---|
| If a task is opened, does the agent get other tasks in same initiative? | Yes. `siblingTasks` excludes current task, ranked and capped at 18. | `src/chat/conversation-context.ts:648`, `671` |
| If a project is opened, does the agent get all project tasks? | Yes, tasks for the initiative are loaded and capped at 30. | `src/chat/conversation-context.ts:608`, `625` |
| If an idea is opened, does the agent get tasks, related projects or habits? | Tasks yes; predecessor/successor relation endpoints yes; sibling projects/habits in same category no. | `src/chat/conversation-context.ts:601` |
| If a habit is opened, does the agent get Pflegehandlungen / recurring tasks / frequencies? | It gets normal tasks. No frequency/recurrence model is loaded. | `src/chat/conversation-context.ts:608`; schema `data/schema.sql:15` |
| If a category is opened, does the agent get all initiatives in that category? | Yes, split into ideas/projects/habits with markdown. | `src/chat/conversation-context.ts:528`, `540` |
| If a list is opened, does the agent get only visible entries or compressed context of other types? | It gets all entries of that collection type grouped by category, plus related relations/open tasks. It does not get other initiative types except via relation names. | `src/chat/conversation-context.ts:431` |
| If initiatives overview is opened, does the agent get category descriptions and all initiatives? | Yes, same as categories overview: truncated category descriptions and all initiatives per category. | `src/chat/conversation-context.ts:387` |
| If category overview is opened, does the agent get all categories and initiative summaries? | Yes, category descriptions truncated to 1200 and initiative summaries/first markdown lines. | `src/chat/conversation-context.ts:393` |

Technically enabled:

- Task duplication/order checks inside one initiative are possible from task detail because sibling tasks are present.
- Project task structure checks are partially possible because all project tasks are present.
- Category fit checks are possible because category description and initiative markdown are present in category detail.

Technically weak:

- Task checklist details for sibling tasks are not loaded.
- Parent/child initiative hierarchy (`initiatives.parent_id`) is not formatted anywhere in `conversation-context.ts`.
- Calendar work blocks and deadlines beyond `due_at` are absent from prompt contexts.
- Cross-category conflict checks are weak outside category overview because detail/list contexts do not include other categories.

## 10. Debugging and Observability

Present:

- `app_prompt_logs` stores `user_input`, `system_instructions`, `context_data`, `memory_history`, `tools`, `final_prompt`, `turn_trace` (`data/schema.sql:327`, repository `src/repositories/app-prompt-logs.ts:7`).
- `/api/debug/prompts` returns prompt logs (`src/api/server.ts:1332`).
- `/api/debug/prompt-templates` returns templates from `listPromptTemplates()` (`src/api/server.ts:1337`).
- `/prompts` UI shows prompt metadata, turn trace, user input, system/instructions, context data, memory/history, tools, final prompt, and copy button (`web/src/App.tsx:9374`).
- `/prompt-vorlagen` UI shows context templates (`web/src/App.tsx:9320`).
- Turn trace records API/chat/OpenClaw phases and stores them in prompt log (`src/chat/turn-trace.ts:41`; `src/chat/app-chat.ts:230`).
- Optional NDJSON diagnostics are written by `src/diagnostics/chat-turns.ts` unless disabled; OpenClaw latency tracing is opt-in via `DMAX_OPENCLAW_LATENCY_TRACE`.
- SSE surfaces OpenClaw activities from session files while a turn is running (`src/api/server.ts:1229`).
- Tests cover resolver contents, prompt logging and schema sync (`tests/chat/conversation-context.test.ts`, `tests/chat/app-chat.test.ts`, `tests/chat/context-schema-sync.test.ts`).

Missing or partial:

- Prompt log does not include OpenClaw's actual loaded workspace files/system role assembly; it only logs d-max's message string and readable sections.
- No snapshot tests for full final prompts.
- No per-context fixture matrix for all desired ten modes with realistic data density.
- No token-budget report in prompt logs beyond `promptChars` in trace.
- No UI diff/history view for context payload changes.
- No direct inspector for OpenClaw internal session prompt layers except session/activity summaries.

## 11. Gap Analysis Against Desired Context Model

| Desired Context Level | Prompt Exists? | Data Context Exists? | Neighbor Context Exists? | Main Gaps | Priority |
|---|---|---|---|---|---|
| 1. Category Overview | Partial | Yes | Partial | No specific overview facilitation for quality gaps/tensions/conflicts; descriptions truncated; no participants/calendar/media. | High |
| 2. Einzelne Kategorie | Yes, strongest | Yes | Partial | No other categories for conflict; no participants/media/calendar; no parent-child hierarchy. | High |
| 3. Initiativen-Overview | Partial | Same as categories | Partial | No distinct initiative portfolio prompt; no category-quality mismatch logic; no attention/history. | High |
| 4. Ideenliste | Partial | Partial | Partial | No full markdown/category descriptions/cross-type adjacency; no cluster/maturity prompt. | High |
| 5. Projektliste | Partial | Partial | Partial | No scope/DoD/task-quality prompt; no category Zielbild; no calendar load. | High |
| 6. Gewohnheitenliste | Partial | Partial | Weak | No frequency schema/context; no desired-quality checks; no habit-specific prompt. | High |
| 7. Einzelne Idee | Partial | Yes | Partial | Generic initiative detail prompt; no category markdown/siblings; tends not to encode "do not operationalize too early". | High |
| 8. Einzelnes Projekt | Partial | Yes | Partial | Generic prompt; no category markdown, parent/children, calendar entries, milestones/DoD unless in markdown. | High |
| 9. Einzelne Gewohnheit | Partial | Partial | Partial | No frequency/recurrence model; generic prompt; no category desired-quality context. | High |
| 10. Einzelner Task | Partial | Good | Good within initiative | No category markdown/calendar work blocks/sibling checklists; no explicit task-quality prompt beyond generic contract. | Medium-High |

Summary by capability:

| Capability | Status | Notes |
|---|---|---|
| Kontext-Prompts je Ebene | Teilweise umgesetzt | Only category has a rich mode-specific prompt. |
| Entity-Kontext je Ebene | Gut bis teilweise | Detail branches load focused objects; list branches are summary-oriented. |
| Nachbarschaftskontext | Teilweise | Relations and sibling tasks exist; category/list siblings incomplete; parent/child missing. |
| Parent-/Child-Kontext | Nicht umgesetzt im Prompt | `parent_id` exists but is not formatted. |
| Kategorie-Markdown als Hintergrundkontext | Teilweise | Strong in category contexts; absent from initiative/task details except category name/color. |
| Taskstruktur-Kontext | Teilweise gut | Project/detail tasks loaded; task sibling tasks loaded; sibling checklist/calendar absent. |
| Listenansicht-Kontext | Teilweise | Collection lists get same-type summaries and open tasks, not cross-type compressed context. |
| Token-Budget/Komprimierung | Teilweise | Hard char truncation and item caps; no dynamic budget. |
| Datenfluss Frontend -> Backend -> Agent | Gut zentralisiert | View sends context ID/type; backend resolves authoritative DB data. |
| Debugbarkeit | Gut fuer d-max prompt | Final d-max prompt inspectable; OpenClaw internal prompt layers not fully inspectable. |

## 12. Recommendations for Next Implementation Step

1. Add explicit mode instruction builders for all ten desired modes in `src/chat/conversation-context.ts`, likely by extending `instructionsForContextType` or replacing it with a typed map.

2. Split `categories` and `initiatives` behavior. Today they share one branch; the desired model needs a Category Overview prompt and a distinct Initiatives Overview prompt.

3. Add category background to initiative/task details: include category `description` excerpt when context is `idea`, `project`, `habit`, `initiative`, or `task`.

4. Add hierarchy context: include parent initiative and children using `initiatives.parentId` in initiative and task contexts, plus category/list summaries where useful.

5. Add cross-type neighborhood for list/detail views: for idea/project/habit detail include other initiatives in same category in a capped compressed form; for collection lists include category descriptions and adjacent projects/habits/ideas where relevant.

6. Add calendar context where it matters: task detail should include task calendar entries; project detail should include initiative focus/calendar entries and project span/binding status; list/overview modes may need date-window summaries.

7. Add explicit compression policy: replace scattered `truncate(..., N)` and `.slice(...)` constants with a central budget helper that can log counts, omitted items and char budget.

8. Extend debug logs: add a structured `context_payload_json` or equivalent normalized object next to `context_data` so developers can inspect what was loaded before string formatting.

9. Add fixtures/tests for all ten desired modes with realistic data: categories with markdown, project/idea/habit siblings, relations, parent/children, participants, media, calendar entries and tasks.

10. Decide whether prompt templates should remain display-only or become runtime specs. Today `promptTemplateSpecs` is not the runtime renderer; maintaining two representations can drift.

Highest leverage first: category background in details, distinct per-mode instructions, parent/child context, and structured context debug payload.

## 13. Open Questions

- Does OpenClaw expose a stable API to inspect the complete effective system prompt including workspace Markdown? The d-max prompt log currently cannot show that layer.
- Should `/ideas/:categoryName`, `/projects/:categoryName`, and `/habits/:categoryName` remain `category` context, or should they become collection-filtered contexts with category scope?
- Should `initiatives` context represent Planning Canvas/Timeline, global initiative portfolio, or both? Current route mapping uses it for timeline/canvas, but resolver behavior matches category overview.
- Should category descriptions become required enough to include in every initiative/task context, and how much should be budgeted?
- Where should habit frequency live in the data model: initiative fields, tasks, calendar recurrence, or a dedicated habit schedule structure?
- Should app chat conversation history be explicitly included in the final prompt, or is relying on OpenClaw session continuity enough? The prompt log records `memoryHistory`, but `finalPrompt` does not include it.
- Should media attached to categories be loaded in category context? Schema supports category media links, but `category` resolver currently does not include them.
- Should people/organization participations expand to details/contact info in initiative/task contexts, or remain compact participant lines?
- What is the desired date window for calendar context in project/task/list modes?
- Should prompt logs store sensitive OpenClaw workspace user memory if full effective prompt inspection is added? This has privacy implications.
