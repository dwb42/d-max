import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ToolDefinition } from "../core/tool-definitions.js";
import { PartyTimelineRepository } from "../repositories/party-timeline.js";

const timelineKindSchema = z.enum(["conversation", "letter_received", "letter_sent", "visit", "note"]);
const timelineChannelSchema = z.enum(["phone", "meeting", "visit", "letter", "note", "other"]);
const timelineDirectionSchema = z.enum(["inbound", "outbound", "bidirectional", "none"]);
const timelinePartyRoleSchema = z.enum(["primary", "participant", "related", "organization_context"]);

const listPartyTimelineEntriesInput = z
  .object({
    partyId: z.number().int().positive(),
    limit: z.number().int().positive().max(200).optional()
  })
  .passthrough();

const createPartyTimelineEntryInput = z.object({
  partyId: z.number().int().positive(),
  kind: timelineKindSchema,
  channel: timelineChannelSchema.nullable().optional(),
  direction: timelineDirectionSchema.optional(),
  occurredAt: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  body: z.string().nullable().optional(),
  relatedTaskId: z.number().int().positive().nullable().optional(),
  parties: z.array(z.object({
    partyId: z.number().int().positive(),
    role: timelinePartyRoleSchema.optional()
  })).optional()
});

const updatePartyTimelineEntryInput = z.object({
  id: z.number().int().positive(),
  kind: timelineKindSchema.optional(),
  channel: timelineChannelSchema.nullable().optional(),
  direction: timelineDirectionSchema.optional(),
  occurredAt: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  body: z.string().nullable().optional(),
  relatedTaskId: z.number().int().positive().nullable().optional()
});

const deletePartyTimelineEntryInput = z.object({
  id: z.number().int().positive(),
  confirmed: z.boolean().optional()
});

export const partyTimelineTools: ToolDefinition<any>[] = [
  defineTool({
    name: "listPartyTimelineEntries",
    description: "List manual communication/history entries for one person or organization party. Gmail messages are separate; this returns only manually documented conversations, letters, visits, and notes.",
    inputSchema: listPartyTimelineEntriesInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      return { ok: true, data: new PartyTimelineRepository(context.db).listForParty(input.partyId, input.limit ?? 80) };
    }
  }),
  defineTool({
    name: "createPartyTimelineEntry",
    description: "Document a past communication/history entry for a person or organization. Use tasks for planned future actions; use this only for what already happened or a durable note.",
    inputSchema: createPartyTimelineEntryInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new PartyTimelineRepository(context.db).create(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to create party timeline entry" };
      }
    }
  }),
  defineTool({
    name: "updatePartyTimelineEntry",
    description: "Update a manual communication/history entry.",
    inputSchema: updatePartyTimelineEntryInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      try {
        return { ok: true, data: new PartyTimelineRepository(context.db).update(input) };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to update party timeline entry" };
      }
    }
  }),
  defineTool({
    name: "deletePartyTimelineEntry",
    description: "Delete one manual communication/history entry. Requires confirmation.",
    inputSchema: deletePartyTimelineEntryInput,
    run: (input, context) => {
      if (!context.db) return { ok: false, error: "Database context is required" };
      if (!input.confirmed || !context.allowConfirmedActions) {
        return {
          ok: false,
          requiresConfirmation: true,
          confirmationKind: "deletePartyTimelineEntry",
          summary: `Delete party timeline entry #${input.id}.`,
          proposedAction: { tool: "deletePartyTimelineEntry", input: { ...input, confirmed: true } }
        };
      }
      const deleted = new PartyTimelineRepository(context.db).delete(input.id);
      return deleted ? { ok: true, data: { deleted: true, ...deleted } } : { ok: false, error: `Party timeline entry not found: ${input.id}` };
    }
  })
];
