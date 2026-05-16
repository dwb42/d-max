import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import type { AppChatTurnTrace } from "../src/chat/turn-trace.js";

const execFileAsync = promisify(execFile);

type Args = {
  apiUrl: string;
  project: string;
  simpleRuns: number;
  toolRuns: number;
  requestTimeoutMs: number;
  json: boolean;
};

type TimedResponse<T> = {
  body: T;
  wallMs: number;
};

type OpenClawStatusResponse = {
  openClaw?: {
    state?: string;
    detail?: string;
    checkedAt?: string;
  };
};

export type SanitizedModelStatus = {
  missingProvidersInUse: string[];
};

type ChatResponse = {
  reply?: string;
  conversationId?: number | null;
  activities?: Array<{ kind?: string; status?: string; title?: string }>;
};

type PromptTraceRow = {
  id: number;
  conversation_id: number | null;
  turn_trace: string | null;
};

export type ChatSample = {
  kind: "warmup" | "simple" | "tool";
  index: number;
  traceId: string;
  promptLogId: number;
  conversationId: number | null;
  wallMs: number;
  overheadMs: number | null;
  totalTraceMs: number | null;
  toolCount: number;
  activityToolCalls: number;
  activityToolResults: number;
  activityToolTitles: string[];
  runCount: number;
  replyLooksSuccessful: boolean;
};

type Summary = {
  apiUrl: string;
  project: string;
  healthMs: number;
  openClawStatusMs: number;
  openClawState: string;
  modelStatus: SanitizedModelStatus;
  warmup: ChatSample;
  simple: MetricGroup;
  tool: MetricGroup;
  samples: ChatSample[];
  passed: boolean;
  failures: string[];
};

export type MetricGroup = {
  count: number;
  wallP50Ms: number;
  wallP95Ms: number;
  overheadP50Ms: number | null;
  overheadP95Ms: number | null;
};

if (isMainModule()) {
  try {
    const args = parseArgs(process.argv.slice(2));
    const summary = await runValidation(args);
    if (args.json) {
      console.log(JSON.stringify(summary, null, 2));
    } else {
      printSummary(summary);
    }
    if (!summary.passed) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error(sanitizeOperationalText(error instanceof Error ? error.message : String(error)));
    process.exitCode = 1;
  }
}

async function runValidation(input: Args): Promise<Summary> {
  const health = await requestJson<{ ok?: boolean }>(`${input.apiUrl}/health`, {}, 10_000);
  if (health.body.ok !== true) {
    throw new Error(`/health did not return { ok: true } from ${input.apiUrl}.`);
  }

  const status = await requestJson<OpenClawStatusResponse>(`${input.apiUrl}/api/openclaw/status`, {}, 10_000);
  const openClawState = status.body.openClaw?.state ?? "unknown";
  if (openClawState !== "ready") {
    throw new Error(`/api/openclaw/status is not ready: ${JSON.stringify(sanitizeOpenClawStatus(status.body.openClaw ?? status.body))}`);
  }

  const modelStatus = await readOpenClawModelStatus(input.project);
  if (modelStatus.missingProvidersInUse.length > 0) {
    throw new Error(`OpenClaw model auth is incomplete. missingProvidersInUse=${JSON.stringify(modelStatus.missingProvidersInUse)}. Complete provider auth and backend device approval in dmax-openclaw before running chat latency validation.`);
  }

  const warmup = await runChatSample(input, {
    kind: "warmup",
    index: 1,
    message: "Production topology synthetic warmup. Do not use tools. Reply with exactly: OK"
  });

  const simple: ChatSample[] = [];
  for (let i = 1; i <= input.simpleRuns; i += 1) {
    simple.push(await runChatSample(input, {
      kind: "simple",
      index: i,
      message: "Production topology simple latency sample. Do not use tools. Reply with exactly: OK"
    }));
  }

  const tool: ChatSample[] = [];
  for (let i = 1; i <= input.toolRuns; i += 1) {
    tool.push(await runChatSample(input, {
      kind: "tool",
      index: i,
      message: "Use the d-max listCategories tool now. After the tool result returns, reply with exactly: TOOL_OK"
    }));
  }

  const samples = [warmup, ...simple, ...tool];
  const failures = validateSamples(warmup, simple, tool);
  return {
    apiUrl: input.apiUrl,
    project: input.project,
    healthMs: health.wallMs,
    openClawStatusMs: status.wallMs,
    openClawState,
    modelStatus,
    warmup,
    simple: metricGroup(simple),
    tool: metricGroup(tool),
    samples,
    passed: failures.length === 0,
    failures
  };
}

async function readOpenClawModelStatus(project: string): Promise<SanitizedModelStatus> {
  const result = await execFileAsync("docker", [
    "compose",
    "-p",
    project,
    "exec",
    "-T",
    "dmax-openclaw",
    "sh",
    "-lc",
    "OPENCLAW_CONFIG_PATH=/app/openclaw/config.production-512.json OPENCLAW_STATE_DIR=/app/data/openclaw-state openclaw models status --json"
  ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
  return sanitizeModelStatus(JSON.parse(result.stdout));
}

export function sanitizeModelStatus(value: unknown): SanitizedModelStatus {
  const missing = isRecord(value) && Array.isArray(value.missingProvidersInUse)
    ? value.missingProvidersInUse.filter(isString)
    : [];
  return {
    missingProvidersInUse: missing
  };
}

export function sanitizeOpenClawStatus(value: unknown): unknown {
  if (!isRecord(value)) {
    return value;
  }
  const sanitized: Record<string, unknown> = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    if (typeof nestedValue === "string") {
      sanitized[key] = sanitizeOperationalText(nestedValue);
    } else if (isRecord(nestedValue)) {
      sanitized[key] = sanitizeOpenClawStatus(nestedValue);
    } else {
      sanitized[key] = nestedValue;
    }
  }
  return sanitized;
}

export function sanitizeOperationalText(value: string): string {
  return value
    .replace(/requestId: [a-f0-9-]{20,}/gi, "requestId: <redacted>")
    .replace(/"requestId"\s*:\s*"[a-f0-9-]{20,}"/gi, "\"requestId\":\"<redacted>\"");
}

async function runChatSample(
  input: Args,
  sample: { kind: ChatSample["kind"]; index: number; message: string }
): Promise<ChatSample> {
  const traceId = `prod-topology-${sample.kind}-${Date.now()}-${sample.index}-${randomUUID().slice(0, 8)}`;
  const response = await requestJson<ChatResponse>(`${input.apiUrl}/api/chat/message`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-dmax-trace-id": traceId
    },
    body: JSON.stringify({
      message: sample.message,
      context: { type: "global" },
      source: "app_text"
    })
  }, input.requestTimeoutMs);

  const row = await readPromptTrace(input.project, traceId);
  const trace = parseTrace(row);
  const toolCount = totalToolCount(trace);
  const activityTools = response.body.activities?.filter((activity) => activity.kind === "tool_call" || activity.kind === "tool_result") ?? [];
  const activityToolCalls = activityTools.filter((activity) => activity.kind === "tool_call").length;
  const activityToolResults = activityTools.filter((activity) => activity.kind === "tool_result").length;
  const activityToolTitles = activityTools.map((activity) => activity.title).filter(isString);

  return {
    kind: sample.kind,
    index: sample.index,
    traceId,
    promptLogId: row.id,
    conversationId: response.body.conversationId ?? row.conversation_id,
    wallMs: response.wallMs,
    overheadMs: openClawOverheadMs(trace),
    totalTraceMs: trace.totalMs,
    toolCount,
    activityToolCalls,
    activityToolResults,
    activityToolTitles,
    runCount: trace.openClaw?.runs.length ?? 0,
    replyLooksSuccessful: !response.body.reply?.startsWith("Ich konnte den Agent-Turn nicht sauber abschließen:")
  };
}

async function requestJson<T>(url: string, options: RequestInit = {}, timeoutMs = 30_000): Promise<TimedResponse<T>> {
  const started = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    if (!response.ok) {
      throw new Error(`${options.method ?? "GET"} ${url} returned HTTP ${response.status}: ${text.slice(0, 400)}`);
    }
    return {
      body: text ? JSON.parse(text) as T : {} as T,
      wallMs: performance.now() - started
    };
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(`${options.method ?? "GET"} ${url} timed out after ${timeoutMs}ms. If this is the first chat turn, confirm OpenClaw provider auth and backend device approval are complete.`);
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function readPromptTrace(project: string, traceId: string): Promise<PromptTraceRow> {
  let lastError: Error | null = null;
  for (let attempt = 1; attempt <= 20; attempt += 1) {
    try {
      const query = `
const Database = require("better-sqlite3");
const db = new Database(process.env.DATABASE_PATH || "/app/data/dmax.sqlite");
const row = db.prepare("select id, conversation_id, turn_trace from app_prompt_logs where turn_trace like ? order by id desc limit 1").get(process.argv[1]);
if (!row) process.exit(2);
console.log(JSON.stringify(row));
`;
      const result = await execFileAsync("docker", [
        "compose",
        "-p",
        project,
        "exec",
        "-T",
        "dmax-api",
        "node",
        "-e",
        query,
        `%${traceId}%`
      ], { encoding: "utf8", maxBuffer: 1024 * 1024 });
      return JSON.parse(result.stdout) as PromptTraceRow;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      await delay(500);
    }
  }

  throw new Error(`Could not read persisted turn_trace for ${traceId} from dmax-api in compose project ${project}: ${lastError?.message ?? "unknown error"}`);
}

function parseTrace(row: PromptTraceRow): AppChatTurnTrace {
  if (!row.turn_trace) {
    throw new Error(`Prompt log #${row.id} has no turn_trace.`);
  }
  const trace = JSON.parse(row.turn_trace) as AppChatTurnTrace;
  if (!trace.traceId || !Array.isArray(trace.events)) {
    throw new Error(`Prompt log #${row.id} has an invalid turn_trace.`);
  }
  return trace;
}

export function openClawOverheadMs(trace: AppChatTurnTrace): number | null {
  const runs = trace.openClaw?.runs ?? [];
  if (runs.length === 0) {
    return null;
  }

  return runs.reduce((sum, run) => {
    const preSession = run.preSessionDelayMs ?? 0;
    const postModel = run.sessionToEndedMs !== null && run.sessionToModelCompletedMs !== null
      ? Math.max(0, run.sessionToEndedMs - run.sessionToModelCompletedMs)
      : 0;
    return sum + preSession + postModel;
  }, 0);
}

function totalToolCount(trace: AppChatTurnTrace): number {
  return (trace.openClaw?.runs ?? []).reduce((sum, run) => sum + (run.toolCount ?? 0), 0);
}

export function validateSamples(warmup: ChatSample, simple: ChatSample[], tool: ChatSample[]): string[] {
  const failures: string[] = [];
  for (const sample of [warmup, ...simple, ...tool]) {
    if (!sample.replyLooksSuccessful) {
      failures.push(`${sample.kind} #${sample.index} returned the DMAX agent error fallback.`);
    }
    if (sample.runCount === 0 || sample.overheadMs === null) {
      failures.push(`${sample.kind} #${sample.index} has no OpenClaw trajectory runs. Provider auth/device approval may be missing.`);
    }
  }

  if (warmup.wallMs >= 10_000) {
    failures.push(`Warmup wall time ${formatMs(warmup.wallMs)} is >= 10s.`);
  }

  for (const sample of simple) {
    if (sample.activityToolCalls !== 0) {
      failures.push(`simple #${sample.index} unexpectedly used tools.`);
    }
  }

  for (const sample of tool) {
    if (sample.activityToolCalls < 1) {
      failures.push(`tool #${sample.index} did not show a DMAX tool call.`);
    }
    if (!sample.activityToolTitles.some(isListCategoriesActivityTitle)) {
      failures.push(`tool #${sample.index} did not show the d-max__listCategories tool in chat activities.`);
    }
  }

  const simpleMetrics = metricGroup(simple);
  const toolMetrics = metricGroup(tool);
  if (simpleMetrics.overheadP50Ms !== null && simpleMetrics.overheadP50Ms >= 2_000) {
    failures.push(`Simple overhead P50 ${formatMs(simpleMetrics.overheadP50Ms)} is >= 2s.`);
  }
  if (simpleMetrics.overheadP95Ms !== null && simpleMetrics.overheadP95Ms >= 5_000) {
    failures.push(`Simple overhead P95 ${formatMs(simpleMetrics.overheadP95Ms)} is >= 5s.`);
  }
  if (simpleMetrics.wallP95Ms >= 6_000) {
    failures.push(`Simple total wall P95 ${formatMs(simpleMetrics.wallP95Ms)} is >= 6s.`);
  }
  if (toolMetrics.overheadP50Ms !== null && toolMetrics.overheadP50Ms >= 2_000) {
    failures.push(`Tool overhead P50 ${formatMs(toolMetrics.overheadP50Ms)} is >= 2s.`);
  }
  if (toolMetrics.overheadP95Ms !== null && toolMetrics.overheadP95Ms >= 5_000) {
    failures.push(`Tool overhead P95 ${formatMs(toolMetrics.overheadP95Ms)} is >= 5s.`);
  }
  if (toolMetrics.wallP95Ms >= 8_000) {
    failures.push(`Tool total wall P95 ${formatMs(toolMetrics.wallP95Ms)} is >= 8s.`);
  }

  return failures;
}

export function metricGroup(samples: ChatSample[]): MetricGroup {
  return {
    count: samples.length,
    wallP50Ms: percentile(samples.map((sample) => sample.wallMs), 0.5) ?? 0,
    wallP95Ms: percentile(samples.map((sample) => sample.wallMs), 0.95) ?? 0,
    overheadP50Ms: percentile(samples.map((sample) => sample.overheadMs).filter(isNumber), 0.5),
    overheadP95Ms: percentile(samples.map((sample) => sample.overheadMs).filter(isNumber), 0.95)
  };
}

function percentile(values: number[], p: number): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

function printSummary(summary: Summary): void {
  console.log(`Production topology validation: ${summary.passed ? "PASS" : "FAIL"}`);
  console.log(`API: ${summary.apiUrl}`);
  console.log(`Compose project: ${summary.project}`);
  console.log(`Health: ${formatMs(summary.healthMs)}`);
  console.log(`OpenClaw status: ${summary.openClawState} in ${formatMs(summary.openClawStatusMs)}`);
  console.log(`Model auth missing providers: ${summary.modelStatus.missingProvidersInUse.length ? summary.modelStatus.missingProvidersInUse.join(", ") : "none"}`);
  console.log(`Warmup: wall=${formatMs(summary.warmup.wallMs)} overhead=${formatNullableMs(summary.warmup.overheadMs)} runs=${summary.warmup.runCount}`);
  console.log(`Simple: n=${summary.simple.count} wall P50/P95=${formatMs(summary.simple.wallP50Ms)}/${formatMs(summary.simple.wallP95Ms)} overhead P50/P95=${formatNullableMs(summary.simple.overheadP50Ms)}/${formatNullableMs(summary.simple.overheadP95Ms)}`);
  console.log(`Tool: n=${summary.tool.count} wall P50/P95=${formatMs(summary.tool.wallP50Ms)}/${formatMs(summary.tool.wallP95Ms)} overhead P50/P95=${formatNullableMs(summary.tool.overheadP50Ms)}/${formatNullableMs(summary.tool.overheadP95Ms)}`);
  console.log("");
  console.log("Samples");
  for (const sample of summary.samples) {
    console.log([
      `${sample.kind} #${sample.index}`,
      `wall=${formatMs(sample.wallMs)}`,
      `overhead=${formatNullableMs(sample.overheadMs)}`,
      `runs=${sample.runCount}`,
      `tools=${sample.toolCount}`,
      `activities=${sample.activityToolCalls}/${sample.activityToolResults}`,
      `activityTitles=${sample.activityToolTitles.length ? sample.activityToolTitles.join("|") : "none"}`,
      `promptLog=${sample.promptLogId}`,
      `trace=${sample.traceId}`
    ].join("  "));
  }
  if (summary.failures.length > 0) {
    console.log("");
    console.log("Failures");
    for (const failure of summary.failures) {
      console.log(`- ${failure}`);
    }
  }
}

export function parseArgs(input: string[]): Args {
  const hostPort = process.env.DMAX_HOST_PORT ?? "49443";
  return {
    apiUrl: trimTrailingSlash(readStringFlag(input, "--api-url") ?? process.env.DMAX_VALIDATION_API_URL ?? `http://127.0.0.1:${hostPort}`),
    project: readStringFlag(input, "--project") ?? process.env.DMAX_VALIDATION_COMPOSE_PROJECT ?? "dmax-two-container-prodtopology",
    simpleRuns: readMinimumNumberFlag(input, "--simple-runs", 5) ?? 5,
    toolRuns: readMinimumNumberFlag(input, "--tool-runs", 5) ?? 5,
    requestTimeoutMs: readNumberFlag(input, "--timeout-ms") ?? 45_000,
    json: input.includes("--json")
  };
}

function readStringFlag(input: string[], flag: string): string | null {
  const index = input.indexOf(flag);
  return index === -1 ? null : input[index + 1] ?? null;
}

function readNumberFlag(input: string[], flag: string): number | null {
  const raw = readStringFlag(input, flag);
  if (!raw) {
    return null;
  }
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function readMinimumNumberFlag(input: string[], flag: string, minimum: number): number | null {
  const value = readNumberFlag(input, flag);
  if (value === null) {
    return null;
  }
  if (value < minimum) {
    throw new Error(`${flag} must be >= ${minimum} for production topology validation.`);
  }
  return value;
}

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

function formatNullableMs(value: number | null): string {
  return value === null ? "n/a" : formatMs(value);
}

function formatMs(value: number): string {
  return value < 1000 ? `${Math.round(value)}ms` : `${(value / 1000).toFixed(3)}s`;
}

function isNumber(value: number | null): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isListCategoriesActivityTitle(title: string): boolean {
  return title.includes("d-max__listCategories")
    || title.includes("listCategories")
    || title.includes("Lebensbereiche laden");
}

async function delay(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}
