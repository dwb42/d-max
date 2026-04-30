import http from "node:http";
import { env } from "../config/env.js";
import { buildInboundCallTwiml, parseAllowedCallers } from "./twilio.js";

const port = env.dmaxVoicePort;

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/health") {
      sendText(res, 200, "ok");
      return;
    }

    if (req.method === "POST" && req.url === "/voice/twilio/incoming") {
      const form = new URLSearchParams(await readBody(req));
      const twiml = buildInboundCallTwiml(
        {
          from: form.get("From") ?? "",
          to: form.get("To") ?? undefined,
          callSid: form.get("CallSid") ?? undefined
        },
        {
          publicBaseUrl: env.dmaxVoicePublicBaseUrl,
          allowedCallers: parseAllowedCallers(env.dmaxVoiceAllowedCallers)
        }
      );

      sendXml(res, 200, twiml);
      return;
    }

    sendText(res, 404, "not found");
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    sendText(res, 500, message);
  }
});

server.listen(port, () => {
  console.log(`d-max voice server listening on http://localhost:${port}`);
});

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

function sendText(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/plain; charset=utf-8" });
  res.end(body);
}

function sendXml(res: http.ServerResponse, status: number, body: string): void {
  res.writeHead(status, { "content-type": "text/xml; charset=utf-8" });
  res.end(body);
}
