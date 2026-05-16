import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tools } from "../../src/tools/index.js";

describe("DMAX OpenClaw dynamic tools plugin", () => {
  it("declares every current DMAX tool in the OpenClaw plugin contract", () => {
    const manifestPath = path.resolve("openclaw/plugins/dmax-dynamic-tools/openclaw.plugin.json");
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
      contracts?: {
        tools?: string[];
      };
    };

    const expectedTools = tools.map((tool) => `d-max__${tool.name}`);

    expect(manifest.contracts?.tools).toEqual(expectedTools);
  });

  it("keeps the OpenClaw plugin as an HTTP adapter without SQLite or DMAX repository imports", () => {
    const pluginDir = path.resolve("openclaw/plugins/dmax-dynamic-tools");
    const sources = listPluginSourceFiles(pluginDir).map((filePath) => ({
      filePath,
      source: readFileSync(filePath, "utf8")
    }));
    const combinedSource = sources.map(({ source }) => source).join("\n");

    for (const { filePath, source } of sources) {
      expect(source, filePath).not.toContain("better-sqlite3");
      expect(source, filePath).not.toContain("dist/src/db/connection");
      expect(source, filePath).not.toContain("dist/src/mcp/tool-registry");
      expect(source, filePath).not.toContain("src/repositories");
      expect(source, filePath).not.toContain("openDatabase");
      expect(source, filePath).not.toContain("createToolRunner");
    }
    expect(combinedSource).toContain("DMAX_TOOL_ENDPOINT_URL");
  });
});

function listPluginSourceFiles(dir: string): string[] {
  return readdirSync(dir)
    .flatMap((name) => {
      const filePath = path.join(dir, name);
      const stat = statSync(filePath);
      return stat.isDirectory() ? listPluginSourceFiles(filePath) : filePath;
    })
    .filter((filePath) => /\.(?:mjs|js|json)$/.test(filePath))
    .sort();
}
