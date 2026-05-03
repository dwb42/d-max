import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { createToolRunner } from "../../src/mcp/tool-registry.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("category tools", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("does not expose category emoji editing or emoji data through MCP tools", async () => {
    const runner = createToolRunner();

    const created = await runner.run("createCategory", { name: "Familie" }, { db });
    const listed = await runner.run("listCategories", {}, { db });

    expect(created.ok).toBe(true);
    expect(created).toMatchObject({ ok: true, data: expect.not.objectContaining({ emoji: expect.anything() }) });
    expect(listed.ok).toBe(true);
    if (listed.ok) {
      expect((listed.data as Array<Record<string, unknown>>).every((category) => !("emoji" in category))).toBe(true);
    }
  });
});
