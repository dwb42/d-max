import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("task tools", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates Inbox category/project for concrete tasks without project context", async () => {
    const runner = createToolRunner();

    const result = await runner.run(
      "createTask",
      {
        title: "Call the dentist",
        priority: "urgent",
        useInboxIfProjectMissing: true
      },
      { db }
    );

    expect(result.ok).toBe(true);

    const categories = await runner.run("listCategories", {}, { db });
    const projects = await runner.run("listProjects", {}, { db });
    const tasks = await runner.run("listTasks", {}, { db });

    expect(categories).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ name: "Inbox", isSystem: true })]
    });
    expect(projects).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ name: "Inbox", isSystem: true })]
    });
    expect(tasks).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ title: "Call the dentist", priority: "urgent" })]
    });
  });

  it("requires confirmation before deleting a task", async () => {
    const runner = createToolRunner();
    const created = await runner.run(
      "createTask",
      {
        title: "Clean Inbox",
        useInboxIfProjectMissing: true
      },
      { db }
    );

    expect(created.ok).toBe(true);

    const taskId = created.ok ? (created.data as { id: number }).id : 0;
    const confirmation = await runner.run("deleteTask", { id: taskId }, { db });

    expect(confirmation).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "deleteTask"
    });

    const deleted = await runner.run("deleteTask", { id: taskId, confirmed: true }, { db });
    expect(deleted).toMatchObject({ ok: true });
  });
});
