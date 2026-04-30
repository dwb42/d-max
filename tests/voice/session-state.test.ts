import { describe, expect, it } from "vitest";
import { VoiceSessionStateMachine } from "../../src/voice/session-state.js";
import type { PendingVoiceAction } from "../../src/voice/types.js";

const unsafeTaskAction: PendingVoiceAction = {
  id: "action-1",
  tool: "createTask",
  input: { projectId: 1, title: "Grok SIP Spike bauen" },
  summary: "Create task: Grok SIP Spike bauen",
  requiresConfirmation: true,
  unsafeAfterInterruption: true,
  idempotencyKey: "createTask:1:Grok SIP Spike bauen",
  createdAt: "2026-04-28T19:59:00.000Z"
};

describe("VoiceSessionStateMachine", () => {
  it("starts in listening state after session start", () => {
    const machine = new VoiceSessionStateMachine();

    expect(machine.transition({ type: "session_started" })).toMatchObject({
      state: "listening",
      pendingAction: null
    });
  });

  it("clears unsafe pending actions on interruption", () => {
    const machine = new VoiceSessionStateMachine();

    machine.transition({ type: "session_started" });
    machine.transition({ type: "confirmation_requested", action: unsafeTaskAction });

    expect(machine.transition({ type: "interrupted", at: "2026-04-28T20:00:00.000Z" })).toMatchObject({
      state: "interrupted",
      pendingAction: null,
      interruptedAt: "2026-04-28T20:00:00.000Z"
    });
  });

  it("allows commit only after confirmation with no interruption", () => {
    const machine = new VoiceSessionStateMachine();

    machine.transition({ type: "session_started" });
    machine.transition({ type: "confirmation_requested", action: unsafeTaskAction });
    machine.transition({ type: "confirmation_received" });

    expect(machine.canCommitPendingAction()).toBe(true);
    expect(machine.transition({ type: "action_committed" })).toMatchObject({
      state: "listening",
      pendingAction: null
    });
  });

  it("clears pending action after cancellation", () => {
    const machine = new VoiceSessionStateMachine();

    machine.transition({ type: "session_started" });
    machine.transition({ type: "confirmation_requested", action: unsafeTaskAction });

    expect(machine.transition({ type: "confirmation_cancelled", at: "2026-04-28T20:02:00.000Z" })).toMatchObject({
      state: "listening",
      pendingAction: null
    });
  });

  it("treats user speech during assistant response as barge-in", () => {
    const machine = new VoiceSessionStateMachine();

    machine.transition({ type: "session_started" });
    machine.transition({ type: "assistant_response_started" });

    expect(machine.transition({ type: "user_speech_started", at: "2026-04-28T20:01:00.000Z" })).toMatchObject({
      state: "interrupted",
      interruptedAt: "2026-04-28T20:01:00.000Z"
    });
  });
});
