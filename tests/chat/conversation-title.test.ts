import { describe, expect, it } from "vitest";
import { deriveConversationTitle } from "../../src/chat/conversation-title.js";

describe("deriveConversationTitle", () => {
  it("creates readable titles from the first user message", () => {
    expect(deriveConversationTitle("bitte suche passende zugverbindungen")).toBe("Passende Zugverbindungen suchen");
    expect(deriveConversationTitle("Fasse mir dieses Projekt zusammen.")).toBe("Kontext zusammenfassen");
    expect(deriveConversationTitle("okay dieses Projekt soll folgenden Inhalt haben Stan rocken Miller Portfolio")).toBe("Stan Druckenmiller folgen");
    expect(deriveConversationTitle("Weiter mit dieser Session.")).toBe("Weiter mit dieser Session");
  });

  it("keeps long generic input compact", () => {
    expect(
      deriveConversationTitle(
        "bitte erstelle aus diesen sehr vielen gedanken ein neues projekt und sortiere die wichtigsten naechsten schritte fuer morgen"
      )
    ).toBe("Erstelle aus diesen sehr vielen gedanken ein neues projekt und sortiere...");
  });
});
