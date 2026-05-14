import { env } from "../config/env.js";

export type TextToSpeechInput = {
  text: string;
};

export type TextToSpeechResult = {
  audio: Buffer;
  mimeType: string;
  provider: string;
  model: string;
};

export async function synthesizeSpeech(input: TextToSpeechInput): Promise<TextToSpeechResult> {
  const text = input.text.trim();
  if (!text) {
    throw new Error("Text-to-speech input is empty.");
  }

  if (!env.openaiApiKey) {
    throw new Error("OPENAI_API_KEY is required for text-to-speech.");
  }

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      authorization: `Bearer ${env.openaiApiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: env.openaiTtsModel,
      voice: env.openaiTtsVoice,
      input: text,
      response_format: "mp3"
    })
  });

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
    throw new Error(payload?.error?.message ?? `OpenAI text-to-speech failed with HTTP ${response.status}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  const audio = Buffer.from(arrayBuffer);
  if (audio.length === 0) {
    throw new Error("OpenAI text-to-speech returned an empty audio payload.");
  }

  return {
    audio,
    mimeType: "audio/mpeg",
    provider: "openai",
    model: env.openaiTtsModel
  };
}
