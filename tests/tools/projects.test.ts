import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { createTestDatabase } from "../helpers/test-db.js";
import { projectTools } from "../../src/tools/projects.js";

describe("project tools", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates and lists projects by initiative type", async () => {
    const runner = createToolRunner();
    const category = new CategoryRepository(db).create({ name: "Business" });

    const created = await runner.run(
      "createProject",
      {
        categoryId: category.id,
        type: "project",
        name: "New positioning angle",
        startDate: "2026-06-01",
        endDate: "2026-06-30"
      },
      { db }
    );
    const projectList = await runner.run("listProjects", { type: "project" }, { db });
    const habits = await runner.run("listProjects", { type: "habit" }, { db });

    expect(created).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        type: "project",
        name: "New positioning angle",
        startDate: "2026-06-01",
        endDate: "2026-06-30"
      })
    });
    expect(projectList).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ type: "project", name: "New positioning angle", startDate: "2026-06-01", endDate: "2026-06-30" })]
    });
    expect(habits).toMatchObject({ ok: true, data: [] });
  });

  it("exposes initiative type guidance in tool descriptions", () => {
    const createProject = projectTools.find((tool) => tool.name === "createProject");
    const updateProject = projectTools.find((tool) => tool.name === "updateProject");

    expect(createProject?.description).toContain("idea");
    expect(createProject?.description).toContain("habit");
    expect(createProject?.description).toContain("start/end");
    expect(createProject?.description).toContain("system Inbox category");
    expect(updateProject?.description).toContain("startDate");
    expect(updateProject?.description).toContain("lifecycle decision");
    expect(updateProject?.description).toContain("requires Dietrich's confirmation");
  });

  it("does not allow the agent tool path to self-confirm project type changes", async () => {
    const runner = createToolRunner();
    const category = new CategoryRepository(db).create({ name: "Haus und Hof" });
    const created = await runner.run(
      "createProject",
      {
        categoryId: category.id,
        type: "project",
        name: "Undeloh"
      },
      { db }
    );
    const projectId = created.ok ? (created.data as { id: number }).id : 0;

    const result = await runner.run("updateProject", { id: projectId, type: "habit", confirmed: true }, { db });
    const projects = await runner.run("listProjects", {}, { db });

    expect(result).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "updateProject"
    });
    expect(projects).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: projectId, type: "project" })]
    });
  });
});
