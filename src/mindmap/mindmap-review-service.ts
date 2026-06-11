import type Database from "better-sqlite3";
import { GraphNodeAnnotationRepository, type GraphNodeAnnotation, type GraphNodeAnnotationType } from "../repositories/graph-node-annotations.js";
import { InitiativeMindmapRepository, type GraphLayoutNode, type InitiativeMindmapView } from "../repositories/initiative-mindmap.js";
import { MindmapChangeDraftRepository, type MindmapChangeDraft, type MindmapChangeDraftSourceKind, type MindmapChangePatch } from "../repositories/mindmap-change-drafts.js";

export type MindmapSummary = {
  initiativeId: number;
  nodeCount: number;
  freestyleNodeCount: number;
  maxDepth: number;
  topLevel: Array<{
    nodeKey: string;
    label: string;
    childCount: number;
    annotations: GraphNodeAnnotation[];
  }>;
  annotationsByType: Record<GraphNodeAnnotationType, GraphNodeAnnotation[]>;
  outline: string[];
};

export type DraftMindmapChangesInput = {
  initiativeId: number;
  sourceKind: MindmapChangeDraftSourceKind;
  sourceRef?: unknown | null;
  summary: string;
  rationale?: string | null;
  patches: MindmapChangePatch[];
  warnings?: string[];
};

export type CommitMindmapChangeDraftResult = {
  draft: MindmapChangeDraft;
  createdNodeKeys: string[];
  updatedNodeKeys: string[];
  deletedNodeKeys: string[];
  createdAnnotationIds: number[];
  removedAnnotationIds: number[];
  mindmap: InitiativeMindmapView;
};

export class MindmapReviewService {
  private readonly mindmaps: InitiativeMindmapRepository;
  private readonly annotations: GraphNodeAnnotationRepository;
  private readonly drafts: MindmapChangeDraftRepository;

  constructor(private readonly db: Database.Database) {
    this.mindmaps = new InitiativeMindmapRepository(db);
    this.annotations = new GraphNodeAnnotationRepository(db);
    this.drafts = new MindmapChangeDraftRepository(db);
  }

  summarizeInitiativeMindmap(initiativeId: number): MindmapSummary {
    const scope = { type: "initiative" as const, initiativeId };
    const mindmap = this.mindmaps.getView(scope);
    const annotations = this.annotations.listForScope(scope);
    const annotationsByNode = groupAnnotationsByNode(annotations);
    const childrenByParent = groupChildrenByParent(mindmap.nodes);
    const root = mindmap.nodes.find((node) => node.nodeKind === "initiative_root") ?? mindmap.nodes[0] ?? null;
    const topLevelNodes = root ? (childrenByParent.get(root.nodeKey) ?? []) : [];
    const annotationsByType = groupAnnotationsByType(annotations);

    return {
      initiativeId,
      nodeCount: mindmap.nodes.length,
      freestyleNodeCount: mindmap.nodes.filter((node) => node.nodeKind === "freestyle").length,
      maxDepth: root ? maxDepthFrom(root.nodeKey, childrenByParent, 0) : 0,
      topLevel: topLevelNodes.map((node) => ({
        nodeKey: node.nodeKey,
        label: node.label,
        childCount: childrenByParent.get(node.nodeKey)?.length ?? 0,
        annotations: annotationsByNode.get(node.nodeKey) ?? []
      })),
      annotationsByType,
      outline: root ? outlineFrom(root.nodeKey, childrenByParent, annotationsByNode) : []
    };
  }

  draftMindmapChanges(input: DraftMindmapChangesInput): MindmapChangeDraft {
    const scope = { type: "initiative" as const, initiativeId: input.initiativeId };
    const mindmap = this.mindmaps.getView(scope);
    validatePatches(mindmap, input.patches);
    return this.drafts.create({
      initiativeId: input.initiativeId,
      sourceKind: input.sourceKind,
      sourceRef: input.sourceRef,
      summary: input.summary,
      rationale: input.rationale,
      patches: input.patches,
      warnings: input.warnings
    });
  }

  commitMindmapChangeDraft(input: { initiativeId: number; draftId: number; confirmed?: boolean }): CommitMindmapChangeDraftResult {
    if (input.confirmed !== true) {
      throw new Error("Mindmap change draft commit requires confirmed=true after Dietrich confirms the patch preview.");
    }
    const draft = this.drafts.findById(input.draftId);
    if (!draft) {
      throw new Error(`Mindmap change draft not found: ${input.draftId}`);
    }
    if (draft.initiativeId !== input.initiativeId) {
      throw new Error(`Mindmap change draft ${draft.id} does not belong to initiative ${input.initiativeId}.`);
    }
    if (draft.status !== "draft") {
      throw new Error(`Mindmap change draft ${draft.id} is already ${draft.status}.`);
    }

    const scope = { type: "initiative" as const, initiativeId: input.initiativeId };
    const transaction = this.db.transaction(() => {
      const latest = this.mindmaps.getView(scope);
      validatePatches(latest, draft.patches);
      const tempToNodeKey = new Map<string, string>();
      const createdNodeKeys: string[] = [];
      const updatedNodeKeys: string[] = [];
      const deletedNodeKeys: string[] = [];
      const createdAnnotationIds: number[] = [];
      const removedAnnotationIds: number[] = [];

      for (const patch of draft.patches) {
        if (patch.type === "create_node") {
          const parentNodeKey = resolveOptionalParentNodeKey(patch.parentNodeKey, tempToNodeKey);
          const node = this.mindmaps.createFreestyleNode({
            scope,
            parentNodeKey,
            label: patch.label
          });
          tempToNodeKey.set(patch.tempNodeKey, node.nodeKey);
          createdNodeKeys.push(node.nodeKey);
          for (const annotation of patch.annotations ?? []) {
            createdAnnotationIds.push(this.annotations.create({
              scope,
              nodeKey: node.nodeKey,
              annotationType: annotation.annotationType,
              value: annotation.value,
              payload: annotation.payload
            }).id);
          }
          continue;
        }

        if (patch.type === "rename_node") {
          const nodeKey = resolveRequiredNodeKey(patch.nodeKey, tempToNodeKey);
          this.mindmaps.updateNode({ scope, nodeKey, label: patch.label });
          updatedNodeKeys.push(nodeKey);
          continue;
        }

        if (patch.type === "reparent_node") {
          const nodeKey = resolveRequiredNodeKey(patch.nodeKey, tempToNodeKey);
          const parentNodeKey = resolveParentNodeKey(patch.parentNodeKey, tempToNodeKey);
          this.mindmaps.updateNode({ scope, nodeKey, parentNodeKey });
          updatedNodeKeys.push(nodeKey);
          continue;
        }

        if (patch.type === "delete_node") {
          const nodeKey = resolveRequiredNodeKey(patch.nodeKey, tempToNodeKey);
          const deleted = this.mindmaps.deleteFreestyleNode({ scope, nodeKey });
          deletedNodeKeys.push(...deleted.map((node) => node.nodeKey));
          continue;
        }

        if (patch.type === "add_annotation") {
          const nodeKey = resolveRequiredNodeKey(patch.nodeKey, tempToNodeKey);
          createdAnnotationIds.push(this.annotations.create({
            scope,
            nodeKey,
            annotationType: patch.annotationType,
            value: patch.value,
            payload: patch.payload
          }).id);
          continue;
        }

        if (patch.type === "remove_annotation") {
          const nodeKey = resolveRequiredNodeKey(patch.nodeKey, tempToNodeKey);
          removedAnnotationIds.push(...this.annotations.deleteMatching({
            scope,
            nodeKey,
            annotationType: patch.annotationType,
            value: patch.value
          }).map((annotation) => annotation.id));
        }
      }

      const committed = this.drafts.markCommitted(draft.id);
      return {
        draft: committed,
        createdNodeKeys,
        updatedNodeKeys: unique(updatedNodeKeys),
        deletedNodeKeys: unique(deletedNodeKeys),
        createdAnnotationIds,
        removedAnnotationIds,
        mindmap: this.mindmaps.getView(scope)
      };
    });

    return transaction();
  }
}

function validatePatches(mindmap: InitiativeMindmapView, patches: MindmapChangePatch[]): void {
  if (patches.length === 0) {
    throw new Error("Mindmap change draft requires at least one patch.");
  }
  const nodesByKey = new Map(mindmap.nodes.map((node) => [node.nodeKey, node]));
  const tempKeys = new Set<string>();
  for (const patch of patches) {
    if (patch.type === "create_node") {
      if (tempKeys.has(patch.tempNodeKey) || nodesByKey.has(patch.tempNodeKey)) {
        throw new Error(`Duplicate mindmap draft temp node key: ${patch.tempNodeKey}`);
      }
      tempKeys.add(patch.tempNodeKey);
      if (patch.parentNodeKey !== undefined && patch.parentNodeKey !== null) {
        assertParentReference(patch.parentNodeKey, nodesByKey, tempKeys);
      }
      continue;
    }

    if (patch.type === "rename_node" || patch.type === "reparent_node" || patch.type === "delete_node") {
      const node = nodesByKey.get(patch.nodeKey);
      if (!node) {
        throw new Error(`Mindmap node not found: ${patch.nodeKey}`);
      }
      if (node.nodeKind !== "freestyle") {
        throw new Error(`Only freestyle mindmap nodes can be structurally changed: ${patch.nodeKey}`);
      }
    }

    if (patch.type === "reparent_node" && patch.parentNodeKey !== null) {
      assertParentReference(patch.parentNodeKey, nodesByKey, tempKeys);
    }

    if (patch.type === "add_annotation" || patch.type === "remove_annotation") {
      if (!nodesByKey.has(patch.nodeKey) && !tempKeys.has(patch.nodeKey)) {
        throw new Error(`Mindmap node not found for annotation patch: ${patch.nodeKey}`);
      }
    }
  }
}

function assertParentReference(nodeKey: string, nodesByKey: Map<string, GraphLayoutNode>, tempKeys: Set<string>): void {
  if (tempKeys.has(nodeKey)) return;
  const parent = nodesByKey.get(nodeKey);
  if (!parent) {
    throw new Error(`Mindmap parent node not found: ${nodeKey}`);
  }
  if (parent.nodeKind === "media") {
    throw new Error("Media nodes cannot be used as freestyle mindmap parents.");
  }
}

function resolveRequiredNodeKey(nodeKey: string, tempToNodeKey: Map<string, string>): string {
  return tempToNodeKey.get(nodeKey) ?? nodeKey;
}

function resolveParentNodeKey(nodeKey: string | null, tempToNodeKey: Map<string, string>): string | null {
  if (nodeKey === null) return null;
  return tempToNodeKey.get(nodeKey) ?? nodeKey;
}

function resolveOptionalParentNodeKey(nodeKey: string | null | undefined, tempToNodeKey: Map<string, string>): string | null | undefined {
  if (nodeKey === undefined || nodeKey === null) return nodeKey;
  return tempToNodeKey.get(nodeKey) ?? nodeKey;
}

function groupChildrenByParent(nodes: GraphLayoutNode[]): Map<string, GraphLayoutNode[]> {
  const result = new Map<string, GraphLayoutNode[]>();
  for (const node of nodes) {
    if (!node.parentNodeKey) continue;
    const children = result.get(node.parentNodeKey) ?? [];
    children.push(node);
    result.set(node.parentNodeKey, children);
  }
  for (const [parent, children] of result) {
    result.set(parent, children.sort((left, right) => left.y - right.y || left.x - right.x || left.label.localeCompare(right.label)));
  }
  return result;
}

function groupAnnotationsByNode(annotations: GraphNodeAnnotation[]): Map<string, GraphNodeAnnotation[]> {
  const result = new Map<string, GraphNodeAnnotation[]>();
  for (const annotation of annotations) {
    const list = result.get(annotation.nodeKey) ?? [];
    list.push(annotation);
    result.set(annotation.nodeKey, list);
  }
  return result;
}

function groupAnnotationsByType(annotations: GraphNodeAnnotation[]): Record<GraphNodeAnnotationType, GraphNodeAnnotation[]> {
  return {
    priority: annotations.filter((annotation) => annotation.annotationType === "priority"),
    warning: annotations.filter((annotation) => annotation.annotationType === "warning"),
    timestamp: annotations.filter((annotation) => annotation.annotationType === "timestamp"),
    note: annotations.filter((annotation) => annotation.annotationType === "note"),
    source_ref: annotations.filter((annotation) => annotation.annotationType === "source_ref")
  };
}

function maxDepthFrom(nodeKey: string, childrenByParent: Map<string, GraphLayoutNode[]>, depth: number): number {
  const children = childrenByParent.get(nodeKey) ?? [];
  if (children.length === 0) return depth;
  return Math.max(...children.map((child) => maxDepthFrom(child.nodeKey, childrenByParent, depth + 1)));
}

function outlineFrom(nodeKey: string, childrenByParent: Map<string, GraphLayoutNode[]>, annotationsByNode: Map<string, GraphNodeAnnotation[]>, depth = 0): string[] {
  const children = childrenByParent.get(nodeKey) ?? [];
  const lines: string[] = [];
  for (const child of children) {
    const annotations = annotationsByNode.get(child.nodeKey) ?? [];
    const markers = annotations.length > 0
      ? ` [${annotations.map((annotation) => `${annotation.annotationType}: ${annotation.value}`).join("; ")}]`
      : "";
    lines.push(`${"  ".repeat(depth)}- ${child.label} (${child.nodeKey})${markers}`);
    if (!child.collapsed) {
      lines.push(...outlineFrom(child.nodeKey, childrenByParent, annotationsByNode, depth + 1));
    }
  }
  return lines;
}

function unique(values: string[]): string[] {
  return [...new Set(values)];
}
