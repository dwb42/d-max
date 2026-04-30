# d-max App UI Plan

Date: 2026-04-30

Status: first browser slice implemented; active refinement.

## Direction

Browser-first, voice-first app before native mobile:

```text
Browser/PWA -> d-max API -> SQLite
Drive Mode -> LiveKit -> d-max Voice Agent -> xAI realtime -> ToolRunner -> SQLite
```

Design character: calm operating system for personal thinking; direct app shell
as first screen; quiet/dense/readable; voice-first but not voice-only; no
marketing landing page or decorative hero.

## State Boundaries

Agentic inputs use ToolRunner/tools/repositories/SQLite:

```text
realtime voice, Telegram voice/text, app chat text/voice,
Brainstorm/Thinking extraction
```

Explicit UI actions use API routes/repositories/services:

```text
task status/title/priority, project open/update, thought/tension actions,
category creation
```

No UI code writes directly to SQLite.

## Current Views

- `/drive`: LiveKit room creation, microphone publishing, audio meter,
  start/end controls.
- `/chat`: persisted app chat routed through OpenClaw; includes recorded voice
  messages with sound bar and full-message send behavior.
- `/brainstorms` and `/thinking`: spaces, open loops, thoughts, tensions,
  candidates.
- `/projects`: category/project overview grouped by category.
- `/projects/<category_name>`: project-category page showing only projects in
  that category.
- `/projects/:id`: project memory markdown rendering, category/project back
  buttons, tasks below memory.
- `/tasks`: operational task list with status controls.
- `/tasks/:id`: task detail with project context, status, priority,
  due/completed/updated dates, notes, Back to Tasks, Back to Project, and task
  actions.
- `/review`: placeholder for session summaries.

## Implemented Slice

- API read endpoints for categories, projects, tasks, thinking.
- API mutations for task status, thought/tension state, category creation,
  chat message, and voice session.
- React/Vite app shell with route-level navigation and direct URL entry.
- Polling/after-mutation refresh so normal use does not need manual reload.
- UI removals already done: top counters, project/category generic taglines,
  project-detail generic header, green category eyebrow, Project Memory heading.
- Header logo links to `/chat`.

## Next Work

- Harden app chat session continuity, loading/error/empty states.
- Improve responsive UI polish.
- Add robust realtime provider tool-calling from xAI events.
- Add Drive latency instrumentation.
- Build session review screen.
- Build Planning Context Pack: read-optimized context tool combining active
  Brainstorm/Thinking Space with relevant categories, projects, tasks, thought
  links, candidates, and unresolved conflicts.
- Consider native mobile only after browser/PWA usage is proven.

## LiveKit Local Setup

```env
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
XAI_API_KEY=
```

```bash
npm run dev:app
```

Open `http://localhost:5173`.

Current LiveKit state: browser can create/join a room and publish mic audio;
d-max Voice Agent watches latest registered room, joins, receives audio,
bridges to xAI realtime, publishes generated audio back into LiveKit, and
captures completed transcripts into Thinking Memory through VoiceToolBridge.
Production-grade realtime tool calling, interruption handling, latency
measurement, and durable confirmation ledger are still pending.
