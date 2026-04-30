import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { runOpenClawAgentTurn } from "../../src/chat/openclaw-agent.js";

describe("runOpenClawAgentTurn", () => {
  const originalPath = process.env.PATH;

  afterEach(() => {
    process.env.PATH = originalPath;
    delete process.env.FAKE_OPENCLAW_GATEWAY_FAIL;
    delete process.env.OPENCLAW_GATEWAY_CLIENT_MODULE;
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

  function installFakeGatewayClientModule(): { configPath: string; stateDir: string } {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-agent-test-"));
    const stateDir = path.join(tempDir, "state");
    const configPath = path.join(tempDir, "config.json");
    const modulePath = path.join(tempDir, "gateway-client.mjs");
    mkdirSync(stateDir, { recursive: true });
    writeFileSync(configPath, "{}");
    writeFileSync(
      modulePath,
      `
export class t {
  constructor(options) {
    this.options = options;
  }

  start() {
    queueMicrotask(() => this.options.onHelloOk({ features: { methods: ["agent"] } }));
  }

  stop() {}

  async request(method, params) {
    if (method !== "agent") {
      throw new Error("unexpected method");
    }

    if (params.message !== "hello") {
      throw new Error("unexpected message");
    }

    return {
      status: "ok",
      result: { payloads: [{ text: "ok from gateway", mediaUrl: null }] }
    };
  }
}
`
    );
    process.env.OPENCLAW_GATEWAY_CLIENT_MODULE = modulePath;

    return { configPath, stateDir };
  }
});
