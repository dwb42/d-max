import { spawn } from "node:child_process";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { env } from "../config/env.js";

export type OpenClawAgentResult = {
  text: string;
  raw: unknown;
  activities: OpenClawActivity[];
};

export type OpenClawActivity = {
  id: string;
  kind: "tool_call" | "tool_result" | "plan" | "thinking";
  status: "running" | "completed" | "failed";
  title: string;
  detail?: string;
  timestamp?: string;
};

export type OpenClawAgentOptions = {
  configPath?: string;
  stateDir?: string;
  model?: string;
  sessionId?: string;
  timeoutSeconds?: number;
};

let gatewayProcess: ReturnType<typeof spawn> | null = null;
let gatewayStartPromise: Promise<void> | null = null;
let gatewayAgentWarmupPromise: Promise<void> | null = null;
let gatewayClientModulePromise: Promise<OpenClawGatewayClientModule> | null = null;

type OpenClawGatewayClientModule = {
  GatewayClient: new (options: OpenClawGatewayClientOptions) => OpenClawGatewayClient;
};

type OpenClawGatewayClientOptions = {
  url: string;
  clientName: string;
  clientDisplayName: string;
  clientVersion: string;
  mode: string;
  role: string;
  scopes: string[];
  deviceIdentity?: null;
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

export async function runOpenClawAgentTurn(message: string, options: OpenClawAgentOptions = {}): Promise<OpenClawAgentResult> {
  const timeoutSeconds = options.timeoutSeconds ?? env.dmaxOpenClawTimeoutSeconds;
  const sessionId = options.sessionId ?? env.dmaxOpenClawSessionId;
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  const model = options.model ?? env.dmaxOpenClawModel;
  clearStaleOpenClawRuntimeLocks(stateDir);
  await waitForOpenClawAgentWarmup();

  try {
    return await runOpenClawGatewayTurn(message, {
      configPath,
      stateDir,
      model,
      sessionId,
      timeoutSeconds
    });
  } catch (error) {
    if (isGatewayUnavailableError(error)) {
      await ensureOpenClawGateway({ configPath, stateDir });
      return await retryOpenClawGatewayTurn(message, {
        configPath,
        stateDir,
        model,
        sessionId,
        timeoutSeconds
      });
    }
    throw error;
  }
}

export async function warmOpenClawGateway(options: Pick<OpenClawAgentOptions, "configPath" | "stateDir"> = {}): Promise<void> {
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  const configPath = options.configPath ?? env.dmaxOpenClawConfigPath;
  clearStaleOpenClawRuntimeLocks(stateDir);
  gatewayAgentWarmupPromise ??= (async () => {
    await ensureOpenClawGateway({ configPath, stateDir });
  })().finally(() => {
    gatewayAgentWarmupPromise = null;
  });
  await gatewayAgentWarmupPromise;
}

async function waitForOpenClawAgentWarmup(): Promise<void> {
  if (!gatewayAgentWarmupPromise) {
    return;
  }

  try {
    await gatewayAgentWarmupPromise;
  } catch {
    // The real user turn below will surface an actionable OpenClaw error if the gateway still fails.
  }
}

async function ensureOpenClawGateway(options: { configPath: string; stateDir: string }): Promise<void> {
  if (gatewayStartPromise) {
    return gatewayStartPromise;
  }

  gatewayStartPromise = startOpenClawGateway(options).finally(() => {
    gatewayStartPromise = null;
  });
  return gatewayStartPromise;
}

async function startOpenClawGateway(options: { configPath: string; stateDir: string }): Promise<void> {
  const runtimeConfigPath = prepareRuntimeOpenClawConfig(options.configPath, options.stateDir);
  if (!gatewayProcess || gatewayProcess.killed || gatewayProcess.exitCode !== null) {
    gatewayProcess = spawn(
      "openclaw",
      ["gateway", "run", "--port", "18789", "--auth", "none", "--bind", "loopback"],
      {
        cwd: process.cwd(),
        env: {
          ...process.env,
          OPENCLAW_CONFIG_PATH: runtimeConfigPath,
          OPENCLAW_STATE_DIR: options.stateDir,
          OPENCLAW_DISABLE_BONJOUR: "1"
        },
        stdio: ["ignore", "ignore", "ignore"]
      }
    );
    gatewayProcess.unref();
  }

  await waitForOpenClawGateway(options);
}

function prepareRuntimeOpenClawConfig(configPath: string, stateDir: string): string {
  const runtimeConfigPath = path.join(stateDir, "config.web.runtime.json");
  const parsed = JSON.parse(readFileSync(configPath, "utf8")) as Record<string, unknown>;

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
  delete parsed.meta;

  mkdirSync(path.dirname(runtimeConfigPath), { recursive: true });
  writeFileSync(runtimeConfigPath, `${JSON.stringify(parsed, null, 2)}\n`, { mode: 0o600 });
  return runtimeConfigPath;
}

async function waitForOpenClawGateway(options: { configPath: string; stateDir: string }): Promise<void> {
  const deadline = Date.now() + 120_000;
  let lastError: unknown = null;

  while (Date.now() < deadline) {
    try {
      await callOpenClawGateway("health", {}, { stateDir: options.stateDir, timeoutMs: 10_000 });
      return;
    } catch (error) {
      lastError = error;
      await delay(2000);
    }
  }

  throw new Error(`OpenClaw gateway did not become ready within 120s.${lastError instanceof Error ? ` ${lastError.message}` : ""}`);
}

async function retryOpenClawGatewayTurn(
  message: string,
  options: Required<Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "model" | "sessionId" | "timeoutSeconds">>
): Promise<OpenClawAgentResult> {
  try {
    return await runOpenClawGatewayTurn(message, options);
  } catch (error) {
    if (!isGatewayUnavailableError(error)) {
      throw error;
    }

    await waitForOpenClawGateway({
      configPath: options.configPath,
      stateDir: options.stateDir
    });
    return await runOpenClawGatewayTurn(message, options);
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function runOpenClawGatewayTurn(
  message: string,
  options: Required<Pick<OpenClawAgentOptions, "configPath" | "stateDir" | "model" | "sessionId" | "timeoutSeconds">>
): Promise<OpenClawAgentResult> {
  const sessionFile = getOpenClawSessionFile(options.stateDir, options.sessionId);
  const initialSessionFileSize = getFileSize(sessionFile);
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
      sessionFallback: { sessionFile, initialSessionFileSize, sessionId: options.sessionId }
    }
  );

  const text = extractGatewayReplyText(parsed);
  return { text, raw: parsed, activities: readOpenClawSessionActivities(sessionFile, initialSessionFileSize) };
}

export function listOpenClawSessionActivities(sessionId: string, options: Pick<OpenClawAgentOptions, "stateDir"> = {}): OpenClawActivity[] {
  const stateDir = options.stateDir ?? env.dmaxOpenClawStateDir;
  return readOpenClawSessionActivities(getOpenClawSessionFile(stateDir, sessionId), 0);
}

async function callOpenClawGateway(
  method: string,
  params: unknown,
  options: {
    expectFinal?: boolean;
    stateDir: string;
    timeoutMs: number;
    sessionFallback?: { sessionFile: string; initialSessionFileSize: number; sessionId: string };
  }
): Promise<unknown> {
  const { GatewayClient } = await loadOpenClawGatewayClientModule();

  return await new Promise((resolve, reject) => {
    let settled = false;
    let connected = false;
    const previousOpenClawStateDir = process.env.OPENCLAW_STATE_DIR;
    process.env.OPENCLAW_STATE_DIR = options.stateDir;
    const timeout = setTimeout(() => {
      finish(new Error(`OpenClaw gateway call timed out after ${Math.round(options.timeoutMs / 1000)}s.`));
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
        }, 250)
      : null;

    const client = new GatewayClient({
      url: "ws://127.0.0.1:18789",
      clientName: "gateway-client",
      clientDisplayName: "d-max web chat",
      clientVersion: "d-max",
      mode: "backend",
      role: "operator",
      scopes: ["operator.admin"],
      minProtocol: 3,
      maxProtocol: 3,
      onHelloOk: async () => {
        connected = true;
        try {
          const result = await client.request(method, params, {
            expectFinal: options.expectFinal,
            timeoutMs: options.timeoutMs
          });
          finish(null, result);
        } catch (error) {
          finish(error);
        }
      },
      onClose: (code, reason) => {
        if (settled) {
          return;
        }

        finish(new Error(`OpenClaw gateway closed (${code}): ${reason || "no close reason"}`));
      },
      onConnectError: (error) => {
        if (settled || connected) {
          return;
        }

        finish(error);
      }
    });

    function finish(error: unknown, value?: unknown): void {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);
      if (sessionPoll) {
        clearInterval(sessionPoll);
      }
      if (previousOpenClawStateDir === undefined) {
        delete process.env.OPENCLAW_STATE_DIR;
      } else {
        process.env.OPENCLAW_STATE_DIR = previousOpenClawStateDir;
      }
      try {
        client.stop();
      } catch {
        // The request result is already known; close cleanup must not mask it.
      }

      if (error) {
        reject(error);
      } else {
        resolve(value);
      }
    }

    client.start();
  });
}

async function loadOpenClawGatewayClientModule(): Promise<OpenClawGatewayClientModule> {
  gatewayClientModulePromise ??= import(pathToFileURL(resolveOpenClawGatewayClientPath()).href).then((module) => ({
    GatewayClient: module.t as OpenClawGatewayClientModule["GatewayClient"]
  }));
  return gatewayClientModulePromise;
}

function resolveOpenClawGatewayClientPath(): string {
  const explicitPath = process.env.OPENCLAW_GATEWAY_CLIENT_MODULE;
  if (explicitPath) {
    return explicitPath;
  }

  const globalRoot = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
  const distDir = path.join(globalRoot, "openclaw", "dist");
  const fileName = readdirSync(distDir).find((name) => {
    if (!/^client-[A-Za-z0-9_-]+\.js$/.test(name)) {
      return false;
    }

    return readFileSync(path.join(distDir, name), "utf8").includes("GatewayClient as t");
  });
  if (!fileName) {
    throw new Error(`Could not locate OpenClaw gateway client module in ${distDir}.`);
  }

  return path.join(distDir, fileName);
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

function getFileSize(filePath: string): number {
  if (!existsSync(filePath)) {
    return 0;
  }

  try {
    return statSync(filePath).size;
  } catch {
    return 0;
  }
}

function readCompletedSessionReply(
  sessionFile: string,
  initialFileSize: number
): { text: string; messageId?: string } | null {
  if (!existsSync(sessionFile)) {
    return null;
  }

  let content: Buffer;
  try {
    content = readFileSync(sessionFile);
  } catch {
    return null;
  }

  const newContent = (content.length >= initialFileSize ? content.subarray(initialFileSize) : content).toString("utf8");
  const records = newContent
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map(parseJsonLine)
    .filter(isRecord);

  if (!records.some(isAssistantMessageRecord)) {
    return null;
  }

  const assistantRecords = records.filter(isAssistantMessageRecord);
  const lastAssistant = assistantRecords.at(-1);
  if (!lastAssistant) {
    return null;
  }

  const text = extractAssistantRecordText(lastAssistant);
  if (!text) {
    return null;
  }

  return { text, messageId: typeof lastAssistant.id === "string" ? lastAssistant.id : undefined };
}

function readOpenClawSessionActivities(sessionFile: string, initialFileSize: number): OpenClawActivity[] {
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

function activityFromSessionRecord(record: Record<string, unknown>): OpenClawActivity[] {
  if (record.type !== "message" || !isRecord(record.message)) {
    return [];
  }

  const message = record.message;
  const timestamp = typeof record.timestamp === "string" ? record.timestamp : undefined;
  if (message.role === "toolResult") {
    const toolName = typeof message.toolName === "string" ? message.toolName : "tool";
    const isError = message.isError === true;
    const detail = summarizeToolResult(toolName, isRecord(message.details) ? message.details : null);
    return [
      {
        id: `result-${String(message.toolCallId ?? record.id ?? cryptoRandomId())}`,
        kind: "tool_result",
        status: isError ? "failed" : "completed",
        title: `${formatToolName(toolName)} ${isError ? "fehlgeschlagen" : "abgeschlossen"}`,
        detail,
        timestamp
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
        return [
          {
            id: `call-${String(part.id ?? record.id ?? cryptoRandomId())}-${index}`,
            kind: part.name === "update_plan" ? "plan" : "tool_call",
            status: "running",
            title: part.name === "update_plan" ? "Plan aktualisiert" : `${formatToolName(part.name)} gestartet`,
            detail: summarizeToolArguments(part.name, args),
            timestamp
          } satisfies OpenClawActivity
        ];
      }

      if (part.type === "thinking" && typeof part.thinking === "string" && part.thinking.trim()) {
        return [
          {
            id: `thinking-${String(record.id ?? cryptoRandomId())}-${index}`,
            kind: "thinking",
            status: "completed",
            title: "Gedankenschritt",
            detail: part.thinking.trim().replace(/\s+/g, " ").slice(0, 220),
            timestamp
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

  if (toolName === "web_search" && typeof args.query === "string") {
    return args.query;
  }

  if (toolName === "web_fetch" && typeof args.url === "string") {
    return args.url;
  }

  if (toolName === "update_plan" && Array.isArray(args.plan)) {
    return args.plan
      .filter(isRecord)
      .map((item) => (typeof item.step === "string" ? item.step : ""))
      .filter(Boolean)
      .join(" · ");
  }

  const firstString = Object.values(args).find((value) => typeof value === "string");
  return typeof firstString === "string" ? firstString : undefined;
}

function summarizeToolResult(toolName: string, details: Record<string, unknown> | null): string | undefined {
  if (!details) {
    return undefined;
  }

  const tookMs = typeof details.tookMs === "number" ? ` · ${Math.round(details.tookMs / 100) / 10}s` : "";
  if (toolName === "web_search" && typeof details.query === "string") {
    return `${details.query}${tookMs}`;
  }

  if (toolName === "web_fetch") {
    const status = typeof details.status === "number" ? `HTTP ${details.status}` : "fetch";
    const url = typeof details.finalUrl === "string" ? details.finalUrl : typeof details.url === "string" ? details.url : "";
    return `${status}${url ? ` · ${url}` : ""}${tookMs}`;
  }

  return tookMs ? tookMs.slice(3) : undefined;
}

function formatToolName(name: string): string {
  const labels: Record<string, string> = {
    web_search: "Websuche",
    web_fetch: "Webseite lesen",
    update_plan: "Plan"
  };
  return labels[name] ?? name.replaceAll("_", " ");
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
