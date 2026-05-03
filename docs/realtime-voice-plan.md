# d-max Realtime Voice Plan

Active hardening notes. Implemented state belongs in `docs/current-state.md`.

```text
Browser Drive Mode -> LiveKit room -> d-max LiveKit agent
-> xAI realtime voice session
```

## Current Slice

- Browser creates a LiveKit room through `POST /api/voice/session`.
- Browser publishes microphone audio.
- `src/voice/livekit-agent.ts` joins the latest registered room.
- Agent forwards PCM16 audio to xAI realtime and publishes model audio back to
  LiveKit.
- Voice instructions are short, driving-safe, and confirmation-first.
- Durable tool calls from realtime voice are not currently wired.

## Hardening

- Measure latency and interruption behavior.
- Add robust realtime provider tool-calling for confirmed category/initiative/task
  operations.
- Improve event observability and latency metrics.
- Make pending action ledger durable before production voice commits.
- Decide transcript/event privacy and retention.
