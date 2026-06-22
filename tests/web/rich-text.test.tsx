import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { RichText } from "../../web/src/components/ui/RichText.js";

describe("RichText", () => {
  it("renders markdown tables embedded after paragraph text", () => {
    const html = renderToStaticMarkup(
      <RichText
        text={[
          "Wichtige Unterscheidung:",
          "| Vorhanden | Heißt praktisch |",
          "|---|---|",
          "| Wohnhaus | Wohnen kann bestandsgeschützt sein |",
          "| Stall/Scheune | Nutzung genau prüfen |",
          "",
          "Der typische Denkfehler wäre:"
        ].join("\n")}
      />
    );

    expect(html).toContain("<p>Wichtige Unterscheidung:</p>");
    expect(html).toContain("<table");
    expect(html).toContain("<th>Vorhanden</th>");
    expect(html).toContain("<td>Wohnhaus</td>");
    expect(html).toContain("<p>Der typische Denkfehler wäre:</p>");
    expect(html).not.toContain("|---|---|");
  });
});
