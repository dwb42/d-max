import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { CategoryRepository } from "../repositories/categories.js";
import type { Category } from "../repositories/categories.js";

const listCategoriesInput = z.object({}).passthrough();
const createCategoryInput = z.object({
  name: z.string().trim().min(1),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Optional Markdown description for this life area/category: scope, current situation, target state, and high-level measures."),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  isSystem: z.boolean().optional()
});
const updateCategoryInput = z.object({
  id: z.number().int().positive(),
  name: z.string().trim().min(1).optional(),
  description: z
    .string()
    .nullable()
    .optional()
    .describe("Markdown description for this life area/category. Use null or an empty string to clear it."),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

export const categoryTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listCategories",
    description: "List d-max categories/life areas, including their Markdown description when present.",
    inputSchema: listCategoriesInput,
    run: (_input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: new CategoryRepository(context.db).list().map(categoryForTool)
      };
    }
  }),
  defineTool({
    name: "createCategory",
    description: "Create a d-max category/life area. The optional description field is Markdown for scope, current situation, target state, and high-level measures.",
    inputSchema: createCategoryInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      return {
        ok: true,
        data: categoryForTool(new CategoryRepository(context.db).create(input))
      };
    }
  }),
  defineTool({
    name: "updateCategory",
    description: "Update a d-max category/life area, including its Markdown description.",
    inputSchema: updateCategoryInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: categoryForTool(new CategoryRepository(context.db).update(input))
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

function categoryForTool(category: Category): Omit<Category, "emoji"> {
  const { emoji: _emoji, ...toolCategory } = category;
  return toolCategory;
}
