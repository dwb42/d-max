import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { GraphNodeAnnotationType } from "./graph-node-annotations.js";

export type MindmapChangeDraftStatus = "draft" | "committed" | "discarded";
export type MindmapChangeDraftSourceKind = "dialog" | "long_content" | "mindmap_review" | "manual";

export type MindmapChangePatch =
  | {
      type: "create_node";
      tempNodeKey: string;
      parentNodeKey?: string | null;
      label: string;
      annotations?: Array<{
        annotationType: GraphNodeAnnotationType;
        value: string;
        payload?: unknown | null;
      }>;
    }
  | {
      type: "rename_node";
      nodeKey: string;
      label: string;
    }
  | {
      type: "reparent_node";
      nodeKey: string;
      parentNodeKey: string | null;
    }
  | {
      type: "delete_node";
      nodeKey: string;
    }
  | {
      type: "add_annotation";
      nodeKey: string;
      annotationType: GraphNodeAnnotationType;
      value: string;
      payload?: unknown | null;
    }
  | {
      type: "remove_annotation";
      nodeKey: string;
      annotationType?: GraphNodeAnnotationType;
      value?: string;
    };

export type MindmapChangeDraft = {
  id: number;
  initiativeId: number;
  status: MindmapChangeDraftStatus;
  sourceKind: MindmapChangeDraftSourceKind;
  sourceRef: unknown | null;
  summary: string;
  rationale: string | null;
  patches: MindmapChangePatch[];
  warnings: string[];
  committedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type MindmapChangeDraftRow = {
  id: number;
  initiative_id: number;
  status: MindmapChangeDraftStatus;
  source_kind: MindmapChangeDraftSourceKind;
  source_ref_json: string | null;
  summary: string;
  rationale: string | null;
  patches_json: string;
  warnings_json: string;
  committed_at: string | null;
  created_at: string;
  updated_at: string;
};

export type CreateMindmapChangeDraftInput = {
  initiativeId: number;
  sourceKind: MindmapChangeDraftSourceKind;
  sourceRef?: unknown | null;
  summary: string;
  rationale?: string | null;
  patches: MindmapChangePatch[];
  warnings?: string[];
};

export class MindmapChangeDraftRepository {
  constructor(private readonly db: Database.Database) {}

  create(input: CreateMindmapChangeDraftInput, now = nowIso()): MindmapChangeDraft {
    this.assertInitiativeExists(input.initiativeId);
    const result = this.db
      .prepare(
        `insert into mindmap_change_drafts
          (initiative_id, status, source_kind, source_ref_json, summary, rationale, patches_json, warnings_json, committed_at, created_at, updated_at)
         values (?, 'draft', ?, ?, ?, ?, ?, ?, null, ?, ?)`
      )
      .run(
        input.initiativeId,
        input.sourceKind,
        input.sourceRef === undefined || input.sourceRef === null ? null : JSON.stringify(input.sourceRef),
        input.summary.trim(),
        input.rationale?.trim() || null,
        JSON.stringify(input.patches),
        JSON.stringify(input.warnings ?? []),
        now,
        now
      );
    return this.findById(Number(result.lastInsertRowid))!;
  }

  findById(id: number): MindmapChangeDraft | null {
    const row = this.db.prepare("select * from mindmap_change_drafts where id = ?").get(id) as MindmapChangeDraftRow | undefined;
    return row ? toMindmapChangeDraft(row) : null;
  }

  listForInitiative(initiativeId: number, input: { status?: MindmapChangeDraftStatus } = {}): MindmapChangeDraft[] {
    const rows = input.status
      ? this.db
          .prepare("select * from mindmap_change_drafts where initiative_id = ? and status = ? order by id desc")
          .all(initiativeId, input.status)
      : this.db
          .prepare("select * from mindmap_change_drafts where initiative_id = ? order by id desc")
          .all(initiativeId);
    return (rows as MindmapChangeDraftRow[]).map(toMindmapChangeDraft);
  }

  markCommitted(id: number, now = nowIso()): MindmapChangeDraft {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Mindmap change draft not found: ${id}`);
    }
    this.db
      .prepare("update mindmap_change_drafts set status = 'committed', committed_at = ?, updated_at = ? where id = ?")
      .run(now, now, id);
    return this.findById(id)!;
  }

  discard(id: number, now = nowIso()): MindmapChangeDraft {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Mindmap change draft not found: ${id}`);
    }
    this.db
      .prepare("update mindmap_change_drafts set status = 'discarded', updated_at = ? where id = ?")
      .run(now, id);
    return this.findById(id)!;
  }

  private assertInitiativeExists(initiativeId: number): void {
    const row = this.db.prepare("select 1 as found from initiatives where id = ?").get(initiativeId) as { found: number } | undefined;
    if (!row) {
      throw new Error(`Initiative not found: ${initiativeId}`);
    }
  }
}

function toMindmapChangeDraft(row: MindmapChangeDraftRow): MindmapChangeDraft {
  return {
    id: row.id,
    initiativeId: row.initiative_id,
    status: row.status,
    sourceKind: row.source_kind,
    sourceRef: parseJson(row.source_ref_json, null),
    summary: row.summary,
    rationale: row.rationale,
    patches: parseJson(row.patches_json, []),
    warnings: parseJson(row.warnings_json, []),
    committedAt: row.committed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function parseJson<T>(value: string | null, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
