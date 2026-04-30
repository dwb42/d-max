import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { env } from "../config/env.js";

const execFileAsync = promisify(execFile);

export type OpenClawAgentResult = {
  text: string;
  raw: unknown;
};

export type OpenClawAgentOptions = {
  configPath?: string;
  stateDir?: string;
  model?: string;
  sessionId?: string;
  timeoutSeconds?: number;
};

export async function runOpenClawAgentTurn(message: string, options: OpenClawAgentOptions = {}): Promise<OpenClawAgentResult> {
  const timeoutSeconds = options.timeoutSeconds ?? env.dmaxOpenClawTimeoutSeconds;
  const { stdout } = await execFileAsync(
    "openclaw",
    [
      "agent",
      "--local",
      "--model",
      options.model ?? env.dmaxOpenClawModel,
      "--session-id",
      options.sessionId ?? env.dmaxOpenClawSessionId,
      "--message",
      message,
      "--json",
      "--timeout",
      String(timeoutSeconds)
    ],
    {
      cwd: process.cwd(),
      timeout: (timeoutSeconds + 15) * 1000,
      maxBuffer: 1024 * 1024 * 20,
      env: {
        ...process.env,
        OPENCLAW_CONFIG_PATH: options.configPath ?? env.dmaxOpenClawConfigPath,
        OPENCLAW_STATE_DIR: options.stateDir ?? env.dmaxOpenClawStateDir
      }
    }
  );

  const parsed = parseOpenClawJson(stdout);
  const text = extractReplyText(parsed);
  return { text, raw: parsed };
}

function parseOpenClawJson(stdout: string): unknown {
  const jsonStart = stdout.indexOf('{\n  "payloads"');
  if (jsonStart === -1) {
    throw new Error("OpenClaw did not return a JSON agent result.");
  }

  return JSON.parse(stdout.slice(jsonStart));
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
