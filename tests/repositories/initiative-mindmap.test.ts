import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeMindmapRepository } from "../../src/repositories/initiative-mindmap.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { MediaAssetRepository } from "../../src/repositories/media-assets.js";
import { MediaLinkRepository } from "../../src/repositories/media-links.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("initiative mindmap repository", () => {
  let db: Database.Database;
  let categoryId: number;
  let initiativeId: number;

  beforeEach(() => {
    db = createTestDatabase();
    categoryId = new CategoryRepository(db).create({ name: "Business" }).id;
    initiativeId = new InitiativeRepository(db).create({ categoryId, name: "Mindmap Project" }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("loads initiative mindmap nodes and creates built-in branch nodes once", () => {
    const mindmap = new InitiativeMindmapRepository(db);

    const first = mindmap.getView({ type: "initiative", initiativeId });
    const second = mindmap.getView({ type: "initiative", initiativeId });

    expect(first.nodes.map((node) => node.nodeKey)).toEqual([`initiative:${initiativeId}`, "branch:freestyle", "branch:tasks", "branch:media"]);
    expect(second.nodes.map((node) => node.nodeKey)).toEqual(first.nodes.map((node) => node.nodeKey));
    expect(
      db.prepare("select count(*) as count from graph_layout_nodes where scope_key = ?").get(`initiative:${initiativeId}`)
    ).toEqual({ count: 4 });
  });

  it("adds task and media derived nodes in stable order", () => {
    const tasks = new TaskRepository(db);
    const mediaAssets = new MediaAssetRepository(db);
    const mediaLinks = new MediaLinkRepository(db);
    const firstTask = tasks.create({ initiativeId, title: "First task" });
    const secondTask = tasks.create({ initiativeId, title: "Second task" });
    const asset = mediaAssets.create({
      kind: "document",
      mimeType: "text/plain",
      originalName: "brief.txt",
      storagePath: "brief.txt",
      sha256: "abc",
      byteSize: 12
    });
    mediaLinks.create({ assetId: asset.id, entityType: "initiative", entityId: initiativeId, caption: "Brief" });

    const view = new InitiativeMindmapRepository(db).getView({ type: "initiative", initiativeId });

    expect(view.nodes.map((node) => node.nodeKey)).toEqual([
      `initiative:${initiativeId}`,
      "branch:freestyle",
      "branch:tasks",
      "branch:media",
      `task:${firstTask.id}`,
      `task:${secondTask.id}`,
      `media:${asset.id}`
    ]);
    expect(view.edges).toEqual(expect.arrayContaining([
      expect.objectContaining({ sourceNodeKey: "branch:tasks", targetNodeKey: `task:${firstTask.id}` }),
      expect.objectContaining({ sourceNodeKey: "branch:media", targetNodeKey: `media:${asset.id}` })
    ]));
  });

  it("persists freestyle child creation and renaming", () => {
    const mindmap = new InitiativeMindmapRepository(db);

    const created = mindmap.createFreestyleNode({
      scope: { type: "initiative", initiativeId },
      parentNodeKey: "branch:freestyle",
      label: "Loose thought"
    });
    const renamed = mindmap.updateNode({
      scope: { type: "initiative", initiativeId },
      nodeKey: created.nodeKey,
      label: "Sharper thought"
    });
    const reloaded = mindmap.getView({ type: "initiative", initiativeId });

    expect(created.nodeKind).toBe("freestyle");
    expect(renamed.label).toBe("Sharper thought");
    expect(reloaded.nodes.find((node) => node.nodeKey === created.nodeKey)).toMatchObject({
      label: "Sharper thought",
      parentNodeKey: "branch:freestyle"
    });
  });

  it("supports floating freestyle nodes and snapshot restore for undo/redo", () => {
    const mindmap = new InitiativeMindmapRepository(db);
    const floating = mindmap.createFreestyleNode({
      scope: { type: "initiative", initiativeId },
      parentNodeKey: null,
      label: "Floating idea",
      x: 120,
      y: 160
    });

    const restored = mindmap.replaceFreestyleNodes({
      scope: { type: "initiative", initiativeId },
      nodes: [
        {
          nodeKey: floating.nodeKey,
          parentNodeKey: null,
          label: "Restored idea",
          x: 220,
          y: 260,
          width: 300,
          height: 80,
          collapsed: true
        }
      ]
    });

    expect(floating.parentNodeKey).toBeNull();
    expect(restored.nodes.find((node) => node.nodeKey === floating.nodeKey)).toMatchObject({
      label: "Restored idea",
      parentNodeKey: null,
      x: 220,
      y: 260,
      collapsed: true
    });
  });

  it("deletes freestyle subtrees but rejects deleting derived nodes", () => {
    const mindmap = new InitiativeMindmapRepository(db);
    const parent = mindmap.createFreestyleNode({ scope: { type: "initiative", initiativeId }, label: "Parent" });
    const child = mindmap.createFreestyleNode({
      scope: { type: "initiative", initiativeId },
      parentNodeKey: parent.nodeKey,
      label: "Child"
    });

    const deleted = mindmap.deleteFreestyleNode({ scope: { type: "initiative", initiativeId }, nodeKey: parent.nodeKey });
    const view = mindmap.getView({ type: "initiative", initiativeId });

    expect(deleted.map((node) => node.nodeKey).sort()).toEqual([child.nodeKey, parent.nodeKey].sort());
    expect(view.nodes.map((node) => node.nodeKey)).not.toContain(parent.nodeKey);
    expect(view.nodes.map((node) => node.nodeKey)).not.toContain(child.nodeKey);
    expect(() => mindmap.deleteFreestyleNode({ scope: { type: "initiative", initiativeId }, nodeKey: `initiative:${initiativeId}` })).toThrow("Only freestyle");
  });

  it("saves visual positions without changing source entities", () => {
    const mindmap = new InitiativeMindmapRepository(db);
    const task = new TaskRepository(db).create({ initiativeId, title: "Movable derived task" });

    const moved = mindmap.updateNode({
      scope: { type: "initiative", initiativeId },
      nodeKey: `task:${task.id}`,
      x: 720,
      y: -30
    });
    const sourceTask = new TaskRepository(db).findById(task.id);

    expect(moved).toMatchObject({ nodeKey: `task:${task.id}`, x: 720, y: -30 });
    expect(sourceTask).toMatchObject({ id: task.id, initiativeId, title: "Movable derived task" });
  });

  it("rejects freestyle reparenting cycles and invalid parents", () => {
    const mindmap = new InitiativeMindmapRepository(db);
    const parent = mindmap.createFreestyleNode({ scope: { type: "initiative", initiativeId }, label: "Parent" });
    const child = mindmap.createFreestyleNode({
      scope: { type: "initiative", initiativeId },
      parentNodeKey: parent.nodeKey,
      label: "Child"
    });

    expect(() =>
      mindmap.updateNode({
        scope: { type: "initiative", initiativeId },
        nodeKey: parent.nodeKey,
        parentNodeKey: child.nodeKey
      })
    ).toThrow("cycle");
    expect(() =>
      mindmap.updateNode({
        scope: { type: "initiative", initiativeId },
        nodeKey: child.nodeKey,
        parentNodeKey: "missing"
      })
    ).toThrow("parent node not found");
  });

  it("rejects task and media semantic reparenting in v1", () => {
    const mindmap = new InitiativeMindmapRepository(db);
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

    expect(() =>
      mindmap.updateNode({
        scope: { type: "initiative", initiativeId },
        nodeKey: `task:${task.id}`,
        parentNodeKey: "branch:freestyle"
      })
    ).toThrow("only supported for freestyle");
    expect(() =>
      mindmap.updateNode({
        scope: { type: "initiative", initiativeId },
        nodeKey: `media:${asset.id}`,
        parentNodeKey: "branch:freestyle"
      })
    ).toThrow("only supported for freestyle");
  });
});
