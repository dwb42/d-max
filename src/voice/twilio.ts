export type TwilioInboundCall = {
  from: string;
  to?: string;
  callSid?: string;
};

export type TwilioVoiceConfig = {
  publicBaseUrl: string;
  allowedCallers: string[];
};

export function isCallerAllowed(call: TwilioInboundCall, allowedCallers: string[]): boolean {
  if (allowedCallers.length === 0) {
    return false;
  }

  return allowedCallers.includes(normalizePhone(call.from));
}

export function buildRejectedCallTwiml(): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    "  <Reject reason=\"rejected\" />",
    "</Response>"
  ].join("\n");
}

export function buildMediaStreamTwiml(input: {
  publicBaseUrl: string;
  callSid?: string;
  caller?: string;
}): string {
  const streamUrl = `${toWebSocketBaseUrl(input.publicBaseUrl)}/voice/twilio/media`;
  const params = [
    input.callSid ? `      <Parameter name="callSid" value="${escapeXml(input.callSid)}" />` : null,
    input.caller ? `      <Parameter name="caller" value="${escapeXml(input.caller)}" />` : null
  ].filter(Boolean);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<Response>",
    "  <Connect>",
    `    <Stream url="${escapeXml(streamUrl)}">`,
    ...params,
    "    </Stream>",
    "  </Connect>",
    "</Response>"
  ].join("\n");
}

export function buildInboundCallTwiml(call: TwilioInboundCall, config: TwilioVoiceConfig): string {
  if (!isCallerAllowed(call, config.allowedCallers)) {
    return buildRejectedCallTwiml();
  }

  return buildMediaStreamTwiml({
    publicBaseUrl: config.publicBaseUrl,
    callSid: call.callSid,
    caller: call.from
  });
}

export function parseAllowedCallers(raw: string | undefined): string[] {
  return (raw ?? "")
    .split(",")
    .map((value) => normalizePhone(value))
    .filter(Boolean);
}

function normalizePhone(value: string): string {
  return value.trim().replace(/\s+/g, "");
}

function toWebSocketBaseUrl(publicBaseUrl: string): string {
  if (publicBaseUrl.startsWith("https://")) {
    return `wss://${publicBaseUrl.slice("https://".length).replace(/\/+$/, "")}`;
  }

  if (publicBaseUrl.startsWith("http://")) {
    return `ws://${publicBaseUrl.slice("http://".length).replace(/\/+$/, "")}`;
  }

  return publicBaseUrl.replace(/\/+$/, "");
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

