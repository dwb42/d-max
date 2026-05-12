import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../helpers/test-db.js";

const CONTEXT_RELEVANT_TABLES = [
  "categories",
  "initiatives",
  "initiative_relations",
  "planning_canvases",
  "planning_canvas_nodes",
  "tasks",
  "task_checklist_items",
  "media_assets",
  "media_links",
  "calendar_entries",
  "calendar_sources",
  "calendar_event_bindings"
];

const EXPECTED_CONTEXT_SCHEMA_SIGNATURE = "1326476788adc55205a3528c9ff9b26e0fe05d64af59d9df503c1fa624864c16";

describe("context resolver schema synchronization", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("forces a context resolver inspection when context-relevant schema changes", () => {
    const signature = contextRelevantSchemaSignature(db);

    expect(signature, "Inspect src/chat/conversation-context.ts before updating this schema signature.").toBe(
      EXPECTED_CONTEXT_SCHEMA_SIGNATURE
    );
  });
});

function contextRelevantSchemaSignature(db: Database.Database): string {
  const shape = CONTEXT_RELEVANT_TABLES.map((table) => ({
    table,
    columns: db.prepare(`pragma table_info(${table})`).all(),
    foreignKeys: db.prepare(`pragma foreign_key_list(${table})`).all(),
    indexes: db
      .prepare(`pragma index_list(${table})`)
      .all()
      .map((index) => {
        const name = (index as { name: string }).name;
        return {
          ...(index as Record<string, unknown>),
          columns: db.prepare(`pragma index_info(${name})`).all()
        };
      })
  }));

  return createHash("sha256").update(JSON.stringify(shape)).digest("hex");
}
