import { spawn, type ChildProcess } from "node:child_process";
import { env } from "../src/config/env.js";
import {
  onOpenClawGatewayProcessExit,
  stopOpenClawGatewayProcess,
  warmOpenClawGatewayForProduction
} from "../src/chat/openclaw-agent.js";

type ManagedProcess = {
  name: string;
  child: ChildProcess;
};

const openClawReadyTimeoutMs = 5 * 60_000;
const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const managedProcesses: ManagedProcess[] = [];
let shuttingDown = false;

async function main(): Promise<void> {
  onOpenClawGatewayProcessExit(({ code, signal }) => {
    if (shuttingDown) {
      return;
    }

    const exitCode = code ?? 1;
    console.error(`[prod] OpenClaw gateway exited${signal ? ` with ${signal}` : ` with code ${exitCode}`}. Shutting down.`);
    void shutdown(exitCode === 0 ? 1 : exitCode);
  });

  console.log("[prod] Starting OpenClaw gateway...");
  const warmupStartedAt = Date.now();
  const warmupLog = setInterval(() => {
    const elapsedSeconds = Math.round((Date.now() - warmupStartedAt) / 1000);
    console.log(`[prod] Still waiting for OpenClaw gateway health (${elapsedSeconds}s)...`);
  }, 15_000);

  try {
    await warmOpenClawGatewayForProduction({ readyTimeoutMs: openClawReadyTimeoutMs });
  } finally {
    clearInterval(warmupLog);
  }

  console.log("[prod] OpenClaw is ready. Running database migrations...");
  await runNpmScript("setup");

  console.log("[prod] Starting d-max API and web server...");
  startManagedProcess("api", ["run", "api:prod"]);
  console.log(`[prod] d-max listening on http://localhost:${env.dmaxApiPort}`);
}

function runNpmScript(scriptName: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(npmCommand, ["run", scriptName], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`npm run ${scriptName} exited${signal ? ` with ${signal}` : ` with code ${code ?? 1}`}`));
    });
  });
}

function startManagedProcess(name: string, args: string[]): void {
  const child = spawn(npmCommand, args, {
    cwd: process.cwd(),
    detached: process.platform !== "win32",
    env: process.env,
    stdio: "inherit"
  });

  managedProcesses.push({ name, child });

  child.on("error", (error) => {
    if (shuttingDown) {
      return;
    }

    console.error(`[prod] ${name} failed to start: ${error.message}`);
    void shutdown(1);
  });

  child.on("exit", (code, signal) => {
    if (shuttingDown) {
      return;
    }

    const exitCode = code ?? 1;
    console.error(`[prod] ${name} exited${signal ? ` with ${signal}` : ` with code ${exitCode}`}. Shutting down.`);
    void shutdown(exitCode === 0 ? 1 : exitCode);
  });
}

async function shutdown(exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  for (const managed of managedProcesses) {
    stopManagedProcess(managed);
  }
  stopOpenClawGatewayProcess();

  await Promise.race([
    Promise.all(managedProcesses.map((managed) => waitForExit(managed.child))),
    delay(5000)
  ]);

  process.exit(exitCode);
}

function stopManagedProcess(managed: ManagedProcess): void {
  const { child } = managed;
  if (!child.pid || child.killed || child.exitCode !== null) {
    return;
  }

  try {
    if (process.platform === "win32") {
      child.kill("SIGTERM");
    } else {
      process.kill(-child.pid, "SIGTERM");
    }
  } catch (error) {
    console.error(`[prod] Could not stop ${managed.name}: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}

function waitForExit(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.killed) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    child.once("exit", () => resolve());
  });
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

process.on("SIGINT", () => {
  void shutdown(0);
});

process.on("SIGTERM", () => {
  void shutdown(0);
});

main().catch((error: unknown) => {
  console.error(`[prod] Startup failed: ${error instanceof Error ? error.message : "unknown error"}`);
  void shutdown(1);
});
