import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { ProjectRepository } from "../repositories/projects.js";

const projectStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
const projectTypeSchema = z.enum(["idea", "project", "habit"]);
const projectDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const listProjectsInput = z
  .object({
    categoryId: z.number().int().positive().optional().describe("Filter by category id."),
    status: projectStatusSchema.optional().describe("Filter by project status."),
    type: projectTypeSchema.optional().describe("Filter by initiative type: idea, project, or habit.")
  })
  .passthrough();
const getProjectInput = z.object({
  projectId: z.number().int().positive().describe("The project id.")
});
const createProjectInput = z.object({
  categoryId: z.number().int().positive().describe("Required category id. Use the system Inbox category when the correct category is unclear."),
  parentId: z.number().int().positive().nullable().optional().describe("Optional parent project id."),
  type: projectTypeSchema
    .optional()
    .describe("Initiative type. Use idea for loose thoughts, project for goal-oriented work, habit for ongoing practices. Defaults to project."),
  name: z.string().trim().min(1).describe("Name exactly as Dietrich says it when possible."),
  summary: z.string().trim().min(1).nullable().optional().describe("Short optional summary."),
  markdown: z.string().optional().describe("Durable project memory markdown. Use adaptive sections, not a hard template."),
  startDate: projectDateSchema.optional().describe("Optional start date for type=project initiatives, in YYYY-MM-DD. Ideas and habits are not time-bound."),
  endDate: projectDateSchema.optional().describe("Optional end date for type=project initiatives, in YYYY-MM-DD. Ideas and habits are not time-bound."),
  isSystem: z.boolean().optional().describe("Only true for system-created projects.")
});
const updateProjectInput = z.object({
  id: z.number().int().positive().describe("Project id to update."),
  categoryId: z.number().int().positive().optional().describe("New category id."),
  parentId: z.number().int().positive().nullable().optional().describe("New parent project id, or null to remove the parent."),
  type: projectTypeSchema.optional().describe("New initiative type. Changing an existing type is a lifecycle decision and requires confirmation."),
  name: z.string().trim().min(1).optional().describe("New project name."),
  status: projectStatusSchema.optional().describe("New project status."),
  summary: z.string().trim().min(1).nullable().optional().describe("New optional summary."),
  startDate: projectDateSchema.optional().describe("New start date for type=project initiatives, in YYYY-MM-DD, or null to clear."),
  endDate: projectDateSchema.optional().describe("New end date for type=project initiatives, in YYYY-MM-DD, or null to clear."),
  confirmed: z.boolean().optional().describe("Set true only after Dietrich confirms a risky change.")
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
    description:
      "List d-max projects/initiatives. Optional filters include categoryId, status, and type (idea, project, habit). Returned type=project initiatives may include startDate and endDate.",
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
    description: "Get one d-max project/initiative, including its type and optional startDate/endDate for type=project initiatives.",
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
    description:
      "Create a d-max project/initiative. Always choose type: idea for loose thoughts with no time binding, project for goal-oriented work with a clear start/end when known, habit for ongoing practices without a clear end date. categoryId is required; use the system Inbox category if placement is unclear.",
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
    description:
      "Update a d-max project/initiative. For type=project initiatives, maintain startDate/endDate when Dietrich gives a project time span. Ideas are loose thoughts and habits are ongoing practices. Changing type is a lifecycle decision such as idea -> project or idea -> habit and requires Dietrich's confirmation.",
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
