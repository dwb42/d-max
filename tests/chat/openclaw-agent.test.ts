import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  listOpenClawSessionActivities,
  readOpenClawTrajectorySummary,
  resetOpenClawGatewayClientForTests,
  runOpenClawAgentTurn,
  runOpenClawSessionTurn,
  summarizeOpenClawResearchActivities,
  summarizeOpenClawWorkspaceActivities
} from "../../src/chat/openclaw-agent.js";

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

  it("reads the active session transcript when OpenClaw replaces a cached session during a run", async () => {
    const { configPath, stateDir } = installFakeSessionGatewayClientModule();

    const result = await runOpenClawSessionTurn("hello", { sessionKey: "explicit:chat-1" }, {
      configPath,
      stateDir,
      timeoutSeconds: 5
    });

    expect(result.text).toBe("ok from replacement session");
    expect(result.sessionId).toBe("new-session");
  });

  it("waits for the final assistant reply after an external subagent completion instead of returning the early spawn note", async () => {
    const { configPath, stateDir } = installFakeSessionGatewayClientModuleWithDelayedSubagentCompletion();

    const result = await runOpenClawSessionTurn("hello", { sessionKey: "explicit:chat-subagent" }, {
      configPath,
      stateDir,
      timeoutSeconds: 5
    });

    expect(result.text).toBe("final workspace analysis");
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

  it("does not expose full markdown in updateInitiativeMarkdown activity details", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-activity-test-"));
    const stateDir = path.join(tempDir, "state");
    const sessionDir = path.join(stateDir, "agents", "main", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(
      path.join(sessionDir, "activity-session.jsonl"),
      JSON.stringify({
        type: "message",
        id: "assistant-activity-1",
        timestamp: new Date().toISOString(),
        message: {
          role: "assistant",
          content: [
            {
              type: "toolCall",
              id: "tool-call-1",
              name: "d-max__updateInitiativeMarkdown",
              arguments: {
                id: 9,
                markdown: "# Neuer Stand\n\nDieser lange Markdown-Inhalt sollte nicht im Aktivitaetsfeedback sichtbar sein."
              }
            }
          ]
        }
      }) + "\n"
    );

    const activities = listOpenClawSessionActivities("activity-session", { stateDir });

    expect(activities[0]).toMatchObject({
      kind: "tool_call",
      title: "Beschreibung aktualisieren gestartet",
      detail: expect.stringMatching(/^Initiative 9: Markdown wird gespeichert \(\d+ Zeichen\)\.$/)
    });
    expect(activities[0]?.detail).not.toContain("Dieser lange Markdown-Inhalt");
  });

  it("surfaces dmax-research web activity and builds a compact summary", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-research-activity-test-"));
    const stateDir = path.join(tempDir, "state");
    const mainSessionDir = path.join(stateDir, "agents", "main", "sessions");
    const researchSessionDir = path.join(stateDir, "agents", "dmax-research", "sessions");
    mkdirSync(mainSessionDir, { recursive: true });
    mkdirSync(researchSessionDir, { recursive: true });
    writeFileSync(path.join(mainSessionDir, "main-session.jsonl"), "");
    writeFileSync(
      path.join(researchSessionDir, "research-session.trajectory.jsonl"),
      [
        {
          type: "session.started",
          ts: "2026-05-19T10:00:01.000Z",
          sessionId: "research-session",
          data: { sessionFile: "$OPENCLAW_STATE_DIR/agents/dmax-research/sessions/research-session.jsonl" }
        },
        {
          type: "session.ended",
          ts: "2026-05-19T10:00:05.000Z",
          sessionId: "research-session",
          data: { status: "success" }
        }
      ].map((record) => JSON.stringify(record)).join("\n")
    );
    writeFileSync(
      path.join(researchSessionDir, "research-session.jsonl"),
      [
        {
          type: "message",
          id: "research-call-1",
          timestamp: "2026-05-19T10:00:02.000Z",
          message: {
            role: "assistant",
            content: [{ type: "toolCall", id: "web-1", name: "web_search", arguments: { query: "VSF Reiserad Stahl Rohloff" } }]
          }
        },
        {
          type: "message",
          id: "research-call-2",
          timestamp: "2026-05-19T10:00:03.000Z",
          message: {
            role: "assistant",
            content: [{ type: "toolCall", id: "web-2", name: "web_fetch", arguments: { url: "https://example.com/reiserad" } }]
          }
        }
      ].map((record) => JSON.stringify(record)).join("\n")
    );

    const activities = listOpenClawSessionActivities("main-session", { stateDir });
    const summary = summarizeOpenClawResearchActivities(activities);

    expect(activities).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "research", title: "Webrecherche-Agent gestartet", agentId: "dmax-research" }),
      expect.objectContaining({ kind: "tool_call", toolName: "web_search", query: "VSF Reiserad Stahl Rohloff", agentId: "dmax-research" }),
      expect.objectContaining({ kind: "tool_call", toolName: "web_fetch", url: "https://example.com/reiserad", agentId: "dmax-research" })
    ]));
    expect(summary).toMatchObject({
      agentId: "dmax-research",
      status: "completed",
      searchCount: 1,
      pageCount: 1,
      queries: ["VSF Reiserad Stahl Rohloff"],
      pages: [{ url: "https://example.com/reiserad" }]
    });
  });

  it("surfaces dmax-google-workspace sheets activity and builds a compact summary", () => {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-workspace-activity-test-"));
    const stateDir = path.join(tempDir, "state");
    const mainSessionDir = path.join(stateDir, "agents", "main", "sessions");
    const workspaceSessionDir = path.join(stateDir, "agents", "dmax-google-workspace", "sessions");
    mkdirSync(mainSessionDir, { recursive: true });
    mkdirSync(workspaceSessionDir, { recursive: true });
    writeFileSync(path.join(mainSessionDir, "main-session.jsonl"), "");
    writeFileSync(
      path.join(workspaceSessionDir, "workspace-session.trajectory.jsonl"),
      [
        {
          type: "session.started",
          ts: "2026-05-19T10:00:01.000Z",
          sessionId: "workspace-session",
          data: { sessionFile: "$OPENCLAW_STATE_DIR/agents/dmax-google-workspace/sessions/workspace-session.jsonl" }
        },
        {
          type: "session.ended",
          ts: "2026-05-19T10:00:05.000Z",
          sessionId: "workspace-session",
          data: { status: "success" }
        }
      ].map((record) => JSON.stringify(record)).join("\n")
    );
    writeFileSync(
      path.join(workspaceSessionDir, "workspace-session.jsonl"),
      [
        {
          type: "message",
          id: "workspace-call-1",
          timestamp: "2026-05-19T10:00:02.000Z",
          message: {
            role: "assistant",
            content: [{
              type: "toolCall",
              id: "runtime-1",
              name: "runtime",
              arguments: {
                command: "gog sheets get 1abcPackliste 'Tab1!A1:D20' --json"
              }
            }]
          }
        },
        {
          type: "message",
          id: "workspace-call-2",
          timestamp: "2026-05-19T10:00:03.000Z",
          message: {
            role: "assistant",
            content: [{
              type: "toolCall",
              id: "runtime-2",
              name: "runtime",
              arguments: {
                command: "gog docs get 1abcDoc --json"
              }
            }]
          }
        }
      ].map((record) => JSON.stringify(record)).join("\n")
    );

    const activities = listOpenClawSessionActivities("main-session", { stateDir });
    const summary = summarizeOpenClawWorkspaceActivities(activities);

    expect(activities).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "workspace", title: "Google-Workspace-Agent gestartet", agentId: "dmax-google-workspace" }),
      expect.objectContaining({
        kind: "tool_call",
        agentId: "dmax-google-workspace",
        command: "gog sheets get 1abcPackliste 'Tab1!A1:D20' --json",
        service: "sheets",
        operation: "get",
        fileId: "1abcPackliste",
        spreadsheetId: "1abcPackliste",
        range: "Tab1!A1:D20"
      }),
      expect.objectContaining({
        kind: "tool_call",
        agentId: "dmax-google-workspace",
        command: "gog docs get 1abcDoc --json",
        service: "docs",
        operation: "get",
        fileId: "1abcDoc"
      })
    ]));
    expect(summary).toMatchObject({
      agentId: "dmax-google-workspace",
      status: "completed",
      operationCount: 2,
      readCount: 2,
      writeCount: 0,
      operations: [
        { service: "sheets", operation: "get", fileId: "1abcPackliste", spreadsheetId: "1abcPackliste", range: "Tab1!A1:D20" },
        { service: "docs", operation: "get", fileId: "1abcDoc" }
      ]
    });
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

  function installFakeSessionGatewayClientModule(): { configPath: string; stateDir: string } {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-session-test-"));
    const stateDir = path.join(tempDir, "state");
    const configPath = path.join(tempDir, "config.json");
    const modulePath = path.join(tempDir, "gateway-client.mjs");
    const sessionDir = path.join(stateDir, "agents", "main", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(configPath, "{}");
    writeFileSync(path.join(sessionDir, "old-session.jsonl"), "");
    writeFileSync(
      path.join(sessionDir, "sessions.json"),
      JSON.stringify({
        "agent:main:explicit:chat-1": {
          sessionId: "old-session",
          sessionFile: path.join(sessionDir, "old-session.jsonl")
        }
      })
    );
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
    queueMicrotask(() => this.options.onHelloOk({ features: { methods: ["health", "sessions.create", "sessions.send", "agent.wait"] } }));
  }

  stop() {}

  async request(method, params) {
    const sessionDir = path.join(process.env.OPENCLAW_STATE_DIR, "agents", "main", "sessions");
    if (method === "health") {
      return { status: "ok", result: { ok: true } };
    }
    if (method === "sessions.create") {
      return {
        status: "ok",
        result: {
          key: params.key,
          sessionId: "old-session",
          entry: { sessionFile: path.join(sessionDir, "old-session.jsonl") }
        }
      };
    }
    if (method === "sessions.send") {
      fs.renameSync(path.join(sessionDir, "old-session.jsonl"), path.join(sessionDir, "old-session.jsonl.reset.test"));
      const newSessionFile = path.join(sessionDir, "new-session.jsonl");
      fs.writeFileSync(
        newSessionFile,
        JSON.stringify({
          type: "message",
          id: "assistant-2",
          timestamp: new Date().toISOString(),
          message: {
            role: "assistant",
            content: [{ type: "text", text: "ok from replacement session" }]
          }
        }) + "\\n"
      );
      fs.writeFileSync(
        path.join(sessionDir, "sessions.json"),
        JSON.stringify({
          "agent:main:explicit:chat-1": {
            sessionId: "new-session",
            sessionFile: newSessionFile
          }
        })
      );
      return { status: "ok", result: { runId: "run-1" } };
    }
    if (method === "agent.wait") {
      return { status: "ok", result: { status: "ok" } };
    }
    throw new Error("unexpected method " + method);
  }
}
`
    );
    process.env.OPENCLAW_GATEWAY_CLIENT_MODULE = modulePath;

    return { configPath, stateDir };
  }

  function installFakeSessionGatewayClientModuleWithDelayedSubagentCompletion(): { configPath: string; stateDir: string } {
    const tempDir = mkdtempSync(path.join(os.tmpdir(), "d-max-openclaw-subagent-wait-test-"));
    const stateDir = path.join(tempDir, "state");
    const configPath = path.join(tempDir, "config.json");
    const modulePath = path.join(tempDir, "gateway-client.mjs");
    const sessionDir = path.join(stateDir, "agents", "main", "sessions");
    mkdirSync(sessionDir, { recursive: true });
    writeFileSync(configPath, "{}");
    writeFileSync(path.join(sessionDir, "subagent-wait-session.jsonl"), "");
    writeFileSync(
      path.join(sessionDir, "sessions.json"),
      JSON.stringify({
        "agent:main:explicit:chat-subagent": {
          sessionId: "subagent-wait-session",
          sessionFile: path.join(sessionDir, "subagent-wait-session.jsonl")
        }
      })
    );
    process.env.OPENCLAW_STATE_DIR = stateDir;
    writeFileSync(
      modulePath,
      `
import fs from "node:fs";
import path from "node:path";

function appendRecord(sessionFile, record) {
  fs.appendFileSync(sessionFile, JSON.stringify(record) + "\\n");
}

export class t {
  constructor(options) {
    this.options = options;
  }

  start() {
    queueMicrotask(() => this.options.onHelloOk({ features: { methods: ["health", "sessions.create", "sessions.send", "agent.wait"] } }));
  }

  stop() {}

  async request(method, params) {
    const sessionDir = path.join(process.env.OPENCLAW_STATE_DIR, "agents", "main", "sessions");
    const sessionFile = path.join(sessionDir, "subagent-wait-session.jsonl");
    if (method === "health") {
      return { status: "ok", result: { ok: true } };
    }
    if (method === "sessions.create") {
      return {
        status: "ok",
        result: {
          key: params.key,
          sessionId: "subagent-wait-session",
          entry: { sessionFile }
        }
      };
    }
    if (method === "sessions.send") {
      appendRecord(sessionFile, {
        type: "message",
        id: "assistant-early",
        timestamp: new Date().toISOString(),
        message: {
          role: "assistant",
          content: [
            { type: "text", text: "early workspace spawn note" },
            {
              type: "toolCall",
              id: "spawn-1",
              name: "sessions_spawn",
              arguments: {
                runtime: "subagent",
                agentId: "dmax-google-workspace",
                context: "isolated",
                task: "read sheet"
              }
            }
          ]
        }
      });
      appendRecord(sessionFile, {
        type: "message",
        id: "spawn-result",
        timestamp: new Date().toISOString(),
        message: {
          role: "toolResult",
          content: [{
            type: "text",
            text: JSON.stringify({
              status: "accepted",
              childSessionKey: "agent:dmax-google-workspace:subagent:test-child",
              runId: "child-run-1"
            })
          }]
        }
      });
      setTimeout(() => {
        appendRecord(sessionFile, {
          type: "message",
          id: "internal-completion",
          timestamp: new Date().toISOString(),
          message: {
            role: "user",
            content: [{
              type: "text",
              text: "[Internal task completion event]\\nsession_key: agent:dmax-google-workspace:subagent:test-child\\nstatus: completed successfully\\nResult: done"
            }]
          }
        });
        appendRecord(sessionFile, {
          type: "message",
          id: "assistant-final",
          timestamp: new Date().toISOString(),
          message: {
            role: "assistant",
            content: [{ type: "text", text: "final workspace analysis" }]
          }
        });
      }, 200);
      return { status: "ok", result: { runId: "run-1" } };
    }
    if (method === "agent.wait") {
      return { status: "ok", result: { status: "ok" } };
    }
    throw new Error("unexpected method " + method);
  }
}
`
    );
    process.env.OPENCLAW_GATEWAY_CLIENT_MODULE = modulePath;

    return { configPath, stateDir };
  }
});
