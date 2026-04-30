import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { StateEventRepository } from "../../src/repositories/state-events.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("StateEventRepository", () => {
  let db: Database.Database;
  let events: StateEventRepository;

  beforeEach(() => {
    db = createTestDatabase();
    events = new StateEventRepository(db);
  });

  it("persists and lists state events after a cursor", () => {
    const first = events.create({ source: "tool", operation: "updateProjectMarkdown", entityType: "project", entityId: 5, projectId: 5 });
    const second = events.create({ source: "api", operation: "reorderTasks", entityType: "task", projectId: 5 });

    expect(events.latestId()).toBe(second.id);
    expect(events.listAfter(first.id)).toEqual([second]);
  });
});
