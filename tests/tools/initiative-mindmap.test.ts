import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeMindmapRepository } from "../../src/repositories/initiative-mindmap.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { MediaAssetRepository } from "../../src/repositories/media-assets.js";
import { MediaLinkRepository } from "../../src/repositories/media-links.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("initiative mindmap tools", () => {
  let db: Database.Database;
  let initiativeId: number;

  beforeEach(() => {
    db = createTestDatabase();
    const categoryId = new CategoryRepository(db).create({ name: "Business" }).id;
    initiativeId = new InitiativeRepository(db).create({ categoryId, name: "Mindmap Project" }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("loads an initiative mindmap with nodes, edges, metadata, layout, collapse state, and move support", async () => {
    const runner = createToolRunner();
    const task = new TaskRepository(db).create({ initiativeId, title: "Derived task" });
    const asset = new MediaAssetRepository(db).create({
      kind: "document",
      mimeType: "text/plain",
      originalName: "brief.txt",
      storagePath: "brief.txt",
      sha256: "abc",
      byteSize: 12
    });
    new MediaLinkRepository(db).create({ assetId: asset.id, entityType: "initiative", entityId: initiativeId, caption: "Brief" });

    const result = await runner.run("getInitiativeMindmap", { initiativeId }, { db });

    expect(result).toMatchObject({
      ok: true,
      data: {
        scope: { type: "initiative", initiativeId },
        nodes: expect.arrayContaining([
          expect.objectContaining({
            nodeKey: `initiative:${initiativeId}`,
            nodeKind: "initiative_root",
            entityType: "initiative",
            entityId: initiativeId,
            x: expect.any(Number),
            y: expect.any(Number),
            collapsed: false,
            moveSupport: expect.objectContaining({ visual: true })
          }),
          expect.objectContaining({ nodeKey: "branch:freestyle", nodeKind: "branch" }),
          expect.objectContaining({ nodeKey: `task:${task.id}`, nodeKind: "task", entityType: "task", entityId: task.id }),
          expect.objectContaining({ nodeKey: `media:${asset.id}`, nodeKind: "media", entityType: "media_asset", entityId: asset.id })
        ]),
        edges: expect.arrayContaining([
          expect.objectContaining({ sourceNodeKey: `initiative:${initiativeId}`, targetNodeKey: "branch:freestyle" }),
          expect.objectContaining({ sourceNodeKey: "branch:tasks", targetNodeKey: `task:${task.id}` }),
          expect.objectContaining({ sourceNodeKey: "branch:media", targetNodeKey: `media:${asset.id}` })
        ])
      }
    });
  });

  it("creates freestyle child and floating nodes using repository defaults", async () => {
    const runner = createToolRunner();

    const child = await runner.run("createMindmapFreestyleNode", { initiativeId, label: "Child thought" }, { db });
    const floating = await runner.run("createMindmapFreestyleNode", { initiativeId, parentNodeKey: null, label: "Floating thought", x: 99, y: 101 }, { db });

    expect(child).toMatchObject({
      ok: true,
      data: {
        nodeKind: "freestyle",
        parentNodeKey: "branch:freestyle",
        label: "Child thought"
      }
    });
    expect(floating).toMatchObject({
      ok: true,
      data: {
        nodeKind: "freestyle",
        parentNodeKey: null,
        label: "Floating thought",
        x: 99,
        y: 101
      }
    });
  });

  it("renames, moves, reparents, collapses, and expands freestyle nodes", async () => {
    const runner = createToolRunner();
    const parent = await runner.run("createMindmapFreestyleNode", { initiativeId, label: "Parent" }, { db });
    const child = await runner.run("createMindmapFreestyleNode", { initiativeId, label: "Child" }, { db });
    const parentNodeKey = parent.ok ? (parent.data as { nodeKey: string }).nodeKey : "";
    const childNodeKey = child.ok ? (child.data as { nodeKey: string }).nodeKey : "";

    const updated = await runner.run(
      "updateMindmapFreestyleNode",
      {
        initiativeId,
        nodeKey: childNodeKey,
        label: "Sharper child",
        x: 420,
        y: 240,
        width: 230,
        height: 70,
        collapsed: true,
        parentNodeKey
      },
      { db }
    );
    const expanded = await runner.run("updateMindmapFreestyleNode", { initiativeId, nodeKey: childNodeKey, collapsed: false }, { db });

    expect(updated).toMatchObject({
      ok: true,
      data: {
        nodeKey: childNodeKey,
        label: "Sharper child",
        x: 420,
        y: 240,
        width: 230,
        height: 70,
        collapsed: true,
        parentNodeKey
      }
    });
    expect(expanded).toMatchObject({ ok: true, data: { nodeKey: childNodeKey, collapsed: false } });
  });

  it("rejects freestyle reparenting cycles and invalid parents", async () => {
    const runner = createToolRunner();
    const parent = await runner.run("createMindmapFreestyleNode", { initiativeId, label: "Parent" }, { db });
    const child = await runner.run("createMindmapFreestyleNode", { initiativeId, parentNodeKey: (parent as { ok: true; data: { nodeKey: string } }).data.nodeKey, label: "Child" }, { db });
    const parentNodeKey = (parent as { ok: true; data: { nodeKey: string } }).data.nodeKey;
    const childNodeKey = (child as { ok: true; data: { nodeKey: string } }).data.nodeKey;

    const cycle = await runner.run("updateMindmapFreestyleNode", { initiativeId, nodeKey: parentNodeKey, parentNodeKey: childNodeKey }, { db });
    const invalid = await runner.run("updateMindmapFreestyleNode", { initiativeId, nodeKey: childNodeKey, parentNodeKey: "missing" }, { db });

    expect(cycle).toMatchObject({ ok: false, error: expect.stringContaining("cycle") });
    expect(invalid).toMatchObject({ ok: false, error: expect.stringContaining("parent node not found") });
  });

  it("deletes leaf freestyle nodes directly and requires confirmation for freestyle subtrees", async () => {
    const runner = createToolRunner();
    const leaf = await runner.run("createMindmapFreestyleNode", { initiativeId, label: "Leaf" }, { db });
    const parent = await runner.run("createMindmapFreestyleNode", { initiativeId, label: "Parent" }, { db });
    const parentNodeKey = (parent as { ok: true; data: { nodeKey: string } }).data.nodeKey;
    const child = await runner.run("createMindmapFreestyleNode", { initiativeId, parentNodeKey, label: "Child" }, { db });
    const leafNodeKey = (leaf as { ok: true; data: { nodeKey: string } }).data.nodeKey;
    const childNodeKey = (child as { ok: true; data: { nodeKey: string } }).data.nodeKey;

    const leafDelete = await runner.run("deleteMindmapFreestyleNode", { initiativeId, nodeKey: leafNodeKey }, { db });
    const confirmation = await runner.run("deleteMindmapFreestyleNode", { initiativeId, nodeKey: parentNodeKey }, { db });
    const confirmed = await runner.run("deleteMindmapFreestyleNode", { initiativeId, nodeKey: parentNodeKey, confirmed: true }, { db });

    expect(leafDelete).toMatchObject({ ok: true, data: { deleted: true, deletedNodeKeys: [leafNodeKey] } });
    expect(confirmation).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "deleteMindmapFreestyleNodeSubtree",
      summary: expect.stringContaining(parentNodeKey),
      proposedAction: { tool: "deleteMindmapFreestyleNode", input: { initiativeId, nodeKey: parentNodeKey } }
    });
    expect((confirmation as { summary: string }).summary).toContain(childNodeKey);
    expect(confirmed).toMatchObject({
      ok: true,
      data: {
        deleted: true,
        deletedNodeKeys: expect.arrayContaining([parentNodeKey, childNodeKey])
      }
    });
  });

  it("rejects update and delete attempts on derived root, branch, task, and media nodes", async () => {
    const runner = createToolRunner();
    const task = new TaskRepository(db).create({ initiativeId, title: "Task" });
    const asset = new MediaAssetRepository(db).create({
      kind: "document",
      mimeType: "text/plain",
      originalName: "note.txt",
      storagePath: "note.txt",
      sha256: "def",
      byteSize: 20
    });
    new MediaLinkRepository(db).create({ assetId: asset.id, entityType: "initiative", entityId: initiativeId });

    for (const nodeKey of [`initiative:${initiativeId}`, "branch:freestyle", `task:${task.id}`, `media:${asset.id}`]) {
      const update = await runner.run("updateMindmapFreestyleNode", { initiativeId, nodeKey, x: 1 }, { db });
      const deleteResult = await runner.run("deleteMindmapFreestyleNode", { initiativeId, nodeKey }, { db });

      expect(update, nodeKey).toMatchObject({ ok: false, error: expect.stringContaining("Only freestyle") });
      expect(deleteResult, nodeKey).toMatchObject({ ok: false, error: expect.stringContaining("Only freestyle") });
    }
  });

  it("drafts mindmap patches and commits them only after confirmation", async () => {
    const runner = createToolRunner();

    const draft = await runner.run(
      "draftMindmapChanges",
      {
        initiativeId,
        sourceKind: "mindmap_review",
        summary: "Strukturiert Strategie und Risiko als Vorschau.",
        rationale: "Der Nutzer will die Mindmap anders sortieren.",
        patches: [
          {
            type: "create_node",
            tempNodeKey: "draft:strategy",
            parentNodeKey: "branch:freestyle",
            label: "Strategische Richtung",
            annotations: [{ annotationType: "priority", value: "high" }]
          },
          {
            type: "create_node",
            tempNodeKey: "draft:risk",
            parentNodeKey: "draft:strategy",
            label: "Risiko: Fokus zerfasert",
            annotations: [{ annotationType: "warning", value: "Fokus pruefen" }]
          }
        ],
        warnings: ["Nur Freestyle-Knoten werden erzeugt."]
      },
      { db }
    );

    expect(draft).toMatchObject({
      ok: true,
      data: {
        status: "draft",
        initiativeId,
        patches: expect.arrayContaining([
          expect.objectContaining({ type: "create_node", tempNodeKey: "draft:strategy" })
        ])
      }
    });
    expect(new InitiativeMindmapRepository(db).getView({ type: "initiative", initiativeId }).nodes.map((node) => node.label)).not.toContain("Strategische Richtung");

    const draftId = (draft as { ok: true; data: { id: number } }).data.id;
    const rejected = await runner.run("commitMindmapChangeDraft", { initiativeId, draftId }, { db });
    expect(rejected).toMatchObject({ ok: false, error: expect.stringContaining("confirmed=true") });

    const committed = await runner.run("commitMindmapChangeDraft", { initiativeId, draftId, confirmed: true }, { db });

    expect(committed).toMatchObject({
      ok: true,
      data: {
        draft: { status: "committed" },
        createdNodeKeys: [expect.stringMatching(/^freestyle:/), expect.stringMatching(/^freestyle:/)],
        createdAnnotationIds: [expect.any(Number), expect.any(Number)]
      }
    });
    const view = new InitiativeMindmapRepository(db).getView({ type: "initiative", initiativeId });
    expect(view.nodes.map((node) => node.label)).toEqual(expect.arrayContaining(["Strategische Richtung", "Risiko: Fokus zerfasert"]));
  });

  it("summarizes mindmaps with annotation and draft counts", async () => {
    const runner = createToolRunner();
    const freestyle = await runner.run("createMindmapFreestyleNode", { initiativeId, label: "Wichtiger Gedanke" }, { db });
    const nodeKey = (freestyle as { ok: true; data: { nodeKey: string } }).data.nodeKey;
    const draft = await runner.run(
      "draftMindmapChanges",
      {
        initiativeId,
        sourceKind: "dialog",
        summary: "Warnung markieren.",
        patches: [{ type: "add_annotation", nodeKey, annotationType: "warning", value: "Noch unklar" }]
      },
      { db }
    );
    await runner.run("commitMindmapChangeDraft", { initiativeId, draftId: (draft as { ok: true; data: { id: number } }).data.id, confirmed: true }, { db });

    const summary = await runner.run("summarizeInitiativeMindmap", { initiativeId }, { db });

    expect(summary).toMatchObject({
      ok: true,
      data: {
        initiativeId,
        freestyleNodeCount: expect.any(Number),
        annotationsByType: {
          warning: [expect.objectContaining({ nodeKey, value: "Noch unklar" })]
        },
        outline: expect.arrayContaining([expect.stringContaining("Wichtiger Gedanke")])
      }
    });
  });
});
