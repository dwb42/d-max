import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { createTestDatabase } from "../helpers/test-db.js";
import { initiativeTools } from "../../src/tools/initiatives.js";

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
      "createInitiative",
      {
        categoryId: category.id,
        type: "project",
        name: "New positioning angle",
        startDate: "2026-06-01",
        endDate: "2026-06-30"
      },
      { db }
    );
    const initiativeList = await runner.run("listInitiatives", { type: "project" }, { db });
    const habits = await runner.run("listInitiatives", { type: "habit" }, { db });

    expect(created).toMatchObject({
      ok: true,
      data: expect.objectContaining({
        type: "project",
        name: "New positioning angle",
        startDate: "2026-06-01",
        endDate: "2026-06-30"
      })
    });
    expect(initiativeList).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ type: "project", name: "New positioning angle", startDate: "2026-06-01", endDate: "2026-06-30" })]
    });
    expect(habits).toMatchObject({ ok: true, data: [] });
  });

  it("exposes initiative type guidance in tool descriptions", () => {
    const createInitiative = initiativeTools.find((tool) => tool.name === "createInitiative");
    const updateInitiative = initiativeTools.find((tool) => tool.name === "updateInitiative");

    expect(createInitiative?.description).toContain("idea");
    expect(createInitiative?.description).toContain("habit");
    expect(createInitiative?.description).toContain("start/end");
    expect(createInitiative?.description).toContain("system Inbox category");
    expect(updateInitiative?.description).toContain("startDate");
    expect(updateInitiative?.description).toContain("lifecycle decision");
    expect(updateInitiative?.description).toContain("requires Dietrich's confirmation");
  });

  it("does not allow the agent tool path to self-confirm project type changes", async () => {
    const runner = createToolRunner();
    const category = new CategoryRepository(db).create({ name: "Haus und Hof" });
    const created = await runner.run(
      "createInitiative",
      {
        categoryId: category.id,
        type: "project",
        name: "Undeloh"
      },
      { db }
    );
    const initiativeId = created.ok ? (created.data as { id: number }).id : 0;

    const result = await runner.run("updateInitiative", { id: initiativeId, type: "habit", confirmed: true }, { db });
    const projects = await runner.run("listInitiatives", {}, { db });

    expect(result).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "updateInitiative"
    });
    expect(projects).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ id: initiativeId, type: "project" })]
    });
  });
});
