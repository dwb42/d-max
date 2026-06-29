import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { Initiative } from "./initiatives.js";
import type { MediaAttachment } from "./media-links.js";
import type { Task } from "./tasks.js";

export type GraphScope =
  | { type: "initiative"; initiativeId: number }
  | { type: "category"; categoryId: number }
  | { type: "all_categories" };

export type GraphLayoutNodeKind = "initiative_root" | "branch" | "freestyle" | "task" | "media";
export type GraphLayoutEntityType = "initiative" | "task" | "media_asset";

export type GraphNodeMoveSupport = {
  visual: boolean;
  semantic: boolean;
  freestyleParent: boolean;
};

export type GraphLayoutNode = {
  id: number;
  scopeKey: string;
  scope: GraphScope;
  nodeKey: string;
  nodeKind: GraphLayoutNodeKind;
  entityType: GraphLayoutEntityType | null;
  entityId: number | null;
  parentNodeKey: string | null;
  label: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: boolean;
  moveSupport: GraphNodeMoveSupport;
  createdAt: string;
  updatedAt: string;
};

export type GraphLayoutEdge = {
  id: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  kind: "parent_child";
};

export type InitiativeMindmapView = {
  scope: GraphScope;
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
};

type GraphLayoutNodeRow = {
  id: number;
  scope_key: string;
  scope_type: GraphScope["type"];
  scope_initiative_id: number | null;
  scope_category_id: number | null;
  node_key: string;
  node_kind: GraphLayoutNodeKind;
  entity_type: GraphLayoutEntityType | null;
  entity_id: number | null;
  parent_node_key: string | null;
  label: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: number;
  created_at: string;
  updated_at: string;
};

type InitiativeRow = {
  id: number;
  category_id: number;
  parent_id: number | null;
  type: Initiative["type"];
  project_phase: Initiative["projectPhase"];
  name: string;
  status: Initiative["status"];
  summary: string | null;
  markdown: string;
  start_date: string | null;
  end_date: string | null;
  is_locked: number;
  sort_order: number;
  is_system: number;
  created_at: string;
  updated_at: string;
};

type TaskRow = {
  id: number;
  initiative_id: number | null;
  primary_party_id: number | null;
  title: string;
  status: Task["status"];
  priority: Task["priority"];
  notes: string | null;
  due_at: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

type MediaRow = {
  id: number;
  asset_id: number;
  entity_type: MediaAttachment["entityType"];
  entity_id: number;
  caption: string | null;
  role: string | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
  original_name: string;
};

type GraphNodeSeed = {
  nodeKey: string;
  nodeKind: GraphLayoutNodeKind;
  entityType: GraphLayoutEntityType | null;
  entityId: number | null;
  parentNodeKey: string | null;
  label: string;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  collapsed?: boolean;
};

const FREESTYLE_BRANCH_KEY = "branch:freestyle";
const TASKS_BRANCH_KEY = "branch:tasks";
const MEDIA_BRANCH_KEY = "branch:media";

export class InitiativeMindmapRepository {
  constructor(private readonly db: Database.Database) {}

  getView(scope: GraphScope): InitiativeMindmapView {
    if (scope.type !== "initiative") {
      return { scope, nodes: [], edges: [] };
    }

    const initiative = this.findInitiative(scope.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative not found: ${scope.initiativeId}`);
    }

    this.ensureDerivedNodes(scope, initiative);
    const nodes = this.listNodes(scope);
    const nodeKeys = new Set(nodes.map((node) => node.nodeKey));
    const edges = nodes
      .filter((node) => node.parentNodeKey && nodeKeys.has(node.parentNodeKey))
      .map((node) => ({
        id: `parent:${node.parentNodeKey}->${node.nodeKey}`,
        sourceNodeKey: node.parentNodeKey!,
        targetNodeKey: node.nodeKey,
        kind: "parent_child" as const
      }));

    return { scope, nodes, edges };
  }

  createFreestyleNode(
    input: {
      scope: GraphScope;
      parentNodeKey?: string | null;
      label?: string | null;
      x?: number;
      y?: number;
    },
    now = nowIso()
  ): GraphLayoutNode {
    const view = this.getView(input.scope);
    const parentNodeKey = input.parentNodeKey === undefined ? FREESTYLE_BRANCH_KEY : input.parentNodeKey;
    const parent = parentNodeKey ? view.nodes.find((node) => node.nodeKey === parentNodeKey) : null;
    if (parentNodeKey && !parent) {
      throw new Error(`Mindmap parent node not found: ${parentNodeKey}`);
    }

    const siblingCount = view.nodes.filter((node) => node.parentNodeKey === parentNodeKey).length;
    const nodeKey = `freestyle:${randomUUID()}`;
    const seed: GraphNodeSeed = {
      nodeKey,
      nodeKind: "freestyle",
      entityType: null,
      entityId: null,
      parentNodeKey,
      label: input.label === undefined || input.label === null ? "Neuer Gedanke" : input.label.trim(),
      x: input.x ?? (parent ? parent.x + 260 : 80),
      y: input.y ?? (parent ? parent.y + siblingCount * 76 : 80 + siblingCount * 76),
      width: 180,
      height: 48
    };
    this.insertNode(input.scope, seed, now);
    return this.findNode(input.scope, nodeKey)!;
  }

  updateNode(
    input: {
      scope: GraphScope;
      nodeKey: string;
      label?: string;
      x?: number;
      y?: number;
      width?: number | null;
      height?: number | null;
      collapsed?: boolean;
      parentNodeKey?: string | null;
    },
    now = nowIso()
  ): GraphLayoutNode {
    const view = this.getView(input.scope);
    const existing = view.nodes.find((node) => node.nodeKey === input.nodeKey);
    if (!existing) {
      throw new Error(`Mindmap node not found: ${input.nodeKey}`);
    }

    if (input.parentNodeKey !== undefined && existing.nodeKind !== "freestyle") {
      throw new Error("V1 mindmap reparenting is only supported for freestyle nodes.");
    }

    if (input.label !== undefined && existing.nodeKind !== "freestyle") {
      throw new Error("Only freestyle mindmap nodes can be renamed.");
    }

    if (input.parentNodeKey !== undefined) {
      this.assertValidFreestyleParent(view, existing.nodeKey, input.parentNodeKey);
    }

    this.db
      .prepare(
        `update graph_layout_nodes
         set label = ?,
             x = ?,
             y = ?,
             width = ?,
             height = ?,
             collapsed = ?,
             parent_node_key = ?,
             updated_at = ?
         where scope_key = ? and node_key = ?`
      )
      .run(
        input.label === undefined ? existing.label : input.label.trim(),
        input.x ?? existing.x,
        input.y ?? existing.y,
        input.width === undefined ? existing.width : input.width,
        input.height === undefined ? existing.height : input.height,
        input.collapsed === undefined ? (existing.collapsed ? 1 : 0) : input.collapsed ? 1 : 0,
        input.parentNodeKey === undefined ? existing.parentNodeKey : input.parentNodeKey,
        now,
        scopeKey(input.scope),
        input.nodeKey
      );

    return this.findNode(input.scope, input.nodeKey)!;
  }

  deleteFreestyleNode(input: { scope: GraphScope; nodeKey: string }): GraphLayoutNode[] {
    const view = this.getView(input.scope);
    const existing = view.nodes.find((node) => node.nodeKey === input.nodeKey);
    if (!existing) {
      throw new Error(`Mindmap node not found: ${input.nodeKey}`);
    }
    if (existing.nodeKind !== "freestyle") {
      throw new Error("Only freestyle mindmap nodes can be deleted.");
    }

    const deleteKeys = descendantsIncluding(view.nodes, existing.nodeKey);
    const deleted = view.nodes.filter((node) => deleteKeys.has(node.nodeKey));
    const placeholders = [...deleteKeys].map(() => "?").join(", ");
    this.db
      .prepare(`delete from graph_layout_nodes where scope_key = ? and node_key in (${placeholders})`)
      .run(scopeKey(input.scope), ...deleteKeys);
    return deleted;
  }

  replaceFreestyleNodes(input: { scope: GraphScope; nodes: Array<{
    nodeKey: string;
    parentNodeKey: string | null;
    label: string;
    x: number;
    y: number;
    width?: number | null;
    height?: number | null;
    collapsed?: boolean;
  }> }, now = nowIso()): InitiativeMindmapView {
    const view = this.getView(input.scope);
    const nodeKeys = new Set<string>();
    for (const node of input.nodes) {
      if (!node.nodeKey.startsWith("freestyle:")) {
        throw new Error(`Freestyle snapshot includes invalid node key: ${node.nodeKey}`);
      }
      if (nodeKeys.has(node.nodeKey)) {
        throw new Error(`Freestyle snapshot includes duplicate node key: ${node.nodeKey}`);
      }
      nodeKeys.add(node.nodeKey);
    }

    const allowedParentKeys = new Set(view.nodes.filter((node) => node.nodeKind !== "freestyle").map((node) => node.nodeKey));
    for (const node of input.nodes) {
      if (node.parentNodeKey === null) continue;
      if (!allowedParentKeys.has(node.parentNodeKey) && !nodeKeys.has(node.parentNodeKey)) {
        throw new Error(`Mindmap parent node not found: ${node.parentNodeKey}`);
      }
      if (node.parentNodeKey === node.nodeKey) {
        throw new Error("A mindmap node cannot be its own parent.");
      }
    }
    for (const node of input.nodes) {
      this.assertNoSnapshotCycle(input.nodes, node.nodeKey);
    }

    const transaction = this.db.transaction(() => {
      this.db.prepare("delete from graph_layout_nodes where scope_key = ? and node_kind = 'freestyle'").run(scopeKey(input.scope));
      for (const node of input.nodes) {
        this.insertNode(input.scope, {
          nodeKey: node.nodeKey,
          nodeKind: "freestyle",
          entityType: null,
          entityId: null,
          parentNodeKey: node.parentNodeKey,
          label: node.label,
          x: node.x,
          y: node.y,
          width: node.width ?? null,
          height: node.height ?? null,
          collapsed: node.collapsed ?? false
        }, now);
      }
    });
    transaction();
    return this.getView(input.scope);
  }

  private ensureDerivedNodes(scope: Extract<GraphScope, { type: "initiative" }>, initiative: Initiative, now = nowIso()): void {
    const rootKey = `initiative:${initiative.id}`;
    const seeds: GraphNodeSeed[] = [
      {
        nodeKey: rootKey,
        nodeKind: "initiative_root",
        entityType: "initiative",
        entityId: initiative.id,
        parentNodeKey: null,
        label: initiative.name,
        x: 0,
        y: 0,
        width: 220,
        height: 64
      },
      {
        nodeKey: FREESTYLE_BRANCH_KEY,
        nodeKind: "branch",
        entityType: null,
        entityId: null,
        parentNodeKey: rootKey,
        label: "Freestyle",
        x: 280,
        y: -150,
        width: 180,
        height: 48
      },
      {
        nodeKey: TASKS_BRANCH_KEY,
        nodeKind: "branch",
        entityType: null,
        entityId: null,
        parentNodeKey: rootKey,
        label: "Maßnahmen",
        x: 280,
        y: 0,
        width: 180,
        height: 48
      },
      {
        nodeKey: MEDIA_BRANCH_KEY,
        nodeKind: "branch",
        entityType: null,
        entityId: null,
        parentNodeKey: rootKey,
        label: "Medien",
        x: 280,
        y: 150,
        width: 180,
        height: 48
      }
    ];

    seeds.push(...this.listTasks(scope.initiativeId).map((task, index) => ({
      nodeKey: `task:${task.id}`,
      nodeKind: "task" as const,
      entityType: "task" as const,
      entityId: task.id,
      parentNodeKey: TASKS_BRANCH_KEY,
      label: task.title,
      x: 560,
      y: -70 + index * 76,
      width: 210,
      height: 52
    })));

    seeds.push(...this.listMedia(scope.initiativeId).map((media, index) => ({
      nodeKey: `media:${media.asset_id}`,
      nodeKind: "media" as const,
      entityType: "media_asset" as const,
      entityId: media.asset_id,
      parentNodeKey: MEDIA_BRANCH_KEY,
      label: media.caption?.trim() || media.original_name,
      x: 560,
      y: 160 + index * 76,
      width: 210,
      height: 52
    })));

    const transaction = this.db.transaction(() => {
      for (const seed of seeds) {
        this.upsertDerivedNode(scope, seed, now);
      }
    });
    transaction();
  }

  private assertValidFreestyleParent(view: InitiativeMindmapView, nodeKey: string, parentNodeKey: string | null): void {
    if (parentNodeKey === null) return;
    if (parentNodeKey === nodeKey) {
      throw new Error("A mindmap node cannot be its own parent.");
    }
    const nodesByKey = new Map(view.nodes.map((node) => [node.nodeKey, node]));
    if (!nodesByKey.has(parentNodeKey)) {
      throw new Error(`Mindmap parent node not found: ${parentNodeKey}`);
    }

    let cursor: string | null = parentNodeKey;
    while (cursor) {
      if (cursor === nodeKey) {
        throw new Error("Freestyle reparenting cannot create a cycle.");
      }
      cursor = nodesByKey.get(cursor)?.parentNodeKey ?? null;
    }
  }

  private assertNoSnapshotCycle(nodes: Array<{ nodeKey: string; parentNodeKey: string | null }>, nodeKey: string): void {
    const nodesByKey = new Map(nodes.map((node) => [node.nodeKey, node]));
    let cursor = nodesByKey.get(nodeKey)?.parentNodeKey ?? null;
    while (cursor) {
      if (cursor === nodeKey) {
        throw new Error("Freestyle reparenting cannot create a cycle.");
      }
      cursor = nodesByKey.get(cursor)?.parentNodeKey ?? null;
    }
  }

  private upsertDerivedNode(scope: GraphScope, seed: GraphNodeSeed, now: string): void {
    const scopeInfo = scopeColumns(scope);
    this.db
      .prepare(
        `insert into graph_layout_nodes
          (scope_key, scope_type, scope_initiative_id, scope_category_id, node_key, node_kind, entity_type, entity_id, parent_node_key, label, x, y, width, height, collapsed, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
         on conflict(scope_key, node_key) do update set
           node_kind = excluded.node_kind,
           entity_type = excluded.entity_type,
           entity_id = excluded.entity_id,
           parent_node_key = excluded.parent_node_key,
           label = excluded.label,
           updated_at = excluded.updated_at`
      )
      .run(
        scopeKey(scope),
        scopeInfo.scopeType,
        scopeInfo.scopeInitiativeId,
        scopeInfo.scopeCategoryId,
        seed.nodeKey,
        seed.nodeKind,
        seed.entityType,
        seed.entityId,
        seed.parentNodeKey,
        seed.label,
        seed.x,
        seed.y,
        seed.width ?? null,
        seed.height ?? null,
        now,
        now
      );
  }

  private insertNode(scope: GraphScope, seed: GraphNodeSeed, now: string): void {
    const scopeInfo = scopeColumns(scope);
    this.db
      .prepare(
        `insert into graph_layout_nodes
          (scope_key, scope_type, scope_initiative_id, scope_category_id, node_key, node_kind, entity_type, entity_id, parent_node_key, label, x, y, width, height, collapsed, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        scopeKey(scope),
        scopeInfo.scopeType,
        scopeInfo.scopeInitiativeId,
        scopeInfo.scopeCategoryId,
        seed.nodeKey,
        seed.nodeKind,
        seed.entityType,
        seed.entityId,
        seed.parentNodeKey,
        seed.label,
        seed.x,
        seed.y,
        seed.width ?? null,
        seed.height ?? null,
        seed.collapsed ? 1 : 0,
        now,
        now
      );
  }

  private listNodes(scope: GraphScope): GraphLayoutNode[] {
    const rows = this.db
      .prepare(
        `select * from graph_layout_nodes
         where scope_key = ?
         order by
          case node_kind
            when 'initiative_root' then 0
            when 'branch' then 1
            when 'task' then 2
            when 'media' then 3
            else 4
          end,
          parent_node_key is not null,
          y asc,
          x asc,
          lower(label) asc,
          id asc`
      )
      .all(scopeKey(scope)) as GraphLayoutNodeRow[];
    return rows.map(toGraphLayoutNode);
  }

  private findNode(scope: GraphScope, nodeKey: string): GraphLayoutNode | null {
    const row = this.db
      .prepare("select * from graph_layout_nodes where scope_key = ? and node_key = ?")
      .get(scopeKey(scope), nodeKey) as GraphLayoutNodeRow | undefined;
    return row ? toGraphLayoutNode(row) : null;
  }

  private findInitiative(id: number): Initiative | null {
    const row = this.db.prepare("select * from initiatives where id = ?").get(id) as InitiativeRow | undefined;
    return row ? initiativeFromRow(row) : null;
  }

  private listTasks(initiativeId: number): Task[] {
    const rows = this.db
      .prepare("select * from tasks where initiative_id = ? order by sort_order asc, due_at is null, due_at asc, id asc")
      .all(initiativeId) as TaskRow[];
    return rows.map(taskFromRow);
  }

  private listMedia(initiativeId: number): MediaRow[] {
    return this.db
      .prepare(
        `select l.*, a.original_name
         from media_links l
         join media_assets a on a.id = l.asset_id
         where l.entity_type = 'initiative' and l.entity_id = ?
         order by l.sort_order asc, l.id asc`
      )
      .all(initiativeId) as MediaRow[];
  }
}

function descendantsIncluding(nodes: GraphLayoutNode[], nodeKey: string): Set<string> {
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

function toGraphLayoutNode(row: GraphLayoutNodeRow): GraphLayoutNode {
  const scope = row.scope_type === "initiative"
    ? { type: "initiative" as const, initiativeId: row.scope_initiative_id! }
    : row.scope_type === "category"
      ? { type: "category" as const, categoryId: row.scope_category_id! }
      : { type: "all_categories" as const };
  return {
    id: row.id,
    scopeKey: row.scope_key,
    scope,
    nodeKey: row.node_key,
    nodeKind: row.node_kind,
    entityType: row.entity_type,
    entityId: row.entity_id,
    parentNodeKey: row.parent_node_key,
    label: row.label,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    collapsed: row.collapsed === 1,
    moveSupport: {
      visual: true,
      semantic: false,
      freestyleParent: row.node_kind !== "media"
    },
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function scopeKey(scope: GraphScope): string {
  if (scope.type === "initiative") return `initiative:${scope.initiativeId}`;
  if (scope.type === "category") return `category:${scope.categoryId}`;
  return "all_categories";
}

function scopeColumns(scope: GraphScope) {
  return {
    scopeType: scope.type,
    scopeInitiativeId: scope.type === "initiative" ? scope.initiativeId : null,
    scopeCategoryId: scope.type === "category" ? scope.categoryId : null
  };
}

function initiativeFromRow(row: InitiativeRow): Initiative {
  return {
    id: row.id,
    categoryId: row.category_id,
    parentId: row.parent_id,
    type: row.type,
    projectPhase: row.project_phase,
    name: row.name,
    status: row.status,
    summary: row.summary,
    markdown: row.markdown,
    startDate: row.start_date,
    endDate: row.end_date,
    isLocked: row.is_locked === 1,
    sortOrder: row.sort_order,
    isSystem: row.is_system === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function taskFromRow(row: TaskRow): Task {
  return {
    id: row.id,
    initiativeId: row.initiative_id,
    primaryPartyId: row.primary_party_id,
    title: row.title,
    status: row.status,
    priority: row.priority,
    notes: row.notes,
    dueAt: row.due_at,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at
  };
}
