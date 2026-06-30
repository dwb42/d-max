import { spawn, type ChildProcess } from "node:child_process";
import { mkdtempSync } from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("party activity summary API", () => {
  let apiProcess: ChildProcess | null = null;
  let apiPort = 0;
  let tempDir = "";

  beforeEach(async () => {
    apiPort = await getFreePort();
    tempDir = mkdtempSync(path.join(os.tmpdir(), "dmax-party-summary-api-test-"));
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

  it("returns stable batch summaries and ignores unknown party ids", async () => {
    const ada = await postJson<{ person: { id: number } }>(apiPort, "/api/people", {
      firstName: "Ada",
      lastName: "Kontakt"
    });
    const ben = await postJson<{ person: { id: number } }>(apiPort, "/api/people", {
      firstName: "Ben",
      lastName: "Kontakt"
    });
    const task = await postJson<{ task: { id: number } }>(apiPort, "/api/tasks", {
      primaryPartyId: ada.person.id,
      title: "Ada anrufen",
      dueAt: "2026-07-01T10:00:00.000Z"
    });

    const response = await postJson<{
      summaries: Array<{
        partyId: number;
        stats: { measureTotal: number; openMeasureTotal: number };
        nextAction: { taskId: number; title: string } | null;
      }>;
    }>(apiPort, "/api/parties/activity-summaries", {
      partyIds: [ben.person.id, 999_999, ada.person.id]
    });

    expect(response.summaries.map((summary) => summary.partyId)).toEqual([ben.person.id, ada.person.id]);
    expect(response.summaries[0].nextAction).toBeNull();
    expect(response.summaries[1]).toMatchObject({
      stats: {
        measureTotal: 1,
        openMeasureTotal: 1
      },
      nextAction: {
        taskId: task.task.id,
        title: "Ada anrufen"
      }
    });
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

async function postJson<T>(port: number, pathName: string, body: unknown): Promise<T> {
  const response = await fetch(`http://127.0.0.1:${port}${pathName}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  expect(response.status).toBe(200);
  return response.json() as Promise<T>;
}
