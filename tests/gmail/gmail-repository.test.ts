import { afterEach, describe, expect, it } from "vitest";
import { createTestDatabase } from "../helpers/test-db.js";
import { GmailRepository } from "../../src/gmail/gmail-repository.js";
import { OrganizationRepository, PartyContactPointRepository, PersonRepository } from "../../src/repositories/parties.js";

describe("GmailRepository", () => {
  const dbs: Array<{ close: () => void }> = [];

  afterEach(() => {
    for (const db of dbs.splice(0)) {
      db.close();
    }
  });

  it("matches normalized email contact points exactly and supports multiple party links idempotently", () => {
    const db = createTestDatabase();
    dbs.push(db);
    const people = new PersonRepository(db);
    const organizations = new OrganizationRepository(db);
    const contacts = new PartyContactPointRepository(db);
    const gmail = new GmailRepository(db);

    const person = people.create({ firstName: "Ada", lastName: "Lovelace" });
    const org = organizations.create({ name: "Analytical Engines" });
    const unrelated = people.create({ firstName: "Grace", lastName: "Hopper" });
    contacts.create({ partyId: person.id, type: "email", value: "Ada@Example.com" });
    contacts.create({ partyId: org.id, type: "email", value: "ada@example.com" });
    contacts.create({ partyId: unrelated.id, type: "email", value: "other@example.com" });
    const mailbox = gmail.upsertMailbox({ accountLabel: "central@example.com", sendEnabled: true });

    const matches = gmail.matchesForEmails(["ada@example.com"]);
    expect(matches.map((match) => match.partyId).sort((left, right) => left - right)).toEqual([person.id, org.id].sort((left, right) => left - right));

    const input = {
      mailboxId: mailbox.id,
      gmailMessageId: "msg-1",
      gmailThreadId: "thread-1",
      historyId: "10",
      labelIds: ["INBOX"],
      direction: "inbound" as const,
      messageDate: "2026-06-25T10:00:00.000Z",
      subject: "Hello",
      from: [{ name: "Ada", email: "ada@example.com" }],
      to: [{ name: null, email: "central@example.com" }],
      cc: [],
      bcc: [],
      plainBody: "Body",
      htmlBody: null,
      snippet: "Body",
      attachments: []
    };

    const first = gmail.upsertMessage(input, matches);
    const second = gmail.upsertMessage({ ...input, subject: "Hello again" }, matches);

    expect(second.id).toBe(first.id);
    expect(second.subject).toBe("Hello again");
    expect(second.partyLinks).toHaveLength(2);
    expect(gmail.listMessagesForParty(person.id)).toHaveLength(1);
    expect(gmail.listMessagesForParty(org.id)).toHaveLength(1);
    expect(gmail.listMessagesForParty(unrelated.id)).toHaveLength(0);

    gmail.hideMessageForParty(first.id, person.id, "archived");
    expect(gmail.listMessagesForParty(person.id)).toHaveLength(0);
    expect(gmail.listMessagesForParty(org.id)).toHaveLength(1);

    gmail.upsertMessage({ ...input, subject: "Hello after sync" }, matches);
    expect(gmail.listMessagesForParty(person.id)).toHaveLength(0);
    expect(gmail.listMessagesForParty(org.id)).toHaveLength(1);
  });
});
