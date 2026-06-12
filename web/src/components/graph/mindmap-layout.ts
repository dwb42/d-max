import type { GraphLayoutNode, InitiativeMindmap as InitiativeMindmapData } from "../../types.js";

export type MindmapMode = "freestyle" | "structure";
export type MindmapTopicLevel = "central" | "main" | "sub";
export type MindmapSide = "left" | "right";

export type MindmapMeasuredNode = {
  width: number;
  height: number;
};

export type MindmapLayoutNode = {
  graphNode: GraphLayoutNode;
  nodeKey: string;
  parentNodeKey: string | null;
  actualParentNodeKey: string | null;
  topicLevel: MindmapTopicLevel;
  side: MindmapSide | null;
  x: number;
  y: number;
  width: number;
  height: number;
  subtreeHeight: number;
};

export type MindmapLayout = {
  rootNodeKey: string;
  nodes: MindmapLayoutNode[];
  nodesByKey: Map<string, MindmapLayoutNode>;
  childCounts: Map<string, number>;
  edges: Array<{ id: string; sourceNodeKey: string; targetNodeKey: string }>;
};

export type FreestyleSnapshot = Array<Pick<GraphLayoutNode, "nodeKey" | "parentNodeKey" | "label" | "x" | "y" | "width" | "height" | "collapsed">>;

export type MindmapDropIntent =
  | { type: "reparent"; nodeKey: string; parentNodeKey: string; insertionIndex: number | null; side?: MindmapSide; targetNodeKey: string; placement: "into"; siblingNodeKeys?: string[] }
  | { type: "reorder"; nodeKey: string; parentNodeKey: string | null; insertionIndex: number; side?: MindmapSide; targetNodeKey: string; placement: "before" | "after"; siblingNodeKeys?: string[] }
  | { type: "side"; nodeKey: string; side: MindmapSide };

export type MindmapDropInput = {
  draggedNodeKey: string;
  x: number;
  y: number;
  centerX?: number;
  centerY?: number;
};

export type MindmapSiblingCreationHint = {
  parentNodeKey: string | null;
  x?: number;
  y?: number;
};

const MIN_NODE_WIDTH = 86;
const MIN_EMPTY_NODE_WIDTH = 180;
const MAX_NODE_WIDTH = 380;
const BASE_NODE_HEIGHT = 56;
const SUB_NODE_HEIGHT = 30;
const NODE_TEXT_AVERAGE_CHAR_WIDTH = 7.2;
const NODE_HORIZONTAL_TEXT_PADDING = 32;
const ROOT_MAX_WIDTH = 340;
const ROOT_MIN_WIDTH = 180;
const MAIN_GAP_X = 132;
const CHILD_GAP_X = 82;
const MAIN_GAP_Y = 42;
const SIBLING_GAP_Y = 3;
const DROP_INTO_PADDING = 2;
const SIDE_HINT_ABSOLUTE_X = 10_000;
const SIDE_HINT_THRESHOLD_X = 5_000;
const ORDER_STEP_Y = 100;

export function rootNodeKey(mindmap: InitiativeMindmapData): string {
  const root = mindmap.nodes.find((node) => node.nodeKind === "initiative_root");
  return root?.nodeKey ?? (mindmap.scope.type === "initiative" ? `initiative:${mindmap.scope.initiativeId}` : "root");
}

export function measureMindmapNode(node: GraphLayoutNode, topicLevel: MindmapTopicLevel = "main"): MindmapMeasuredNode {
  const label = node.label.trim();
  const baseHeight = node.nodeKind === "branch" ? 54 : topicLevel === "sub" ? SUB_NODE_HEIGHT : BASE_NODE_HEIGHT;
  if (!label) return { width: MIN_EMPTY_NODE_WIDTH, height: baseHeight };

  const maxWidth = node.nodeKind === "initiative_root" ? ROOT_MAX_WIDTH : MAX_NODE_WIDTH;
  const minWidth = node.nodeKind === "initiative_root" ? ROOT_MIN_WIDTH : MIN_NODE_WIDTH;
  const longestWordLength = Math.max(...label.split(/\s+/).map((word) => word.length));
  const singleLineWidth = label.length * NODE_TEXT_AVERAGE_CHAR_WIDTH + NODE_HORIZONTAL_TEXT_PADDING;
  const longestWordWidth = longestWordLength * NODE_TEXT_AVERAGE_CHAR_WIDTH + NODE_HORIZONTAL_TEXT_PADDING;
  const preferredWidth = Math.min(singleLineWidth, maxWidth);
  const width = Math.round(Math.min(maxWidth, Math.max(minWidth, longestWordWidth, preferredWidth)));
  const estimatedCharsPerLine = Math.max(8, Math.floor((width - NODE_HORIZONTAL_TEXT_PADDING) / NODE_TEXT_AVERAGE_CHAR_WIDTH));
  const estimatedLines = singleLineWidth <= maxWidth
    ? 1
    : Math.min(4, Math.max(1, Math.ceil(node.label.length / estimatedCharsPerLine)));
  return { width, height: baseHeight + (estimatedLines - 1) * 18 };
}

export function computeRadialMindmapLayout(mindmap: InitiativeMindmapData, mode: MindmapMode): MindmapLayout {
  const rootKey = rootNodeKey(mindmap);
  const visibleNodeKeys = visibleMindmapNodeKeys(mindmap, mode);
  const visibleNodes = mindmap.nodes.filter((node) => visibleNodeKeys.has(node.nodeKey));
  const visibleNodeKeySet = new Set(visibleNodes.map((node) => node.nodeKey));
  const effectiveParents = new Map<string, string | null>();
  const childrenByParent = new Map<string | null, GraphLayoutNode[]>();

  for (const node of visibleNodes) {
    const parentNodeKey = effectiveParentNodeKey(node, rootKey, visibleNodeKeySet, mode);
    effectiveParents.set(node.nodeKey, parentNodeKey);
    if (node.nodeKey !== rootKey) {
      const children = childrenByParent.get(parentNodeKey) ?? [];
      children.push(node);
      childrenByParent.set(parentNodeKey, children);
    }
  }

  for (const [parentKey, children] of childrenByParent) {
    childrenByParent.set(parentKey, sortMindmapSiblings(children));
  }

  const depths = mindmapNodeDepths(rootKey, childrenByParent);
  const measured = new Map(visibleNodes.map((node) => [node.nodeKey, measureMindmapNode(node, topicLevelFromDepth(depths.get(node.nodeKey) ?? 0))]));
  const subtreeHeights = new Map<string, number>();

  const calculateSubtreeHeight = (node: GraphLayoutNode): number => {
    const size = measured.get(node.nodeKey)!;
    if (node.collapsed) {
      subtreeHeights.set(node.nodeKey, size.height);
      return size.height;
    }
    const children = childrenByParent.get(node.nodeKey) ?? [];
    if (children.length === 0) {
      subtreeHeights.set(node.nodeKey, size.height);
      return size.height;
    }
    for (const child of children) {
      calculateSubtreeHeight(child);
    }
    const childGap = siblingListGap(children, measured, subtreeHeights, childrenByParent);
    let childHeight = 0;
    children.forEach((child, index) => {
      childHeight += subtreeHeights.get(child.nodeKey) ?? measured.get(child.nodeKey)!.height;
      if (index > 0) {
        childHeight += childGap;
      }
    });
    const height = Math.max(size.height, childHeight);
    subtreeHeights.set(node.nodeKey, height);
    return height;
  };

  for (const node of visibleNodes) {
    if (!subtreeHeights.has(node.nodeKey)) {
      calculateSubtreeHeight(node);
    }
  }

  const sides = assignMainTopicSides(childrenByParent.get(rootKey) ?? [], subtreeHeights, measured);

  const root = visibleNodes.find((node) => node.nodeKey === rootKey) ?? visibleNodes[0];
  const placed = new Map<string, MindmapLayoutNode>();
  if (!root) {
    return { rootNodeKey: rootKey, nodes: [], nodesByKey: placed, childCounts: new Map(), edges: [] };
  }

  const rootSize = measured.get(root.nodeKey)!;
  placed.set(root.nodeKey, {
    graphNode: root,
    nodeKey: root.nodeKey,
    parentNodeKey: null,
    actualParentNodeKey: root.parentNodeKey,
    topicLevel: "central",
    side: null,
    x: -rootSize.width / 2,
    y: -rootSize.height / 2,
    width: rootSize.width,
    height: rootSize.height,
    subtreeHeight: subtreeHeights.get(root.nodeKey) ?? rootSize.height
  });

  const mainTopics = childrenByParent.get(rootKey) ?? [];
  placeMainTopics(mainTopics.filter((node) => sides.get(node.nodeKey) === "left"), rootKey, "left", rootSize, measured, subtreeHeights, childrenByParent, sides, placed);
  placeMainTopics(mainTopics.filter((node) => sides.get(node.nodeKey) === "right"), rootKey, "right", rootSize, measured, subtreeHeights, childrenByParent, sides, placed);

  const nodes = visibleNodes
    .map((node) => placed.get(node.nodeKey))
    .filter((node): node is MindmapLayoutNode => Boolean(node));

  const childCounts = countMindmapChildren(mindmap, mode);

  const edges = nodes
    .filter((node) => node.parentNodeKey)
    .map((node) => ({
      id: `parent:${node.parentNodeKey}->${node.nodeKey}`,
      sourceNodeKey: node.parentNodeKey!,
      targetNodeKey: node.nodeKey
    }));

  return { rootNodeKey: rootKey, nodes, nodesByKey: placed, childCounts, edges };
}

export function computeMindmapDropIntent(layout: MindmapLayout, input: MindmapDropInput): MindmapDropIntent | null {
  const dragged = layout.nodesByKey.get(input.draggedNodeKey);
  if (!dragged || dragged.nodeKey === layout.rootNodeKey || dragged.graphNode.nodeKind !== "freestyle") {
    return null;
  }

  const center = {
    x: input.centerX ?? input.x + dragged.width / 2,
    y: input.centerY ?? input.y + dragged.height / 2
  };
  const descendantKeys = descendantsIncluding(layout.nodes, dragged.nodeKey);

  const edgeReorder = siblingEdgeReorderIntent(layout, dragged, center, descendantKeys);
  if (edgeReorder) return edgeReorder;

  const slotReorder = siblingSlotReorderIntent(layout, dragged, center, descendantKeys);
  if (slotReorder) return slotReorder;

  const dropTarget = layout.nodes
    .filter((node) => node.nodeKey !== dragged.nodeKey && !descendantKeys.has(node.nodeKey) && canParentFreestyleNode(node.graphNode))
    .find((node) => pointInNode(center, node, DROP_INTO_PADDING));

  if (dropTarget) {
    const parentNodeKey = dropTarget.nodeKey;
    const side = parentNodeKey === layout.rootNodeKey ? sideFromCenter(center.x) : dropTarget.side ?? undefined;
    const siblingNodeKeys = targetSiblingNodeKeys(layout, parentNodeKey, side);
    return { type: "reparent", nodeKey: dragged.nodeKey, parentNodeKey, insertionIndex: null, side, targetNodeKey: dropTarget.nodeKey, placement: "into", siblingNodeKeys };
  }

  if (dragged.parentNodeKey === layout.rootNodeKey) {
    const nextSide = sideFromCenter(center.x);
    if (dragged.side && nextSide !== dragged.side) {
      return { type: "side", nodeKey: dragged.nodeKey, side: nextSide };
    }
  }

  return null;
}

export function mindmapWithFreestyleSnapshot(mindmap: InitiativeMindmapData, snapshot: FreestyleSnapshot): InitiativeMindmapData {
  const snapshotByKey = new Map(snapshot.map((node) => [node.nodeKey, node]));
  const snapshotKeys = new Set(snapshotByKey.keys());
  const derivedNodes = mindmap.nodes.filter((node) => node.nodeKind !== "freestyle");
  const freestyleNodes = snapshot.map((snapshotNode) => {
    const current = mindmap.nodes.find((node) => node.nodeKey === snapshotNode.nodeKey);
    if (!current) {
      throw new Error(`Mindmap preview snapshot includes unknown node key: ${snapshotNode.nodeKey}`);
    }
    return {
      ...current,
      ...snapshotNode,
      nodeKind: "freestyle" as const,
      entityType: null,
      entityId: null
    };
  });
  const remainingFreestyleNodes = mindmap.nodes.filter((node) => node.nodeKind === "freestyle" && !snapshotKeys.has(node.nodeKey));
  return { ...mindmap, nodes: [...derivedNodes, ...freestyleNodes, ...remainingFreestyleNodes] };
}

export function applyMindmapDropIntent(mindmap: InitiativeMindmapData, intent: MindmapDropIntent): FreestyleSnapshot | null {
  const dragged = mindmap.nodes.find((node) => node.nodeKey === intent.nodeKey);
  if (!dragged || dragged.nodeKind !== "freestyle") return null;

  const nextNodes = mindmap.nodes.map((node) => ({ ...node }));
  const nextDragged = nextNodes.find((node) => node.nodeKey === intent.nodeKey)!;
  if (intent.type === "reparent" || intent.type === "reorder") {
    nextDragged.parentNodeKey = intent.parentNodeKey;
  }
  if (intent.type === "side") {
    nextDragged.x = sideHintX(intent.side);
  } else if (intent.side) {
    nextDragged.x = sideHintX(intent.side);
  }
  if (intent.type === "reparent") {
    const targetParent = nextNodes.find((node) => node.nodeKey === intent.parentNodeKey);
    if (targetParent) {
      targetParent.collapsed = false;
    }
  }

  const parentNodeKey = intent.type === "side" ? nextDragged.parentNodeKey : intent.parentNodeKey;
  const siblings = reorderableSnapshotSiblings(nextNodes, parentNodeKey, nextDragged.nodeKey, intent.type === "side" ? undefined : intent.siblingNodeKeys);
  const insertionIndex = snapshotInsertionIndex(siblings, nextDragged, intent);
  const orderedSiblings = [...siblings.slice(0, insertionIndex), nextDragged, ...siblings.slice(insertionIndex)];
  orderedSiblings.forEach((node, index) => {
    node.y = index * ORDER_STEP_Y;
  });

  return nextNodes
    .filter((node) => node.nodeKind === "freestyle")
    .map((node) => ({
      nodeKey: node.nodeKey,
      parentNodeKey: node.parentNodeKey,
      label: node.label,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      collapsed: node.collapsed
    }));
}

export function siblingCreationHint(mindmap: InitiativeMindmapData, selectedNodeKey: string | null): MindmapSiblingCreationHint | null {
  const rootKey = rootNodeKey(mindmap);
  const selected = mindmap.nodes.find((node) => node.nodeKey === selectedNodeKey) ?? mindmap.nodes.find((node) => node.nodeKey === rootKey);
  if (!selected) return null;

  const parentNodeKey = selected.parentNodeKey ?? rootKey;
  if (selected.nodeKey === rootKey) {
    return { parentNodeKey: rootKey };
  }

  const siblings = sortMindmapSiblings(mindmap.nodes.filter((node) => node.parentNodeKey === parentNodeKey));
  const selectedIndex = siblings.findIndex((node) => node.nodeKey === selected.nodeKey);
  const nextSibling = selectedIndex === -1 ? null : siblings[selectedIndex + 1] ?? null;
  const nextY = nextSibling && nextSibling.y > selected.y
    ? selected.y + (nextSibling.y - selected.y) / 2
    : selected.y + ORDER_STEP_Y;

  return {
    parentNodeKey,
    x: selected.x,
    y: nextY
  };
}

export function freestyleSnapshot(mindmap: InitiativeMindmapData): FreestyleSnapshot {
  return mindmap.nodes
    .filter((node) => node.nodeKind === "freestyle")
    .map((node) => ({
      nodeKey: node.nodeKey,
      parentNodeKey: node.parentNodeKey,
      label: node.label,
      x: node.x,
      y: node.y,
      width: node.width,
      height: node.height,
      collapsed: node.collapsed
    }));
}

export function mindmapLayoutSubtreeNodeKeys(layout: MindmapLayout, nodeKey: string): Set<string> {
  return descendantsIncluding(layout.nodes, nodeKey);
}

function visibleMindmapNodeKeys(mindmap: InitiativeMindmapData, mode: MindmapMode): Set<string> {
  const rootKey = rootNodeKey(mindmap);
  const visible = new Set(
    mindmap.nodes
      .filter((node) => mode === "structure" || node.nodeKind === "initiative_root" || node.nodeKind === "freestyle")
      .map((node) => node.nodeKey)
  );
  const hasFreestyleChildren = mindmap.nodes.some((node) => node.parentNodeKey === "branch:freestyle");
  if (!hasFreestyleChildren) {
    visible.delete("branch:freestyle");
  }
  for (const node of mindmap.nodes) {
    if (!visible.has(node.nodeKey) || !node.collapsed) continue;
    for (const childKey of descendantsIncludingNodes(mindmap.nodes, node.nodeKey)) {
      if (childKey !== node.nodeKey) visible.delete(childKey);
    }
  }
  visible.add(rootKey);
  return visible;
}

function countMindmapChildren(mindmap: InitiativeMindmapData, mode: MindmapMode): Map<string, number> {
  const counts = new Map<string, number>();
  const includedNodeKeys = new Set(
    mindmap.nodes
      .filter((node) => mode === "structure" || node.nodeKind === "initiative_root" || node.nodeKind === "freestyle")
      .map((node) => node.nodeKey)
  );

  for (const node of mindmap.nodes) {
    if (!node.parentNodeKey || !includedNodeKeys.has(node.nodeKey)) continue;
    counts.set(node.parentNodeKey, (counts.get(node.parentNodeKey) ?? 0) + 1);
  }

  return counts;
}

function mindmapNodeDepths(rootKey: string, childrenByParent: Map<string | null, GraphLayoutNode[]>): Map<string, number> {
  const depths = new Map<string, number>([[rootKey, 0]]);
  const queue: string[] = [rootKey];
  while (queue.length > 0) {
    const parentKey = queue.shift()!;
    const parentDepth = depths.get(parentKey) ?? 0;
    for (const child of childrenByParent.get(parentKey) ?? []) {
      if (depths.has(child.nodeKey)) continue;
      depths.set(child.nodeKey, parentDepth + 1);
      queue.push(child.nodeKey);
    }
  }
  return depths;
}

function topicLevelFromDepth(depth: number): MindmapTopicLevel {
  if (depth <= 0) return "central";
  if (depth === 1) return "main";
  return "sub";
}

function effectiveParentNodeKey(node: GraphLayoutNode, rootKey: string, visibleNodeKeys: Set<string>, mode: MindmapMode): string | null {
  if (node.nodeKey === rootKey || node.nodeKind === "initiative_root") return null;
  if (node.parentNodeKey && visibleNodeKeys.has(node.parentNodeKey)) return node.parentNodeKey;
  if (mode === "freestyle" && node.parentNodeKey === "branch:freestyle") return rootKey;
  if (!node.parentNodeKey) return rootKey;
  return visibleNodeKeys.has(node.parentNodeKey) ? node.parentNodeKey : rootKey;
}

function placeMainTopics(
  nodes: GraphLayoutNode[],
  rootKey: string,
  side: MindmapSide,
  rootSize: MindmapMeasuredNode,
  measured: Map<string, MindmapMeasuredNode>,
  subtreeHeights: Map<string, number>,
  childrenByParent: Map<string | null, GraphLayoutNode[]>,
  sides: Map<string, MindmapSide>,
  placed: Map<string, MindmapLayoutNode>
): void {
  const totalHeight = nodes.reduce((total, node, index) => total + (subtreeHeights.get(node.nodeKey) ?? measured.get(node.nodeKey)!.height) + (index === 0 ? 0 : MAIN_GAP_Y), 0);
  let cursorY = -totalHeight / 2;
  for (const node of nodes) {
    const subtreeHeight = subtreeHeights.get(node.nodeKey) ?? measured.get(node.nodeKey)!.height;
    const nodeCenterY = cursorY + subtreeHeight / 2;
    placeNodeTree(node, rootKey, side, side === "right" ? rootSize.width / 2 + MAIN_GAP_X : -rootSize.width / 2 - MAIN_GAP_X, nodeCenterY, measured, subtreeHeights, childrenByParent, sides, placed, true);
    cursorY += subtreeHeight + MAIN_GAP_Y;
  }
}

function placeNodeTree(
  node: GraphLayoutNode,
  effectiveParentNodeKey: string | null,
  side: MindmapSide,
  anchorX: number,
  centerY: number,
  measured: Map<string, MindmapMeasuredNode>,
  subtreeHeights: Map<string, number>,
  childrenByParent: Map<string | null, GraphLayoutNode[]>,
  sides: Map<string, MindmapSide>,
  placed: Map<string, MindmapLayoutNode>,
  mainTopic: boolean
): void {
  const size = measured.get(node.nodeKey)!;
  const x = side === "right" ? anchorX : anchorX - size.width;
  const y = centerY - size.height / 2;
  placed.set(node.nodeKey, {
    graphNode: node,
    nodeKey: node.nodeKey,
    parentNodeKey: effectiveParentNodeKey,
    actualParentNodeKey: node.parentNodeKey,
    topicLevel: mainTopic ? "main" : "sub",
    side,
    x,
    y,
    width: size.width,
    height: size.height,
    subtreeHeight: subtreeHeights.get(node.nodeKey) ?? size.height
  });

  if (node.collapsed) return;
  const children = childrenByParent.get(node.nodeKey) ?? [];
  let totalHeight = 0;
  const childGap = siblingListGap(children, measured, subtreeHeights, childrenByParent);
  children.forEach((child, index) => {
    totalHeight += measured.get(child.nodeKey)!.height;
    if (index > 0) {
      totalHeight += childGap;
    }
  });
  let cursorY = centerY - totalHeight / 2;
  children.forEach((child, index) => {
    const childHeight = measured.get(child.nodeKey)!.height;
    const childCenterY = cursorY + childHeight / 2;
    const childAnchorX = side === "right" ? x + size.width + CHILD_GAP_X : x - CHILD_GAP_X;
    sides.set(child.nodeKey, side);
    placeNodeTree(child, node.nodeKey, side, childAnchorX, childCenterY, measured, subtreeHeights, childrenByParent, sides, placed, false);
    cursorY += childHeight;
    if (index < children.length - 1) {
      cursorY += childGap;
    }
  });
}

function siblingListGap(
  siblings: GraphLayoutNode[],
  measured: Map<string, MindmapMeasuredNode>,
  subtreeHeights: Map<string, number>,
  childrenByParent: Map<string | null, GraphLayoutNode[]>
): number {
  let gap = SIBLING_GAP_Y;
  for (let index = 1; index < siblings.length; index += 1) {
    const previous = siblings[index - 1];
    const next = siblings[index];
    const previousHasChildren = (childrenByParent.get(previous.nodeKey) ?? []).length > 0;
    const nextHasChildren = (childrenByParent.get(next.nodeKey) ?? []).length > 0;
    if (!previousHasChildren || !nextHasChildren) continue;
    const previousExtra = Math.max(0, (subtreeHeights.get(previous.nodeKey) ?? measured.get(previous.nodeKey)!.height) - measured.get(previous.nodeKey)!.height) / 2;
    const nextExtra = Math.max(0, (subtreeHeights.get(next.nodeKey) ?? measured.get(next.nodeKey)!.height) - measured.get(next.nodeKey)!.height) / 2;
    gap = Math.max(gap, Math.ceil(previousExtra + SIBLING_GAP_Y + nextExtra));
  }
  return gap;
}

function assignMainTopicSides(mainTopics: GraphLayoutNode[], subtreeHeights: Map<string, number>, measured: Map<string, MindmapMeasuredNode>): Map<string, MindmapSide> {
  const sides = new Map<string, MindmapSide>();
  let leftHeight = 0;
  let rightHeight = 0;
  let leftCount = 0;
  let rightCount = 0;

  for (const node of mainTopics) {
    const explicitSide = explicitSideHint(node);
    if (!explicitSide) continue;
    sides.set(node.nodeKey, explicitSide);
    const height = subtreeHeights.get(node.nodeKey) ?? measured.get(node.nodeKey)?.height ?? measureMindmapNode(node).height;
    if (explicitSide === "left") {
      leftHeight += height;
      leftCount += 1;
    } else {
      rightHeight += height;
      rightCount += 1;
    }
  }

  for (const node of mainTopics) {
    if (sides.has(node.nodeKey)) continue;
    const side = rightHeight <= leftHeight && rightCount <= leftCount ? "right" : "left";
    sides.set(node.nodeKey, side);
    const height = subtreeHeights.get(node.nodeKey) ?? measured.get(node.nodeKey)?.height ?? measureMindmapNode(node).height;
    if (side === "left") {
      leftHeight += height;
      leftCount += 1;
    } else {
      rightHeight += height;
      rightCount += 1;
    }
  }

  return sides;
}

function explicitSideHint(node: GraphLayoutNode): MindmapSide | null {
  if (node.x <= -SIDE_HINT_THRESHOLD_X) return "left";
  if (node.x >= SIDE_HINT_THRESHOLD_X) return "right";
  return null;
}

function sideHintX(side: MindmapSide): number {
  return side === "left" ? -SIDE_HINT_ABSOLUTE_X : SIDE_HINT_ABSOLUTE_X;
}

function sideFromCenter(x: number): MindmapSide {
  return x < 0 ? "left" : "right";
}

function sortMindmapSiblings(nodes: GraphLayoutNode[]): GraphLayoutNode[] {
  return [...nodes].sort((a, b) => a.y - b.y || a.x - b.x || a.label.localeCompare(b.label) || a.id - b.id);
}

function descendantsIncluding(nodes: MindmapLayoutNode[], nodeKey: string): Set<string> {
  const result = new Set([nodeKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentNodeKey && result.has(node.parentNodeKey) && !result.has(node.nodeKey)) {
        result.add(node.nodeKey);
        changed = true;
      }
    }
  }
  return result;
}

function descendantsIncludingNodes(nodes: GraphLayoutNode[], nodeKey: string): Set<string> {
  const result = new Set([nodeKey]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const node of nodes) {
      if (node.parentNodeKey && result.has(node.parentNodeKey) && !result.has(node.nodeKey)) {
        result.add(node.nodeKey);
        changed = true;
      }
    }
  }
  return result;
}

function canParentFreestyleNode(node: GraphLayoutNode): boolean {
  return node.moveSupport.freestyleParent && node.nodeKind !== "media";
}

function pointInNode(point: { x: number; y: number }, node: MindmapLayoutNode, padding: number): boolean {
  return point.x >= node.x - padding && point.x <= node.x + node.width + padding && point.y >= node.y - padding && point.y <= node.y + node.height + padding;
}

function siblingEdgeReorderIntent(layout: MindmapLayout, dragged: MindmapLayoutNode, center: { x: number; y: number }, descendantKeys: Set<string>): MindmapDropIntent | null {
  const dropTarget = layout.nodes
    .filter((node) => node.nodeKey !== dragged.nodeKey && !descendantKeys.has(node.nodeKey) && node.parentNodeKey === dragged.parentNodeKey && canReorderAgainstSibling(layout, dragged, node))
    .find((node) => pointInNode(center, node, 0));
  if (!dropTarget) return null;

  const relativeY = center.y - dropTarget.y;
  const beforeTarget = relativeY < dropTarget.height * 0.28;
  const afterTarget = relativeY > dropTarget.height * 0.72;
  if (!beforeTarget && !afterTarget) return null;

  const siblings = visualReorderSiblings(layout, dragged, dropTarget.side);
  const targetIndex = siblings.findIndex((node) => node.nodeKey === dropTarget.nodeKey);
  if (targetIndex === -1) return null;

  return {
    type: "reorder",
    nodeKey: dragged.nodeKey,
    parentNodeKey: dragged.actualParentNodeKey,
    insertionIndex: beforeTarget ? targetIndex : targetIndex + 1,
    side: dropTarget.side ?? dragged.side ?? undefined,
    targetNodeKey: dropTarget.nodeKey,
    placement: beforeTarget ? "before" : "after",
    siblingNodeKeys: siblings.map((node) => node.nodeKey)
  };
}

function siblingSlotReorderIntent(layout: MindmapLayout, dragged: MindmapLayoutNode, center: { x: number; y: number }, descendantKeys: Set<string>): MindmapDropIntent | null {
  const side = dragged.parentNodeKey === layout.rootNodeKey ? sideFromCenter(center.x) : dragged.side;
  const siblings = visualReorderSiblings(layout, dragged, side).filter((node) => !descendantKeys.has(node.nodeKey));
  if (siblings.length === 0) return null;
  if (siblings.some((node) => pointInNode(center, node, 0))) return null;

  const parent = dragged.parentNodeKey ? layout.nodesByKey.get(dragged.parentNodeKey) : null;
  const horizontalNodes = parent ? [...siblings, parent] : siblings;
  const minX = Math.min(...horizontalNodes.map((node) => node.x)) - 220;
  const maxX = Math.max(...horizontalNodes.map((node) => node.x + node.width)) + 220;
  if (center.x < minX || center.x > maxX) return null;

  const minY = Math.min(...siblings.map((node) => node.y)) - 80;
  const maxY = Math.max(...siblings.map((node) => node.y + node.height)) + 160;
  if (center.y < minY || center.y > maxY) return null;

  let insertionIndex = siblings.length;
  let targetNodeKey = siblings.at(-1)!.nodeKey;
  let placement: "before" | "after" = "after";
  for (let index = 0; index < siblings.length; index += 1) {
    if (center.y < siblings[index].y + siblings[index].height / 2) {
      insertionIndex = index;
      targetNodeKey = siblings[index].nodeKey;
      placement = "before";
      break;
    }
  }

  return {
    type: "reorder",
    nodeKey: dragged.nodeKey,
    parentNodeKey: dragged.actualParentNodeKey,
    insertionIndex,
    side: side ?? undefined,
    targetNodeKey,
    placement,
    siblingNodeKeys: siblings.map((node) => node.nodeKey)
  };
}

function siblingInsertionIndex(siblings: GraphLayoutNode[], dragged: GraphLayoutNode): number {
  const index = siblings.findIndex((node) => node.y > dragged.y || (node.y === dragged.y && node.x > dragged.x));
  return index === -1 ? siblings.length : index;
}

function snapshotInsertionIndex(siblings: GraphLayoutNode[], dragged: GraphLayoutNode, intent: MindmapDropIntent): number {
  if (intent.type === "side") {
    return siblingInsertionIndex(siblings, dragged);
  }
  if (intent.type === "reorder") {
    const targetIndex = siblings.findIndex((node) => node.nodeKey === intent.targetNodeKey);
    if (targetIndex !== -1) {
      return intent.placement === "before" ? targetIndex : targetIndex + 1;
    }
  }
  return intent.insertionIndex ?? siblings.length;
}

function canReorderAgainstSibling(layout: MindmapLayout, dragged: MindmapLayoutNode, target: MindmapLayoutNode): boolean {
  if (target.parentNodeKey !== dragged.parentNodeKey) return false;
  if (dragged.parentNodeKey === layout.rootNodeKey) return Boolean(target.side);
  return target.side === dragged.side;
}

function visualReorderSiblings(layout: MindmapLayout, dragged: MindmapLayoutNode, side: MindmapSide | null): MindmapLayoutNode[] {
  return layout.nodes
    .filter((node) => node.nodeKey !== dragged.nodeKey && node.parentNodeKey === dragged.parentNodeKey && (dragged.parentNodeKey === layout.rootNodeKey ? node.side === side : node.side === dragged.side))
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function targetSiblingNodeKeys(layout: MindmapLayout, parentNodeKey: string | null, side?: MindmapSide): string[] {
  return layout.nodes
    .filter((node) => node.parentNodeKey === parentNodeKey && (!side || parentNodeKey !== layout.rootNodeKey || node.side === side))
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((node) => node.nodeKey);
}

function reorderableSnapshotSiblings(nodes: GraphLayoutNode[], parentNodeKey: string | null, draggedNodeKey: string, siblingNodeKeys?: string[]): GraphLayoutNode[] {
  const candidates = nodes.filter((node) => node.nodeKind === "freestyle" && node.parentNodeKey === parentNodeKey && node.nodeKey !== draggedNodeKey);
  if (!siblingNodeKeys) return sortMindmapSiblings(candidates);

  const candidateByKey = new Map(candidates.map((node) => [node.nodeKey, node]));
  const ordered = siblingNodeKeys
    .map((nodeKey) => candidateByKey.get(nodeKey))
    .filter((node): node is GraphLayoutNode => Boolean(node));
  return ordered.length > 0 ? ordered : sortMindmapSiblings(candidates);
}
