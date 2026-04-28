import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { ThinkingRepository } from "../repositories/thinking.js";

const thinkingSpaceStatusSchema = z.enum(["active", "paused", "archived"]);
const thoughtTypeSchema = z.enum([
  "observation",
  "desire",
  "constraint",
  "question",
  "hypothesis",
  "option",
  "fear",
  "pattern",
  "possible_project",
  "possible_task",
  "decision",
  "discarded"
]);
const thoughtStatusSchema = z.enum(["active", "parked", "resolved", "contradicted", "discarded"]);
const thoughtMaturitySchema = z.enum(["spark", "named", "connected", "testable", "committed", "operational"]);
const linkedEntityTypeSchema = z.enum(["thought", "category", "project", "task", "tension"]);
const thoughtRelationSchema = z.enum([
  "supports",
  "contradicts",
  "causes",
  "blocks",
  "refines",
  "repeats",
  "answers",
  "depends_on",
  "candidate_for",
  "extracted_to",
  "mentions",
  "context"
]);
const tensionPressureSchema = z.enum(["low", "medium", "high"]);
const tensionStatusSchema = z.enum(["unresolved", "parked", "resolved", "discarded"]);
const scoreSchema = z.number().min(0).max(1);

const listThinkingSpacesInput = z
  .object({
    status: thinkingSpaceStatusSchema.optional()
  })
  .passthrough();
const getThinkingSpaceInput = z.object({
  id: z.number().int().positive()
});
const getThinkingContextInput = z.object({
  spaceId: z.number().int().positive()
});
const createThinkingSpaceInput = z.object({
  title: z.string().trim().min(1),
  summary: z.string().trim().min(1).nullable().optional()
});
const updateThinkingSpaceInput = z.object({
  id: z.number().int().positive(),
  title: z.string().trim().min(1).optional(),
  summary: z.string().trim().min(1).nullable().optional(),
  status: thinkingSpaceStatusSchema.optional()
});
const createThinkingSessionInput = z.object({
  spaceId: z.number().int().positive(),
  source: z.string().trim().min(1).optional(),
  rawInput: z.string().nullable().optional(),
  summary: z.string().trim().min(1).nullable().optional()
});
const thoughtInput = z.object({
  spaceId: z.number().int().positive(),
  sessionId: z.number().int().positive().nullable().optional(),
  type: thoughtTypeSchema,
  content: z.string().trim().min(1),
  normalizedContent: z.string().trim().min(1).nullable().optional(),
  maturity: thoughtMaturitySchema.optional(),
  confidence: scoreSchema.optional(),
  heat: scoreSchema.optional()
});
const captureThoughtsInput = z.object({
  thoughts: z.array(thoughtInput).min(1)
});
const listThoughtsInput = z
  .object({
    spaceId: z.number().int().positive().optional(),
    sessionId: z.number().int().positive().optional(),
    type: thoughtTypeSchema.optional(),
    status: thoughtStatusSchema.optional()
  })
  .passthrough();
const updateThoughtInput = z.object({
  id: z.number().int().positive(),
  type: thoughtTypeSchema.optional(),
  content: z.string().trim().min(1).optional(),
  normalizedContent: z.string().trim().min(1).nullable().optional(),
  status: thoughtStatusSchema.optional(),
  maturity: thoughtMaturitySchema.optional(),
  confidence: scoreSchema.optional(),
  heat: scoreSchema.optional()
});
const linkThoughtInput = z.object({
  fromThoughtId: z.number().int().positive(),
  toEntityType: linkedEntityTypeSchema,
  toEntityId: z.number().int().positive(),
  relation: thoughtRelationSchema,
  strength: scoreSchema.optional()
});
const listThoughtLinksInput = z
  .object({
    fromThoughtId: z.number().int().positive().optional(),
    toEntityType: linkedEntityTypeSchema.optional(),
    toEntityId: z.number().int().positive().optional()
  })
  .passthrough();
const createTensionInput = z.object({
  spaceId: z.number().int().positive(),
  sessionId: z.number().int().positive().nullable().optional(),
  want: z.string().trim().min(1),
  but: z.string().trim().min(1),
  pressure: tensionPressureSchema.optional()
});
const updateTensionInput = z.object({
  id: z.number().int().positive(),
  want: z.string().trim().min(1).optional(),
  but: z.string().trim().min(1).optional(),
  pressure: tensionPressureSchema.optional(),
  status: tensionStatusSchema.optional()
});
const renderOpenLoopsInput = z.object({
  spaceId: z.number().int().positive()
});
const renderProjectGateInput = z.object({
  thoughtId: z.number().int().positive()
});
const renderTaskGateInput = z.object({
  thoughtId: z.number().int().positive(),
  allowInbox: z.boolean().optional()
});

export const thinkingTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listThinkingSpaces",
    description: "List d-max thinking spaces, the persistent homes for exploratory thinking.",
    inputSchema: listThinkingSpacesInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new ThinkingRepository(context.db).listSpaces(input)
      };
    }
  }),
  defineTool({
    name: "getThinkingSpace",
    description: "Get one d-max thinking space.",
    inputSchema: getThinkingSpaceInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const space = new ThinkingRepository(context.db).findSpaceById(input.id);
      return space ? { ok: true, data: space } : { ok: false, error: `Thinking space not found: ${input.id}` };
    }
  }),
  defineTool({
    name: "getThinkingContext",
    description: "Get a thinking space with recent sessions, active thoughts, tensions, links, candidates, and open loops.",
    inputSchema: getThinkingContextInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).getThinkingContext(input.spaceId)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to get thinking context"
        };
      }
    }
  }),
  defineTool({
    name: "createThinkingSpace",
    description: "Create a d-max thinking space for an ongoing exploratory topic.",
    inputSchema: createThinkingSpaceInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new ThinkingRepository(context.db).createSpace(input)
      };
    }
  }),
  defineTool({
    name: "updateThinkingSpace",
    description: "Update a d-max thinking space title, summary, or status.",
    inputSchema: updateThinkingSpaceInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).updateSpace(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update thinking space"
        };
      }
    }
  }),
  defineTool({
    name: "createThinkingSession",
    description: "Capture a concrete thinking session inside a thinking space.",
    inputSchema: createThinkingSessionInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).createSession(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to create thinking session"
        };
      }
    }
  }),
  defineTool({
    name: "captureThoughts",
    description: "Persist typed thought objects extracted from exploratory input.",
    inputSchema: captureThoughtsInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).createThoughts(input.thoughts)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to capture thoughts"
        };
      }
    }
  }),
  defineTool({
    name: "listThoughts",
    description: "List thoughts by thinking space, session, type, or status.",
    inputSchema: listThoughtsInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new ThinkingRepository(context.db).listThoughts(input)
      };
    }
  }),
  defineTool({
    name: "updateThought",
    description: "Update a thought's content, type, status, maturity, confidence, or heat.",
    inputSchema: updateThoughtInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).updateThought(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update thought"
        };
      }
    }
  }),
  defineTool({
    name: "linkThought",
    description: "Link a thought to another thought, tension, category, project, or task.",
    inputSchema: linkThoughtInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).createThoughtLink(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to link thought"
        };
      }
    }
  }),
  defineTool({
    name: "listThoughtLinks",
    description: "List thought links.",
    inputSchema: listThoughtLinksInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new ThinkingRepository(context.db).listThoughtLinks(input)
      };
    }
  }),
  defineTool({
    name: "createTension",
    description: "Create an unresolved want/but tension inside a thinking space.",
    inputSchema: createTensionInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).createTension(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to create tension"
        };
      }
    }
  }),
  defineTool({
    name: "updateTension",
    description: "Update a tension's want, but, pressure, or status.",
    inputSchema: updateTensionInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).updateTension(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update tension"
        };
      }
    }
  }),
  defineTool({
    name: "renderOpenLoops",
    description: "Render the open loops view for a thinking space.",
    inputSchema: renderOpenLoopsInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).renderOpenLoops(input.spaceId)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to render open loops"
        };
      }
    }
  }),
  defineTool({
    name: "renderProjectGate",
    description: "Evaluate whether a possible_project thought is ready to become a confirmed project.",
    inputSchema: renderProjectGateInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).renderProjectGate(input.thoughtId)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to render project gate"
        };
      }
    }
  }),
  defineTool({
    name: "renderTaskGate",
    description: "Evaluate whether a possible_task thought is ready to become a confirmed task.",
    inputSchema: renderTaskGateInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new ThinkingRepository(context.db).renderTaskGate(input.thoughtId, { allowInbox: input.allowInbox })
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to render task gate"
        };
      }
    }
  })
];
