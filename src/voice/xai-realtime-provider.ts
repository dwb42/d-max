import { browserPcm16AudioContract, twilioMulaw8kAudioContract } from "./audio-contracts.js";
import type { RealtimeVoiceProvider, RealtimeVoiceProviderCapabilities, RealtimeVoiceSession } from "./provider.js";
import type { VoiceSessionConfig } from "./types.js";
import WebSocket from "ws";

export type XaiRealtimeProviderConfig = {
  apiKey?: string;
  model: string;
  baseUrl?: string;
};

export class XaiRealtimeProvider implements RealtimeVoiceProvider {
  readonly name = "xai" as const;
  private readonly baseUrl: string;

  constructor(private readonly config: XaiRealtimeProviderConfig) {
    this.baseUrl = config.baseUrl ?? "wss://api.x.ai/v1/realtime";
  }

  describeCapabilities(): RealtimeVoiceProviderCapabilities {
    return {
      provider: this.name,
      model: this.config.model,
      inputAudio: [browserPcm16AudioContract, twilioMulaw8kAudioContract],
      outputAudio: [browserPcm16AudioContract, twilioMulaw8kAudioContract],
      supportsServerVad: true,
      supportsBargeInCancel: true,
      supportsToolCalling: true,
      supportsTranscriptDeltas: true,
      notes: [
        "Capabilities are expected for the planned xAI realtime voice path and must be verified with a live capability spike before production use.",
        "Prefer telephony codec pass-through for SIP/Twilio if the live API accepts mu-law 8k input and output."
      ]
    };
  }

  async startSession(config: VoiceSessionConfig): Promise<RealtimeVoiceSession> {
    if (!this.config.apiKey) {
      throw new Error("XAI_API_KEY is required to start an xAI realtime voice session.");
    }

    const url = `${this.baseUrl}?model=${encodeURIComponent(this.config.model)}`;
    const socket = new WebSocket(url, {
      headers: {
        Authorization: `Bearer ${this.config.apiKey}`
      }
    });

    await waitForOpen(socket);

    socket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          instructions: "d-max realtime capability spike session.",
          turn_detection: { type: "server_vad" },
          ...(config.audio ? { input_audio_format: config.audio.codec, output_audio_format: config.audio.codec } : {})
        }
      })
    );

    return {
      id: config.id,
      close: async () => {
        socket.close();
      }
    };
  }
}

function waitForOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error("Timed out opening xAI realtime WebSocket."));
    }, 10000);

    const handleOpen = () => {
      cleanup();
      resolve();
    };
    const handleError = () => {
      cleanup();
      reject(new Error("Failed to open xAI realtime WebSocket."));
    };
    const cleanup = () => {
      clearTimeout(timeout);
      socket.off("open", handleOpen);
      socket.off("error", handleError);
    };

    socket.on("open", handleOpen);
    socket.on("error", handleError);
  });
}
