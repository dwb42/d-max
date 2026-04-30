import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { resolveConversationContext } from "../../src/chat/conversation-context.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { ProjectRepository } from "../../src/repositories/projects.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("resolveConversationContext", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("builds a category context block", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const project = new ProjectRepository(db).create({ categoryId: category.id, name: "d-max" });
    new TaskRepository(db).create({ projectId: project.id, title: "Add contextual chat", priority: "urgent" });

    const resolved = resolveConversationContext(db, { type: "category", categoryId: category.id });

    expect(resolved.contextType).toBe("category");
    expect(resolved.contextEntityId).toBe(category.id);
    expect(resolved.agentContextBlock).toContain("Type: category");
    expect(resolved.agentContextBlock).toContain("Business");
    expect(resolved.agentContextBlock).toContain("Add contextual chat");
  });

  it("builds a task context with project memory", () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new ProjectRepository(db).create({
      categoryId: category.id,
      name: "Health Rhythm",
      markdown: "# Overview\n\nEnergy and training rhythm.\n"
    });
    const task = new TaskRepository(db).create({ projectId: project.id, title: "Choose weekly training slots" });

    const resolved = resolveConversationContext(db, { type: "task", taskId: task.id });

    expect(resolved.contextType).toBe("task");
    expect(resolved.contextEntityId).toBe(task.id);
    expect(resolved.agentContextBlock).toContain("Type: task");
    expect(resolved.agentContextBlock).toContain("Choose weekly training slots");
    expect(resolved.agentContextBlock).toContain("Energy and training rhythm");
  });
});
