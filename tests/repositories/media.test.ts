import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { MediaAssetRepository } from "../../src/repositories/media-assets.js";
import { MediaLinkRepository } from "../../src/repositories/media-links.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("media repositories", () => {
  let db: Database.Database;
  let assets: MediaAssetRepository;
  let links: MediaLinkRepository;
  let initiativeId: number;

  beforeEach(() => {
    db = createTestDatabase();
    assets = new MediaAssetRepository(db);
    links = new MediaLinkRepository(db);
    const category = new CategoryRepository(db).create({ name: "Business" });
    initiativeId = new InitiativeRepository(db).create({
      categoryId: category.id,
      name: "Media Project",
      markdown: "# Overview\n\nCollect source material."
    }).id;
  });

  afterEach(() => {
    db.close();
  });

  it("creates assets and links them to an initiative", () => {
    const asset = assets.create({
      kind: "image",
      mimeType: "image/png",
      originalName: "sketch.png",
      storagePath: "assets/aa/hash/sketch.png",
      sha256: "abc123",
      byteSize: 1234,
      summary: "A sketched interface.",
      textExcerpt: "Buttons and panels."
    });

    const attachment = links.create({
      assetId: asset.id,
      entityType: "initiative",
      entityId: initiativeId,
      caption: "First sketch"
    });

    expect(attachment.asset.originalName).toBe("sketch.png");
    expect(attachment.asset.summary).toBe("A sketched interface.");
    expect(attachment.asset.textExcerpt).toBe("Buttons and panels.");
    expect(attachment.caption).toBe("First sketch");
    expect(links.listForEntity("initiative", initiativeId)).toHaveLength(1);
  });

  it("updates captions and removes links without deleting the asset", () => {
    const asset = assets.create({
      kind: "document",
      mimeType: "application/pdf",
      originalName: "brief.pdf",
      storagePath: "assets/bb/hash/brief.pdf",
      sha256: "def456",
      byteSize: 4567
    });
    const attachment = links.create({ assetId: asset.id, entityType: "initiative", entityId: initiativeId });

    expect(links.update({ id: attachment.id, caption: "Briefing" }).caption).toBe("Briefing");
    expect(links.delete(attachment.id)?.id).toBe(attachment.id);
    expect(links.listForEntity("initiative", initiativeId)).toEqual([]);
    expect(assets.findById(asset.id)?.originalName).toBe("brief.pdf");
  });
});
