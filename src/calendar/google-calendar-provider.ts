import { randomUUID } from "node:crypto";
import type { CalendarSource } from "../repositories/calendar-sources.js";
import { GoogleCalendarAuth } from "./google-calendar-auth.js";

export type ExternalCalendarEvent = {
  id: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  sourceId: number;
  sourceDisplayName: string;
  color: string | null;
  readOnly: true;
};

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  backgroundColor: string | null;
  primary: boolean;
};

export class GoogleCalendarProvider {
  constructor(private readonly auth = new GoogleCalendarAuth()) {}

  async listEvents(sources: CalendarSource[], range: { startAt: string; endAt: string }): Promise<ExternalCalendarEvent[]> {
    if (sources.length === 0 || !this.auth.status().configured || !this.auth.status().connected) {
      return [];
    }

    const accessToken = await this.auth.getAccessToken();
    if (!accessToken) {
      return [];
    }

    const results = await Promise.all(
      sources
        .filter((source) => source.provider === "google" && source.enabled)
        .map((source) => this.listSourceEvents(source, range, accessToken).catch((error) => {
          console.warn(`Google Calendar source ${source.id} failed:`, error instanceof Error ? error.message : error);
          return [];
        }))
    );
    return results.flat();
  }

  async listCalendars(): Promise<GoogleCalendarListItem[]> {
    if (!this.auth.status().configured || !this.auth.status().connected) {
      return [];
    }
    const accessToken = await this.auth.getAccessToken();
    if (!accessToken) {
      return [];
    }
    const response = await fetch("https://www.googleapis.com/calendar/v3/users/me/calendarList", {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const json = await response.json().catch(() => ({})) as GoogleCalendarListResponse;
    if (!response.ok) {
      throw new Error(json.error?.message ?? `Google Calendar calendarList.list failed with ${response.status}`);
    }
    return (json.items ?? []).map((item) => ({
      id: item.id,
      summary: item.summaryOverride || item.summary || item.id,
      backgroundColor: item.backgroundColor ?? null,
      primary: item.primary === true
    }));
  }

  private async listSourceEvents(source: CalendarSource, range: { startAt: string; endAt: string }, accessToken: string): Promise<ExternalCalendarEvent[]> {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(source.calendarId)}/events`);
    url.searchParams.set("timeMin", toRfc3339(range.startAt));
    url.searchParams.set("timeMax", toRfc3339(range.endAt));
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("maxResults", "2500");

    const response = await fetch(url, {
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const json = await response.json().catch(() => ({})) as GoogleEventsListResponse;
    if (!response.ok) {
      throw new Error(json.error?.message ?? `Google Calendar events.list failed with ${response.status}`);
    }

    return (json.items ?? []).flatMap((event): ExternalCalendarEvent[] => {
      const start = event.start;
      const end = event.end;
      if (!start || !end) {
        return [];
      }
      const allDay = Boolean(start.date && end.date);
      return [{
        id: event.id ?? event.iCalUID ?? randomUUID(),
        title: event.summary || "(Ohne Titel)",
        startAt: allDay ? start.date! : toLocalDateTime(start.dateTime!),
        endAt: allDay ? previousDate(end.date!) : toLocalDateTime(end.dateTime!),
        allDay,
        sourceId: source.id,
        sourceDisplayName: source.displayName,
        color: source.color,
        readOnly: true
      }];
    });
  }
}

type GoogleEventsListResponse = {
  items?: GoogleEvent[];
  error?: { message?: string };
};

type GoogleCalendarListResponse = {
  items?: Array<{
    id: string;
    summary?: string;
    summaryOverride?: string;
    backgroundColor?: string;
    primary?: boolean;
  }>;
  error?: { message?: string };
};

type GoogleEvent = {
  id?: string;
  iCalUID?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
};

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

function dateOnlyLocal(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
