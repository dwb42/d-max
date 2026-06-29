import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";
import type { PartyType } from "./parties.js";

export type PartyTimelineEntryKind = "conversation" | "letter_received" | "letter_sent" | "visit" | "note";
export type PartyTimelineEntryDirection = "inbound" | "outbound" | "bidirectional" | "none";
export type PartyTimelineEntryPartyRole = "primary" | "participant" | "related" | "organization_context";

export type PartyTimelineEntry = {
  id: number;
  kind: PartyTimelineEntryKind;
  direction: PartyTimelineEntryDirection;
  occurredAt: string;
  title: string;
  body: string | null;
  relatedTaskId: number | null;
  createdAt: string;
  updatedAt: string;
  parties: PartyTimelineEntryParty[];
};

export type PartyTimelineEntryParty = {
  id: number;
  entryId: number;
  partyId: number;
  partyType: PartyType;
  partyDisplayName: string;
  role: PartyTimelineEntryPartyRole;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartyTimelineEntryInput = {
  partyId: number;
  kind: PartyTimelineEntryKind;
  direction?: PartyTimelineEntryDirection;
  occurredAt?: string | null;
  title: string;
  body?: string | null;
  relatedTaskId?: number | null;
  parties?: Array<{ partyId: number; role?: PartyTimelineEntryPartyRole }>;
};

export type UpdatePartyTimelineEntryInput = {
  id: number;
  kind?: PartyTimelineEntryKind;
  direction?: PartyTimelineEntryDirection;
  occurredAt?: string;
  title?: string;
  body?: string | null;
  relatedTaskId?: number | null;
};

type PartyTimelineEntryRow = {
  id: number;
  kind: PartyTimelineEntryKind;
  direction: PartyTimelineEntryDirection;
  occurred_at: string;
  title: string;
  body: string | null;
  related_task_id: number | null;
  created_at: string;
  updated_at: string;
};

type PartyTimelineEntryPartyRow = {
  id: number;
  entry_id: number;
  party_id: number;
  party_type: PartyType;
  party_display_name: string;
  role: PartyTimelineEntryPartyRole;
  created_at: string;
  updated_at: string;
};

export class PartyTimelineRepository {
  constructor(private readonly db: Database.Database) {}

  listForParty(partyId: number, limit = 80): PartyTimelineEntry[] {
    const rows = this.db
      .prepare(
        `select entry.*
         from party_timeline_entries entry
         join party_timeline_entry_parties link on link.entry_id = entry.id
         where link.party_id = ?
         group by entry.id
         order by entry.occurred_at desc, entry.id desc
         limit ?`
      )
      .all(partyId, limit) as PartyTimelineEntryRow[];
    return rows.map((row) => this.hydrate(row));
  }

  findById(id: number): PartyTimelineEntry | null {
    const row = this.db.prepare("select * from party_timeline_entries where id = ?").get(id) as PartyTimelineEntryRow | undefined;
    return row ? this.hydrate(row) : null;
  }

  create(input: CreatePartyTimelineEntryInput, now = nowIso()): PartyTimelineEntry {
    const relatedParties = normalizeEntryParties(input.partyId, input.parties);
    return this.db.transaction(() => {
      const result = this.db
        .prepare(
          `insert into party_timeline_entries
            (kind, direction, occurred_at, title, body, related_task_id, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.kind,
          input.direction ?? defaultDirection(input.kind),
          input.occurredAt || now,
          input.title.trim(),
          clean(input.body),
          input.relatedTaskId ?? null,
          now,
          now
        );
      const entryId = Number(result.lastInsertRowid);
      this.replaceParties(entryId, relatedParties, now);
      return this.findById(entryId)!;
    })();
  }

  update(input: UpdatePartyTimelineEntryInput, now = nowIso()): PartyTimelineEntry {
    const existing = this.findById(input.id);
    if (!existing) {
      throw new Error(`Party timeline entry not found: ${input.id}`);
    }

    this.db
      .prepare(
        `update party_timeline_entries
         set kind = ?, direction = ?, occurred_at = ?, title = ?, body = ?, related_task_id = ?, updated_at = ?
         where id = ?`
      )
      .run(
        input.kind ?? existing.kind,
        input.direction ?? existing.direction,
        input.occurredAt ?? existing.occurredAt,
        input.title?.trim() ?? existing.title,
        input.body === undefined ? existing.body : clean(input.body),
        input.relatedTaskId === undefined ? existing.relatedTaskId : input.relatedTaskId,
        now,
        input.id
      );
    return this.findById(input.id)!;
  }

  delete(id: number): PartyTimelineEntry | null {
    const existing = this.findById(id);
    if (!existing) {
      return null;
    }
    this.db.prepare("delete from party_timeline_entries where id = ?").run(id);
    return existing;
  }

  private replaceParties(entryId: number, parties: Array<{ partyId: number; role: PartyTimelineEntryPartyRole }>, now: string): void {
    this.db.prepare("delete from party_timeline_entry_parties where entry_id = ?").run(entryId);
    const insert = this.db.prepare(
      `insert into party_timeline_entry_parties (entry_id, party_id, role, created_at, updated_at)
       values (?, ?, ?, ?, ?)`
    );
    for (const party of parties) {
      insert.run(entryId, party.partyId, party.role, now, now);
    }
  }

  private hydrate(row: PartyTimelineEntryRow): PartyTimelineEntry {
    const parties = this.db
      .prepare(
        `select link.*, p.type as party_type, p.display_name as party_display_name
         from party_timeline_entry_parties link
         join parties p on p.id = link.party_id
         where link.entry_id = ?
         order by case link.role when 'primary' then 0 when 'organization_context' then 1 else 2 end, lower(p.display_name), link.id`
      )
      .all(row.id) as PartyTimelineEntryPartyRow[];
    return {
      id: row.id,
      kind: row.kind,
      direction: row.direction,
      occurredAt: row.occurred_at,
      title: row.title,
      body: row.body,
      relatedTaskId: row.related_task_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      parties: parties.map((party) => ({
        id: party.id,
        entryId: party.entry_id,
        partyId: party.party_id,
        partyType: party.party_type,
        partyDisplayName: party.party_display_name,
        role: party.role,
        createdAt: party.created_at,
        updatedAt: party.updated_at
      }))
    };
  }
}

function normalizeEntryParties(
  primaryPartyId: number,
  parties: Array<{ partyId: number; role?: PartyTimelineEntryPartyRole }> | undefined
): Array<{ partyId: number; role: PartyTimelineEntryPartyRole }> {
  const seen = new Set<string>();
  const normalized = [{ partyId: primaryPartyId, role: "primary" as PartyTimelineEntryPartyRole }, ...(parties ?? [])].flatMap((party) => {
    const role = party.role ?? (party.partyId === primaryPartyId ? "primary" : "participant");
    const key = `${party.partyId}:${role}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [{ partyId: party.partyId, role }];
  });
  return normalized;
}

function defaultDirection(kind: PartyTimelineEntryKind): PartyTimelineEntryDirection {
  if (kind === "letter_received") return "inbound";
  if (kind === "letter_sent") return "outbound";
  if (kind === "conversation" || kind === "visit") return "bidirectional";
  return "none";
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
