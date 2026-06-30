import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { performance } from "node:perf_hooks";
import { pathToFileURL } from "node:url";
import { env } from "../config/env.js";
import { createChatTurnTraceId, recordChatTurnDiagnosticEvent, recordChatTurnDiagnosticEventForContext, recordOpenClawLatencyTrace } from "../diagnostics/chat-turns.js";
import type { ChatTurnDiagnosticContext } from "../diagnostics/chat-turns.js";
import {
  getFileSize,
  mergeActivities,
  readCompletedSessionReply,
  readOpenClawSessionActivities,
  readOpenClawTrajectorySummary,
  readSubagentActivities,
  waitForCompletedSessionReply
} from "./openclaw-activities.js";
export {
  createOpenClawActivityCursor,
  listOpenClawSessionActivities,
  listOpenClawSessionActivitiesSince,
  readOpenClawTrajectorySummary,
  summarizeOpenClawResearchActivities,
  summarizeOpenClawWorkspaceActivities
} from "./openclaw-activities.js";
export type {
  OpenClawActivity,
  OpenClawActivityCursor,
  OpenClawResearchPage,
  OpenClawResearchSummary,
  OpenClawWorkspaceSummary
} from "./openclaw-activities.js";
import type { OpenClawActivity } from "./openclaw-activities.js";

export type OpenClawAgentResult = {
  text: string;
  raw: unknown;
  activities: OpenClawActivity[];
  sessionId?: string | null;
  sessionKey?: string | null;
};

export type OpenClawGatewayStatus = {
  state: "ready" | "starting" | "unavailable";
  detail: string;
  checkedAt: string;
};

export type OpenClawGatewayProcessExit = {
  code: number | null;
  signal: NodeJS.Signals | null;
};

export type OpenClawPreparedSession = {
  key: string;
  sessionId: string | null;
  sessionFile: string | null;
  raw: unknown;
};

export type OpenClawAgentOptions = {
  configPath?: string;
  stateDir?: string;
  model?: string;
  sessionId?: string;
  timeoutSeconds?: number;
  readyTimeoutMs?: number;
  signal?: AbortSignal;
  diagnostics?: ChatTurnDiagnosticContext;
};

let gatewayProcess: ReturnType<typeof spawn> | null = null;
let gatewayStartPromise: Promise<void> | null = null;
let gatewayAgentWarmupPromise: Promise<void> | null = null;
let gatewayPrewarmPromise: Promise<void> | null = null;
let gatewayPrewarmCompletedKey: string | null = null;
let gatewayPrewarmFailedKey: string | null = null;
let gatewayClientModulePromise: Promise<OpenClawGatewayClientModuleWithPath> | null = null;
let gatewayConnection: OpenClawGatewayConnection | null = null;
let gatewayReadyUntil = 0;
const gatewayProcessExitHandlers = new Set<(exit: OpenClawGatewayProcessExit) => void>();
const preparedSessionsByKey = new Map<string, OpenClawPreparedSession>();
const preparedSessionPromisesByKey = new Map<string, Promise<OpenClawPreparedSession>>();
const GATEWAY_SESSION_FALLBACK_GRACE_MS = 60_000;
const GATEWAY_READY_DEADLINE_MS = 90_000;
const GATEWAY_HEALTH_TIMEOUT_MS = 3_000;
const GATEWAY_SESSION_CREATE_TIMEOUT_MS = 30_000;
const GATEWAY_READY_CACHE_MS = 60_000;
const SESSION_REPLY_WAIT_TIMEOUT_MS = 90_000;
const OPENCLAW_PREWARM_SESSION_KEY = "explicit:dmax-openclaw-warmup";
const OPENCLAW_PREWARM_SESSION_LABEL = "DMAX OpenClaw warmup";
const OPENCLAW_PREWARM_PROMPT = "System warmup. Do not use tools. Reply with exactly: OK";

export function resetOpenClawGatewayClientForTests(): void {
  if (env.nodeEnv !== "test") {
    throw new Error("resetOpenClawGatewayClientForTests is only available in test mode.");
  }

  gatewayClientModulePromise = null;
}

export function onOpenClawGatewayProcessExit(handler: (exit: OpenClawGatewayProcessExit) => void): () => void {
  gatewayProcessExitHandlers.add(handler);
  return () => {
    gatewayProcessExitHandlers.delete(handler);
  };
}

export function stopOpenClawGatewayProcess(signal: NodeJS.Signals = "SIGTERM"): void {
  if (!gatewayProcess || gatewayProcess.killed || gatewayProcess.exitCode !== null) {
    return;
  }

  gatewayProcess.kill(signal);
}

export function resetOpenClawGatewayConnectionForTests(): void {
  if (env.nodeEnv !== "test") {
    throw new Error("resetOpenClawGatewayConnectionForTests is only available in test mode.");
  }

  invalidateOpenClawGatewayConnection();
  gatewayReadyUntil = 0;
}

type OpenClawGatewayClientModule = {
  GatewayClient: new (options: OpenClawGatewayClientOptions) => OpenClawGatewayClient;
};

type OpenClawGatewayClientModuleWithPath = OpenClawGatewayClientModule & {
  modulePath: string;
};

type OpenClawGatewayClientOptions = {
  url: string;
  token?: string;
  clientName: string;
  clientDisplayName: string;
  clientVersion: string;
  mode: string;
  role: string;
  scopes: string[];
  minProtocol: number;
  maxProtocol: number;
  onHelloOk: (hello: unknown) => void | Promise<void>;
  onClose: (code: number, reason: string) => void;
  onConnectError: (error: Error) => void;
};

type OpenClawGatewayClient = {
  start: () => void;
  stop: () => void;
  request: (method: string, params: unknown, options?: { expectFinal?: boolean; timeoutMs?: number | null }) => Promise<unknown>;
};

type OpenClawGatewayConnection = {
  client: OpenClawGatewayClient;
  ready: Promise<void>;
  stateDir: string;
  gatewayUrl: string;
  closed: boolean;
  closeError: Error | null;
};

type RuntimeOpenClawConfigPreparation = {
  path: string;
  changed: boolean;
};

export async function runOpenClawAgentTurn(message: string, options: OpenClawAgentOptions = {}): Promise<OpenClawAgentResult> {
  const timeoutSeconds = options.timeoutSeconds ?? env.dmaxOpenClawTimeoutSeconds;
  const sessionId = options.sessionId ?? env.dmaxOpenClawSessionId;
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  const model = options.model ?? env.dmaxOpenClawModel;
  const diagnostics = options.diagnostics;
  traceOpenClaw(diagnostics, "openclaw_turn_entered", { sessionId, model, timeoutSeconds });
  traceOpenClaw(diagnostics, "openclaw_stale_lock_cleanup_started");
  clearStaleOpenClawRuntimeLocks(stateDir);
  traceOpenClaw(diagnostics, "openclaw_stale_lock_cleanup_finished");
  traceOpenClaw(diagnostics, "openclaw_warmup_wait_started");
  await waitForOpenClawAgentWarmup();
  traceOpenClaw(diagnostics, "openclaw_warmup_wait_finished");

  try {
    traceOpenClaw(diagnostics, "openclaw_gateway_responsive_check_started");
    await ensureResponsiveOpenClawGateway({ configPath, stateDir, diagnostics });
    traceOpenClaw(diagnostics, "openclaw_gateway_responsive_check_finished");
    await prewarmOpenClawGatewayOnce({ configPath, stateDir, diagnostics });
    traceOpenClaw(diagnostics, "openclaw_agent_gateway_turn_started");
    return await runOpenClawGatewayTurn(message, {
      configPath,
      stateDir,
      model,
      sessionId,
      timeoutSeconds,
      signal: options.signal,
      diagnostics
    });
  } catch (error) {
    if (isGatewayUnavailableError(error)) {
      traceOpenClaw(diagnostics, "openclaw_gateway_restart_started", { reason: error instanceof Error ? error.message : String(error) });
      await restartOpenClawGateway({ configPath, stateDir, diagnostics });
      traceOpenClaw(diagnostics, "openclaw_gateway_restart_finished");
      await prewarmOpenClawGatewayOnce({ configPath, stateDir, diagnostics });
      return await retryOpenClawGatewayTurn(message, {
        configPath,
        stateDir,
        model,
        sessionId,
        timeoutSeconds,
        signal: options.signal,
        diagnostics
      });
    }
    traceOpenClaw(diagnostics, "openclaw_turn_failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function warmOpenClawGateway(options: Pick<OpenClawAgentOptions, "configPath" | "stateDir"> = {}): Promise<void> {
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  clearStaleOpenClawRuntimeLocks(stateDir);
  gatewayAgentWarmupPromise ??= (async () => {
    await ensureOpenClawGateway({ configPath, stateDir, readyTimeoutMs: GATEWAY_READY_DEADLINE_MS });
    await prewarmOpenClawGatewayOnce({ configPath, stateDir });
  })().finally(() => {
    gatewayAgentWarmupPromise = null;
  });
  await gatewayAgentWarmupPromise;
}

export async function runOpenClawSessionTurn(
  message: string,
  input: { sessionKey: string; label?: string | null },
  options: OpenClawAgentOptions = {}
): Promise<OpenClawAgentResult> {
  const timeoutSeconds = options.timeoutSeconds ?? env.dmaxOpenClawTimeoutSeconds;
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  const model = options.model ?? env.dmaxOpenClawModel;
  const diagnostics = options.diagnostics;
  traceOpenClaw(diagnostics, "openclaw_session_turn_entered", {
    sessionKey: input.sessionKey,
    model,
    timeoutSeconds
  });
  traceOpenClaw(diagnostics, "openclaw_stale_lock_cleanup_started");
  clearStaleOpenClawRuntimeLocks(stateDir);
  traceOpenClaw(diagnostics, "openclaw_stale_lock_cleanup_finished");
  traceOpenClaw(diagnostics, "openclaw_warmup_wait_started");
  await waitForOpenClawAgentWarmup();
  traceOpenClaw(diagnostics, "openclaw_warmup_wait_finished");

  try {
    traceOpenClaw(diagnostics, "openclaw_gateway_responsive_check_skipped_for_prepared_session_turn");
    return await runOpenClawGatewaySessionTurn(message, input, {
      configPath,
      stateDir,
      model,
      timeoutSeconds,
      signal: options.signal,
      diagnostics
    });
  } catch (error) {
    if (isGatewayUnavailableError(error)) {
      traceOpenClaw(diagnostics, "openclaw_gateway_restart_started", { reason: error instanceof Error ? error.message : String(error) });
      await restartOpenClawGateway({ configPath, stateDir, diagnostics });
      traceOpenClaw(diagnostics, "openclaw_gateway_restart_finished");
      await prewarmOpenClawGatewayOnce({ configPath, stateDir, diagnostics });
      return await runOpenClawGatewaySessionTurn(message, input, {
        configPath,
        stateDir,
        model,
        timeoutSeconds,
        signal: options.signal,
        diagnostics
      });
    }
    traceOpenClaw(diagnostics, "openclaw_turn_failed", { error: error instanceof Error ? error.message : String(error) });
    throw error;
  }
}

export async function prepareOpenClawSession(
  input: { key: string; label?: string | null; model?: string | null },
  options: Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "diagnostics"> = {}
): Promise<OpenClawPreparedSession> {
  traceOpenClaw(options.diagnostics, "openclaw_session_prepare_started", {
    sessionKey: input.key
  });
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  const cached = getCachedPreparedSession(stateDir, input.key);
  if (cached) {
    if (isExternalOpenClawGatewayConfigured() || isOpenClawGatewayPortBound()) {
      traceOpenClaw(options.diagnostics, "openclaw_sessions_create_skipped_cached", {
        sessionKey: input.key,
        sessionId: cached.sessionId
      });
      traceOpenClaw(options.diagnostics, "openclaw_session_prepare_finished", {
        sessionKey: input.key,
        sessionId: cached.sessionId,
        source: "cache"
      });
      return cached;
    }

    forgetCachedPreparedSession(stateDir, input.key, cached);
    traceOpenClaw(options.diagnostics, "openclaw_sessions_cache_invalidated_gateway_unbound", {
      sessionKey: input.key,
      sessionId: cached.sessionId
    });
  }

  const promiseKey = `${stateDir}:${input.key}`;
  const existingPromise = preparedSessionPromisesByKey.get(promiseKey);
  if (existingPromise) {
    traceOpenClaw(options.diagnostics, "openclaw_sessions_create_joined_inflight", {
      sessionKey: input.key
    });
    const prepared = await existingPromise;
    traceOpenClaw(options.diagnostics, "openclaw_session_prepare_finished", {
      sessionKey: input.key,
      sessionId: prepared.sessionId,
      source: "inflight"
    });
    return prepared;
  }

  const promise = createOpenClawSession(input, { configPath, stateDir, diagnostics: options.diagnostics }).finally(() => {
    preparedSessionPromisesByKey.delete(promiseKey);
  });
  preparedSessionPromisesByKey.set(promiseKey, promise);
  const prepared = await promise;
  traceOpenClaw(options.diagnostics, "openclaw_session_prepare_finished", {
    sessionKey: input.key,
    sessionId: prepared.sessionId,
    source: "created"
  });
  return prepared;
}

async function createOpenClawSession(
  input: { key: string; label?: string | null; model?: string | null },
  options: Required<Pick<OpenClawAgentOptions, "configPath" | "stateDir">> & { diagnostics?: ChatTurnDiagnosticContext }
): Promise<OpenClawPreparedSession> {
  await ensureResponsiveOpenClawGateway({
    configPath: options.configPath,
    stateDir: options.stateDir,
    diagnostics: options.diagnostics
  });
  const parsed = await callOpenClawGateway(
    "sessions.create",
    {
      key: input.key,
      ...(input.label ? { label: input.label } : {}),
      ...(input.model ? { model: input.model } : {})
    },
    {
      stateDir: options.stateDir,
      timeoutMs: GATEWAY_SESSION_CREATE_TIMEOUT_MS,
      diagnostics: options.diagnostics
    }
  );
  markOpenClawGatewayReady();
  const prepared = {
    key: extractPreparedSessionKey(parsed) ?? input.key,
    sessionId: extractPreparedSessionId(parsed),
    sessionFile: normalizeOpenClawSessionFile(options.stateDir, extractPreparedSessionId(parsed), extractPreparedSessionFile(parsed)),
    raw: parsed
  };
  cachePreparedSession(input.key, options.stateDir, prepared);
  return prepared;
}

export async function warmOpenClawGatewayForDev(
  options: Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "readyTimeoutMs"> = {}
): Promise<void> {
  await warmOpenClawGatewayForRuntime(options);
}

export async function warmOpenClawGatewayForProduction(
  options: Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "readyTimeoutMs"> = {}
): Promise<void> {
  await warmOpenClawGatewayForRuntime(options);
}

async function warmOpenClawGatewayForRuntime(
  options: Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "readyTimeoutMs"> = {}
): Promise<void> {
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  clearStaleOpenClawRuntimeLocks(stateDir);
  await ensureOpenClawGateway({
    configPath,
    stateDir,
    readyTimeoutMs: options.readyTimeoutMs ?? 5 * 60_000
  });
  await prewarmOpenClawGatewayOnce({ configPath, stateDir });
}

export async function prewarmOpenClawGatewayOnce(
  options: Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "diagnostics"> = {}
): Promise<void> {
  if (!env.dmaxOpenClawPrewarm) {
    return;
  }

  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  const gatewayKey = resolveOpenClawGatewayPrewarmKey(stateDir);
  if (gatewayPrewarmCompletedKey === gatewayKey) {
    traceOpenClaw(options.diagnostics, "openclaw_prewarm_skipped_completed", {
      sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
      gatewayKey
    });
    return;
  }
  if (gatewayPrewarmFailedKey === gatewayKey) {
    traceOpenClaw(options.diagnostics, "openclaw_prewarm_skipped_failed", {
      sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
      gatewayKey
    });
    return;
  }
  if (gatewayPrewarmPromise) {
    traceOpenClaw(options.diagnostics, "openclaw_prewarm_joined_inflight", {
      sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
      gatewayKey
    });
    await gatewayPrewarmPromise;
    return;
  }

  gatewayPrewarmPromise = runOpenClawGatewayPrewarm({
    configPath,
    stateDir,
    gatewayKey,
    parentDiagnostics: options.diagnostics
  }).finally(() => {
    gatewayPrewarmPromise = null;
  });
  await gatewayPrewarmPromise;
}

export async function checkOpenClawGatewayStatus(
  options: Pick<OpenClawAgentOptions, "stateDir"> = {}
): Promise<OpenClawGatewayStatus> {
  const checkedAt = new Date().toISOString();
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;

  if (!isExternalOpenClawGatewayConfigured() && !isOpenClawGatewayPortBound()) {
    return {
      state: "unavailable",
      detail: "OpenClaw gateway is not listening on port 18789.",
      checkedAt
    };
  }

  try {
    await callOpenClawGateway("health", {}, { stateDir, timeoutMs: GATEWAY_HEALTH_TIMEOUT_MS });
    markOpenClawGatewayReady();
    return {
      state: "ready",
      detail: "OpenClaw gateway health check succeeded.",
      checkedAt
    };
  } catch (error) {
    markOpenClawGatewayNotReady();
    return {
      state: "starting",
      detail: error instanceof Error ? error.message : "OpenClaw gateway is listening but not responsive yet.",
      checkedAt
    };
  }
}

async function waitForOpenClawAgentWarmup(): Promise<void> {
  if (!gatewayAgentWarmupPromise) {
    return;
  }

  try {
    await Promise.race([gatewayAgentWarmupPromise, delay(2_000)]);
  } catch {
    // The real user turn below will surface an actionable OpenClaw error if the gateway still fails.
  }
}

async function ensureResponsiveOpenClawGateway(options: { configPath: string; stateDir: string; diagnostics?: ChatTurnDiagnosticContext }): Promise<void> {
  if (isExternalOpenClawGatewayConfigured()) {
    try {
      await callOpenClawGateway("health", {}, { stateDir: options.stateDir, timeoutMs: GATEWAY_HEALTH_TIMEOUT_MS, diagnostics: options.diagnostics });
      markOpenClawGatewayReady();
      return;
    } catch {
      markOpenClawGatewayNotReady();
      throw new Error("External OpenClaw gateway is not responsive yet.");
    }
  }

  if (!isOpenClawGatewayPortBound()) {
    traceOpenClaw(options.diagnostics, "openclaw_gateway_port_unbound");
    await ensureOpenClawGateway({ ...options, readyTimeoutMs: GATEWAY_READY_DEADLINE_MS });
    markOpenClawGatewayReady();
    return;
  }

  if (hasFreshOpenClawGatewayReady()) {
    traceOpenClaw(options.diagnostics, "openclaw_gateway_responsive_check_skipped_cached_ready", {
      cacheMsRemaining: Math.max(0, gatewayReadyUntil - Date.now())
    });
    return;
  }

  try {
    await callOpenClawGateway("health", {}, { stateDir: options.stateDir, timeoutMs: GATEWAY_HEALTH_TIMEOUT_MS, diagnostics: options.diagnostics });
    markOpenClawGatewayReady();
  } catch {
    markOpenClawGatewayNotReady();
    throw new Error("OpenClaw gateway is listening but not responsive yet.");
  }
}

async function ensureOpenClawGateway(options: { configPath: string; stateDir: string; readyTimeoutMs: number; diagnostics?: ChatTurnDiagnosticContext }): Promise<void> {
  if (gatewayStartPromise) {
    traceOpenClaw(options.diagnostics, "openclaw_gateway_start_join_existing");
    return gatewayStartPromise;
  }

  gatewayStartPromise = startOpenClawGateway(options).finally(() => {
    gatewayStartPromise = null;
  });
  return gatewayStartPromise;
}

async function restartOpenClawGateway(options: { configPath: string; stateDir: string; diagnostics?: ChatTurnDiagnosticContext }): Promise<void> {
  if (isExternalOpenClawGatewayConfigured()) {
    invalidateOpenClawGatewayConnection();
    gatewayPrewarmCompletedKey = null;
    gatewayPrewarmFailedKey = null;
    await ensureOpenClawGateway({ ...options, readyTimeoutMs: GATEWAY_READY_DEADLINE_MS });
    return;
  }

  if (gatewayProcess && !gatewayProcess.killed && gatewayProcess.exitCode === null) {
    try {
      traceOpenClaw(options.diagnostics, "openclaw_gateway_process_kill_started");
      gatewayProcess.kill("SIGKILL");
      traceOpenClaw(options.diagnostics, "openclaw_gateway_process_kill_sent");
    } catch {
      // startOpenClawGateway runs with --force and also handles stale listeners.
    }
  }
  gatewayProcess = null;
  gatewayStartPromise = null;
  invalidateOpenClawGatewayConnection();
  markOpenClawGatewayNotReady();
  gatewayPrewarmCompletedKey = null;
  gatewayPrewarmFailedKey = null;
  await ensureOpenClawGateway({ ...options, readyTimeoutMs: GATEWAY_READY_DEADLINE_MS });
}

async function startOpenClawGateway(options: { configPath: string; stateDir: string; readyTimeoutMs: number; diagnostics?: ChatTurnDiagnosticContext }): Promise<void> {
  if (isExternalOpenClawGatewayConfigured()) {
    traceOpenClaw(options.diagnostics, "openclaw_external_gateway_wait_ready_started", {
      gatewayUrl: resolveOpenClawGatewayHttpUrl()
    });
    await waitForOpenClawGateway(options);
    traceOpenClaw(options.diagnostics, "openclaw_external_gateway_wait_ready_finished");
    return;
  }

  traceOpenClaw(options.diagnostics, "openclaw_gateway_runtime_config_prepare_started");
  const runtimeConfig = prepareRuntimeOpenClawConfig(options.configPath, options.stateDir);
  traceOpenClaw(options.diagnostics, "openclaw_gateway_runtime_config_prepare_finished", {
    runtimeConfigPath: runtimeConfig.path,
    runtimeConfigChanged: runtimeConfig.changed
  });
  if (isOpenClawGatewayPortBound()) {
    const shouldRestartBoundGateway = runtimeConfig.changed || !isManagedOpenClawGatewayProcessRunning();
    if (shouldRestartBoundGateway) {
      traceOpenClaw(options.diagnostics, "openclaw_gateway_runtime_config_drift_restart_started");
      await stopOpenClawGatewayListeners(options.diagnostics);
      traceOpenClaw(options.diagnostics, "openclaw_gateway_runtime_config_drift_restart_finished");
    }
  }
  if (isOpenClawGatewayPortBound()) {
    traceOpenClaw(options.diagnostics, "openclaw_gateway_existing_port_wait_started");
    await waitForOpenClawGateway(options);
    traceOpenClaw(options.diagnostics, "openclaw_gateway_existing_port_wait_finished");
    return;
  }
  gatewayProcess = null;

  traceOpenClaw(options.diagnostics, "openclaw_gateway_process_spawn_started");
  gatewayProcess = spawn(
    "openclaw",
    ["gateway", "run", "--force", "--port", "18789", "--auth", "none", "--bind", "loopback"],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: runtimeConfig.path,
        OPENCLAW_STATE_DIR: options.stateDir,
        OPENCLAW_DISABLE_BONJOUR: "1",
        OPENCLAW_CODEX_DISCOVERY_LIVE: "0",
        DMAX_OPENCLAW_AUTO_YIELD_AFTER_SPAWN: "1",
        DMAX_OPENCLAW_EARLY_PRUNE_LOCAL_TOOLS: "1",
        // OpenClaw 2026.4.26 uses its Vitest/test-runtime guard only to skip the
        // gateway model-pricing refresh unless OPENCLAW_TEST_MINIMAL_GATEWAY is set.
        // The pricing refresh blocks startup on two 60s network timeouts in local DMAX.
        NODE_ENV: "test"
      },
      stdio: ["ignore", "ignore", "ignore"]
    }
  );
  const spawnedGatewayProcess = gatewayProcess;
  spawnedGatewayProcess.on("exit", (code, signal) => {
    if (gatewayProcess === spawnedGatewayProcess) {
      gatewayProcess = null;
    }
    markOpenClawGatewayNotReady();
    for (const handler of gatewayProcessExitHandlers) {
      handler({ code, signal });
    }
  });
  gatewayProcess.unref();
  traceOpenClaw(options.diagnostics, "openclaw_gateway_process_spawned", { pid: gatewayProcess.pid ?? null });

  traceOpenClaw(options.diagnostics, "openclaw_gateway_wait_ready_started");
  await waitForOpenClawGateway(options);
  traceOpenClaw(options.diagnostics, "openclaw_gateway_wait_ready_finished");
}

function isOpenClawGatewayPortBound(): boolean {
  return getOpenClawGatewayListenerPids().length > 0;
}

function getOpenClawGatewayListenerPids(): number[] {
  try {
    const output = execFileSync("lsof", ["-ti", "tcp:18789", "-sTCP:LISTEN"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output
      .split(/\s+/)
      .map((value) => Number.parseInt(value, 10))
      .filter((pid) => Number.isInteger(pid) && pid > 0);
  } catch {
    return [];
  }
}

function isManagedOpenClawGatewayProcessRunning(): boolean {
  return Boolean(gatewayProcess && !gatewayProcess.killed && gatewayProcess.exitCode === null);
}

async function stopOpenClawGatewayListeners(diagnostics?: ChatTurnDiagnosticContext): Promise<void> {
  const pids = new Set(getOpenClawGatewayListenerPids());
  if (gatewayProcess?.pid) {
    pids.add(gatewayProcess.pid);
  }

  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
      traceOpenClaw(diagnostics, "openclaw_gateway_listener_kill_sent", { pid });
    } catch (error) {
      traceOpenClaw(diagnostics, "openclaw_gateway_listener_kill_failed", {
        pid,
        error: error instanceof Error ? error.message : String(error)
      });
    }
  }
  gatewayProcess = null;
  gatewayStartPromise = null;
  gatewayPrewarmCompletedKey = null;
  gatewayPrewarmFailedKey = null;
  markOpenClawGatewayNotReady();

  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    if (!isOpenClawGatewayPortBound()) {
      return;
    }
    await delay(100);
  }
}

function isExternalOpenClawGatewayConfigured(): boolean {
  return Boolean(env.dmaxOpenClawGatewayUrl?.trim());
}

function resolveOpenClawGatewayHttpUrl(): string {
  return env.dmaxOpenClawGatewayUrl?.trim() || "http://127.0.0.1:18789";
}

function resolveOpenClawGatewayWsUrl(): string {
  const configured = resolveOpenClawGatewayHttpUrl();
  if (configured.startsWith("ws://") || configured.startsWith("wss://")) {
    return configured;
  }

  const parsed = new URL(configured);
  parsed.protocol = parsed.protocol === "https:" ? "wss:" : "ws:";
  return parsed.toString().replace(/\/$/, "");
}

function prepareRuntimeOpenClawConfig(configPath: string, stateDir: string): RuntimeOpenClawConfigPreparation {
  const runtimeConfigPath = path.join(stateDir, "config.web.runtime.json");
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
  seedOpenClawWebModelPricing(parsed);

  if (isRecord(parsed.gateway)) {
    const gateway = { ...parsed.gateway };
    if (isRecord(gateway.auth)) {
      const auth = { ...gateway.auth };
      delete auth.token;
      gateway.auth = auth;
    }
    delete gateway.tailscale;
    parsed.gateway = gateway;
  }

  const existingMeta = readOpenClawRuntimeConfigMeta(runtimeConfigPath) ?? readOpenClawRuntimeConfigMeta(`${runtimeConfigPath}.last-good`);
  parsed.meta = existingMeta ?? {
    lastTouchedVersion: "DMAX",
    lastTouchedAt: new Date().toISOString()
  };

  mkdirSync(path.dirname(runtimeConfigPath), { recursive: true });
  if (runtimeConfigMatches(runtimeConfigPath, parsed)) {
    return { path: runtimeConfigPath, changed: false };
  }

  writeFileSync(runtimeConfigPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  return { path: runtimeConfigPath, changed: true };
}

function seedOpenClawWebModelPricing(config: Record<string, unknown>): void {
  const webModelId = "gpt-5.5";
  const providerId = "openai-codex";
  const zeroCost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
  const seededModel = {
    id: webModelId,
    name: "GPT-5.5",
    api: "openai-codex-responses",
    reasoning: true,
    input: ["text", "image"],
    cost: zeroCost,
    contextWindow: 400000,
    maxTokens: 128000
  };

  const models = isRecord(config.models) ? { ...config.models } : {};
  const providers = isRecord(models.providers) ? { ...models.providers } : {};
  const provider = isRecord(providers[providerId]) ? { ...providers[providerId] } : {};
  const configuredModels = Array.isArray(provider.models) ? provider.models.filter(isRecord) : [];

  provider.baseUrl = typeof provider.baseUrl === "string" && provider.baseUrl.trim() ? provider.baseUrl : "https://chatgpt.com/backend-api";
  provider.api = typeof provider.api === "string" && provider.api.trim() ? provider.api : "openai-codex-responses";
  provider.auth = typeof provider.auth === "string" && provider.auth.trim() ? provider.auth : "oauth";
  provider.models = configuredModels.some((model) => model.id === webModelId)
    ? configuredModels.map((model) =>
        model.id === webModelId
          ? {
              ...seededModel,
              ...model,
              cost: isRecord(model.cost) ? { ...zeroCost, ...model.cost } : zeroCost
            }
          : model
      )
    : [...configuredModels, seededModel];

  providers[providerId] = provider;
  models.providers = providers;
  config.models = models;
}

function readOpenClawRuntimeConfigMeta(configPath: string): unknown {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;
    return isRecord(parsed.meta) ? parsed.meta : null;
  } catch {
    return null;
  }
}

function runtimeConfigMatches(runtimeConfigPath: string, desired: Record<string, unknown>): boolean {
  if (!existsSync(runtimeConfigPath)) {
    return false;
  }

  try {
    const current = JSON.parse(readFileSync(runtimeConfigPath, "utf8")) as Record<string, unknown>;
    return JSON.stringify(normalizeRuntimeConfig(current)) === JSON.stringify(normalizeRuntimeConfig(desired));
  } catch {
    return false;
  }
}

function normalizeRuntimeConfig(input: Record<string, unknown>): Record<string, unknown> {
  const normalized = { ...input };
  delete normalized.meta;

  if (isRecord(normalized.gateway)) {
    const gateway = { ...normalized.gateway };
    if (isRecord(gateway.auth)) {
      const auth = { ...gateway.auth };
      delete auth.token;
      gateway.auth = auth;
    }
    delete gateway.tailscale;
    normalized.gateway = gateway;
  }

  return normalized;
}

async function waitForOpenClawGateway(options: { configPath: string; stateDir: string; readyTimeoutMs: number; diagnostics?: ChatTurnDiagnosticContext }): Promise<void> {
  const deadline = Date.now() + options.readyTimeoutMs;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await callOpenClawGateway("health", {}, { stateDir: options.stateDir, timeoutMs: GATEWAY_HEALTH_TIMEOUT_MS, diagnostics: options.diagnostics });
      markOpenClawGatewayReady();
      return;
    } catch (error) {
      lastError = error;
      await delay(1000);
    }
  }

  throw new Error(
    `OpenClaw gateway did not become ready within ${Math.round(options.readyTimeoutMs / 1000)}s.${lastError instanceof Error ? ` ${lastError.message}` : ""}`
  );
}

function hasFreshOpenClawGatewayReady(): boolean {
  return Date.now() < gatewayReadyUntil;
}

function markOpenClawGatewayReady(): void {
  gatewayReadyUntil = Date.now() + GATEWAY_READY_CACHE_MS;
}

function markOpenClawGatewayNotReady(): void {
  gatewayReadyUntil = 0;
}

function getCachedPreparedSession(stateDir: string, sessionKey: string): OpenClawPreparedSession | null {
  const cacheKey = preparedSessionCacheKey(stateDir, sessionKey);
  const cached = preparedSessionsByKey.get(cacheKey);
  if (cached && cached.sessionFile && existsSync(cached.sessionFile)) {
    return cached;
  }

  if (cached) {
    preparedSessionsByKey.delete(cacheKey);
  }

  const fromRegistry = readPreparedSessionFromRegistry(stateDir, sessionKey);
  if (!fromRegistry) {
    return null;
  }

  preparedSessionsByKey.set(cacheKey, fromRegistry);
  return fromRegistry;
}

function cachePreparedSession(sessionKey: string, stateDir: string, prepared: OpenClawPreparedSession): void {
  if (!prepared.sessionId && !prepared.sessionFile) {
    return;
  }

  const normalized = {
    ...prepared,
    sessionFile: prepared.sessionFile ?? (prepared.sessionId ? getOpenClawSessionFile(stateDir, prepared.sessionId) : null)
  };
  preparedSessionsByKey.set(preparedSessionCacheKey(stateDir, sessionKey), normalized);
  preparedSessionsByKey.set(preparedSessionCacheKey(stateDir, normalized.key), normalized);
}

function forgetCachedPreparedSession(stateDir: string, sessionKey: string, prepared: OpenClawPreparedSession): void {
  preparedSessionsByKey.delete(preparedSessionCacheKey(stateDir, sessionKey));
  preparedSessionsByKey.delete(preparedSessionCacheKey(stateDir, prepared.key));
  for (const [key, value] of preparedSessionsByKey.entries()) {
    if (value.sessionId === prepared.sessionId) {
      preparedSessionsByKey.delete(key);
    }
  }
}

function readPreparedSessionFromRegistry(stateDir: string, sessionKey: string): OpenClawPreparedSession | null {
  const registryPath = path.join(stateDir, "agents", "main", "sessions", "sessions.json");
  if (!existsSync(registryPath)) {
    return null;
  }

  let registry: unknown;
  try {
    registry = JSON.parse(readFileSync(registryPath, "utf8")) as unknown;
  } catch {
    return null;
  }

  if (!isRecord(registry)) {
    return null;
  }

  const registryKey = openClawRegistrySessionKey(sessionKey);
  const record = registry[registryKey] ?? registry[sessionKey];
  if (!isRecord(record)) {
    return null;
  }

  const sessionId = typeof record.sessionId === "string" && record.sessionId.trim() ? record.sessionId : null;
  const sessionFileFromRegistry = typeof record.sessionFile === "string" && record.sessionFile.trim() ? record.sessionFile : null;
  const sessionFile = normalizeOpenClawSessionFile(stateDir, sessionId, sessionFileFromRegistry);
  if (!sessionId || !sessionFile || !existsSync(sessionFile)) {
    return null;
  }

  return {
    key: sessionKey,
    sessionId,
    sessionFile,
    raw: {
      source: "openclaw-sessions-registry",
      registryKey
    }
  };
}

function preparedSessionCacheKey(stateDir: string, sessionKey: string): string {
  return `${stateDir}:${sessionKey}`;
}

function openClawRegistrySessionKey(sessionKey: string): string {
  return sessionKey.startsWith("agent:main:") ? sessionKey : `agent:main:${sessionKey}`;
}

async function retryOpenClawGatewayTurn(
  message: string,
  options: Required<Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "model" | "sessionId" | "timeoutSeconds">> & {
    diagnostics?: ChatTurnDiagnosticContext;
    signal?: AbortSignal;
  }
): Promise<OpenClawAgentResult> {
  try {
    traceOpenClaw(options.diagnostics, "openclaw_agent_gateway_retry_started");
    return await runOpenClawGatewayTurn(message, options);
  } catch (error) {
    if (!isGatewayUnavailableError(error)) {
      throw error;
    }

    await waitForOpenClawGateway({
      configPath: options.configPath,
      stateDir: options.stateDir,
      readyTimeoutMs: GATEWAY_READY_DEADLINE_MS,
      diagnostics: options.diagnostics
    });
    await prewarmOpenClawGatewayOnce({
      configPath: options.configPath,
      stateDir: options.stateDir,
      diagnostics: options.diagnostics
    });
    return await runOpenClawGatewayTurn(message, options);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function traceOpenClaw(
  diagnostics: ChatTurnDiagnosticContext | null | undefined,
  event: string,
  detail?: Record<string, unknown>
): void {
  recordChatTurnDiagnosticEventForContext(diagnostics, "openclaw", event, detail);
}

function traceOpenClawPrewarm(
  diagnostics: ChatTurnDiagnosticContext,
  event: string,
  detail?: Record<string, unknown>
): void {
  recordChatTurnDiagnosticEvent({
    traceId: diagnostics.traceId,
    traceStartedAt: diagnostics.traceStartedAt,
    source: "openclaw",
    event,
    detail: {
      openClawSessionId: OPENCLAW_PREWARM_SESSION_KEY,
      ...(detail ?? {})
    }
  });
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

async function runOpenClawGatewayPrewarm(options: {
  configPath: string;
  stateDir: string;
  gatewayKey: string;
  parentDiagnostics?: ChatTurnDiagnosticContext;
}): Promise<void> {
  const mode = env.dmaxOpenClawPrewarmWaitForCompletion ? "wait_for_completion" : "send_only";
  const timeoutMs = env.dmaxOpenClawPrewarmTimeoutMs;
  const traceStartedAt = new Date().toISOString();
  const diagnostics: ChatTurnDiagnosticContext = {
    traceId: createChatTurnTraceId("openclaw-prewarm"),
    traceStartedAt,
    openClawSessionId: OPENCLAW_PREWARM_SESSION_KEY
  };
  const startedAt = performance.now();
  const baseDetail = {
    sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
    mode,
    timeoutMs,
    gatewayKey: options.gatewayKey
  };

  traceOpenClawPrewarm(diagnostics, "openclaw.prewarm.started", baseDetail);
  traceOpenClaw(options.parentDiagnostics, "openclaw_prewarm_started", baseDetail);

  try {
    await withOpenClawPrewarmTimeout(
      executeOpenClawGatewayPrewarm({
        ...options,
        diagnostics,
        mode,
        timeoutMs,
        startedAt,
        traceStartedAt
      }),
      timeoutMs
    );
    gatewayPrewarmCompletedKey = options.gatewayKey;
    gatewayPrewarmFailedKey = null;
    const durationMs = performance.now() - startedAt;
    traceOpenClawPrewarm(diagnostics, "openclaw.prewarm.done", {
      ...baseDetail,
      durationMs
    });
    traceOpenClaw(options.parentDiagnostics, "openclaw_prewarm_done", {
      ...baseDetail,
      durationMs
    });
  } catch (error) {
    gatewayPrewarmFailedKey = options.gatewayKey;
    const durationMs = performance.now() - startedAt;
    const errorMessage = error instanceof Error ? error.message : String(error);
    traceOpenClawPrewarm(diagnostics, "openclaw.prewarm.failed", {
      ...baseDetail,
      durationMs,
      error: errorMessage
    });
    traceOpenClaw(options.parentDiagnostics, "openclaw_prewarm_failed", {
      ...baseDetail,
      durationMs,
      error: errorMessage
    });
  }
}

async function executeOpenClawGatewayPrewarm(options: {
  configPath: string;
  stateDir: string;
  diagnostics: ChatTurnDiagnosticContext;
  mode: "send_only" | "wait_for_completion";
  timeoutMs: number;
  startedAt: number;
  traceStartedAt: string;
}): Promise<void> {
  const sessionCreateStartedAt = performance.now();
  traceOpenClawPrewarm(options.diagnostics, "openclaw.prewarm.session_create_start", {
    sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
    mode: options.mode,
    timeoutMs: options.timeoutMs
  });

  let prepared = getCachedPreparedSession(options.stateDir, OPENCLAW_PREWARM_SESSION_KEY);
  if (!prepared) {
    const createResult = await callOpenClawGateway(
      "sessions.create",
      {
        key: OPENCLAW_PREWARM_SESSION_KEY,
        label: OPENCLAW_PREWARM_SESSION_LABEL,
        model: env.dmaxOpenClawModel
      },
      {
        stateDir: options.stateDir,
        timeoutMs: Math.min(GATEWAY_SESSION_CREATE_TIMEOUT_MS, remainingOpenClawPrewarmMs(options)),
        diagnostics: options.diagnostics
      }
    );
    prepared = {
      key: extractPreparedSessionKey(createResult) ?? OPENCLAW_PREWARM_SESSION_KEY,
      sessionId: extractPreparedSessionId(createResult),
      sessionFile: extractPreparedSessionFile(createResult),
      raw: createResult
    };
    cachePreparedSession(OPENCLAW_PREWARM_SESSION_KEY, options.stateDir, prepared);
  }

  traceOpenClawPrewarm(options.diagnostics, "openclaw.prewarm.session_create_done", {
    sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
    mode: options.mode,
    timeoutMs: options.timeoutMs,
    sessionId: prepared.sessionId,
    source: prepared.raw && isRecord(prepared.raw) && prepared.raw.source === "openclaw-sessions-registry" ? "cache" : "gateway",
    durationMs: performance.now() - sessionCreateStartedAt
  });

  if (!prepared.sessionId) {
    throw new Error("OpenClaw prewarm session creation did not return a sessionId.");
  }

  const sendStartedAt = performance.now();
  const sendStartedWallTime = new Date().toISOString();
  const idempotencyKey = `${OPENCLAW_PREWARM_SESSION_KEY}-${Date.now()}`;
  traceOpenClawPrewarm(options.diagnostics, "openclaw.prewarm.sessions_send_start", {
    sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
    sessionId: prepared.sessionId,
    mode: options.mode,
    timeoutMs: options.timeoutMs
  });
  const sendResult = await callOpenClawGateway(
    "sessions.send",
    {
      key: OPENCLAW_PREWARM_SESSION_KEY,
      message: OPENCLAW_PREWARM_PROMPT,
      timeoutMs: options.timeoutMs,
      idempotencyKey
    },
    {
      stateDir: options.stateDir,
      timeoutMs: Math.min(90_000, Math.max(5_000, remainingOpenClawPrewarmMs(options))),
      diagnostics: options.diagnostics
    }
  );
  const runId = extractGatewayRunId(sendResult);
  traceOpenClawPrewarm(options.diagnostics, "openclaw.prewarm.sessions_send_done", {
    sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
    sessionId: prepared.sessionId,
    runId,
    mode: options.mode,
    timeoutMs: options.timeoutMs,
    durationMs: performance.now() - sendStartedAt
  });
  if (!runId) {
    throw new Error("OpenClaw prewarm sessions.send did not return a runId.");
  }

  if (options.mode === "wait_for_completion") {
    const agentWaitStartedAt = performance.now();
    traceOpenClawPrewarm(options.diagnostics, "openclaw.prewarm.agent_wait_start", {
      sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
      sessionId: prepared.sessionId,
      runId,
      mode: options.mode,
      timeoutMs: options.timeoutMs
    });
    const waitResult = await callOpenClawGateway(
      "agent.wait",
      {
        runId,
        timeoutMs: remainingOpenClawPrewarmMs(options)
      },
      {
        stateDir: options.stateDir,
        timeoutMs: remainingOpenClawPrewarmMs(options),
        diagnostics: options.diagnostics
      }
    );
    traceOpenClawPrewarm(options.diagnostics, "openclaw.prewarm.agent_wait_done", {
      sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
      sessionId: prepared.sessionId,
      runId,
      status: extractGatewayWaitStatus(waitResult),
      mode: options.mode,
      timeoutMs: options.timeoutMs,
      durationMs: performance.now() - agentWaitStartedAt
    });
    return;
  }

  const sessionStartedAt = performance.now();
  await waitForOpenClawRunSessionStarted({
    stateDir: options.stateDir,
    sessionId: prepared.sessionId,
    runId,
    after: sendStartedWallTime,
    timeoutMs: remainingOpenClawPrewarmMs(options)
  });
  traceOpenClawPrewarm(options.diagnostics, "openclaw.prewarm.session_started_seen", {
    sessionKey: OPENCLAW_PREWARM_SESSION_KEY,
    sessionId: prepared.sessionId,
    runId,
    mode: options.mode,
    timeoutMs: options.timeoutMs,
    durationMs: performance.now() - sessionStartedAt
  });
}

function remainingOpenClawPrewarmMs(options: { startedAt: number; timeoutMs: number }): number {
  return Math.max(1_000, Math.ceil(options.timeoutMs - (performance.now() - options.startedAt)));
}

async function withOpenClawPrewarmTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeout = setTimeout(() => {
          reject(new Error(`OpenClaw prewarm timed out after ${Math.round(timeoutMs / 1000)}s.`));
        }, timeoutMs);
      })
    ]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

async function waitForOpenClawRunSessionStarted(options: {
  stateDir: string;
  sessionId: string;
  runId: string;
  after: string;
  timeoutMs: number;
}): Promise<void> {
  const deadline = Date.now() + options.timeoutMs;
  while (Date.now() < deadline) {
    const summary = readOpenClawTrajectorySummary(options.sessionId, {
      stateDir: options.stateDir,
      after: options.after
    });
    if (summary?.runs.some((run) => run.runId === options.runId && run.sessionStartedAt)) {
      return;
    }
    await delay(500);
  }

  throw new Error(`OpenClaw prewarm run ${options.runId} did not reach session.started within ${Math.round(options.timeoutMs / 1000)}s.`);
}

function resolveOpenClawGatewayPrewarmKey(stateDir: string): string {
  if (isExternalOpenClawGatewayConfigured()) {
    return `${stateDir}:${resolveOpenClawGatewayWsUrl()}`;
  }

  return `${stateDir}:${readOpenClawGatewayListenerPids().join(",") || "unknown-gateway"}`;
}

function readOpenClawGatewayListenerPids(): string[] {
  try {
    const output = execFileSync("lsof", ["-ti", "tcp:18789", "-sTCP:LISTEN"], {
      encoding: "utf8",
      timeout: 1000,
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean)
      .sort();
  } catch {
    return [];
  }
}

async function runOpenClawGatewayTurn(
  message: string,
  options: Required<Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "model" | "sessionId" | "timeoutSeconds">> & {
    diagnostics?: ChatTurnDiagnosticContext;
    signal?: AbortSignal;
  }
): Promise<OpenClawAgentResult> {
  const sessionFile = getOpenClawSessionFile(options.stateDir, options.sessionId);
  const initialSessionFileSize = getFileSize(sessionFile);
  const activityStartedAt = new Date().toISOString();
  traceOpenClaw(options.diagnostics, "openclaw_gateway_agent_call_prepared", {
    sessionFile,
    initialSessionFileSize,
    promptChars: message.length
  });
  const parsed = await callOpenClawGateway(
    "agent",
    {
      idempotencyKey: `${options.sessionId}-${Date.now()}`,
      sessionId: options.sessionId,
      message,
      model: options.model
    },
    {
      expectFinal: true,
      stateDir: options.stateDir,
      timeoutMs: options.timeoutSeconds * 1000,
      sessionFallback: { sessionFile, initialSessionFileSize, sessionId: options.sessionId },
      diagnostics: options.diagnostics,
      signal: options.signal
    }
  );
  markOpenClawGatewayReady();

  const text = extractGatewayReplyText(parsed);
  const activities = mergeActivities([
    ...readOpenClawSessionActivities(sessionFile, initialSessionFileSize),
    ...readSubagentActivities(options.stateDir, "dmax-research", activityStartedAt),
    ...readSubagentActivities(options.stateDir, "dmax-google-workspace", activityStartedAt)
  ]);
  traceOpenClaw(options.diagnostics, "openclaw_gateway_agent_call_completed", {
    replyChars: text.length,
    activities: activities.length
  });
  return { text, raw: parsed, activities, sessionId: options.sessionId, sessionKey: options.sessionId };
}

async function runOpenClawGatewaySessionTurn(
  message: string,
  input: { sessionKey: string; label?: string | null },
  options: Required<Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "model" | "timeoutSeconds">> & {
    diagnostics?: ChatTurnDiagnosticContext;
    signal?: AbortSignal;
  }
): Promise<OpenClawAgentResult> {
  traceOpenClaw(options.diagnostics, "openclaw_sessions_create_started", {
    sessionKey: input.sessionKey
  });
  const prepared = await prepareOpenClawSession(
    {
      key: input.sessionKey,
      label: input.label,
      model: options.model
    },
    {
      configPath: options.configPath,
      stateDir: options.stateDir,
      diagnostics: options.diagnostics
    }
  );
  traceOpenClaw(options.diagnostics, "openclaw_sessions_create_finished", {
    sessionKey: prepared.key,
    sessionId: prepared.sessionId,
    hasSessionFile: Boolean(prepared.sessionFile)
  });

  const sessionFile = normalizeOpenClawSessionFile(options.stateDir, prepared.sessionId, prepared.sessionFile);
  if (!sessionFile) {
    throw new Error(`OpenClaw did not return a transcript file for session ${input.sessionKey}.`);
  }

  const initialSessionFileSize = getFileSize(sessionFile);
  const activityStartedAt = new Date().toISOString();
  const timeoutMs = options.timeoutSeconds * 1000;
  const idempotencyKey = `${input.sessionKey}-${Date.now()}`;
  traceOpenClaw(options.diagnostics, "openclaw_sessions_send_started", {
    sessionKey: input.sessionKey,
    sessionFile,
    initialSessionFileSize,
    promptChars: message.length
  });
  latencyTrace(options.diagnostics, "dmax.sessions_send.before", {
    sessionKey: input.sessionKey,
    sessionId: prepared.sessionId,
    initialSessionFileSize,
    promptChars: message.length
  });
  const sessionsSendStartedAt = performance.now();
  const sendResult = await callOpenClawGateway(
    "sessions.send",
    {
      key: input.sessionKey,
      message,
      timeoutMs,
      idempotencyKey
    },
    {
      stateDir: options.stateDir,
      timeoutMs: Math.min(90_000, Math.max(5_000, timeoutMs)),
      diagnostics: options.diagnostics,
      signal: options.signal
    }
  );
  markOpenClawGatewayReady();
  latencyTrace(options.diagnostics, "dmax.sessions_send.after", {
    sessionKey: input.sessionKey,
    sessionId: prepared.sessionId
  }, performance.now() - sessionsSendStartedAt);
  const runId = extractGatewayRunId(sendResult);
  traceOpenClaw(options.diagnostics, "openclaw_sessions_send_finished", {
    sessionKey: input.sessionKey,
    runId
  });
  if (!runId) {
    throw new Error("OpenClaw sessions.send did not return a runId.");
  }

  const abortRun = () => {
    void callOpenClawGateway(
      "chat.abort",
      { sessionKey: input.sessionKey, runId },
      {
        stateDir: options.stateDir,
        timeoutMs: 5_000,
        diagnostics: options.diagnostics
      }
    ).catch(() => undefined);
  };
  if (options.signal?.aborted) {
    abortRun();
    throw new DOMException("OpenClaw run aborted.", "AbortError");
  }
  options.signal?.addEventListener("abort", abortRun, { once: true });
  traceOpenClaw(options.diagnostics, "openclaw_agent_wait_started", {
    runId,
    timeoutMs
  });
  latencyTrace(options.diagnostics, "dmax.agent_wait.before", {
    sessionKey: input.sessionKey,
    sessionId: prepared.sessionId,
    runId,
    timeoutMs
  });
  const agentWaitStartedAt = performance.now();
  let waitResult: unknown;
  try {
    waitResult = await callOpenClawGateway(
      "agent.wait",
      {
        runId,
        timeoutMs
      },
      {
        stateDir: options.stateDir,
        timeoutMs: timeoutMs + 2_000,
        diagnostics: options.diagnostics,
        signal: options.signal
      }
    );
  } finally {
    options.signal?.removeEventListener("abort", abortRun);
  }
  markOpenClawGatewayReady();
  latencyTrace(options.diagnostics, "dmax.agent_wait.after", {
    sessionKey: input.sessionKey,
    sessionId: prepared.sessionId,
    runId
  }, performance.now() - agentWaitStartedAt);
  const waitStatus = extractGatewayWaitStatus(waitResult);
  traceOpenClaw(options.diagnostics, "openclaw_agent_wait_finished", {
    runId,
    status: waitStatus
  });
  if (waitStatus !== "ok") {
    throw new Error(`OpenClaw run ${runId} finished with status ${waitStatus ?? "unknown"}.`);
  }
  if (options.signal?.aborted) {
    throw new DOMException("OpenClaw run aborted.", "AbortError");
  }

  const activePrepared = readPreparedSessionFromRegistry(options.stateDir, input.sessionKey);
  const sessionWasReplaced =
    Boolean(activePrepared?.sessionFile) &&
    (activePrepared?.sessionId !== prepared.sessionId || activePrepared?.sessionFile !== sessionFile);
  const replySessionId = activePrepared?.sessionId ?? prepared.sessionId;
  const replySessionFile = activePrepared?.sessionFile ?? sessionFile;
  const replyInitialSessionFileSize = sessionWasReplaced ? 0 : initialSessionFileSize;
  if (activePrepared && sessionWasReplaced) {
    cachePreparedSession(input.sessionKey, options.stateDir, activePrepared);
    traceOpenClaw(options.diagnostics, "openclaw_session_replaced_during_run", {
      sessionKey: input.sessionKey,
      previousSessionId: prepared.sessionId,
      activeSessionId: activePrepared.sessionId,
      activeSessionFile: activePrepared.sessionFile
    });
  }

  const replyWaitTimeoutMs = Math.max(SESSION_REPLY_WAIT_TIMEOUT_MS, timeoutMs);
  traceOpenClaw(options.diagnostics, "openclaw_session_reply_wait_started", {
    runId,
    timeoutMs: replyWaitTimeoutMs,
    sessionId: replySessionId
  });
  const reply = await raceWithAbort(
    waitForCompletedSessionReply(replySessionFile, replyInitialSessionFileSize, replyWaitTimeoutMs, options.diagnostics, {
      sessionKey: input.sessionKey,
      sessionId: replySessionId,
      runId
    }),
    options.signal,
    "OpenClaw run aborted."
  );
  if (options.signal?.aborted) {
    throw new DOMException("OpenClaw run aborted.", "AbortError");
  }
  traceOpenClaw(options.diagnostics, "openclaw_session_reply_wait_finished", {
    runId,
    found: Boolean(reply),
    sessionId: replySessionId
  });
  const activities = mergeActivities([
    ...readOpenClawSessionActivities(replySessionFile, replyInitialSessionFileSize),
    ...readSubagentActivities(options.stateDir, "dmax-research", activityStartedAt),
    ...readSubagentActivities(options.stateDir, "dmax-google-workspace", activityStartedAt)
  ]);
  if (!reply) {
    const fallbackText = fallbackReplyFromActivities(activities);
    if (!fallbackText) {
      throw new Error("OpenClaw completed the run but no assistant reply was written to the session transcript.");
    }
    traceOpenClaw(options.diagnostics, "openclaw_sessions_turn_completed_without_reply", {
      sessionKey: input.sessionKey,
      sessionId: replySessionId,
      runId,
      activities: activities.length
    });
    return {
      text: fallbackText,
      raw: {
        prepared: prepared.raw,
        send: sendResult,
        wait: waitResult,
        assistantMessageId: null,
        fallback: "activity_summary"
      },
      activities,
      sessionId: replySessionId,
      sessionKey: activePrepared?.key ?? prepared.key
    };
  }

  traceOpenClaw(options.diagnostics, "openclaw_sessions_turn_completed", {
    sessionKey: input.sessionKey,
    sessionId: replySessionId,
    runId,
    replyChars: reply.text.length,
    activities: activities.length
  });
  return {
    text: reply.text,
    raw: {
      prepared: prepared.raw,
      send: sendResult,
      wait: waitResult,
      assistantMessageId: reply.messageId ?? null
    },
    activities,
    sessionId: replySessionId,
    sessionKey: activePrepared?.key ?? prepared.key
  };
}

function fallbackReplyFromActivities(activities: OpenClawActivity[]): string | null {
  const runningExternalAgent = activities.some((activity) =>
    (activity.kind === "research" || activity.kind === "workspace") && activity.status === "running"
  );
  if (runningExternalAgent) {
    return null;
  }

  const completedExternalAgent = [...activities]
    .reverse()
    .find((activity) => (activity.kind === "research" || activity.kind === "workspace") && activity.status === "completed");
  if (completedExternalAgent) {
    return `${completedExternalAgent.title}. Details sind in der Aktivitätsübersicht sichtbar.`;
  }

  const meaningful = activities.filter((activity) =>
    (activity.kind === "tool_result" || activity.kind === "tool_call") &&
    !["exec", "process", "sessions_spawn", "sessions_yield"].includes(activity.toolName ?? "")
  );
  if (meaningful.length === 0) {
    return null;
  }

  const failed = [...meaningful].reverse().find((activity) => activity.status === "failed");
  if (failed) {
    return `Ich habe die Aktion versucht, aber sie wurde nicht sauber abgeschlossen: ${failed.title}.`;
  }

  const completed = meaningful.filter((activity) => activity.status === "completed");
  if (completed.length === 0) {
    return null;
  }

  const lastCompleted = completed.at(-1)!;
  return `Erledigt: ${lastCompleted.title.replace(/\s+abgeschlossen$/i, "")}.`;
}

function raceWithAbort<T>(promise: Promise<T>, signal: AbortSignal | undefined, message: string): Promise<T> {
  if (!signal) {
    return promise;
  }
  if (signal.aborted) {
    return Promise.reject(new DOMException(message, "AbortError"));
  }

  return new Promise((resolve, reject) => {
    const abort = () => reject(new DOMException(message, "AbortError"));
    signal.addEventListener("abort", abort, { once: true });
    promise.then(resolve, reject).finally(() => signal.removeEventListener("abort", abort));
  });
}

async function callOpenClawGateway(
  method: string,
  params: unknown,
  options: {
    expectFinal?: boolean;
    stateDir: string;
    timeoutMs: number;
    sessionFallback?: { sessionFile: string; initialSessionFileSize: number; sessionId: string };
    diagnostics?: ChatTurnDiagnosticContext;
    signal?: AbortSignal;
  }
): Promise<unknown> {
  traceOpenClaw(options.diagnostics, "openclaw_gateway_client_module_load_started", { method });
  await loadOpenClawGatewayClientModule();
  traceOpenClaw(options.diagnostics, "openclaw_gateway_client_module_load_finished", { method });

  return await new Promise((resolve, reject) => {
    let settled = false;
    let fallbackTimeout: ReturnType<typeof setTimeout> | null = null;
    let requestStarted = false;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const abort = () => {
      traceOpenClaw(options.diagnostics, "openclaw_gateway_call_aborted", { method });
      finish(new DOMException("OpenClaw gateway call aborted.", "AbortError"));
    };
    if (options.signal?.aborted) {
      abort();
      return;
    }
    options.signal?.addEventListener("abort", abort, { once: true });
    timeout = setTimeout(() => {
      if (!options.sessionFallback) {
        traceOpenClaw(options.diagnostics, "openclaw_gateway_call_timeout", { method, timeoutMs: options.timeoutMs });
        finish(new Error(`OpenClaw gateway call timed out after ${Math.round(options.timeoutMs / 1000)}s.`));
        return;
      }

      traceOpenClaw(options.diagnostics, "openclaw_gateway_session_fallback_grace_started", {
        method,
        timeoutMs: options.timeoutMs,
        sessionId: options.sessionFallback.sessionId
      });
      fallbackTimeout = setTimeout(() => {
        traceOpenClaw(options.diagnostics, "openclaw_gateway_session_fallback_timeout", { method });
        finish(
          new Error(
            `OpenClaw gateway call timed out after ${Math.round(options.timeoutMs / 1000)}s and no session-file reply appeared within ${Math.round(GATEWAY_SESSION_FALLBACK_GRACE_MS / 1000)}s.`
          )
        );
      }, GATEWAY_SESSION_FALLBACK_GRACE_MS);
    }, options.timeoutMs + 2000);
    const sessionPoll = options.sessionFallback
      ? setInterval(() => {
          if (settled || !options.sessionFallback) {
            return;
          }

          const reply = readCompletedSessionReply(
            options.sessionFallback.sessionFile,
            options.sessionFallback.initialSessionFileSize
          );
          if (!reply) {
            return;
          }

          finish(null, {
            status: "ok",
            result: {
              payloads: [{ text: reply.text }],
              meta: {
                source: "openclaw-session-file",
                sessionId: options.sessionFallback.sessionId,
                assistantMessageId: reply.messageId
              }
            }
          });
          traceOpenClaw(options.diagnostics, "openclaw_gateway_session_file_reply_detected", {
            method,
            sessionId: options.sessionFallback.sessionId,
            assistantMessageId: reply.messageId ?? null
          });
        }, 250)
      : null;

    void getOpenClawGatewayConnection(options.stateDir, options.diagnostics, method)
      .then(async (connection) => {
        if (settled) {
          return;
        }
        requestStarted = true;
        try {
          traceOpenClaw(options.diagnostics, "openclaw_gateway_request_started", {
            method,
            expectFinal: Boolean(options.expectFinal),
            timeoutMs: options.timeoutMs
          });
          const result = await connection.client.request(method, params, {
            expectFinal: options.expectFinal,
            timeoutMs: options.timeoutMs
          });
          traceOpenClaw(options.diagnostics, "openclaw_gateway_request_finished", { method });
          finish(null, result);
        } catch (error) {
          traceOpenClaw(options.diagnostics, "openclaw_gateway_request_failed", {
            method,
            error: error instanceof Error ? error.message : String(error)
          });
          if (isGatewayUnavailableError(error)) {
            invalidateOpenClawGatewayConnection(connection);
          }
          finish(error);
        }
      })
      .catch((error) => {
        if (!requestStarted) {
          traceOpenClaw(options.diagnostics, "openclaw_gateway_ws_connect_error", {
            method,
            error: error instanceof Error ? error.message : String(error)
          });
        }
        finish(error);
      });

    function finish(error: unknown, value?: unknown): void {
      if (settled) {
        return;
      }

      settled = true;
      if (timeout) {
        clearTimeout(timeout);
      }
      if (fallbackTimeout) {
        clearTimeout(fallbackTimeout);
      }
      if (sessionPoll) {
        clearInterval(sessionPoll);
      }
      options.signal?.removeEventListener("abort", abort);

      if (error) {
        traceOpenClaw(options.diagnostics, "openclaw_gateway_call_finished", {
          method,
          ok: false,
          error: error instanceof Error ? error.message : String(error)
        });
        reject(error);
      } else {
        traceOpenClaw(options.diagnostics, "openclaw_gateway_call_finished", { method, ok: true });
        resolve(value);
      }
    }

    traceOpenClaw(options.diagnostics, "openclaw_gateway_ws_client_start", { method });
  });
}

async function getOpenClawGatewayConnection(
  stateDir: string,
  diagnostics: ChatTurnDiagnosticContext | undefined,
  method: string
): Promise<OpenClawGatewayConnection> {
  const gatewayUrl = resolveOpenClawGatewayWsUrl();
  if (gatewayConnection && !gatewayConnection.closed && gatewayConnection.stateDir === stateDir && gatewayConnection.gatewayUrl === gatewayUrl) {
    traceOpenClaw(diagnostics, "openclaw_gateway_ws_reused", { method });
    await gatewayConnection.ready;
    return gatewayConnection;
  }

  if (gatewayConnection) {
    invalidateOpenClawGatewayConnection(gatewayConnection);
  }

  const { GatewayClient } = await loadOpenClawGatewayClientModule();
  const clientStateDir = resolveOpenClawGatewayClientStateDir(stateDir);
  mkdirSync(clientStateDir, { recursive: true });
  const previousOpenClawStateDir = process.env.OPENCLAW_STATE_DIR;
  process.env.OPENCLAW_STATE_DIR = clientStateDir;
  let resolveReady!: () => void;
  let rejectReady!: (error: unknown) => void;
  let readySettled = false;
  const ready = new Promise<void>((resolve, reject) => {
    resolveReady = () => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      resolve();
    };
    rejectReady = (error) => {
      if (readySettled) {
        return;
      }
      readySettled = true;
      reject(error);
    };
  });

  const connection: OpenClawGatewayConnection = {
    client: null as unknown as OpenClawGatewayClient,
    ready,
    stateDir,
    gatewayUrl,
    closed: false,
    closeError: null
  };
  const client = new GatewayClient({
    url: gatewayUrl,
    ...(process.env.OPENCLAW_GATEWAY_TOKEN ? { token: process.env.OPENCLAW_GATEWAY_TOKEN } : {}),
    clientName: "gateway-client",
    clientDisplayName: "DMAX web chat",
    clientVersion: "DMAX",
    mode: "backend",
    role: "operator",
    scopes: ["operator.admin", "operator.read", "operator.write"],
    minProtocol: 3,
    maxProtocol: 4,
    onHelloOk: async () => {
      traceOpenClaw(diagnostics, "openclaw_gateway_ws_hello_ok", { method });
      markOpenClawGatewayReady();
      resolveReady();
    },
    onClose: (code, reason) => {
      const error = new Error(`OpenClaw gateway closed (${code}): ${reason || "no close reason"}`);
      connection.closed = true;
      connection.closeError = error;
      if (gatewayConnection === connection) {
        gatewayConnection = null;
      }
      traceOpenClaw(diagnostics, "openclaw_gateway_ws_closed", { method, code, reason });
      rejectReady(error);
    },
    onConnectError: (error) => {
      connection.closed = true;
      connection.closeError = error;
      if (gatewayConnection === connection) {
        gatewayConnection = null;
      }
      traceOpenClaw(diagnostics, "openclaw_gateway_ws_connect_error", { method, error: error.message });
      rejectReady(error);
    }
  });
  connection.client = client;
  gatewayConnection = connection;
  try {
    traceOpenClaw(diagnostics, "openclaw_gateway_ws_client_start", { method });
    client.start();
  } finally {
    if (previousOpenClawStateDir === undefined) {
      delete process.env.OPENCLAW_STATE_DIR;
    } else {
      process.env.OPENCLAW_STATE_DIR = previousOpenClawStateDir;
    }
  }

  await ready;
  return connection;
}

function invalidateOpenClawGatewayConnection(connection: OpenClawGatewayConnection | null = gatewayConnection): void {
  if (!connection) {
    return;
  }
  connection.closed = true;
  if (gatewayConnection === connection) {
    gatewayConnection = null;
  }
  try {
    connection.client.stop();
  } catch {
    // The caller already has the actionable error.
  }
}

async function loadOpenClawGatewayClientModule(): Promise<OpenClawGatewayClientModule> {
  gatewayClientModulePromise ??= (async () => {
    const candidates = resolveOpenClawGatewayClientCandidates();
    const errors: string[] = [];
    for (const candidate of candidates) {
      try {
        const module = await import(pathToFileURL(candidate.modulePath).href);
        const GatewayClient = module[candidate.exportName] as OpenClawGatewayClientModule["GatewayClient"] | undefined;
        if (typeof GatewayClient === "function") {
          return {
            GatewayClient,
            modulePath: candidate.modulePath
          };
        }
        errors.push(`${candidate.modulePath} export ${candidate.exportName} was not a function`);
      } catch (error) {
        errors.push(`${candidate.modulePath}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    throw new Error(`Could not load OpenClaw gateway client module. ${errors.join("; ")}`);
  })();
  return gatewayClientModulePromise;
}

function resolveOpenClawGatewayClientCandidates(): Array<{ modulePath: string; exportName: string }> {
  const explicitPath = process.env.OPENCLAW_GATEWAY_CLIENT_MODULE;
  if (explicitPath) {
    return [
      { modulePath: explicitPath, exportName: "t" },
      { modulePath: explicitPath, exportName: "n" },
      { modulePath: explicitPath, exportName: "GatewayClient" }
    ];
  }

  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  const distDir = path.join(globalRoot, "openclaw", "dist");
  const candidates = readdirSync(distDir).flatMap((name) => {
    if (!/^client-[A-Za-z0-9_-]+\.js$/.test(name)) {
      return [];
    }

    const modulePath = path.join(distDir, name);
    const source = readFileSync(modulePath, "utf8");
    const exportNames = Array.from(source.matchAll(/GatewayClient as ([A-Za-z_$][A-Za-z0-9_$]*)/g), (match) => match[1]);
    return exportNames.map((exportName) => ({ modulePath, exportName }));
  });
  if (candidates.length === 0) {
    throw new Error(`Could not locate OpenClaw gateway client module in ${distDir}.`);
  }

  return candidates;
}

function runOpenClawJsonProcess(
  command: string,
  args: string[],
  options: { timeoutMs: number; env: NodeJS.ProcessEnv }
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      killProcessGroup(child.pid);
      reject(new Error(`OpenClaw gateway call timed out after ${Math.round(options.timeoutMs / 1000)}s.`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      const parsed = tryParseJsonObject(stdout);
      if (!parsed.ok) return;

      settled = true;
      clearTimeout(timeout);
      killProcessGroup(child.pid);
      resolve(parsed.value);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      if (code === 0) {
        resolve(parseJsonObject(stdout, "OpenClaw gateway call did not return JSON."));
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(`OpenClaw gateway call exited with ${signal ?? code}.${stderr ? ` ${stderr}` : ""}`));
    });
  });
}

function isGatewayUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return /ECONNREFUSED|WebSocket|connect|gateway closed|gateway.*not.*running|Gateway call failed/i.test(message);
}

function runOpenClawProcess(
  command: string,
  args: string[],
  options: { timeoutMs: number; env: NodeJS.ProcessEnv; sessionId: string; stateDir: string }
): Promise<{ source: "stdout"; stdout: string } | { source: "session-file"; text: string; raw: unknown }> {
  return new Promise((resolve, reject) => {
    const sessionFile = getOpenClawSessionFile(options.stateDir, options.sessionId);
    const initialSessionFileSize = getFileSize(sessionFile);
    const child = spawn(command, args, {
      cwd: process.cwd(),
      env: options.env,
      detached: true,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdoutChunks: Buffer[] = [];
    const stderrChunks: Buffer[] = [];
    let settled = false;

    const sessionPoll = setInterval(() => {
      if (settled) return;
      const result = readCompletedSessionReply(sessionFile, initialSessionFileSize);
      if (!result) return;

      settled = true;
      clearTimeout(timeout);
      clearInterval(sessionPoll);
      killProcessGroup(child.pid);
      resolve({
        source: "session-file",
        text: result.text,
        raw: {
          source: "openclaw-session-file",
          sessionId: options.sessionId,
          sessionFile,
          assistantMessageId: result.messageId
        }
      });
    }, 250);

    const timeout = setTimeout(() => {
      if (settled) return;
      settled = true;
      clearInterval(sessionPoll);
      killProcessGroup(child.pid);
      reject(new Error(`OpenClaw agent timed out after ${Math.round(options.timeoutMs / 1000)}s.`));
    }, options.timeoutMs);

    child.stdout.on("data", (chunk: Buffer) => {
      stdoutChunks.push(chunk);
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderrChunks.push(chunk);
    });
    child.on("error", (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(sessionPoll);
      reject(error);
    });
    child.on("close", (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearInterval(sessionPoll);
      const stdout = Buffer.concat(stdoutChunks).toString("utf8");
      if (code === 0) {
        resolve({ source: "stdout", stdout });
        return;
      }

      const stderr = Buffer.concat(stderrChunks).toString("utf8").trim();
      reject(new Error(`OpenClaw exited with ${signal ?? code}.${stderr ? ` ${stderr}` : ""}`));
    });
  });
}

function getOpenClawSessionFile(stateDir: string, sessionId: string): string {
  return path.join(stateDir, "agents", "main", "sessions", `${sessionId}.jsonl`);
}

function normalizeOpenClawSessionFile(stateDir: string, sessionId: string | null, sessionFile: string | null): string | null {
  if (sessionFile && existsSync(sessionFile)) {
    return sessionFile;
  }

  if (!sessionId) {
    return sessionFile;
  }

  return getOpenClawSessionFile(stateDir, sessionId);
}

function getOpenClawTrajectoryFile(stateDir: string, sessionId: string): string {
  return path.join(stateDir, "agents", "main", "sessions", `${sessionId}.trajectory.jsonl`);
}

function resolveOpenClawGatewayClientStateDir(stateDir: string): string {
  return env.dmaxOpenClawClientStateDir ?? stateDir;
}

function clearStaleOpenClawRuntimeLocks(stateDir: string): void {
  const runtimeDepsDir = path.join(stateDir, "plugin-runtime-deps");
  const lockNames = [".openclaw-runtime-mirror.lock", ".openclaw-runtime-deps.lock"];

  for (const lockName of lockNames) {
    for (const lockPath of findRuntimeLockPaths(runtimeDepsDir, lockName)) {
      const owner = readLockOwner(lockPath);
      if (!owner || isProcessRunning(owner.pid)) {
        continue;
      }

      try {
        rmSync(lockPath, { recursive: true, force: true });
      } catch {
        // OpenClaw can recover on its own if the stale lock disappears later.
      }
    }
  }
}

function findRuntimeLockPaths(runtimeDepsDir: string, lockName: string): string[] {
  if (!existsSync(runtimeDepsDir)) {
    return [];
  }

  try {
    if (!statSync(runtimeDepsDir).isDirectory()) {
      return [];
    }

    return readdirSync(runtimeDepsDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => path.join(runtimeDepsDir, entry.name, lockName))
      .filter((lockPath) => existsSync(lockPath));
  } catch {
    return [];
  }
}

function readLockOwner(lockPath: string): { pid: number } | null {
  const ownerPath = path.join(lockPath, "owner.json");
  if (!existsSync(ownerPath)) {
    return null;
  }

  try {
    const parsed = JSON.parse(readFileSync(ownerPath, "utf8"));
    return isRecord(parsed) && typeof parsed.pid === "number" ? { pid: parsed.pid } : null;
  } catch {
    return null;
  }
}

function isProcessRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function killProcessGroup(pid: number | undefined): void {
  if (!pid) {
    return;
  }

  try {
    process.kill(-pid, "SIGTERM");
  } catch {
    try {
      process.kill(pid, "SIGTERM");
    } catch {
      return;
    }
  }

  try {
    process.kill(-pid, "SIGKILL");
  } catch {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      // Process already exited.
    }
  }
}

function parseOpenClawJson(stdout: string): unknown {
  const jsonStart = stdout.indexOf('{\n  "payloads"');
  if (jsonStart === -1) {
    throw new Error("OpenClaw did not return a JSON agent result.");
  }

  return JSON.parse(stdout.slice(jsonStart));
}

function parseJsonObject(stdout: string, errorMessage: string): unknown {
  const parsed = tryParseJsonObject(stdout);
  if (parsed.ok) {
    return parsed.value;
  }

  throw new Error(errorMessage);
}

function tryParseJsonObject(stdout: string): { ok: true; value: unknown } | { ok: false } {
  const trimmed = stdout.trim();
  const jsonStart = trimmed.indexOf("{");
  if (jsonStart === -1) {
    return { ok: false };
  }

  try {
    return { ok: true, value: JSON.parse(trimmed.slice(jsonStart)) };
  } catch {
    return { ok: false };
  }
}

function extractGatewayReplyText(value: unknown): string {
  if (!isRecord(value) || value.status !== "ok" || !isRecord(value.result)) {
    throw new Error("Unexpected OpenClaw gateway result.");
  }

  return extractReplyText(value.result);
}

function extractReplyText(value: unknown): string {
  if (!isRecord(value)) {
    throw new Error("Unexpected OpenClaw result.");
  }

  const payloads = value.payloads;
  if (Array.isArray(payloads)) {
    const firstText = payloads.map((payload) => (isRecord(payload) && typeof payload.text === "string" ? payload.text : "")).find(Boolean);
    if (firstText) {
      return firstText;
    }
  }

  const meta = value.meta;
  if (isRecord(meta) && typeof meta.finalAssistantVisibleText === "string") {
    return meta.finalAssistantVisibleText;
  }

  throw new Error("OpenClaw result did not include assistant text.");
}

function extractPreparedSessionKey(value: unknown): string | null {
  if (isRecord(value)) {
    if (typeof value.key === "string") return value.key;
    if (value.status === "ok" && isRecord(value.result) && typeof value.result.key === "string") return value.result.key;
  }
  return null;
}

function extractPreparedSessionId(value: unknown): string | null {
  if (isRecord(value)) {
    if (typeof value.sessionId === "string") return value.sessionId;
    if (value.status === "ok" && isRecord(value.result) && typeof value.result.sessionId === "string") return value.result.sessionId;
  }
  return null;
}

function extractPreparedSessionFile(value: unknown): string | null {
  const entry = isRecord(value)
    ? isRecord(value.entry)
      ? value.entry
      : value.status === "ok" && isRecord(value.result) && isRecord(value.result.entry)
        ? value.result.entry
        : null
    : null;
  return entry && typeof entry.sessionFile === "string" ? entry.sessionFile : null;
}

function extractGatewayRunId(value: unknown): string | null {
  if (isRecord(value)) {
    if (typeof value.runId === "string") return value.runId;
    if (value.status === "ok" && isRecord(value.result) && typeof value.result.runId === "string") return value.result.runId;
  }
  return null;
}

function extractGatewayWaitStatus(value: unknown): string | null {
  if (isRecord(value)) {
    if (typeof value.status === "string" && typeof value.runId === "string") return value.status;
    if (value.status === "ok" && isRecord(value.result) && typeof value.result.status === "string") return value.result.status;
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
