import { z } from "zod";
import type Database from "better-sqlite3";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { CategoryRepository } from "../repositories/categories.js";
import { ProjectRepository } from "../repositories/projects.js";
import { TaskRepository } from "../repositories/tasks.js";

const taskStatusSchema = z.enum(["open", "in_progress", "blocked", "done", "cancelled"]);
const taskPrioritySchema = z.enum(["low", "normal", "high", "urgent"]);
const listTasksInput = z
  .object({
    projectId: z.number().int().positive().optional(),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional()
  })
  .passthrough();
const createTaskInput = z.object({
  projectId: z.number().int().positive().optional(),
  title: z.string().trim().min(1),
  priority: taskPrioritySchema.optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: z.string().trim().min(1).nullable().optional(),
  useInboxIfProjectMissing: z.boolean().optional()
});
const updateTaskInput = z.object({
  id: z.number().int().positive(),
  projectId: z.number().int().positive().optional(),
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

function ensureInboxProject(db: Database.Database): number {
  const categories = new CategoryRepository(db);
  const projects = new ProjectRepository(db);
  const inboxCategory = categories.ensureSystemCategory("Inbox");
  const existingProject = projects.list({ categoryId: inboxCategory.id }).find((project) => project.isSystem && project.name === "Inbox");

  if (existingProject) {
    return existingProject.id;
  }

  return projects.create({
    categoryId: inboxCategory.id,
    name: "Inbox",
    summary: "System capture project for concrete tasks without project context.",
    markdown: "# Overview\n\nSystem capture project for concrete tasks without project context.\n",
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
    description: "Create a d-max task. Concrete tasks without project context can use the Inbox project.",
    inputSchema: createTaskInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const projectId = input.projectId ?? (input.useInboxIfProjectMissing ? ensureInboxProject(context.db) : undefined);

      if (!projectId) {
        return { ok: false, error: "projectId is required unless useInboxIfProjectMissing is true" };
      }

      return {
        ok: true,
        data: new TaskRepository(context.db).create({ ...input, projectId })
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
