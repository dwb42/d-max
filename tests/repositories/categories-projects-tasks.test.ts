import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { ProjectRepository } from "../../src/repositories/projects.js";
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

  it("creates categories, projects, and tasks", () => {
    const categories = new CategoryRepository(db);
    const projects = new ProjectRepository(db);
    const tasks = new TaskRepository(db);

    const category = categories.create({ name: "Business" });
    const project = projects.create({
      categoryId: category.id,
      name: "d-max",
      markdown: "# Overview\n\nBuild d-max.\n"
    });
    const task = tasks.create({
      projectId: project.id,
      title: "Implement repositories",
      priority: "high"
    });

    expect(categories.list()).toHaveLength(1);
    expect(projects.list({ categoryId: category.id })).toHaveLength(1);
    expect(task.priority).toBe("high");
    expect(tasks.list({ projectId: project.id })).toHaveLength(1);
  });

  it("marks tasks complete with completedAt", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const project = new ProjectRepository(db).create({ categoryId: category.id, name: "d-max" });
    const tasks = new TaskRepository(db);
    const task = tasks.create({ projectId: project.id, title: "Ship MVP" });

    const completed = tasks.complete(task.id, "2026-04-28T10:00:00.000Z");

    expect(completed.status).toBe("done");
    expect(completed.completedAt).toBe("2026-04-28T10:00:00.000Z");
  });

  it("persists manual ordering for categories, projects, and tasks", () => {
    const categories = new CategoryRepository(db);
    const projects = new ProjectRepository(db);
    const tasks = new TaskRepository(db);

    const firstCategory = categories.create({ name: "Business" });
    const secondCategory = categories.create({ name: "Reisen" });
    categories.reorder([secondCategory.id, firstCategory.id]);

    const firstProject = projects.create({ categoryId: secondCategory.id, name: "A" });
    const secondProject = projects.create({ categoryId: secondCategory.id, name: "B" });
    projects.reorderWithinCategory(secondCategory.id, [secondProject.id, firstProject.id]);

    const firstTask = tasks.create({ projectId: secondProject.id, title: "First" });
    const secondTask = tasks.create({ projectId: secondProject.id, title: "Second" });
    tasks.reorderWithinProject(secondProject.id, [secondTask.id, firstTask.id]);

    expect(categories.list().map((category) => category.id)).toEqual([secondCategory.id, firstCategory.id]);
    expect(projects.list({ categoryId: secondCategory.id }).map((project) => project.id)).toEqual([secondProject.id, firstProject.id]);
    expect(tasks.list({ projectId: secondProject.id }).map((task) => task.id)).toEqual([secondTask.id, firstTask.id]);
  });
});
