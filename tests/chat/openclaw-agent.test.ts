import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readOpenClawTrajectorySummary, resetOpenClawGatewayClientForTests, runOpenClawAgentTurn } from "../../src/chat/openclaw-agent.js";

describe("runOpenClawAgentTurn", () => {
  const originalPath = process.env.PATH;

  afterEach(() => {
    resetOpenClawGatewayClientForTests();
    process.env.PATH = originalPath;
    delete process.env.FAKE_OPENCLAW_GATEWAY_FAIL;
    delete process.env.OPENCLAW_GATEWAY_CLIENT_MODULE;
    delete process.env.OPENCLAW_STATE_DIR;
  });

  it("returns the assistant reply from the OpenClaw gateway call", async () => {
    const { configPath, stateDir } = installFakeGatewayClientModule();

    const result = await runOpenClawAgentTurn("hello", {
      configPath,
      stateDir,
      sessionId: "test-session",
      timeoutSeconds: 5
    });

    expect(result.text).toBe("ok from gateway");
  });

  it("falls back to the OpenClaw session file when the gateway request does not return", async () => {
    const { configPath, stateDir } = installFakeGatewayClientModule({
      requestBody: `
    setTimeout(() => {
      const sessionDir = path.join(process.env.OPENCLAW_STATE_DIR, "agents", "main", "sessions");
      fs.mkdirSync(sessionDir, { recursive: true });
      fs.writeFileSync(
        path.join(sessionDir, \`\${params.sessionId}.jsonl\`),
        JSON.stringify({
          type: "message",
          id: "assistant-1",
          timestamp: new Date().toISOString(),
          message: {
            role: "assistant",
            content: [{ type: "text", text: "ok from session file" }]
          }
        }) + "\\n"
      );
    }, 250);
    return new Promise(() => {});
`
    });

    const result = await runOpenClawAgentTurn("hello", {
      configPath,
      stateDir,
      sessionId: "test-session-fallback",
      timeoutSeconds: 0.1
    });

    expect(result.text).toBe("ok from session file");
  });

  it("summarizes OpenClaw trajectory timing for a session", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-trajectory-test-"));
    const stateDir = path.join(tempDir, "state");
    const sessionDir = path.join(stateDir, "agents", "main", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      path.join(sessionDir, "timed-session.trajectory.jsonl"),
      [
        {
          type: "session.started",
          ts: "2026-05-02T10:00:05.000Z",
          runId: "run-1",
          data: { toolCount: 42 }
        },
        {
          type: "model.completed",
          ts: "2026-05-02T10:00:09.250Z",
          runId: "run-1",
          data: { usage: { input: 100, output: 10, total: 110 } }
        },
        {
          type: "session.ended",
          ts: "2026-05-02T10:00:09.500Z",
          runId: "run-1",
          data: {}
        }
      ].map((record) => JSON.stringify(record)).join("\n")
    );

    const summary = readOpenClawTrajectorySummary("timed-session", {
      stateDir,
      after: "2026-05-02T10:00:00.000Z"
    });

    expect(summary?.runs).toEqual([
      expect.objectContaining({
        runId: "run-1",
        preSessionDelayMs: 5000,
        sessionToModelCompletedMs: 4250,
        sessionToEndedMs: 4500,
        toolCount: 42,
        usage: { input: 100, output: 10, total: 110 }
      })
    ]);
  });

  function installFakeGatewayClientModule(options: { requestBody?: string } = {}): { configPath: string; stateDir: string } {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-agent-test-"));
    const stateDir = path.join(tempDir, "state");
    const configPath = path.join(tempDir, "config.json");
    const modulePath = path.join(tempDir, "gateway-client.mjs");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(configPath, "{}");
    process.env.OPENCLAW_STATE_DIR = stateDir;
    writeFileSync(
      modulePath,
      `
import fs from "node:fs";
import path from "node:path";

export class t {
  constructor(options) {
    this.options = options;
  }

  start() {
    queueMicrotask(() => this.options.onHelloOk({ features: { methods: ["agent"] } }));
  }

  stop() {}

  async request(method, params) {
    if (method === "health") {
      return { status: "ok", result: { ok: true } };
    }

    if (method !== "agent") {
      throw new Error("unexpected method");
    }

    if (params.message !== "hello") {
      throw new Error("unexpected message");
    }

    ${options.requestBody ?? `
    return {
      status: "ok",
      result: { payloads: [{ text: "ok from gateway", mediaUrl: null }] }
    };
`}
  }
}
`
    );
    process.env.OPENCLAW_GATEWAY_CLIENT_MODULE = modulePath;

    return { configPath, stateDir };
  }
});
