import { describe, expect, it } from "vitest";
import { analyzeMedia } from "../../src/media/media-analysis.js";

describe("analyzeMedia", () => {
  it("extracts text and a summary from plain text uploads", async () => {
    const result = await analyzeMedia({
      buffer: Buffer.from("# Projektidee\n\nHier steht relevanter Kontext."),
      kind: "document",
      mimeType: "text/markdown",
      originalName: "idee.md"
    });

    expect(result.summary).toBe("Projektidee");
    expect(result.textExcerpt).toContain("Hier steht relevanter Kontext.");
  });

  it("keeps image upload successful without running external provider calls in tests", async () => {
    const result = await analyzeMedia({
      buffer: Buffer.from("fake-image"),
      kind: "image",
      mimeType: "image/png",
      originalName: "bild.png"
    });

    expect(result.summary).toContain("nicht ausgefuehrt");
  });
});
