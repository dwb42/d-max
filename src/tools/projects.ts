import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { ProjectRepository } from "../repositories/projects.js";

const projectStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
const listProjectsInput = z
  .object({
    categoryId: z.number().int().positive().optional(),
    status: projectStatusSchema.optional()
  })
  .passthrough();
const getProjectInput = z.object({
  projectId: z.number().int().positive()
});
const createProjectInput = z.object({
  categoryId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().optional(),
  isSystem: z.boolean().optional()
});
const updateProjectInput = z.object({
  id: z.number().int().positive(),
  categoryId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  name: z.string().trim().min(1).optional(),
  status: projectStatusSchema.optional(),
  summary: z.string().trim().min(1).nullable().optional()
});
const archiveProjectInput = z.object({
  id: z.number().int().positive(),
  confirmed: z.boolean().optional()
});
const updateProjectMarkdownInput = z.object({
  id: z.number().int().positive(),
  markdown: z.string(),
  confirmed: z.boolean().optional()
});

export const projectTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listProjects",
    description: "List d-max projects.",
    inputSchema: listProjectsInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new ProjectRepository(context.db).list(input)
      };
    }
  }),
  defineTool({
    name: "getProject",
    description: "Get one d-max project.",
    inputSchema: getProjectInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const project = new ProjectRepository(context.db).findById(input.projectId);
      return project ? { ok: true, data: project } : { ok: false, error: `Project not found: ${input.projectId}` };
    }
  }),
  defineTool({
    name: "createProject",
    description: "Create a d-max project.",
    inputSchema: createProjectInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new ProjectRepository(context.db).create(input)
      };
    }
  }),
  defineTool({
    name: "updateProject",
    description: "Update a d-max project.",
    inputSchema: updateProjectInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ProjectRepository(context.db).update(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update project"
        };
      }
    }
  }),
  defineTool({
    name: "archiveProject",
    description: "Archive a d-max project. Requires confirmation.",
    inputSchema: archiveProjectInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ProjectRepository(context.db).archive(input.id)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to archive project"
        };
      }
    }
  }),
  defineTool({
    name: "updateProjectMarkdown",
    description: "Replace a project's markdown memory. Large rewrites require confirmation.",
    inputSchema: updateProjectMarkdownInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ProjectRepository(context.db).updateMarkdown(input.id, input.markdown)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update project markdown"
        };
      }
    }
  })
];
