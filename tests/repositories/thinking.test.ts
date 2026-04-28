import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { ThinkingRepository } from "../../src/repositories/thinking.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("ThinkingRepository", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("captures a thinking space, session, thoughts, links, and tensions", () => {
    const repository = new ThinkingRepository(db);
    const space = repository.createSpace({ title: "Health Rhythm", summary: "Fitness as an energy and rhythm topic." });
    const session = repository.createSession({
      spaceId: space.id,
      source: "telegram_voice",
      rawInput: "I want more energy, but evenings are low capacity.",
      summary: "Health routine exploration."
    });

    const [desire, constraint] = repository.createThoughts([
      {
        spaceId: space.id,
        sessionId: session.id,
        type: "desire",
        content: "Dietrich wants more energy.",
        maturity: "named",
        confidence: 0.9,
        heat: 0.8
      },
      {
        spaceId: space.id,
        sessionId: session.id,
        type: "constraint",
        content: "Evenings are low capacity.",
        maturity: "named",
        confidence: 0.85,
        heat: 0.75
      }
    ]);
    const tension = repository.createTension({
      spaceId: space.id,
      sessionId: session.id,
      want: "More energy",
      but: "Evenings are low capacity",
      pressure: "high"
    });
    const link = repository.createThoughtLink({
      fromThoughtId: desire.id,
      toEntityType: "thought",
      toEntityId: constraint.id,
      relation: "blocks",
      strength: 0.8
    });

    expect(repository.listSpaces()).toHaveLength(1);
    expect(repository.listThoughts({ spaceId: space.id })).toHaveLength(2);
    expect(repository.listTensions({ spaceId: space.id })).toHaveLength(1);
    expect(repository.listThoughtLinks({ fromThoughtId: desire.id })).toEqual([link]);
    expect(tension.pressure).toBe("high");
  });

  it("renders open loops with unresolved tensions and candidates", () => {
    const repository = new ThinkingRepository(db);
    const space = repository.createSpace({ title: "d-max Architecture" });
    repository.createThought({
      spaceId: space.id,
      type: "possible_project",
      content: "Build a Thinking System instead of plain brainstorm notes.",
      maturity: "connected",
      heat: 0.9
    });
    repository.createThought({
      spaceId: space.id,
      type: "possible_task",
      content: "Write the first Thinking System architecture document.",
      maturity: "testable",
      heat: 0.7
    });
    repository.createTension({
      spaceId: space.id,
      want: "A powerful thinking partner",
      but: "A deterministic core that stays controllable",
      pressure: "high"
    });

    const view = repository.renderOpenLoops(space.id);

    expect(view.unresolvedTensions).toHaveLength(1);
    expect(view.projectCandidates).toHaveLength(1);
    expect(view.taskCandidates).toHaveLength(1);
    expect(view.recommendation).toContain("highest-pressure tension");
  });

  it("returns a full thinking context for agent resumption", () => {
    const repository = new ThinkingRepository(db);
    const space = repository.createSpace({ title: "Business Direction" });
    const session = repository.createSession({
      spaceId: space.id,
      summary: "Exploring whether a new offer should become a project."
    });
    const [question, candidate] = repository.createThoughts([
      {
        spaceId: space.id,
        sessionId: session.id,
        type: "question",
        content: "Which offer has the strongest pull right now?",
        heat: 0.7
      },
      {
        spaceId: space.id,
        sessionId: session.id,
        type: "possible_project",
        content: "Shape the new advisory offer.",
        maturity: "connected",
        heat: 0.8
      }
    ]);
    repository.createThoughtLink({
      fromThoughtId: candidate.id,
      toEntityType: "thought",
      toEntityId: question.id,
      relation: "answers"
    });

    const context = repository.getThinkingContext(space.id);

    expect(context.space.title).toBe("Business Direction");
    expect(context.recentSessions).toHaveLength(1);
    expect(context.activeThoughts).toHaveLength(2);
    expect(context.projectCandidates).toEqual([candidate]);
    expect(context.links).toHaveLength(1);
    expect(context.openLoops.projectCandidates).toEqual([candidate]);
  });

  it("renders project and task gates for extraction candidates", () => {
    const repository = new ThinkingRepository(db);
    const space = repository.createSpace({ title: "Health Rhythm" });
    const projectCandidate = repository.createThought({
      spaceId: space.id,
      type: "possible_project",
      content: "Test a minimal morning routine for energy for four weeks.",
      maturity: "testable",
      confidence: 0.85
    });
    const taskCandidate = repository.createThought({
      spaceId: space.id,
      type: "possible_task",
      content: "Test a five minute morning mobility routine.",
      maturity: "committed",
      confidence: 0.9
    });

    const projectGate = repository.renderProjectGate(projectCandidate.id);
    const taskGateWithoutInbox = repository.renderTaskGate(taskCandidate.id);
    const taskGateWithInbox = repository.renderTaskGate(taskCandidate.id, { allowInbox: true });

    expect(projectGate.status).toBe("needs_clarification");
    expect(projectGate.missing).toContain("category_clear");
    expect(taskGateWithoutInbox.status).toBe("needs_clarification");
    expect(taskGateWithoutInbox.missing).toContain("project_context");
    expect(taskGateWithInbox.status).toBe("ready");
  });
});
