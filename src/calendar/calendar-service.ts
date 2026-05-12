import type Database from "better-sqlite3";
import { CalendarEventBindingRepository } from "../repositories/calendar-event-bindings.js";
import type { CalendarBindingLocalEntityType, CalendarEventBinding } from "../repositories/calendar-event-bindings.js";
import { CalendarEventVisibilityRepository, visibilityMatchesEvent } from "../repositories/calendar-event-visibility.js";
import type { CalendarEventVisibilitySurface } from "../repositories/calendar-event-visibility.js";
import { CalendarEntryRepository } from "../repositories/calendar-entries.js";
import type { CalendarEntry, CalendarEntryType } from "../repositories/calendar-entries.js";
import { CalendarSourceRepository } from "../repositories/calendar-sources.js";
import type { CalendarSource } from "../repositories/calendar-sources.js";
import { CategoryRepository } from "../repositories/categories.js";
import type { Category } from "../repositories/categories.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import type { Initiative } from "../repositories/initiatives.js";
import { TaskRepository } from "../repositories/tasks.js";
import type { Task } from "../repositories/tasks.js";
import { GoogleCalendarProvider } from "./google-calendar-provider.js";
import type { ExternalCalendarEvent, GoogleCalendarWarning } from "./google-calendar-provider.js";

export type CalendarViewEvent =
  | {
      id: string;
      source: "dmax";
      readOnly: false;
      allDay: false;
      entryId: number;
      entryType: CalendarEntryType;
      title: string;
      startAt: string;
      endAt: string;
      status: "open" | "done";
      initiativeId: number | null;
      taskId: number | null;
      categoryId: number | null;
      categoryName: string | null;
      color: string | null;
      notes: string | null;
      binding: CalendarViewBinding | null;
    }
  | {
      id: string;
      source: "google";
      readOnly: true;
      allDay: boolean;
      sourceId: number;
      externalCalendarId: string;
      externalEventId: string;
      title: string;
      startAt: string;
      endAt: string;
      color: string | null;
      sourceDisplayName: string;
      htmlLink: string | null;
      etag: string | null;
      updatedAt: string | null;
      recurring: boolean;
      recurringEventId: string | null;
      originalStartAt: string | null;
      iCalUID: string | null;
      organizerSelf: boolean;
      organizer: {
        email: string | null;
        displayName: string | null;
        self: boolean;
      } | null;
      attendees: Array<{
        email: string | null;
        displayName: string | null;
        self: boolean;
        responseStatus: string | null;
        optional: boolean;
      }>;
      sourceReadOnly: boolean;
      editable: boolean;
      readOnlyReason: string | null;
      binding: CalendarViewBinding | null;
    }
  | {
      id: string;
      source: "initiative_span";
      readOnly: true;
      allDay: true;
      initiativeId: number;
      title: string;
      startAt: string;
      endAt: string;
      categoryId: number;
      categoryName: string | null;
      color: string | null;
      isLocked: boolean;
      binding: CalendarViewBinding | null;
    };

export type CalendarViewBinding = {
  id: number;
  localEntityType: CalendarBindingLocalEntityType;
  localEntityId: number;
  calendarSourceId: number | null;
  externalCalendarId: string;
  externalEventId: string;
  syncStatus: CalendarEventBinding["syncStatus"];
  syncMessage: string | null;
  lastSyncedAt: string | null;
};

export type CalendarView = {
  events: CalendarViewEvent[];
  warnings: GoogleCalendarWarning[];
};

export class CalendarService {
  private readonly entries: CalendarEntryRepository;
  private readonly bindings: CalendarEventBindingRepository;
  private readonly eventVisibility: CalendarEventVisibilityRepository;
  private readonly sources: CalendarSourceRepository;
  private readonly categories: CategoryRepository;
  private readonly initiatives: InitiativeRepository;
  private readonly tasks: TaskRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly googleProvider = new GoogleCalendarProvider()
  ) {
    this.entries = new CalendarEntryRepository(db);
    this.bindings = new CalendarEventBindingRepository(db);
    this.eventVisibility = new CalendarEventVisibilityRepository(db);
    this.sources = new CalendarSourceRepository(db);
    this.categories = new CategoryRepository(db);
    this.initiatives = new InitiativeRepository(db);
    this.tasks = new TaskRepository(db);
  }

  async getView(range: { startDate: string; endDate: string }, options: { hiddenSurface?: CalendarEventVisibilitySurface | null } = {}): Promise<CalendarView> {
    const startedAt = Date.now();
    const timings: Record<string, number> = {};
    const startAt = `${range.startDate}T00:00:00.000`;
    const endAt = `${range.endDate}T23:59:59.999`;
    const sourceStartedAt = Date.now();
    const sourceList = this.sources.list({ enabled: true });
    const bindingListBeforeSync = this.bindings.listActive();
    timings.loadSourcesAndBindingsMs = Date.now() - sourceStartedAt;
    const googleStartedAt = Date.now();
    const googleResult = await this.googleProvider.listEvents(sourceList, { startAt, endAt });
    timings.googleListMs = Date.now() - googleStartedAt;
    const listedGoogleEventByExternalKey = new Map(
      googleResult.events.map((event) => [externalBindingKey(event.externalCalendarId, event.externalEventId), event])
    );
    const syncStartedAt = Date.now();
    const syncWarnings = await this.syncLinkedEvents(bindingListBeforeSync, sourceList, {
      range,
      listedGoogleEventByExternalKey
    });
    timings.syncLinkedMs = Date.now() - syncStartedAt;

    const localStartedAt = Date.now();
    const categoryList = this.categories.list();
    const categoryById = new Map(categoryList.map((category) => [category.id, category]));
    const allInitiatives = this.initiatives.list();
    const initiativeById = new Map(allInitiatives.map((initiative) => [initiative.id, initiative]));
    const taskById = new Map(this.tasks.list().map((task) => [task.id, task]));
    const bindingList = this.bindings.listActive();
    const bindingByCalendarEntryId = new Map(
      bindingList
        .filter((binding) => binding.localEntityType === "calendar_entry")
        .map((binding) => [binding.localEntityId, binding])
    );
    const bindingByProjectId = new Map(
      bindingList
        .filter((binding) => binding.localEntityType === "initiative_project_span")
        .map((binding) => [binding.localEntityId, binding])
    );
    const bindingByExternalEvent = new Map(bindingList.map((binding) => [externalBindingKey(binding.externalCalendarId, binding.externalEventId), binding]));

    const dmaxEvents = this.entries.list({ startAt, endAt }).map((entry) =>
      this.toDmaxViewEvent(entry, taskById, initiativeById, categoryById, bindingByCalendarEntryId.get(entry.id) ?? null)
    );
    const initiativeSpanEvents = allInitiatives
      .filter((initiative) => initiative.type === "project" && initiative.startDate && initiative.endDate)
      .filter((initiative) => initiative.endDate! >= range.startDate && initiative.startDate! <= range.endDate)
      .map((initiative) => {
        const category = categoryById.get(initiative.categoryId) ?? null;
        return {
          id: `initiative-span:${initiative.id}`,
          source: "initiative_span" as const,
          readOnly: true as const,
          allDay: true as const,
          initiativeId: initiative.id,
          title: initiative.name,
          startAt: initiative.startDate!,
          endAt: initiative.endDate!,
          categoryId: initiative.categoryId,
          categoryName: category?.name ?? null,
          color: category?.color ?? null,
          isLocked: initiative.isLocked,
          binding: toViewBinding(bindingByProjectId.get(initiative.id) ?? null)
        };
      });
    const localRenderedExternalBindingKeys = new Set(
      [...initiativeSpanEvents, ...dmaxEvents]
        .flatMap((event) => event.binding ? [externalBindingKey(event.binding.externalCalendarId, event.binding.externalEventId)] : [])
    );
    const hiddenRules = options.hiddenSurface
      ? this.eventVisibility.list({ surfaces: [options.hiddenSurface, "global"] })
      : [];
    const unlinkedGoogleEvents = googleResult.events
      .filter((event) => !localRenderedExternalBindingKeys.has(externalBindingKey(event.externalCalendarId, event.externalEventId)))
      .filter((event) => !hiddenRules.some((rule) => visibilityMatchesEvent(event, rule)))
      .map((event) => toGoogleViewEvent(event, bindingByExternalEvent.get(externalBindingKey(event.externalCalendarId, event.externalEventId)) ?? null));
    timings.localRenderMs = Date.now() - localStartedAt;

    const view = {
      events: [
        ...initiativeSpanEvents,
        ...unlinkedGoogleEvents,
        ...dmaxEvents
      ].sort((left, right) => left.startAt.localeCompare(right.startAt) || left.endAt.localeCompare(right.endAt)),
      warnings: [...googleResult.warnings, ...syncWarnings]
    };
    console.info("[calendar] getView", {
      range,
      totalMs: Date.now() - startedAt,
      ...timings,
      sources: sourceList.length,
      bindings: bindingListBeforeSync.length,
      googleEvents: googleResult.events.length,
      hiddenGoogleEvents: hiddenRules.length,
      dmaxEvents: dmaxEvents.length,
      initiativeSpanEvents: initiativeSpanEvents.length,
      returnedEvents: view.events.length,
      warnings: view.warnings.length
    });
    this.googleProvider.prefetchEventRanges(sourceList, followingTwoCalendarRanges(range).map((prefetchRange) => ({
      startAt: `${prefetchRange.startDate}T00:00:00.000`,
      endAt: `${prefetchRange.endDate}T23:59:59.999`
    })));
    return view;
  }

  async syncLinkedLocalEntity(input: { localEntityType: CalendarBindingLocalEntityType; localEntityId: number }): Promise<GoogleCalendarWarning[]> {
    const binding = this.bindings.findActiveByLocal(input);
    if (!binding) {
      return [];
    }

    return this.syncLinkedEvents([binding], this.sources.list({ enabled: true }));
  }

  private async syncLinkedEvents(
    bindings: CalendarEventBinding[],
    sources: CalendarSource[],
    options: {
      range?: { startDate: string; endDate: string };
      listedGoogleEventByExternalKey?: Map<string, ExternalCalendarEvent>;
    } = {}
  ): Promise<GoogleCalendarWarning[]> {
    const warnings: GoogleCalendarWarning[] = [];
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    let skippedOutOfRange = 0;
    let fetchedExternal = 0;
    let reusedListedExternal = 0;

    for (const binding of bindings) {
      const source = binding.calendarSourceId ? sourceById.get(binding.calendarSourceId) ?? null : null;
      if (!source) {
        continue;
      }

      const local = this.localSyncState(binding);
      if (!local) {
        continue;
      }

      const bindingKey = externalBindingKey(binding.externalCalendarId, binding.externalEventId);
      const listedExternal = options.listedGoogleEventByExternalKey?.get(bindingKey) ?? null;
      if (options.range && !listedExternal && !localOverlapsDateRange(local, options.range)) {
        skippedOutOfRange += 1;
        continue;
      }

      let external: ExternalCalendarEvent | null;
      try {
        if (listedExternal) {
          external = listedExternal;
          reusedListedExternal += 1;
        } else {
          fetchedExternal += 1;
          external = await this.googleProvider.getEvent(source, binding.externalEventId);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google Calendar linked event sync failed";
        this.bindings.update({ id: binding.id, syncStatus: "sync_error", syncMessage: message });
        warnings.push({ scope: "sync", sourceId: source.id, message });
        continue;
      }

      if (!external) {
        this.bindings.update({ id: binding.id, syncStatus: "external_deleted", syncMessage: "Linked Google event was deleted." });
        warnings.push({ scope: "sync", sourceId: source.id, message: `${local.title}: linked Google event was deleted.` });
        continue;
      }

      if (binding.localEntityType === "calendar_entry" && external.allDay) {
        this.bindings.update({ id: binding.id, syncStatus: "sync_error", syncMessage: "Linked Google event became all-day; calendar entries require timed events." });
        warnings.push({ scope: "sync", sourceId: source.id, message: `${local.title}: Google event became all-day and was not synced.` });
        continue;
      }
      if (binding.localEntityType === "initiative_project_span" && !external.allDay) {
        this.bindings.update({ id: binding.id, syncStatus: "sync_error", syncMessage: "Linked project span Google event became timed." });
        warnings.push({ scope: "sync", sourceId: source.id, message: `${local.title}: project span Google event became timed and was not synced.` });
        continue;
      }

      const lastSyncedAt = binding.lastSyncedAt ?? binding.createdAt;
      const localChanged = local.updatedAt > lastSyncedAt;
      const externalChanged = Boolean(external.updatedAt && external.updatedAt > lastSyncedAt && external.updatedAt !== binding.externalUpdatedAt);
      if (!localChanged && !externalChanged) {
        continue;
      }

      const lockedLocalProjectSpan = binding.localEntityType === "initiative_project_span" && local.isLocked;
      const externalWins = externalChanged && !lockedLocalProjectSpan && (!localChanged || (external.updatedAt ?? "") > local.updatedAt);
      const conflict = localChanged && externalChanged;
      try {
        if (externalWins) {
          this.applyExternalToLocal(binding, external);
          this.bindings.update({
            id: binding.id,
            externalEtag: external.etag,
            externalUpdatedAt: external.updatedAt,
            syncStatus: "synced",
            syncMessage: conflict ? "Google was newer; DMAX was updated." : null,
            lastSyncedAt: new Date().toISOString()
          });
          if (conflict) {
            warnings.push({ scope: "sync", sourceId: source.id, message: `${external.title}: Google was newer and DMAX was updated.` });
          }
        } else {
          if (!external.editable) {
            this.bindings.update({
              id: binding.id,
              syncStatus: source.readOnly ? "sync_blocked_readonly" : "sync_error",
              syncMessage: external.readOnlyReason ? `Google event is not editable: ${external.readOnlyReason}` : "Google event is not editable."
            });
            warnings.push({ scope: "sync", sourceId: source.id, message: `${local.title}: local changes are not synced because Google is read-only.` });
            continue;
          }
          const updatedExternal = await this.googleProvider.updateEvent(source, binding.externalEventId, {
            title: local.title,
            startAt: local.startAt,
            endAt: local.endAt,
            allDay: local.allDay
          });
          this.bindings.update({
            id: binding.id,
            externalEtag: updatedExternal.etag,
            externalUpdatedAt: updatedExternal.updatedAt,
            syncStatus: "synced",
            syncMessage: lockedLocalProjectSpan && externalChanged ? "DMAX timeframe is locked; Google was restored." : conflict ? "DMAX was newer; Google was updated." : null,
            lastSyncedAt: new Date().toISOString()
          });
          if (lockedLocalProjectSpan && externalChanged) {
            warnings.push({ scope: "sync", sourceId: source.id, message: `${local.title}: DMAX timeframe is locked; Google was restored.` });
          }
          if (conflict) {
            warnings.push({ scope: "sync", sourceId: source.id, message: `${local.title}: DMAX was newer and Google was updated.` });
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : "Google Calendar linked event write failed";
        this.bindings.update({ id: binding.id, syncStatus: "pending_sync", syncMessage: message });
        warnings.push({ scope: "sync", sourceId: source.id, message });
      }
    }

    console.info("[calendar] syncLinkedEvents", {
      bindings: bindings.length,
      skippedOutOfRange,
      reusedListedExternal,
      fetchedExternal,
      warnings: warnings.length
    });
    return warnings;
  }

  private localSyncState(binding: CalendarEventBinding): { title: string; startAt: string; endAt: string; allDay: boolean; updatedAt: string; isLocked: boolean } | null {
    if (binding.localEntityType === "calendar_entry") {
      const entry = this.entries.findById(binding.localEntityId);
      return entry ? { title: entry.title, startAt: entry.startAt, endAt: entry.endAt, allDay: false, updatedAt: entry.updatedAt, isLocked: false } : null;
    }

    const initiative = this.initiatives.findById(binding.localEntityId);
    if (!initiative || initiative.type !== "project" || !initiative.startDate || !initiative.endDate) {
      return null;
    }
    return {
      title: initiative.name,
      startAt: initiative.startDate,
      endAt: initiative.endDate,
      allDay: true,
      updatedAt: initiative.updatedAt,
      isLocked: initiative.isLocked
    };
  }

  private applyExternalToLocal(binding: CalendarEventBinding, external: ExternalCalendarEvent): void {
    if (binding.localEntityType === "calendar_entry") {
      this.entries.update({
        id: binding.localEntityId,
        title: external.title,
        startAt: external.startAt,
        endAt: external.endAt
      });
      return;
    }

    this.initiatives.update({
      id: binding.localEntityId,
      name: external.title,
      startDate: external.startAt,
      endDate: external.endAt
    });
  }

  private toDmaxViewEvent(
    entry: CalendarEntry,
    taskById: Map<number, Task>,
    initiativeById: Map<number, Initiative>,
    categoryById: Map<number, Category>,
    binding: CalendarEventBinding | null
  ): CalendarViewEvent {
    const task = entry.taskId ? taskById.get(entry.taskId) ?? null : null;
    const initiativeId = entry.initiativeId ?? task?.initiativeId ?? null;
    const initiative = initiativeId ? initiativeById.get(initiativeId) ?? null : null;
    const category = initiative ? categoryById.get(initiative.categoryId) ?? null : null;
    return {
      id: `dmax:${entry.id}`,
      source: "dmax",
      readOnly: false,
      allDay: false,
      entryId: entry.id,
      entryType: entry.type,
      title: entry.title,
      startAt: entry.startAt,
      endAt: entry.endAt,
      status: entry.status,
      initiativeId,
      taskId: entry.taskId,
      categoryId: category?.id ?? null,
      categoryName: category?.name ?? null,
      color: category?.color ?? null,
      notes: entry.notes,
      binding: toViewBinding(binding)
    };
  }
}

function toGoogleViewEvent(event: ExternalCalendarEvent, binding: CalendarEventBinding | null): CalendarViewEvent {
  return {
    id: `google:${event.sourceId}:${event.id}`,
    source: "google",
    readOnly: true,
    allDay: event.allDay,
    sourceId: event.sourceId,
    externalCalendarId: event.externalCalendarId,
    externalEventId: event.externalEventId,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    color: event.color,
    sourceDisplayName: event.sourceDisplayName,
    htmlLink: event.htmlLink,
    etag: event.etag,
    updatedAt: event.updatedAt,
    recurring: event.recurring,
    recurringEventId: event.recurringEventId ?? null,
    originalStartAt: event.originalStartAt ?? null,
    iCalUID: event.iCalUID ?? null,
    organizerSelf: event.organizerSelf,
    organizer: event.organizer ?? null,
    attendees: event.attendees ?? [],
    sourceReadOnly: event.sourceReadOnly,
    editable: event.editable,
    readOnlyReason: event.readOnlyReason,
    binding: toViewBinding(binding)
  };
}

function toViewBinding(binding: CalendarEventBinding | null): CalendarViewBinding | null {
  return binding ? {
    id: binding.id,
    localEntityType: binding.localEntityType,
    localEntityId: binding.localEntityId,
    calendarSourceId: binding.calendarSourceId,
    externalCalendarId: binding.externalCalendarId,
    externalEventId: binding.externalEventId,
    syncStatus: binding.syncStatus,
    syncMessage: binding.syncMessage,
    lastSyncedAt: binding.lastSyncedAt
  } : null;
}

function externalBindingKey(calendarId: string, eventId: string): string {
  return `${calendarId}\n${eventId}`;
}

function localOverlapsDateRange(
  local: { startAt: string; endAt: string },
  range: { startDate: string; endDate: string }
): boolean {
  return local.endAt.slice(0, 10) >= range.startDate && local.startAt.slice(0, 10) <= range.endDate;
}

function followingTwoCalendarRanges(range: { startDate: string; endDate: string }): Array<{ startDate: string; endDate: string }> {
  const firstStart = shiftDateOnly(range.endDate, 1);
  const firstEnd = shiftDateOnly(firstStart, 6);
  const secondStart = shiftDateOnly(firstEnd, 1);
  const secondEnd = shiftDateOnly(secondStart, 6);
  return [
    { startDate: firstStart, endDate: firstEnd },
    { startDate: secondStart, endDate: secondEnd }
  ];
}

function shiftDateOnly(value: string, days: number): string {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year || 1970, (month || 1) - 1, (day || 1) + days));
  return date.toISOString().slice(0, 10);
}
