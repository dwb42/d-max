import { chromium } from "playwright";
import { MINDMAP_LAYOUT_PROFILE_NAME } from "../web/src/components/graph/mindmap-layout.js";
import type { InitiativeMindmap } from "../web/src/types.js";

type DomNode = {
  key: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

type Box = {
  x: number;
  y: number;
  right: number;
  bottom: number;
};

const baseUrl = (process.env.DMAX_MINDMAP_DOM_BASE_URL ?? process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:5173").replace(/\/$/, "");
const initiativeId = Number(process.env.DMAX_MINDMAP_DOM_INITIATIVE_ID ?? "9");
const referenceParentLabel = process.env.DMAX_MINDMAP_DOM_REFERENCE_PARENT ?? "Gründerkreis / der harte Kern";
const compactGapMin = 2;
const compactGapMax = 5;
const overlapTolerance = 0.5;

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
    const url = `${baseUrl}/initiatives/${initiativeId}`;
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 10_000 });
    } catch (error) {
      throw new Error(`Could not open ${url}. Start the local dev app first, then rerun this check. ${String(error)}`);
    }

    const mindmap = await page.evaluate((id) => fetch(`/api/graph/initiative/${id}`).then((response) => response.json()).then((data) => data.mindmap as InitiativeMindmap), initiativeId);

    await page.locator(".mindmap-preview-open").waitFor({ timeout: 10_000 });
    await page.locator(".mindmap-preview-open").click();
    await page.locator(".mindmap-modal .react-flow__node-mindmap").first().waitFor({ timeout: 10_000 });
    await page.waitForTimeout(350);

    const scale = await page.locator(".mindmap-modal .react-flow__viewport").evaluate((element) => {
      const transform = getComputedStyle(element).transform;
      const matrixScale = transform.match(/^matrix\(([^,]+)/)?.[1];
      return matrixScale ? Number(matrixScale) : 1;
    });

    const screenNodes = await page.locator(".mindmap-modal .react-flow__node-mindmap").evaluateAll((elements) => elements.map((element) => {
      const inner = element.querySelector(".mindmap-node") ?? element;
      const label = inner.querySelector(".mindmap-node-label")?.textContent?.trim()
        ?? inner.querySelector(".mindmap-node-input")?.textContent?.trim()
        ?? inner.textContent?.trim()
        ?? "";
      const rect = inner.getBoundingClientRect();
      return {
        key: element.getAttribute("data-id") ?? "",
        label,
        x: rect.x,
        y: rect.y,
        width: rect.width,
        height: rect.height
      };
    }));

    assertNoVisibleNodeOverlaps(screenNodes);

    const flowNodes = screenNodes.map((node) => ({
      ...node,
      x: node.x / scale,
      y: node.y / scale,
      width: node.width / scale,
      height: node.height / scale
    }));
    assertCompactReferenceSubtreeGaps(mindmap, flowNodes);

    console.log(`${MINDMAP_LAYOUT_PROFILE_NAME} DOM check passed for initiative ${initiativeId}: ${screenNodes.length} nodes, no overlaps, compact reference subtree gaps.`);
  } finally {
    await browser.close();
  }
}

function assertNoVisibleNodeOverlaps(nodes: DomNode[]) {
  const overlaps: Array<[string, string]> = [];
  for (let firstIndex = 0; firstIndex < nodes.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < nodes.length; secondIndex += 1) {
      const first = nodes[firstIndex];
      const second = nodes[secondIndex];
      const overlapsHorizontally = first.x < second.x + second.width - overlapTolerance && first.x + first.width > second.x + overlapTolerance;
      const overlapsVertically = first.y < second.y + second.height - overlapTolerance && first.y + first.height > second.y + overlapTolerance;
      if (overlapsHorizontally && overlapsVertically) {
        overlaps.push([first.label, second.label]);
      }
    }
  }
  if (overlaps.length > 0) {
    throw new Error(`Mindmap DOM nodes overlap: ${JSON.stringify(overlaps.slice(0, 8))}`);
  }
}

function assertCompactReferenceSubtreeGaps(mindmap: InitiativeMindmap, nodes: DomNode[]) {
  const nodeByKey = new Map(nodes.map((node) => [node.key, node]));
  const visibleKeys = new Set(nodeByKey.keys());
  const childrenByParent = new Map<string, string[]>();
  for (const node of mindmap.nodes) {
    if (!node.parentNodeKey || !visibleKeys.has(node.nodeKey)) continue;
    const children = childrenByParent.get(node.parentNodeKey) ?? [];
    children.push(node.nodeKey);
    childrenByParent.set(node.parentNodeKey, children);
  }

  const referenceParent = nodes.find((node) => node.label === referenceParentLabel);
  if (!referenceParent) {
    throw new Error(`Reference parent node "${referenceParentLabel}" was not visible in initiative ${initiativeId}. Set DMAX_MINDMAP_DOM_REFERENCE_PARENT to update this guard.`);
  }

  const children = childrenByParent.get(referenceParent.key) ?? [];
  if (children.length < 2) {
    throw new Error(`Reference parent "${referenceParentLabel}" needs at least two visible child clusters for the compact spacing guard.`);
  }

  const childClusters = children
    .map((key) => {
      const node = nodeByKey.get(key);
      if (!node) return null;
      return { node, box: subtreeBox(key, nodeByKey, childrenByParent) };
    })
    .filter((cluster): cluster is { node: DomNode; box: Box } => Boolean(cluster))
    .sort((first, second) => first.box.y - second.box.y);

  const badGaps: Array<{ from: string; to: string; gap: number }> = [];
  for (let index = 1; index < childClusters.length; index += 1) {
    const previous = childClusters[index - 1];
    const next = childClusters[index];
    const gap = next.box.y - previous.box.bottom;
    if (gap < compactGapMin || gap > compactGapMax) {
      badGaps.push({ from: previous.node.label, to: next.node.label, gap });
    }
  }

  if (badGaps.length > 0) {
    throw new Error(`${MINDMAP_LAYOUT_PROFILE_NAME} expected ${compactGapMin}-${compactGapMax}px subtree gaps under "${referenceParentLabel}", got ${JSON.stringify(badGaps)}`);
  }
}

function subtreeBox(nodeKey: string, nodeByKey: Map<string, DomNode>, childrenByParent: Map<string, string[]>): Box {
  const node = nodeByKey.get(nodeKey);
  if (!node) {
    return { x: Infinity, y: Infinity, right: -Infinity, bottom: -Infinity };
  }
  let box: Box = {
    x: node.x,
    y: node.y,
    right: node.x + node.width,
    bottom: node.y + node.height
  };
  for (const childKey of childrenByParent.get(nodeKey) ?? []) {
    const childBox = subtreeBox(childKey, nodeByKey, childrenByParent);
    box = {
      x: Math.min(box.x, childBox.x),
      y: Math.min(box.y, childBox.y),
      right: Math.max(box.right, childBox.right),
      bottom: Math.max(box.bottom, childBox.bottom)
    };
  }
  return box;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
