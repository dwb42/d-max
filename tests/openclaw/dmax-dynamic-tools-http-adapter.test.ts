import http from "node:http";
import { afterEach, describe, expect, it } from "vitest";

describe("DMAX OpenClaw dynamic tools HTTP adapter", () => {
  let server: http.Server | null = null;

  afterEach(async () => {
    if (!server) {
      return;
    }
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    server = null;
  });

  it("calls the internal dmax-api tool endpoint and returns the tool result envelope", async () => {
    const { executeDmaxTool } = await importHttpAdapter();
    const { url, requests } = await startServer((req, res) => {
      let body = "";
      req.setEncoding("utf8");
      req.on("data", (chunk) => {
        body += chunk;
      });
      req.on("end", () => {
        requests.push({ url: req.url ?? "", authorization: req.headers.authorization ?? "", body });
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify({ ok: true, result: { ok: true, data: [{ id: 1, name: "Inbox" }] } }));
      });
    });

    const result = await executeDmaxTool("d-max__listCategories", {}, { endpointUrl: url, token: "secret", traceId: "trace-1" });

    expect(result.isError).toBe(false);
    expect(JSON.parse(String(result.content[0].text))).toEqual({ ok: true, data: [{ id: 1, name: "Inbox" }] });
    expect(requests[0]).toMatchObject({
      url: "/listCategories",
      authorization: "Bearer secret"
    });
    expect(JSON.parse(String(requests[0].body))).toEqual({ input: {}, traceId: "trace-1" });
  });

  it("maps internal endpoint failures to OpenClaw tool errors", async () => {
    const { executeDmaxTool } = await importHttpAdapter();
    const { url } = await startServer((_req, res) => {
      res.writeHead(401, { "content-type": "application/json" });
      res.end(JSON.stringify({ ok: false, error: "Unauthorized internal tool request." }));
    });

    const result = await executeDmaxTool("d-max__listCategories", {}, { endpointUrl: url, token: "wrong" });

    expect(result.isError).toBe(true);
    expect(JSON.parse(String(result.content[0].text))).toEqual({ ok: false, error: "Unauthorized internal tool request." });
  });

  function startServer(handler: http.RequestListener): Promise<{ url: string; requests: Array<Record<string, unknown>> }> {
    const requests: Array<Record<string, unknown>> = [];
    server = http.createServer(handler);
    return new Promise((resolve) => {
      server?.listen(0, "127.0.0.1", () => {
        const address = server?.address();
        if (!address || typeof address === "string") {
          throw new Error("test server did not bind to a TCP port");
        }
        resolve({ url: `http://127.0.0.1:${address.port}`, requests });
      });
    });
  }

  async function importHttpAdapter(): Promise<{
    executeDmaxTool: (exposedName: string, params: unknown, options?: Record<string, unknown>) => Promise<{ content: Array<{ text: string }>; isError: boolean }>;
  }> {
    // @ts-expect-error The OpenClaw plugin adapter is a runtime .mjs file outside the TS build graph.
    return import("../../openclaw/plugins/dmax-dynamic-tools/http-adapter.mjs");
  }
});
