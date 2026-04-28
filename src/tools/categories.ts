import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { CategoryRepository } from "../repositories/categories.js";

const listCategoriesInput = z.object({}).passthrough();
const createCategoryInput = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional(),
  isSystem: z.boolean().optional()
});
const updateCategoryInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  description: z.string().trim().min(1).nullable().optional()
});

export const categoryTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listCategories",
    description: "List d-max categories.",
    inputSchema: listCategoriesInput,
    run: (_input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new CategoryRepository(context.db).list()
      };
    }
  }),
  defineTool({
    name: "createCategory",
    description: "Create a d-max category.",
    inputSchema: createCategoryInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new CategoryRepository(context.db).create(input)
      };
    }
  }),
  defineTool({
    name: "updateCategory",
    description: "Update a d-max category.",
    inputSchema: updateCategoryInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new CategoryRepository(context.db).update(input)
        };
      } catch (error) {
        return {
          ok: false,
          error: error instanceof Error ? error.message : "Failed to update category"
        };
      }
    }
  })
];
