import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { InitiativeRepository } from "../repositories/initiatives.js";

const initiativeStatusSchema = z.enum(["active", "paused", "completed", "archived"]);
const initiativeTypeSchema = z.enum(["idea", "project", "habit"]);
const projectPhaseSchema = z.enum(["planning", "doing"]);
const initiativeDateSchema = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/).nullable();
const listInitiativesInput = z
  .object({
    categoryId: z.number().int().positive().optional().describe("Filter by category id."),
    status: initiativeStatusSchema.optional().describe("Filter by initiative status."),
    type: initiativeTypeSchema.optional().describe("Filter by initiative type: idea, project, or habit.")
  })
  .passthrough();
const getInitiativeInput = z.object({
  initiativeId: z.number().int().positive().describe("The initiative id.")
});
const createInitiativeInput = z.object({
  categoryId: z.number().int().positive().describe("Required category id. Use the system Inbox category when the correct category is unclear."),
  parentId: z.number().int().positive().nullable().optional().describe("Optional parent initiative id."),
  type: initiativeTypeSchema
    .optional()
    .describe("Initiative type. Use idea for loose thoughts, project for goal-oriented work, habit for ongoing practices. Defaults to project."),
  projectPhase: projectPhaseSchema.optional().describe("Optional phase for type=project initiatives: planning or doing. Defaults to doing."),
  name: z.string().trim().min(1).describe("Name exactly as Dietrich says it when possible."),
  summary: z.string().trim().min(1).nullable().optional().describe("Short optional summary."),
  markdown: z.string().optional().describe("Durable initiative memory markdown. Use adaptive sections, not a hard template."),
  startDate: initiativeDateSchema.optional().describe("Optional start date for type=project initiatives, in YYYY-MM-DD. Ideas and habits are not time-bound."),
  endDate: initiativeDateSchema.optional().describe("Optional end date for type=project initiatives, in YYYY-MM-DD. Ideas and habits are not time-bound."),
  isLocked: z.boolean().optional().describe("For type=project initiatives, locks the start/end timeframe against canvas dragging. Defaults to false."),
  isSystem: z.boolean().optional().describe("Only true for system-created initiatives.")
});
const updateInitiativeInput = z.object({
  id: z.number().int().positive().describe("Initiative id to update."),
  categoryId: z.number().int().positive().optional().describe("New category id."),
  parentId: z.number().int().positive().nullable().optional().describe("New parent initiative id, or null to remove the parent."),
  type: initiativeTypeSchema.optional().describe("New initiative type. Changing an existing type is a lifecycle decision and requires confirmation."),
  projectPhase: projectPhaseSchema.optional().describe("New phase for type=project initiatives: planning or doing."),
  name: z.string().trim().min(1).optional().describe("New initiative name."),
  status: initiativeStatusSchema.optional().describe("New initiative status."),
  summary: z.string().trim().min(1).nullable().optional().describe("New optional summary."),
  startDate: initiativeDateSchema.optional().describe("New start date for type=project initiatives, in YYYY-MM-DD, or null to clear."),
  endDate: initiativeDateSchema.optional().describe("New end date for type=project initiatives, in YYYY-MM-DD, or null to clear."),
  isLocked: z.boolean().optional().describe("For type=project initiatives, lock or unlock the project timeframe against canvas dragging."),
  confirmed: z.boolean().optional().describe("Set true only after Dietrich confirms a risky change.")
});
const archiveInitiativeInput = z.object({
  id: z.number().int().positive(),
  confirmed: z.boolean().optional()
});
const updateInitiativeMarkdownInput = z.object({
  id: z.number().int().positive(),
  markdown: z.string()
});

export const initiativeTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listInitiatives",
    description:
      "List DMAX initiatives. Optional filters include categoryId, status, and type (idea, project, habit). Returned type=project initiatives may include projectPhase, startDate, endDate, and isLocked.",
    inputSchema: listInitiativesInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new InitiativeRepository(context.db).list(input)
      };
    }
  }),
  defineTool({
    name: "getInitiative",
    description: "Get one DMAX initiative, including its type, projectPhase, optional startDate/endDate, and isLocked for type=project initiatives.",
    inputSchema: getInitiativeInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const initiative = new InitiativeRepository(context.db).findById(input.initiativeId);
      return initiative ? { ok: true, data: initiative } : { ok: false, error: `Initiative not found: ${input.initiativeId}` };
    }
  }),
  defineTool({
    name: "createInitiative",
    description:
      "Create a DMAX initiative. Always choose type: idea for loose thoughts with no time binding, project for goal-oriented work with a clear start/end when known, habit for ongoing practices without a clear end date. categoryId is required; use the system Inbox category if placement is unclear.",
    inputSchema: createInitiativeInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new InitiativeRepository(context.db).create(input)
      };
    }
  }),
  defineTool({
    name: "updateInitiative",
    description:
      "Update a DMAX initiative. For type=project initiatives, maintain projectPhase, startDate/endDate, and isLocked when Dietrich gives project phase, time-span, or timeframe lock changes. Ideas are loose thoughts and habits are ongoing practices. Changing type is a lifecycle decision such as idea -> project or idea -> habit and requires Dietrich's confirmation.",
    inputSchema: updateInitiativeInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new InitiativeRepository(context.db).update(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update initiative"
        };
      }
    }
  }),
  defineTool({
    name: "archiveInitiative",
    description: "Archive a DMAX initiative. Requires confirmation.",
    inputSchema: archiveInitiativeInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new InitiativeRepository(context.db).archive(input.id)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to archive initiative"
        };
      }
    }
  }),
  defineTool({
    name: "updateInitiativeMarkdown",
    description:
      "Replace an initiative's markdown memory. In an active initiative/idea/project/habit conversation, save useful intermediate markdown directly when Dietrich asks for it or has granted permission; do not require repeated confirmation for normal markdown refinement.",
    inputSchema: updateInitiativeMarkdownInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new InitiativeRepository(context.db).updateMarkdown(input.id, input.markdown)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update initiative markdown"
        };
      }
    }
  })
];
