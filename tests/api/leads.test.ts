import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("leads API", () => {
  let apiProcess: ChildProcess | null = null;
  let apiPort = 0;
  let tempDir = "";

  beforeEach(async () => {
    apiPort = await getFreePort();
    tempDir = mkdtempSync(path.join(os.tmpdir(), "dmax-leads-api-test-"));
    apiProcess = spawn(process.platform === "win32" ? "npm.cmd" : "npm", ["run", "api"], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "test",
        DATABASE_PATH: path.join(tempDir, "dmax.sqlite"),
        DMAX_SCHEMA_PATH: path.resolve("data/schema.sql"),
        DMAX_API_PORT: String(apiPort),
        DMAX_OPENCLAW_GATEWAY_URL: "http://127.0.0.1:9",
        DMAX_OPENCLAW_PREWARM: "0"
      },
      stdio: ["ignore", "pipe", "pipe"]
    });

    await waitForHealth(apiPort);
  }, 30_000);

  afterEach(async () => {
    if (!apiProcess) return;
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

  it("creates, lists, updates, and deletes leads", async () => {
    const statuses = await getJson<{ leadStatuses: Array<{ id: number; key: string }> }>(apiPort, "/api/config/lead-statuses");
    const fresh = statuses.leadStatuses.find((status) => status.key === "fresh")!;
    const contacted = statuses.leadStatuses.find((status) => status.key === "contacted")!;
    const category = await postJson<{ category: { id: number } }>(apiPort, "/api/categories", { name: "Leads" });
    const initiative = await postJson<{ initiative: { id: number } }>(apiPort, "/api/initiatives", { categoryId: category.category.id, name: "Lead API" });
    const person = await postJson<{ person: { id: number } }>(apiPort, "/api/people", { firstName: "Ada", lastName: "Lead" });

    const created = await postJson<{ lead: { id: number; partyId: number; initiativeId: number; status: { key: string } } }>(apiPort, "/api/leads", {
      partyId: person.person.id,
      initiativeId: initiative.initiative.id,
      statusId: fresh.id
    });
    expect(created.lead).toMatchObject({ partyId: person.person.id, initiativeId: initiative.initiative.id, status: { key: "fresh" } });

    const listed = await getJson<{ leads: Array<{ id: number }> }>(apiPort, `/api/leads?initiativeId=${initiative.initiative.id}`);
    expect(listed.leads.map((lead) => lead.id)).toEqual([created.lead.id]);

    const updated = await patchJson<{ lead: { id: number; status: { key: string } } }>(apiPort, `/api/leads/${created.lead.id}/status`, {
      statusId: contacted.id
    });
    expect(updated.lead.status.key).toBe("contacted");

    await deleteJson(apiPort, `/api/leads/${created.lead.id}`);
    const afterDelete = await getJson<{ leads: Array<{ id: number }> }>(apiPort, `/api/leads?initiativeId=${initiative.initiative.id}`);
    expect(afterDelete.leads).toEqual([]);
  });
});

function getFreePort(): Promise<number> {
  const server = http.createServer();
  return new Promise((resolve, reject) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      server.close();
      if (!address || typeof address === "string") {
        reject(new Error("Failed to allocate port"));
        return;
      }
      resolve(address.port);
    });
  });
}

async function waitForHealth(port: number): Promise<void> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${port}/health`);
      if (response.ok) return;
    } catch {
      // keep polling
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error("API server did not become healthy");
}

async function getJson<T>(port: number, pathName: string): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`);
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function postJson<T>(port: number, pathName: string, body: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function patchJson<T>(port: number, pathName: string, body: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}

async function deleteJson(port: number, pathName: string): Promise<void> {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, { method: "DELETE" });
  expect(response.status).toBe(200);
}
