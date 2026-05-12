import { randomUUID } from "node:crypto";
import type { CalendarSource } from "../repositories/calendar-sources.js";
import { GoogleCalendarAuth } from "./google-calendar-auth.js";

export type ExternalCalendarEvent = {
  id: string;
  externalCalendarId: string;
  externalEventId: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  sourceId: number;
  sourceDisplayName: string;
  htmlLink: string | null;
  etag: string | null;
  updatedAt: string | null;
  recurring: boolean;
  organizerSelf: boolean;
  organizer?: GoogleCalendarPerson | null;
  attendees?: GoogleCalendarAttendee[];
  sourceReadOnly: boolean;
  editable: boolean;
  readOnlyReason: string | null;
  color: string | null;
  readOnly: true;
};

export type GoogleCalendarPerson = {
  email: string | null;
  displayName: string | null;
  self: boolean;
};

export type GoogleCalendarAttendee = GoogleCalendarPerson & {
  responseStatus: string | null;
  optional: boolean;
};

export type GoogleCalendarWarning = {
  scope: "auth" | "source" | "calendar_list" | "sync";
  sourceId: number | null;
  message: string;
};

export type GoogleCalendarEventsResult = {
  events: ExternalCalendarEvent[];
  warnings: GoogleCalendarWarning[];
};

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  backgroundColor: string | null;
  primary: boolean;
  accessRole: string | null;
  readOnly: boolean;
};

export type GoogleCalendarEventCoreInput = {
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  description?: string | null;
};

const googleCalendarEventListCacheTtlMs = 60_000;
const googleCalendarFetchTimeoutMs = 8_000;
const googleCalendarEventListFields = [
  "nextPageToken",
  "items(id,iCalUID,status,summary,htmlLink,etag,updated,start,end,recurringEventId,recurrence,organizer(email,displayName,self),attendees(email,displayName,self,responseStatus,optional),colorId)"
].join(",");
const eventListCache = new Map<string, { expiresAt: number; events: ExternalCalendarEvent[] }>();
const eventListInFlight = new Map<string, Promise<ExternalCalendarEvent[]>>();
let eventListCacheGeneration = 0;

export class GoogleCalendarProvider {
  constructor(private readonly auth = new GoogleCalendarAuth()) {}

  static clearEventListCache(): void {
    eventListCache.clear();
    eventListInFlight.clear();
    eventListCacheGeneration += 1;
  }

  clearEventListCache(): void {
    GoogleCalendarProvider.clearEventListCache();
  }

  async listEvents(sources: CalendarSource[], range: { startAt: string; endAt: string }): Promise<GoogleCalendarEventsResult> {
    const startedAt = Date.now();
    const authStatus = this.auth.status();
    if (sources.length === 0 || !authStatus.configured || !authStatus.connected) {
      console.info("[calendar] google.listEvents skipped", {
        totalMs: Date.now() - startedAt,
        sources: sources.length,
        configured: authStatus.configured,
        connected: authStatus.connected
      });
      return { events: [], warnings: [] };
    }

    const results = await Promise.all(
      sources
        .filter((source) => source.provider === "google" && source.enabled)
        .map(async (source) => {
          const accountAuthStatus = this.auth.status(source.accountLabel);
          const sourceAuthStatus = accountAuthStatus.connected ? accountAuthStatus : this.auth.status();
          const accessToken = await this.auth.getAccessToken(source.accountLabel).catch((error: unknown) => {
            const message = error instanceof Error ? error.message : "Google Calendar access token failed";
            return { error: message };
          });
          if (accessToken && typeof accessToken === "object") {
            return {
              events: [],
              warnings: [{ scope: "auth" as const, sourceId: source.id, message: accessToken.error }]
            };
          }
          if (!accessToken) {
            return {
              events: [],
              warnings: [{ scope: "auth" as const, sourceId: source.id, message: `Google Calendar account is not connected: ${source.accountLabel}` }]
            };
          }
          const sourceStartedAt = Date.now();
          return this.cachedListSourceEvents(source, range, accessToken, sourceAuthStatus.hasRequiredScope).then(
          (events) => {
            console.info("[calendar] google.source", {
              sourceId: source.id,
              accountLabel: source.accountLabel,
              calendarId: source.calendarId,
              totalMs: Date.now() - sourceStartedAt,
              events: events.length
            });
            return { events, warnings: [] as GoogleCalendarWarning[] };
          },
          (error: unknown) => {
            const message = error instanceof Error ? error.message : "Google Calendar source failed";
            console.warn("[calendar] google.source failed", {
              sourceId: source.id,
              accountLabel: source.accountLabel,
              calendarId: source.calendarId,
              totalMs: Date.now() - sourceStartedAt,
              message
            });
            return {
              events: [],
              warnings: [{ scope: "source" as const, sourceId: source.id, message }]
            };
          }
          );
        })
    );
    const result = {
      events: results.flatMap((result) => result.events),
      warnings: results.flatMap((result) => result.warnings)
    };
    console.info("[calendar] google.listEvents", {
      totalMs: Date.now() - startedAt,
      sources: sources.length,
      events: result.events.length,
      warnings: result.warnings.length
    });
    return result;
  }

  prefetchEventRanges(sources: CalendarSource[], ranges: Array<{ startAt: string; endAt: string }>): void {
    for (const range of ranges) {
      void this.listEvents(sources, range).catch((error: unknown) => {
        console.warn("[calendar] google.prefetch failed", {
          range,
          message: error instanceof Error ? error.message : "Google Calendar prefetch failed"
        });
      });
    }
  }

  async listCalendars(accountLabel?: string | null): Promise<GoogleCalendarListItem[]> {
    const authStatus = this.auth.status(accountLabel);
    if (!authStatus.configured || !authStatus.connected) {
      return [];
    }
    const accessToken = await this.auth.getAccessToken(accountLabel, { allowLegacyFallback: !accountLabel?.trim() });
    if (!accessToken) {
      return [];
    }
    const calendars: GoogleCalendarListItem[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://www.googleapis.com/calendar/v3/users/me/calendarList");
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }
      const response = await googleCalendarFetch(url, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const json = await response.json().catch(() => ({})) as GoogleCalendarListResponse;
      if (!response.ok) {
        throw new Error(json.error?.message ?? `Google Calendar calendarList.list failed with ${response.status}`);
      }
      calendars.push(...(json.items ?? []).map((item) => ({
        id: item.id,
        summary: item.summaryOverride || item.summary || item.id,
        backgroundColor: item.backgroundColor ?? null,
        primary: item.primary === true,
        accessRole: item.accessRole ?? null,
        readOnly: item.accessRole !== "owner" && item.accessRole !== "writer"
      })));
      pageToken = json.nextPageToken;
    } while (pageToken);
    return calendars;
  }

  async createEvent(source: CalendarSource, input: GoogleCalendarEventCoreInput): Promise<ExternalCalendarEvent> {
    const accessToken = await this.requireAccessToken(source);
    const response = await googleCalendarFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(toGoogleEventBody(input))
    });
    const json = await response.json().catch(() => ({})) as GoogleEvent & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(json.error?.message ?? `Google Calendar events.insert failed with ${response.status}`);
    }
    this.clearEventListCache();
    const normalized = this.normalizeEvent(source, json);
    if (!normalized) {
      throw new Error("Google Calendar created an event without usable start/end data.");
    }
    return normalized;
  }

  async updateEvent(source: CalendarSource, eventId: string, input: Partial<GoogleCalendarEventCoreInput>): Promise<ExternalCalendarEvent> {
    const accessToken = await this.requireAccessToken(source);
    const response = await googleCalendarFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "PATCH",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify(toGoogleEventBody(input))
    });
    const json = await response.json().catch(() => ({})) as GoogleEvent & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(json.error?.message ?? `Google Calendar events.patch failed with ${response.status}`);
    }
    this.clearEventListCache();
    const normalized = this.normalizeEvent(source, json);
    if (!normalized) {
      throw new Error("Google Calendar updated event did not return usable start/end data.");
    }
    return normalized;
  }

  async getEvent(source: CalendarSource, eventId: string): Promise<ExternalCalendarEvent | null> {
    const accessToken = await this.requireAccessToken(source);
    const response = await googleCalendarFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events/${encodeURIComponent(eventId)}`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (response.status === 404 || response.status === 410) {
      return null;
    }
    const json = await response.json().catch(() => ({})) as GoogleEvent & { error?: { message?: string } };
    if (!response.ok) {
      throw new Error(json.error?.message ?? `Google Calendar events.get failed with ${response.status}`);
    }
    return this.normalizeEvent(source, json);
  }

  async deleteEvent(source: CalendarSource, eventId: string): Promise<void> {
    const accessToken = await this.requireAccessToken(source);
    const response = await googleCalendarFetch(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events/${encodeURIComponent(eventId)}`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    if (!response.ok && response.status !== 410 && response.status !== 404) {
      const json = await response.json().catch(() => ({})) as { error?: { message?: string } };
      throw new Error(json.error?.message ?? `Google Calendar events.delete failed with ${response.status}`);
    }
    this.clearEventListCache();
  }

  private async cachedListSourceEvents(source: CalendarSource, range: { startAt: string; endAt: string }, accessToken: string, oauthCanWrite: boolean): Promise<ExternalCalendarEvent[]> {
    const key = eventListCacheKey(source, range, oauthCanWrite);
    const cached = eventListCache.get(key);
    if (cached && cached.expiresAt > Date.now()) {
      console.info("[calendar] google.source cache_hit", {
        sourceId: source.id,
        calendarId: source.calendarId,
        events: cached.events.length
      });
      return cached.events;
    }

    const inFlight = eventListInFlight.get(key);
    if (inFlight) {
      console.info("[calendar] google.source cache_join", {
        sourceId: source.id,
        calendarId: source.calendarId
      });
      return inFlight;
    }

    const generation = eventListCacheGeneration;
    const promise = this.listSourceEvents(source, range, accessToken, oauthCanWrite)
      .then((events) => {
        if (generation === eventListCacheGeneration) {
          eventListCache.set(key, { expiresAt: Date.now() + googleCalendarEventListCacheTtlMs, events });
        }
        return events;
      })
      .finally(() => {
        eventListInFlight.delete(key);
      });
    eventListInFlight.set(key, promise);
    return promise;
  }

  private async listSourceEvents(source: CalendarSource, range: { startAt: string; endAt: string }, accessToken: string, oauthCanWrite: boolean): Promise<ExternalCalendarEvent[]> {
    const events: ExternalCalendarEvent[] = [];
    let pageToken: string | undefined;
    let pages = 0;
    do {
      pages += 1;
      const pageStartedAt = Date.now();
      const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events`);
      url.searchParams.set("timeMin", toRfc3339(range.startAt));
      url.searchParams.set("timeMax", toRfc3339(range.endAt));
      url.searchParams.set("singleEvents", "true");
      url.searchParams.set("orderBy", "startTime");
      url.searchParams.set("maxResults", "2500");
      url.searchParams.set("fields", googleCalendarEventListFields);
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }

      const response = await googleCalendarFetch(url, {
        headers: { authorization: `Bearer ${accessToken}` }
      });
      const json = await response.json().catch(() => ({})) as GoogleEventsListResponse;
      if (!response.ok) {
        throw new Error(json.error?.message ?? `Google Calendar events.list failed with ${response.status}`);
      }

      const pageItems = json.items ?? [];
      events.push(...pageItems.flatMap((event): ExternalCalendarEvent[] => {
        const normalized = this.normalizeEvent(source, event, oauthCanWrite);
        return normalized ? [normalized] : [];
      }));
      console.info("[calendar] google.source.page", {
        sourceId: source.id,
        calendarId: source.calendarId,
        page: pages,
        totalMs: Date.now() - pageStartedAt,
        rawItems: pageItems.length,
        accumulatedEvents: events.length,
        hasNextPage: Boolean(json.nextPageToken)
      });
      pageToken = json.nextPageToken;
    } while (pageToken);
    return events;
  }

  private normalizeEvent(source: CalendarSource, event: GoogleEvent, oauthCanWrite = this.auth.status().hasRequiredScope): ExternalCalendarEvent | null {
    if (event.status === "cancelled") {
      return null;
    }
    const start = event.start;
    const end = event.end;
    if (!start || !end) {
      return null;
    }
    const eventId = event.id ?? event.iCalUID ?? randomUUID();
    const allDay = Boolean(start.date && end.date);
    const recurring = Boolean(event.recurringEventId || event.recurrence?.length);
    const organizerSelf = event.organizer?.self === true;
    const organizer = normalizeGooglePerson(event.organizer ?? null);
    const readOnlyReason = googleReadOnlyReason({ source, recurring, organizerSelf, oauthCanWrite });
    return {
      id: eventId,
      externalCalendarId: source.calendarId,
      externalEventId: eventId,
      title: event.summary || "(Ohne Titel)",
      startAt: allDay ? start.date! : toLocalDateTime(start.dateTime!),
      endAt: allDay ? previousDate(end.date!) : toLocalDateTime(end.dateTime!),
      allDay,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: event.htmlLink ?? null,
      etag: event.etag ?? null,
      updatedAt: event.updated ?? null,
      recurring,
      organizerSelf,
      organizer,
      attendees: (event.attendees ?? []).map(normalizeGoogleAttendee),
      sourceReadOnly: source.readOnly,
      editable: readOnlyReason === null,
      readOnlyReason,
      color: source.color,
      readOnly: true
    };
  }

  private async requireAccessToken(source: CalendarSource): Promise<string> {
    const accountAuthStatus = this.auth.status(source.accountLabel);
    const authStatus = accountAuthStatus.connected ? accountAuthStatus : this.auth.status();
    if (!authStatus.configured || !authStatus.connected) {
      throw new Error("Google Calendar is not connected.");
    }
    if (!authStatus.hasRequiredScope) {
      throw new Error("Google Calendar write scope is missing. Disconnect and reconnect Google Calendar in /config.");
    }
    const accessToken = await this.auth.getAccessToken(source.accountLabel);
    if (!accessToken) {
      throw new Error("Google Calendar access token is unavailable.");
    }
    return accessToken;
  }
}

type GoogleEventsListResponse = {
  items?: GoogleEvent[];
  nextPageToken?: string;
  error?: { message?: string };
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    summaryOverride?: string;
    backgroundColor?: string;
    primary?: boolean;
    accessRole?: string;
  }>;
  nextPageToken?: string;
  error?: { message?: string };
};

type GoogleEvent = {
  id?: string;
  iCalUID?: string;
  etag?: string;
  summary?: string;
  htmlLink?: string;
  updated?: string;
  status?: string;
  recurringEventId?: string;
  recurrence?: string[];
  organizer?: { email?: string; displayName?: string; self?: boolean };
  attendees?: Array<{ email?: string; displayName?: string; self?: boolean; responseStatus?: string; optional?: boolean }>;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

function normalizeGooglePerson(person: { email?: string; displayName?: string; self?: boolean } | null): GoogleCalendarPerson | null {
  if (!person) {
    return null;
  }
  return {
    email: person.email ?? null,
    displayName: person.displayName ?? null,
    self: person.self === true
  };
}

function normalizeGoogleAttendee(attendee: { email?: string; displayName?: string; self?: boolean; responseStatus?: string; optional?: boolean }): GoogleCalendarAttendee {
  return {
    email: attendee.email ?? null,
    displayName: attendee.displayName ?? null,
    self: attendee.self === true,
    responseStatus: attendee.responseStatus ?? null,
    optional: attendee.optional === true
  };
}

async function googleCalendarFetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
  try {
    return await fetch(input, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(googleCalendarFetchTimeoutMs)
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "TimeoutError") {
      throw new Error(`Google Calendar request timed out after ${googleCalendarFetchTimeoutMs}ms`);
    }
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Google Calendar request was aborted after ${googleCalendarFetchTimeoutMs}ms`);
    }
    throw error;
  }
}

function googleReadOnlyReason(input: { source: CalendarSource; recurring: boolean; organizerSelf: boolean; oauthCanWrite: boolean }): string | null {
  if (input.recurring) {
    return "recurring_not_supported";
  }
  if (!input.oauthCanWrite) {
    return "oauth_scope_missing";
  }
  if (input.source.readOnly) {
    return "source_read_only";
  }
  if (!input.organizerSelf) {
    return "external_organizer";
  }
  return null;
}

function toGoogleEventBody(input: Partial<GoogleCalendarEventCoreInput>): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  if (input.title !== undefined) {
    body.summary = input.title;
  }
  if (input.description !== undefined) {
    body.description = input.description ?? "";
  }
  if (input.startAt !== undefined || input.endAt !== undefined || input.allDay !== undefined) {
    if (input.startAt === undefined || input.endAt === undefined || input.allDay === undefined) {
      throw new Error("Google event startAt, endAt, and allDay must be provided together.");
    }
    if (input.allDay) {
      body.start = { date: input.startAt };
      body.end = { date: nextDate(input.endAt) };
    } else {
      body.start = { dateTime: toRfc3339(input.startAt) };
      body.end = { dateTime: toRfc3339(input.endAt) };
    }
  }
  return body;
}

function eventListCacheKey(source: CalendarSource, range: { startAt: string; endAt: string }, oauthCanWrite: boolean): string {
  return [
    source.id,
    source.accountLabel,
    source.calendarId,
    source.displayName,
    source.color ?? "",
    source.readOnly ? "readonly" : "writable",
    oauthCanWrite ? "write-scope" : "read-scope",
    range.startAt,
    range.endAt
  ].join("\n");
}

function toRfc3339(value: string): string {
  return new Date(value).toISOString();
}

function toLocalDateTime(value: string): string {
  const date = new Date(value);
  return `${dateOnlyLocal(date)}T${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}:00.000`;
}

function previousDate(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, (day || 1) - 1));
  return date.toISOString().slice(0, 10);
}

function nextDate(dateOnly: string): string {
  const [year, month, day] = dateOnly.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, (day || 1) + 1));
  return date.toISOString().slice(0, 10);
}

function dateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
