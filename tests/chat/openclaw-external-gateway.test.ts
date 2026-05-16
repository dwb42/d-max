import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("OpenClaw external gateway configuration", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.resetModules();
  });

  it("uses DMAX_OPENCLAW_GATEWAY_URL instead of the local loopback gateway", async () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "dmax-external-gateway-test-"));
    const modulePath = path.join(tempDir, "gateway-client.mjs");
    const seenUrlPath = path.join(tempDir, "seen-url.txt");
    const seenOptionsPath = path.join(tempDir, "seen-options.json");
    mkdirSync(path.join(tempDir, "state"), { recursive: true });
    writeFileSync(
      modulePath,
      `
import fs from "node:fs";

export class t {
  constructor(options) {
    this.options = options;
    fs.writeFileSync(${JSON.stringify(seenUrlPath)}, options.url);
    fs.writeFileSync(${JSON.stringify(seenOptionsPath)}, JSON.stringify({
      hasDeviceIdentityOverride: Object.prototype.hasOwnProperty.call(options, "deviceIdentity"),
      token: options.token ?? null,
      scopes: options.scopes
    }));
  }

  start() {
    queueMicrotask(() => this.options.onHelloOk({ features: { methods: ["health"] } }));
  }

  stop() {}

  async request(method) {
    if (method !== "health") {
      throw new Error("unexpected method");
    }
    return { status: "ok", result: { ok: true } };
  }
}
`
    );

    process.env.NODE_ENV = "test";
    process.env.OPENCLAW_GATEWAY_CLIENT_MODULE = modulePath;
    process.env.DMAX_OPENCLAW_GATEWAY_URL = "http://dmax-openclaw:18789";
    process.env.OPENCLAW_GATEWAY_TOKEN = "test-gateway-token";
    vi.resetModules();
    const openclawAgent = await import("../../src/chat/openclaw-agent.js");

    const status = await openclawAgent.checkOpenClawGatewayStatus({ stateDir: path.join(tempDir, "state") });
    openclawAgent.resetOpenClawGatewayConnectionForTests();

    expect(status.state).toBe("ready");
    expect(readFileSync(seenUrlPath, "utf8")).toBe("ws://dmax-openclaw:18789");
    expect(JSON.parse(readFileSync(seenOptionsPath, "utf8"))).toEqual({
      hasDeviceIdentityOverride: false,
      token: "test-gateway-token",
      scopes: ["operator.admin", "operator.read", "operator.write"]
    });
  });

  it("requires DMAX_OPENCLAW_GATEWAY_URL in production", async () => {
    process.env.NODE_ENV = "production";
    process.env.DMAX_OPENCLAW_GATEWAY_URL = "";
    vi.resetModules();

    await expect(import("../../src/config/env.js")).rejects.toThrow("DMAX_OPENCLAW_GATEWAY_URL is required when NODE_ENV=production.");
  });
});
