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
    const first = events.create({ source: "tool", operation: "updateInitiativeMarkdown", entityType: "initiative", entityId: 5, initiativeId: 5 });
    const second = events.create({ source: "api", operation: "reorderTasks", entityType: "task", initiativeId: 5 });

    expect(events.latestId()).toBe(second.id);
    expect(events.listAfter(first.id)).toEqual([second]);
  });
});
