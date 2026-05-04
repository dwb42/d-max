import type Database from "better-sqlite3";
import { CalendarEntryRepository } from "../repositories/calendar-entries.js";
import type { CalendarEntry, CalendarEntryType } from "../repositories/calendar-entries.js";
import { CalendarSourceRepository } from "../repositories/calendar-sources.js";
import { CategoryRepository } from "../repositories/categories.js";
import type { Category } from "../repositories/categories.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import type { Initiative } from "../repositories/initiatives.js";
import { TaskRepository } from "../repositories/tasks.js";
import type { Task } from "../repositories/tasks.js";
import { GoogleCalendarProvider } from "./google-calendar-provider.js";
import type { ExternalCalendarEvent } from "./google-calendar-provider.js";

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
    }
  | {
      id: string;
      source: "google";
      readOnly: true;
      allDay: boolean;
      sourceId: number;
      title: string;
      startAt: string;
      endAt: string;
      color: string | null;
      sourceDisplayName: string;
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
    };

export type CalendarView = {
  events: CalendarViewEvent[];
};

export class CalendarService {
  private readonly entries: CalendarEntryRepository;
  private readonly sources: CalendarSourceRepository;
  private readonly categories: CategoryRepository;
  private readonly initiatives: InitiativeRepository;
  private readonly tasks: TaskRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly googleProvider = new GoogleCalendarProvider()
  ) {
    this.entries = new CalendarEntryRepository(db);
    this.sources = new CalendarSourceRepository(db);
    this.categories = new CategoryRepository(db);
    this.initiatives = new InitiativeRepository(db);
    this.tasks = new TaskRepository(db);
  }

  async getView(range: { startDate: string; endDate: string }): Promise<CalendarView> {
    const startAt = `${range.startDate}T00:00:00.000`;
    const endAt = `${range.endDate}T23:59:59.999`;
    const categoryList = this.categories.list();
    const categoryById = new Map(categoryList.map((category) => [category.id, category]));
    const allInitiatives = this.initiatives.list();
    const initiativeById = new Map(allInitiatives.map((initiative) => [initiative.id, initiative]));
    const taskById = new Map(this.tasks.list().map((task) => [task.id, task]));

    const dmaxEvents = this.entries.list({ startAt, endAt }).map((entry) =>
      this.toDmaxViewEvent(entry, taskById, initiativeById, categoryById)
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
          color: category?.color ?? null
        };
      });
    const googleEvents = await this.googleProvider.listEvents(this.sources.list({ enabled: true }), { startAt, endAt });

    return {
      events: [
        ...initiativeSpanEvents,
        ...googleEvents.map(toGoogleViewEvent),
        ...dmaxEvents
      ].sort((left, right) => left.startAt.localeCompare(right.startAt) || left.endAt.localeCompare(right.endAt))
    };
  }

  private toDmaxViewEvent(
    entry: CalendarEntry,
    taskById: Map<number, Task>,
    initiativeById: Map<number, Initiative>,
    categoryById: Map<number, Category>
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
      notes: entry.notes
    };
  }
}

function toGoogleViewEvent(event: ExternalCalendarEvent): CalendarViewEvent {
  return {
    id: `google:${event.sourceId}:${event.id}`,
    source: "google",
    readOnly: true,
    allDay: event.allDay,
    sourceId: event.sourceId,
    title: event.title,
    startAt: event.startAt,
    endAt: event.endAt,
    color: event.color,
    sourceDisplayName: event.sourceDisplayName
  };
}
