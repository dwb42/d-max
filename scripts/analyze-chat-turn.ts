import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../src/config/env.js";
import { diagnosticsDir } from "../src/diagnostics/chat-turns.js";
import type { ChatTurnDiagnosticEvent } from "../src/diagnostics/chat-turns.js";
import type { AppChatTurnTrace } from "../src/chat/turn-trace.js";

const args = parseArgs(process.argv.slice(2));
const db = new Database(env.databasePath);
const promptLog = args.promptLogId
  ? db.prepare("select * from app_prompt_logs where id = ?").get(args.promptLogId)
  : db.prepare("select * from app_prompt_logs where turn_trace is not null order by id desc limit 1").get();

if (!promptLog) {
  throw new Error(args.promptLogId ? `Prompt log #${args.promptLogId} not found.` : "No prompt log with turn_trace found.");
}

const row = promptLog as {
  id: number;
  conversation_id: number;
  openclaw_session_id: string;
  context_type: string;
  context_entity_id: number | null;
  created_at: string;
  turn_trace: string | null;
  user_input: string;
  system_instructions: string;
  context_data: string;
  memory_history: string;
  tools: string;
  final_prompt: string;
  context_payload_json: string | null;
};
const trace = row.turn_trace ? (JSON.parse(row.turn_trace) as AppChatTurnTrace) : null;
if (!trace) {
  throw new Error(`Prompt log #${row.id} has no turn_trace.`);
}
const traceId = trace.traceId ?? `legacy-prompt-log-${row.id}`;

const startedAtMs = Date.parse(trace.startedAt);
const completedAtMs = trace.completedAt ? Date.parse(trace.completedAt) : Date.now();
const windowStart = startedAtMs - args.windowBeforeMs;
const windowEnd = completedAtMs + args.windowAfterMs;
const diagnostics = readDiagnosticEvents().filter((event) => {
  const ts = Date.parse(event.ts);
  if (event.traceId === traceId) {
    return true;
  }

  return args.includeMcp && event.source === "mcp" && ts >= windowStart && ts <= windowEnd;
});

const turnEvents = trace.events.map((event) => ({
  ts: event.at,
  source: "turn_trace",
  event: event.label,
  traceId,
  detail: event.detail,
  msFromStart: event.msFromStart
}));
const persistedTurnEventKeys = new Set(trace.events.map((event) => `${event.label}|${event.at}`));
const openClawTrajectoryEvents = (trace.openClaw?.runs ?? []).flatMap((run) => [
  {
    ts: run.sessionStartedAt,
    source: "trajectory",
    event: "openclaw_session_started",
    traceId,
    detail: { runId: run.runId, toolCount: run.toolCount },
    msFromStart: Date.parse(run.sessionStartedAt) - startedAtMs
  },
  ...(run.modelCompletedAt
    ? [
        {
          ts: run.modelCompletedAt,
          source: "trajectory",
          event: "openclaw_model_completed",
          traceId,
          detail: { runId: run.runId, usage: run.usage },
          msFromStart: Date.parse(run.modelCompletedAt) - startedAtMs
        }
      ]
    : []),
  ...(run.sessionEndedAt
    ? [
        {
          ts: run.sessionEndedAt,
          source: "trajectory",
          event: "openclaw_session_ended",
          traceId,
          detail: { runId: run.runId },
          msFromStart: Date.parse(run.sessionEndedAt) - startedAtMs
        }
      ]
    : [])
]);
const diagnosticEvents = diagnostics.map((event) => ({
  ts: event.ts,
  source: event.source,
  event: event.event,
  traceId: event.traceId,
  detail: event.detail,
  msFromStart: event.msFromTraceStart ?? Date.parse(event.ts) - startedAtMs
})).filter((event) => !(event.source === "api" && persistedTurnEventKeys.has(`${event.event}|${event.ts}`)));
const timeline = [...turnEvents, ...openClawTrajectoryEvents, ...diagnosticEvents]
  .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts) || a.event.localeCompare(b.event));

console.log(`Prompt log #${row.id} conversation #${row.conversation_id} ${row.context_type}:${row.context_entity_id ?? "none"}`);
console.log(`Trace: ${traceId}`);
console.log(`OpenClaw session: ${row.openclaw_session_id}`);
console.log(`Total: ${formatMs(trace.totalMs ?? completedAtMs - startedAtMs)}`);
printContextBreakdown(row, trace);
console.log("");
console.log("Timeline");
for (const event of timeline) {
  console.log(`${formatMs(event.msFromStart).padStart(10)}  ${event.source.padEnd(10)}  ${event.event}${formatDetail(event.detail)}`);
}

console.log("");
console.log("Largest gaps");
const gaps = timeline
  .flatMap((event, index) => {
    const previous = timeline[index - 1];
    return previous
      ? {
          from: previous,
          to: event,
          gapMs: Date.parse(event.ts) - Date.parse(previous.ts)
        }
      : [];
  })
  .filter((gap) => gap.gapMs >= args.minGapMs)
  .sort((a, b) => b.gapMs - a.gapMs)
  .slice(0, 10);

if (gaps.length === 0) {
  console.log(`No gaps >= ${formatMs(args.minGapMs)}.`);
} else {
  for (const gap of gaps) {
    console.log(`${formatMs(gap.gapMs).padStart(10)}  ${gap.from.source}:${gap.from.event} -> ${gap.to.source}:${gap.to.event}`);
  }
}

function parseArgs(input: string[]): {
  promptLogId: number | null;
  includeMcp: boolean;
  minGapMs: number;
  windowBeforeMs: number;
  windowAfterMs: number;
} {
  const promptLogId = readNumberFlag(input, "--prompt-log-id") ?? readNumberFlag(input, "--id");
  return {
    promptLogId,
    includeMcp: !input.includes("--no-mcp"),
    minGapMs: readNumberFlag(input, "--min-gap-ms") ?? 1000,
    windowBeforeMs: readNumberFlag(input, "--window-before-ms") ?? 5000,
    windowAfterMs: readNumberFlag(input, "--window-after-ms") ?? 5000
  };
}

function readNumberFlag(input: string[], flag: string): number | null {
  const index = input.indexOf(flag);
  if (index === -1) {
    return null;
  }

  const value = Number(input[index + 1]);
  return Number.isFinite(value) ? value : null;
}

function readDiagnosticEvents(): ChatTurnDiagnosticEvent[] {
  const dir = diagnosticsDir();
  if (!existsSync(dir)) {
    return [];
  }

  return readdirSync(dir)
    .filter((name) => name.endsWith(".ndjson"))
    .flatMap((name) => readFileSync(path.join(dir, name), "utf8").split("\n"))
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line) as ChatTurnDiagnosticEvent;
      } catch {
        return null;
      }
    })
    .filter((event): event is ChatTurnDiagnosticEvent => Boolean(event?.traceId && event.ts && event.source && event.event));
}

function printContextBreakdown(row: {
  openclaw_session_id: string;
  user_input: string;
  system_instructions: string;
  context_data: string;
  memory_history: string;
  tools: string;
  final_prompt: string;
  context_payload_json: string | null;
}, trace: AppChatTurnTrace): void {
  const sentComponents = [
    { label: "System/context instructions", chars: row.system_instructions.length },
    { label: "Resolved context data", chars: row.context_data.length },
    { label: "User request", chars: row.user_input.length },
    {
      label: "Wrapper/separators",
      chars: Math.max(0, row.final_prompt.length - row.system_instructions.length - row.context_data.length - row.user_input.length)
    }
  ];
  const diagnosticOnly = [
    { label: "Logged memoryHistory only", chars: row.memory_history.length },
    { label: "Logged static tool summary only", chars: row.tools.length },
    { label: "Logged contextPayload JSON only", chars: row.context_payload_json?.length ?? 0 }
  ];
  const sentChars = row.final_prompt.length;
  const session = findOpenClawSession(row.openclaw_session_id);
  const latestUsage = [...(trace.openClaw?.runs ?? [])].reverse().find((run) => run.usage)?.usage ?? null;

  console.log("");
  console.log("Context breakdown");
  console.log(`Sent DMAX message: ${formatCount(sentChars)} chars / ~${formatCount(approxTokens(sentChars))} tokens`);
  for (const item of sentComponents) {
    console.log(`  ${item.label.padEnd(29)} ${formatCount(item.chars).padStart(8)} chars  ~${formatCount(approxTokens(item.chars)).padStart(6)} tokens  ${formatPercent(item.chars, sentChars).padStart(6)}`);
  }
  console.log("Diagnostic fields not embedded in finalPrompt");
  for (const item of diagnosticOnly) {
    console.log(`  ${item.label.padEnd(29)} ${formatCount(item.chars).padStart(8)} chars  ~${formatCount(approxTokens(item.chars)).padStart(6)} tokens`);
  }
  if (session) {
    console.log("OpenClaw persistent session");
    console.log(`  sessionId                     ${session.sessionId ?? "unknown"}`);
    console.log(`  session transcript            ${session.sessionBytes === null ? "unknown" : `${formatCount(session.sessionBytes)} bytes / ~${formatCount(approxTokens(session.sessionBytes))} char-tokens`}`);
    console.log(`  trajectory diagnostics         ${session.trajectoryBytes === null ? "unknown" : `${formatCount(session.trajectoryBytes)} bytes`}`);
    console.log(`  registry totalTokens           ${session.totalTokens ?? "unknown"}`);
    console.log(`  registry compactionCount       ${session.compactionCount ?? 0}`);
    if (session.composition) {
      console.log("  transcript composition");
      for (const item of session.composition.byRole) {
        console.log(`    ${item.role.padEnd(12)} ${String(item.count).padStart(3)} messages  ${formatCount(item.chars).padStart(8)} chars  ~${formatCount(approxTokens(item.chars)).padStart(6)} tokens`);
      }
      for (const item of session.composition.largestMessages.slice(0, 5)) {
        console.log(`    largest ${item.role.padEnd(10)} ${formatCount(item.chars).padStart(8)} chars  ${item.toolName ?? item.id ?? ""}`);
      }
    }
  }
  if (latestUsage) {
    console.log(`Latest OpenClaw usage from trace: ${JSON.stringify(latestUsage)}`);
  }
}

function findOpenClawSession(openClawSessionKey: string): {
  sessionId: string | null;
  sessionBytes: number | null;
  trajectoryBytes: number | null;
  totalTokens: number | null;
  compactionCount: number | null;
  composition: SessionComposition | null;
} | null {
  const stateDir = process.env.DMAX_OPENCLAW_STATE_DIR ?? "./data/openclaw-web-state";
  const registryPath = path.resolve(stateDir, "agents/main/sessions/sessions.json");
  if (!existsSync(registryPath)) {
    return null;
  }

  try {
    const registry = JSON.parse(readFileSync(registryPath, "utf8")) as Record<string, Record<string, unknown>>;
    const record = registry[`agent:main:${openClawSessionKey}`] ?? registry[openClawSessionKey];
    if (!record) {
      return null;
    }
    const sessionId = typeof record.sessionId === "string" ? record.sessionId : null;
    const rawSessionFile = typeof record.sessionFile === "string" ? record.sessionFile : null;
    const sessionFile = rawSessionFile?.replace("$OPENCLAW_STATE_DIR", path.resolve(stateDir)) ?? (sessionId ? path.resolve(stateDir, "agents/main/sessions", `${sessionId}.jsonl`) : null);
    const trajectoryFile = sessionId ? path.resolve(stateDir, "agents/main/sessions", `${sessionId}.trajectory.jsonl`) : null;
    return {
      sessionId,
      sessionBytes: sessionFile && existsSync(sessionFile) ? statSync(sessionFile).size : null,
      trajectoryBytes: trajectoryFile && existsSync(trajectoryFile) ? statSync(trajectoryFile).size : null,
      totalTokens: typeof record.totalTokens === "number" ? record.totalTokens : null,
      compactionCount: typeof record.compactionCount === "number" ? record.compactionCount : null,
      composition: sessionFile && existsSync(sessionFile) ? analyzeSessionFile(sessionFile) : null
    };
  } catch {
    return null;
  }
}

type SessionComposition = {
  byRole: Array<{ role: string; count: number; chars: number }>;
  largestMessages: Array<{ role: string; chars: number; id?: string; toolName?: string }>;
};

function analyzeSessionFile(sessionFile: string): SessionComposition {
  const byRole = new Map<string, { role: string; count: number; chars: number }>();
  const largestMessages: Array<{ role: string; chars: number; id?: string; toolName?: string }> = [];
  for (const line of readFileSync(sessionFile, "utf8").split("\n").filter(Boolean)) {
    try {
      const record = JSON.parse(line) as Record<string, unknown>;
      const message = isRecord(record.message) ? record.message : null;
      if (!message) {
        continue;
      }
      const role = typeof message.role === "string" ? message.role : "unknown";
      const chars = messageTextChars(message);
      const current = byRole.get(role) ?? { role, count: 0, chars: 0 };
      current.count += 1;
      current.chars += chars;
      byRole.set(role, current);
      largestMessages.push({
        role,
        chars,
        id: typeof record.id === "string" ? record.id : undefined,
        toolName: typeof message.toolName === "string" ? message.toolName : undefined
      });
    } catch {
      // Ignore corrupt or partial diagnostic records.
    }
  }
  return {
    byRole: [...byRole.values()].sort((a, b) => b.chars - a.chars),
    largestMessages: largestMessages.sort((a, b) => b.chars - a.chars)
  };
}

function messageTextChars(message: Record<string, unknown>): number {
  if (typeof message.content === "string") {
    return message.content.length;
  }
  if (!Array.isArray(message.content)) {
    return 0;
  }
  return message.content.reduce((sum, part) => {
    if (!isRecord(part)) {
      return sum;
    }
    return sum + (typeof part.text === "string" ? part.text.length : JSON.stringify(part).length);
  }, 0);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function approxTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatPercent(part: number, total: number): string {
  if (total <= 0) {
    return "0.0%";
  }
  return `${((part / total) * 100).toFixed(1)}%`;
}

function formatMs(ms: number): string {
  if (ms < 1000) {
    return `${Math.round(ms)}ms`;
  }

  return `${(ms / 1000).toFixed(3)}s`;
}

function formatDetail(detail: Record<string, unknown> | undefined): string {
  if (!detail || Object.keys(detail).length === 0) {
    return "";
  }

  return ` ${JSON.stringify(detail)}`;
}
