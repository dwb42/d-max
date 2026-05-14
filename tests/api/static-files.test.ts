import http from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { sendStaticWebAsset } from "../../src/api/static-files.js";

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

describe("static web fallback", () => {
  it("serves index.html for /", async () => {
    const { baseUrl, close } = await startStaticTestServer(createWebDist());
    try {
      const response = await fetch(`${baseUrl}/`);
      expect(response.status).toBe(200);
      expect(response.headers.get("content-type")).toContain("text/html");
      expect(response.headers.get("cache-control")).toBe("no-cache");
      expect(await response.text()).toContain("<div id=\"root\"></div>");
    } finally {
      await close();
    }
  });

  it("serves immutable asset files and 404s missing assets", async () => {
    const { baseUrl, close } = await startStaticTestServer(createWebDist());
    try {
      const asset = await fetch(`${baseUrl}/assets/app.js`);
      expect(asset.status).toBe(200);
      expect(asset.headers.get("content-type")).toContain("text/javascript");
      expect(asset.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
      expect(await asset.text()).toBe("console.log('d-max');");

      const missingAsset = await fetch(`${baseUrl}/assets/missing.js`);
      expect(missingAsset.status).toBe(404);
    } finally {
      await close();
    }
  });

  it("falls back unknown non-api routes to index.html and leaves api routes alone", async () => {
    const { baseUrl, close } = await startStaticTestServer(createWebDist());
    try {
      const spaRoute = await fetch(`${baseUrl}/unknown/spa/route`);
      expect(spaRoute.status).toBe(200);
      expect(spaRoute.headers.get("cache-control")).toBe("no-cache");
      expect(await spaRoute.text()).toContain("<div id=\"root\"></div>");

      const apiRoute = await fetch(`${baseUrl}/api/unknown`);
      expect(apiRoute.status).toBe(404);
      expect(apiRoute.headers.get("content-type")).toContain("application/json");
      expect(await apiRoute.json()).toEqual({ error: "Not found" });
    } finally {
      await close();
    }
  });
});

function createWebDist(): string {
  const distDir = mkdtempSync(path.join(os.tmpdir(), "dmax-static-test-"));
  tempDirs.push(distDir);
  mkdirSync(path.join(distDir, "assets"));
  writeFileSync(path.join(distDir, "index.html"), "<!doctype html><div id=\"root\"></div>");
  writeFileSync(path.join(distDir, "assets", "app.js"), "console.log('d-max');");
  return distDir;
}

function startStaticTestServer(webDistDir: string): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", "http://localhost");
    if (sendStaticWebAsset(req, res, url.pathname, { webDistDir })) {
      return;
    }

    res.writeHead(404, { "content-type": "application/json; charset=utf-8" });
    res.end(JSON.stringify({ error: "Not found" }));
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      server.off("error", reject);
      const address = server.address();
      if (!address || typeof address === "string") {
        reject(new Error("Test server did not bind to a TCP port."));
        return;
      }

      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((closeResolve, closeReject) => {
            server.close((error) => {
              if (error) {
                closeReject(error);
                return;
              }
              closeResolve();
            });
          })
      });
    });
  });
}
