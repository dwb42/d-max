import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { LeadRepository, LeadStatusRepository } from "../../src/repositories/leads.js";
import { OrganizationRepository, PartyContactPointRepository, PartyRelationshipRepository, PersonRepository, RelationshipTypeRepository } from "../../src/repositories/parties.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("LeadRepository", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates, lists, updates status, and deletes only the lead connection", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, name: "Outreach" });
    const task = new TaskRepository(db).create({ initiativeId: initiative.id, title: "Call lead" });
    const person = new PersonRepository(db).create({ firstName: "Clara", lastName: "Kontakt" });
    const organization = new OrganizationRepository(db).create({ name: "Acme GmbH" });
    const worksFor = new RelationshipTypeRepository(db).findByKey("works_for")!;
    new PartyContactPointRepository(db).create({ partyId: person.id, type: "email", value: "clara@example.com", isPreferred: true });
    new PartyRelationshipRepository(db).create({ fromPartyId: person.id, toPartyId: organization.id, relationshipTypeId: worksFor.id });
    const statuses = new LeadStatusRepository(db).listStatuses();
    const fresh = statuses.find((status) => status.key === "fresh")!;
    const contacted = statuses.find((status) => status.key === "contacted")!;
    const leads = new LeadRepository(db);

    const initiativeLead = leads.create({ partyId: person.id, initiativeId: initiative.id, roleLabel: "Legacy label" });
    const duplicate = leads.create({ partyId: person.id, initiativeId: initiative.id });
    const taskLead = leads.create({ partyId: person.id, taskId: task.id, statusId: contacted.id });

    expect(initiativeLead.status).toMatchObject({ id: fresh.id, key: "fresh" });
    expect(initiativeLead.roleLabel).toBe("Legacy label");
    expect(duplicate.id).toBe(initiativeLead.id);
    expect(taskLead.status.key).toBe("contacted");
    expect(leads.list({ partyId: person.id })).toHaveLength(2);
    expect(leads.list({ initiativeId: initiative.id })[0]).toMatchObject({
      party: expect.objectContaining({ displayName: "Clara Kontakt" }),
      contactPoints: [expect.objectContaining({ value: "clara@example.com" })],
      relationships: [expect.objectContaining({ toPartyId: organization.id })]
    });

    expect(leads.updateStatus(initiativeLead.id, contacted.id).status.key).toBe("contacted");
    expect(leads.delete(initiativeLead.id)).toMatchObject({ id: initiativeLead.id, partyId: person.id, initiativeId: initiative.id });
    expect(new PersonRepository(db).findById(person.id)).not.toBeNull();
    expect(new InitiativeRepository(db).findById(initiative.id)).not.toBeNull();
    expect(leads.findById(initiativeLead.id)).toBeNull();
  });

  it("validates target and status inputs", () => {
    const person = new PersonRepository(db).create({ firstName: "Ada", lastName: "Lead" });
    const leads = new LeadRepository(db);

    expect(() => leads.create({ partyId: person.id })).toThrow("exactly one");
    expect(() => leads.create({ partyId: person.id, initiativeId: 1, taskId: 1 })).toThrow("exactly one");
    expect(() => leads.create({ partyId: person.id, initiativeId: 999 })).toThrow("Initiative not found");
    expect(() => leads.create({ partyId: person.id, taskId: 999 })).toThrow("Task not found");
    expect(() => leads.create({ partyId: person.id, taskId: 999, statusId: 999 })).toThrow("Task not found");
  });
});
