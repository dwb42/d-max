import type { VoiceAudioContract } from "./types.js";

export const twilioMulaw8kAudioContract: VoiceAudioContract = {
  codec: "mulaw",
  sampleRateHz: 8000,
  channels: 1,
  frameMs: 20,
  framing: "base64_json"
};

export const browserPcm16AudioContract: VoiceAudioContract = {
  codec: "pcm16",
  sampleRateHz: 24000,
  channels: 1,
  frameMs: 20,
  framing: "base64_json"
};

export function describeAudioContract(contract: VoiceAudioContract): string {
  return `${contract.codec} ${contract.sampleRateHz}Hz ${contract.channels}ch ${contract.frameMs}ms ${contract.framing}`;
}

