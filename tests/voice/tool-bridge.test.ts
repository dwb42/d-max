import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { VoiceToolBridge } from "../../src/voice/tool-bridge.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("VoiceToolBridge", () => {
  let db: Database.Database;
  let bridge: VoiceToolBridge;

  beforeEach(() => {
    db = createTestDatabase();
    bridge = new VoiceToolBridge(createToolRunner(), db);
  });

  afterEach(() => {
    db.close();
  });

  it("starts and resumes a brainstorm through thinking tools", async () => {
    const created = await bridge.startOrResumeBrainstorm({
      title: "d-max Voice",
      summary: "Exploring realtime voice."
    });
    const resumed = await bridge.startOrResumeBrainstorm({ title: "D-MAX voice" });

    expect(created).toMatchObject({
      title: "d-max Voice",
      resumed: false
    });
    expect(resumed).toMatchObject({
      spaceId: created.spaceId,
      resumed: true
    });
  });

  it("captures voice thinking and returns compact open-loop summary", async () => {
    const started = await bridge.startOrResumeBrainstorm({ title: "Health Rhythm" });

    const captured = await bridge.captureThinking({
      spaceId: started.spaceId,
      rawInput: "Ich will fitter werden, aber abends bin ich platt.",
      summary: "Energy rhythm exploration.",
      thoughts: [
        {
          type: "desire",
          content: "Dietrich wants more energy.",
          maturity: "named",
          confidence: 0.9,
          heat: 0.8
        },
        {
          type: "possible_task",
          content: "Test a small morning routine.",
          maturity: "testable",
          confidence: 0.75,
          heat: 0.7
        }
      ],
      tensions: [
        {
          want: "More energy",
          but: "Evenings are low capacity",
          pressure: "high"
        }
      ]
    });

    expect(captured).toMatchObject({
      savedThoughts: 2,
      savedTensions: 1,
      topOpenLoop: "More energy vs. Evenings are low capacity"
    });
    expect(captured.spokenSummary).toContain("2 Gedanken");
  });

  it("creates idempotent pending task actions without committing", () => {
    const action = bridge.createPendingTaskAction({
      thoughtId: 12,
      projectId: 3,
      title: "Grok SIP Spike bauen",
      now: "2026-04-28T20:00:00.000Z"
    });

    expect(action).toMatchObject({
      tool: "createTask",
      requiresConfirmation: true,
      unsafeAfterInterruption: true,
      input: {
        projectId: 3,
        title: "Grok SIP Spike bauen"
      }
    });
  });

  it("commits a confirmed task through execution tools and links the source thought", async () => {
    const started = await bridge.startOrResumeBrainstorm({ title: "d-max Voice Tasks" });
    await bridge.captureThinking({
      spaceId: started.spaceId,
      rawInput: "Aufgabe: Grok SIP Spike bauen.",
      summary: "Task candidate capture.",
      thoughts: [
        {
          type: "possible_task",
          content: "Grok SIP Spike bauen.",
          maturity: "testable",
          confidence: 0.9,
          heat: 0.8
        }
      ]
    });

    const thoughtsResult = await createToolRunner().run("listThoughts", { spaceId: started.spaceId, type: "possible_task" }, { db });
    expect(thoughtsResult.ok).toBe(true);
    const sourceThoughtId = thoughtsResult.ok ? (thoughtsResult.data as Array<{ id: number }>)[0]?.id : 0;
    const action = bridge.createPendingTaskAction({
      thoughtId: sourceThoughtId,
      title: "Grok SIP Spike bauen",
      now: "2026-04-28T20:00:00.000Z"
    });

    const committed = await bridge.commitConfirmedTask({
      action,
      sourceThoughtId,
      allowInbox: true
    });

    expect(committed).toMatchObject({
      title: "Grok SIP Spike bauen",
      sourceThoughtId
    });

    const linksResult = await createToolRunner().run("listThoughtLinks", { fromThoughtId: sourceThoughtId }, { db });
    expect(linksResult).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ toEntityType: "task", relation: "extracted_to" })]
    });
  });
});
