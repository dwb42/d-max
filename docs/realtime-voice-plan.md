# d-max Realtime Voice Plan

Date: 2026-04-30

Status: browser/WebRTC prototype implemented; production hardening pending.

## Decision

Realtime voice is a conversation transport for the existing d-max system, not a
parallel Brainstorm, Thinking, project, or task system.

```text
Browser/Phone/SIP -> voice transport -> realtime model
-> voice-safe ToolBridge -> ToolRunner -> existing tools -> SQLite
-> optional Telegram/app review
```

User-facing language may say Brainstorm. Durable state remains Thinking Memory:
spaces, sessions, typed thoughts, links, tensions, open loops, extraction gates.

## Goal And Non-Goals

Goal: while driving, Dietrich can start/resume Brainstorms, think out loud,
capture meaningful ideas, detect tensions/open loops/candidates, create
projects/tasks only after confirmation, and receive compact post-session review.

First-slice non-goals: separate `brainstorms` tables, native mobile, wake word,
CarPlay/Android Auto, automatic batch extraction, long spoken reviews, direct
database writes from voice layer.

## Current Architecture

```text
Browser mic -> LiveKit WebRTC -> src/voice/livekit-agent.ts
-> PCM16 -> xAI Grok Voice Think Fast realtime session
-> function/tool events -> VoiceToolBridge -> src/core/ToolRunner
-> thinking/project/task/category tools -> SQLite
```

Voice layer owns transport, audio events, interruptions, session policy, and
observability. Existing tools own durable state changes.

Implemented browser/LiveKit slice:

- Browser creates LiveKit room and publishes mic audio.
- d-max LiveKit agent watches latest registered room, joins, forwards audio to
  xAI realtime, publishes model audio back into LiveKit.
- Completed transcripts can be filtered/merged and captured into Thinking
  Memory through VoiceToolBridge.

## Design Principles

- Optimize turn-taking before feature breadth.
- Separate audio transport, model events, and durable d-max tools.
- Treat active voice sessions as ordered event streams.
- Capture and commit are different: Thinking capture can be opportunistic;
  execution-memory commits need confirmation, idempotency, and interruption
  safety.
- Return compact voice-ready tool results; do not push large DB objects into
  realtime model context.

## Provider Strategy

First provider: xAI Grok Voice Think Fast for low-latency speech-to-speech and
tool use. Keep provider boundary capability-based:

```ts
interface RealtimeVoiceProvider {
  startSession(config: VoiceSessionConfig): Promise<VoiceSession>;
}
```

Required provider capabilities:

```text
streaming input/output audio, server VAD or equivalent turn detection,
barge-in/cancel, tool/function calling, transcript events, session
instructions, telephony codec support or isolated transcoding
```

Capability spike must verify audio formats, tool-call/result event shape,
interrupt/cancel events, session lifetime/reconnect behavior, transcript timing,
and whether telephony codecs can pass through without transcoding.

## Audio And Transports

Current first transport: browser/PWA through LiveKit.

Possible later transport: Twilio Programmable Voice with bidirectional Media
Streams if phone/car Bluetooth is needed:

```text
Phone -> Twilio -> d-max WebSocket media endpoint -> realtime provider -> ToolRunner
```

For SIP/Twilio, prefer no transcoding:

```text
Twilio μ-law 8k -> provider accepts μ-law 8k -> provider returns μ-law 8k
```

If transcoding is required, isolate it in a codec adapter and measure cost.
Native app comes only after browser/PWA usage is proven.

## Drive Mode Policy

Drive Mode is a voice UX profile over Brainstorm/Thinking Memory:

- Spoken answers: one or two short sentences.
- Avoid long lists/reviews while driving; use Telegram/app review for detail.
- Capture-first for exploratory input.
- Ask one clarifying question at a time.
- Never create projects/tasks from exploratory speech without confirmation.
- Confirm exact project/task titles before committing.
- On interruption, cancel pending output and unsafe pending commits.

Canonical commands: `stop`, `warte`, `unterbrich`, `vergiss das`, `mach daraus
eine Aufgabe`, `pack das ins Projekt ...`, `fass kurz zusammen`,
`fahrt beenden`, `schick mir die Zusammenfassung`.

## Voice Tool Surface

Expose a small voice-safe tool surface, internally mapped to existing tools:

```text
voiceStartOrResumeBrainstorm
  -> listThinkingSpaces -> getThinkingContext/createThinkingSpace
voiceCaptureThinking
  -> createThinkingSession -> captureThoughts -> createTension? -> renderOpenLoops
voiceProposeTaskCandidate
  -> captureThoughts(type=possible_task) -> renderTaskGate
voiceCommitConfirmedTask
  -> renderTaskGate -> createTask -> linkThought(extracted_to) -> updateThought(committed)
voiceEndSession
  -> getThinkingContext -> review transport
```

The bridge returns compact spoken summaries, not raw large objects.

## Context Strategy

Do not load full database into voice context. At session start identify likely
Thinking Space and load compact context:

```text
space title/summary, top unresolved tensions, hot/recent thoughts,
project/task candidates, current recommendation
```

Refresh compact context after meaningful tool calls. Keep stable IDs server-side
and use natural names in speech. If topic drift appears, switch Thinking Space
explicitly or capture it as separate thought in current session.

## Commit Safety

Thinking Memory capture is low risk. Execution Memory is strict:

- `createTask`: confirm exact title and project context.
- `createProject`: confirm gate result and category.
- `updateProjectMarkdown`: brief confirmation for small append; stronger
  confirmation for large rewrite.
- No destructive/batch voice actions in early voice.
- No execution commit after interruption or cancellation of confirming turn.

Pending execution proposal ledger shape:

```text
id, tool, input, spoken summary, created_at,
confirmation status, committed_at, cancelled_at, interrupted_at
```

First implementation may be in-memory; production must be durable/replay-safe.
Execution commits need idempotency keys so retries/reconnects do not duplicate
tasks/projects.

## State Machine

```text
starting -> listening -> responding -> tool_call_pending
-> awaiting_confirmation -> committing -> ending -> ended
```

Interruption rules:

- `responding` + barge-in => `interrupted`, cancel output audio.
- Interruption during `awaiting_confirmation` cancels pending action unless the
  user confirms clearly after interruption.
- `awaiting_confirmation` stores proposal only.
- `committing` runs only after clear confirmation.
- Session end renders context and triggers review.

State machine is server-side guardrail; do not trust provider prompt/events
alone for commit safety.

## Latency And Observability

Targets:

```text
first audio after turn end: <900 ms target, <1500 ms acceptable
barge-in audio stop: <250 ms
thinking capture acknowledgement: <1500 ms
stable call duration: >=10 min
```

Measure:

```text
speech start/end, VAD commit, first/last model audio, interruption,
output cancel/clear, tool start/finish, commit start/finish,
provider reconnects/errors
```

Session event categories:

```text
transport_connected/disconnected, audio_input_started/committed,
model_audio_started/finished, model_transcript_delta, barge_in_detected,
model_tool_call_started/finished, voice_action_proposed/confirmed/cancelled/committed,
session_review_sent, error
```

Logs must be structured and must not contain secrets or unnecessary full private
content.

## Failure And Privacy

Failure behavior:

- Realtime connection failure: end attempt and send notice.
- Tool failure: say briefly, continue conversation when safe.
- Thinking capture failure: do not pretend it saved.
- Uncertain execution commit: do not retry blindly; surface uncertainty in
  review.
- High latency: reduce spoken verbosity before changing Thinking model.

Privacy decisions before production:

```text
raw audio storage yes/no, full transcript vs summary/thoughts,
event-log retention, sensitive Telegram/app review content,
delete/archive policy for captured session memory
```

Default first slice: no raw audio; store Thinking Memory, compact summaries, and
operational metadata only.

## Evaluation Harness

Scenarios before car testing:

```text
new Brainstorm, resume Brainstorm, long monologue, interruption while speaking,
task creation with confirmation, task creation with cancellation,
topic drift to second space, tool failure during capture
```

Assert state transitions, captured Thinking Memory, whether execution commits
did/did not happen, and latency when realtime transport is active.

## Implementation Status

Done:

- Voice env keys, `src/voice/` boundary, voice/session/event/action/audio types.
- Drive-mode instruction builder.
- State-transition, commit-safety, action-ledger, transcript, Twilio, and
  ToolBridge tests.
- Voice-safe ToolBridge over existing ToolRunner for Thinking capture/open
  loops and confirmed task commit.
- xAI realtime WebSocket client and PCM16 path.
- Browser/LiveKit audio prototype with model audio returned through LiveKit.
- Twilio inbound call webhook foundation, caller allowlist, TwiML Media Stream
  generation tests.

Partial:

- Transcript capture saved through voice-safe tools.
- Task candidate/pending action shape and idempotency keys.
- Confirmed task commit is tested in bridge, but not yet fully wired into live
  realtime provider loop.

Pending:

- Robust realtime function/tool calling and tool-result handling.
- Full interruption/cancellation and session lifetime verification.
- Baseline latency measurements.
- Durable replay-safe pending action ledger.
- Telegram/app session review transport.
- Production structured logging, reconnect/retry policy, provider abstraction
  tests, VPS deployment notes.

## Local Commands

```bash
npm run typecheck
npm test
npm run voice:capability:xai
npm run voice:server
curl http://localhost:3099/health
```

Twilio local testing, if revisited:

```env
DMAX_VOICE_PUBLIC_BASE_URL=https://your-public-tunnel.example
DMAX_VOICE_ALLOWED_CALLERS=+49123456789
```

Incoming voice webhook:

```text
POST https://your-public-tunnel.example/voice/twilio/incoming
```

Current Twilio slice returns TwiML for a media stream endpoint; actual media
WebSocket bridge is later.

## Credentials

```env
XAI_API_KEY=
XAI_REALTIME_MODEL=grok-voice-think-fast-1.0
LIVEKIT_URL=
LIVEKIT_API_KEY=
LIVEKIT_API_SECRET=
DMAX_VOICE_ALLOWED_CALLERS=
DMAX_VOICE_PUBLIC_BASE_URL=
DMAX_VOICE_PORT=3099
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_VOICE_NUMBER=
```

Do not commit `.env`.

## Open Questions

- After browser/PWA proves the interaction, should native mobile or SIP/phone be
  the next production transport?
- Which xAI voice and codec should be default for German/English mixed use?
- Store session transcripts in full, summarized, or retention-limited?
- Send post-drive review through OpenClaw/Telegram or direct Telegram sender?
- What auth flow is sufficient for browser/PWA Drive Mode beyond local dev
  credentials?
