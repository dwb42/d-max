import http from "node:http";
import { createReadStream, statSync } from "node:fs";
import path from "node:path";

export type StaticWebOptions = {
  webDistDir: string;
};

const mimeTypes: Record<string, string> = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".map": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml; charset=utf-8",
  ".txt": "text/plain; charset=utf-8",
  ".wasm": "application/wasm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2"
};

export function resolveWebDistDir(value: string | undefined): string {
  return path.resolve(value?.trim() || "./dist-web");
}

export function sendStaticWebAsset(
  req: http.IncomingMessage,
  res: http.ServerResponse,
  pathname: string,
  options: StaticWebOptions
): boolean {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return false;
  }

  if (pathname === "/api" || pathname.startsWith("/api/")) {
    return false;
  }

  const webDistDir = path.resolve(options.webDistDir);
  const requestedFile = resolveStaticFilePath(webDistDir, pathname);
  if (requestedFile) {
    sendFile(req, res, requestedFile, cacheControlFor(pathname, requestedFile));
    return true;
  }

  if (pathname.startsWith("/assets/")) {
    res.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache"
    });
    res.end("Not found");
    return true;
  }

  const indexFile = resolveStaticFilePath(webDistDir, "/index.html");
  if (!indexFile) {
    res.writeHead(404, {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "no-cache"
    });
    res.end("Web build not found");
    return true;
  }

  sendFile(req, res, indexFile, "no-cache");
  return true;
}

function resolveStaticFilePath(webDistDir: string, pathname: string): string | null {
  const decodedPathname = decodePathname(pathname);
  if (!decodedPathname) {
    return null;
  }

  const normalizedRelativePath = path.normalize(decodedPathname.replace(/^\/+/, ""));
  if (normalizedRelativePath.startsWith("..") || path.isAbsolute(normalizedRelativePath)) {
    return null;
  }

  const filePath = path.resolve(webDistDir, normalizedRelativePath || "index.html");
  if (!isPathInside(webDistDir, filePath)) {
    return null;
  }

  try {
    const stat = statSync(filePath);
    return stat.isFile() ? filePath : null;
  } catch {
    return null;
  }
}

function decodePathname(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname);
  } catch {
    return null;
  }
}

function isPathInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function cacheControlFor(pathname: string, filePath: string): string {
  if (pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }

  if (path.basename(filePath) === "index.html") {
    return "no-cache";
  }

  return "no-cache";
}

function contentTypeFor(filePath: string): string {
  return mimeTypes[path.extname(filePath).toLowerCase()] ?? "application/octet-stream";
}

function sendFile(req: http.IncomingMessage, res: http.ServerResponse, filePath: string, cacheControl: string): void {
  const stat = statSync(filePath);
  res.writeHead(200, {
    "content-type": contentTypeFor(filePath),
    "content-length": stat.size,
    "cache-control": cacheControl
  });

  if (req.method === "HEAD") {
    res.end();
    return;
  }

  createReadStream(filePath).pipe(res);
}
