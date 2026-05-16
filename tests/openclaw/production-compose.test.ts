import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("production Docker Compose OpenClaw topology", () => {
  const compose = readFileSync(path.resolve("docker-compose.yml"), "utf8");
  const dockerfile = readFileSync(path.resolve("Dockerfile"), "utf8");
  const packageJson = JSON.parse(readFileSync(path.resolve("package.json"), "utf8")) as {
    scripts?: Record<string, string>;
  };

  it("defines exactly the two production services", () => {
    expect(serviceNames(compose)).toEqual(["dmax-api", "dmax-openclaw"]);
  });

  it("pins production OpenClaw packages to 2026.5.12", () => {
    const apiService = serviceBlock(compose, "dmax-api");
    const openClawService = serviceBlock(compose, "dmax-openclaw");

    expect(apiService).toContain("OPENCLAW_VERSION: 2026.5.12");
    expect(openClawService).toContain("OPENCLAW_VERSION: 2026.5.12");
    expect(dockerfile).toContain("ARG OPENCLAW_VERSION=2026.5.12");
    expect(dockerfile).toContain("openclaw@${OPENCLAW_VERSION}");
    expect(dockerfile).toContain("@openclaw/codex@${OPENCLAW_VERSION}");
    expect(dockerfile).not.toContain("openclaw@latest");
    expect(dockerfile).not.toContain("@openclaw/codex@latest");
  });

  it("runs dmax-api against the external OpenClaw gateway", () => {
    expect(compose).toContain("dmax-api:");
    expect(compose).toContain("DMAX_OPENCLAW_GATEWAY_URL: http://dmax-openclaw:18789");
    expect(compose).toContain("DMAX_OPENCLAW_MODEL: openai/gpt-5.5");
    expect(compose).toContain("command: [\"npm\", \"run\", \"api:prod\"]");
    expect(compose).not.toContain("command: [\"npm\", \"run\", \"start:prod\"]");
  });

  it("removes the legacy production subprocess entrypoint", () => {
    expect(packageJson.scripts).not.toHaveProperty("start:prod");
    expect(packageJson.scripts).not.toHaveProperty("start:container");
    expect(existsSync(path.resolve("scripts/start-prod.ts"))).toBe(false);
    expect(existsSync(path.resolve("scripts/start-container.sh"))).toBe(false);
  });

  it("keeps OpenClaw gateway internal and token protected", () => {
    const apiService = serviceBlock(compose, "dmax-api");
    const openClawService = serviceBlock(compose, "dmax-openclaw");

    expect(apiService).toContain("127.0.0.1:${DMAX_HOST_PORT:-49415}:3088");
    expect(apiService).toContain("DMAX_INTERNAL_TOOL_TOKEN: ${DMAX_INTERNAL_TOOL_TOKEN:?set DMAX_INTERNAL_TOOL_TOKEN for production}");
    expect(apiService).toContain("OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN:?set OPENCLAW_GATEWAY_TOKEN for production}");
    expect(openClawService).toContain("DMAX_TOOL_ENDPOINT_URL: http://dmax-api:3088/internal/openclaw/tools");
    expect(openClawService).toContain("DMAX_INTERNAL_TOOL_TOKEN: ${DMAX_INTERNAL_TOOL_TOKEN:?set DMAX_INTERNAL_TOOL_TOKEN for production}");
    expect(openClawService).toContain("OPENCLAW_GATEWAY_TOKEN: ${OPENCLAW_GATEWAY_TOKEN:?set OPENCLAW_GATEWAY_TOKEN for production}");
    expect(openClawService).toContain("exec openclaw gateway run --force --port 18789 --auth token --bind lan");
    expect(openClawService).toContain("expose:");
    expect(openClawService).not.toContain("\n    ports:");
  });

  it("does not pass the repo .env or unrelated service secrets into dmax-openclaw", () => {
    const apiService = serviceBlock(compose, "dmax-api");
    const openClawService = serviceBlock(compose, "dmax-openclaw");

    expect(apiService).toContain("env_file:");
    expect(openClawService).not.toContain("env_file:");
    expect(openClawService).not.toContain("OPENAI_API_KEY");
    expect(openClawService).not.toContain("XAI_API_KEY");
    expect(openClawService).not.toContain("LIVEKIT_API_KEY");
    expect(openClawService).not.toContain("LIVEKIT_API_SECRET");
    expect(openClawService).not.toContain("GOOGLE_OAUTH_CLIENT_SECRET");
    expect(openClawService).not.toContain("TWILIO_AUTH_TOKEN");
    expect(openClawService).not.toContain("TELEGRAM_BOT_TOKEN");
  });

  it("keeps dmax-openclaw environment scoped to gateway and internal tool wiring", () => {
    const openClawService = serviceBlock(compose, "dmax-openclaw");

    expect(environmentKeys(openClawService)).toEqual([
      "DMAX_INTERNAL_TOOL_TOKEN",
      "DMAX_TOOL_ENDPOINT_URL",
      "NODE_ENV",
      "OPENCLAW_CONFIG_PATH",
      "OPENCLAW_DISABLE_BONJOUR",
      "OPENCLAW_GATEWAY_TOKEN",
      "OPENCLAW_STATE_DIR"
    ]);
  });

  it("keeps Codex/OpenClaw state out of dmax-api and DMAX data out of dmax-openclaw", () => {
    expect(compose).toContain("dmax-openclaw:");
    expect(compose).toContain("OPENCLAW_CONFIG_PATH: /app/openclaw/config.production-512.json");
    expect(compose).toContain("OPENCLAW_STATE_DIR: /app/data/openclaw-state");
    expect(compose).toContain("cp -a /usr/local/lib/node_modules/@openclaw/codex");
    expect(compose).toContain("ln -sfn /usr/local/lib/node_modules/@openai/codex");
    expect(compose).toContain("dmax-openclaw-state:/app/data/openclaw-state");
    expect(compose).toContain("dmax-openclaw-state:/app/openclaw-state:ro");
    expect(compose).not.toContain("/root/.codex");
    expect(compose).not.toContain("dmax-codex-auth");

    const openClawService = serviceBlock(compose, "dmax-openclaw");
    expect(openClawService).not.toContain("dmax-data:/app/data");
    expect(openClawService).not.toContain("DATABASE_PATH:");
    expect(openClawService).not.toContain("DMAX_MEDIA_STORAGE_DIR:");
    expect(openClawService).not.toContain("GOOGLE_CALENDAR_TOKEN_PATH:");
    expect(openClawService).toContain(
      "unset DATABASE_PATH DMAX_MEDIA_STORAGE_DIR GOOGLE_CALENDAR_TOKEN_PATH DMAX_OPENCLAW_CLIENT_STATE_DIR DMAX_WEB_DIST_DIR DMAX_SCHEMA_PATH"
    );
    expect(dockerfile).not.toContain('VOLUME ["/app/data"]');
    expect(dockerfile).toContain("@openclaw/codex@${OPENCLAW_VERSION}");
  });

  it("keeps production service volume mounts on the ownership boundary", () => {
    expect(volumeMounts(serviceBlock(compose, "dmax-api"))).toEqual([
      "dmax-data:/app/data",
      "dmax-openclaw-state:/app/openclaw-state:ro"
    ]);
    expect(volumeMounts(serviceBlock(compose, "dmax-openclaw"))).toEqual([
      "dmax-openclaw-state:/app/data/openclaw-state"
    ]);
  });
});

function serviceBlock(compose: string, serviceName: string): string {
  const match = new RegExp(`^  ${serviceName}:$`, "m").exec(compose);
  expect(match?.index).toBeGreaterThanOrEqual(0);
  const start = match!.index;
  const nextService = compose.slice(start + 1).search(/\n  [a-zA-Z0-9_-]+:\n/);
  return nextService === -1 ? compose.slice(start) : compose.slice(start, start + 1 + nextService);
}

function serviceNames(compose: string): string[] {
  const servicesStart = compose.indexOf("services:\n");
  const volumesStart = compose.indexOf("\nvolumes:\n");
  expect(servicesStart).toBeGreaterThanOrEqual(0);
  expect(volumesStart).toBeGreaterThan(servicesStart);
  const servicesBlock = compose.slice(servicesStart, volumesStart);
  return [...servicesBlock.matchAll(/^  ([a-zA-Z0-9_-]+):$/gm)].map((match) => match[1]).sort();
}

function environmentKeys(service: string): string[] {
  const environmentStart = service.indexOf("\n    environment:\n");
  expect(environmentStart).toBeGreaterThanOrEqual(0);
  const afterEnvironment = service.slice(environmentStart + "\n    environment:\n".length);
  const nextTopLevelKey = afterEnvironment.search(/\n    [a-zA-Z0-9_-]+:\n/);
  const environmentBlock = nextTopLevelKey === -1 ? afterEnvironment : afterEnvironment.slice(0, nextTopLevelKey);
  return [...environmentBlock.matchAll(/^      ([A-Z0-9_]+):/gm)].map((match) => match[1]).sort();
}

function volumeMounts(service: string): string[] {
  const volumesStart = service.indexOf("\n    volumes:\n");
  expect(volumesStart).toBeGreaterThanOrEqual(0);
  const afterVolumes = service.slice(volumesStart + "\n    volumes:\n".length);
  const nextTopLevelKey = afterVolumes.search(/\n    [a-zA-Z0-9_-]+:\n/);
  const volumesBlock = nextTopLevelKey === -1 ? afterVolumes : afterVolumes.slice(0, nextTopLevelKey);
  return [...volumesBlock.matchAll(/^      - ([^\n]+)$/gm)].map((match) => match[1]).sort();
}
