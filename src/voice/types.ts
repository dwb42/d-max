import type { ToolName } from "../core/tool-definitions.js";

export type VoiceSessionState =
  | "starting"
  | "listening"
  | "responding"
  | "tool_call_pending"
  | "awaiting_confirmation"
  | "committing"
  | "interrupted"
  | "ending"
  | "ended";

export type VoiceTransport = "web" | "sip" | "twilio_media_stream";

export type VoiceMode = "drive";

export type VoiceAudioCodec = "pcm16" | "mulaw" | "alaw";

export type VoiceAudioContract = {
  codec: VoiceAudioCodec;
  sampleRateHz: number;
  channels: 1 | 2;
  frameMs: number;
  framing: "base64_json" | "binary";
};

export type VoiceSessionConfig = {
  id: string;
  mode: VoiceMode;
  transport: VoiceTransport;
  callerId?: string;
  startedAt: string;
  audio?: VoiceAudioContract;
};

export type PendingVoiceAction = {
  id: string;
  tool: ToolName;
  input: unknown;
  summary: string;
  requiresConfirmation: boolean;
  unsafeAfterInterruption: boolean;
  idempotencyKey: string;
  createdAt: string;
  confirmedAt?: string | null;
  committedAt?: string | null;
  cancelledAt?: string | null;
  interruptedAt?: string | null;
};

export type VoiceSessionSnapshot = {
  state: VoiceSessionState;
  pendingAction: PendingVoiceAction | null;
  interruptedAt: string | null;
};

export type VoiceStateTransition =
  | { type: "session_started" }
  | { type: "user_speech_started"; at: string }
  | { type: "assistant_response_started" }
  | { type: "assistant_response_finished" }
  | { type: "tool_call_started" }
  | { type: "tool_call_finished" }
  | { type: "confirmation_requested"; action: PendingVoiceAction }
  | { type: "confirmation_received" }
  | { type: "confirmation_cancelled"; at: string }
  | { type: "action_committed" }
  | { type: "interrupted"; at: string }
  | { type: "session_ending" }
  | { type: "session_ended" };

export type VoiceEventType =
  | "transport_connected"
  | "transport_disconnected"
  | "audio_input_started"
  | "audio_input_committed"
  | "model_audio_started"
  | "model_audio_finished"
  | "model_transcript_delta"
  | "barge_in_detected"
  | "model_tool_call_started"
  | "model_tool_call_finished"
  | "voice_action_proposed"
  | "voice_action_confirmed"
  | "voice_action_cancelled"
  | "voice_action_committed"
  | "session_review_sent"
  | "error";

export type VoiceSessionEvent = {
  id: string;
  sessionId: string;
  type: VoiceEventType;
  at: string;
  metadata?: Record<string, string | number | boolean | null>;
};

export type VoiceActionStatus = "pending" | "confirmed" | "committed" | "cancelled" | "interrupted";

export type VoiceActionLedgerEntry = PendingVoiceAction & {
  status: VoiceActionStatus;
};
