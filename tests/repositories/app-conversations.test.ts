import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { AppConversationRepository } from "../../src/repositories/app-conversations.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("AppConversationRepository", () => {
  let db: Database.Database;
  let conversations: AppConversationRepository;

  beforeEach(() => {
    db = createTestDatabase();
    conversations = new AppConversationRepository(db);
  });

  afterEach(() => {
    db.close();
  });

  it("creates global and entity-scoped conversations", () => {
    const global = conversations.create({ contextType: "global", title: "Global Chat" });
    const project = conversations.create({ contextType: "project", contextEntityId: 42, title: "Health Rhythm" });

    expect(global.contextEntityId).toBeNull();
    expect(project.contextEntityId).toBe(42);
    expect(conversations.findById(project.id)?.contextType).toBe("project");
  });

  it("finds the latest conversation for a context", () => {
    conversations.create({ contextType: "project", contextEntityId: 42, title: "Old" }, "2026-04-30T08:00:00.000Z");
    const latest = conversations.create({ contextType: "project", contextEntityId: 42, title: "New" }, "2026-04-30T09:00:00.000Z");

    expect(conversations.findLatestByContext({ contextType: "project", contextEntityId: 42 })?.id).toBe(latest.id);
  });

  it("lists all conversations for one context without mixing contexts", () => {
    const old = conversations.create({ contextType: "task", contextEntityId: 9, title: "Old" }, "2026-04-30T08:00:00.000Z");
    conversations.create({ contextType: "task", contextEntityId: 10, title: "Other task" }, "2026-04-30T09:30:00.000Z");
    const latest = conversations.create({ contextType: "task", contextEntityId: 9, title: "New" }, "2026-04-30T09:00:00.000Z");

    expect(conversations.listByContext({ contextType: "task", contextEntityId: 9 }).map((conversation) => conversation.id)).toEqual([
      latest.id,
      old.id
    ]);
  });

  it("requires entity ids for entity-scoped contexts", () => {
    expect(() => conversations.create({ contextType: "task", title: "Invalid" })).toThrow(/contextEntityId is required/);
  });
});
