import http from "node:http";
import { createReadStream, statSync } from "node:fs";

import { env } from "../config/env.js";
import { createChatTurnTraceId } from "../diagnostics/chat-turns.js";

export function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function sendHtmlRedirect(res: http.ServerResponse, path: string): void {
  const target = new URL(path, env.dmaxWebBaseUrl).toString();
  res.writeHead(302, {
    location: target,
    "content-type": "text/html; charset=utf-8"
  });
  res.end(`<!doctype html><meta http-equiv="refresh" content="0;url=${escapeHtml(target)}"><a href="${escapeHtml(target)}">Return to DMAX</a>`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

export function getRequestTraceId(req: http.IncomingMessage): string {
  const header = req.headers["x-dmax-trace-id"];
  if (typeof header === "string" && header.trim()) {
    return header.trim().slice(0, 120);
  }

  return createChatTurnTraceId();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

export function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

export function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const body = await readBody(req);
  return body ? JSON.parse(body) : {};
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

export function readBuffer(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

export function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:5173",
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-dmax-trace-id,x-file-name",
    "access-control-expose-headers": "x-dmax-trace-id"
  });
  res.end(JSON.stringify(body));
}

export function sendMediaFile(res: http.ServerResponse, mimeType: string, filePath: string): void {
  const stat = statSync(filePath);
  res.writeHead(200, {
    "content-type": mimeType,
    "content-length": stat.size,
    "cache-control": "private, max-age=3600",
    "access-control-allow-origin": "http://localhost:5173"
  });
  createReadStream(filePath).pipe(res);
}
