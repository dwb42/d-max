import { existsSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { env } from "../src/config/env.js";
import { diagnosticsDir } from "../src/diagnostics/chat-turns.js";
import type { ChatTurnDiagnosticEvent } from "../src/diagnostics/chat-turns.js";
import type { AppChatTurnTrace } from "../src/chat/turn-trace.js";

const args = parseArgs(process.argv.slice(2));
const db = new Database(env.databasePath);
const promptLog = args.promptLogId
  ? db.prepare("select id, conversation_id, openclaw_session_id, context_type, context_entity_id, created_at, turn_trace from app_prompt_logs where id = ?").get(args.promptLogId)
  : db.prepare("select id, conversation_id, openclaw_session_id, context_type, context_entity_id, created_at, turn_trace from app_prompt_logs where turn_trace is not null order by id desc limit 1").get();

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
