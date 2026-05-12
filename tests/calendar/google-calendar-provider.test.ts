import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleCalendarProvider } from "../../src/calendar/google-calendar-provider.js";
import type { GoogleCalendarAuth } from "../../src/calendar/google-calendar-auth.js";
import type { CalendarSource } from "../../src/repositories/calendar-sources.js";

const source: CalendarSource = {
  id: 7,
  provider: "google",
  accountLabel: "dw@b42.io",
  calendarId: "primary",
  displayName: "Primary",
  color: "#5167b8",
  enabled: true,
  readOnly: true,
  createdAt: "2026-05-11T00:00:00.000Z",
  updatedAt: "2026-05-11T00:00:00.000Z"
};

describe("GoogleCalendarProvider", () => {
  afterEach(() => {
    GoogleCalendarProvider.clearEventListCache();
    vi.unstubAllGlobals();
  });

  it("loads paginated events and normalizes all-day exclusive Google end dates", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({
        items: [{
          id: "event-1",
          summary: "Project span",
          htmlLink: "https://calendar.google.com/event?eid=event-1",
          etag: "etag-1",
          updated: "2026-05-10T08:00:00.000Z",
          start: { date: "2026-06-01" },
          end: { date: "2026-06-06" },
          organizer: { self: true }
        }],
        nextPageToken: "next"
      }))
      .mockResolvedValueOnce(jsonResponse({
        items: [{
          id: "event-2",
          summary: "Recurring class",
          recurringEventId: "series-1",
          originalStartTime: { dateTime: "2026-06-02T14:00:00+02:00" },
          start: { dateTime: "2026-06-02T14:00:00+02:00" },
          end: { dateTime: "2026-06-02T15:00:00+02:00" },
          organizer: { self: true }
        }]
      }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoogleCalendarProvider(connectedAuth());
    const result = await provider.listEvents([source], {
      startAt: "2026-06-01T00:00:00.000",
      endAt: "2026-06-07T23:59:59.999"
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(String(fetchMock.mock.calls[0]![0])).toContain("fields=");
    expect(String(fetchMock.mock.calls[1]![0])).toContain("pageToken=next");
    expect(result.warnings).toEqual([]);
    expect(result.events[0]).toMatchObject({
      externalCalendarId: "primary",
      externalEventId: "event-1",
      title: "Project span",
      startAt: "2026-06-01",
      endAt: "2026-06-05",
      allDay: true,
      htmlLink: "https://calendar.google.com/event?eid=event-1",
      etag: "etag-1",
      updatedAt: "2026-05-10T08:00:00.000Z",
      recurring: false,
      editable: false,
      readOnlyReason: "source_read_only"
    });
    expect(result.events[1]).toMatchObject({
      externalEventId: "event-2",
      recurring: true,
      recurringEventId: "series-1",
      readOnlyReason: "recurring_not_supported"
    });
    expect(result.events[1]?.originalStartAt).toBeTruthy();
  });

  it("reuses cached source event lists for repeated range requests", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({
      items: [{
        id: "event-1",
        summary: "Cached event",
        start: { dateTime: "2026-06-02T14:00:00+02:00" },
        end: { dateTime: "2026-06-02T15:00:00+02:00" },
        organizer: { self: true }
      }]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoogleCalendarProvider(connectedAuth());
    const range = {
      startAt: "2026-06-01T00:00:00.000",
      endAt: "2026-06-07T23:59:59.999"
    };

    await provider.listEvents([source], range);
    await provider.listEvents([source], range);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns auth warnings instead of throwing when token refresh fails", async () => {
    const provider = new GoogleCalendarProvider({
      status: () => ({
        configured: true,
        connected: true,
        tokenPath: "/tmp/token.json",
        redirectUri: "http://localhost/callback",
        scope: "https://www.googleapis.com/auth/calendar",
        tokenScope: "https://www.googleapis.com/auth/calendar",
        hasRequiredScope: true,
        detail: null
      }),
      getAccessToken: async () => {
        throw new Error("refresh failed");
      }
    } as unknown as GoogleCalendarAuth);

    const result = await provider.listEvents([source], {
      startAt: "2026-06-01T00:00:00.000",
      endAt: "2026-06-07T23:59:59.999"
    });

    expect(result.events).toEqual([]);
    expect(result.warnings).toEqual([{ scope: "auth", sourceId: source.id, message: "refresh failed" }]);
  });

  it("returns source warnings instead of hanging when Google list requests time out", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("The operation timed out.", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoogleCalendarProvider(connectedAuth());
    const result = await provider.listEvents([source], {
      startAt: "2026-06-01T00:00:00.000",
      endAt: "2026-06-07T23:59:59.999"
    });

    expect(result.events).toEqual([]);
    expect(result.warnings).toEqual([{
      scope: "source",
      sourceId: source.id,
      message: "Google Calendar request timed out after 8000ms"
    }]);
  });

  it("includes invited events from external organizers as read-only events", async () => {
    const writableSource = { ...source, readOnly: false };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      items: [{
        id: "invited-1",
        summary: "Bianka mit Kids im Urlaub",
        updated: "2026-07-10T08:00:00.000Z",
        start: { dateTime: "2026-07-27T08:30:00+02:00" },
          end: { dateTime: "2026-08-05T09:30:00+02:00" },
        organizer: { email: "bianka.pagel13@gmail.com", displayName: "Bianka Pagel", self: false },
        attendees: [
          { email: "bianka.pagel13@gmail.com", displayName: "Bianka Pagel", responseStatus: "accepted", optional: false },
          { email: "dietrich@example.com", displayName: "Dietrich", self: true, responseStatus: "accepted" }
        ]
      }]
    }));
    vi.stubGlobal("fetch", fetchMock);

    const provider = new GoogleCalendarProvider(connectedAuth());
    const result = await provider.listEvents([writableSource], {
      startAt: "2026-07-27T00:00:00.000",
      endAt: "2026-08-05T23:59:59.999"
    });

    expect(result.warnings).toEqual([]);
    expect(result.events).toEqual([
      expect.objectContaining({
        externalEventId: "invited-1",
        title: "Bianka mit Kids im Urlaub",
        startAt: "2026-07-27T08:30:00.000",
        endAt: "2026-08-05T09:30:00.000",
        allDay: false,
        organizerSelf: false,
        organizer: {
          email: "bianka.pagel13@gmail.com",
          displayName: "Bianka Pagel",
          self: false
        },
        attendees: [
          expect.objectContaining({ email: "bianka.pagel13@gmail.com", responseStatus: "accepted" }),
          expect.objectContaining({ email: "dietrich@example.com", self: true, responseStatus: "accepted" })
        ],
        editable: false,
        readOnlyReason: "external_organizer"
      })
    ]);
  });
});

function connectedAuth(): GoogleCalendarAuth {
  return {
    status: () => ({
      configured: true,
      connected: true,
      tokenPath: "/tmp/token.json",
      redirectUri: "http://localhost/callback",
      scope: "https://www.googleapis.com/auth/calendar",
      tokenScope: "https://www.googleapis.com/auth/calendar",
      hasRequiredScope: true,
      detail: null
    }),
    getAccessToken: async () => "access-token"
  } as unknown as GoogleCalendarAuth;
}

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
