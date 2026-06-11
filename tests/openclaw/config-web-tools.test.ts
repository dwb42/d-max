import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { tools } from "../../src/tools/index.js";

describe("OpenClaw web config tools", () => {
  it.each(["openclaw/config.web.json", "openclaw/config.staging-512.json", "openclaw/config.production.json", "openclaw/config.production-512.json"])(
    "allows exactly the current d-max tools for the main agent in %s",
    (configPathInput) => {
      const config = readOpenClawConfig(configPathInput);
      const mainAgent = config.agents?.list?.find((agent) => agent.id === "main");
      const allowedTools = new Set(mainAgent?.tools?.allow ?? []);
      const expectedTools = tools.map((tool) => `d-max__${tool.name}`);
      const expectedOrchestrationTools = ["agents_list", "sessions_list", "sessions_spawn", "sessions_send", "sessions_yield", "session_status", "subagents"];

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
        "d-max__listInitiativeRelations",
        "d-max__createInitiativeRelation",
        "d-max__deleteInitiativeRelation",
        "d-max__getInitiativeGraph",
        "d-max__getInitiativeMindmap",
        "d-max__summarizeInitiativeMindmap",
        "d-max__draftMindmapChanges",
        "d-max__commitMindmapChangeDraft",
        "d-max__createMindmapFreestyleNode",
        "d-max__updateMindmapFreestyleNode",
        "d-max__deleteMindmapFreestyleNode",
        "d-max__listTasks",
        "d-max__createTask",
        "d-max__updateTask",
        "d-max__completeTask",
        "d-max__deleteTask",
        "d-max__listTaskChecklistItems",
        "d-max__createTaskChecklistItem",
        "d-max__updateTaskChecklistItem",
        "d-max__deleteTaskChecklistItem",
        "d-max__reorderTaskChecklistItems",
        "d-max__listMediaAttachments",
        "d-max__attachMediaToEntity",
        "d-max__updateMediaAttachment",
        "d-max__deleteMediaAttachment",
        "d-max__reorderMediaAttachments",
        "d-max__listPeople",
        "d-max__getPerson",
        "d-max__createPerson",
        "d-max__updatePerson",
        "d-max__listOrganizations",
        "d-max__getOrganization",
        "d-max__createOrganization",
        "d-max__updateOrganization",
        "d-max__listRelationshipTypes",
        "d-max__listPartyRelationships",
        "d-max__createPartyRelationship",
        "d-max__deletePartyRelationship",
        "d-max__listParticipantRoleTypes",
        "d-max__listEntityParticipants",
        "d-max__createEntityParticipant",
        "d-max__deleteEntityParticipant",
        "d-max__listPartyContactPoints",
        "d-max__createPartyContactPoint",
        "d-max__updatePartyContactPoint"
      ]);
      expect([...allowedTools].filter((tool) => tool.startsWith("d-max__")).sort()).toEqual([...expectedTools].sort());
      expect([...allowedTools].filter((tool) => !tool.startsWith("d-max__")).sort()).toEqual([...expectedOrchestrationTools].sort());
      expect(allowedTools.size).toBe(expectedTools.length + expectedOrchestrationTools.length);
    }
  );

  it.each(["openclaw/config.production.json", "openclaw/config.production-512.json"])(
    "keeps the research agent on current read-only initiative tool names in %s",
    (configPathInput) => {
      const config = readOpenClawConfig(configPathInput);
      const researchAgent = config.agents?.list?.find((agent) => agent.id === "dmax-research");
      const allowedTools = new Set(researchAgent?.tools?.allow ?? []);

      expect(allowedTools.has("d-max__listInitiatives")).toBe(true);
      expect(allowedTools.has("d-max__getInitiative")).toBe(true);
      expect([...allowedTools].some((tool) => tool.includes("Project"))).toBe(false);
    }
  );

  it.each(["openclaw/config.production.json", "openclaw/config.production-512.json"])(
    "keeps web/research and bundled tool groups out of the default DMAX turn in %s",
    (configPathInput) => {
      const config = readOpenClawConfig(configPathInput);
      const mainAgent = config.agents?.list?.find((agent) => agent.id === "main");
      const researchAgent = config.agents?.list?.find((agent) => agent.id === "dmax-research");
      const mainTools = new Set(mainAgent?.tools?.allow ?? []);
      const researchTools = new Set(researchAgent?.tools?.allow ?? []);
      const researchDeny = new Set(researchAgent?.tools?.deny ?? []);
      const forbiddenDefaultTools = [
        "group:web",
        "group:runtime",
        "group:fs",
        "group:media",
        "group:automation",
        "group:sessions",
        "browser",
        "canvas",
        "gateway",
        "media",
        "memory",
        "sandbox",
        "tts"
      ];

      for (const toolName of forbiddenDefaultTools) {
        expect(mainTools.has(toolName), toolName).toBe(false);
      }
      expect(mainTools.has("sessions_spawn")).toBe(true);
      expect(mainTools.has("sessions_send")).toBe(true);
      expect(mainTools.has("sessions_yield")).toBe(true);
      expect(mainTools.has("subagents")).toBe(true);
      expect(mainAgent?.subagents?.allowAgents).toEqual(["dmax-research", "dmax-google-workspace"]);
      expect(mainAgent?.subagents?.requireAgentId).toBe(true);
      expect(researchTools.has("group:web")).toBe(true);
      expect([...researchDeny]).toEqual(expect.arrayContaining([
        "group:runtime",
        "group:fs",
        "group:media",
        "group:automation",
        "group:sessions",
        "browser",
        "canvas",
        "gateway",
        "media",
        "memory",
        "sandbox",
        "tts"
      ]));
    }
  );

  it.each(["openclaw/config.web.json", "openclaw/config.staging-512.json", "openclaw/config.production.json", "openclaw/config.production-512.json"])(
    "keeps Google Workspace isolated in a dedicated runtime subagent in %s",
    (configPathInput) => {
      const config = readOpenClawConfig(configPathInput);
      const googleAgent = config.agents?.list?.find((agent) => agent.id === "dmax-google-workspace");
      const allowedTools = new Set(googleAgent?.tools?.allow ?? []);
      const deniedTools = new Set(googleAgent?.tools?.deny ?? []);

      expect(googleAgent).toBeTruthy();
      expect(allowedTools.has("group:runtime")).toBe(true);
      expect(allowedTools.has("group:web")).toBe(false);
      expect(deniedTools.has("group:web")).toBe(true);
      expect(deniedTools.has("group:sessions")).toBe(true);
      expect(googleAgent?.subagents?.allowAgents).toEqual([]);
    }
  );

  it.each(["openclaw/config.production.json", "openclaw/config.production-512.json"])(
    "keeps production 5.12 on the Codex runtime route with only expected plugins in %s",
    (configPathInput) => {
      const config = readOpenClawConfig(configPathInput);

      expect(config.agents?.defaults?.model?.primary).toBe("openai/gpt-5.5");
      expect(config.agents?.defaults?.models?.["openai/gpt-5.5"]?.agentRuntime?.id).toBe("codex");
      expect(config.plugins?.allow).toEqual(["openai", "codex", "dmax-dynamic-tools"]);
      expect(config.gateway?.auth?.mode).toBe("token");
    }
  );

  it("keeps the production config alias mirrored to the 5.12 production config", () => {
    expect(readOpenClawConfig("openclaw/config.production.json")).toEqual(
      readOpenClawConfig("openclaw/config.production-512.json")
    );
  });

  it.each(["openclaw/config.production.json", "openclaw/config.production-512.json"])(
    "keeps account-specific auth metadata out of %s",
    (configPathInput) => {
      const config = readOpenClawConfig(configPathInput);
      const forbiddenKeyPattern = /(?:^|\.)(?:email|accountEmail|accessToken|refreshToken|idToken|deviceCode|userCode|requestId)$/i;
      const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i;
      const oauthLikeSecretPattern = /\b(?:sk-proj|xai-|AIza|GOCSPX|AAH[A-Za-z0-9_-]{20,})[A-Za-z0-9_-]*/;

      for (const entry of flattenConfig(config)) {
        expect(entry.path, entry.path).not.toMatch(forbiddenKeyPattern);
        if (typeof entry.value === "string") {
          expect(entry.value, entry.path).not.toMatch(emailPattern);
          expect(entry.value, entry.path).not.toMatch(oauthLikeSecretPattern);
        }
      }
    }
  );
});

function readOpenClawConfig(configPathInput: string): {
  agents?: {
    defaults?: {
      model?: {
        primary?: string;
      };
      models?: Record<string, { agentRuntime?: { id?: string } }>;
    };
    list?: Array<{
      id?: string;
      tools?: {
        allow?: string[];
        deny?: string[];
      };
      subagents?: {
        allowAgents?: string[];
        requireAgentId?: boolean;
      };
    }>;
  };
  plugins?: {
    allow?: string[];
  };
  gateway?: {
    auth?: {
      mode?: string;
    };
  };
} {
  const configPath = path.resolve(configPathInput);
  return JSON.parse(readFileSync(configPath, "utf8")) as ReturnType<typeof readOpenClawConfig>;
}

function flattenConfig(value: unknown, prefix = "$"): Array<{ path: string; value: unknown }> {
  if (!value || typeof value !== "object") {
    return [{ path: prefix, value }];
  }
  if (Array.isArray(value)) {
    return value.flatMap((entry, index) => flattenConfig(entry, `${prefix}[${index}]`));
  }
  return Object.entries(value).flatMap(([key, entry]) => flattenConfig(entry, `${prefix}.${key}`));
}
