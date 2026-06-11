import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { GraphScope } from "./initiative-mindmap.js";

export type GraphNodeAnnotationType = "priority" | "warning" | "timestamp" | "note" | "source_ref";

export type GraphNodeAnnotation = {
  id: number;
  scopeKey: string;
  nodeKey: string;
  annotationType: GraphNodeAnnotationType;
  value: string;
  payload: unknown | null;
  createdAt: string;
  updatedAt: string;
};

type GraphNodeAnnotationRow = {
  id: number;
  scope_key: string;
  node_key: string;
  annotation_type: GraphNodeAnnotationType;
  value: string;
  payload_json: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateGraphNodeAnnotationInput = {
  scope: GraphScope;
  nodeKey: string;
  annotationType: GraphNodeAnnotationType;
  value: string;
  payload?: unknown | null;
};

export class GraphNodeAnnotationRepository {
  constructor(private readonly db: Database.Database) {}

  listForScope(scope: GraphScope): GraphNodeAnnotation[] {
    const rows = this.db
      .prepare(
        `select *
         from graph_node_annotations
         where scope_key = ?
         order by node_key asc, annotation_type asc, id asc`
      )
      .all(scopeKey(scope)) as GraphNodeAnnotationRow[];
    return rows.map(toGraphNodeAnnotation);
  }

  listForNode(scope: GraphScope, nodeKey: string): GraphNodeAnnotation[] {
    const rows = this.db
      .prepare(
        `select *
         from graph_node_annotations
         where scope_key = ? and node_key = ?
         order by annotation_type asc, id asc`
      )
      .all(scopeKey(scope), nodeKey) as GraphNodeAnnotationRow[];
    return rows.map(toGraphNodeAnnotation);
  }

  create(input: CreateGraphNodeAnnotationInput, now = nowIso()): GraphNodeAnnotation {
    this.assertNodeExists(input.scope, input.nodeKey);
    const result = this.db
      .prepare(
        `insert into graph_node_annotations
          (scope_key, node_key, annotation_type, value, payload_json, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        scopeKey(input.scope),
        input.nodeKey,
        input.annotationType,
        input.value.trim(),
        input.payload === undefined || input.payload === null ? null : JSON.stringify(input.payload),
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  delete(id: number): GraphNodeAnnotation | null {
    const existing = this.findById(id);
    if (!existing) return null;
    this.db.prepare("delete from graph_node_annotations where id = ?").run(id);
    return existing;
  }

  deleteMatching(input: {
    scope: GraphScope;
    nodeKey: string;
    annotationType?: GraphNodeAnnotationType;
    value?: string;
  }): GraphNodeAnnotation[] {
    const annotations = this.listForNode(input.scope, input.nodeKey).filter((annotation) =>
      (input.annotationType === undefined || annotation.annotationType === input.annotationType)
      && (input.value === undefined || annotation.value === input.value)
    );
    if (annotations.length === 0) return [];
    const placeholders = annotations.map(() => "?").join(", ");
    this.db.prepare(`delete from graph_node_annotations where id in (${placeholders})`).run(...annotations.map((annotation) => annotation.id));
    return annotations;
  }

  findById(id: number): GraphNodeAnnotation | null {
    const row = this.db.prepare("select * from graph_node_annotations where id = ?").get(id) as GraphNodeAnnotationRow | undefined;
    return row ? toGraphNodeAnnotation(row) : null;
  }

  private assertNodeExists(scope: GraphScope, nodeKey: string): void {
    const row = this.db
      .prepare("select 1 as found from graph_layout_nodes where scope_key = ? and node_key = ?")
      .get(scopeKey(scope), nodeKey) as { found: number } | undefined;
    if (!row) {
      throw new Error(`Mindmap node not found: ${nodeKey}`);
    }
  }
}

function toGraphNodeAnnotation(row: GraphNodeAnnotationRow): GraphNodeAnnotation {
  return {
    id: row.id,
    scopeKey: row.scope_key,
    nodeKey: row.node_key,
    annotationType: row.annotation_type,
    value: row.value,
    payload: parseJson(row.payload_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJson(value: string | null): unknown | null {
  if (!value) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function scopeKey(scope: GraphScope): string {
  if (scope.type === "initiative") return `initiative:${scope.initiativeId}`;
  if (scope.type === "category") return `category:${scope.categoryId}`;
  return "all_categories";
}
