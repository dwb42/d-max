import { z } from "zod";
import type Database from "better-sqlite3";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { CategoryRepository } from "../repositories/categories.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import { TaskRepository } from "../repositories/tasks.js";

const taskStatusSchema = z.enum(["open", "in_progress", "blocked", "done", "cancelled"]);
const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const listTasksInput = z
  .object({
    initiativeId: z.number().int().positive().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional()
  })
  .passthrough();
const createTaskInput = z.object({
  initiativeId: z.number().int().positive().optional(),
  title: z.string().trim().min(1),
  priority: taskPrioritySchema.optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: z.string().trim().min(1).nullable().optional(),
  useInboxIfInitiativeMissing: z.boolean().optional()
});
const updateTaskInput = z.object({
  id: z.number().int().positive(),
  initiativeId: z.number().int().positive().optional(),
  title: z.string().trim().min(1).optional(),
  status: taskStatusSchema.optional(),
  priority: taskPrioritySchema.optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: z.string().trim().min(1).nullable().optional()
});
const completeTaskInput = z.object({
  id: z.number().int().positive()
});
const deleteTaskInput = z.object({
  id: z.number().int().positive(),
  confirmed: z.boolean().optional()
});

function ensureInboxInitiative(db: Database.Database): number {
  const categories = new CategoryRepository(db);
  const initiatives = new InitiativeRepository(db);
  const inboxCategory = categories.ensureSystemCategory("Inbox");
  const existingInitiative = initiatives.list({ categoryId: inboxCategory.id }).find((initiative) => initiative.isSystem && initiative.name === "Inbox");

  if (existingInitiative) {
    return existingInitiative.id;
  }

  return initiatives.create({
    categoryId: inboxCategory.id,
    name: "Inbox",
    summary: "System capture initiative for concrete tasks without initiative context.",
    markdown: "# Overview\n\nSystem capture initiative for concrete tasks without initiative context.\n",
    isSystem: true
  }).id;
}

export const taskTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listTasks",
    description: "List d-max tasks.",
    inputSchema: listTasksInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new TaskRepository(context.db).list(input)
      };
    }
  }),
  defineTool({
    name: "createTask",
    description: "Create a d-max task. Concrete tasks without initiative context can use the Inbox initiative.",
    inputSchema: createTaskInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const initiativeId = input.initiativeId ?? (input.useInboxIfInitiativeMissing ? ensureInboxInitiative(context.db) : undefined);

      if (!initiativeId) {
        return { ok: false, error: "initiativeId is required unless useInboxIfInitiativeMissing is true" };
      }

      return {
        ok: true,
        data: new TaskRepository(context.db).create({ ...input, initiativeId })
      };
    }
  }),
  defineTool({
    name: "updateTask",
    description: "Update a d-max task.",
    inputSchema: updateTaskInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new TaskRepository(context.db).update(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update task"
        };
      }
    }
  }),
  defineTool({
    name: "completeTask",
    description: "Mark a task done and set completed_at.",
    inputSchema: completeTaskInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new TaskRepository(context.db).complete(input.id)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to complete task"
        };
      }
    }
  }),
  defineTool({
    name: "deleteTask",
    description: "Delete a d-max task. Requires confirmation.",
    inputSchema: deleteTaskInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      new TaskRepository(context.db).delete(input.id);
      return {
        ok: true,
        data: { deleted: true, id: input.id }
      };
    }
  })
];
