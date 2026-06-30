import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { env } from "../config/env.js";
import { recordOpenClawLatencyTrace } from "../diagnostics/chat-turns.js";
import type { ChatTurnDiagnosticContext } from "../diagnostics/chat-turns.js";
import type { OpenClawTrajectoryRunSummary, OpenClawTrajectorySummary } from "./turn-trace.js";

type OpenClawActivityOptions = {
  stateDir?: string;
};

export type OpenClawActivity = {
  id: string;
  kind: "tool_call" | "tool_result" | "plan" | "reasoning" | "research" | "workspace";
  status: "running" | "completed" | "failed";
  title: string;
  detail?: string;
  timestamp?: string;
  agentId?: string;
  toolName?: string;
  query?: string;
  url?: string;
  command?: string;
  service?: string;
  operation?: string;
  fileId?: string;
  spreadsheetId?: string;
  range?: string;
};

export type OpenClawResearchPage = {
  url: string;
  status?: string | null;
};

export type OpenClawResearchSummary = {
  agentId: "dmax-research";
  status: "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  searchCount: number;
  pageCount: number;
  queries: string[];
  pages: OpenClawResearchPage[];
};

export type OpenClawWorkspaceSummary = {
  agentId: "dmax-google-workspace";
  status: "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  operationCount: number;
  readCount: number;
  writeCount: number;
  operations: {
    service?: string | null;
    operation: string;
    fileId?: string | null;
    spreadsheetId?: string | null;
    range?: string | null;
    status?: string | null;
  }[];
};

export type OpenClawActivityCursor = {
  sessionId: string;
  initialFileSize: number;
  startedAt: string;
};

export function listOpenClawSessionActivities(sessionId: string, options: OpenClawActivityOptions = {}): OpenClawActivity[] {
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  return mergeActivities([
    ...readOpenClawSessionActivities(getOpenClawSessionFile(stateDir, sessionId), 0),
    ...readSubagentActivities(stateDir, "dmax-research", null),
    ...readSubagentActivities(stateDir, "dmax-google-workspace", null)
  ]);
}

export function createOpenClawActivityCursor(sessionId: string, options: OpenClawActivityOptions = {}): OpenClawActivityCursor {
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  return {
    sessionId,
    initialFileSize: getFileSize(getOpenClawSessionFile(stateDir, sessionId)),
    startedAt: new Date().toISOString()
  };
}

export function listOpenClawSessionActivitiesSince(
  cursor: OpenClawActivityCursor,
  options: OpenClawActivityOptions = {}
): OpenClawActivity[] {
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  return mergeActivities([
    ...readOpenClawSessionActivities(getOpenClawSessionFile(stateDir, cursor.sessionId), cursor.initialFileSize),
    ...readSubagentActivities(stateDir, "dmax-research", cursor.startedAt),
    ...readSubagentActivities(stateDir, "dmax-google-workspace", cursor.startedAt)
  ]);
}

export function summarizeOpenClawResearchActivities(activities: OpenClawActivity[]): OpenClawResearchSummary | null {
  const researchActivities = activities.filter((activity) => activity.agentId === "dmax-research" || activity.kind === "research");
  const queries = uniqueStrings(researchActivities.flatMap((activity) => activity.query ? [activity.query] : []));
  const pageUrls = uniqueStrings(researchActivities.flatMap((activity) => activity.url ? [activity.url] : []));
  const searchCount = researchActivities.filter((activity) => activity.toolName === "web_search" && activity.kind === "tool_call").length;
  const pageCount = researchActivities.filter((activity) => activity.toolName === "web_fetch" && activity.kind === "tool_call").length;

  if (researchActivities.length === 0 && queries.length === 0 && pageUrls.length === 0) {
    return null;
  }

  const startedAt = researchActivities.find((activity) => activity.kind === "research" && activity.status === "running")?.timestamp
    ?? firstTimestamp(researchActivities);
  const completed = [...researchActivities].reverse().find((activity) => activity.kind === "research" && activity.status !== "running");
  const failed = researchActivities.some((activity) => activity.status === "failed");

  return {
    agentId: "dmax-research",
    status: failed ? "failed" : completed ? "completed" : "running",
    startedAt: startedAt ?? null,
    completedAt: completed?.timestamp ?? null,
    searchCount,
    pageCount,
    queries,
    pages: pageUrls.map((url) => ({ url }))
  };
}

export function summarizeOpenClawWorkspaceActivities(activities: OpenClawActivity[]): OpenClawWorkspaceSummary | null {
  const workspaceActivities = activities.filter((activity) => activity.agentId === "dmax-google-workspace" || activity.kind === "workspace");
  if (workspaceActivities.length === 0) {
    return null;
  }

  const operationActivities = workspaceActivities.filter((activity) => activity.operation);
  const completed = [...workspaceActivities].reverse().find((activity) => activity.kind === "workspace" && activity.status !== "running");
  const failed = workspaceActivities.some((activity) => activity.status === "failed");
  const startedAt = workspaceActivities.find((activity) => activity.kind === "workspace" && activity.status === "running")?.timestamp
    ?? firstTimestamp(workspaceActivities);

  return {
    agentId: "dmax-google-workspace",
    status: failed ? "failed" : completed ? "completed" : "running",
    startedAt: startedAt ?? null,
    completedAt: completed?.timestamp ?? null,
    operationCount: operationActivities.length,
    readCount: operationActivities.filter((activity) => isGogReadOperation(activity.operation)).length,
    writeCount: operationActivities.filter((activity) => isGogWriteOperation(activity.operation)).length,
    operations: operationActivities.map((activity) => ({
      service: activity.service ?? null,
      operation: activity.operation ?? "gog",
      fileId: activity.fileId ?? null,
      spreadsheetId: activity.spreadsheetId ?? null,
      range: activity.range ?? null,
      status: activity.status
    }))
  };
}

export function readOpenClawTrajectorySummary(
  sessionId: string,
  options: OpenClawActivityOptions & { after?: string | null } = {}
): OpenClawTrajectorySummary | null {
  const startedAt = performance.now();
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const trajectoryFile = getOpenClawTrajectoryFile(stateDir, sessionId);
  if (!existsSync(trajectoryFile)) {
    return null;
  }

  let content: string;
  try {
    content = readFileSync(trajectoryFile, "utf8");
  } catch {
    return null;
  }

  const afterMs = options.after ? new Date(options.after).getTime() : null;
  const records = content
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJsonLine)
    .filter(isRecord);

  const runsById = new Map<string, OpenClawTrajectoryRunSummary>();
  for (const record of records) {
    const runId = typeof record.runId === "string" ? record.runId : null;
    if (!runId) {
      continue;
    }

    if (record.type === "session.started") {
      const ts = typeof record.ts === "string" ? record.ts : null;
      if (!ts) {
        continue;
      }
      if (afterMs !== null && new Date(ts).getTime() < afterMs) {
        continue;
      }

      runsById.set(runId, {
        runId,
        sessionStartedAt: ts,
        modelCompletedAt: null,
        sessionEndedAt: null,
        preSessionDelayMs: afterMs === null ? null : Math.max(0, new Date(ts).getTime() - afterMs),
        sessionToModelCompletedMs: null,
        sessionToEndedMs: null,
        toolCount: isRecord(record.data) && typeof record.data.toolCount === "number" ? record.data.toolCount : null,
        usage: null
      });
      continue;
    }

    const run = runsById.get(runId);
    if (!run) {
      continue;
    }

    if (record.type === "model.completed") {
      const ts = typeof record.ts === "string" ? record.ts : null;
      if (ts) {
        run.modelCompletedAt = ts;
        run.sessionToModelCompletedMs = Math.max(0, new Date(ts).getTime() - new Date(run.sessionStartedAt).getTime());
      }
      run.usage = isRecord(record.data) && isRecord(record.data.usage) ? record.data.usage : null;
    }

    if (record.type === "session.ended") {
      const ts = typeof record.ts === "string" ? record.ts : null;
      if (ts) {
        run.sessionEndedAt = ts;
        run.sessionToEndedMs = Math.max(0, new Date(ts).getTime() - new Date(run.sessionStartedAt).getTime());
      }
    }
  }

  const summary = {
    sessionId,
    trajectoryFile,
    runs: Array.from(runsById.values())
  };
  recordOpenClawLatencyTrace({
    sessionId,
    span: "dmax.trajectory.parse",
    durationMs: performance.now() - startedAt,
    details: { runCount: summary.runs.length }
  });
  return summary;
}

export function getFileSize(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0;
  }

  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

export function readCompletedSessionReply(
  sessionFile: string,
  initialFileSize: number,
  diagnostics?: ChatTurnDiagnosticContext,
  latencyDetails: Record<string, unknown> = {}
): { text: string; messageId?: string } | null {
  if (!existsSync(sessionFile)) {
    return null;
  }

  let content: Buffer;
  const readStartedAt = performance.now();
  try {
    content = readFileSync(sessionFile);
  } catch {
    return null;
  }
  latencyTrace(diagnostics, "dmax.session_file.read", {
    ...latencyDetails,
    bytes: content.length,
    initialFileSize
  }, performance.now() - readStartedAt);

  const parseStartedAt = performance.now();
  const newContent = (content.length >= initialFileSize ? content.subarray(initialFileSize) : content).toString("utf8");
  const records = newContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJsonLine)
    .filter(isRecord);

  const assistantCandidates = records
    .map((record, index) => ({ record, index }))
    .filter(({ record }) => isAssistantMessageRecord(record));
  if (assistantCandidates.length === 0) {
    return null;
  }

  let selectedAssistant: { record: Record<string, unknown>; index: number; text: string } | null = null;
  for (const candidate of assistantCandidates.slice().reverse()) {
    const text = extractAssistantRecordText(candidate.record);
    if (!text) {
      continue;
    }
    if (hasPendingExternalSubagentAt(records, candidate.index)) {
      continue;
    }
    selectedAssistant = { ...candidate, text };
    break;
  }

  if (!selectedAssistant) {
    return null;
  }

  latencyTrace(diagnostics, "dmax.session_file.assistant_found", {
    ...latencyDetails,
    recordCount: records.length,
    assistantRecords: assistantCandidates.length,
    replyChars: selectedAssistant.text.length
  }, performance.now() - parseStartedAt);
  return {
    text: selectedAssistant.text,
    messageId: typeof selectedAssistant.record.id === "string" ? selectedAssistant.record.id : undefined
  };
}

function latencyTrace(
  diagnostics: ChatTurnDiagnosticContext | null | undefined,
  span: string,
  details?: Record<string, unknown>,
  durationMs?: number
): void {
  recordOpenClawLatencyTrace({
    traceId: diagnostics?.traceId,
    conversationId: diagnostics?.conversationId ?? null,
    sessionKey: typeof details?.sessionKey === "string" ? details.sessionKey : diagnostics?.openClawSessionId,
    sessionId: typeof details?.sessionId === "string" ? details.sessionId : null,
    runId: typeof details?.runId === "string" ? details.runId : null,
    span,
    durationMs,
    details
  });
}

function hasPendingExternalSubagentAt(records: Record<string, unknown>[], candidateIndex: number): boolean {
  let pendingAnonymousSpawns = 0;
  const pendingSessionKeys = new Set<string>();

  for (let index = 0; index <= candidateIndex; index += 1) {
    const record = records[index];
    if (!record) {
      continue;
    }

    pendingAnonymousSpawns += externalSubagentSpawnCount(record);

    for (const childSessionKey of externalChildSessionKeysFromToolResult(record)) {
      if (pendingAnonymousSpawns > 0) {
        pendingAnonymousSpawns -= 1;
      }
      pendingSessionKeys.add(childSessionKey);
    }

    for (const completedSessionKey of externalCompletionSessionKeys(record)) {
      pendingSessionKeys.delete(completedSessionKey);
    }
  }

  return pendingAnonymousSpawns > 0 || pendingSessionKeys.size > 0;
}

function externalSubagentSpawnCount(record: Record<string, unknown>): number {
  if (!isAssistantMessageRecord(record) || !isRecord(record.message) || !Array.isArray(record.message.content)) {
    return 0;
  }

  return record.message.content.filter((part) => {
    if (!isRecord(part) || part.type !== "toolCall" || part.name !== "sessions_spawn" || !isRecord(part.arguments)) {
      return false;
    }
    return isExternalSubagentId(part.arguments.agentId);
  }).length;
}

function externalChildSessionKeysFromToolResult(record: Record<string, unknown>): string[] {
  if (record.type !== "message" || !isRecord(record.message) || record.message.role !== "toolResult") {
    return [];
  }

  return recordTextParts(record)
    .map((text) => parseJsonLine(text))
    .filter(isRecord)
    .map((value) => (typeof value.childSessionKey === "string" ? value.childSessionKey : null))
    .filter((value): value is string => Boolean(value && isExternalChildSessionKey(value)));
}

function externalCompletionSessionKeys(record: Record<string, unknown>): string[] {
  if (record.type !== "message" || !isRecord(record.message) || record.message.role !== "user") {
    return [];
  }

  return recordTextParts(record)
    .filter((text) => text.includes("[Internal task completion event]"))
    .map((text) => text.match(/session_key:\s*([^\s]+)/)?.[1] ?? null)
    .filter((value): value is string => Boolean(value && isExternalChildSessionKey(value)));
}

function recordTextParts(record: Record<string, unknown>): string[] {
  if (!isRecord(record.message) || !Array.isArray(record.message.content)) {
    return [];
  }

  return record.message.content
    .map((part) => (isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : null))
    .filter((value): value is string => Boolean(value));
}

function isExternalSubagentId(value: unknown): boolean {
  return value === "dmax-research" || value === "dmax-google-workspace";
}

function isExternalChildSessionKey(value: string): boolean {
  return value.includes("agent:dmax-research:") || value.includes("agent:dmax-google-workspace:");
}

export async function waitForCompletedSessionReply(
  sessionFile: string,
  initialFileSize: number,
  timeoutMs: number,
  diagnostics?: ChatTurnDiagnosticContext,
  latencyDetails: Record<string, unknown> = {}
): Promise<{ text: string; messageId?: string } | null> {
  const deadline = Date.now() + timeoutMs;
  do {
    const reply = readCompletedSessionReply(sessionFile, initialFileSize, diagnostics, latencyDetails);
    if (reply) {
      return reply;
    }
    await delay(100);
  } while (Date.now() < deadline);

  return readCompletedSessionReply(sessionFile, initialFileSize, diagnostics, latencyDetails);
}

export function readOpenClawSessionActivities(sessionFile: string, initialFileSize: number): OpenClawActivity[] {
  if (!existsSync(sessionFile)) {
    return [];
  }

  let content: Buffer;
  try {
    content = readFileSync(sessionFile);
  } catch {
    return [];
  }

  const newContent = (content.length >= initialFileSize ? content.subarray(initialFileSize) : content).toString("utf8");
  return newContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJsonLine)
    .filter(isRecord)
    .flatMap(activityFromSessionRecord)
    .slice(-24);
}

export function readSubagentActivities(stateDir: string, agentId: "dmax-research" | "dmax-google-workspace", after: string | null): OpenClawActivity[] {
  const sessionDir = path.join(stateDir, "agents", agentId, "sessions");
  if (!existsSync(sessionDir)) {
    return [];
  }

  const afterMs = after ? new Date(after).getTime() : null;
  const kind = agentId === "dmax-research" ? "research" : "workspace";
  const label = agentId === "dmax-research" ? "Webrecherche-Agent" : "Google-Workspace-Agent";
  const activities: OpenClawActivity[] = [];
  for (const fileName of safeReadDir(sessionDir)) {
    if (!fileName.endsWith(".trajectory.jsonl")) {
      continue;
    }

    const trajectoryFile = path.join(sessionDir, fileName);
    const records = readJsonLines(trajectoryFile);
    const started = records.find((record) => record.type === "session.started");
    const sessionId = typeof started?.sessionId === "string" ? started.sessionId : fileName.replace(/\.trajectory\.jsonl$/, "");
    const startedAt = typeof started?.ts === "string" ? started.ts : null;
    if (afterMs !== null && (!startedAt || new Date(startedAt).getTime() < afterMs)) {
      continue;
    }

    activities.push({
      id: `${agentId}-${sessionId}-started`,
      kind,
      status: "running",
      title: `${label} gestartet`,
      detail: agentId,
      timestamp: startedAt ?? undefined,
      agentId
    });

    const sessionFile = subagentSessionFileFromTrajectoryRecord(started, stateDir, agentId, sessionId);
    activities.push(...readOpenClawSessionActivities(sessionFile, 0).map((activity) => markSubagentActivity(activity, agentId)));
    activities.push(...readSubagentActivitiesFromTrajectorySnapshots(records, agentId, sessionId));

    const ended = [...records].reverse().find((record) => record.type === "session.ended");
    if (ended) {
      const status = isRecord(ended.data) && ended.data.status === "success" ? "completed" : "failed";
      activities.push({
        id: `${agentId}-${sessionId}-ended`,
        kind,
        status,
        title: status === "completed" ? `${label} abgeschlossen` : `${label} fehlgeschlagen`,
        timestamp: typeof ended.ts === "string" ? ended.ts : undefined,
        agentId
      });
    }
  }

  return mergeActivities(activities).slice(-48);
}

function readSubagentActivitiesFromTrajectorySnapshots(records: Record<string, unknown>[], agentId: "dmax-research" | "dmax-google-workspace", sessionId: string): OpenClawActivity[] {
  return records.flatMap((record) => {
    if (record.type !== "model.completed" || !isRecord(record.data) || !Array.isArray(record.data.messagesSnapshot)) {
      return [];
    }

    return record.data.messagesSnapshot
      .filter(isRecord)
      .flatMap((messageRecord, messageIndex) =>
        activityFromSessionRecord({
          type: "message",
          id: `${sessionId}-snapshot-${messageIndex}`,
          timestamp: typeof record.ts === "string" ? record.ts : undefined,
          message: messageRecord
        }).map((activity) => markSubagentActivity(activity, agentId))
      );
  });
}

function subagentSessionFileFromTrajectoryRecord(record: Record<string, unknown> | undefined, stateDir: string, agentId: "dmax-research" | "dmax-google-workspace", sessionId: string): string {
  if (record && isRecord(record.data) && typeof record.data.sessionFile === "string") {
    const sessionFile = record.data.sessionFile.replace("$OPENCLAW_STATE_DIR", stateDir);
    return path.isAbsolute(sessionFile) ? sessionFile : path.join(stateDir, sessionFile);
  }
  return path.join(stateDir, "agents", agentId, "sessions", `${sessionId}.jsonl`);
}

function markSubagentActivity(activity: OpenClawActivity, agentId: "dmax-research" | "dmax-google-workspace"): OpenClawActivity {
  return {
    ...activity,
    id: `${agentId}-${activity.id}`,
    agentId,
    ...(agentId === "dmax-google-workspace" ? inferGoogleWorkspaceActivity(activity) : {})
  };
}

export function mergeActivities(activities: OpenClawActivity[]): OpenClawActivity[] {
  const seen = new Set<string>();
  return activities
    .filter((activity) => {
      if (seen.has(activity.id)) {
        return false;
      }
      seen.add(activity.id);
      return true;
    })
    .sort((left, right) => (left.timestamp ?? "").localeCompare(right.timestamp ?? ""));
}

function safeReadDir(dir: string): string[] {
  try {
    return readdirSync(dir);
  } catch {
    return [];
  }
}

function readJsonLines(filePath: string): Record<string, unknown>[] {
  try {
    return readFileSync(filePath, "utf8")
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .map(parseJsonLine)
      .filter(isRecord);
  } catch {
    return [];
  }
}

function activityFromSessionRecord(record: Record<string, unknown>): OpenClawActivity[] {
  if (record.type !== "message" || !isRecord(record.message)) {
    return [];
  }

  const message = record.message;
  const timestamp = typeof record.timestamp === "string" ? record.timestamp : undefined;
  if (message.role === "toolResult") {
    const toolName = typeof message.toolName === "string" ? message.toolName : "tool";
    const isError = message.isError === true;
    const details = isRecord(message.details) ? message.details : null;
    const detail = summarizeToolResult(toolName, details);
    return [
      {
        id: `result-${String(message.toolCallId ?? record.id ?? cryptoRandomId())}`,
        kind: "tool_result",
        status: isError ? "failed" : "completed",
        title: `${formatToolName(toolName)} ${isError ? "fehlgeschlagen" : "abgeschlossen"}`,
        detail,
        timestamp,
        toolName,
        command: details ? extractCommand(details) : undefined,
        query: toolName === "web_search" && details && typeof details.query === "string" ? details.query : undefined,
        url: toolName === "web_fetch" && details
          ? typeof details.finalUrl === "string"
            ? details.finalUrl
            : typeof details.url === "string"
              ? details.url
              : undefined
          : undefined
      }
    ];
  }

  if (message.role !== "assistant" || !Array.isArray(message.content)) {
    return [];
  }

  return message.content
    .filter(isRecord)
    .flatMap((part, index): OpenClawActivity[] => {
      if (part.type === "toolCall" && typeof part.name === "string") {
        const args = isRecord(part.arguments) ? part.arguments : null;
        const command = args ? extractCommand(args) : undefined;
        return [
          {
            id: `call-${String(part.id ?? record.id ?? cryptoRandomId())}-${index}`,
            kind: part.name === "update_plan" ? "plan" : "tool_call",
            status: "running",
            title: part.name === "update_plan" ? "Plan aktualisiert" : `${formatToolName(part.name)} gestartet`,
            detail: summarizeToolArguments(part.name, args),
            timestamp,
            toolName: part.name,
            command,
            query: part.name === "web_search" && args && typeof args.query === "string" ? args.query : undefined,
            url: part.name === "web_fetch" && args && typeof args.url === "string" ? args.url : undefined
          } satisfies OpenClawActivity
        ];
      }

      return [];
    });
}

function summarizeToolArguments(toolName: string, args: Record<string, unknown> | null): string | undefined {
  if (!args) {
    return undefined;
  }

  if (isToolNamed(toolName, "updateInitiativeMarkdown")) {
    const id = typeof args.id === "number" || typeof args.id === "string" ? String(args.id) : null;
    const markdown = typeof args.markdown === "string" ? args.markdown : null;
    const length = markdown ? ` (${markdown.length} Zeichen)` : "";
    return `${id ? `Initiative ${id}: ` : ""}Markdown wird gespeichert${length}.`;
  }

  if (toolName === "web_search" && typeof args.query === "string") {
    return truncateActivityDetail(args.query);
  }

  if (toolName === "web_fetch" && typeof args.url === "string") {
    return truncateActivityDetail(args.url);
  }

  if (toolName === "update_plan" && Array.isArray(args.plan)) {
    return truncateActivityDetail(args.plan
      .filter(isRecord)
      .map((item) => (typeof item.step === "string" ? item.step : ""))
      .filter(Boolean)
      .join(" · "));
  }

  const firstString = Object.values(args).find((value) => typeof value === "string");
  return typeof firstString === "string" ? truncateActivityDetail(firstString) : undefined;
}

function summarizeToolResult(toolName: string, details: Record<string, unknown> | null): string | undefined {
  if (!details) {
    return undefined;
  }

  const tookMs = typeof details.tookMs === "number" ? ` · ${Math.round(details.tookMs / 100) / 10}s` : "";
  if (toolName === "web_search" && typeof details.query === "string") {
    return `${truncateActivityDetail(details.query)}${tookMs}`;
  }

  if (toolName === "web_fetch") {
    const status = typeof details.status === "number" ? `HTTP ${details.status}` : "fetch";
    const url = typeof details.finalUrl === "string" ? details.finalUrl : typeof details.url === "string" ? details.url : "";
    return truncateActivityDetail(`${status}${url ? ` · ${url}` : ""}${tookMs}`);
  }

  return tookMs ? tookMs.slice(3) : undefined;
}

function extractCommand(record: Record<string, unknown>): string | undefined {
  for (const key of ["command", "cmd", "input", "script"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function inferGoogleWorkspaceActivity(activity: OpenClawActivity): Partial<OpenClawActivity> {
  const command = activity.command ?? activity.detail;
  if (!command || !/\bgog\s+(drive|docs|sheets?|slides|forms|sites)\b/.test(command)) {
    return {};
  }
  const parsed = parseGogWorkspaceCommand(command);
  return parsed
    ? {
        command,
        service: parsed.service,
        operation: parsed.operation,
        fileId: parsed.fileId,
        spreadsheetId: parsed.service === "sheets" ? parsed.fileId : undefined,
        range: parsed.range
      }
    : { command, operation: "workspace" };
}

function parseGogWorkspaceCommand(command: string): { service: string; operation: string; fileId?: string; range?: string } | null {
  const tokens = shellLikeTokens(command);
  const gogIndex = tokens.findIndex((token) => token === "gog");
  if (gogIndex < 0) {
    return null;
  }
  const rawService = tokens[gogIndex + 1];
  const service = rawService === "sheet" ? "sheets" : rawService;
  if (!["drive", "docs", "sheets", "slides", "forms", "sites"].includes(service)) {
    return null;
  }
  const operation = tokens[gogIndex + 2];
  if (!operation) {
    return null;
  }
  const fileId = tokens[gogIndex + 3]?.startsWith("-") ? undefined : tokens[gogIndex + 3];
  const range = service === "sheets" && !tokens[gogIndex + 4]?.startsWith("-") ? tokens[gogIndex + 4] : undefined;
  return { service, operation, fileId, range };
}

function shellLikeTokens(command: string): string[] {
  return [...command.matchAll(/'([^']*)'|"([^"]*)"|(\S+)/g)].map((match) => match[1] ?? match[2] ?? match[3] ?? "");
}

function isGogReadOperation(operation: string | undefined): boolean {
  return Boolean(operation && ["get", "read", "show", "metadata", "info", "raw", "export", "download", "dl", "notes", "links", "hyperlinks"].includes(operation));
}

function isGogWriteOperation(operation: string | undefined): boolean {
  return Boolean(operation && ["create", "new", "update", "edit", "set", "append", "add", "insert", "clear", "format", "merge", "unmerge", "freeze", "add-tab", "rename-tab", "delete-tab"].includes(operation));
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function firstTimestamp(activities: OpenClawActivity[]): string | undefined {
  return activities.map((activity) => activity.timestamp).filter((value): value is string => Boolean(value)).sort()[0];
}

function formatToolName(name: string): string {
  const labels: Record<string, string> = {
    web_search: "Websuche",
    web_fetch: "Webseite lesen",
    update_plan: "Plan",
    getInitiative: "Beschreibung lesen",
    updateInitiativeMarkdown: "Beschreibung aktualisieren",
    updateInitiative: "Eintrag aktualisieren",
    createInitiative: "Eintrag erstellen",
    archiveInitiative: "Eintrag archivieren",
    listInitiatives: "Eintraege laden",
    listCategories: "Lebensbereiche laden",
    createCategory: "Lebensbereich erstellen",
    updateCategory: "Lebensbereich aktualisieren",
    listTasks: "Aufgaben laden",
    createTask: "Aufgabe erstellen",
    updateTask: "Aufgabe aktualisieren",
    completeTask: "Aufgabe abschliessen",
    deleteTask: "Aufgabe loeschen",
    listTaskChecklistItems: "Checkliste laden",
    createTaskChecklistItem: "Checklisteneintrag erstellen",
    updateTaskChecklistItem: "Checklisteneintrag aktualisieren",
    deleteTaskChecklistItem: "Checklisteneintrag loeschen",
    reorderTaskChecklistItems: "Checkliste sortieren"
  };
  const normalizedName = name.replace(/^d-max__/, "");
  return labels[name] ?? labels[normalizedName] ?? `DMAX ${normalizedName.replaceAll("_", " ")}`;
}

function isToolNamed(toolName: string, expectedName: string): boolean {
  return toolName === expectedName || toolName.endsWith(`__${expectedName}`) || toolName.endsWith(` ${expectedName}`);
}

function truncateActivityDetail(value: string, maxLength = 220): string {
  const compact = value.replace(/\s+/g, " ").trim();
  if (compact.length <= maxLength) {
    return compact;
  }

  return `${compact.slice(0, maxLength - 3).trimEnd()}...`;
}

function cryptoRandomId(): string {
  return Math.random().toString(36).slice(2);
}

function parseJsonLine(line: string): unknown {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isAssistantMessageRecord(value: Record<string, unknown>): boolean {
  if (value.type !== "message" || !isRecord(value.message)) {
    return false;
  }

  return value.message.role === "assistant";
}

function extractAssistantRecordText(record: Record<string, unknown>): string | null {
  if (!isRecord(record.message) || !Array.isArray(record.message.content)) {
    return null;
  }

  const text = record.message.content
    .map((part) => (isRecord(part) && part.type === "text" && typeof part.text === "string" ? part.text : ""))
    .filter(Boolean)
    .at(-1);

  return text ?? null;
}


function getOpenClawSessionFile(stateDir: string, sessionId: string): string {
  return path.join(stateDir, "agents", "main", "sessions", `${sessionId}.jsonl`);
}

function getOpenClawTrajectoryFile(stateDir: string, sessionId: string): string {
  return path.join(stateDir, "agents", "main", "sessions", `${sessionId}.trajectory.jsonl`);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
