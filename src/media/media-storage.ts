import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { MediaKind } from "../repositories/media-assets.js";

export type StoredMediaFile = {
  kind: MediaKind;
  mimeType: string;
  originalName: string;
  storagePath: string;
  sha256: string;
  byteSize: number;
};

const allowedMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/gif",
  "audio/webm",
  "audio/mpeg",
  "audio/mp4",
  "audio/ogg",
  "audio/wav",
  "video/mp4",
  "video/webm",
  "video/quicktime",
  "application/pdf",
  "text/plain",
  "text/markdown",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation"
]);

export class MediaStorage {
  constructor(private readonly rootDir: string) {}

  store(input: { buffer: Buffer; mimeType: string; originalName?: string | null }): StoredMediaFile {
    if (input.buffer.length === 0) {
      throw new Error("Uploaded media file is empty");
    }

    const mimeType = normalizeMimeType(input.mimeType);
    if (!allowedMimeTypes.has(mimeType)) {
      throw new Error(`Unsupported media type: ${mimeType}`);
    }

    const originalName = normalizeOriginalName(input.originalName, mimeType);
    const sha256 = createHash("sha256").update(input.buffer).digest("hex");
    const extension = safeExtension(originalName) || extensionForMimeType(mimeType);
    const baseName = stripExtension(originalName).slice(0, 80) || "upload";
    const relativePath = path.posix.join("assets", sha256.slice(0, 2), sha256, `${baseName}${extension}`);
    const absolutePath = this.absolutePath(relativePath);

    fs.mkdirSync(path.dirname(absolutePath), { recursive: true });
    if (!fs.existsSync(absolutePath)) {
      const tempPath = `${absolutePath}.${process.pid}.${Date.now()}.tmp`;
      fs.writeFileSync(tempPath, input.buffer, { mode: 0o600 });
      fs.renameSync(tempPath, absolutePath);
    }

    return {
      kind: mediaKindForMimeType(mimeType),
      mimeType,
      originalName,
      storagePath: relativePath,
      sha256,
      byteSize: input.buffer.length
    };
  }

  absolutePath(storagePath: string): string {
    const normalized = path.normalize(storagePath);
    if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
      throw new Error("Invalid media storage path");
    }
    return path.join(this.rootDir, normalized);
  }
}

export function mediaKindForMimeType(mimeType: string): MediaKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType.startsWith("video/")) return "video";
  if (
    mimeType === "application/pdf" ||
    mimeType === "text/plain" ||
    mimeType === "text/markdown" ||
    mimeType.includes("word") ||
    mimeType.includes("excel") ||
    mimeType.includes("powerpoint") ||
    mimeType.includes("spreadsheet") ||
    mimeType.includes("presentation")
  ) {
    return "document";
  }
  return "other";
}

function normalizeMimeType(mimeType: string): string {
  return mimeType.split(";")[0]?.trim().toLowerCase() || "application/octet-stream";
}

function normalizeOriginalName(name: string | null | undefined, mimeType: string): string {
  const fallback = `upload${extensionForMimeType(mimeType)}`;
  const cleaned = (name ?? fallback)
    .trim()
    .replace(/[/\\]/g, "-")
    .replace(/[^\w .()+-]/g, "-")
    .replace(/\s+/g, " ")
    .slice(0, 160);
  return cleaned || fallback;
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return ".jpg";
  if (mimeType === "image/png") return ".png";
  if (mimeType === "image/webp") return ".webp";
  if (mimeType === "image/gif") return ".gif";
  if (mimeType === "audio/webm") return ".webm";
  if (mimeType === "audio/mpeg") return ".mp3";
  if (mimeType === "audio/mp4") return ".m4a";
  if (mimeType === "audio/ogg") return ".ogg";
  if (mimeType === "audio/wav") return ".wav";
  if (mimeType === "video/mp4") return ".mp4";
  if (mimeType === "video/webm") return ".webm";
  if (mimeType === "video/quicktime") return ".mov";
  if (mimeType === "application/pdf") return ".pdf";
  if (mimeType === "text/markdown") return ".md";
  if (mimeType === "text/plain") return ".txt";
  return ".bin";
}

function safeExtension(name: string): string {
  const extension = path.extname(name).toLowerCase();
  return extension && /^[a-z0-9.]+$/.test(extension) ? extension : "";
}

function stripExtension(name: string): string {
  const extension = path.extname(name);
  const base = extension ? name.slice(0, -extension.length) : name;
  return base
    .trim()
    .replace(/[^\w .()+-]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[.-]+|[.-]+$/g, "");
}
