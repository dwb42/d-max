import { describe, expect, it } from "vitest";
import { z } from "zod";
import { ToolRunner } from "../../src/core/tool-runner.js";

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
});
