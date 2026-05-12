import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { Initiative } from "./initiatives.js";

export type InitiativeRelationType = "precedes";

export type InitiativeRelation = {
  id: number;
  predecessorInitiativeId: number;
  successorInitiativeId: number;
  relationType: InitiativeRelationType;
  createdAt: string;
  updatedAt: string;
};

export type InitiativeRelationWithInitiatives = InitiativeRelation & {
  predecessor: Initiative;
  successor: Initiative;
};

export type InitiativeGraph = {
  initiatives: Initiative[];
  relations: InitiativeRelationWithInitiatives[];
};

type InitiativeRelationRow = {
  id: number;
  predecessor_initiative_id: number;
  successor_initiative_id: number;
  relation_type: InitiativeRelationType;
  created_at: string;
  updated_at: string;
};

type InitiativeRelationJoinRow = InitiativeRelationRow & {
  predecessor_id: number;
  predecessor_category_id: number;
  predecessor_parent_id: number | null;
  predecessor_type: Initiative["type"];
  predecessor_project_phase: Initiative["projectPhase"];
  predecessor_name: string;
  predecessor_status: Initiative["status"];
  predecessor_summary: string | null;
  predecessor_markdown: string;
  predecessor_start_date: string | null;
  predecessor_end_date: string | null;
  predecessor_is_locked: number;
  predecessor_sort_order: number;
  predecessor_is_system: number;
  predecessor_created_at: string;
  predecessor_updated_at: string;
  successor_id: number;
  successor_category_id: number;
  successor_parent_id: number | null;
  successor_type: Initiative["type"];
  successor_project_phase: Initiative["projectPhase"];
  successor_name: string;
  successor_status: Initiative["status"];
  successor_summary: string | null;
  successor_markdown: string;
  successor_start_date: string | null;
  successor_end_date: string | null;
  successor_is_locked: number;
  successor_sort_order: number;
  successor_is_system: number;
  successor_created_at: string;
  successor_updated_at: string;
};

export type CreateInitiativeRelationInput = {
  predecessorInitiativeId: number;
  successorInitiativeId: number;
  relationType?: InitiativeRelationType;
};

export type ListInitiativeRelationsFilters = {
  initiativeId?: number;
  predecessorInitiativeId?: number;
  successorInitiativeId?: number;
  relationType?: InitiativeRelationType;
};

function toInitiativeRelation(row: InitiativeRelationRow): InitiativeRelation {
  return {
    id: row.id,
    predecessorInitiativeId: row.predecessor_initiative_id,
    successorInitiativeId: row.successor_initiative_id,
    relationType: row.relation_type,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function initiativeFromPrefixedRow(row: InitiativeRelationJoinRow, prefix: "predecessor" | "successor"): Initiative {
  return {
    id: row[`${prefix}_id`],
    categoryId: row[`${prefix}_category_id`],
    parentId: row[`${prefix}_parent_id`],
    type: row[`${prefix}_type`],
    projectPhase: row[`${prefix}_project_phase`],
    name: row[`${prefix}_name`],
    status: row[`${prefix}_status`],
    summary: row[`${prefix}_summary`],
    markdown: row[`${prefix}_markdown`],
    startDate: row[`${prefix}_start_date`],
    endDate: row[`${prefix}_end_date`],
    isLocked: row[`${prefix}_is_locked`] === 1,
    sortOrder: row[`${prefix}_sort_order`],
    isSystem: row[`${prefix}_is_system`] === 1,
    createdAt: row[`${prefix}_created_at`],
    updatedAt: row[`${prefix}_updated_at`]
  };
}

function toInitiativeRelationWithInitiatives(row: InitiativeRelationJoinRow): InitiativeRelationWithInitiatives {
  return {
    ...toInitiativeRelation(row),
    predecessor: initiativeFromPrefixedRow(row, "predecessor"),
    successor: initiativeFromPrefixedRow(row, "successor")
  };
}

export class InitiativeRelationRepository {
  constructor(private readonly db: Database.Database) {}

  findById(id: number): InitiativeRelation | null {
    const row = this.db.prepare("select * from initiative_relations where id = ?").get(id) as InitiativeRelationRow | undefined;
    return row ? toInitiativeRelation(row) : null;
  }

  list(filters: ListInitiativeRelationsFilters = {}): InitiativeRelationWithInitiatives[] {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.initiativeId !== undefined) {
      conditions.push("(r.predecessor_initiative_id = ? or r.successor_initiative_id = ?)");
      params.push(filters.initiativeId, filters.initiativeId);
    }

    if (filters.predecessorInitiativeId !== undefined) {
      conditions.push("r.predecessor_initiative_id = ?");
      params.push(filters.predecessorInitiativeId);
    }

    if (filters.successorInitiativeId !== undefined) {
      conditions.push("r.successor_initiative_id = ?");
      params.push(filters.successorInitiativeId);
    }

    if (filters.relationType !== undefined) {
      conditions.push("r.relation_type = ?");
      params.push(filters.relationType);
    }

    const where = conditions.length > 0 ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db.prepare(`${relationJoinSql()} ${where} ${relationOrderSql()}`).all(...params) as InitiativeRelationJoinRow[];
    return rows.map(toInitiativeRelationWithInitiatives);
  }

  getInitiativePredecessors(initiativeId: number): InitiativeRelationWithInitiatives[] {
    return this.list({ successorInitiativeId: initiativeId, relationType: "precedes" });
  }

  getInitiativeSuccessors(initiativeId: number): InitiativeRelationWithInitiatives[] {
    return this.list({ predecessorInitiativeId: initiativeId, relationType: "precedes" });
  }

  getInitiativeGraph(input: { initiativeId?: number; maxDepth?: number } = {}): InitiativeGraph {
    if (input.initiativeId === undefined) {
      const relations = this.list({ relationType: "precedes" });
      const initiativeMap = new Map<number, Initiative>();
      for (const relation of relations) {
        initiativeMap.set(relation.predecessor.id, relation.predecessor);
        initiativeMap.set(relation.successor.id, relation.successor);
      }
      return { initiatives: Array.from(initiativeMap.values()).sort(compareInitiatives), relations };
    }

    const maxDepth = Math.min(Math.max(input.maxDepth ?? 3, 0), 20);
    const nodeRows = this.db
      .prepare(
        `with recursive graph_nodes(id, depth) as (
          select ? as id, 0 as depth
          union
          select r.predecessor_initiative_id, graph_nodes.depth + 1
          from initiative_relations r
          join graph_nodes on graph_nodes.id = r.successor_initiative_id
          where graph_nodes.depth < ?
          union
          select r.successor_initiative_id, graph_nodes.depth + 1
          from initiative_relations r
          join graph_nodes on graph_nodes.id = r.predecessor_initiative_id
          where graph_nodes.depth < ?
        )
        select distinct id from graph_nodes`
      )
      .all(input.initiativeId, maxDepth, maxDepth) as Array<{ id: number }>;

    const nodeIds = nodeRows.map((row) => row.id);
    if (nodeIds.length === 0) {
      return { initiatives: [], relations: [] };
    }

    const placeholders = nodeIds.map(() => "?").join(", ");
    const initiatives = this.db
      .prepare(`select * from initiatives where id in (${placeholders}) order by category_id asc, sort_order asc, lower(name) asc, id asc`)
      .all(...nodeIds)
      .map((row) => initiativeFromRow(row as InitiativeRow));
    const relations = this.db
      .prepare(
        `${relationJoinSql()} where r.relation_type = 'precedes' and r.predecessor_initiative_id in (${placeholders}) and r.successor_initiative_id in (${placeholders}) ${relationOrderSql()}`
      )
      .all(...nodeIds, ...nodeIds) as InitiativeRelationJoinRow[];

    return { initiatives, relations: relations.map(toInitiativeRelationWithInitiatives) };
  }

  create(input: CreateInitiativeRelationInput, now = nowIso()): InitiativeRelationWithInitiatives {
    const relationType = input.relationType ?? "precedes";
    this.assertCanCreate(input.predecessorInitiativeId, input.successorInitiativeId, relationType);

    this.db
      .prepare(
        `insert into initiative_relations
          (predecessor_initiative_id, successor_initiative_id, relation_type, created_at, updated_at)
         values (?, ?, ?, ?, ?)
         on conflict(predecessor_initiative_id, successor_initiative_id, relation_type) do update set updated_at = initiative_relations.updated_at`
      )
      .run(input.predecessorInitiativeId, input.successorInitiativeId, relationType, now, now);

    return this.findExisting(input.predecessorInitiativeId, input.successorInitiativeId, relationType)!;
  }

  delete(id: number): InitiativeRelation | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }

    this.db.prepare("delete from initiative_relations where id = ?").run(id);
    return existing;
  }

  private findExisting(
    predecessorInitiativeId: number,
    successorInitiativeId: number,
    relationType: InitiativeRelationType
  ): InitiativeRelationWithInitiatives | null {
    const rows = this.db
      .prepare(
        `${relationJoinSql()} where r.predecessor_initiative_id = ? and r.successor_initiative_id = ? and r.relation_type = ?`
      )
      .all(predecessorInitiativeId, successorInitiativeId, relationType) as InitiativeRelationJoinRow[];
    return rows[0] ? toInitiativeRelationWithInitiatives(rows[0]) : null;
  }

  private assertCanCreate(predecessorInitiativeId: number, successorInitiativeId: number, relationType: InitiativeRelationType): void {
    if (predecessorInitiativeId === successorInitiativeId) {
      throw new Error("Initiative relation cannot point to itself");
    }

    if (relationType !== "precedes") {
      throw new Error(`Unsupported initiative relation type: ${relationType}`);
    }

    if (!initiativeExists(this.db, predecessorInitiativeId)) {
      throw new Error(`Predecessor initiative not found: ${predecessorInitiativeId}`);
    }

    if (!initiativeExists(this.db, successorInitiativeId)) {
      throw new Error(`Successor initiative not found: ${successorInitiativeId}`);
    }

    if (this.wouldCreateCycle(predecessorInitiativeId, successorInitiativeId)) {
      throw new Error("Initiative relation would create a cycle");
    }
  }

  private wouldCreateCycle(predecessorInitiativeId: number, successorInitiativeId: number): boolean {
    const row = this.db
      .prepare(
        `with recursive reachable(id) as (
          select successor_initiative_id
          from initiative_relations
          where predecessor_initiative_id = ? and relation_type = 'precedes'
          union
          select r.successor_initiative_id
          from initiative_relations r
          join reachable on reachable.id = r.predecessor_initiative_id
          where r.relation_type = 'precedes'
        )
        select 1 as found from reachable where id = ? limit 1`
      )
      .get(successorInitiativeId, predecessorInitiativeId) as { found: number } | undefined;
    return Boolean(row);
  }
}

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

function initiativeExists(db: Database.Database, id: number): boolean {
  return Boolean(db.prepare("select 1 from initiatives where id = ?").get(id));
}

function compareInitiatives(left: Initiative, right: Initiative): number {
  return (
    left.categoryId - right.categoryId ||
    left.sortOrder - right.sortOrder ||
    left.name.localeCompare(right.name) ||
    left.id - right.id
  );
}

function relationJoinSql(): string {
  return `
    select
      r.*,
      p.id as predecessor_id,
      p.category_id as predecessor_category_id,
      p.parent_id as predecessor_parent_id,
      p.type as predecessor_type,
      p.project_phase as predecessor_project_phase,
      p.name as predecessor_name,
      p.status as predecessor_status,
      p.summary as predecessor_summary,
      p.markdown as predecessor_markdown,
      p.start_date as predecessor_start_date,
      p.end_date as predecessor_end_date,
      p.is_locked as predecessor_is_locked,
      p.sort_order as predecessor_sort_order,
      p.is_system as predecessor_is_system,
      p.created_at as predecessor_created_at,
      p.updated_at as predecessor_updated_at,
      s.id as successor_id,
      s.category_id as successor_category_id,
      s.parent_id as successor_parent_id,
      s.type as successor_type,
      s.project_phase as successor_project_phase,
      s.name as successor_name,
      s.status as successor_status,
      s.summary as successor_summary,
      s.markdown as successor_markdown,
      s.start_date as successor_start_date,
      s.end_date as successor_end_date,
      s.is_locked as successor_is_locked,
      s.sort_order as successor_sort_order,
      s.is_system as successor_is_system,
      s.created_at as successor_created_at,
      s.updated_at as successor_updated_at
    from initiative_relations r
    join initiatives p on p.id = r.predecessor_initiative_id
    join initiatives s on s.id = r.successor_initiative_id
  `;
}

function relationOrderSql(): string {
  return "order by lower(p.name) asc, p.id asc, lower(s.name) asc, s.id asc, r.id asc";
}
