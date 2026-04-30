import { env } from "../config/env.js";

export type TranscribeAudioInput = {
  audio: Buffer;
  mimeType: string;
  filename?: string;
};

export async function transcribeAudio(input: TranscribeAudioInput): Promise<string> {
  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for voice message transcription.");
  }

  if (input.audio.length === 0) {
    throw new Error("Audio payload is empty.");
  }

  const form = new FormData();
  form.set("model", env.openaiTranscribeModel);
  form.set("language", "de");
  form.set("response_format", "json");
  form.set(
    "file",
    new Blob([new Uint8Array(input.audio)], { type: input.mimeType || "audio/webm" }),
    input.filename ?? filenameForMimeType(input.mimeType)
  );

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.openaiApiKey}`
    },
    body: form
  });

  const payload = (await response.json().catch(() => null)) as { text?: unknown; error?: { message?: string } } | null;
  if (!response.ok) {
    throw new Error(payload?.error?.message ?? `OpenAI transcription failed with HTTP ${response.status}`);
  }

  if (typeof payload?.text !== "string") {
    throw new Error("OpenAI transcription response did not include text.");
  }

  return payload.text.trim();
}

function filenameForMimeType(mimeType: string): string {
  if (mimeType.includes("wav")) return "voice-message.wav";
  if (mimeType.includes("mp4")) return "voice-message.mp4";
  if (mimeType.includes("mpeg")) return "voice-message.mp3";
  if (mimeType.includes("ogg")) return "voice-message.ogg";
  return "voice-message.webm";
}
