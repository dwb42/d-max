import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CalendarEntryRepository } from "../../src/repositories/calendar-entries.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import {
  EntityParticipantRepository,
  OrganizationRepository,
  ParticipantRoleTypeRepository,
  PartyAddressRepository,
  PartyContactPointRepository,
  PartyRelationshipRepository,
  PersonRepository,
  RelationshipTypeRepository
} from "../../src/repositories/parties.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("party repositories", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates people and organizations with party identity", () => {
    const people = new PersonRepository(db);
    const organizations = new OrganizationRepository(db);

    const person = people.create({
      firstName: "Dietrich",
      lastName: "Weger",
      salutation: "mr",
      academicTitle: "Dr.",
      description: "Kontakt fuer DMAX."
    });
    const organization = organizations.create({ name: "DMAX Labs", organizationType: "company", markdown: "## Context" });

    expect(person).toMatchObject({
      type: "person",
      salutation: "mr",
      firstName: "Dietrich",
      lastName: "Weger",
      description: "Kontakt fuer DMAX."
    });
    expect(people.update({ id: person.id, description: "" }).description).toBeNull();
    expect(organization).toMatchObject({ type: "organization", displayName: "DMAX Labs", name: "DMAX Labs", markdown: "## Context" });
    expect(people.list().map((entry) => entry.id)).toContain(person.id);
    expect(organizations.list().map((entry) => entry.id)).toContain(organization.id);
  });

  it("stores directed and symmetric relationships", () => {
    const people = new PersonRepository(db);
    const organizations = new OrganizationRepository(db);
    const relationshipTypes = new RelationshipTypeRepository(db);
    const relationships = new PartyRelationshipRepository(db);
    const person = people.create({ firstName: "Anna", lastName: "Muster", salutation: "mrs" });
    const organization = organizations.create({ name: "Acme GmbH" });
    const other = people.create({ firstName: "Bernd", lastName: "Beispiel" });
    const worksFor = relationshipTypes.findByKey("works_for")!;
    const knows = relationshipTypes.findByKey("knows")!;

    const employment = relationships.create({
      fromPartyId: person.id,
      toPartyId: organization.id,
      relationshipTypeId: worksFor.id,
      roleLabel: "CEO",
      startedOn: "2024-01-01"
    });
    const symmetric = relationships.create({ fromPartyId: other.id, toPartyId: person.id, relationshipTypeId: knows.id });
    const duplicateSymmetric = relationships.create({ fromPartyId: person.id, toPartyId: other.id, relationshipTypeId: knows.id });

    expect(employment).toMatchObject({
      fromPartyId: person.id,
      toPartyId: organization.id,
      relationshipType: expect.objectContaining({ key: "works_for", directionality: "directed" })
    });
    expect(symmetric.fromPartyId).toBe(Math.min(person.id, other.id));
    expect(symmetric.toPartyId).toBe(Math.max(person.id, other.id));
    expect(duplicateSymmetric.id).toBe(symmetric.id);
    expect(relationships.list({ partyId: person.id })).toHaveLength(2);
    expect(() => relationships.create({ fromPartyId: person.id, toPartyId: person.id, relationshipTypeId: knows.id })).toThrow("itself");
  });

  it("validates polymorphic entity participants", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, name: "CRM foundation" });
    const task = new TaskRepository(db).create({ initiativeId: initiative.id, title: "Call lead" });
    const calendarEntry = new CalendarEntryRepository(db).create({
      type: "task_work",
      title: "Lead call",
      startAt: "2026-05-13T10:00:00.000Z",
      endAt: "2026-05-13T10:30:00.000Z",
      taskId: task.id
    });
    const person = new PersonRepository(db).create({ firstName: "Clara", lastName: "Kontakt" });
    const roleTypes = new ParticipantRoleTypeRepository(db);
    const participants = new EntityParticipantRepository(db);
    const stakeholder = roleTypes.findByKey("stakeholder")!;
    const accountability = roleTypes.findByKey("accountability_partner")!;

    const projectParticipant = participants.create({
      partyId: person.id,
      entityType: "initiative",
      entityId: initiative.id,
      roleTypeId: stakeholder.id,
      isPrimary: true
    });
    const duplicate = participants.create({
      partyId: person.id,
      entityType: "initiative",
      entityId: initiative.id,
      roleTypeId: stakeholder.id,
      isPrimary: true
    });
    const taskParticipant = participants.create({ partyId: person.id, entityType: "task", entityId: task.id, roleLabel: "Lead" });
    const meetingParticipant = participants.create({ partyId: person.id, entityType: "calendar_entry", entityId: calendarEntry.id });

    expect(projectParticipant).toMatchObject({
      partyId: person.id,
      entityType: "initiative",
      roleType: expect.objectContaining({ key: "stakeholder" }),
      party: expect.objectContaining({ displayName: "Clara Kontakt" }),
      isPrimary: true
    });
    expect(duplicate.id).toBe(projectParticipant.id);
    expect(taskParticipant.entityType).toBe("task");
    expect(meetingParticipant.entityType).toBe("calendar_entry");
    expect(() => participants.create({ partyId: person.id, entityType: "initiative", entityId: 999, roleTypeId: stakeholder.id })).toThrow("initiative not found");
    expect(() => participants.create({ partyId: person.id, entityType: "task", entityId: task.id, roleTypeId: accountability.id })).toThrow(
      "does not apply to task"
    );
  });

  it("includes contact points and active party relationships on entity participants", () => {
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, name: "Partner outreach" });
    const people = new PersonRepository(db);
    const organizations = new OrganizationRepository(db);
    const relationships = new PartyRelationshipRepository(db);
    const relationshipTypes = new RelationshipTypeRepository(db);
    const contactPoints = new PartyContactPointRepository(db);
    const participants = new EntityParticipantRepository(db);
    const person = people.create({ firstName: "Ewa", lastName: "Okolski" });
    const organization = organizations.create({ name: "Kulturland" });
    const worksFor = relationshipTypes.findByKey("works_for")!;

    contactPoints.create({ partyId: person.id, type: "email", value: "ewa@example.org", isPrimary: true, isPreferred: true });
    relationships.create({ fromPartyId: person.id, toPartyId: organization.id, relationshipTypeId: worksFor.id });
    participants.create({ partyId: person.id, entityType: "initiative", entityId: initiative.id, roleLabel: "Kontaktperson" });

    const [participant] = participants.list({ entityType: "initiative", entityId: initiative.id });

    expect(participant.contactPoints).toEqual([
      expect.objectContaining({ type: "email", value: "ewa@example.org", isPrimary: true, isPreferred: true })
    ]);
    expect(participant.relationships).toEqual([
      expect.objectContaining({
        fromPartyId: person.id,
        toPartyId: organization.id,
        relationshipType: expect.objectContaining({ key: "works_for" }),
        toParty: expect.objectContaining({ displayName: "Kulturland" })
      })
    ]);
  });

  it("stores contact points and postal addresses", () => {
    const person = new PersonRepository(db).create({ firstName: "Dietrich", lastName: "Weger", salutation: "mr" });
    const contactPoints = new PartyContactPointRepository(db);
    const addresses = new PartyAddressRepository(db);

    const email = contactPoints.create({
      partyId: person.id,
      type: "email",
      value: " Dietrich@example.COM ",
      label: "business",
      isPreferred: true,
      canSend: true,
      canReceive: true,
      provider: "gmail"
    });
    const address = addresses.create({
      partyId: person.id,
      label: "office",
      line1: "Main Street 1",
      postalCode: "20354",
      city: "Hamburg",
      country: "DE",
      isPrimary: true
    });

    expect(email.normalizedValue).toBe("dietrich@example.com");
    expect(contactPoints.list({ partyId: person.id })).toHaveLength(1);
    expect(address).toMatchObject({ city: "Hamburg", isPrimary: true });
    expect(addresses.list({ partyId: person.id })).toHaveLength(1);
  });
});
