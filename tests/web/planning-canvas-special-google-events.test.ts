import { describe, expect, it } from "vitest";
import { classifyPlanningCanvasSpecialGoogleEvent } from "../../web/src/planning-canvas-special-google-events.js";
import type { CalendarViewEvent } from "../../web/src/types.js";

describe("planning canvas special Google event rules", () => {
  it("classifies temporary childcare events by normalized title", () => {
    expect(classifyPlanningCanvasSpecialGoogleEvent(googleEvent(" Bianka   hat Kinder "))).toMatchObject({
      kind: "childcare_bianka",
      personLabel: "Bianka"
    });
    expect(classifyPlanningCanvasSpecialGoogleEvent(googleEvent("Urlaub: Kinder bei Bianka"))).toMatchObject({
      kind: "childcare_bianka",
      personLabel: "Bianka"
    });
    expect(classifyPlanningCanvasSpecialGoogleEvent(googleEvent("Dietrich uebernimmt die Kinder"))).toMatchObject({
      kind: "childcare_dietrich",
      personLabel: "Dietrich"
    });
  });

  it("does not classify unrelated Google events", () => {
    expect(classifyPlanningCanvasSpecialGoogleEvent(googleEvent("Ferien"))).toBeNull();
  });
});

function googleEvent(title: string): Extract<CalendarViewEvent, { source: "google" }> {
  return {
    id: `google:${title}`,
    source: "google",
    readOnly: true,
    allDay: true,
    sourceId: 1,
    externalCalendarId: "primary",
    externalEventId: `event-${title}`,
    title,
    startAt: "2026-06-01",
    endAt: "2026-06-02",
    color: null,
    sourceDisplayName: "Google",
    htmlLink: null,
    etag: null,
    updatedAt: null,
    recurring: false,
    recurringEventId: null,
    originalStartAt: null,
    iCalUID: null,
    organizerSelf: true,
    organizer: null,
    attendees: [],
    sourceReadOnly: false,
    editable: true,
    readOnlyReason: null,
    binding: null
  };
}
