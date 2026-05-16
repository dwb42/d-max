import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("production topology rollback docs", () => {
  const docs = [
    "README.md",
    "docs/architecture/DMAX_OPENCLAW_512_TWO_CONTAINER_PRODUCTION_PROMOTION_VALIDATION_2026-05-16.md"
  ];
  const rollbackArtifacts = [
    "AGENTS.md",
    "openclaw/config.production-512.json",
    "openclaw/plugins/dmax-dynamic-tools",
    "scripts/validate-prod-topology.ts",
    "src/telegram/bot.ts",
    "tests/api/internal-openclaw-tools.test.ts",
    "tests/chat/openclaw-external-gateway.test.ts",
    "tests/openclaw/dmax-dynamic-tools-http-adapter.test.ts",
    "tests/openclaw/dmax-dynamic-tools-plugin.test.ts",
    "tests/openclaw/prod-topology-validation-harness.test.ts",
    "tests/openclaw/production-compose.test.ts",
    "tests/openclaw/production-rollback-docs.test.ts",
    "tests/telegram/bot.test.ts"
  ];

  it.each(docs)("lists every new production-promotion artifact in %s rollback instructions", (docPath) => {
    const source = readFileSync(path.resolve(docPath), "utf8");

    for (const artifact of rollbackArtifacts) {
      expect(source, artifact).toContain(artifact);
    }
  });

  it("keeps current agent instructions on the promoted two-container production topology", () => {
    const source = readFileSync(path.resolve("AGENTS.md"), "utf8");

    expect(source).toContain("Production OpenClaw uses the Dockerfile pin `openclaw@2026.5.12`");
    expect(source).toContain("Production is a two-container Docker Compose");
    expect(source).toContain("`dmax-openclaw` owns OpenClaw Gateway");
    expect(source).not.toContain("Production OpenClaw currently uses the Dockerfile pin `openclaw@2026.4.26`");
    expect(source).not.toContain("Production deploy is single-container Docker Compose");
    expect(source).not.toContain("dmax-codex-auth");
  });
});
