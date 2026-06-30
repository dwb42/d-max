import type Database from "better-sqlite3";
import type { PartyType } from "./parties.js";
import type { TaskPriority, TaskStatus } from "./tasks.js";

export type PartyNextAction = {
  taskId: number;
  title: string;
  dueAt: string | null;
  status: TaskStatus;
  priority: TaskPriority;
};

export type PartyActivityStats = {
  emailInbound: number;
  emailOutbound: number;
  phone: number;
  meeting: number;
  visit: number;
  letters: number;
  manualTotal: number;
  measureTotal: number;
  openMeasureTotal: number;
};

export type PartyActivitySummary = {
  partyId: number;
  partyType: PartyType;
  displayName: string;
  contactSince: string | null;
  lastContactAt: string | null;
  channelsUsed: string[];
  stats: PartyActivityStats;
  nextAction: PartyNextAction | null;
  rollupIncludesPeople?: boolean;
  rollupPartyIds?: number[];
};

export type OrganizationPersonActivity = {
  partyId: number;
  displayName: string;
  relationshipLabel: string;
  roleLabel: string | null;
  startedOn: string | null;
  summary: PartyActivitySummary;
};

type PartyRow = {
  id: number;
  type: PartyType;
  display_name: string;
};

type GmailAggregateRow = {
  email_inbound: number;
  email_outbound: number;
  first_email_at: string | null;
  last_email_at: string | null;
};

type ManualAggregateRow = {
  phone: number;
  meeting: number;
  visit: number;
  letters: number;
  manual_total: number;
  first_manual_at: string | null;
  last_manual_at: string | null;
  channels_used: string | null;
};

type MeasureAggregateRow = {
  measure_total: number;
  open_measure_total: number;
  first_measure_at: string | null;
};

type NextActionRow = {
  task_id: number;
  title: string;
  due_at: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  created_at: string;
};

type OrganizationPersonRow = {
  partyId: number;
  displayName: string;
  relationshipLabel: string;
  roleLabel: string | null;
  startedOn: string | null;
};

export class PartyActivitySummaryRepository {
  constructor(private readonly db: Database.Database) {}

  listSummaries(partyIds: number[], options: { includeOrganizationPeople?: boolean } = {}): {
    summaries: PartyActivitySummary[];
    organizationPeople?: Record<number, OrganizationPersonActivity[]>;
  } {
    const orderedPartyIds = uniquePositiveIds(partyIds);
    if (orderedPartyIds.length === 0) {
      return { summaries: [], organizationPeople: options.includeOrganizationPeople ? {} : undefined };
    }

    const directSummaries = new Map<number, PartyActivitySummary>();
    for (const party of this.findParties(orderedPartyIds)) {
      directSummaries.set(party.id, this.buildDirectSummary(party));
    }

    const organizationPeople: Record<number, OrganizationPersonActivity[]> = {};
    const summaries = orderedPartyIds.flatMap((partyId) => {
      const summary = directSummaries.get(partyId);
      if (!summary) return [];
      if (options.includeOrganizationPeople && summary.partyType === "organization") {
        const people = this.listActiveOrganizationPeople(partyId);
        const personActivities = people.flatMap((person) => {
          const personSummary = directSummaries.get(person.partyId) ?? this.buildDirectSummary({
            id: person.partyId,
            type: "person",
            display_name: person.displayName
          });
          directSummaries.set(person.partyId, personSummary);
          return [{
            partyId: person.partyId,
            displayName: person.displayName,
            relationshipLabel: person.relationshipLabel,
            roleLabel: person.roleLabel,
            startedOn: person.startedOn,
            summary: personSummary
          }];
        }).sort(sortOrganizationPeopleActivity);
        organizationPeople[partyId] = personActivities;
        return [this.rollupOrganizationSummary(summary, personActivities.map((person) => person.summary))];
      }
      return [summary];
    });

    return {
      summaries,
      organizationPeople: options.includeOrganizationPeople ? organizationPeople : undefined
    };
  }

  private findParties(partyIds: number[]): PartyRow[] {
    if (partyIds.length === 0) return [];
    const placeholders = partyIds.map(() => "?").join(", ");
    const rows = this.db
      .prepare(`select id, type, display_name from parties where id in (${placeholders})`)
      .all(...partyIds) as PartyRow[];
    const byId = new Map(rows.map((row) => [row.id, row]));
    return partyIds.flatMap((id) => byId.get(id) ?? []);
  }

  private buildDirectSummary(party: PartyRow): PartyActivitySummary {
    const gmail = this.gmailAggregate(party.id);
    const manual = this.manualAggregate(party.id);
    const measures = this.measureAggregate(party.id);
    const channelsUsed = uniqueStrings([
      gmail.emailInbound + gmail.emailOutbound > 0 ? "email" : null,
      manual.phone > 0 ? "phone" : null,
      manual.meeting > 0 ? "meeting" : null,
      manual.visit > 0 ? "visit" : null,
      manual.letters > 0 ? "letter" : null,
      ...manual.channelsUsed
    ].filter((channel): channel is string => Boolean(channel)));

    return {
      partyId: party.id,
      partyType: party.type,
      displayName: party.display_name,
      contactSince: earliestIso([gmail.first_email_at, manual.first_manual_at, measures.first_measure_at]),
      lastContactAt: latestIso([gmail.last_email_at, manual.last_manual_at]),
      channelsUsed,
      stats: {
        emailInbound: gmail.emailInbound,
        emailOutbound: gmail.emailOutbound,
        phone: manual.phone,
        meeting: manual.meeting,
        visit: manual.visit,
        letters: manual.letters,
        manualTotal: manual.manualTotal,
        measureTotal: measures.measureTotal,
        openMeasureTotal: measures.openMeasureTotal
      },
      nextAction: this.nextAction(party.id)
    };
  }

  private gmailAggregate(partyId: number): { emailInbound: number; emailOutbound: number; first_email_at: string | null; last_email_at: string | null } {
    const row = this.db
      .prepare(
        `select
           coalesce(sum(case when gm.direction = 'inbound' then 1 else 0 end), 0) as email_inbound,
           coalesce(sum(case when gm.direction = 'outbound' then 1 else 0 end), 0) as email_outbound,
           min(gm.message_date) as first_email_at,
           max(gm.message_date) as last_email_at
         from gmail_messages gm
         join gmail_message_party_links link on link.message_id = gm.id
         left join gmail_message_party_visibility visibility
           on visibility.message_id = gm.id and visibility.party_id = link.party_id
         where link.party_id = ?
           and visibility.id is null
           and gm.sync_status = 'synced'`
      )
      .get(partyId) as GmailAggregateRow;
    return {
      emailInbound: row.email_inbound,
      emailOutbound: row.email_outbound,
      first_email_at: row.first_email_at,
      last_email_at: row.last_email_at
    };
  }

  private manualAggregate(partyId: number): { phone: number; meeting: number; visit: number; letters: number; manualTotal: number; first_manual_at: string | null; last_manual_at: string | null; channelsUsed: string[] } {
    const row = this.db
      .prepare(
        `with entries as (
           select entry.occurred_at,
                  coalesce(entry.channel, case
                    when entry.kind in ('letter_received', 'letter_sent') then 'letter'
                    when entry.kind = 'visit' then 'visit'
                    when entry.kind = 'note' then 'note'
                    else 'other'
                  end) as channel
           from party_timeline_entries entry
           join party_timeline_entry_parties link on link.entry_id = entry.id
           where link.party_id = ?
           group by entry.id
         )
         select
           coalesce(sum(case when channel = 'phone' then 1 else 0 end), 0) as phone,
           coalesce(sum(case when channel = 'meeting' then 1 else 0 end), 0) as meeting,
           coalesce(sum(case when channel = 'visit' then 1 else 0 end), 0) as visit,
           coalesce(sum(case when channel = 'letter' then 1 else 0 end), 0) as letters,
           count(*) as manual_total,
           min(occurred_at) as first_manual_at,
           max(occurred_at) as last_manual_at,
           group_concat(distinct channel) as channels_used
         from entries`
      )
      .get(partyId) as ManualAggregateRow;
    return {
      phone: row.phone,
      meeting: row.meeting,
      visit: row.visit,
      letters: row.letters,
      manualTotal: row.manual_total,
      first_manual_at: row.first_manual_at,
      last_manual_at: row.last_manual_at,
      channelsUsed: row.channels_used?.split(",").filter(Boolean) ?? []
    };
  }

  private measureAggregate(partyId: number): { measureTotal: number; openMeasureTotal: number; first_measure_at: string | null } {
    const row = this.db
      .prepare(
        `select
           count(*) as measure_total,
           coalesce(sum(case when status = 'open' then 1 else 0 end), 0) as open_measure_total,
           min(created_at) as first_measure_at
         from tasks
         where primary_party_id = ?`
      )
      .get(partyId) as MeasureAggregateRow;
    return {
      measureTotal: row.measure_total,
      openMeasureTotal: row.open_measure_total,
      first_measure_at: row.first_measure_at
    };
  }

  private nextAction(partyId: number): PartyNextAction | null {
    const row = this.db
      .prepare(
        `select id as task_id, title, due_at, status, priority, created_at
         from tasks
         where primary_party_id = ? and status = 'open'
         order by due_at is null asc,
                  due_at asc,
                  case priority when 'urgent' then 0 when 'high' then 1 when 'normal' then 2 when 'low' then 3 else 4 end asc,
                  created_at asc,
                  id asc
         limit 1`
      )
      .get(partyId) as NextActionRow | undefined;
    return row ? {
      taskId: row.task_id,
      title: row.title,
      dueAt: row.due_at,
      status: row.status,
      priority: row.priority
    } : null;
  }

  private listActiveOrganizationPeople(organizationPartyId: number): OrganizationPersonRow[] {
    return this.db
      .prepare(
        `select person_party.id as partyId,
                person_party.display_name as displayName,
                case
                  when rt.directionality = 'symmetric' then rt.label
                  when rel.from_party_id = ? then rt.label
                  else coalesce(rt.inverse_label, rt.label)
                end as relationshipLabel,
                rel.role_label as roleLabel,
                rel.started_on as startedOn
         from party_relationships rel
         join parties person_party
           on person_party.id = case when rel.from_party_id = ? then rel.to_party_id else rel.from_party_id end
          and person_party.type = 'person'
         join relationship_types rt on rt.id = rel.relationship_type_id
         where rel.status = 'active'
           and (rel.from_party_id = ? or rel.to_party_id = ?)
         group by person_party.id
         order by lower(person_party.display_name) asc, person_party.id asc`
      )
      .all(organizationPartyId, organizationPartyId, organizationPartyId, organizationPartyId) as OrganizationPersonRow[];
  }

  private rollupOrganizationSummary(organization: PartyActivitySummary, people: PartyActivitySummary[]): PartyActivitySummary {
    if (people.length === 0) {
      return { ...organization, rollupIncludesPeople: true, rollupPartyIds: [] };
    }
    const all = [organization, ...people];
    return {
      ...organization,
      contactSince: earliestIso(all.map((summary) => summary.contactSince)),
      lastContactAt: latestIso(all.map((summary) => summary.lastContactAt)),
      channelsUsed: uniqueStrings(all.flatMap((summary) => summary.channelsUsed)),
      stats: all.reduce((stats, summary) => addStats(stats, summary.stats), emptyStats()),
      nextAction: all.map((summary) => summary.nextAction).filter((action): action is PartyNextAction => Boolean(action)).sort(compareNextActions)[0] ?? null,
      rollupIncludesPeople: true,
      rollupPartyIds: people.map((person) => person.partyId)
    };
  }
}

function sortOrganizationPeopleActivity(left: OrganizationPersonActivity, right: OrganizationPersonActivity): number {
  if (left.summary.nextAction && !right.summary.nextAction) return -1;
  if (right.summary.nextAction && !left.summary.nextAction) return 1;
  const lastContactCompare = (right.summary.lastContactAt ?? "").localeCompare(left.summary.lastContactAt ?? "");
  return lastContactCompare || left.displayName.localeCompare(right.displayName) || left.partyId - right.partyId;
}

function compareNextActions(left: PartyNextAction, right: PartyNextAction): number {
  const dueCompare = (left.dueAt ?? "9999-12-31T23:59:59.999Z").localeCompare(right.dueAt ?? "9999-12-31T23:59:59.999Z");
  if (dueCompare !== 0) return dueCompare;
  return priorityRank(left.priority) - priorityRank(right.priority) || left.taskId - right.taskId;
}

function priorityRank(priority: TaskPriority): number {
  return priority === "urgent" ? 0 : priority === "high" ? 1 : priority === "normal" ? 2 : 3;
}

function emptyStats(): PartyActivityStats {
  return {
    emailInbound: 0,
    emailOutbound: 0,
    phone: 0,
    meeting: 0,
    visit: 0,
    letters: 0,
    manualTotal: 0,
    measureTotal: 0,
    openMeasureTotal: 0
  };
}

function addStats(left: PartyActivityStats, right: PartyActivityStats): PartyActivityStats {
  return {
    emailInbound: left.emailInbound + right.emailInbound,
    emailOutbound: left.emailOutbound + right.emailOutbound,
    phone: left.phone + right.phone,
    meeting: left.meeting + right.meeting,
    visit: left.visit + right.visit,
    letters: left.letters + right.letters,
    manualTotal: left.manualTotal + right.manualTotal,
    measureTotal: left.measureTotal + right.measureTotal,
    openMeasureTotal: left.openMeasureTotal + right.openMeasureTotal
  };
}

function earliestIso(values: Array<string | null | undefined>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length > 0 ? present.sort()[0] : null;
}

function latestIso(values: Array<string | null | undefined>): string | null {
  const present = values.filter((value): value is string => Boolean(value));
  return present.length > 0 ? present.sort().at(-1)! : null;
}

function uniquePositiveIds(ids: number[]): number[] {
  const seen = new Set<number>();
  return ids.flatMap((id) => {
    if (!Number.isInteger(id) || id <= 0 || seen.has(id)) return [];
    seen.add(id);
    return [id];
  });
}

function uniqueStrings(values: string[]): string[] {
  return [...new Set(values)];
}
