import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { MediaStorage } from "../../src/media/media-storage.js";

describe("MediaStorage", () => {
  it("stores an allowed file under a hash-derived path", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d-max-media-test-"));
    const storage = new MediaStorage(dir);

    const stored = storage.store({
      buffer: Buffer.from("hello"),
      mimeType: "text/plain; charset=utf-8",
      originalName: "note.txt"
    });

    expect(stored.kind).toBe("document");
    expect(stored.mimeType).toBe("text/plain");
    expect(stored.storagePath).toMatch(/^assets\//);
    expect(fs.existsSync(storage.absolutePath(stored.storagePath))).toBe(true);
  });

  it("rejects unsupported media types", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "d-max-media-test-"));
    const storage = new MediaStorage(dir);

    expect(() =>
      storage.store({
        buffer: Buffer.from("nope"),
        mimeType: "application/x-sh",
        originalName: "script.sh"
      })
    ).toThrow(/Unsupported media type/);
  });
});
