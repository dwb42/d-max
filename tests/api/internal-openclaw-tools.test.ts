import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("internal OpenClaw tool endpoint", () => {
  const token = "test-internal-token";
  let apiProcess: ChildProcess | null = null;
  let apiPort = 0;
  let tempDir = "";

  beforeEach(async () => {
    apiPort = await getFreePort();
    tempDir = mkdtempSync(path.join(os.tmpdir(), "dmax-internal-tools-test-"));
    apiProcess = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "api"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_PATH: path.join(tempDir, "dmax.sqlite"),
        DMAX_SCHEMA_PATH: path.resolve("data/schema.sql"),
        DMAX_API_PORT: String(apiPort),
        DMAX_INTERNAL_TOOL_TOKEN: token,
        DMAX_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:9",
        DMAX_OPENCLAW_PREWARM: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    await waitForHealth(apiPort);
  }, 30_000);

  afterEach(async () => {
    if (!apiProcess) {
      return;
    }
    apiProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => apiProcess?.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2000))
    ]);
    if (apiProcess.exitCode === null) {
      apiProcess.kill("SIGKILL");
    }
    apiProcess = null;
  });

  it("requires bearer auth", async () => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/listCategories`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ input: {} })
    });

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ ok: false, error: "Unauthorized internal tool request." });
  });

  it("runs listCategories through the API-owned tool runner", async () => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/listCategories`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ input: {}, traceId: "test-list-categories" })
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean; result: { ok: boolean; data: Array<{ name: string }> } };
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(true);
    expect(body.result.data.some((category) => category.name === "Inbox")).toBe(true);
  });

  it("preserves validation error result envelopes", async () => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/createTask`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ input: { title: "" }, traceId: "test-validation-error" })
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean; result: { ok: false; error: string } };
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(false);
    expect(body.result.error).toContain("String must contain at least 1 character");
  });

  it("preserves normal tool error result envelopes", async () => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/createTask`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ input: { title: "Needs initiative" }, traceId: "test-tool-error" })
    });

    expect(response.status).toBe(200);
    const body = await response.json() as { ok: boolean; result: { ok: false; error: string } };
    expect(body.ok).toBe(true);
    expect(body.result).toEqual({
      ok: false,
      error: "initiativeId or primaryPartyId is required unless useInboxIfInitiativeMissing is true"
    });
  });

  it("runs initiative mindmap freestyle CRUD through the API-owned tool runner", async () => {
    const category = await postTool<{ id: number }>(apiPort, token, "createCategory", { name: "Mindmap API" });
    const categoryData = expectToolData(category);
    const initiative = await postTool<{ id: number }>(apiPort, token, "createInitiative", {
      categoryId: categoryData.id,
      type: "project",
      name: "API Mindmap Project"
    });
    const initiativeData = expectToolData(initiative);

    const created = await postTool<{ nodeKey: string; label: string; parentNodeKey: string }>(
      apiPort,
      token,
      "createMindmapFreestyleNode",
      { initiativeId: initiativeData.id, label: "API node" }
    );
    const createdData = expectToolData(created);
    const updated = await postTool<{ nodeKey: string; label: string; x: number; y: number; collapsed: boolean }>(
      apiPort,
      token,
      "updateMindmapFreestyleNode",
      {
        initiativeId: initiativeData.id,
        nodeKey: createdData.nodeKey,
        label: "Updated API node",
        x: 360,
        y: 180,
        collapsed: true
      }
    );
    const deleted = await postTool<{ deleted: true; deletedNodeKeys: string[] }>(apiPort, token, "deleteMindmapFreestyleNode", {
      initiativeId: initiativeData.id,
      nodeKey: createdData.nodeKey
    });

    expect(created.result).toMatchObject({
      ok: true,
      data: {
        label: "API node",
        parentNodeKey: "branch:freestyle"
      }
    });
    expect(updated.result).toMatchObject({
      ok: true,
      data: {
        nodeKey: createdData.nodeKey,
        label: "Updated API node",
        x: 360,
        y: 180,
        collapsed: true
      }
    });
    expect(deleted.result).toMatchObject({
      ok: true,
      data: {
        deleted: true,
        deletedNodeKeys: [createdData.nodeKey]
      }
    });
  });

  it("preserves initiative mindmap validation errors, tool errors, and subtree confirmation envelopes", async () => {
    const category = await postTool<{ id: number }>(apiPort, token, "createCategory", { name: "Mindmap Errors" });
    const categoryData = expectToolData(category);
    const initiative = await postTool<{ id: number }>(apiPort, token, "createInitiative", {
      categoryId: categoryData.id,
      type: "project",
      name: "API Mindmap Errors"
    });
    const initiativeData = expectToolData(initiative);

    const validation = await postTool<unknown>(apiPort, token, "createMindmapFreestyleNode", {
      initiativeId: initiativeData.id,
      label: ""
    });
    const derivedUpdate = await postTool<unknown>(apiPort, token, "updateMindmapFreestyleNode", {
      initiativeId: initiativeData.id,
      nodeKey: `initiative:${initiativeData.id}`,
      x: 12
    });
    const parent = await postTool<{ nodeKey: string }>(apiPort, token, "createMindmapFreestyleNode", {
      initiativeId: initiativeData.id,
      label: "Parent"
    });
    const parentData = expectToolData(parent);
    const child = await postTool<{ nodeKey: string }>(apiPort, token, "createMindmapFreestyleNode", {
      initiativeId: initiativeData.id,
      parentNodeKey: parentData.nodeKey,
      label: "Child"
    });
    const childData = expectToolData(child);
    const confirmation = await postTool<unknown>(apiPort, token, "deleteMindmapFreestyleNode", {
      initiativeId: initiativeData.id,
      nodeKey: parentData.nodeKey
    });

    expect(validation.result).toMatchObject({ ok: false, error: expect.stringContaining("String must contain at least 1 character") });
    expect(derivedUpdate.result).toMatchObject({ ok: false, error: expect.stringContaining("Only freestyle") });
    expect(confirmation.result).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "deleteMindmapFreestyleNodeSubtree",
      proposedAction: {
        tool: "deleteMindmapFreestyleNode",
        input: { initiativeId: initiativeData.id, nodeKey: parentData.nodeKey }
      }
    });
    expect((confirmation.result as { summary: string }).summary).toContain(parentData.nodeKey);
    expect((confirmation.result as { summary: string }).summary).toContain(childData.nodeKey);
  });

  it("preserves confirmation request result envelopes", async () => {
    const createResponse = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/createTask`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ input: { title: "Confirm delete shape", useInboxIfInitiativeMissing: true }, traceId: "test-create-before-confirmation" })
    });
    const createBody = await createResponse.json() as { result: { ok: true; data: { id: number } } };

    const response = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/deleteTask`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ input: { id: createBody.result.data.id, confirmed: true }, traceId: "test-confirmation-shape" })
    });

    expect(response.status).toBe(200);
    const body = await response.json() as {
      ok: boolean;
      result: {
        ok: false;
        requiresConfirmation: true;
        confirmationKind: string;
        proposedAction: { tool: string; input: Record<string, unknown> };
      };
    };
    expect(body.ok).toBe(true);
    expect(body.result.ok).toBe(false);
    expect(body.result.requiresConfirmation).toBe(true);
    expect(body.result.confirmationKind).toBe("deleteTask");
    expect(body.result.proposedAction).toEqual({
      tool: "deleteTask",
      input: { id: createBody.result.data.id }
    });
  });

  it("rejects unknown tools", async () => {
    const response = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/notATool`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${token}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ input: {} })
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, error: "Unknown tool: notATool" });
  });
});

function getFreePort(): Promise<number> {
  const server = http.createServer();
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        throw new Error("free port probe did not bind to TCP");
      }
      const port = address.port;
      server.close(() => resolve(port));
    });
  });
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 20_000;
  let lastError: unknown;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) {
        return;
      }
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`API did not become healthy for internal tool test.${lastError instanceof Error ? ` ${lastError.message}` : ""}`);
}

type InternalToolSuccess<TData> = { ok: true; result: { ok: true; data: TData } };
type InternalToolFailure = {
  ok: true;
  result: {
    ok: false;
    error?: string;
    requiresConfirmation?: true;
    confirmationKind?: string;
    summary?: string;
    proposedAction?: unknown;
  };
};
type InternalToolResponse<TData> = InternalToolSuccess<TData> | InternalToolFailure;

async function postTool<TData>(
  apiPort: number,
  token: string,
  toolName: string,
  input: unknown
): Promise<InternalToolResponse<TData>> {
  const response = await fetch(`http://127.0.0.1:${apiPort}/internal/openclaw/tools/${toolName}`, {
    method: "POST",
    headers: {
      authorization: `Bearer ${token}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({ input, traceId: `test-${toolName}` })
  });

  expect(response.status).toBe(200);
  return await response.json() as InternalToolResponse<TData>;
}

function expectToolData<TData>(response: InternalToolResponse<TData>): TData {
  expect(response.result).toMatchObject({ ok: true });
  return (response.result as { ok: true; data: TData }).data;
}
