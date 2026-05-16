import { spawnSync } from "node:child_process";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  metricGroup,
  openClawOverheadMs,
  parseArgs,
  sanitizeModelStatus,
  sanitizeOpenClawStatus,
  sanitizeOperationalText,
  validateSamples,
  type ChatSample
} from "../../scripts/validate-prod-topology.js";
import type { AppChatTurnTrace } from "../../src/chat/turn-trace.js";

describe("production topology validation harness", () => {
  it("computes OpenClaw overhead excluding model time", () => {
    const trace = traceWithRuns([
      {
        preSessionDelayMs: 120,
        sessionToModelCompletedMs: 900,
        sessionToEndedMs: 1250,
        toolCount: 0
      },
      {
        preSessionDelayMs: 80,
        sessionToModelCompletedMs: 700,
        sessionToEndedMs: 740,
        toolCount: 1
      }
    ]);

    expect(openClawOverheadMs(trace)).toBe(590);
  });

  it("sanitizes model auth status down to missing provider names only", () => {
    expect(sanitizeModelStatus({
      missingProvidersInUse: ["openai"],
      profiles: {
        "openai:default": {
          email: "do-not-print@example.com",
          token: "secret"
        }
      }
    })).toEqual({
      missingProvidersInUse: ["openai"]
    });
  });

  it("redacts backend device request ids from validation output", () => {
    const requestId = "ea7a5ed3-e3ef-4d3b-8a73-643d7d8412b8";

    expect(sanitizeOperationalText(`pairing required: device is not approved yet (requestId: ${requestId})`)).toBe(
      "pairing required: device is not approved yet (requestId: <redacted>)"
    );
    expect(sanitizeOperationalText(`{"requestId":"${requestId}"}`)).toBe("{\"requestId\":\"<redacted>\"}");
    expect(sanitizeOpenClawStatus({
      state: "starting",
      detail: `device pairing required (requestId: ${requestId})`,
      checkedAt: "2026-05-16T13:00:00.000Z"
    })).toEqual({
      state: "starting",
      detail: "device pairing required (requestId: <redacted>)",
      checkedAt: "2026-05-16T13:00:00.000Z"
    });
  });

  it("passes when warmup, simple, and tool samples meet latency and tool-use gates", () => {
    const warmup = sample("warmup", 1, { wallMs: 900, overheadMs: 120, toolCount: 0, activityToolCalls: 0 });
    const simple = [
      sample("simple", 1, { wallMs: 1200, overheadMs: 200, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 2, { wallMs: 1300, overheadMs: 250, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 3, { wallMs: 1400, overheadMs: 300, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 4, { wallMs: 1500, overheadMs: 350, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 5, { wallMs: 1600, overheadMs: 400, toolCount: 0, activityToolCalls: 0 })
    ];
    const tool = [
      sample("tool", 1, { wallMs: 1800, overheadMs: 300, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] }),
      sample("tool", 2, { wallMs: 1900, overheadMs: 350, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden abgeschlossen"] }),
      sample("tool", 3, { wallMs: 2000, overheadMs: 400, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["d-max__listCategories gestartet"] }),
      sample("tool", 4, { wallMs: 2100, overheadMs: 450, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["listCategories abgeschlossen"] }),
      sample("tool", 5, { wallMs: 2200, overheadMs: 500, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] })
    ];

    expect(validateSamples(warmup, simple, tool)).toEqual([]);
  });

  it("fails missing trajectory, unexpected simple tool-call activities, missing tool calls, and latency breaches", () => {
    const warmup = sample("warmup", 1, {
      wallMs: 10_001,
      overheadMs: null,
      runCount: 0,
      toolCount: 0,
      activityToolCalls: 0
    });
    const simple = [
      sample("simple", 1, { wallMs: 1000, overheadMs: 100, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 2, { wallMs: 1200, overheadMs: 200, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 3, { wallMs: 1300, overheadMs: 300, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 4, { wallMs: 1400, overheadMs: 400, toolCount: 0, activityToolCalls: 0 }),
      sample("simple", 5, { wallMs: 6000, overheadMs: 5000, toolCount: 47, activityToolCalls: 1 })
    ];
    const tool = [
      sample("tool", 1, { wallMs: 1000, overheadMs: 100, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] }),
      sample("tool", 2, { wallMs: 1200, overheadMs: 200, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] }),
      sample("tool", 3, { wallMs: 1300, overheadMs: 300, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] }),
      sample("tool", 4, { wallMs: 1400, overheadMs: 400, toolCount: 1, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] }),
      sample("tool", 5, { wallMs: 8000, overheadMs: 5000, toolCount: 0, activityToolCalls: 0, activityToolTitles: [] })
    ];

    expect(validateSamples(warmup, simple, tool)).toEqual(expect.arrayContaining([
      "warmup #1 has no OpenClaw trajectory runs. Provider auth/device approval may be missing.",
      "Warmup wall time 10.001s is >= 10s.",
      "simple #5 unexpectedly used tools.",
      "tool #5 did not show a DMAX tool call.",
      "tool #5 did not show the d-max__listCategories tool in chat activities.",
      "Simple overhead P95 5.000s is >= 5s.",
      "Simple total wall P95 6.000s is >= 6s.",
      "Tool overhead P95 5.000s is >= 5s.",
      "Tool total wall P95 8.000s is >= 8s."
    ]));
  });

  it("does not treat exposed trajectory tool definitions as simple-turn tool use", () => {
    const warmup = sample("warmup", 1, { wallMs: 900, overheadMs: 120, toolCount: 47, activityToolCalls: 0 });
    const simple = [
      sample("simple", 1, { wallMs: 1200, overheadMs: 200, toolCount: 47, activityToolCalls: 0 }),
      sample("simple", 2, { wallMs: 1300, overheadMs: 250, toolCount: 47, activityToolCalls: 0 }),
      sample("simple", 3, { wallMs: 1400, overheadMs: 300, toolCount: 47, activityToolCalls: 0 }),
      sample("simple", 4, { wallMs: 1500, overheadMs: 350, toolCount: 47, activityToolCalls: 0 }),
      sample("simple", 5, { wallMs: 1600, overheadMs: 400, toolCount: 47, activityToolCalls: 0 })
    ];
    const tool = [
      sample("tool", 1, { wallMs: 1800, overheadMs: 300, toolCount: 47, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] }),
      sample("tool", 2, { wallMs: 1900, overheadMs: 350, toolCount: 47, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden abgeschlossen"] }),
      sample("tool", 3, { wallMs: 2000, overheadMs: 400, toolCount: 47, activityToolCalls: 1, activityToolTitles: ["d-max__listCategories gestartet"] }),
      sample("tool", 4, { wallMs: 2100, overheadMs: 450, toolCount: 47, activityToolCalls: 1, activityToolTitles: ["listCategories abgeschlossen"] }),
      sample("tool", 5, { wallMs: 2200, overheadMs: 500, toolCount: 47, activityToolCalls: 1, activityToolTitles: ["Lebensbereiche laden gestartet"] })
    ];

    expect(validateSamples(warmup, simple, tool)).toEqual([]);
  });

  it("uses nearest-rank P50 and P95 metrics for the five-run validation sets", () => {
    const samples = [
      sample("simple", 1, { wallMs: 5000, overheadMs: 500 }),
      sample("simple", 2, { wallMs: 1000, overheadMs: 100 }),
      sample("simple", 3, { wallMs: 3000, overheadMs: 300 }),
      sample("simple", 4, { wallMs: 2000, overheadMs: 200 }),
      sample("simple", 5, { wallMs: 4000, overheadMs: 400 })
    ];

    expect(metricGroup(samples)).toMatchObject({
      count: 5,
      wallP50Ms: 3000,
      wallP95Ms: 5000,
      overheadP50Ms: 300,
      overheadP95Ms: 500
    });
  });

  it("defaults to five simple and five tool-call validation runs", () => {
    expect(parseArgs([])).toMatchObject({
      simpleRuns: 5,
      toolRuns: 5
    });
  });

  it("rejects production validation run counts below five", () => {
    expect(() => parseArgs(["--simple-runs", "4"])).toThrow("--simple-runs must be >= 5");
    expect(() => parseArgs(["--tool-runs", "4"])).toThrow("--tool-runs must be >= 5");
  });

  it("reports invalid production validation run counts without an uncaught stack trace", () => {
    const tsxBin = path.resolve("node_modules/.bin/tsx");
    const result = spawnSync(tsxBin, ["scripts/validate-prod-topology.ts", "--simple-runs", "4"], {
      cwd: process.cwd(),
      encoding: "utf8"
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("--simple-runs must be >= 5");
    expect(result.stderr).not.toContain("at parseArgs");
  });
});

function sample(
  kind: ChatSample["kind"],
  index: number,
  overrides: Partial<ChatSample> = {}
): ChatSample {
  return {
    kind,
    index,
    traceId: `${kind}-${index}`,
    promptLogId: index,
    conversationId: index,
    wallMs: 1000,
    overheadMs: 100,
    totalTraceMs: 1000,
    toolCount: kind === "tool" ? 1 : 0,
    activityToolCalls: kind === "tool" ? 1 : 0,
    activityToolResults: kind === "tool" ? 1 : 0,
    activityToolTitles: kind === "tool" ? ["Lebensbereiche laden gestartet"] : [],
    runCount: 1,
    replyLooksSuccessful: true,
    ...overrides
  };
}

function traceWithRuns(runs: Array<{
  preSessionDelayMs: number | null;
  sessionToModelCompletedMs: number | null;
  sessionToEndedMs: number | null;
  toolCount: number | null;
}>): AppChatTurnTrace {
  return {
    version: 1,
    traceId: "trace",
    startedAt: "2026-05-16T00:00:00.000Z",
    completedAt: "2026-05-16T00:00:02.000Z",
    totalMs: 2000,
    events: [],
    openClaw: {
      sessionId: "session",
      trajectoryFile: "/tmp/trajectory.ndjson",
      runs: runs.map((run, index) => ({
        runId: `run-${index + 1}`,
        sessionStartedAt: "2026-05-16T00:00:00.000Z",
        modelCompletedAt: "2026-05-16T00:00:01.000Z",
        sessionEndedAt: "2026-05-16T00:00:02.000Z",
        preSessionDelayMs: run.preSessionDelayMs,
        sessionToModelCompletedMs: run.sessionToModelCompletedMs,
        sessionToEndedMs: run.sessionToEndedMs,
        toolCount: run.toolCount,
        usage: null
      }))
    }
  };
}
