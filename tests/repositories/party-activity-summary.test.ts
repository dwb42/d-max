import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { GmailRepository } from "../../src/gmail/gmail-repository.js";
import { OrganizationRepository, PartyContactPointRepository, PartyRelationshipRepository, PersonRepository, RelationshipTypeRepository } from "../../src/repositories/parties.js";
import { PartyActivitySummaryRepository } from "../../src/repositories/party-activity-summary.js";
import { PartyTimelineRepository } from "../../src/repositories/party-timeline.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("PartyActivitySummaryRepository", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("aggregates Gmail, manual channels, dates, measures, and next action for a party", () => {
    const person = new PersonRepository(db).create({ firstName: "Ada", lastName: "Kontakt" });
    const contacts = new PartyContactPointRepository(db);
    contacts.create({ partyId: person.id, type: "email", value: "ada@example.com" });

    const gmail = new GmailRepository(db);
    const mailbox = gmail.upsertMailbox({ accountLabel: "central@example.com" });
    const matches = gmail.matchesForEmails(["ada@example.com"]);
    gmail.upsertMessage({
      mailboxId: mailbox.id,
      gmailMessageId: "in-1",
      gmailThreadId: null,
      historyId: null,
      labelIds: ["INBOX"],
      direction: "inbound",
      messageDate: "2026-02-10T10:00:00.000Z",
      subject: "Hallo",
      from: [{ name: null, email: "ada@example.com" }],
      to: [{ name: null, email: "central@example.com" }],
      cc: [],
      bcc: [],
      plainBody: null,
      htmlBody: null,
      snippet: null,
      attachments: []
    }, matches);
    gmail.upsertMessage({
      mailboxId: mailbox.id,
      gmailMessageId: "out-1",
      gmailThreadId: null,
      historyId: null,
      labelIds: ["SENT"],
      direction: "outbound",
      messageDate: "2026-03-10T10:00:00.000Z",
      subject: "Antwort",
      from: [{ name: null, email: "central@example.com" }],
      to: [{ name: null, email: "ada@example.com" }],
      cc: [],
      bcc: [],
      plainBody: null,
      htmlBody: null,
      snippet: null,
      attachments: []
    }, matches);

    const timeline = new PartyTimelineRepository(db);
    timeline.create({ partyId: person.id, kind: "conversation", channel: "phone", occurredAt: "2026-01-15T09:00:00.000Z", title: "Telefonat" });
    timeline.create({ partyId: person.id, kind: "conversation", channel: "meeting", occurredAt: "2026-04-15T09:00:00.000Z", title: "Meeting" });

    const tasks = new TaskRepository(db);
    tasks.create({ primaryPartyId: person.id, title: "Später", dueAt: "2026-07-10T10:00:00.000Z", priority: "urgent" });
    const next = tasks.create({ primaryPartyId: person.id, title: "Nächste Maßnahme", dueAt: "2026-07-01T10:00:00.000Z", priority: "normal" });
    tasks.complete(tasks.create({ primaryPartyId: person.id, title: "Erledigt", dueAt: "2026-06-01T10:00:00.000Z" }).id);

    const response = new PartyActivitySummaryRepository(db).listSummaries([person.id]);
    expect(response.summaries).toHaveLength(1);
    expect(response.summaries[0]).toMatchObject({
      partyId: person.id,
      contactSince: "2026-01-15T09:00:00.000Z",
      lastContactAt: "2026-04-15T09:00:00.000Z",
      stats: {
        emailInbound: 1,
        emailOutbound: 1,
        phone: 1,
        meeting: 1,
        manualTotal: 2,
        measureTotal: 3,
        openMeasureTotal: 2
      },
      nextAction: {
        taskId: next.id,
        title: "Nächste Maßnahme"
      }
    });
  });

  it("rolls organization summaries up through active related people", () => {
    const people = new PersonRepository(db);
    const organizations = new OrganizationRepository(db);
    const relationshipTypes = new RelationshipTypeRepository(db);
    const relationships = new PartyRelationshipRepository(db);
    const tasks = new TaskRepository(db);
    const timeline = new PartyTimelineRepository(db);

    const org = organizations.create({ name: "Example GmbH" });
    const activePerson = people.create({ firstName: "Aktive", lastName: "Person" });
    const inactivePerson = people.create({ firstName: "Inaktive", lastName: "Person" });
    const worksFor = relationshipTypes.findByKey("works_for") ?? relationshipTypes.list()[0];
    relationships.create({ fromPartyId: activePerson.id, toPartyId: org.id, relationshipTypeId: worksFor.id, roleLabel: "Kontakt", status: "active" });
    relationships.create({ fromPartyId: inactivePerson.id, toPartyId: org.id, relationshipTypeId: worksFor.id, status: "inactive" });

    timeline.create({ partyId: org.id, kind: "letter_sent", occurredAt: "2026-02-01T10:00:00.000Z", title: "Brief" });
    timeline.create({ partyId: activePerson.id, kind: "conversation", channel: "phone", occurredAt: "2026-03-01T10:00:00.000Z", title: "Telefon" });
    timeline.create({ partyId: inactivePerson.id, kind: "conversation", channel: "meeting", occurredAt: "2026-04-01T10:00:00.000Z", title: "Inaktiv" });
    const next = tasks.create({ primaryPartyId: activePerson.id, title: "Person anrufen", dueAt: "2026-07-01T10:00:00.000Z" });
    tasks.create({ primaryPartyId: org.id, title: "Org später", dueAt: "2026-08-01T10:00:00.000Z" });

    const response = new PartyActivitySummaryRepository(db).listSummaries([org.id], { includeOrganizationPeople: true });

    expect(response.organizationPeople?.[org.id].map((person) => person.partyId)).toEqual([activePerson.id]);
    expect(response.organizationPeople?.[org.id][0]).toMatchObject({
      displayName: "Aktive Person",
      roleLabel: "Kontakt"
    });
    expect(response.summaries[0]).toMatchObject({
      partyId: org.id,
      rollupIncludesPeople: true,
      rollupPartyIds: [activePerson.id],
      stats: {
        phone: 1,
        meeting: 0,
        letters: 1,
        manualTotal: 2,
        measureTotal: 2,
        openMeasureTotal: 2
      },
      nextAction: {
        taskId: next.id,
        title: "Person anrufen"
      }
    });
  });
});
