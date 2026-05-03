import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("repositories", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates categories, initiatives, and tasks", () => {
    const categories = new CategoryRepository(db);
    const initiatives = new InitiativeRepository(db);
    const tasks = new TaskRepository(db);

    const category = categories.create({ name: "Business" });
    const project = initiatives.create({
      categoryId: category.id,
      name: "d-max",
      markdown: "# Overview\n\nBuild d-max.\n",
      startDate: "2026-05-02",
      endDate: "2026-06-15"
    });
    const task = tasks.create({
      initiativeId: project.id,
      title: "Implement repositories",
      priority: "high"
    });

    expect(categories.list()).toEqual(expect.arrayContaining([expect.objectContaining({ name: "Inbox", isSystem: true })]));
    expect(category.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(category.emoji).toBe("💼");
    expect(initiatives.list({ categoryId: category.id })).toHaveLength(1);
    expect(project.type).toBe("project");
    expect(project.startDate).toBe("2026-05-02");
    expect(project.endDate).toBe("2026-06-15");
    expect(task.priority).toBe("high");
    expect(tasks.list({ initiativeId: project.id })).toHaveLength(1);
  });

  it("updates initiative date ranges", () => {
    const category = new CategoryRepository(db).create({ name: "Reisen" });
    const initiatives = new InitiativeRepository(db);
    const project = initiatives.create({ categoryId: category.id, name: "Portugal Trip", startDate: "2026-07-01" });

    const updated = initiatives.update({ id: project.id, endDate: "2026-07-21" });

    expect(updated.startDate).toBe("2026-07-01");
    expect(updated.endDate).toBe("2026-07-21");
  });

  it("rejects initiative date ranges where start is after end", () => {
    const category = new CategoryRepository(db).create({ name: "Reisen" });
    const initiatives = new InitiativeRepository(db);

    expect(() =>
      initiatives.create({ categoryId: category.id, name: "Invalid Trip", startDate: "2026-08-10", endDate: "2026-08-01" })
    ).toThrow("startDate cannot be after endDate");
  });

  it("creates and filters initiative types", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiatives = new InitiativeRepository(db);

    const idea = initiatives.create({ categoryId: category.id, name: "New offer angle", type: "idea" });
    const habit = initiatives.create({ categoryId: category.id, name: "Maintain customer relationships", type: "habit" });

    expect(idea.type).toBe("idea");
    expect(habit.type).toBe("habit");
    expect(initiatives.list({ type: "idea" }).map((project) => project.id)).toContain(idea.id);
    expect(initiatives.list({ type: "habit" }).map((project) => project.id)).toContain(habit.id);
  });

  it("keeps Inbox as a system category", () => {
    const categories = new CategoryRepository(db);
    const inbox = categories.findByName("Inbox");

    expect(inbox).toMatchObject({ name: "Inbox", isSystem: true });
    expect(inbox?.color).toMatch(/^#[0-9a-f]{6}$/);
    expect(inbox?.emoji).toBe("📥");
  });

  it("supports explicit category colors", () => {
    const categories = new CategoryRepository(db);

    const category = categories.create({ name: "Health", color: "#4ab7b0" });
    const updated = categories.update({ id: category.id, color: "#8a64c9" });

    expect(category.color).toBe("#4ab7b0");
    expect(updated.color).toBe("#8a64c9");
  });

  it("updates category markdown descriptions", () => {
    const categories = new CategoryRepository(db);
    const category = categories.create({ name: "Health" });

    const updated = categories.update({
      id: category.id,
      description: "# Scope\n\nTraining, recovery, and energy.\n\n# Zielbild\n\nStable baseline."
    });
    const cleared = categories.update({ id: category.id, description: "" });

    expect(updated.description).toContain("# Scope");
    expect(cleared.description).toBe("");
  });

  it("marks tasks complete with completedAt", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const project = new InitiativeRepository(db).create({ categoryId: category.id, name: "d-max" });
    const tasks = new TaskRepository(db);
    const task = tasks.create({ initiativeId: project.id, title: "Ship MVP" });

    const completed = tasks.complete(task.id, "2026-04-28T10:00:00.000Z");

    expect(completed.status).toBe("done");
    expect(completed.completedAt).toBe("2026-04-28T10:00:00.000Z");
  });

  it("persists manual ordering for categories, initiatives, and tasks", () => {
    const categories = new CategoryRepository(db);
    const initiatives = new InitiativeRepository(db);
    const tasks = new TaskRepository(db);

    const firstCategory = categories.create({ name: "Business" });
    const secondCategory = categories.create({ name: "Reisen" });
    categories.reorder([secondCategory.id, firstCategory.id]);

    const firstProject = initiatives.create({ categoryId: secondCategory.id, name: "A" });
    const secondProject = initiatives.create({ categoryId: secondCategory.id, name: "B" });
    initiatives.reorderWithinCategory(secondCategory.id, [secondProject.id, firstProject.id]);

    const firstTask = tasks.create({ initiativeId: secondProject.id, title: "First" });
    const secondTask = tasks.create({ initiativeId: secondProject.id, title: "Second" });
    tasks.reorderWithinInitiative(secondProject.id, [secondTask.id, firstTask.id]);

    expect(categories.list().filter((category) => category.name !== "Inbox").map((category) => category.id)).toEqual([
      secondCategory.id,
      firstCategory.id
    ]);
    expect(initiatives.list({ categoryId: secondCategory.id }).map((project) => project.id)).toEqual([secondProject.id, firstProject.id]);
    expect(tasks.list({ initiativeId: secondProject.id }).map((task) => task.id)).toEqual([secondTask.id, firstTask.id]);
  });
});
