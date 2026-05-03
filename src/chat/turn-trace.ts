import { createChatTurnTraceId, recordChatTurnDiagnosticEvent } from "../diagnostics/chat-turns.js";

export type AppChatTurnTraceEvent = {
  label: string;
  at: string;
  msFromStart: number;
  detail?: Record<string, unknown>;
};

export type OpenClawTrajectoryRunSummary = {
  runId: string;
  sessionStartedAt: string;
  modelCompletedAt: string | null;
  sessionEndedAt: string | null;
  preSessionDelayMs: number | null;
  sessionToModelCompletedMs: number | null;
  sessionToEndedMs: number | null;
  toolCount: number | null;
  usage: Record<string, unknown> | null;
};

export type OpenClawTrajectorySummary = {
  sessionId: string;
  trajectoryFile: string;
  runs: OpenClawTrajectoryRunSummary[];
};

export type AppChatTurnTrace = {
  version: 1;
  traceId: string;
  startedAt: string;
  completedAt: string | null;
  totalMs: number | null;
  events: AppChatTurnTraceEvent[];
  openClaw: OpenClawTrajectorySummary | null;
};

export function createTurnTrace(
  startedAt = new Date().toISOString(),
  firstLabel = "api_request_received",
  traceId = createChatTurnTraceId()
): AppChatTurnTrace {
  const trace: AppChatTurnTrace = {
    version: 1,
    traceId,
    startedAt,
    completedAt: null,
    totalMs: null,
    events: [],
    openClaw: null
  };
  addTurnTraceEventAt(trace, firstLabel, startedAt);
  return trace;
}

export function addTurnTraceEvent(trace: AppChatTurnTrace, label: string, detail?: Record<string, unknown>): void {
  const at = new Date().toISOString();
  addTurnTraceEventAt(trace, label, at, detail);
}

export function addTurnTraceEventAt(trace: AppChatTurnTrace, label: string, at: string, detail?: Record<string, unknown>): void {
  trace.events.push({
    label,
    at,
    msFromStart: Math.max(0, new Date(at).getTime() - new Date(trace.startedAt).getTime()),
    ...(detail ? { detail } : {})
  });
  recordChatTurnDiagnosticEvent({
    traceId: trace.traceId,
    traceStartedAt: trace.startedAt,
    source: "api",
    event: label,
    ts: at,
    detail
  });
}

export function completeTurnTrace(trace: AppChatTurnTrace): void {
  const completedAt = new Date().toISOString();
  trace.completedAt = completedAt;
  trace.totalMs = Math.max(0, new Date(completedAt).getTime() - new Date(trace.startedAt).getTime());
}

export function parseTurnTrace(value: string | null): AppChatTurnTrace | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as AppChatTurnTrace;
    if (parsed && parsed.version === 1 && !parsed.traceId) {
      parsed.traceId = createChatTurnTraceId("legacy-chat");
    }
    return parsed && parsed.version === 1 && Array.isArray(parsed.events) ? parsed : null;
  } catch {
    return null;
  }
}
