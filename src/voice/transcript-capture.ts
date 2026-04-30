import type { VoiceThoughtInput } from "./tool-bridge.js";

export type PreparedVoiceCapture = {
  rawInput: string;
  summary: string;
  thoughts: VoiceThoughtInput[];
};

const fillerPatterns = [
  /^guten morgen\.?$/i,
  /^godmorgen\.?$/i,
  /^ja[, ]+ja[, ]+bitte\.?$/i,
  /^ja[, ]+bitte\.?$/i,
  /^bitte\.?$/i,
  /^danke\.?$/i,
  /^vielen dank\.?$/i,
  /^so bitte[, ]+bitte deutsch sprechen\.?$/i
];

export function shouldCaptureVoiceTranscript(transcript: string): boolean {
  const normalized = normalizeTranscript(transcript);
  if (normalized.length < 12) {
    return false;
  }

  return !fillerPatterns.some((pattern) => pattern.test(normalized));
}

export function mergeVoiceTranscripts(current: string | null, next: string): string {
  const cleanedNext = normalizeTranscript(next);
  if (!current) {
    return cleanedNext;
  }

  const cleanedCurrent = normalizeTranscript(current);
  const currentKey = comparable(cleanedCurrent);
  const nextKey = comparable(cleanedNext);

  if (nextKey.includes(currentKey)) {
    return cleanedNext;
  }

  if (currentKey.includes(nextKey)) {
    return cleanedCurrent;
  }

  return `${cleanedCurrent} ${cleanedNext}`;
}

export function prepareVoiceCapture(transcript: string): PreparedVoiceCapture | null {
  const rawInput = normalizeTranscript(transcript);
  if (!shouldCaptureVoiceTranscript(rawInput)) {
    return null;
  }

  const taskTitles = extractTaskTitles(rawInput);
  const projectTitles = extractProjectTitles(rawInput);
  const thoughts: VoiceThoughtInput[] = [];

  for (const projectTitle of projectTitles) {
    thoughts.push({
      type: "possible_project",
      content: projectTitle,
      normalizedContent: projectTitle,
      maturity: "named",
      confidence: 0.75,
      heat: 0.65
    });
  }

  for (const title of taskTitles) {
    thoughts.push({
      type: "possible_task",
      content: title,
      normalizedContent: title,
      maturity: "testable",
      confidence: 0.8,
      heat: 0.7
    });
  }

  if (thoughts.length === 0) {
    thoughts.push({
      type: "observation",
      content: rawInput,
      normalizedContent: rawInput,
      maturity: "spark",
      confidence: 0.7,
      heat: 0.45
    });
  }

  return {
    rawInput,
    summary: rawInput,
    thoughts: dedupeThoughts(thoughts)
  };
}

function extractTaskTitles(transcript: string): string[] {
  const titles: string[] = [];
  const regex = /(?:die\s+)?aufgabe\s+([^,.?]+?)(?=\s*(?:,|\.|\?|$|\bund\b|\bund dann\b|\bes gibt\b|\bkannst du\b))/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(transcript))) {
    const title = cleanTaskTitle(match[1] ?? "");
    if (title) {
      titles.push(title);
    }
  }

  return titles;
}

function extractProjectTitles(transcript: string): string[] {
  const titles: string[] = [];
  const regex = /\bprojekt\s+(.+?)(?=\s*(?:,\s*(?:und\s+)?(?:dann\s+)?(?:gibt|gibt es)|\.\s*(?:und\s+)?(?:dann\s+)?(?:gibt|gibt es)|\s+und\s+projekt\b|\s+(?:und\s+)?dann\s+gibt|\s+dann\s+gibt|\s+das\s+möchte|\s+das\s+soll|\s+also\s+dann|\s+genau|\s+das\s+reicht|$))/gi;
  let match: RegExpExecArray | null;

  while ((match = regex.exec(transcript))) {
    const title = cleanProjectTitle(match[1] ?? "");
    if (title) {
      titles.push(title);
    }
  }

  return titles;
}

function cleanProjectTitle(value: string): string {
  return cleanTitle(value)
    .replace(/^(gibt\s+(?:es\s+)?)?(das|der|die|ein|eine|einen)\s+projekt\s+/i, "")
    .replace(/^(das|der|die|ein|eine|einen)\s+/i, "")
    .replace(/\s+anlegen\??$/i, "")
    .replace(/\s+im\s+januar.*$/i, "")
    .trim();
}

function cleanTaskTitle(value: string): string {
  return cleanTitle(value)
    .replace(/^(die|der|das|eine|einen|ein)\s+/i, "")
    .replace(/\s+für mich$/i, "")
    .trim();
}

function cleanTitle(value: string): string {
  return value
    .replace(/\s+/g, " ")
    .replace(/^gibt\s+(?:es\s+)?(?:die\s+)?/i, "")
    .replace(/^es\s+gibt\s+(?:die\s+)?/i, "")
    .replace(/^die\s+/i, "")
    .replace(/\s+anlegen$/i, "")
    .trim();
}

function normalizeTranscript(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function comparable(value: string): string {
  return value.toLocaleLowerCase("de-DE").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function dedupeThoughts(thoughts: VoiceThoughtInput[]): VoiceThoughtInput[] {
  const seen = new Set<string>();
  return thoughts.filter((thought) => {
    const key = `${thought.type}:${comparable(thought.content)}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}
