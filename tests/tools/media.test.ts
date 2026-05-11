import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { ToolRunner } from "../../src/core/tool-runner.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { MediaAssetRepository } from "../../src/repositories/media-assets.js";
import { mediaTools } from "../../src/tools/media.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("media tools", () => {
  let db: Database.Database;
  let runner: ToolRunner;
  let initiativeId: number;
  let assetId: number;

  beforeEach(() => {
    db = createTestDatabase();
    runner = new ToolRunner();
    for (const tool of mediaTools) {
      runner.register(tool);
    }
    const category = new CategoryRepository(db).create({ name: "Business" });
    initiativeId = new InitiativeRepository(db).create({ categoryId: category.id, name: "Media Project" }).id;
    assetId = new MediaAssetRepository(db).create({
      kind: "image",
      mimeType: "image/png",
      originalName: "board.png",
      storagePath: "assets/dd/hash/board.png",
      sha256: "dd123",
      byteSize: 1000
    }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("attaches and lists existing media assets", async () => {
    const attached = await runner.run(
      "attachMediaToEntity",
      { assetId, entityType: "initiative", entityId: initiativeId, caption: "Board" },
      { db }
    );

    expect(attached).toMatchObject({
      ok: true,
      data: {
        entityType: "initiative",
        entityId: initiativeId,
        caption: "Board",
        asset: {
          originalName: "board.png"
        }
      }
    });

    const listed = await runner.run("listMediaAttachments", { entityType: "initiative", entityId: initiativeId }, { db });

    expect(listed).toMatchObject({
      ok: true,
      data: [
        {
          caption: "Board",
          asset: {
            mimeType: "image/png"
          }
        }
      ]
    });
  });

  it("requires confirmation before deleting a media attachment through tools", async () => {
    const attached = await runner.run("attachMediaToEntity", { assetId, entityType: "initiative", entityId: initiativeId }, { db });
    const id = (attached as { ok: true; data: { id: number } }).data.id;

    await expect(runner.run("deleteMediaAttachment", { id }, { db })).resolves.toMatchObject({
      ok: false,
      requiresConfirmation: true,
      confirmationKind: "deleteMediaAttachment"
    });
  });
});
