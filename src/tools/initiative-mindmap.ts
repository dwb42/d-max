import { z } from "zod";
import { defineTool } from "../core/tool-definitions.js";
import type { ConfirmationRequest, ToolDefinition } from "../core/tool-definitions.js";
import { MindmapReviewService } from "../mindmap/mindmap-review-service.js";
import { InitiativeMindmapRepository, type GraphLayoutNode, type InitiativeMindmapView } from "../repositories/initiative-mindmap.js";

const mindmapCoordinate = z.number().finite().min(-100000).max(100000);

const getInitiativeMindmapInput = z.object({
  initiativeId: z.number().int().positive().describe("Initiative id whose freestyle mindmap should be loaded.")
});

const createMindmapFreestyleNodeInput = z.object({
  initiativeId: z.number().int().positive(),
  parentNodeKey: z.string().trim().min(1).nullable().optional().describe("Omit to place under branch:freestyle. Use null for a floating freestyle node."),
  label: z.string().trim().min(1).nullable().optional(),
  x: mindmapCoordinate.optional(),
  y: mindmapCoordinate.optional()
});

const updateMindmapFreestyleNodeInput = z.object({
  initiativeId: z.number().int().positive(),
  nodeKey: z.string().trim().min(1),
  label: z.string().trim().min(1).optional(),
  x: mindmapCoordinate.optional(),
  y: mindmapCoordinate.optional(),
  width: mindmapCoordinate.nonnegative().nullable().optional(),
  height: mindmapCoordinate.nonnegative().nullable().optional(),
  collapsed: z.boolean().optional(),
  parentNodeKey: z.string().trim().min(1).nullable().optional()
});

const deleteMindmapFreestyleNodeInput = z.object({
  initiativeId: z.number().int().positive(),
  nodeKey: z.string().trim().min(1),
  confirmed: z.boolean().optional()
});

const graphNodeAnnotationTypeSchema = z.enum(["priority", "warning", "timestamp", "note", "source_ref"]);

const graphNodeAnnotationInput = z.object({
  annotationType: graphNodeAnnotationTypeSchema,
  value: z.string().trim().min(1),
  payload: z.unknown().nullable().optional()
});

const mindmapPatchSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("create_node"),
    tempNodeKey: z.string().trim().min(1),
    parentNodeKey: z.string().trim().min(1).nullable().optional(),
    label: z.string().trim().min(1),
    annotations: z.array(graphNodeAnnotationInput).max(10).optional()
  }),
  z.object({
    type: z.literal("rename_node"),
    nodeKey: z.string().trim().min(1),
    label: z.string().trim().min(1)
  }),
  z.object({
    type: z.literal("reparent_node"),
    nodeKey: z.string().trim().min(1),
    parentNodeKey: z.string().trim().min(1).nullable()
  }),
  z.object({
    type: z.literal("delete_node"),
    nodeKey: z.string().trim().min(1)
  }),
  z.object({
    type: z.literal("add_annotation"),
    nodeKey: z.string().trim().min(1),
    annotationType: graphNodeAnnotationTypeSchema,
    value: z.string().trim().min(1),
    payload: z.unknown().nullable().optional()
  }),
  z.object({
    type: z.literal("remove_annotation"),
    nodeKey: z.string().trim().min(1),
    annotationType: graphNodeAnnotationTypeSchema.optional(),
    value: z.string().trim().min(1).optional()
  })
]);

const summarizeInitiativeMindmapInput = z.object({
  initiativeId: z.number().int().positive()
});

const draftMindmapChangesInput = z.object({
  initiativeId: z.number().int().positive(),
  sourceKind: z.enum(["dialog", "long_content", "mindmap_review", "manual"]).default("dialog"),
  sourceRef: z.unknown().nullable().optional(),
  summary: z.string().trim().min(1).describe("Short human-readable summary of what this draft changes."),
  rationale: z.string().trim().min(1).nullable().optional(),
  patches: z.array(mindmapPatchSchema).min(1).max(80),
  warnings: z.array(z.string().trim().min(1)).max(20).optional()
});

const commitMindmapChangeDraftInput = z.object({
  initiativeId: z.number().int().positive(),
  draftId: z.number().int().positive(),
  confirmed: z.boolean().optional()
});

export const initiativeMindmapTools: ToolDefinition<any>[] = [
  defineTool({
    name: "getInitiativeMindmap",
    description:
      "Read an initiative mindmap. Returns all nodes and edges, including derived initiative/task/media/branch nodes plus freestyle nodes, node keys, entity metadata, layout, collapse state, and move support.",
    inputSchema: getInitiativeMindmapInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new InitiativeMindmapRepository(context.db).getView({ type: "initiative", initiativeId: input.initiativeId })
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to load initiative mindmap" };
      }
    }
  }),
  defineTool({
    name: "summarizeInitiativeMindmap",
    description:
      "Summarize an initiative mindmap for dialog. Returns compact structure, depth, top-level clusters, outline, and node annotations such as priority, warning, timestamp, note, or source_ref.",
    inputSchema: summarizeInitiativeMindmapInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new MindmapReviewService(context.db).summarizeInitiativeMindmap(input.initiativeId)
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to summarize initiative mindmap" };
      }
    }
  }),
  defineTool({
    name: "draftMindmapChanges",
    description:
      "Persist a proposed initiative mindmap patch preview. Use this before changing complex mindmaps. The patches are not applied until commitMindmapChangeDraft is called after explicit user confirmation.",
    inputSchema: draftMindmapChangesInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new MindmapReviewService(context.db).draftMindmapChanges({ ...input, sourceKind: input.sourceKind ?? "dialog" })
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to draft mindmap changes" };
      }
    }
  }),
  defineTool({
    name: "commitMindmapChangeDraft",
    description:
      "Apply a previously drafted initiative mindmap patch after explicit user confirmation. Requires confirmed=true. Applies only validated freestyle-node changes and annotations.",
    inputSchema: commitMindmapChangeDraftInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new MindmapReviewService(context.db).commitMindmapChangeDraft(input)
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to commit mindmap change draft" };
      }
    }
  }),
  defineTool({
    name: "createMindmapFreestyleNode",
    description:
      "Create a freestyle node in an initiative mindmap. Omit parentNodeKey to create under branch:freestyle; pass parentNodeKey=null to create a floating freestyle node.",
    inputSchema: createMindmapFreestyleNodeInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      try {
        return {
          ok: true,
          data: new InitiativeMindmapRepository(context.db).createFreestyleNode({
            scope: { type: "initiative", initiativeId: input.initiativeId },
            parentNodeKey: input.parentNodeKey,
            label: input.label,
            x: input.x,
            y: input.y
          })
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to create freestyle mindmap node" };
      }
    }
  }),
  defineTool({
    name: "updateMindmapFreestyleNode",
    description:
      "Update one freestyle node in an initiative mindmap. Use nodeKey from getInitiativeMindmap. Supports label, x/y, width/height, collapsed, and parentNodeKey. Derived task/media/root/branch nodes cannot be edited through this agent tool.",
    inputSchema: updateMindmapFreestyleNodeInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const repository = new InitiativeMindmapRepository(context.db);
      try {
        const scope = { type: "initiative" as const, initiativeId: input.initiativeId };
        const view = repository.getView(scope);
        const existing = view.nodes.find((node) => node.nodeKey === input.nodeKey);
        if (!existing) {
          return { ok: false, error: `Mindmap node not found: ${input.nodeKey}` };
        }
        if (existing.nodeKind !== "freestyle") {
          return { ok: false, error: "Only freestyle mindmap nodes can be updated through this tool." };
        }

        return {
          ok: true,
          data: repository.updateNode({
            scope,
            nodeKey: input.nodeKey,
            label: input.label,
            x: input.x,
            y: input.y,
            width: input.width,
            height: input.height,
            collapsed: input.collapsed,
            parentNodeKey: input.parentNodeKey
          })
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to update freestyle mindmap node" };
      }
    }
  }),
  defineTool({
    name: "deleteMindmapFreestyleNode",
    description:
      "Delete a freestyle node from an initiative mindmap. Leaf freestyle nodes delete directly. Freestyle subtrees require confirmed=true after Dietrich confirms the affected nodes. Derived task/media/root/branch nodes cannot be deleted through this tool.",
    inputSchema: deleteMindmapFreestyleNodeInput,
    run: (input, context) => {
      if (!context.db) {
        return { ok: false, error: "Database context is required" };
      }

      const repository = new InitiativeMindmapRepository(context.db);
      try {
        const scope = { type: "initiative" as const, initiativeId: input.initiativeId };
        const view = repository.getView(scope);
        const existing = view.nodes.find((node) => node.nodeKey === input.nodeKey);
        if (!existing) {
          return { ok: false, error: `Mindmap node not found: ${input.nodeKey}` };
        }
        if (existing.nodeKind !== "freestyle") {
          return { ok: false, error: "Only freestyle mindmap nodes can be deleted through this tool." };
        }

        const affectedNodes = affectedSubtreeNodes(view, existing.nodeKey);
        if (affectedNodes.length > 1 && input.confirmed !== true) {
          return subtreeDeleteConfirmation(input.initiativeId, existing.nodeKey, affectedNodes);
        }

        const deletedNodes = repository.deleteFreestyleNode({ scope, nodeKey: input.nodeKey });
        return {
          ok: true,
          data: {
            deleted: true,
            initiativeId: input.initiativeId,
            deletedNodeKeys: deletedNodes.map((node) => node.nodeKey),
            deletedNodes: deletedNodes.map((node) => ({ nodeKey: node.nodeKey, label: node.label }))
          }
        };
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : "Failed to delete freestyle mindmap node" };
      }
    }
  })
];

function affectedSubtreeNodes(view: InitiativeMindmapView, nodeKey: string): GraphLayoutNode[] {
  const affectedKeys = new Set([nodeKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of view.nodes) {
      if (node.parentNodeKey && affectedKeys.has(node.parentNodeKey) && !affectedKeys.has(node.nodeKey)) {
        affectedKeys.add(node.nodeKey);
        changed = true;
      }
    }
  }
  return view.nodes.filter((node) => affectedKeys.has(node.nodeKey));
}

function subtreeDeleteConfirmation(initiativeId: number, nodeKey: string, affectedNodes: GraphLayoutNode[]): ConfirmationRequest {
  const affected = affectedNodes.map((node) => `${node.label} (${node.nodeKey})`).join(", ");
  return {
    ok: false,
    requiresConfirmation: true,
    confirmationKind: "deleteMindmapFreestyleNodeSubtree",
    summary: `Confirmation required to delete ${affectedNodes.length} freestyle mindmap nodes: ${affected}. This tool call was not applied.`,
    proposedAction: {
      tool: "deleteMindmapFreestyleNode",
      input: { initiativeId, nodeKey }
    }
  };
}
