import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import {
  PartyContactPointRepository,
  PartyRelationshipRepository,
  toParty
} from "./parties.js";
import type { Party, PartyContactPoint, PartyRelationshipWithParties, PartyType } from "./parties.js";

export type LeadStatusGroup = {
  id: number;
  key: string;
  label: string;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type LeadStatus = {
  id: number;
  groupId: number;
  key: string;
  label: string;
  sortOrder: number;
  isTerminal: boolean;
  isSuccess: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Lead = {
  id: number;
  partyId: number;
  initiativeId: number | null;
  taskId: number | null;
  statusId: number;
  roleLabel: string | null;
  createdAt: string;
  updatedAt: string;
};

export type LeadWithParty = Lead & {
  party: Party;
  status: LeadStatus;
  contactPoints?: PartyContactPoint[];
  relationships?: PartyRelationshipWithParties[];
};

export type CreateLeadInput = {
  partyId: number;
  initiativeId?: number | null;
  taskId?: number | null;
  statusId?: number | null;
  roleLabel?: string | null;
};

export class LeadStatusRepository {
  constructor(private readonly db: Database.Database) {}

  listGroups(): LeadStatusGroup[] {
    return (this.db
      .prepare("select * from lead_status_groups order by sort_order asc, lower(label) asc, id asc")
      .all() as LeadStatusGroupRow[]).map(toLeadStatusGroup);
  }

  listStatuses(filters: { groupId?: number } = {}): LeadStatus[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.groupId !== undefined) {
      conditions.push("group_id = ?");
      params.push(filters.groupId);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    return (this.db
      .prepare(`select * from lead_statuses ${where} order by group_id asc, sort_order asc, lower(label) asc, id asc`)
      .all(...params) as LeadStatusRow[]).map(toLeadStatus);
  }

  findStatusById(id: number): LeadStatus | null {
    const row = this.db.prepare("select * from lead_statuses where id = ?").get(id) as LeadStatusRow | undefined;
    return row ? toLeadStatus(row) : null;
  }

  defaultFreshStatus(): LeadStatus {
    const row = this.db
      .prepare(
        `select ls.*
         from lead_statuses ls
         join lead_status_groups lsg on lsg.id = ls.group_id
         where lsg.key = 'default_outreach' and ls.key = 'fresh'`
      )
      .get() as LeadStatusRow | undefined;
    if (!row) {
      throw new Error("Default fresh lead status not found");
    }
    return toLeadStatus(row);
  }
}

export class LeadRepository {
  constructor(private readonly db: Database.Database) {}

  list(filters: { initiativeId?: number; taskId?: number; partyId?: number } = {}): LeadWithParty[] {
    const conditions: string[] = [];
    const params: unknown[] = [];
    if (filters.initiativeId !== undefined) {
      conditions.push("l.initiative_id = ?");
      params.push(filters.initiativeId);
    }
    if (filters.taskId !== undefined) {
      conditions.push("l.task_id = ?");
      params.push(filters.taskId);
    }
    if (filters.partyId !== undefined) {
      conditions.push("l.party_id = ?");
      params.push(filters.partyId);
    }
    const where = conditions.length ? `where ${conditions.join(" and ")}` : "";
    const rows = this.db
      .prepare(`${leadJoinSql()} ${where} order by ls.sort_order asc, lower(p.display_name) asc, l.id asc`)
      .all(...params) as LeadJoinRow[];
    return rows.map((row) => this.withPartyDetails(toLeadWithParty(row)));
  }

  findById(id: number): LeadWithParty | null {
    const row = this.db.prepare(`${leadJoinSql()} where l.id = ?`).get(id) as LeadJoinRow | undefined;
    return row ? this.withPartyDetails(toLeadWithParty(row)) : null;
  }

  create(input: CreateLeadInput, now = nowIso()): LeadWithParty {
    ensurePartyExists(this.db, input.partyId);
    const { initiativeId, taskId } = normalizeLeadTarget(input);
    if (initiativeId) ensureTargetExists(this.db, "initiatives", initiativeId, "Initiative");
    if (taskId) ensureTargetExists(this.db, "tasks", taskId, "Task");
    const statusId = input.statusId ?? new LeadStatusRepository(this.db).defaultFreshStatus().id;
    ensureStatusExists(this.db, statusId);

    const existing = this.findExistingId(input.partyId, initiativeId, taskId);
    if (existing) {
      return this.findById(existing)!;
    }

    const result = this.db
      .prepare(
        "insert into leads (party_id, initiative_id, task_id, status_id, role_label, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)"
      )
      .run(input.partyId, initiativeId, taskId, statusId, clean(input.roleLabel), now, now);
    return this.findById(Number(result.lastInsertRowid))!;
  }

  updateStatus(id: number, statusId: number, now = nowIso()): LeadWithParty {
    const existing = this.findById(id);
    if (!existing) {
      throw new Error(`Lead not found: ${id}`);
    }
    ensureStatusExists(this.db, statusId);
    this.db.prepare("update leads set status_id = ?, updated_at = ? where id = ?").run(statusId, now, id);
    return this.findById(id)!;
  }

  delete(id: number): Lead | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from leads where id = ?").run(id);
    return {
      id: existing.id,
      partyId: existing.partyId,
      initiativeId: existing.initiativeId,
      taskId: existing.taskId,
      statusId: existing.statusId,
      roleLabel: existing.roleLabel,
      createdAt: existing.createdAt,
      updatedAt: existing.updatedAt
    };
  }

  private findExistingId(partyId: number, initiativeId: number | null, taskId: number | null): number | null {
    const row = initiativeId
      ? this.db.prepare("select id from leads where party_id = ? and initiative_id = ?").get(partyId, initiativeId)
      : this.db.prepare("select id from leads where party_id = ? and task_id = ?").get(partyId, taskId);
    return (row as { id: number } | undefined)?.id ?? null;
  }

  private withPartyDetails(lead: LeadWithParty): LeadWithParty {
    return {
      ...lead,
      contactPoints: new PartyContactPointRepository(this.db).list({ partyId: lead.partyId }),
      relationships: new PartyRelationshipRepository(this.db).list({ partyId: lead.partyId, status: "active" })
    };
  }
}

type LeadStatusGroupRow = {
  id: number;
  key: string;
  label: string;
  is_system: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type LeadStatusRow = {
  id: number;
  group_id: number;
  key: string;
  label: string;
  sort_order: number;
  is_terminal: number;
  is_success: number;
  created_at: string;
  updated_at: string;
};

type LeadRow = {
  id: number;
  party_id: number;
  initiative_id: number | null;
  task_id: number | null;
  status_id: number;
  role_label: string | null;
  created_at: string;
  updated_at: string;
};

type LeadJoinRow = LeadRow & {
  party_type: PartyType;
  party_display_name: string;
  party_created_at: string;
  party_updated_at: string;
  status_group_id: number;
  status_key: string;
  status_label: string;
  status_sort_order: number;
  status_is_terminal: number;
  status_is_success: number;
  status_created_at: string;
  status_updated_at: string;
};

function toLeadStatusGroup(row: LeadStatusGroupRow): LeadStatusGroup {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    isSystem: row.is_system === 1,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toLeadStatus(row: LeadStatusRow): LeadStatus {
  return {
    id: row.id,
    groupId: row.group_id,
    key: row.key,
    label: row.label,
    sortOrder: row.sort_order,
    isTerminal: row.is_terminal === 1,
    isSuccess: row.is_success === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toLead(row: LeadRow): Lead {
  return {
    id: row.id,
    partyId: row.party_id,
    initiativeId: row.initiative_id,
    taskId: row.task_id,
    statusId: row.status_id,
    roleLabel: row.role_label,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function toLeadWithParty(row: LeadJoinRow): LeadWithParty {
  return {
    ...toLead(row),
    party: toParty({
      id: row.party_id,
      type: row.party_type,
      display_name: row.party_display_name,
      created_at: row.party_created_at,
      updated_at: row.party_updated_at
    }),
    status: toLeadStatus({
      id: row.status_id,
      group_id: row.status_group_id,
      key: row.status_key,
      label: row.status_label,
      sort_order: row.status_sort_order,
      is_terminal: row.status_is_terminal,
      is_success: row.status_is_success,
      created_at: row.status_created_at,
      updated_at: row.status_updated_at
    })
  };
}

function leadJoinSql(): string {
  return `select
    l.*,
    p.type as party_type,
    p.display_name as party_display_name,
    p.created_at as party_created_at,
    p.updated_at as party_updated_at,
    ls.group_id as status_group_id,
    ls.key as status_key,
    ls.label as status_label,
    ls.sort_order as status_sort_order,
    ls.is_terminal as status_is_terminal,
    ls.is_success as status_is_success,
    ls.created_at as status_created_at,
    ls.updated_at as status_updated_at
  from leads l
  join parties p on p.id = l.party_id
  join lead_statuses ls on ls.id = l.status_id`;
}

function normalizeLeadTarget(input: Pick<CreateLeadInput, "initiativeId" | "taskId">): { initiativeId: number | null; taskId: number | null } {
  const initiativeId = input.initiativeId ?? null;
  const taskId = input.taskId ?? null;
  if ((initiativeId && taskId) || (!initiativeId && !taskId)) {
    throw new Error("Lead requires exactly one of initiativeId or taskId");
  }
  return { initiativeId, taskId };
}

function ensurePartyExists(db: Database.Database, partyId: number): void {
  const row = db.prepare("select id from parties where id = ?").get(partyId) as { id: number } | undefined;
  if (!row) {
    throw new Error(`Party not found: ${partyId}`);
  }
}

function ensureTargetExists(db: Database.Database, table: "initiatives" | "tasks", id: number, label: string): void {
  const row = db.prepare(`select id from ${table} where id = ?`).get(id) as { id: number } | undefined;
  if (!row) {
    throw new Error(`${label} not found: ${id}`);
  }
}

function ensureStatusExists(db: Database.Database, statusId: number): void {
  const row = db.prepare("select id from lead_statuses where id = ?").get(statusId) as { id: number } | undefined;
  if (!row) {
    throw new Error(`Lead status not found: ${statusId}`);
  }
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
