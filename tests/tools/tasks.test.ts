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

  it("creates Inbox category/initiative for concrete tasks without initiative context", async () => {
    const runner = createToolRunner();

    const result = await runner.run(
      "createTask",
      {
        title: "Call the dentist",
        priority: "urgent",
        useInboxIfInitiativeMissing: true
      },
      { db }
    );

    expect(result.ok).toBe(true);

    const categories = await runner.run("listCategories", {}, { db });
    const initiatives = await runner.run("listInitiatives", {}, { db });
    const tasks = await runner.run("listTasks", {}, { db });

    expect(categories).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ name: "Inbox", isSystem: true })]
    });
    expect(initiatives).toMatchObject({
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
        useInboxIfInitiativeMissing: true
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

    const deleted = await runner.run("deleteTask", { id: taskId, confirmed: true }, { db, allowConfirmedActions: true });
    expect(deleted).toMatchObject({ ok: true });
  });

  it("creates, updates, lists, and reorders task checklist items", async () => {
    const runner = createToolRunner();
    const createdTask = await runner.run(
      "createTask",
      {
        title: "Checklist task",
        useInboxIfInitiativeMissing: true
      },
      { db }
    );

    expect(createdTask.ok).toBe(true);
    const taskId = createdTask.ok ? (createdTask.data as { id: number }).id : 0;

    const first = await runner.run("createTaskChecklistItem", { taskId, name: "First item" }, { db });
    const second = await runner.run("createTaskChecklistItem", { taskId, name: "Second item" }, { db });

    expect(first).toMatchObject({ ok: true, data: { taskId, name: "First item", status: "todo" } });
    expect(second).toMatchObject({ ok: true, data: { taskId, name: "Second item", status: "todo" } });

    const firstId = first.ok ? (first.data as { id: number }).id : 0;
    const secondId = second.ok ? (second.data as { id: number }).id : 0;
    const updated = await runner.run("updateTaskChecklistItem", { id: firstId, status: "done" }, { db });
    const reordered = await runner.run("reorderTaskChecklistItems", { taskId, itemIds: [secondId, firstId] }, { db });
    const listed = await runner.run("listTaskChecklistItems", { taskId }, { db });

    expect(updated).toMatchObject({ ok: true, data: { id: firstId, status: "done" } });
    expect(reordered).toMatchObject({ ok: true });
    expect(listed).toMatchObject({
      ok: true,
      data: [
        expect.objectContaining({ id: secondId }),
        expect.objectContaining({ id: firstId, status: "done" })
      ]
    });
  });
});
