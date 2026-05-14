import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("party tools", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates people, organizations, relationships, participants, and contact points", async () => {
    const runner = createToolRunner();
    const category = new CategoryRepository(db).create({ name: "Business" });
    const initiative = new InitiativeRepository(db).create({ categoryId: category.id, name: "Outreach" });
    const person = await runner.run("createPerson", { firstName: "Anna", lastName: "Muster", salutation: "mrs" }, { db });
    const organization = await runner.run("createOrganization", { name: "Acme GmbH" }, { db });
    const relationshipTypes = await runner.run("listRelationshipTypes", {}, { db });
    const participantRoles = await runner.run("listParticipantRoleTypes", { appliesToEntityType: "initiative" }, { db });
    const personId = person.ok ? (person.data as { id: number }).id : 0;
    const organizationId = organization.ok ? (organization.data as { id: number }).id : 0;
    const worksForId = relationshipTypes.ok
      ? ((relationshipTypes.data as Array<{ id: number; key: string }>).find((entry) => entry.key === "works_for")?.id ?? 0)
      : 0;
    const stakeholderId = participantRoles.ok
      ? ((participantRoles.data as Array<{ id: number; key: string }>).find((entry) => entry.key === "stakeholder")?.id ?? 0)
      : 0;

    const relationship = await runner.run(
      "createPartyRelationship",
      { fromPartyId: personId, toPartyId: organizationId, relationshipTypeId: worksForId, roleLabel: "CEO" },
      { db }
    );
    const participant = await runner.run(
      "createEntityParticipant",
      { partyId: personId, entityType: "initiative", entityId: initiative.id, roleTypeId: stakeholderId, isPrimary: true },
      { db }
    );
    const contactPoint = await runner.run(
      "createPartyContactPoint",
      { partyId: personId, type: "email", value: "ANNA@EXAMPLE.COM", isPreferred: true, canSend: true },
      { db }
    );

    expect(person).toMatchObject({ ok: true, data: expect.objectContaining({ displayName: "Anna Muster", salutation: "mrs" }) });
    expect(organization).toMatchObject({ ok: true, data: expect.objectContaining({ displayName: "Acme GmbH" }) });
    expect(relationship).toMatchObject({ ok: true, data: expect.objectContaining({ fromPartyId: personId, toPartyId: organizationId }) });
    expect(participant).toMatchObject({
      ok: true,
      data: expect.objectContaining({ entityType: "initiative", entityId: initiative.id, partyId: personId, isPrimary: true })
    });
    expect(contactPoint).toMatchObject({ ok: true, data: expect.objectContaining({ normalizedValue: "anna@example.com" }) });
  });

  it("requires confirmation for deleting party relationships and participants", async () => {
    const runner = createToolRunner();

    expect(await runner.run("deletePartyRelationship", { id: 1, confirmed: true }, { db })).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "deletePartyRelationship"
    });
    expect(await runner.run("deleteEntityParticipant", { id: 1, confirmed: true }, { db })).toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "deleteEntityParticipant"
    });
  });
});
