import { z } from "zod";
import type Database from "better-sqlite3";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { CategoryRepository } from "../repositories/categories.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import { MediaAssetRepository } from "../repositories/media-assets.js";
import { MediaLinkRepository } from "../repositories/media-links.js";
import type { MediaAttachment, MediaEntityType } from "../repositories/media-links.js";
import { TaskRepository } from "../repositories/tasks.js";

const mediaEntityTypeSchema = z.enum(["category", "initiative", "task"]);

const listMediaAttachmentsInput = z.object({
  entityType: mediaEntityTypeSchema,
  entityId: z.number().int().positive()
});

const attachMediaToEntityInput = z.object({
  assetId: z.number().int().positive(),
  entityType: mediaEntityTypeSchema,
  entityId: z.number().int().positive(),
  caption: z.string().nullable().optional(),
  role: z.string().trim().min(1).nullable().optional()
});

const updateMediaAttachmentInput = z.object({
  id: z.number().int().positive(),
  caption: z.string().nullable().optional(),
  role: z.string().trim().min(1).nullable().optional()
});

const deleteMediaAttachmentInput = z.object({
  id: z.number().int().positive(),
  confirmed: z.boolean().optional()
});

const reorderMediaAttachmentsInput = z.object({
  entityType: mediaEntityTypeSchema,
  entityId: z.number().int().positive(),
  linkIds: z.array(z.number().int().positive()).min(1)
});

export const mediaTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listMediaAttachments",
    description:
      "List media attachments for a DMAX category, initiative, or task. Returns metadata, captions, and derived text only; raw files are served by the app API.",
    inputSchema: listMediaAttachmentsInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }
      try {
        ensureMediaEntityExists(context.db, input.entityType, input.entityId);
        return {
          ok: true,
          data: new MediaLinkRepository(context.db).listForEntity(input.entityType, input.entityId).map(mediaAttachmentForTool)
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to list media attachments" };
      }
    }
  }),
  defineTool({
    name: "attachMediaToEntity",
    description:
      "Attach an existing uploaded media asset to a category, initiative, or task. This does not upload new binary data; browser/API upload creates assets.",
    inputSchema: attachMediaToEntityInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }
      try {
        ensureMediaEntityExists(context.db, input.entityType, input.entityId);
        if (!new MediaAssetRepository(context.db).findById(input.assetId)) {
          return { ok: false, error: `Media asset not found: ${input.assetId}` };
        }
        return {
          ok: true,
          data: mediaAttachmentForTool(new MediaLinkRepository(context.db).create(input))
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to attach media" };
      }
    }
  }),
  defineTool({
    name: "updateMediaAttachment",
    description: "Update a media attachment caption or role.",
    inputSchema: updateMediaAttachmentInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }
      try {
        return {
          ok: true,
          data: mediaAttachmentForTool(new MediaLinkRepository(context.db).update(input))
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to update media attachment" };
      }
    }
  }),
  defineTool({
    name: "deleteMediaAttachment",
    description: "Remove a media attachment link. Requires confirmation.",
    inputSchema: deleteMediaAttachmentInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }
      const deleted = new MediaLinkRepository(context.db).delete(input.id);
      if (!deleted) {
        return { ok: false, error: `Media attachment not found: ${input.id}` };
      }
      return {
        ok: true,
        data: { deleted: true, id: deleted.id, entityType: deleted.entityType, entityId: deleted.entityId }
      };
    }
  }),
  defineTool({
    name: "reorderMediaAttachments",
    description: "Persist the order of media attachments within one category, initiative, or task.",
    inputSchema: reorderMediaAttachmentsInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }
      try {
        ensureMediaEntityExists(context.db, input.entityType, input.entityId);
        return {
          ok: true,
          data: {
            entityType: input.entityType,
            entityId: input.entityId,
            attachments: new MediaLinkRepository(context.db)
              .reorderWithinEntity(input.entityType, input.entityId, input.linkIds)
              .map(mediaAttachmentForTool)
          }
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to reorder media attachments" };
      }
    }
  })
];

function ensureMediaEntityExists(db: Database.Database, entityType: MediaEntityType, entityId: number): void {
  if (entityType === "category" && !new CategoryRepository(db).findById(entityId)) {
    throw new Error(`Category not found: ${entityId}`);
  }
  if (entityType === "initiative" && !new InitiativeRepository(db).findById(entityId)) {
    throw new Error(`Initiative not found: ${entityId}`);
  }
  if (entityType === "task" && !new TaskRepository(db).findById(entityId)) {
    throw new Error(`Task not found: ${entityId}`);
  }
}

function mediaAttachmentForTool(attachment: MediaAttachment) {
  return {
    id: attachment.id,
    assetId: attachment.assetId,
    entityType: attachment.entityType,
    entityId: attachment.entityId,
    caption: attachment.caption,
    role: attachment.role,
    sortOrder: attachment.sortOrder,
    asset: {
      id: attachment.asset.id,
      kind: attachment.asset.kind,
      mimeType: attachment.asset.mimeType,
      originalName: attachment.asset.originalName,
      sha256: attachment.asset.sha256,
      byteSize: attachment.asset.byteSize,
      transcript: attachment.asset.transcript,
      textExcerpt: attachment.asset.textExcerpt,
      summary: attachment.asset.summary
    }
  };
}
