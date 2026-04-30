import WebSocket from "ws";
import { buildDriveModeInstructions } from "./drive-mode-instructions.js";

export type XaiRealtimeSessionOptions = {
  apiKey: string;
  model: string;
  voice?: string;
  onEvent?: (event: Record<string, unknown>) => void;
  onAudioDelta?: (audio: Int16Array) => void;
};

export class XaiRealtimeSession {
  private socket: WebSocket | null = null;

  constructor(private readonly options: XaiRealtimeSessionOptions) {}

  async connect(): Promise<void> {
    if (this.socket) {
      return;
    }

    const socket = new WebSocket(`wss://api.x.ai/v1/realtime?model=${encodeURIComponent(this.options.model)}`, {
      headers: {
        Authorization: `Bearer ${this.options.apiKey}`
      }
    });

    socket.on("message", (data) => {
      try {
        const event = JSON.parse(data.toString()) as Record<string, unknown>;
        if (event.type === "response.output_audio.delta" && typeof event.delta === "string") {
          this.options.onAudioDelta?.(decodePcm16Base64(event.delta));
        }
        this.options.onEvent?.(event);
      } catch (error) {
        this.options.onEvent?.({
          type: "dmax.xai.parse_error",
          error: error instanceof Error ? error.message : "unknown"
        });
      }
    });

    await waitForOpen(socket);

    socket.send(
      JSON.stringify({
        type: "session.update",
        session: {
          voice: this.options.voice ?? "eve",
          instructions: buildDriveModeInstructions(),
          input_audio_format: "pcm16",
          output_audio_format: "pcm16",
          turn_detection: { type: "server_vad" },
          input_audio_transcription: {
            model: "whisper-1"
          }
        }
      })
    );

    this.socket = socket;
  }

  appendPcm16(data: Int16Array): void {
    if (!this.socket || this.socket.readyState !== WebSocket.OPEN) {
      return;
    }

    const audio = Buffer.from(data.buffer, data.byteOffset, data.byteLength).toString("base64");
    this.socket.send(
      JSON.stringify({
        type: "input_audio_buffer.append",
        audio
      })
    );
  }

  close(): void {
    this.socket?.close();
    this.socket = null;
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
    const handleError = (error: Error) => {
      cleanup();
      reject(error);
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

function decodePcm16Base64(audio: string): Int16Array {
  const buffer = Buffer.from(audio, "base64");
  const samples = Math.floor(buffer.byteLength / 2);
  const decoded = new Int16Array(samples);

  for (let index = 0; index < samples; index += 1) {
    decoded[index] = buffer.readInt16LE(index * 2);
  }

  return decoded;
}
