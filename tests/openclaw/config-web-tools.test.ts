import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tools } from "../../src/tools/index.js";

describe("OpenClaw web config tools", () => {
  it("allows every current d-max MCP tool for the main web chat agent", () => {
    const configPath = path.resolve("openclaw/config.web.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      agents?: {
        list?: Array<{
          id?: string;
          tools?: {
            allow?: string[];
          };
        }>;
      };
    };
    const mainAgent = config.agents?.list?.find((agent) => agent.id === "main");
    const allowedTools = new Set(mainAgent?.tools?.allow ?? []);
    const expectedTools = tools.map((tool) => `d-max__${tool.name}`);

    expect(expectedTools).toEqual([
      "d-max__listCategories",
      "d-max__createCategory",
      "d-max__updateCategory",
      "d-max__listInitiatives",
      "d-max__getInitiative",
      "d-max__createInitiative",
      "d-max__updateInitiative",
      "d-max__archiveInitiative",
      "d-max__updateInitiativeMarkdown",
      "d-max__listTasks",
      "d-max__createTask",
      "d-max__updateTask",
      "d-max__completeTask",
      "d-max__deleteTask"
    ]);
    expect([...allowedTools].filter((tool) => tool.startsWith("d-max__")).sort()).toEqual([...expectedTools].sort());
  });

  it("keeps the research agent on current read-only initiative tool names", () => {
    const configPath = path.resolve("openclaw/config.web.json");
    const config = JSON.parse(readFileSync(configPath, "utf8")) as {
      agents?: {
        list?: Array<{
          id?: string;
          tools?: {
            allow?: string[];
          };
        }>;
      };
    };
    const researchAgent = config.agents?.list?.find((agent) => agent.id === "dmax-research");
    const allowedTools = new Set(researchAgent?.tools?.allow ?? []);

    expect(allowedTools.has("d-max__listInitiatives")).toBe(true);
    expect(allowedTools.has("d-max__getInitiative")).toBe(true);
    expect([...allowedTools].some((tool) => tool.includes("Project"))).toBe(false);
  });
});
