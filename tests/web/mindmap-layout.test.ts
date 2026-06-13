import { describe, expect, it } from "vitest";
import {
  applyMindmapDropIntent,
  computeMindmapDropIntent,
  computeRadialMindmapLayout,
  measureMindmapNode,
  MINDMAP_LAYOUT_PROFILE_NAME,
  siblingCreationHint
} from "../../web/src/components/graph/mindmap-layout.js";
import type { GraphLayoutNode, InitiativeMindmap } from "../../web/src/types.js";

describe("mindmap radial layout", () => {
  it("uses the Compact Subtree Spacing v1 profile", () => {
    expect(MINDMAP_LAYOUT_PROFILE_NAME).toBe("Compact Subtree Spacing v1");
  });

  it("keeps the central topic centered", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null)
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const root = layout.nodesByKey.get("initiative:1")!;

    expect(root.x + root.width / 2).toBe(0);
    expect(root.y + root.height / 2).toBe(0);
    expect(root.topicLevel).toBe("central");
  });

  it("balances main topics left and right", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:a", "freestyle", "A", "initiative:1", { y: 0 }),
      node("freestyle:b", "freestyle", "B", "initiative:1", { y: 100 }),
      node("freestyle:c", "freestyle", "C", "initiative:1", { y: 200 }),
      node("freestyle:d", "freestyle", "D", "initiative:1", { y: 300 }),
      node("freestyle:e", "freestyle", "E", "initiative:1", { y: 400 })
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const mainTopics = layout.nodes.filter((candidate) => candidate.topicLevel === "main");
    const left = mainTopics.filter((candidate) => candidate.side === "left");
    const right = mainTopics.filter((candidate) => candidate.side === "right");

    expect(Math.abs(left.length - right.length)).toBeLessThanOrEqual(1);
    expect(mainTopics).toHaveLength(5);
  });

  it("lets subtopics inherit side and grow outward", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:main", "freestyle", "Main", "initiative:1", { x: -10000 }),
      node("freestyle:child", "freestyle", "Child", "freestyle:main")
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const main = layout.nodesByKey.get("freestyle:main")!;
    const child = layout.nodesByKey.get("freestyle:child")!;

    expect(main.side).toBe("left");
    expect(child.side).toBe("left");
    expect(child.x + child.width).toBeLessThan(main.x);
  });

  it("keeps same-parent topics vertically compact", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:parent", "freestyle", "Parent", "initiative:1", { x: 10000 }),
      node("freestyle:a", "freestyle", "First sibling", "freestyle:parent", { y: 0 }),
      node("freestyle:b", "freestyle", "Second sibling", "freestyle:parent", { y: 100 })
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const first = layout.nodesByKey.get("freestyle:a")!;
    const second = layout.nodesByKey.get("freestyle:b")!;

    expect(second.y - (first.y + first.height)).toBe(3);
  });

  it("does not reserve wrapped height for medium labels that fit on one line", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:parent", "freestyle", "Gemeinschaft & Menschen", "initiative:1", { x: 10000 }),
      node("freestyle:singles", "freestyle", "Singles, Paare, Familien, Ältere", "freestyle:parent", { y: 0 }),
      node("freestyle:kultur", "freestyle", "Kultur: aktiv, verbindlich, großzügig", "freestyle:parent", { y: 100 }),
      node("freestyle:besucher", "freestyle", "Besucher / temporäre Mitwirkende", "freestyle:parent", { y: 200 })
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const singles = layout.nodesByKey.get("freestyle:singles")!;
    const kultur = layout.nodesByKey.get("freestyle:kultur")!;
    const besucher = layout.nodesByKey.get("freestyle:besucher")!;

    expect(singles.height).toBe(30);
    expect(kultur.height).toBe(30);
    expect(besucher.height).toBe(30);
    expect(kultur.y - (singles.y + singles.height)).toBe(3);
    expect(besucher.y - (kultur.y + kultur.height)).toBe(3);
  });

  it("keeps adjacent one-child clusters separated by their subtree extents", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:section", "freestyle", "Section", "initiative:1", { x: 10000 }),
      node("freestyle:enno", "freestyle", "Enno ZIM", "freestyle:section", { y: 0 }),
      node("freestyle:ian", "freestyle", "mal mit Ian sprechen", "freestyle:enno", { y: 0 }),
      node("freestyle:plains", "freestyle", "1 Woche Plains Game Jagd mit Enno", "freestyle:enno", { y: 100 }),
      node("freestyle:malte", "freestyle", "Malte CPT", "freestyle:section", { y: 100 }),
      node("freestyle:chill", "freestyle", "3 Tage mit Malte und Family chillen", "freestyle:malte", { y: 0 })
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const ian = layout.nodesByKey.get("freestyle:ian")!;
    const plains = layout.nodesByKey.get("freestyle:plains")!;
    const chill = layout.nodesByKey.get("freestyle:chill")!;

    expect(plains.y - (ian.y + ian.height)).toBe(3);
    expect(chill.y - (plains.y + plains.height)).toBe(3);
    expect(overlaps(plains, chill)).toBe(false);
  });

  it("spaces sibling cluster parents uniformly", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:section", "freestyle", "Section", "initiative:1", { x: -10000 }),
      node("freestyle:first", "freestyle", "First cluster", "freestyle:section", { y: 0 }),
      node("freestyle:first-child", "freestyle", "First child", "freestyle:first", { y: 0 }),
      node("freestyle:first-child-2", "freestyle", "Second first child", "freestyle:first", { y: 100 }),
      node("freestyle:second", "freestyle", "Second cluster", "freestyle:section", { y: 100 }),
      node("freestyle:second-child", "freestyle", "Second child", "freestyle:second", { y: 0 }),
      node("freestyle:second-child-2", "freestyle", "Second second child", "freestyle:second", { y: 100 }),
      node("freestyle:third", "freestyle", "Third cluster", "freestyle:section", { y: 200 }),
      node("freestyle:third-child", "freestyle", "Third child", "freestyle:third", { y: 0 }),
      node("freestyle:third-child-2", "freestyle", "Second third child", "freestyle:third", { y: 100 })
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const first = layout.nodesByKey.get("freestyle:first")!;
    const second = layout.nodesByKey.get("freestyle:second")!;
    const third = layout.nodesByKey.get("freestyle:third")!;

    expect(second.y - (first.y + first.height)).toBe(36);
    expect(third.y - (second.y + second.height)).toBe(36);
  });

  it("keeps visible siblings compact when one sibling has its own child", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:parent", "freestyle", "Parent", "initiative:1", { x: -10000 }),
      node("freestyle:first", "freestyle", "First sibling", "freestyle:parent", { y: 0 }),
      node("freestyle:middle", "freestyle", "Middle sibling", "freestyle:parent", { y: 100 }),
      node("freestyle:nested", "freestyle", "Nested child", "freestyle:middle", { y: 0 }),
      node("freestyle:last", "freestyle", "Last sibling", "freestyle:parent", { y: 200 })
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const first = layout.nodesByKey.get("freestyle:first")!;
    const middle = layout.nodesByKey.get("freestyle:middle")!;
    const last = layout.nodesByKey.get("freestyle:last")!;

    expect(middle.y - (first.y + first.height)).toBe(3);
    expect(last.y - (middle.y + middle.height)).toBe(3);
  });

  it("uses long labels when laying out siblings so visible nodes do not overlap", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:a", "freestyle", "A very long topic label that wraps over several lines and needs extra vertical space", "initiative:1", { y: 0 }),
      node("freestyle:b", "freestyle", "Another long topic label that should be placed with enough breathing room", "initiative:1", { y: 100 }),
      node("freestyle:c", "freestyle", "A compact sibling", "initiative:1", { y: 200 }),
      node("freestyle:d", "freestyle", "A second compact sibling", "initiative:1", { y: 300 })
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");

    for (const a of layout.nodes) {
      for (const b of layout.nodes) {
        if (a.nodeKey >= b.nodeKey) continue;
        expect(overlaps(a, b), `${a.nodeKey} overlaps ${b.nodeKey}`).toBe(false);
      }
    }
  });

  it("reserves only the collapsed node space for collapsed branches", () => {
    const parent = node("freestyle:parent", "freestyle", "Parent", "initiative:1", { collapsed: true });
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      parent,
      node("freestyle:child", "freestyle", "Hidden child", "freestyle:parent")
    ]);

    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const placedParent = layout.nodesByKey.get("freestyle:parent")!;

    expect(layout.nodesByKey.has("freestyle:child")).toBe(false);
    expect(placedParent.subtreeHeight).toBe(measureMindmapNode(parent).height);
  });

  it("computes a reparent drop when dragging onto another topic", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:a", "freestyle", "A", "initiative:1"),
      node("freestyle:b", "freestyle", "B", "initiative:1", { y: 100 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const target = layout.nodesByKey.get("freestyle:b")!;

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:a",
      x: target.x + target.width / 2 - layout.nodesByKey.get("freestyle:a")!.width / 2,
      y: target.y + target.height / 2 - layout.nodesByKey.get("freestyle:a")!.height / 2
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;

    expect(intent).toMatchObject({ type: "reparent", parentNodeKey: "freestyle:b" });
    expect(snapshot?.find((candidate) => candidate.nodeKey === "freestyle:a")).toMatchObject({ parentNodeKey: "freestyle:b" });
  });

  it("appends a reparented node as the target parent's last child", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:dragged", "freestyle", "Dragged", "initiative:1", { x: 10000, y: 0 }),
      node("freestyle:target", "freestyle", "Target", "initiative:1", { x: 10000, y: 100, collapsed: true }),
      node("freestyle:first-child", "freestyle", "First child", "freestyle:target", { y: 0 }),
      node("freestyle:second-child", "freestyle", "Second child", "freestyle:target", { y: 100 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const target = layout.nodesByKey.get("freestyle:target")!;
    const dragged = layout.nodesByKey.get("freestyle:dragged")!;

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:dragged",
      x: target.x + target.width / 2 - dragged.width / 2,
      y: target.y + target.height / 2 - dragged.height / 2
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;
    const orderedChildren = snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "freestyle:target")
      .sort((a, b) => a.y - b.y)
      .map((candidate) => candidate.nodeKey);
    const targetSnapshot = snapshot?.find((candidate) => candidate.nodeKey === "freestyle:target");

    expect(intent).toMatchObject({ type: "reparent", targetNodeKey: "freestyle:target", placement: "into" });
    expect(targetSnapshot?.collapsed).toBe(false);
    expect(orderedChildren).toEqual(["freestyle:first-child", "freestyle:second-child", "freestyle:dragged"]);
  });

  it("computes a sibling reorder when dragging between siblings", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:a", "freestyle", "A", "initiative:1", { x: 10000, y: 0 }),
      node("freestyle:b", "freestyle", "B", "initiative:1", { x: 10000, y: 100 }),
      node("freestyle:c", "freestyle", "C", "initiative:1", { x: 10000, y: 200 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const first = layout.nodesByKey.get("freestyle:a")!;
    const second = layout.nodesByKey.get("freestyle:b")!;

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:c",
      x: first.x,
      y: (first.y + first.height + second.y) / 2
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;
    const ordered = snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "initiative:1")
      .sort((a, b) => a.y - b.y)
      .map((candidate) => candidate.nodeKey);

    expect(intent).toMatchObject({ type: "reorder", insertionIndex: 1 });
    expect(ordered).toEqual(["freestyle:a", "freestyle:c", "freestyle:b"]);
  });

  it("reorders only the target visual side for top-level topics", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:left-a", "freestyle", "Left A", "initiative:1", { x: -10000, y: 0 }),
      node("freestyle:left-b", "freestyle", "Left B", "initiative:1", { x: -10000, y: 100 }),
      node("freestyle:right-a", "freestyle", "Right A", "initiative:1", { x: 10000, y: 0 }),
      node("freestyle:right-b", "freestyle", "Right B", "initiative:1", { x: 10000, y: 100 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const target = layout.nodesByKey.get("freestyle:right-a")!;
    const dragged = layout.nodesByKey.get("freestyle:right-b")!;

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:right-b",
      x: target.x + target.width / 2 - dragged.width / 2,
      y: target.y + 1 - dragged.height / 2
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;
    const rightOrder = snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "initiative:1" && candidate.x > 0)
      .sort((a, b) => a.y - b.y)
      .map((candidate) => candidate.nodeKey);
    const leftY = new Map(snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "initiative:1" && candidate.x < 0)
      .map((candidate) => [candidate.nodeKey, candidate.y]));

    expect(intent).toMatchObject({ type: "reorder", targetNodeKey: "freestyle:right-a", placement: "before" });
    expect(rightOrder).toEqual(["freestyle:right-b", "freestyle:right-a"]);
    expect(leftY.get("freestyle:left-a")).toBe(0);
    expect(leftY.get("freestyle:left-b")).toBe(100);
  });

  it("reorders top-level freestyle branch nodes before a same-side sibling", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("branch:freestyle", "branch", "Freestyle", "initiative:1"),
      node("freestyle:a", "freestyle", "A", "branch:freestyle", { x: -10000, y: 0 }),
      node("freestyle:b", "freestyle", "B", "branch:freestyle", { x: -10000, y: 100 }),
      node("freestyle:c", "freestyle", "C", "branch:freestyle", { x: -10000, y: 200 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const target = layout.nodesByKey.get("freestyle:a")!;
    const dragged = layout.nodesByKey.get("freestyle:c")!;

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:c",
      x: target.x + target.width / 2 - dragged.width / 2,
      y: target.y + 1 - dragged.height / 2
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;
    const ordered = snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "branch:freestyle")
      .sort((a, b) => a.y - b.y)
      .map((candidate) => candidate.nodeKey);

    expect(intent).toMatchObject({ type: "reorder", targetNodeKey: "freestyle:a", placement: "before" });
    expect(ordered).toEqual(["freestyle:c", "freestyle:a", "freestyle:b"]);
  });

  it("applies reorder placement by target key when visual siblings and snapshot siblings differ", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:outside", "freestyle", "Outside", "freestyle:other", { y: 0 }),
      node("freestyle:a", "freestyle", "A", "branch:freestyle", { y: 100 }),
      node("freestyle:b", "freestyle", "B", "branch:freestyle", { y: 200 }),
      node("freestyle:c", "freestyle", "C", "branch:freestyle", { y: 300 })
    ]);

    const snapshot = applyMindmapDropIntent(mindmap, {
      type: "reorder",
      nodeKey: "freestyle:c",
      parentNodeKey: "branch:freestyle",
      insertionIndex: 2,
      targetNodeKey: "freestyle:a",
      placement: "before",
      siblingNodeKeys: ["freestyle:outside", "freestyle:a", "freestyle:b"]
    });
    const ordered = snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "branch:freestyle")
      .sort((a, b) => a.y - b.y)
      .map((candidate) => candidate.nodeKey);

    expect(ordered).toEqual(["freestyle:c", "freestyle:a", "freestyle:b"]);
  });

  it("computes a sibling reorder below the last sibling even when dropped near the parent branch", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:flights", "freestyle", "Flüge buchen", "initiative:1", { x: 10000 }),
      node("freestyle:ham", "freestyle", "HAM - ZIM", "freestyle:flights", { y: 100 }),
      node("freestyle:mng", "freestyle", "MNG - HAM", "freestyle:flights", { y: 200 }),
      node("freestyle:zim", "freestyle", "ZIM - CPT", "freestyle:flights", { y: 300 }),
      node("freestyle:cpt", "freestyle", "CPT - SAO", "freestyle:flights", { y: 400 }),
      node("freestyle:sao", "freestyle", "SAO - MNG", "freestyle:flights", { y: 500 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const parent = layout.nodesByKey.get("freestyle:flights")!;
    const last = layout.nodesByKey.get("freestyle:sao")!;

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:mng",
      x: parent.x + parent.width + 28,
      y: last.y + last.height + 26
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;
    const ordered = snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "freestyle:flights")
      .sort((a, b) => a.y - b.y)
      .map((candidate) => candidate.nodeKey);

    expect(intent).toMatchObject({ type: "reorder", insertionIndex: 4 });
    expect(ordered).toEqual(["freestyle:ham", "freestyle:zim", "freestyle:cpt", "freestyle:sao", "freestyle:mng"]);
  });

  it("reorders after a sibling when dropped on that sibling's lower edge", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:flights", "freestyle", "Flüge buchen", "initiative:1", { x: 10000 }),
      node("freestyle:ham", "freestyle", "HAM - ZIM", "freestyle:flights", { y: 100 }),
      node("freestyle:mng", "freestyle", "MNG - HAM", "freestyle:flights", { y: 200 }),
      node("freestyle:zim", "freestyle", "ZIM - CPT", "freestyle:flights", { y: 300 }),
      node("freestyle:cpt", "freestyle", "CPT - SAO", "freestyle:flights", { y: 400 }),
      node("freestyle:sao", "freestyle", "SAO - MNG", "freestyle:flights", { y: 500 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");
    const target = layout.nodesByKey.get("freestyle:sao")!;
    const dragged = layout.nodesByKey.get("freestyle:mng")!;

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:mng",
      x: target.x + target.width / 2 - dragged.width / 2,
      y: target.y + target.height * 0.78 - dragged.height / 2
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;
    const ordered = snapshot
      ?.filter((candidate) => candidate.parentNodeKey === "freestyle:flights")
      .sort((a, b) => a.y - b.y)
      .map((candidate) => candidate.nodeKey);

    expect(intent).toMatchObject({ type: "reorder", insertionIndex: 4 });
    expect(ordered).toEqual(["freestyle:ham", "freestyle:zim", "freestyle:cpt", "freestyle:sao", "freestyle:mng"]);
  });

  it("computes a side change when dragging a main topic across the center", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:a", "freestyle", "A", "initiative:1", { x: 10000 })
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "freestyle");

    const intent = computeMindmapDropIntent(layout, {
      draggedNodeKey: "freestyle:a",
      x: -420,
      y: 0
    });
    const snapshot = intent ? applyMindmapDropIntent(mindmap, intent) : null;

    expect(intent).toMatchObject({ type: "side", side: "left" });
    expect(snapshot?.find((candidate) => candidate.nodeKey === "freestyle:a")?.x).toBeLessThan(0);
  });

  it("does not mutate invalid derived-node drops", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("branch:tasks", "branch", "Tasks", "initiative:1"),
      node("task:1", "task", "Derived task", "branch:tasks")
    ]);
    const layout = computeRadialMindmapLayout(mindmap, "structure");

    expect(computeMindmapDropIntent(layout, { draggedNodeKey: "task:1", x: 0, y: 0 })).toBeNull();
  });

  it("creates sibling order hints directly after the selected sibling", () => {
    const mindmap = mindmapWith([
      node("initiative:1", "initiative_root", "Central", null),
      node("freestyle:parent", "freestyle", "Flights", "initiative:1"),
      node("freestyle:ham", "freestyle", "HAM - ZIM", "freestyle:parent", { y: 100 }),
      node("freestyle:zim", "freestyle", "ZIM - CPT", "freestyle:parent", { y: 200 }),
      node("freestyle:cpt", "freestyle", "CPT - SAO", "freestyle:parent", { y: 300 }),
      node("freestyle:sao", "freestyle", "SAO - MNG", "freestyle:parent", { y: 400 })
    ]);

    expect(siblingCreationHint(mindmap, "freestyle:sao")).toMatchObject({
      parentNodeKey: "freestyle:parent",
      x: 0,
      y: 500
    });
  });
});

function mindmapWith(nodes: GraphLayoutNode[]): InitiativeMindmap {
  return {
    scope: { type: "initiative", initiativeId: 1 },
    nodes,
    edges: []
  };
}

function node(
  nodeKey: string,
  nodeKind: GraphLayoutNode["nodeKind"],
  label: string,
  parentNodeKey: string | null,
  overrides: Partial<GraphLayoutNode> = {}
): GraphLayoutNode {
  return {
    id: Math.abs(hash(nodeKey)),
    scopeKey: "initiative:1",
    scope: { type: "initiative", initiativeId: 1 },
    nodeKey,
    nodeKind,
    entityType: nodeKind === "initiative_root" ? "initiative" : nodeKind === "task" ? "task" : nodeKind === "media" ? "media_asset" : null,
    entityId: nodeKind === "initiative_root" || nodeKind === "task" || nodeKind === "media" ? 1 : null,
    parentNodeKey,
    label,
    x: 0,
    y: 0,
    width: null,
    height: null,
    collapsed: false,
    moveSupport: {
      visual: true,
      semantic: false,
      freestyleParent: nodeKind !== "media"
    },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function overlaps(
  a: { x: number; y: number; width: number; height: number },
  b: { x: number; y: number; width: number; height: number }
): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function hash(value: string): number {
  let result = 0;
  for (const char of value) {
    result = (result * 31 + char.charCodeAt(0)) | 0;
  }
  return result || 1;
}
