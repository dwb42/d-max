import type { VoiceAudioContract, VoiceSessionConfig } from "./types.js";

export type RealtimeVoiceProviderName = "xai";

export type RealtimeVoiceProviderCapabilities = {
  provider: RealtimeVoiceProviderName;
  model: string;
  inputAudio: VoiceAudioContract[];
  outputAudio: VoiceAudioContract[];
  supportsServerVad: boolean;
  supportsBargeInCancel: boolean;
  supportsToolCalling: boolean;
  supportsTranscriptDeltas: boolean;
  notes: string[];
};

export type RealtimeVoiceSession = {
  id: string;
  close(): Promise<void>;
};

export interface RealtimeVoiceProvider {
  readonly name: RealtimeVoiceProviderName;
  describeCapabilities(): RealtimeVoiceProviderCapabilities;
  startSession(config: VoiceSessionConfig): Promise<RealtimeVoiceSession>;
}

