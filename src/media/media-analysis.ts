import { env } from "../config/env.js";
import { transcribeAudio } from "../chat/openai-transcription.js";
import type { MediaKind } from "../repositories/media-assets.js";

export type MediaAnalysisInput = {
  buffer: Buffer;
  kind: MediaKind;
  mimeType: string;
  originalName: string;
  prompt?: string | null;
};

export type MediaAnalysisResult = {
  transcript?: string | null;
  textExcerpt?: string | null;
  summary?: string | null;
};

export async function analyzeMedia(input: MediaAnalysisInput): Promise<MediaAnalysisResult> {
  if (input.kind === "audio" || input.kind === "video") {
    return analyzeAudioLikeMedia(input);
  }

  if (input.mimeType === "text/plain" || input.mimeType === "text/markdown") {
    const text = decodeUtf8Text(input.buffer);
    if (input.prompt?.trim()) {
      return analyzeTextWithOpenAi(input, "Textdokument", text);
    }
    return {
      textExcerpt: excerpt(text, 6000),
      summary: firstMeaningfulLine(text) ?? `Textdokument: ${input.originalName}`
    };
  }

  if (input.kind === "image") {
    return analyzeWithOpenAiFileInput(input, "image");
  }

  if (input.mimeType === "application/pdf") {
    return analyzeWithOpenAiFileInput(input, "pdf");
  }

  if (input.kind === "document") {
    return {
      summary: `Dokument gespeichert. Automatische Inhaltsanalyse ist fuer diesen Dateityp noch nicht verfuegbar.`,
      textExcerpt: null
    };
  }

  return {
    summary: `Datei gespeichert. Automatische Inhaltsanalyse ist fuer diesen Dateityp noch nicht verfuegbar.`,
    textExcerpt: null
  };
}

async function analyzeAudioLikeMedia(input: MediaAnalysisInput): Promise<MediaAnalysisResult> {
  try {
    const transcript = await transcribeAudio({
      audio: input.buffer,
      mimeType: input.mimeType,
      filename: input.originalName
    });
    if (input.prompt?.trim()) {
      const analysis = await analyzeTextWithOpenAi(input, "Transkript", transcript);
      return {
        transcript,
        textExcerpt: analysis.textExcerpt ?? excerpt(transcript, 6000),
        summary: analysis.summary ?? firstMeaningfulLine(transcript) ?? `Transkription von ${input.originalName}`
      };
    }
    return {
      transcript,
      textExcerpt: excerpt(transcript, 6000),
      summary: firstMeaningfulLine(transcript) ?? `Transkription von ${input.originalName}`
    };
  } catch (error) {
    return {
      transcript: null,
      textExcerpt: null,
      summary: `Audio/Video gespeichert. Transkription nicht verfuegbar: ${error instanceof Error ? error.message : "unbekannter Fehler"}`
    };
  }
}

async function analyzeWithOpenAiFileInput(input: MediaAnalysisInput, mode: "image" | "pdf"): Promise<MediaAnalysisResult> {
  if (env.nodeEnv === "test") {
    return {
      summary: `${mode === "image" ? "Bild" : "PDF"} gespeichert. Automatische Inhaltsanalyse wird in Tests nicht ausgefuehrt.`,
      textExcerpt: null
    };
  }

  if (!env.openaiApiKey) {
    return {
      summary: `${mode === "image" ? "Bild" : "PDF"} gespeichert. OPENAI_API_KEY fehlt fuer automatische Inhaltsanalyse.`,
      textExcerpt: null
    };
  }

  try {
    const payload = mode === "image" ? imageAnalysisPayload(input) : pdfAnalysisPayload(input);
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.openaiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const json = (await response.json().catch(() => null)) as OpenAiResponsePayload | null;
    if (!response.ok) {
      throw new Error(errorMessage(json) ?? `OpenAI media analysis failed with HTTP ${response.status}`);
    }

    const parsed = parseAnalysisJson(extractResponseText(json));
    return {
      summary: parsed.summary ?? null,
      textExcerpt: parsed.textExcerpt ?? parsed.summary ?? null,
      transcript: null
    };
  } catch (error) {
    return {
      summary: `${mode === "image" ? "Bild" : "PDF"} gespeichert. Analyse fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`,
      textExcerpt: null
    };
  }
}

async function analyzeTextWithOpenAi(input: MediaAnalysisInput, label: string, text: string): Promise<MediaAnalysisResult> {
  if (env.nodeEnv === "test" || !env.openaiApiKey) {
    return {
      textExcerpt: excerpt(text, 6000),
      summary: firstMeaningfulLine(text) ?? `${label}: ${input.originalName}`
    };
  }

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.openaiApiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(textAnalysisPayload(input, label, text))
    });
    const json = (await response.json().catch(() => null)) as OpenAiResponsePayload | null;
    if (!response.ok) {
      throw new Error(errorMessage(json) ?? `OpenAI media analysis failed with HTTP ${response.status}`);
    }

    const parsed = parseAnalysisJson(extractResponseText(json));
    return {
      summary: parsed.summary ?? firstMeaningfulLine(text) ?? null,
      textExcerpt: parsed.textExcerpt ?? excerpt(text, 6000),
      transcript: null
    };
  } catch (error) {
    return {
      textExcerpt: excerpt(text, 6000),
      summary: `${label} gespeichert. Analyse fehlgeschlagen: ${error instanceof Error ? error.message : "unbekannter Fehler"}`
    };
  }
}

function imageAnalysisPayload(input: MediaAnalysisInput): unknown {
  return {
    model: env.openaiMediaAnalysisModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: analysisInstruction(input.originalName, "Bild", input.prompt)
          },
          {
            type: "input_image",
            image_url: `data:${input.mimeType};base64,${input.buffer.toString("base64")}`
          }
        ]
      }
    ]
  };
}

function pdfAnalysisPayload(input: MediaAnalysisInput): unknown {
  return {
    model: env.openaiMediaAnalysisModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: analysisInstruction(input.originalName, "PDF", input.prompt)
          },
          {
            type: "input_file",
            filename: input.originalName,
            file_data: `data:${input.mimeType};base64,${input.buffer.toString("base64")}`
          }
        ]
      }
    ]
  };
}

function textAnalysisPayload(input: MediaAnalysisInput, label: string, text: string): unknown {
  return {
    model: env.openaiMediaAnalysisModel,
    input: [
      {
        role: "user",
        content: [
          {
            type: "input_text",
            text: [analysisInstruction(input.originalName, label, input.prompt), "", "Inhalt:", excerpt(text, 12000)].join("\n")
          }
        ]
      }
    ]
  };
}

function analysisInstruction(filename: string, label: string, prompt?: string | null): string {
  const instruction = [
    `Analysiere dieses ${label} fuer DMAX als Projekt-/Task-Kontext.`,
    `Dateiname: ${filename}`,
    "Antworte ausschliesslich als kompaktes JSON ohne Markdown:",
    '{"summary":"1-2 Saetze, was zu sehen/enthalten ist","textExcerpt":"relevanter erkannter Text oder kurze strukturierte Inhaltsnotiz"}',
    "Wenn kein Text erkennbar ist, nutze textExcerpt fuer eine sachliche Inhaltsnotiz."
  ];
  if (prompt?.trim()) {
    instruction.push(`Zusaetzlicher Nutzerfokus: ${prompt.trim()}`);
  }
  return instruction.join("\n");
}

type OpenAiResponsePayload = {
  output_text?: unknown;
  output?: unknown;
  error?: {
    message?: string;
  };
};

function extractResponseText(payload: OpenAiResponsePayload | null): string {
  if (typeof payload?.output_text === "string") {
    return payload.output_text;
  }

  const output = Array.isArray(payload?.output) ? payload.output : [];
  const parts: string[] = [];
  for (const item of output) {
    if (!isRecord(item) || !Array.isArray(item.content)) continue;
    for (const content of item.content) {
      if (!isRecord(content)) continue;
      if (typeof content.text === "string") parts.push(content.text);
      if (typeof content.output_text === "string") parts.push(content.output_text);
    }
  }
  return parts.join("\n").trim();
}

function parseAnalysisJson(text: string): { summary?: string; textExcerpt?: string } {
  const match = text.match(/\{[\s\S]*\}/);
  const candidate = match?.[0] ?? text;
  const parsed = JSON.parse(candidate) as Record<string, unknown>;
  return {
    summary: typeof parsed.summary === "string" ? parsed.summary.trim() : undefined,
    textExcerpt: typeof parsed.textExcerpt === "string" ? parsed.textExcerpt.trim() : undefined
  };
}

function errorMessage(payload: OpenAiResponsePayload | null): string | null {
  return typeof payload?.error?.message === "string" ? payload.error.message : null;
}

function decodeUtf8Text(buffer: Buffer): string {
  return new TextDecoder("utf-8", { fatal: false }).decode(buffer).replace(/\u0000/g, "").trim();
}

function firstMeaningfulLine(text: string): string | null {
  return text
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean)
    ?.slice(0, 240) ?? null;
}

function excerpt(text: string, maxLength: number): string {
  const cleaned = text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= maxLength) {
    return cleaned;
  }
  return `${cleaned.slice(0, maxLength - 15).trimEnd()}\n[truncated]`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
