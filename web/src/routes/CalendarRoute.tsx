import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, DragEvent, PointerEvent as ReactPointerEvent } from "react";
import { CheckCircle2, ChevronDown, ChevronLeft, ChevronRight, Circle, ExternalLink, Lock, Trash2, X } from "lucide-react";
import {
  completeCalendarEntry,
  createCalendarEntry,
  createGoogleEventFromDmax,
  deleteCalendarEntry,
  fetchCalendarSources,
  fetchCalendarView,
  linkGoogleEventFromGoogle,
  updateCalendarEntry,
  updateGoogleOnlyEvent,
  unlinkCalendarBinding
} from "../api.js";
import type { AppOverview, CalendarSource, CalendarViewData, CalendarViewEvent, Category, Initiative, Task } from "../types.js";

const LOCKED_TIMEFRAME_TOOLTIP = "Zeitraum ist gesperrt und kann nicht verschoben werden";

type CalendarMode = "day" | "week";
type CalendarDragPayload =
  | { kind: "initiative"; initiativeId: number; title: string }
  | { kind: "task"; taskId: number; title: string }
  | { kind: "entry"; entryId: number; durationMinutes: number };

type CalendarDropPreview = {
  payload: CalendarDragPayload;
  startMinutes: number;
  endMinutes: number;
};

type CalendarDragState = {
  payload: CalendarDragPayload;
  offsetY: number;
};

type CalendarAllDayLayout = {
  event: CalendarViewEvent;
  startColumn: number;
  endColumn: number;
  row: number;
};

type CalendarEventLayout = {
  event: CalendarViewEvent;
  top: number;
  height: number;
  left: number;
  width: number;
};

type GoogleEventLinkMode = "none" | "existing_project" | "new_project" | "project_entry" | "existing_task" | "new_task";

type CalendarProjectHoverInfo = {
  name: string;
  categoryName: string;
  statusLabel: string;
  dateRange: string | null;
  openTaskCount: number;
  summary: string | null;
};

type CalendarProjectHoverOverlay = {
  info: CalendarProjectHoverInfo;
  top: number;
  left: number;
};

const calendarStartHour = 6;
const calendarDefaultEndHour = 23;
const calendarSnapMinutes = 10;
const calendarPixelsPerMinute = 1.035;
const calendarDefaultDurationMinutes = 90;

type CalendarControlsState = {
  mode: CalendarMode;
  anchorDate: string;
  showAllDay: boolean;
};

export default function CalendarRoute(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  controls: CalendarControlsState;
  onShowAllDayChange: () => void;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onAfterChange: () => Promise<void>;
}) {
  const [calendar, setCalendar] = useState<CalendarViewData | null>(null);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [busy, setBusy] = useState(false);
  const [standaloneDraft, setStandaloneDraft] = useState<{ date: string; startMinutes: number } | null>(null);
  const [publishDraft, setPublishDraft] = useState<{ localEntityType: "calendar_entry" | "initiative_project_span"; localEntityId: number; title: string } | null>(null);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<Extract<CalendarViewEvent, { source: "google" }> | null>(null);
  const [calendarLoadError, setCalendarLoadError] = useState<string | null>(null);
  const [dismissedWarningKeys, setDismissedWarningKeys] = useState<Set<string>>(() => new Set());
  const [activeCalendarDrag, setActiveCalendarDrag] = useState<CalendarDragState | null>(null);
  const [sidebarProjectHover, setSidebarProjectHover] = useState<CalendarProjectHoverOverlay | null>(null);
  const [flexibleAllDayExpanded, setFlexibleAllDayExpanded] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const range = useMemo(() => calendarVisibleRange(props.controls.anchorDate, props.controls.mode), [props.controls.anchorDate, props.controls.mode]);
  const days = useMemo(() => daysInRange(range.start, range.end), [range]);
  const today = dateOnlyLocal(now);
  const currentTimeMinutes = now.getHours() * 60 + now.getMinutes();
  const events = calendar?.events ?? [];
  const writableCalendarSources = calendarSources.filter((source) => source.enabled && !source.readOnly);
  const visibleWarnings = (calendar?.warnings ?? []).filter((warning) => !dismissedWarningKeys.has(calendarWarningKey(warning)));
  const fixedAllDayLayouts = useMemo(() => layoutAllDayEvents(events.filter(isFixedCalendarLaneEvent), days), [days, events]);
  const flexibleAllDayLayouts = useMemo(() => layoutAllDayEvents(events.filter(isFlexibleCalendarLaneEvent), days), [days, events]);
  const fixedAllDayRows = Math.max(1, ...fixedAllDayLayouts.map((layout) => layout.row));
  const flexibleAllDayRows = Math.max(1, ...flexibleAllDayLayouts.map((layout) => layout.row));
  const visibleFlexibleAllDayRows = flexibleAllDayExpanded ? flexibleAllDayRows : 1;
  const timedEvents = events.filter((event) => !isCalendarAllDayLaneEvent(event));
  const latestEndMinutes = timedEvents.reduce((max, event) => Math.max(max, minutesFromDateTime(event.endAt)), calendarDefaultEndHour * 60);
  const endHour = Math.max(calendarDefaultEndHour, Math.ceil(latestEndMinutes / 60));
  const gridHeight = (endHour * 60 - calendarStartHour * 60) * calendarPixelsPerMinute;
  const activeProjects = props.initiatives.filter((initiative) => initiative.type === "project" && initiative.status === "active");
  const projectsActiveToday = activeProjects.filter((initiative) => projectTimeframeIncludesDate(initiative, today));
  const otherActiveProjects = activeProjects.filter((initiative) => !projectTimeframeIncludesDate(initiative, today));
  const tasksByInitiative = new Map<number, Task[]>();
  for (const task of props.tasks.filter((task) => task.status === "open")) {
    if (!task.initiativeId) continue;
    const current = tasksByInitiative.get(task.initiativeId) ?? [];
    current.push(task);
    tasksByInitiative.set(task.initiativeId, current);
  }
  const projectHoverInfoById = useMemo(() => {
    const infoById = new Map<number, CalendarProjectHoverInfo>();
    for (const initiative of props.initiatives.filter((candidate) => candidate.type === "project")) {
      const category = props.categories.find((candidate) => candidate.id === initiative.categoryId);
      const openTaskCount = props.tasks.filter((task) =>
        task.initiativeId === initiative.id && task.status !== "done"
      ).length;
      const summary = initiative.summary?.trim() || firstMarkdownLine(initiative.markdown);
      infoById.set(initiative.id, {
        name: displayInitiativeName(initiative),
        categoryName: category?.name ?? "Ohne Kategorie",
        statusLabel: initiative.status === "active" ? "Aktiv" : initiative.status === "paused" ? "Pausiert" : initiative.status === "completed" ? "Abgeschlossen" : "Archiviert",
        dateRange: formatInitiativeDateRangeForUi(initiative),
        openTaskCount,
        summary: summary || null
      });
    }
    return infoById;
  }, [props.categories, props.initiatives, props.tasks]);

  const loadCalendar = async () => {
    setBusy(true);
    try {
      const nextCalendar = await fetchCalendarView(range.start, range.end);
      setCalendar(nextCalendar);
      setCalendarLoadError(null);
      fetchCalendarSources()
        .then(setCalendarSources)
        .catch((err: unknown) => {
          setCalendarLoadError(err instanceof Error ? err.message : "Kalenderquellen konnten nicht geladen werden.");
        });
    } catch (err) {
      setCalendarLoadError(err instanceof Error ? err.message : "Kalender konnte nicht geladen werden.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void loadCalendar();
  }, [range.start, range.end]);

  useEffect(() => {
    const interval = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(interval);
  }, []);

  async function reloadAfterMutation() {
    await Promise.all([loadCalendar(), props.onAfterChange()]);
  }

  async function createDroppedEntry(payload: CalendarDragPayload, date: string, startMinutes: number) {
    setActiveCalendarDrag(null);
    const startAt = dateTimeFromMinutes(date, startMinutes);
    const endAt = dateTimeFromMinutes(date, boundedEndMinutes(date, startMinutes, events));
    if (payload.kind === "initiative") {
      await createCalendarEntry({
        type: "initiative_focus",
        title: `Projekt: ${payload.title}`,
        startAt,
        endAt,
        initiativeId: payload.initiativeId
      });
    } else if (payload.kind === "task") {
      await createCalendarEntry({
        type: "task_work",
        title: payload.title,
        startAt,
        endAt,
        taskId: payload.taskId
      });
    } else {
      await updateCalendarEntry(payload.entryId, {
        startAt,
        endAt: dateTimeFromMinutes(date, startMinutes + payload.durationMinutes)
      });
    }
    await reloadAfterMutation();
  }

  function startCalendarDrag(event: DragEvent<HTMLElement>, payload: CalendarDragPayload) {
    const offsetY = calendarDragOffsetY(event);
    setCalendarDragData(event, payload, offsetY);
    setActiveCalendarDrag({ payload, offsetY });
  }

  function showSidebarProjectHover(element: HTMLElement, info: CalendarProjectHoverInfo) {
    const rect = element.getBoundingClientRect();
    const width = 250;
    setSidebarProjectHover({
      info,
      top: Math.max(12, Math.min(rect.top, window.innerHeight - 230)),
      left: Math.min(rect.right + 10, window.innerWidth - width - 12)
    });
  }

  async function createStandalone(title: string) {
    if (!standaloneDraft || !title.trim()) return;
    const startAt = dateTimeFromMinutes(standaloneDraft.date, standaloneDraft.startMinutes);
    await createCalendarEntry({
      type: "standalone",
      title,
      startAt,
      endAt: dateTimeFromMinutes(standaloneDraft.date, standaloneDraft.startMinutes + calendarDefaultDurationMinutes)
    });
    setStandaloneDraft(null);
    await reloadAfterMutation();
  }

  async function unlinkBinding(bindingId: number) {
    const deleteGoogleEvent = window.confirm("Google Event ebenfalls löschen?");
    await unlinkCalendarBinding(bindingId, { deleteGoogleEvent });
    await reloadAfterMutation();
  }

  function renderProjectCard(initiative: Initiative) {
    const category = props.categories.find((candidate) => candidate.id === initiative.categoryId);
    const projectTasks = tasksByInitiative.get(initiative.id) ?? [];
    const hoverInfo = projectHoverInfoById.get(initiative.id) ?? null;
    return (
      <details key={initiative.id} className="calendar-project-card">
        <summary
          className="calendar-project-summary"
          draggable
          onMouseEnter={(event) => hoverInfo ? showSidebarProjectHover(event.currentTarget, hoverInfo) : undefined}
          onMouseLeave={() => setSidebarProjectHover(null)}
          onFocus={(event) => hoverInfo ? showSidebarProjectHover(event.currentTarget, hoverInfo) : undefined}
          onBlur={() => setSidebarProjectHover(null)}
          onDragStart={(event) => startCalendarDrag(event, { kind: "initiative", initiativeId: initiative.id, title: displayInitiativeName(initiative) })}
          onDragEnd={() => setActiveCalendarDrag(null)}
        >
          <span className="calendar-category-dot" style={{ background: category?.color ?? "#27806f" }} />
          <span>
            <strong>{displayInitiativeName(initiative)}</strong>
            <small>{category?.name ?? "Ohne Kategorie"}</small>
          </span>
        </summary>
        <div className="calendar-task-palette">
          {projectTasks.length === 0 ? <span>Keine offenen Massnahmen</span> : null}
          {projectTasks.map((task) => (
            <button
              key={task.id}
              type="button"
              draggable
              onClick={() => props.onOpenTask(task.id)}
              onDragStart={(event) => startCalendarDrag(event, { kind: "task", taskId: task.id, title: task.title })}
              onDragEnd={() => setActiveCalendarDrag(null)}
            >
              <Circle size={13} />
              {task.title}
            </button>
          ))}
        </div>
      </details>
    );
  }

  return (
    <section className="calendar-planner">
      <aside className="calendar-planner-sidebar">
        <div className="calendar-sidebar-section">
          <h2>Aktive Projekte</h2>
          <div className="calendar-project-list">
            {projectsActiveToday.length === 0 ? <p className="calendar-project-empty">Keine Projekte im heutigen Zeitraum.</p> : null}
            {projectsActiveToday.map(renderProjectCard)}
            {otherActiveProjects.length > 0 ? (
              <details className="calendar-project-overflow">
                <summary className="calendar-project-overflow-summary">
                  <span>Weitere aktive Projekte</span>
                  <small>{otherActiveProjects.length}</small>
                </summary>
                <div className="calendar-project-list nested">
                  {otherActiveProjects.map(renderProjectCard)}
                </div>
              </details>
            ) : null}
          </div>
        </div>
      </aside>

      {sidebarProjectHover ? (
        <CalendarProjectHoverCard
          info={sidebarProjectHover.info}
          placement="sidebar"
          visible
          style={{ top: sidebarProjectHover.top, left: sidebarProjectHover.left }}
        />
      ) : null}

      <div className="calendar-workspace">
        {calendarLoadError ? <div className="error-banner">{calendarLoadError}</div> : null}
        {visibleWarnings.length > 0 ? (
          <div className="calendar-sync-banners">
            {visibleWarnings.map((warning) => {
              const key = calendarWarningKey(warning);
              return (
                <div className="calendar-sync-banner" key={key}>
                  <span>{warning.message}</span>
                  <button
                    type="button"
                    className="icon-button"
                    title="Hinweis ausblenden"
                    onClick={() => setDismissedWarningKeys((current) => new Set([...current, key]))}
                  >
                    <X size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : null}
        <div className={`calendar-frame ${props.controls.showAllDay ? "all-day-open" : "all-day-closed"}`} style={{ "--calendar-days": days.length } as CSSProperties}>
          {busy ? <div className="calendar-loading-overlay">Lade...</div> : null}
          <div className="calendar-day-header-spacer">
            <button
              className={`calendar-row-toggle ${props.controls.showAllDay ? "active" : ""}`}
              type="button"
              onClick={props.onShowAllDayChange}
              aria-expanded={props.controls.showAllDay}
              title={props.controls.showAllDay ? "Ganztag ausblenden" : "Ganztag einblenden"}
            >
              <ChevronDown size={15} />
              <span>Ganztag</span>
            </button>
          </div>
          {days.map((day) => (
            <div className={`calendar-day-header ${day === today ? "today" : ""}`} key={day}>
              <strong>{formatCalendarDayName(day)}</strong>
              <span>{formatDateOnly(day)}</span>
            </div>
          ))}
          {props.controls.showAllDay ? (
            <>
              <div className="calendar-all-day-label fixed">
                <span>Fixierte Zeiträume</span>
              </div>
              <div className="calendar-all-day-bars fixed" style={{ "--calendar-all-day-rows": fixedAllDayRows } as CSSProperties}>
                {days.map((day, index) => (
                  <div
                    key={`fixed-${day}`}
                    className={`calendar-all-day-cell ${day === today ? "today" : ""}`}
                    style={{ gridColumn: index + 1, gridRow: `1 / span ${fixedAllDayRows}` }}
                  />
                ))}
                {fixedAllDayLayouts.map((layout) => (
                  <CalendarAllDayEventButton
                    key={layout.event.id}
                    layout={layout}
                    onOpenInitiative={props.onOpenInitiative}
                    onOpenTask={props.onOpenTask}
                    onOpenGoogleEvent={setSelectedGoogleEvent}
                  />
                ))}
              </div>
              <div className="calendar-all-day-label flexible">
                <button
                  className={`calendar-row-toggle ${flexibleAllDayExpanded ? "active" : ""}`}
                  type="button"
                  onClick={() => setFlexibleAllDayExpanded((current) => !current)}
                  aria-expanded={flexibleAllDayExpanded}
                  title={flexibleAllDayExpanded ? "Flexible Planung einklappen" : "Flexible Planung aufklappen"}
                >
                  <ChevronDown size={15} />
                  <span>Flexible Planung</span>
                </button>
              </div>
              <div
                className={`calendar-all-day-bars flexible ${flexibleAllDayExpanded ? "expanded" : "collapsed"}`}
                style={{ "--calendar-all-day-rows": visibleFlexibleAllDayRows } as CSSProperties}
              >
                {days.map((day, index) => (
                  <div
                    key={`flexible-${day}`}
                    className={`calendar-all-day-cell ${day === today ? "today" : ""}`}
                    style={{ gridColumn: index + 1, gridRow: `1 / span ${visibleFlexibleAllDayRows}` }}
                  />
                ))}
                {flexibleAllDayLayouts
                  .filter((layout) => flexibleAllDayExpanded || layout.row === 1)
                  .map((layout) => (
                    <CalendarAllDayEventButton
                      key={layout.event.id}
                      layout={layout}
                      onOpenInitiative={props.onOpenInitiative}
                      onOpenTask={props.onOpenTask}
                      onOpenGoogleEvent={setSelectedGoogleEvent}
                    />
                  ))}
                {!flexibleAllDayExpanded && flexibleAllDayLayouts.some((layout) => layout.row > 1) ? (
                  <button
                    type="button"
                    className="calendar-all-day-more"
                    style={{
                      gridColumn: `1 / ${days.length + 1}`,
                      gridRow: 1
                    }}
                    onClick={() => setFlexibleAllDayExpanded(true)}
                    title="Weitere flexible Planungen anzeigen"
                  >
                    +{flexibleAllDayLayouts.filter((layout) => layout.row > 1).length}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}

          <div className="calendar-time-scroll">
            <div className="calendar-time-axis" style={{ height: gridHeight }}>
              {Array.from({ length: endHour - calendarStartHour + 1 }, (_, index) => calendarStartHour + index).map((hour) => (
                <span key={hour} style={{ top: (hour * 60 - calendarStartHour * 60) * calendarPixelsPerMinute }}>
                  {String(hour).padStart(2, "0")}:00
                </span>
              ))}
            </div>
            {days.map((day) => (
              <CalendarDayColumn
                key={day}
                date={day}
                events={timedEvents.filter((event) => datePart(event.startAt) === day)}
                allEvents={events}
                activeCalendarDrag={activeCalendarDrag}
                projectHoverInfoById={projectHoverInfoById}
                isToday={day === today}
                currentTimeMinutes={currentTimeMinutes}
                height={gridHeight}
                endHour={endHour}
                onDropEntry={createDroppedEntry}
                onOpenStandalone={setStandaloneDraft}
                onToggleStatus={async (calendarEvent) => {
                  if (calendarEvent.status === "done") {
                    await updateCalendarEntry(calendarEvent.entryId, { status: "open" });
                  } else {
                    await completeCalendarEntry(calendarEvent.entryId);
                  }
                  await reloadAfterMutation();
                }}
                onDelete={async (entryId) => {
                  await deleteCalendarEntry(entryId);
                  await reloadAfterMutation();
                }}
                onResize={async (entryId, input) => {
                  await updateCalendarEntry(entryId, input);
                  await reloadAfterMutation();
                }}
                onDragStart={startCalendarDrag}
                onDragEnd={() => setActiveCalendarDrag(null)}
                onOpenGoogleEvent={setSelectedGoogleEvent}
                onPublishDmaxEvent={(calendarEvent) => setPublishDraft({ localEntityType: "calendar_entry", localEntityId: calendarEvent.entryId, title: calendarEvent.title })}
                onUnlinkBinding={unlinkBinding}
              />
            ))}
          </div>
        </div>
      </div>

      {standaloneDraft ? (
        <StandaloneEntryDialog
          draft={standaloneDraft}
          onCancel={() => setStandaloneDraft(null)}
          onCreate={createStandalone}
        />
      ) : null}
      {selectedGoogleEvent ? (
        <GoogleEventDialog
          event={selectedGoogleEvent}
          categories={props.categories}
          initiatives={props.initiatives}
          tasks={props.tasks}
          onAfterChange={reloadAfterMutation}
          onClose={() => setSelectedGoogleEvent(null)}
        />
      ) : null}
      {publishDraft ? (
        <PublishGoogleEventDialog
          draft={publishDraft}
          sources={writableCalendarSources}
          onCancel={() => setPublishDraft(null)}
          onCreate={async (calendarSourceId) => {
            await createGoogleEventFromDmax({
              localEntityType: publishDraft.localEntityType,
              localEntityId: publishDraft.localEntityId,
              calendarSourceId
            });
            setPublishDraft(null);
            await reloadAfterMutation();
          }}
        />
      ) : null}
    </section>
  );
}

function CalendarHeaderControls(props: {
  mode: CalendarMode;
  anchorDate: string;
  days: string[];
  onModeChange: (mode: CalendarMode) => void;
  onToday: () => void;
  onShift: (days: number) => void;
}) {
  const shiftAmount = props.mode === "week" ? 7 : 1;
  return (
    <div className="calendar-header-controls">
      <div className="segmented-control">
        <button className={props.mode === "day" ? "active" : ""} onClick={() => props.onModeChange("day")}>Tag</button>
        <button className={props.mode === "week" ? "active" : ""} onClick={() => props.onModeChange("week")}>Woche</button>
      </div>
      <div className="calendar-range-actions">
        <button className="icon-button" title="Zurueck" onClick={() => props.onShift(-shiftAmount)}>
          <ChevronLeft size={18} />
        </button>
        <button className="small-button" onClick={props.onToday}>Heute</button>
        <button className="icon-button" title="Weiter" onClick={() => props.onShift(shiftAmount)}>
          <ChevronRight size={18} />
        </button>
      </div>
      <strong>{formatCalendarRange(props.days)}</strong>
    </div>
  );
}

function CalendarAllDayEventButton(props: {
  layout: CalendarAllDayLayout;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onOpenGoogleEvent: (event: Extract<CalendarViewEvent, { source: "google" }>) => void;
}) {
  const event = props.layout.event;
  return (
    <button
      className={`calendar-all-day-event ${event.source} ${event.source === "initiative_span" && event.isLocked ? "locked" : ""} ${event.source === "initiative_span" && !event.isLocked ? "flexible" : ""}`}
      style={{
        "--calendar-event-color": eventColor(event),
        gridColumn: `${props.layout.startColumn} / ${props.layout.endColumn}`,
        gridRow: props.layout.row
      } as CSSProperties}
      title={event.source === "initiative_span" && event.isLocked ? LOCKED_TIMEFRAME_TOOLTIP : event.title}
      onClick={() => {
        if (event.source === "initiative_span") {
          props.onOpenInitiative(event.initiativeId);
        } else if (event.source === "dmax" && event.taskId) {
          props.onOpenTask(event.taskId);
        } else if (event.source === "dmax" && event.initiativeId) {
          props.onOpenInitiative(event.initiativeId);
        } else if (event.source === "google") {
          props.onOpenGoogleEvent(event);
        }
      }}
    >
      <span>{event.title}</span>
      {event.source === "initiative_span" && event.isLocked ? <Lock className="calendar-lock-icon" size={12} aria-hidden="true" /> : null}
      {event.binding ? <span className="calendar-google-badge" title="Mit Google Calendar verknüpft">G</span> : null}
    </button>
  );
}

function CalendarDayColumn(props: {
  date: string;
  events: CalendarViewEvent[];
  allEvents: CalendarViewEvent[];
  activeCalendarDrag: CalendarDragState | null;
  projectHoverInfoById: Map<number, CalendarProjectHoverInfo>;
  isToday: boolean;
  currentTimeMinutes: number;
  height: number;
  endHour: number;
  onDropEntry: (payload: CalendarDragPayload, date: string, startMinutes: number) => Promise<void>;
  onOpenStandalone: (draft: { date: string; startMinutes: number }) => void;
  onToggleStatus: (event: Extract<CalendarViewEvent, { source: "dmax" }>) => Promise<void>;
  onDelete: (entryId: number) => Promise<void>;
  onResize: (entryId: number, input: { startAt?: string; endAt?: string }) => Promise<void>;
  onDragStart: (event: DragEvent<HTMLElement>, payload: CalendarDragPayload) => void;
  onDragEnd: () => void;
  onOpenGoogleEvent: (event: Extract<CalendarViewEvent, { source: "google" }>) => void;
  onPublishDmaxEvent: (event: Extract<CalendarViewEvent, { source: "dmax" }>) => void;
  onUnlinkBinding: (bindingId: number) => Promise<void>;
}) {
  const [dragPreview, setDragPreview] = useState<CalendarDropPreview | null>(null);
  const layouts = layoutCalendarEvents(props.events);
  const previewTop = dragPreview ? (dragPreview.startMinutes - calendarStartHour * 60) * calendarPixelsPerMinute : 0;
  const previewHeight = dragPreview ? Math.max(28, (dragPreview.endMinutes - dragPreview.startMinutes) * calendarPixelsPerMinute) : 0;
  const currentTimeVisible = props.isToday && props.currentTimeMinutes >= calendarStartHour * 60 && props.currentTimeMinutes <= props.endHour * 60;
  const currentTimeTop = (props.currentTimeMinutes - calendarStartHour * 60) * calendarPixelsPerMinute;
  return (
    <div
      className={`calendar-day-column ${props.isToday ? "today" : ""} ${dragPreview ? "drag-active" : ""}`}
      style={{ height: props.height }}
      onDragOver={(event) => {
        event.preventDefault();
        const dragState = props.activeCalendarDrag ?? getCalendarDragState(event);
        if (!dragState) return;
        const { payload, offsetY } = dragState;
        const startMinutes = snappedMinutesFromDraggedTop(event.currentTarget, event.clientY, offsetY);
        const endMinutes = calendarDragEndMinutes(payload, props.date, startMinutes, props.allEvents);
        setDragPreview((current) =>
          current?.startMinutes === startMinutes && current.endMinutes === endMinutes && current.payload === payload
            ? current
            : { payload, startMinutes, endMinutes }
        );
      }}
      onDragLeave={(event) => {
        const nextTarget = event.relatedTarget;
        if (!(nextTarget instanceof Node) || !event.currentTarget.contains(nextTarget)) {
          setDragPreview(null);
        }
      }}
      onDrop={(event) => {
        event.preventDefault();
        const dragState = props.activeCalendarDrag ?? getCalendarDragState(event);
        if (!dragState) return;
        const startMinutes = dragPreview?.startMinutes ?? snappedMinutesFromDraggedTop(event.currentTarget, event.clientY, dragState.offsetY);
        setDragPreview(null);
        void props.onDropEntry(dragState.payload, props.date, startMinutes);
      }}
      onDoubleClick={(event) => {
        if (event.target !== event.currentTarget) return;
        props.onOpenStandalone({ date: props.date, startMinutes: snappedMinutesFromPointer(event.currentTarget, event.clientY) });
      }}
    >
      {Array.from({ length: props.endHour - calendarStartHour + 1 }, (_, index) => calendarStartHour + index).map((hour) => (
        <span className="calendar-hour-line" key={hour} style={{ top: (hour * 60 - calendarStartHour * 60) * calendarPixelsPerMinute }} />
      ))}
      {currentTimeVisible ? (
        <span className="calendar-current-time-line" style={{ top: currentTimeTop }} />
      ) : null}
      {dragPreview ? (
        <>
          <span className="calendar-drop-line" style={{ top: previewTop }}>
            <span>{timeFromMinutes(dragPreview.startMinutes)}</span>
          </span>
          <div
            className="calendar-drop-preview"
            style={{ top: previewTop, height: previewHeight }}
          >
            <strong>{calendarDragPreviewTitle(dragPreview.payload)}</strong>
            <span>{timeFromMinutes(dragPreview.startMinutes)}-{timeFromMinutes(dragPreview.endMinutes)}</span>
          </div>
        </>
      ) : null}
      {layouts.map((layout) => (
        <CalendarEventBlock
          key={layout.event.id}
          event={layout.event}
          layout={layout}
          onToggleStatus={props.onToggleStatus}
          onDelete={props.onDelete}
          onResize={props.onResize}
          onDragStart={props.onDragStart}
          onDragEnd={props.onDragEnd}
          projectHoverInfoById={props.projectHoverInfoById}
          onOpenGoogleEvent={props.onOpenGoogleEvent}
          onPublishDmaxEvent={props.onPublishDmaxEvent}
          onUnlinkBinding={props.onUnlinkBinding}
        />
      ))}
    </div>
  );
}

function CalendarEventBlock(props: {
  event: CalendarViewEvent;
  layout: CalendarEventLayout;
  onToggleStatus: (event: Extract<CalendarViewEvent, { source: "dmax" }>) => Promise<void>;
  onDelete: (entryId: number) => Promise<void>;
  onResize: (entryId: number, input: { startAt?: string; endAt?: string }) => Promise<void>;
  onDragStart: (event: DragEvent<HTMLElement>, payload: CalendarDragPayload) => void;
  onDragEnd: () => void;
  projectHoverInfoById: Map<number, CalendarProjectHoverInfo>;
  onOpenGoogleEvent: (event: Extract<CalendarViewEvent, { source: "google" }>) => void;
  onPublishDmaxEvent: (event: Extract<CalendarViewEvent, { source: "dmax" }>) => void;
  onUnlinkBinding: (bindingId: number) => Promise<void>;
}) {
  const event = props.event;
  const color = eventColor(event);
  const draggable = event.source === "dmax";
  const projectHoverInfo = event.source === "dmax" && event.initiativeId ? props.projectHoverInfoById.get(event.initiativeId) ?? null : null;
  const opensProjectDetail = event.source === "dmax" && Boolean(event.initiativeId) && !event.taskId;
  function openProjectDetail() {
    if (event.source === "dmax" && event.initiativeId && !event.taskId) {
      openProjectInNewTab(event.initiativeId);
    }
  }
  return (
    <article
      className={`calendar-event-block ${event.source} ${event.source === "dmax" && event.status === "done" ? "done" : ""} ${projectHoverInfo ? "has-project-info" : ""} ${opensProjectDetail ? "opens-project" : ""}`}
      draggable={draggable}
      role={opensProjectDetail ? "button" : undefined}
      tabIndex={opensProjectDetail ? 0 : undefined}
      onDragStart={(dragEvent) => {
        if (event.source !== "dmax") return;
        props.onDragStart(dragEvent, {
          kind: "entry",
          entryId: event.entryId,
          durationMinutes: Math.max(calendarSnapMinutes, durationMinutesBetween(event.startAt, event.endAt))
        });
      }}
      onDragEnd={props.onDragEnd}
      onClick={() => {
        if (event.source === "google") {
          props.onOpenGoogleEvent(event);
        } else {
          openProjectDetail();
        }
      }}
      onKeyDown={(keyEvent) => {
        if (!opensProjectDetail || (keyEvent.key !== "Enter" && keyEvent.key !== " ")) return;
        keyEvent.preventDefault();
        openProjectDetail();
      }}
      title={opensProjectDetail ? "Projekt in neuem Tab öffnen" : undefined}
      style={
        {
          top: props.layout.top,
          height: props.layout.height,
          left: `${props.layout.left}%`,
          width: `${props.layout.width}%`,
          "--calendar-event-color": color
        } as CSSProperties
      }
    >
      {event.source === "dmax" ? (
        <button className="calendar-resize-handle top" title="Start anpassen" onPointerDown={(pointerEvent) => startCalendarResize(pointerEvent, event, "top", props.onResize)} />
      ) : null}
      <div className="calendar-event-main">
        {event.source === "dmax" ? (
          <button
            className="calendar-complete-toggle"
            title={event.status === "done" ? "Wieder öffnen" : "Erledigen"}
            aria-label={event.status === "done" ? "Kalendereintrag wieder öffnen" : "Kalendereintrag erledigen"}
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              void props.onToggleStatus(event);
            }}
          >
            {event.status === "done" ? <CheckCircle2 size={15} /> : <Circle size={15} />}
          </button>
        ) : null}
        <div>
          <strong>
            {event.title}
            {event.binding ? <span className="calendar-google-badge" title="Mit Google Calendar verknüpft">G</span> : null}
          </strong>
          <span>{formatTimeRange(event.startAt, event.endAt)}</span>
        </div>
        {event.source === "dmax" ? (
          <button
            className="calendar-delete-button calendar-entry-delete-button"
            title="Kalendereintrag löschen"
            aria-label="Kalendereintrag löschen"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              void props.onDelete(event.entryId);
            }}
          >
            <Trash2 size={14} />
          </button>
        ) : null}
        {event.source === "dmax" && !event.binding ? (
          <button
            className="calendar-delete-button calendar-entry-google-button"
            title="Google Event erstellen"
            aria-label="Google Event erstellen"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              props.onPublishDmaxEvent(event);
            }}
          >
            <ExternalLink size={14} />
          </button>
        ) : null}
        {event.source === "dmax" && event.binding ? (
          <button
            className="calendar-delete-button calendar-entry-google-button"
            title="Google Verknuepfung loesen"
            aria-label="Google Verknüpfung lösen"
            onClick={(clickEvent) => {
              clickEvent.stopPropagation();
              void props.onUnlinkBinding(event.binding!.id);
            }}
          >
            <X size={14} />
          </button>
        ) : null}
      </div>
      {event.source === "dmax" ? (
        <button className="calendar-resize-handle bottom" title="Ende anpassen" onPointerDown={(pointerEvent) => startCalendarResize(pointerEvent, event, "bottom", props.onResize)} />
      ) : null}
      {projectHoverInfo ? <CalendarProjectHoverCard info={projectHoverInfo} placement="calendar" /> : null}
    </article>
  );
}

function PublishGoogleEventDialog(props: {
  draft: { localEntityType: "calendar_entry" | "initiative_project_span"; localEntityId: number; title: string };
  sources: CalendarSource[];
  onCancel: () => void;
  onCreate: (calendarSourceId: number) => Promise<void>;
}) {
  const [calendarSourceId, setCalendarSourceId] = useState<number | null>(props.sources[0]?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <form
        className="compact-modal"
        onMouseDown={(event) => event.stopPropagation()}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!calendarSourceId) return;
          try {
            setBusy(true);
            setError(null);
            await props.onCreate(calendarSourceId);
          } catch (err) {
            setError(err instanceof Error ? err.message : "Google Event konnte nicht erstellt werden.");
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2>Google Event erstellen</h2>
        <p>{props.draft.title}</p>
        {error ? <div className="error-banner">{error}</div> : null}
        {props.sources.length === 0 ? (
          <div className="config-hint">Keine schreibbare Google Kalenderquelle konfiguriert.</div>
        ) : (
          <select value={calendarSourceId ?? ""} onChange={(event) => setCalendarSourceId(Number(event.target.value))}>
            {props.sources.map((source) => (
              <option key={source.id} value={source.id}>{source.displayName}</option>
            ))}
          </select>
        )}
        <div className="modal-actions">
          <button type="button" className="secondary-action compact" onClick={props.onCancel}>Abbrechen</button>
          <button type="submit" className="primary-action compact" disabled={!calendarSourceId || busy}>Erstellen</button>
        </div>
      </form>
    </div>
  );
}

function GoogleEventDialog(props: {
  event: Extract<CalendarViewEvent, { source: "google" }>;
  categories: Category[];
  initiatives: Initiative[];
  tasks: Task[];
  onAfterChange: () => Promise<void>;
  onClose: () => void;
}) {
  const event = props.event;
  const projectSpanCandidate = isGoogleProjectSpanCandidate(event);
  const projectInitiatives = props.initiatives.filter((initiative) => initiative.type === "project");
  const [title, setTitle] = useState(event.title);
  const [startAt, setStartAt] = useState(projectSpanCandidate ? datePart(event.startAt) : event.startAt.slice(0, 16));
  const [endAt, setEndAt] = useState(projectSpanCandidate ? datePart(event.endAt) : event.endAt.slice(0, 16));
  const [projectId, setProjectId] = useState<number | null>(projectInitiatives[0]?.id ?? null);
  const [taskId, setTaskId] = useState<number | null>(props.tasks[0]?.id ?? null);
  const [categoryId, setCategoryId] = useState<number | null>(props.categories[0]?.id ?? null);
  const [newTaskTitle, setNewTaskTitle] = useState(event.title);
  const [newProjectName, setNewProjectName] = useState(event.title);
  const [initialDirection, setInitialDirection] = useState<"google_to_dmax" | "dmax_to_google">("google_to_dmax");
  const [linkMode, setLinkMode] = useState<GoogleEventLinkMode>("none");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function runMutation(action: () => Promise<void>) {
    try {
      setBusy(true);
      setError(null);
      await action();
      await props.onAfterChange();
      props.onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Kalenderaktion fehlgeschlagen.");
    } finally {
      setBusy(false);
    }
  }

  const googlePayload = {
    calendarSourceId: event.sourceId,
    externalCalendarId: event.externalCalendarId,
    externalEventId: event.externalEventId,
    externalEtag: event.etag,
    externalUpdatedAt: event.updatedAt,
    title: title.trim() || event.title,
    startAt: projectSpanCandidate ? startAt : `${startAt}:00.000`,
    endAt: projectSpanCandidate ? endAt : `${endAt}:00.000`,
    allDay: projectSpanCandidate
  };

  const originalComparableStartAt = projectSpanCandidate ? datePart(event.startAt) : event.startAt;
  const originalComparableEndAt = projectSpanCandidate ? datePart(event.endAt) : event.endAt;
  const googleEventChanged = title.trim() !== event.title || googlePayload.startAt !== originalComparableStartAt || googlePayload.endAt !== originalComparableEndAt;

  function validateSave(): string | null {
    if (event.editable && !title.trim()) return "Titel darf nicht leer sein.";
    if (linkMode === "existing_project" && !projectId) return "Bitte ein Projekt auswählen.";
    if (linkMode === "new_project" && (!categoryId || !newProjectName.trim())) return "Bitte Kategorie und Projektname ausfüllen.";
    if (linkMode === "project_entry" && !projectId) return "Bitte ein Projekt auswählen.";
    if (linkMode === "existing_task" && !taskId) return "Bitte einen Task auswählen.";
    if (linkMode === "new_task" && (!projectId || !newTaskTitle.trim())) return "Bitte Projekt und Task-Titel ausfüllen.";
    return null;
  }

  async function saveGoogleEventDialog() {
    const validationError = validateSave();
    if (validationError) {
      setError(validationError);
      return;
    }
    await runMutation(async () => {
      if (event.editable && googleEventChanged) {
        await updateGoogleOnlyEvent({
          calendarSourceId: event.sourceId,
          externalEventId: event.externalEventId,
          title: googlePayload.title,
          startAt: googlePayload.startAt,
          endAt: googlePayload.endAt,
          allDay: googlePayload.allDay
        });
      }
      if (!event.recurring && !event.binding && linkMode !== "none") {
        if (linkMode === "existing_project") {
          await linkGoogleEventFromGoogle({ ...googlePayload, initialDirection, target: { type: "existing_project_span", initiativeId: projectId! } });
        } else if (linkMode === "new_project") {
          await linkGoogleEventFromGoogle({ ...googlePayload, target: { type: "new_project", categoryId: categoryId!, name: newProjectName.trim() } });
        } else if (linkMode === "project_entry") {
          await linkGoogleEventFromGoogle({ ...googlePayload, target: { type: "existing_project_entry", initiativeId: projectId! } });
        } else if (linkMode === "existing_task") {
          await linkGoogleEventFromGoogle({ ...googlePayload, target: { type: "existing_task_entry", taskId: taskId! } });
        } else if (linkMode === "new_task") {
          await linkGoogleEventFromGoogle({ ...googlePayload, target: { type: "new_task_entry", initiativeId: projectId!, title: newTaskTitle.trim() } });
        }
      }
    });
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="compact-modal google-event-modal" role="dialog" aria-modal="true" aria-label="Google calendar event" onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}>
        <header className="google-event-modal-header">
          <div>
            <span>Google Calendar</span>
            <strong>{event.title}</strong>
          </div>
          <button className="icon-button" type="button" title="Schließen" onClick={props.onClose}>
            <X size={16} />
          </button>
        </header>
        <dl className="google-event-meta">
          <div>
            <dt>Kalender</dt>
            <dd>{event.sourceDisplayName}</dd>
          </div>
          <div>
            <dt>Zeit</dt>
            <dd>{projectSpanCandidate ? `${formatDateOnly(datePart(event.startAt))}-${formatDateOnly(datePart(event.endAt))}` : formatTimeRange(event.startAt, event.endAt)}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{googleEventReadOnlyLabel(event)}</dd>
          </div>
          {event.organizer ? (
            <div>
              <dt>Organisator</dt>
              <dd>{formatGoogleCalendarPerson(event.organizer)}</dd>
            </div>
          ) : null}
          {event.attendees.length > 0 ? (
            <div>
              <dt>Gäste</dt>
              <dd className="google-event-attendee-list">
                {event.attendees.map((attendee, index) => (
                  <span key={`${attendee.email ?? attendee.displayName ?? "guest"}-${index}`}>
                    {formatGoogleCalendarAttendee(attendee)}
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {event.recurring ? (
            <div>
              <dt>Serie</dt>
              <dd>Wiederkehrend, noch nicht in DMAX integrierbar</dd>
            </div>
          ) : null}
          {event.updatedAt ? (
            <div>
              <dt>Google aktualisiert</dt>
              <dd>{formatDateTimeForUi(event.updatedAt)}</dd>
            </div>
          ) : null}
        </dl>
        {error ? <div className="error-banner">{error}</div> : null}
        {event.editable ? (
          <form
            className="google-event-edit-form"
            onSubmit={(submitEvent) => {
              submitEvent.preventDefault();
              void saveGoogleEventDialog();
            }}
          >
            <label className="google-event-field">
              <span>Titel</span>
              <input value={title} disabled={busy} onChange={(inputEvent) => setTitle(inputEvent.target.value)} />
            </label>
            <div className="google-event-date-grid">
              <label className="google-event-field">
                <span>Start</span>
                <input type={projectSpanCandidate ? "date" : "datetime-local"} value={startAt} disabled={busy} onChange={(inputEvent) => setStartAt(inputEvent.target.value)} />
              </label>
              <label className="google-event-field">
                <span>Ende</span>
                <input type={projectSpanCandidate ? "date" : "datetime-local"} value={endAt} disabled={busy} onChange={(inputEvent) => setEndAt(inputEvent.target.value)} />
              </label>
            </div>
          </form>
        ) : null}
        {!event.recurring && !event.binding ? (
          <div className="google-event-link-actions">
            {projectSpanCandidate ? (
              <>
                <div className="segmented-control google-event-link-mode-control">
                  <button type="button" className={linkMode === "existing_project" ? "active" : ""} onClick={() => setLinkMode(linkMode === "existing_project" ? "none" : "existing_project")}>
                    Mit Projekt verknüpfen
                  </button>
                  <button type="button" className={linkMode === "new_project" ? "active" : ""} onClick={() => setLinkMode(linkMode === "new_project" ? "none" : "new_project")}>
                    Neues Projekt
                  </button>
                </div>
                {linkMode === "existing_project" ? (
                  <section className="google-event-link-section">
                    <div className="google-event-section-title">
                      <strong>Mit bestehendem Projekt verknüpfen</strong>
                      <span>Dieses Google-Ganztags- oder Mehrtags-Event wird mit der Projekt-Zeitspanne verbunden.</span>
                    </div>
                    <label className="google-event-field">
                      <span>Projekt</span>
                      <select value={projectId ?? ""} onChange={(inputEvent) => setProjectId(Number(inputEvent.target.value))}>
                        {projectInitiatives.map((initiative) => <option key={initiative.id} value={initiative.id}>{displayInitiativeName(initiative)}</option>)}
                      </select>
                    </label>
                    <div className="google-event-field">
                      <span>Sync-Richtung</span>
                      <div className="segmented-control google-event-direction-control">
                        <button
                          type="button"
                          className={initialDirection === "google_to_dmax" ? "active" : ""}
                          onClick={() => setInitialDirection("google_to_dmax")}
                        >
                          Google -&gt; DMAX
                        </button>
                        <button
                          type="button"
                          className={initialDirection === "dmax_to_google" ? "active" : ""}
                          onClick={() => setInitialDirection("dmax_to_google")}
                        >
                          DMAX -&gt; Google
                        </button>
                      </div>
                      <small className={initialDirection === "dmax_to_google" ? "google-event-sync-hint warning" : "google-event-sync-hint"}>
                        {initialDirection === "google_to_dmax"
                          ? "Projektname und Zeitraum werden aus Google übernommen."
                          : "Google-Event wird mit Projektname und Projektzeitraum überschrieben."}
                      </small>
                    </div>
                  </section>
                ) : null}
                {linkMode === "new_project" ? (
                  <section className="google-event-link-section">
                    <div className="google-event-section-title">
                      <strong>Neues Projekt aus Google erstellen</strong>
                      <span>DMAX übernimmt Titel und Datumszeitraum dieses Google-Events als neues Projekt.</span>
                    </div>
                    <label className="google-event-field">
                      <span>Kategorie</span>
                      <select value={categoryId ?? ""} onChange={(inputEvent) => setCategoryId(Number(inputEvent.target.value))}>
                        {props.categories.map((category) => <option key={category.id} value={category.id}>{category.name}</option>)}
                      </select>
                    </label>
                    <label className="google-event-field">
                      <span>Projektname</span>
                      <input value={newProjectName} onChange={(inputEvent) => setNewProjectName(inputEvent.target.value)} />
                    </label>
                  </section>
                ) : null}
              </>
            ) : (
              <>
                <div className="segmented-control google-event-link-mode-control">
                  <button type="button" className={linkMode === "project_entry" ? "active" : ""} onClick={() => setLinkMode(linkMode === "project_entry" ? "none" : "project_entry")}>
                    Projekttermin
                  </button>
                  <button type="button" className={linkMode === "existing_task" ? "active" : ""} onClick={() => setLinkMode(linkMode === "existing_task" ? "none" : "existing_task")}>
                    Bestehender Task
                  </button>
                  <button type="button" className={linkMode === "new_task" ? "active" : ""} onClick={() => setLinkMode(linkMode === "new_task" ? "none" : "new_task")}>
                    Neuer Task
                  </button>
                </div>
                {linkMode === "project_entry" ? (
                  <section className="google-event-link-section">
                    <div className="google-event-section-title">
                      <strong>Als Projekttermin übernehmen</strong>
                      <span>DMAX erstellt einen Arbeitsblock unter einem bestehenden Projekt.</span>
                    </div>
                    <label className="google-event-field">
                      <span>Projekt</span>
                      <select value={projectId ?? ""} onChange={(inputEvent) => setProjectId(Number(inputEvent.target.value))}>
                        {projectInitiatives.map((initiative) => <option key={initiative.id} value={initiative.id}>{displayInitiativeName(initiative)}</option>)}
                      </select>
                    </label>
                  </section>
                ) : null}
                {linkMode === "existing_task" ? (
                  <section className="google-event-link-section">
                    <div className="google-event-section-title">
                      <strong>Als Task-Termin übernehmen</strong>
                      <span>DMAX erstellt einen Arbeitsblock für einen bestehenden Task.</span>
                    </div>
                    <label className="google-event-field">
                      <span>Bestehender Task</span>
                      <select value={taskId ?? ""} onChange={(inputEvent) => setTaskId(Number(inputEvent.target.value))}>
                        {props.tasks.map((task) => <option key={task.id} value={task.id}>{task.title}</option>)}
                      </select>
                    </label>
                  </section>
                ) : null}
                {linkMode === "new_task" ? (
                  <section className="google-event-link-section">
                    <div className="google-event-section-title">
                      <strong>Neuen Task aus Google erstellen</strong>
                      <span>DMAX erstellt einen Task und verknüpft diesen Termin damit.</span>
                    </div>
                    <label className="google-event-field">
                      <span>Projekt</span>
                      <select value={projectId ?? ""} onChange={(inputEvent) => setProjectId(Number(inputEvent.target.value))}>
                        {projectInitiatives.map((initiative) => <option key={initiative.id} value={initiative.id}>{displayInitiativeName(initiative)}</option>)}
                      </select>
                    </label>
                    <label className="google-event-field">
                      <span>Task-Titel</span>
                      <input value={newTaskTitle} onChange={(inputEvent) => setNewTaskTitle(inputEvent.target.value)} />
                    </label>
                  </section>
                ) : null}
              </>
            )}
          </div>
        ) : null}
        <div className="modal-actions">
          {event.binding ? (
            <button type="button" className="secondary-action compact" disabled={busy} onClick={() => void runMutation(() => unlinkCalendarBinding(event.binding!.id, { deleteGoogleEvent: window.confirm("Google Event ebenfalls löschen?") }))}>
              Verknüpfung lösen
            </button>
          ) : null}
          {event.htmlLink ? (
            <a className="secondary-action compact" href={event.htmlLink} target="_blank" rel="noreferrer">
              <ExternalLink size={15} />
              In Google öffnen
            </a>
          ) : null}
          <button type="button" className="primary-action compact" disabled={busy || (event.editable && !title.trim())} onClick={() => void saveGoogleEventDialog()}>Speichern</button>
        </div>
      </section>
    </div>
  );
}

function CalendarProjectHoverCard({
  info,
  placement,
  visible = false,
  style
}: {
  info: CalendarProjectHoverInfo;
  placement: "sidebar" | "calendar";
  visible?: boolean;
  style?: CSSProperties;
}) {
  return (
    <div className={`calendar-project-hover-card ${placement} ${visible ? "visible" : ""}`} role="tooltip" style={style}>
      <strong>{info.name}</strong>
      <dl>
        <div>
          <dt>Kategorie</dt>
          <dd>{info.categoryName}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>{info.statusLabel}</dd>
        </div>
        {info.dateRange ? (
          <div>
            <dt>Zeitraum</dt>
            <dd>{info.dateRange}</dd>
          </div>
        ) : null}
        <div>
          <dt>Offene Tasks</dt>
          <dd>{info.openTaskCount}</dd>
        </div>
      </dl>
      {info.summary ? <p>{info.summary}</p> : null}
    </div>
  );
}

function StandaloneEntryDialog(props: {
  draft: { date: string; startMinutes: number };
  onCancel: () => void;
  onCreate: (title: string) => Promise<void>;
}) {
  const [title, setTitle] = useState("");
  return (
    <div className="modal-backdrop">
      <form
        className="compact-modal"
        onSubmit={(event) => {
          event.preventDefault();
          void props.onCreate(title);
        }}
      >
        <h3>Termin</h3>
        <p>{formatDateOnly(props.draft.date)} · {timeFromMinutes(props.draft.startMinutes)}</p>
        <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Titel" autoFocus />
        <div className="modal-actions">
          <button type="button" className="secondary-action compact" onClick={props.onCancel}>Abbrechen</button>
          <button type="submit" className="primary-action compact" disabled={!title.trim()}>Anlegen</button>
        </div>
      </form>
    </div>
  );
}


function firstMarkdownLine(markdown: string): string {
  return markdown.split("\n").map((line) => line.trim()).find((line) => line && !line.startsWith("#")) ?? "";
}

function displayInitiativeName(initiative: Initiative): string {
  return initiative.name;
}

function formatInitiativeDateRangeForUi(initiative: Initiative): string | null {
  return initiative.startDate && initiative.endDate ? `${formatDateOnly(initiative.startDate)} - ${formatDateOnly(initiative.endDate)}` : null;
}

function projectTimeframeIncludesDate(initiative: Initiative, date: string): boolean {
  if (!initiative.startDate && !initiative.endDate) return false;
  if (initiative.startDate && initiative.startDate > date) return false;
  if (initiative.endDate && initiative.endDate < date) return false;
  return true;
}

function openProjectInNewTab(initiativeId: number): void {
  window.open(`/projects/${initiativeId}`, "_blank", "noopener,noreferrer");
}

function dateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateOnly(value: string): string {
  const date = parseDateOnlyUtc(value.slice(0, 10));
  return date ? date.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }) : value;
}

function formatTimeRange(startAt: string, endAt: string): string {
  return `${startAt.slice(11, 16)}-${endAt.slice(11, 16)}`;
}

function formatCalendarDayName(value: string): string {
  const date = parseDateOnlyUtc(value);
  return date ? date.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" }) : value;
}

function formatCalendarRange(days: string[]): string {
  if (days.length === 0) return "";
  if (days.length === 1) return formatDateOnly(days[0]!);
  return `${formatDateOnly(days[0]!)} - ${formatDateOnly(days.at(-1)!)}`;
}

function parseDateOnlyUtc(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return Number.isNaN(date.getTime()) ? null : date;
}

function shiftDate(value: string, days: number): string {
  const date = parseDateOnlyUtc(value) ?? new Date();
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysInRange(start: string, end: string): string[] {
  const days: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    days.push(cursor);
    cursor = shiftDate(cursor, 1);
  }
  return days;
}

function calendarVisibleRange(anchorDate: string, mode: CalendarMode): { start: string; end: string } {
  if (mode === "day") {
    return { start: anchorDate, end: anchorDate };
  }
  const date = parseDateOnlyUtc(anchorDate) ?? new Date();
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const start = shiftDate(date.toISOString().slice(0, 10), mondayOffset);
  return { start, end: shiftDate(start, 6) };
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

function minutesFromDateTime(value: string): number {
  const hours = Number(value.slice(11, 13));
  const minutes = Number(value.slice(14, 16));
  return (Number.isFinite(hours) ? hours : 0) * 60 + (Number.isFinite(minutes) ? minutes : 0);
}

function timeFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function dateTimeFromMinutes(date: string, minutes: number): string {
  return `${date}T${timeFromMinutes(minutes)}:00.000`;
}

function durationMinutesBetween(startAt: string, endAt: string): number {
  return Math.max(calendarSnapMinutes, minutesFromDateTime(endAt) - minutesFromDateTime(startAt));
}

function formatDateTimeForUi(value: string): string {
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function calendarDragOffsetY(event: DragEvent<HTMLElement>): number {
  const rect = event.currentTarget.getBoundingClientRect();
  return Math.max(0, Math.min(rect.height, event.clientY - rect.top));
}

function setCalendarDragData(event: DragEvent<HTMLElement>, payload: CalendarDragPayload, offsetY: number): void {
  event.dataTransfer.effectAllowed = "copyMove";
  event.dataTransfer.setData("application/x-dmax-calendar", JSON.stringify(payload));
  event.dataTransfer.setData("application/x-dmax-calendar-offset-y", String(offsetY));
}

function getCalendarDragData(event: DragEvent<HTMLElement>): CalendarDragPayload | null {
  const raw = event.dataTransfer.getData("application/x-dmax-calendar");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as CalendarDragPayload;
    return parsed && typeof parsed === "object" && "kind" in parsed ? parsed : null;
  } catch {
    return null;
  }
}

function getCalendarDragState(event: DragEvent<HTMLElement>): CalendarDragState | null {
  const payload = getCalendarDragData(event);
  if (!payload) return null;
  const rawOffsetY = Number(event.dataTransfer.getData("application/x-dmax-calendar-offset-y"));
  return { payload, offsetY: Number.isFinite(rawOffsetY) ? Math.max(0, rawOffsetY) : 0 };
}

function snappedMinutesFromPointer(element: HTMLElement, clientY: number): number {
  const rect = element.getBoundingClientRect();
  const minutes = calendarStartHour * 60 + (clientY - rect.top + element.scrollTop) / calendarPixelsPerMinute;
  return Math.max(0, Math.round(minutes / calendarSnapMinutes) * calendarSnapMinutes);
}

function snappedMinutesFromDraggedTop(element: HTMLElement, clientY: number, offsetY: number): number {
  return Math.max(calendarStartHour * 60, snappedMinutesFromPointer(element, clientY - offsetY));
}

function boundedEndMinutes(date: string, startMinutes: number, events: CalendarViewEvent[]): number {
  const defaultEnd = startMinutes + calendarDefaultDurationMinutes;
  const followerStart = events
    .filter((event) => !event.allDay && datePart(event.startAt) === date)
    .map((event) => minutesFromDateTime(event.startAt))
    .filter((minutes) => minutes > startMinutes && minutes < defaultEnd)
    .sort((left, right) => left - right)[0];
  return followerStart ?? defaultEnd;
}

function calendarDragEndMinutes(payload: CalendarDragPayload, date: string, startMinutes: number, events: CalendarViewEvent[]): number {
  if (payload.kind === "entry") {
    return startMinutes + payload.durationMinutes;
  }
  return boundedEndMinutes(date, startMinutes, events);
}

function calendarDragPreviewTitle(payload: CalendarDragPayload): string {
  if (payload.kind === "initiative") {
    return `Projekt: ${payload.title}`;
  }
  if (payload.kind === "task") {
    return payload.title;
  }
  return "Termin verschieben";
}

function layoutAllDayEvents(events: CalendarViewEvent[], days: string[]): CalendarAllDayLayout[] {
  if (days.length === 0) return [];
  const firstDay = days[0]!;
  const lastDay = days[days.length - 1]!;
  const visibleEvents = events
    .filter((event) => isCalendarAllDayLaneEvent(event) && datePart(event.startAt) <= lastDay && datePart(event.endAt) >= firstDay)
    .map((event) => {
      const startDay = datePart(event.startAt) < firstDay ? firstDay : datePart(event.startAt);
      const endDay = datePart(event.endAt) > lastDay ? lastDay : datePart(event.endAt);
      const startIndex = days.indexOf(startDay);
      const endIndex = days.indexOf(endDay);
      return startIndex >= 0 && endIndex >= startIndex
        ? { event, startColumn: startIndex + 1, endColumn: endIndex + 2 }
        : null;
    })
    .filter((layout): layout is Omit<CalendarAllDayLayout, "row"> => Boolean(layout))
    .sort((left, right) =>
      left.startColumn - right.startColumn
      || right.endColumn - left.endColumn
      || left.event.title.localeCompare(right.event.title)
    );

  const rowEndColumns: number[] = [];
  return visibleEvents.map((layout) => {
    let rowIndex = rowEndColumns.findIndex((endColumn) => endColumn <= layout.startColumn);
    if (rowIndex === -1) {
      rowIndex = rowEndColumns.length;
    }
    rowEndColumns[rowIndex] = layout.endColumn;
    return { ...layout, row: rowIndex + 1 };
  });
}

function isCalendarAllDayLaneEvent(event: CalendarViewEvent): boolean {
  return event.allDay || datePart(event.startAt) !== datePart(event.endAt);
}

function isGoogleProjectSpanCandidate(event: Extract<CalendarViewEvent, { source: "google" }>): boolean {
  return event.allDay || datePart(event.startAt) !== datePart(event.endAt);
}

function isFixedCalendarLaneEvent(event: CalendarViewEvent): boolean {
  if (!isCalendarAllDayLaneEvent(event)) {
    return false;
  }
  return event.source !== "initiative_span" || event.isLocked;
}

function isFlexibleCalendarLaneEvent(event: CalendarViewEvent): boolean {
  return isCalendarAllDayLaneEvent(event) && event.source === "initiative_span" && !event.isLocked;
}

function layoutCalendarEvents(events: CalendarViewEvent[]): CalendarEventLayout[] {
  const sorted = [...events].sort((left, right) => minutesFromDateTime(left.startAt) - minutesFromDateTime(right.startAt));
  const groups: CalendarViewEvent[][] = [];
  let currentGroup: CalendarViewEvent[] = [];
  let currentEnd = -1;

  for (const event of sorted) {
    const start = minutesFromDateTime(event.startAt);
    const end = eventEndMinutes(event);
    if (currentGroup.length === 0 || start < currentEnd) {
      currentGroup.push(event);
      currentEnd = Math.max(currentEnd, end);
    } else {
      groups.push(currentGroup);
      currentGroup = [event];
      currentEnd = end;
    }
  }
  if (currentGroup.length) groups.push(currentGroup);

  return groups.flatMap((group) => {
    const columns: CalendarViewEvent[][] = [];
    const placements = new Map<string, number>();
    for (const event of group) {
      const start = minutesFromDateTime(event.startAt);
      let columnIndex = columns.findIndex((column) => {
        const last = column.at(-1);
        return !last || eventEndMinutes(last) <= start;
      });
      if (columnIndex === -1) {
        columnIndex = columns.length;
        columns.push([]);
      }
      columns[columnIndex]!.push(event);
      placements.set(event.id, columnIndex);
    }
    const columnCount = Math.max(columns.length, 1);
    return group.map((event) => {
      const start = minutesFromDateTime(event.startAt);
      const end = eventEndMinutes(event);
      const top = (start - calendarStartHour * 60) * calendarPixelsPerMinute;
      const height = Math.max(28, (end - start) * calendarPixelsPerMinute);
      const columnIndex = placements.get(event.id) ?? 0;
      return {
        event,
        top,
        height,
        left: (columnIndex / columnCount) * 100,
        width: 100 / columnCount
      };
    });
  });
}

function startCalendarResize(
  event: ReactPointerEvent<HTMLButtonElement>,
  calendarEvent: Extract<CalendarViewEvent, { source: "dmax" }>,
  edge: "top" | "bottom",
  onResize: (entryId: number, input: { startAt?: string; endAt?: string }) => Promise<void>
): void {
  event.preventDefault();
  event.stopPropagation();
  const initialY = event.clientY;
  const initialStart = minutesFromDateTime(calendarEvent.startAt);
  const initialEnd = minutesFromDateTime(calendarEvent.endAt);
  const date = datePart(calendarEvent.startAt);

  const onPointerMove = (moveEvent: PointerEvent) => {
    moveEvent.preventDefault();
  };
  const onPointerUp = (upEvent: PointerEvent) => {
    const deltaMinutes = Math.round(((upEvent.clientY - initialY) / calendarPixelsPerMinute) / calendarSnapMinutes) * calendarSnapMinutes;
    if (edge === "top") {
      const nextStart = Math.min(initialEnd - calendarSnapMinutes, Math.max(0, initialStart + deltaMinutes));
      void onResize(calendarEvent.entryId, { startAt: dateTimeFromMinutes(date, nextStart) });
    } else {
      const nextEnd = Math.max(initialStart + calendarSnapMinutes, initialEnd + deltaMinutes);
      void onResize(calendarEvent.entryId, { endAt: dateTimeFromMinutes(date, nextEnd) });
    }
    window.removeEventListener("pointermove", onPointerMove);
    window.removeEventListener("pointerup", onPointerUp);
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", onPointerUp);
}

function eventEndMinutes(event: CalendarViewEvent): number {
  return minutesFromDateTime(event.startAt) + durationMinutesBetween(event.startAt, event.endAt);
}

function eventColor(event: CalendarViewEvent): string {
  return event.color ?? (event.source === "google" ? "#5167b8" : event.source === "initiative_span" ? "#27806f" : "#101714");
}

function calendarWarningKey(warning: CalendarViewData["warnings"][number]): string {
  return `${warning.scope}:${warning.sourceId ?? "global"}:${warning.message}`;
}

function googleEventReadOnlyLabel(event: Extract<CalendarViewEvent, { source: "google" }>): string {
  if (event.editable) {
    return "Bearbeitbar";
  }
  if (event.recurring || event.readOnlyReason === "recurring_not_supported") {
    return "Read-only: wiederkehrender Termin";
  }
  if (event.readOnlyReason === "source_read_only") {
    return "Read-only: Kalenderquelle";
  }
  if (event.readOnlyReason === "external_organizer") {
    return "Read-only: externer Organizer";
  }
  if (event.readOnlyReason === "oauth_scope_missing") {
    return "Read-only: Google neu verbinden";
  }
  return "Read-only";
}

function formatGoogleCalendarPerson(person: { email: string | null; displayName: string | null; self: boolean }): string {
  const label = person.displayName?.trim() || person.email?.trim() || "Unbekannt";
  const email = person.email?.trim();
  const suffix = person.self ? " (du)" : "";
  return email && label !== email ? `${label} <${email}>${suffix}` : `${label}${suffix}`;
}

function formatGoogleCalendarAttendee(attendee: { email: string | null; displayName: string | null; self: boolean; responseStatus: string | null; optional: boolean }): string {
  const status = attendee.responseStatus ? `, ${googleAttendeeResponseLabel(attendee.responseStatus)}` : "";
  const optional = attendee.optional ? ", optional" : "";
  return `${formatGoogleCalendarPerson(attendee)}${status}${optional}`;
}

function googleAttendeeResponseLabel(status: string): string {
  if (status === "accepted") return "zugesagt";
  if (status === "declined") return "abgesagt";
  if (status === "tentative") return "vielleicht";
  if (status === "needsAction") return "offen";
  return status;
}
