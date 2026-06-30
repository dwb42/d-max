import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { PartyTimelineRepository } from "../../src/repositories/party-timeline.js";
import { PersonRepository } from "../../src/repositories/parties.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("party communication model", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("allows tasks to use a primary party without an initiative", () => {
    const person = new PersonRepository(db).create({ firstName: "Anna", lastName: "Kontakt" });
    const tasks = new TaskRepository(db);

    const task = tasks.create({
      primaryPartyId: person.id,
      title: "Anna wegen Angebot anrufen",
      dueAt: "2026-07-03"
    });

    expect(task).toMatchObject({
      initiativeId: null,
      primaryPartyId: person.id,
      title: "Anna wegen Angebot anrufen",
      status: "open"
    });
    expect(tasks.list({ primaryPartyId: person.id }).map((entry) => entry.id)).toEqual([task.id]);
  });

  it("stores manual communication entries as party timeline history", () => {
    const person = new PersonRepository(db).create({ firstName: "Ben", lastName: "Brief" });
    const task = new TaskRepository(db).create({ primaryPartyId: person.id, title: "Antwort vorbereiten" });
    const timeline = new PartyTimelineRepository(db);

    const entry = timeline.create({
      partyId: person.id,
      kind: "letter_received",
      occurredAt: "2026-06-27T10:30:00.000Z",
      title: "Brief erhalten",
      body: "Unterlagen sind angekommen.",
      relatedTaskId: task.id
    });

    expect(entry).toMatchObject({
      kind: "letter_received",
      channel: "letter",
      direction: "inbound",
      relatedTaskId: task.id,
      parties: [expect.objectContaining({ partyId: person.id, role: "primary" })]
    });
    expect(timeline.listForParty(person.id)).toEqual([entry]);
  });
});
