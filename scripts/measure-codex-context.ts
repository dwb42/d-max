import { existsSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

type Profile = {
  name: string;
  description: string;
  paths: string[];
};

const profiles: Profile[] = [
  {
    name: "legacy-freshness-bulk",
    description: "Old AGENTS.md fixed freshness list if loaded as default context.",
    paths: [
      "docs/current-state.md",
      "docs/memory-map.md",
      "README.md",
      "data/schema.sql",
      "src/core/tool-definitions.ts",
      "src/tools",
      "src/api/server.ts",
      "src/chat",
      "src/voice",
      "web/src/App.tsx",
      "openclaw/workspace/AGENTS.md",
      "openclaw/workspace/TOOLS.md",
      "tests"
    ]
  },
  {
    name: "optimized-entry",
    description: "Recommended Codex entry context before targeted rg/sed inspection.",
    paths: [
      "AGENTS.md",
      "docs/memory-map.md",
      "docs/agent/CODEX_CONTEXT_MANAGEMENT.md"
    ]
  }
];

const root = process.cwd();
const results = profiles.map((profile) => {
  const files = profile.paths.flatMap((target) => collectFiles(path.resolve(root, target)));
  const uniqueFiles = [...new Map(files.map((file) => [file, file])).values()];
  const entries = uniqueFiles
    .map((file) => ({ file: path.relative(root, file), chars: statSync(file).size }))
    .sort((a, b) => b.chars - a.chars);
  const chars = entries.reduce((sum, entry) => sum + entry.chars, 0);
  return {
    profile,
    fileCount: entries.length,
    chars,
    approxTokens: approxTokens(chars),
    largest: entries.slice(0, 12)
  };
});

for (const result of results) {
  console.log(`${result.profile.name}`);
  console.log(`  ${result.profile.description}`);
  console.log(`  files: ${result.fileCount}`);
  console.log(`  chars: ${formatCount(result.chars)}`);
  console.log(`  approxTokens: ${formatCount(result.approxTokens)}`);
  console.log("  largest:");
  for (const entry of result.largest) {
    console.log(`    ${entry.file.padEnd(58)} ${formatCount(entry.chars).padStart(10)} chars  ~${formatCount(approxTokens(entry.chars)).padStart(8)} tokens`);
  }
  console.log("");
}

const legacy = results.find((result) => result.profile.name === "legacy-freshness-bulk");
const optimized = results.find((result) => result.profile.name === "optimized-entry");
if (legacy && optimized) {
  const saved = legacy.approxTokens - optimized.approxTokens;
  const savedPercent = legacy.approxTokens > 0 ? (saved / legacy.approxTokens) * 100 : 0;
  console.log("comparison");
  console.log(`  savedApproxTokens: ${formatCount(saved)}`);
  console.log(`  savedPercent: ${savedPercent.toFixed(1)}%`);
  console.log("  qualityModel: optimized-entry preserves freshness by loading the map and rules first, then requiring targeted authoritative code reads before claims or edits.");
}

function collectFiles(target: string): string[] {
  if (!existsSync(target)) {
    return [];
  }

  const stat = statSync(target);
  if (stat.isFile()) {
    return [target];
  }
  if (!stat.isDirectory()) {
    return [];
  }

  return readdirSync(target)
    .filter((name) => !ignoredPath(path.join(target, name)))
    .flatMap((name) => collectFiles(path.join(target, name)));
}

function ignoredPath(value: string): boolean {
  const relative = path.relative(root, value);
  return relative.startsWith("docs/archive/")
    || relative.startsWith("docs/ui/archive/")
    || relative.includes("/node_modules/")
    || relative.includes("/dist/")
    || relative.includes("/.git/");
}

function approxTokens(chars: number): number {
  return Math.ceil(chars / 4);
}

function formatCount(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}
