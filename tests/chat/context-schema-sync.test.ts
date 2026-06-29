import { createHash } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createTestDatabase } from "../helpers/test-db.js";

const CONTEXT_RELEVANT_TABLES = [
  "categories",
  "initiatives",
  "initiative_relations",
  "graph_layout_nodes",
  "graph_node_annotations",
  "mindmap_change_drafts",
  "planning_canvases",
  "planning_canvas_nodes",
  "tasks",
  "task_checklist_items",
  "party_timeline_entries",
  "party_timeline_entry_parties",
  "media_assets",
  "media_links",
  "parties",
  "people",
  "organizations",
  "relationship_types",
  "party_relationships",
  "participant_role_types",
  "entity_participants",
  "party_contact_points",
  "party_addresses",
  "calendar_entries",
  "calendar_sources",
  "calendar_event_bindings",
  "calendar_event_visibility"
];

const EXPECTED_CONTEXT_SCHEMA_SIGNATURE = "2dfcb75c08e76db453e008f5ea95e3afe3922156a2001ff7decf8521e0f752e4";

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
