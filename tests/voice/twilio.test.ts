import { describe, expect, it } from "vitest";
import { buildInboundCallTwiml, buildMediaStreamTwiml, isCallerAllowed, parseAllowedCallers } from "../../src/voice/twilio.js";

describe("twilio voice helpers", () => {
  it("parses and checks caller allowlist", () => {
    const allowed = parseAllowedCallers("+491234, +49 5678 ");

    expect(allowed).toEqual(["+491234", "+495678"]);
    expect(isCallerAllowed({ from: "+49 5678" }, allowed)).toBe(true);
    expect(isCallerAllowed({ from: "+490000" }, allowed)).toBe(false);
  });

  it("builds media stream TwiML with websocket URL", () => {
    const twiml = buildMediaStreamTwiml({
      publicBaseUrl: "https://voice.example.com/",
      callSid: "CA123",
      caller: "+491234"
    });

    expect(twiml).toContain('<Stream url="wss://voice.example.com/voice/twilio/media">');
    expect(twiml).toContain('<Parameter name="callSid" value="CA123" />');
    expect(twiml).toContain('<Parameter name="caller" value="+491234" />');
  });

  it("rejects inbound calls from unknown callers", () => {
    const twiml = buildInboundCallTwiml(
      { from: "+490000" },
      {
        publicBaseUrl: "https://voice.example.com",
        allowedCallers: ["+491234"]
      }
    );

    expect(twiml).toContain("<Reject");
  });
});

