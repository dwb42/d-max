import { appendFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";

export type ChatTurnDiagnosticSource = "browser" | "api" | "openclaw" | "mcp";

export type ChatTurnDiagnosticEvent = {
  traceId: string;
  source: ChatTurnDiagnosticSource;
  event: string;
  ts: string;
  msFromTraceStart?: number;
  pid?: number;
  detail?: Record<string, unknown>;
};

export type ChatTurnDiagnosticContext = {
  traceId: string;
  traceStartedAt: string;
  conversationId?: number | null;
  promptLogId?: number | null;
  openClawSessionId?: string | null;
};

export function createChatTurnTraceId(prefix = "chat"): string {
  return `${prefix}-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${randomUUID().slice(0, 8)}`;
}

export function recordChatTurnDiagnosticEvent(input: {
  traceId: string;
  source: ChatTurnDiagnosticSource;
  event: string;
  traceStartedAt?: string | null;
  ts?: string;
  msFromTraceStart?: number;
  detail?: Record<string, unknown>;
}): void {
  if (!diagnosticsEnabled()) {
    return;
  }

  const ts = input.ts ?? new Date().toISOString();
  const msFromTraceStart = input.msFromTraceStart ?? (input.traceStartedAt ? Math.max(0, Date.parse(ts) - Date.parse(input.traceStartedAt)) : undefined);
  const event: ChatTurnDiagnosticEvent = {
    traceId: input.traceId,
    source: input.source,
    event: input.event,
    ts,
    pid: process.pid,
    ...(msFromTraceStart !== undefined ? { msFromTraceStart } : {}),
    ...(input.detail ? { detail: input.detail } : {})
  };

  try {
    const dir = diagnosticsDir();
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, `${ts.slice(0, 10)}.ndjson`), `${JSON.stringify(event)}\n`);
  } catch {
    // Diagnostics must never break product behavior.
  }
}

export function recordChatTurnDiagnosticEventForContext(
  context: ChatTurnDiagnosticContext | null | undefined,
  source: ChatTurnDiagnosticSource,
  event: string,
  detail?: Record<string, unknown>
): void {
  if (!context) {
    return;
  }

  recordChatTurnDiagnosticEvent({
    traceId: context.traceId,
    traceStartedAt: context.traceStartedAt,
    source,
    event,
    detail: {
      ...(context.conversationId ? { conversationId: context.conversationId } : {}),
      ...(context.promptLogId ? { promptLogId: context.promptLogId } : {}),
      ...(context.openClawSessionId ? { openClawSessionId: context.openClawSessionId } : {}),
      ...(detail ?? {})
    }
  });
}

export function diagnosticsDir(): string {
  return path.resolve(process.env.DMAX_CHAT_TURN_DIAGNOSTICS_DIR ?? "./data/diagnostics/chat-turns");
}

export function recordOpenClawLatencyTrace(input: {
  traceId?: string | null;
  conversationId?: number | null;
  sessionKey?: string | null;
  sessionId?: string | null;
  runId?: string | null;
  span: string;
  durationMs?: number;
  details?: Record<string, unknown>;
}): void {
  if (process.env.DMAX_OPENCLAW_LATENCY_TRACE !== "1") {
    return;
  }

  const wallTime = new Date().toISOString();
  const event = {
    traceId: input.traceId ?? null,
    conversationId: input.conversationId ?? null,
    sessionKey: input.sessionKey ?? null,
    sessionId: input.sessionId ?? null,
    runId: input.runId ?? null,
    span: input.span,
    ts: performance.now(),
    wallTime,
    pid: process.pid,
    ...(typeof input.durationMs === "number" ? { durationMs: input.durationMs } : {}),
    ...(input.details ? { details: input.details } : {})
  };

  try {
    const dir = path.resolve(process.env.DMAX_OPENCLAW_LATENCY_TRACE_DIR ?? "./data/diagnostics/openclaw-latency");
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, `${wallTime.slice(0, 10)}.ndjson`), `${JSON.stringify(event)}\n`);
  } catch {
    // Diagnostics must never break product behavior.
  }
}

function diagnosticsEnabled(): boolean {
  if (process.env.DMAX_CHAT_TURN_DIAGNOSTICS === "0") {
    return false;
  }

  return process.env.NODE_ENV !== "test" || Boolean(process.env.DMAX_CHAT_TURN_DIAGNOSTICS_DIR);
}
