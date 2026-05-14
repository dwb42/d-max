import { existsSync } from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const [, , sourceEntry, builtEntry, ...entryArgs] = process.argv;

if (!sourceEntry || !builtEntry) {
  console.error("Usage: node scripts/run-ts-or-built.mjs <source-entry.ts> <built-entry.js> [...args]");
  process.exit(1);
}

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.resolve(rootDir, sourceEntry);
const builtPath = path.resolve(rootDir, builtEntry);
const localTsx = path.join(rootDir, "node_modules", ".bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const shouldUseBuilt = (process.env.NODE_ENV === "production" && existsSync(builtPath)) || !existsSync(localTsx);

const command = shouldUseBuilt ? process.execPath : localTsx;
const args = [shouldUseBuilt ? builtPath : sourcePath, ...entryArgs];

if (!existsSync(command)) {
  console.error(`Could not run entrypoint. Missing ${command}.`);
  process.exit(1);
}

const result = spawnSync(command, args, {
  cwd: rootDir,
  env: process.env,
  stdio: "inherit"
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
