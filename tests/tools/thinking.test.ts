import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("thinking tools", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("captures thoughts and renders open loops through tools", async () => {
    const runner = createToolRunner();
    const createdSpace = await runner.run(
      "createThinkingSpace",
      {
        title: "Health Rhythm",
        summary: "Exploring fitness as energy and rhythm."
      },
      { db }
    );

    expect(createdSpace.ok).toBe(true);
    const spaceId = createdSpace.ok ? (createdSpace.data as { id: number }).id : 0;

    const createdSession = await runner.run(
      "createThinkingSession",
      {
        spaceId,
        source: "telegram_text",
        rawInput: "I want more energy, but I am tired in the evening.",
        summary: "Energy routine exploration."
      },
      { db }
    );

    expect(createdSession.ok).toBe(true);
    const sessionId = createdSession.ok ? (createdSession.data as { id: number }).id : 0;

    const captured = await runner.run(
      "captureThoughts",
      {
        thoughts: [
          {
            spaceId,
            sessionId,
            type: "desire",
            content: "Dietrich wants more energy.",
            maturity: "named",
            confidence: 0.9,
            heat: 0.8
          },
        {
          spaceId,
          sessionId,
          type: "possible_task",
            content: "Test a small morning routine.",
            maturity: "testable",
            confidence: 0.75,
            heat: 0.7
          }
        ]
      },
      { db }
    );

    expect(captured).toMatchObject({ ok: true });

    const tension = await runner.run(
      "createTension",
      {
        spaceId,
        sessionId,
        want: "More energy",
        but: "Evenings are low capacity",
        pressure: "high"
      },
      { db }
    );

    expect(tension).toMatchObject({ ok: true });

    const view = await runner.run("renderOpenLoops", { spaceId }, { db });

    expect(view).toMatchObject({
      ok: true,
      data: {
        unresolvedTensions: [expect.objectContaining({ pressure: "high" })],
        taskCandidates: [expect.objectContaining({ content: "Test a small morning routine." })]
      }
    });

    const thoughts = captured.ok ? (captured.data as Array<{ id: number; type: string }>) : [];
    const taskCandidateId = thoughts.find((thought) => thought.type === "possible_task")?.id ?? 0;

    const context = await runner.run("getThinkingContext", { spaceId }, { db });

    expect(context).toMatchObject({
      ok: true,
      data: {
        space: expect.objectContaining({ id: spaceId }),
        recentSessions: [expect.objectContaining({ id: sessionId })],
        activeThoughts: expect.arrayContaining([expect.objectContaining({ type: "desire" })]),
        unresolvedTensions: [expect.objectContaining({ pressure: "high" })],
        openLoops: expect.objectContaining({
          recommendation: expect.stringContaining("highest-pressure tension")
        })
      }
    });

    const taskGate = await runner.run("renderTaskGate", { thoughtId: taskCandidateId, allowInbox: true }, { db });

    expect(taskGate).toMatchObject({
      ok: true,
      data: {
        status: "needs_clarification",
        missing: expect.arrayContaining(["not_speculative"])
      }
    });
  });

  it("validates thought scores", async () => {
    const runner = createToolRunner();
    const result = await runner.run(
      "captureThoughts",
      {
        thoughts: [
          {
            spaceId: 1,
            type: "hypothesis",
            content: "Invalid score should be rejected before database access.",
            confidence: 1.5
          }
        ]
      },
      { db }
    );

    expect(result.ok).toBe(false);
  });
});
