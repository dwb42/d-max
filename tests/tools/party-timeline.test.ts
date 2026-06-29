import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { PersonRepository } from "../../src/repositories/parties.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("party timeline tools", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("creates and lists manual communication entries", async () => {
    const runner = createToolRunner();
    const person = new PersonRepository(db).create({ firstName: "Clara", lastName: "Kontakt" });

    const created = await runner.run("createPartyTimelineEntry", {
      partyId: person.id,
      kind: "conversation",
      occurredAt: "2026-06-27T12:00:00.000Z",
      title: "Telefonat",
      body: "Wir haben den nächsten Termin abgestimmt."
    }, { db });
    const listed = await runner.run("listPartyTimelineEntries", { partyId: person.id }, { db });

    expect(created).toMatchObject({
      ok: true,
      data: expect.objectContaining({ kind: "conversation", direction: "bidirectional", title: "Telefonat" })
    });
    expect(listed).toMatchObject({
      ok: true,
      data: [expect.objectContaining({ title: "Telefonat" })]
    });
  });
});
