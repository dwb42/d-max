import type { PendingVoiceAction, VoiceSessionSnapshot, VoiceStateTransition } from "./types.js";

export class VoiceSessionStateMachine {
  private state: VoiceSessionSnapshot = {
    state: "starting",
    pendingAction: null,
    interruptedAt: null
  };

  snapshot(): VoiceSessionSnapshot {
    return { ...this.state };
  }

  transition(event: VoiceStateTransition): VoiceSessionSnapshot {
    switch (event.type) {
      case "session_started":
        this.state = { ...this.state, state: "listening" };
        break;
      case "user_speech_started":
        if (this.state.state === "responding" || this.state.state === "tool_call_pending") {
          this.interrupt(event.at);
        } else if (this.state.state !== "ending" && this.state.state !== "ended") {
          this.state = { ...this.state, state: "listening" };
        }
        break;
      case "assistant_response_started":
        this.state = { ...this.state, state: "responding" };
        break;
      case "assistant_response_finished":
        this.state = { ...this.state, state: "listening" };
        break;
      case "tool_call_started":
        this.state = { ...this.state, state: "tool_call_pending" };
        break;
      case "tool_call_finished":
        this.state = { ...this.state, state: "listening" };
        break;
      case "confirmation_requested":
        this.state = { ...this.state, state: "awaiting_confirmation", pendingAction: event.action };
        break;
      case "confirmation_received":
        if (!this.state.pendingAction) {
          throw new Error("Cannot confirm without a pending action.");
        }
        this.state = {
          ...this.state,
          state: "committing",
          pendingAction: { ...this.state.pendingAction, confirmedAt: new Date().toISOString() }
        };
        break;
      case "confirmation_cancelled":
        this.state = {
          ...this.state,
          state: "listening",
          pendingAction: null
        };
        break;
      case "action_committed":
        this.state = { ...this.state, state: "listening", pendingAction: null };
        break;
      case "interrupted":
        this.interrupt(event.at);
        break;
      case "session_ending":
        this.state = { ...this.state, state: "ending" };
        break;
      case "session_ended":
        this.state = { ...this.state, state: "ended", pendingAction: null };
        break;
    }

    return this.snapshot();
  }

  canCommitPendingAction(): boolean {
    return this.state.state === "committing" && this.state.pendingAction !== null && this.state.interruptedAt === null;
  }

  private interrupt(at: string): void {
    this.state = {
      state: "interrupted",
      pendingAction: clearUnsafePendingAction(this.state.pendingAction),
      interruptedAt: at
    };
  }
}

function clearUnsafePendingAction(action: PendingVoiceAction | null): PendingVoiceAction | null {
  if (!action?.unsafeAfterInterruption) {
    return action;
  }

  return null;
}
