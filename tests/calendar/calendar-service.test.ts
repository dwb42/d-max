import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { CalendarService } from "../../src/calendar/calendar-service.js";
import { GoogleCalendarProvider } from "../../src/calendar/google-calendar-provider.js";
import type { ExternalCalendarEvent, GoogleCalendarEventCoreInput, GoogleCalendarEventsResult } from "../../src/calendar/google-calendar-provider.js";
import { CalendarEventBindingRepository } from "../../src/repositories/calendar-event-bindings.js";
import { CalendarEventVisibilityRepository } from "../../src/repositories/calendar-event-visibility.js";
import { CalendarSourceRepository } from "../../src/repositories/calendar-sources.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { InitiativeRepository } from "../../src/repositories/initiatives.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("CalendarService", () => {
  let db: Database.Database;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    db.close();
  });

  it("shows a linked project span once as the DMAX event with binding metadata", async () => {
    const category = new CategoryRepository(db).create({ name: "Travel" });
    const project = new InitiativeRepository(db).create({
      categoryId: category.id,
      type: "project",
      name: "Radtour Koblenz >> Trier",
      startDate: "2026-06-08",
      endDate: "2026-06-09"
    });
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@example.com",
      calendarId: "primary",
      displayName: "Google",
      readOnly: false
    });
    new CalendarEventBindingRepository(db).create({
      localEntityType: "initiative_project_span",
      localEntityId: project.id,
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      externalEtag: "etag-1",
      externalUpdatedAt: "2026-06-01T08:00:00.000Z",
      lastSyncedAt: "2026-06-01T08:00:00.000Z"
    });

    const service = new CalendarService(db, new FakeGoogleCalendarProvider({
      id: "google-event-1",
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      title: "Radtour Koblenz >> Trier",
      startAt: "2026-06-08",
      endAt: "2026-06-09",
      allDay: true,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: "https://calendar.google.com/event?eid=google-event-1",
      etag: "etag-1",
      updatedAt: "2026-06-01T08:00:00.000Z",
      recurring: false,
      organizerSelf: true,
      sourceReadOnly: false,
      editable: true,
      readOnlyReason: null,
      color: source.color,
      readOnly: true
    }));

    const view = await service.getView({ startDate: "2026-06-08", endDate: "2026-06-09" });

    expect(view.events).toHaveLength(1);
    expect(view.events[0]).toMatchObject({
      source: "initiative_span",
      title: "Radtour Koblenz >> Trier",
      binding: {
        externalCalendarId: "primary",
        externalEventId: "google-event-1"
      }
    });
  });

  it("syncs a renamed linked project span to Google immediately", async () => {
    const category = new CategoryRepository(db).create({ name: "Travel" });
    const initiatives = new InitiativeRepository(db);
    const project = initiatives.create({
      categoryId: category.id,
      type: "project",
      name: "Radtour Koblenz >> Trier",
      startDate: "2026-06-08",
      endDate: "2026-06-09"
    }, "2026-06-01T07:00:00.000Z");
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@example.com",
      calendarId: "primary",
      displayName: "Google",
      readOnly: false
    });
    new CalendarEventBindingRepository(db).create({
      localEntityType: "initiative_project_span",
      localEntityId: project.id,
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      externalEtag: "etag-1",
      externalUpdatedAt: "2026-06-01T08:00:00.000Z",
      lastSyncedAt: "2026-06-01T08:00:00.000Z"
    });
    initiatives.update({ id: project.id, name: "Radtour Koblenz - Trier" }, "2026-06-02T08:00:00.000Z");
    const provider = new FakeGoogleCalendarProvider({
      id: "google-event-1",
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      title: "Radtour Koblenz >> Trier",
      startAt: "2026-06-08",
      endAt: "2026-06-09",
      allDay: true,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: "https://calendar.google.com/event?eid=google-event-1",
      etag: "etag-1",
      updatedAt: "2026-06-01T08:00:00.000Z",
      recurring: false,
      organizerSelf: true,
      sourceReadOnly: false,
      editable: true,
      readOnlyReason: null,
      color: source.color,
      readOnly: true
    });

    await new CalendarService(db, provider).syncLinkedLocalEntity({
      localEntityType: "initiative_project_span",
      localEntityId: project.id
    });

    expect(provider.lastUpdate).toEqual({
      eventId: "google-event-1",
      input: {
        title: "Radtour Koblenz - Trier",
        startAt: "2026-06-08",
        endAt: "2026-06-09",
        allDay: true
      }
    });
  });

  it("explains why local changes were not synced when the linked Google event is not editable", async () => {
    const category = new CategoryRepository(db).create({ name: "Events" });
    const initiatives = new InitiativeRepository(db);
    const project = initiatives.create({
      categoryId: category.id,
      type: "project",
      name: "Hoffest Astraea",
      startDate: "2026-06-19",
      endDate: "2026-06-21"
    }, "2026-06-01T07:00:00.000Z");
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@example.com",
      calendarId: "primary",
      displayName: "Google",
      readOnly: false
    });
    const bindings = new CalendarEventBindingRepository(db);
    const binding = bindings.create({
      localEntityType: "initiative_project_span",
      localEntityId: project.id,
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      externalEtag: "etag-1",
      externalUpdatedAt: "2026-06-01T08:00:00.000Z",
      lastSyncedAt: "2026-06-01T08:00:00.000Z"
    });
    initiatives.update({ id: project.id, name: "Hoffest Astraea" }, "2026-06-02T08:00:00.000Z");
    const provider = new FakeGoogleCalendarProvider({
      id: "google-event-1",
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      title: "Hoffest Astraea",
      startAt: "2026-06-19",
      endAt: "2026-06-21",
      allDay: true,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: "https://calendar.google.com/event?eid=google-event-1",
      etag: "etag-1",
      updatedAt: "2026-06-01T08:00:00.000Z",
      recurring: false,
      organizerSelf: false,
      sourceReadOnly: false,
      editable: false,
      readOnlyReason: "external_organizer",
      color: source.color,
      readOnly: true
    });

    const warnings = await new CalendarService(db, provider).syncLinkedLocalEntity({
      localEntityType: "initiative_project_span",
      localEntityId: project.id
    });

    expect(provider.lastUpdate).toBeNull();
    expect(warnings).toEqual([{
      scope: "sync",
      sourceId: source.id,
      message: "Hoffest Astraea: Google event is not editable because you are not the organizer. Local changes were not synced."
    }]);
    expect(bindings.findById(binding.id)).toMatchObject({
      syncStatus: "sync_error",
      syncMessage: "Google event is not editable because you are not the organizer."
    });
  });

  it("keeps a locked project span authoritative when Google changed later", async () => {
    const category = new CategoryRepository(db).create({ name: "Travel" });
    const initiatives = new InitiativeRepository(db);
    const project = initiatives.create({
      categoryId: category.id,
      type: "project",
      name: "Fixed Trip",
      startDate: "2026-06-08",
      endDate: "2026-06-09",
      isLocked: true
    }, "2026-06-01T07:00:00.000Z");
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@example.com",
      calendarId: "primary",
      displayName: "Google",
      readOnly: false
    });
    new CalendarEventBindingRepository(db).create({
      localEntityType: "initiative_project_span",
      localEntityId: project.id,
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      externalEtag: "etag-1",
      externalUpdatedAt: "2026-06-01T08:00:00.000Z",
      lastSyncedAt: "2026-06-01T08:00:00.000Z"
    });
    const provider = new FakeGoogleCalendarProvider({
      id: "google-event-1",
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      title: "Moved in Google",
      startAt: "2026-06-10",
      endAt: "2026-06-11",
      allDay: true,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: "https://calendar.google.com/event?eid=google-event-1",
      etag: "etag-2",
      updatedAt: "2026-06-02T08:00:00.000Z",
      recurring: false,
      organizerSelf: true,
      sourceReadOnly: false,
      editable: true,
      readOnlyReason: null,
      color: source.color,
      readOnly: true
    });

    const warnings = await new CalendarService(db, provider).syncLinkedLocalEntity({
      localEntityType: "initiative_project_span",
      localEntityId: project.id
    });

    expect(initiatives.findById(project.id)).toMatchObject({
      name: "Fixed Trip",
      startDate: "2026-06-08",
      endDate: "2026-06-09",
      isLocked: true
    });
    expect(provider.lastUpdate).toEqual({
      eventId: "google-event-1",
      input: {
        title: "Fixed Trip",
        startAt: "2026-06-08",
        endAt: "2026-06-09",
        allDay: true
      }
    });
    expect(warnings[0]?.message).toContain("timeframe is locked");
  });

  it("treats timed multi-day Google events as project-span compatible", async () => {
    const category = new CategoryRepository(db).create({ name: "Retreats" });
    const initiatives = new InitiativeRepository(db);
    const project = initiatives.create({
      categoryId: category.id,
      type: "project",
      name: "Old Retreat",
      startDate: "2026-05-10",
      endDate: "2026-05-11"
    }, "2026-05-01T07:00:00.000Z");
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@example.com",
      calendarId: "primary",
      displayName: "Google",
      readOnly: false
    });
    new CalendarEventBindingRepository(db).create({
      localEntityType: "initiative_project_span",
      localEntityId: project.id,
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      externalEtag: "etag-1",
      externalUpdatedAt: "2026-05-01T08:00:00.000Z",
      lastSyncedAt: "2026-05-01T08:00:00.000Z"
    });
    const provider = new FakeGoogleCalendarProvider({
      id: "google-event-1",
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      title: "Timed Multi-day Retreat",
      startAt: "2026-05-17T15:00:00.000",
      endAt: "2026-05-19T19:00:00.000",
      allDay: false,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: "https://calendar.google.com/event?eid=google-event-1",
      etag: "etag-2",
      updatedAt: "2026-05-02T08:00:00.000Z",
      recurring: false,
      organizerSelf: true,
      sourceReadOnly: false,
      editable: true,
      readOnlyReason: null,
      color: source.color,
      readOnly: true
    });

    const warnings = await new CalendarService(db, provider).syncLinkedLocalEntity({
      localEntityType: "initiative_project_span",
      localEntityId: project.id
    });

    expect(warnings).toEqual([]);
    expect(initiatives.findById(project.id)).toMatchObject({
      name: "Timed Multi-day Retreat",
      startDate: "2026-05-17",
      endDate: "2026-05-19"
    });
  });

  it("filters hidden Google events only for the requested surface", async () => {
    const source = new CalendarSourceRepository(db).create({
      accountLabel: "dw@example.com",
      calendarId: "primary",
      displayName: "Google"
    });
    new CalendarEventVisibilityRepository(db).create({
      surface: "planning_canvas",
      hiddenScope: "event",
      calendarSourceId: source.id,
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      titleSnapshot: "Hidden trip"
    });
    const service = new CalendarService(db, new FakeGoogleCalendarProvider({
      id: "google-event-1",
      externalCalendarId: "primary",
      externalEventId: "google-event-1",
      title: "Hidden trip",
      startAt: "2026-06-08",
      endAt: "2026-06-09",
      allDay: true,
      sourceId: source.id,
      sourceDisplayName: source.displayName,
      htmlLink: null,
      etag: null,
      updatedAt: null,
      recurring: false,
      organizerSelf: true,
      sourceReadOnly: true,
      editable: false,
      readOnlyReason: "source_read_only",
      color: null,
      readOnly: true
    }));

    const planningCanvasView = await service.getView({ startDate: "2026-06-08", endDate: "2026-06-09" }, { hiddenSurface: "planning_canvas" });
    const calendarView = await service.getView({ startDate: "2026-06-08", endDate: "2026-06-09" });

    expect(planningCanvasView.events).toHaveLength(0);
    expect(calendarView.events).toHaveLength(1);
  });
});

class FakeGoogleCalendarProvider extends GoogleCalendarProvider {
  lastUpdate: { eventId: string; input: Partial<GoogleCalendarEventCoreInput> } | null = null;

  constructor(private readonly event: ExternalCalendarEvent) {
    super({} as never);
  }

  override async listEvents(): Promise<GoogleCalendarEventsResult> {
    return { events: [this.event], warnings: [] };
  }

  override async getEvent(): Promise<ExternalCalendarEvent | null> {
    return this.event;
  }

  override async updateEvent(_source: unknown, eventId: string, input: Partial<GoogleCalendarEventCoreInput>): Promise<ExternalCalendarEvent> {
    this.lastUpdate = { eventId, input };
    return {
      ...this.event,
      title: input.title ?? this.event.title,
      startAt: input.startAt ?? this.event.startAt,
      endAt: input.endAt ?? this.event.endAt,
      allDay: input.allDay ?? this.event.allDay,
      etag: "etag-2",
      updatedAt: "2026-06-02T08:00:01.000Z"
    };
  }
}
