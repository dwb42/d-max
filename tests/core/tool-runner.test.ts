import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRunner } from "../../src/core/tool-runner.js";
import { StateEventRepository } from "../../src/repositories/state-events.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("ToolRunner", () => {
  it("runs a registered tool with validated input", async () => {
    const runner = new ToolRunner();

    runner.register({
      name: "listCategories",
      description: "List categories",
      inputSchema: z.object({
        limit: z.number().int().positive()
      }),
      run: (input) => ({
        ok: true,
        data: input
      })
    });

    await expect(runner.run("listCategories", { limit: 3 })).resolves.toEqual({
      ok: true,
      data: {
        limit: 3
      }
    });
  });

  it("rejects invalid input", async () => {
    const runner = new ToolRunner();

    runner.register({
      name: "listCategories",
      description: "List categories",
      inputSchema: z.object({
        limit: z.number().int().positive()
      }),
      run: () => ({
        ok: true,
        data: []
      })
    });

    const result = await runner.run("listCategories", { limit: 0 });

    expect(result.ok).toBe(false);
  });

  it("requests confirmation for risky tools", async () => {
    const runner = new ToolRunner();

    runner.register({
      name: "deleteTask",
      description: "Delete a task",
      inputSchema: z.object({
        taskId: z.number().int().positive(),
        confirmed: z.boolean().optional()
      }),
      run: () => ({
        ok: true,
        data: { deleted: true }
      })
    });

    const result = await runner.run("deleteTask", { taskId: 1 });

    expect(result).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "deleteTask"
    });
  });

  it("requests confirmation before changing a project type", async () => {
    const runner = new ToolRunner();

    runner.register({
      name: "updateProject",
      description: "Update a project",
      inputSchema: z.object({
        id: z.number().int().positive(),
        type: z.enum(["idea", "project", "habit"]).optional(),
        confirmed: z.boolean().optional()
      }),
      run: () => ({
        ok: true,
        data: { id: 1, type: "project" }
      })
    });

    const result = await runner.run("updateProject", { id: 1, type: "project" });

    expect(result).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "updateProject"
    });
  });

  it("does not trust self-confirmed risky tool input by default", async () => {
    const runner = new ToolRunner();

    runner.register({
      name: "updateProject",
      description: "Update a project",
      inputSchema: z.object({
        id: z.number().int().positive(),
        type: z.enum(["idea", "project", "habit"]).optional(),
        confirmed: z.boolean().optional()
      }),
      run: () => ({
        ok: true,
        data: { id: 1, type: "habit" }
      })
    });

    const result = await runner.run("updateProject", { id: 1, type: "habit", confirmed: true });

    expect(result).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "updateProject",
      proposedAction: {
        input: { id: 1, type: "habit" }
      }
    });
  });

  it("allows confirmed risky tool input only in a trusted confirmation context", async () => {
    const runner = new ToolRunner();

    runner.register({
      name: "updateProject",
      description: "Update a project",
      inputSchema: z.object({
        id: z.number().int().positive(),
        type: z.enum(["idea", "project", "habit"]).optional(),
        confirmed: z.boolean().optional()
      }),
      run: () => ({
        ok: true,
        data: { id: 1, type: "habit" }
      })
    });

    const result = await runner.run(
      "updateProject",
      { id: 1, type: "habit", confirmed: true },
      { allowConfirmedActions: true }
    );

    expect(result).toMatchObject({
      ok: true,
      data: { id: 1, type: "habit" }
    });
  });

  it("emits a state event after a successful mutating tool", async () => {
    const db = createTestDatabase();
    const runner = new ToolRunner();

    runner.register({
      name: "updateProjectMarkdown",
      description: "Update project markdown",
      inputSchema: z.object({
        id: z.number().int().positive(),
        markdown: z.string(),
        confirmed: z.boolean().optional()
      }),
      run: (input) => ({
        ok: true,
        data: { id: input.id, categoryId: 2 }
      })
    });

    await runner.run("updateProjectMarkdown", { id: 5, markdown: "# New", confirmed: true }, { db, allowConfirmedActions: true });

    expect(new StateEventRepository(db).listAfter(0)).toMatchObject([
      {
        source: "tool",
        operation: "updateProjectMarkdown",
        entityType: "project",
        entityId: 5,
        projectId: 5,
        categoryId: 2
      }
    ]);
  });
});
