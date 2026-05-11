import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { InitiativeRelationRepository } from "../repositories/initiative-relations.js";

const initiativeRelationTypeSchema = z.literal("precedes");

const listInitiativeRelationsInput = z
  .object({
    initiativeId: z.number().int().positive().optional().describe("List all predecessor/successor relations touching this initiative."),
    predecessorInitiativeId: z.number().int().positive().optional().describe("Filter relations where this initiative precedes another initiative."),
    successorInitiativeId: z.number().int().positive().optional().describe("Filter relations where this initiative succeeds another initiative."),
    relationType: initiativeRelationTypeSchema.optional().describe("Relation type. V1 supports only precedes.")
  })
  .passthrough();

const createInitiativeRelationInput = z.object({
  predecessorInitiativeId: z.number().int().positive().describe("The initiative that comes first."),
  successorInitiativeId: z.number().int().positive().describe("The initiative that comes after the predecessor."),
  relationType: initiativeRelationTypeSchema.optional().describe("Relation type. V1 supports only precedes.")
});

const deleteInitiativeRelationInput = z.object({
  id: z.number().int().positive().describe("Initiative relation id to delete.")
});

const getInitiativeGraphInput = z.object({
  initiativeId: z.number().int().positive().optional().describe("Optional root initiative id. Omit to return all relation-connected initiatives."),
  maxDepth: z.number().int().min(0).max(20).optional().describe("Depth around initiativeId. Defaults to 3.")
});

export const initiativeRelationTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listInitiativeRelations",
    description:
      "List directed initiative predecessor/successor relations. Use successorInitiativeId to answer what comes before an initiative; use predecessorInitiativeId to answer what follows or depends on an initiative.",
    inputSchema: listInitiativeRelationsInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new InitiativeRelationRepository(context.db).list(input)
      };
    }
  }),
  defineTool({
    name: "createInitiativeRelation",
    description:
      "Create a directed initiative relation where predecessorInitiativeId precedes successorInitiativeId. Use this for natural language like 'B follows A', which means A precedes B. Cycles and self-relations are rejected.",
    inputSchema: createInitiativeRelationInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new InitiativeRelationRepository(context.db).create(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to create initiative relation"
        };
      }
    }
  }),
  defineTool({
    name: "deleteInitiativeRelation",
    description: "Delete one initiative predecessor/successor relation by id. This does not require confirmation.",
    inputSchema: deleteInitiativeRelationInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const deleted = new InitiativeRelationRepository(context.db).delete(input.id);
      return deleted ? { ok: true, data: { deleted: true, ...deleted } } : { ok: false, error: `Initiative relation not found: ${input.id}` };
    }
  }),
  defineTool({
    name: "getInitiativeGraph",
    description:
      "Return the directed initiative precedence graph. With initiativeId, returns predecessor and successor relations around that root; without initiativeId, returns all relation-connected initiatives.",
    inputSchema: getInitiativeGraphInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new InitiativeRelationRepository(context.db).getInitiativeGraph(input)
      };
    }
  })
];
