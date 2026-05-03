import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { listPromptTemplates, resolveConversationContext } from "../../src/chat/conversation-context.js";
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
    const project = new ProjectRepository(db).create({
      categoryId: category.id,
      name: "d-max",
      startDate: "2026-05-02",
      endDate: "2026-06-15"
    });
    new TaskRepository(db).create({ projectId: project.id, title: "Add contextual chat", priority: "urgent" });

    const resolved = resolveConversationContext(db, { type: "category", categoryId: category.id });

    expect(resolved.contextType).toBe("category");
    expect(resolved.contextEntityId).toBe(category.id);
    expect(resolved.agentContextBlock).toContain("Type: category");
    expect(resolved.agentContextBlock).toContain("Business");
    expect(resolved.agentContextBlock).toContain("[Project] d-max");
    expect(resolved.agentContextBlock).toContain("2026-05-02 to 2026-06-15");
    expect(resolved.agentContextBlock).toContain("Add contextual chat");
  });

  it("builds a task context with project memory", () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new ProjectRepository(db).create({
      categoryId: category.id,
      name: "Health Rhythm",
      startDate: "2026-05-05",
      markdown: "# Overview\n\nEnergy and training rhythm.\n"
    });
    const task = new TaskRepository(db).create({ projectId: project.id, title: "Choose weekly training slots" });

    const resolved = resolveConversationContext(db, { type: "task", taskId: task.id });

    expect(resolved.contextType).toBe("task");
    expect(resolved.contextEntityId).toBe(task.id);
    expect(resolved.agentContextBlock).toContain("Type: task");
    expect(resolved.agentContextBlock).toContain("type: project (Project)");
    expect(resolved.agentContextBlock).toContain("time span: starts 2026-05-05");
    expect(resolved.agentContextBlock).toContain("Choose weekly training slots");
    expect(resolved.agentContextBlock).toContain("Energy and training rhythm");
  });

  it("lists prompt templates for navigation contexts", () => {
    const templates = listPromptTemplates();

    expect(templates.map((template) => template.name)).toEqual([
      "Global",
      "Categories List View",
      "Category Detail View",
      "Ideen List View",
      "Ideen Detail View",
      "Projekte List View",
      "Projekte Detail View",
      "Gewohnheiten List View",
      "Gewohnheiten Detail View",
      "Tasks List View",
      "Tasks Detail View"
    ]);
    expect(templates[0]?.finalPromptTemplate).toContain("User message:");
    expect(templates.find((template) => template.id === "category-detail")?.systemInstructions).toContain("Life area/category description guidance");
  });
});
