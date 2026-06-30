import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, FocusEvent as ReactFocusEvent, PointerEvent as ReactPointerEvent, WheelEvent as ReactWheelEvent } from "react";
import { ExternalLink, Eye, EyeOff, Lock, Pencil, Plus, RefreshCw, Trash2, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  classifyPlanningCanvasSpecialGoogleEvent
} from "../../planning-canvas-special-google-events.js";
import type {
  PlanningCanvasSpecialGoogleEventMatch
} from "../../planning-canvas-special-google-events.js";
import {
  createGoogleOnlyEvent,
  createInitiative,
  createInitiativeRelation,
  createPlanningCanvasNode,
  fetchCalendarSources,
  fetchCalendarView,
  fetchHiddenCalendarEvents,
  fetchPlanningCanvas,
  hideCalendarEvent,
  unhideCalendarEvent,
  unlinkCalendarBinding,
  updateGoogleOnlyEvent,
  updateInitiative,
  updatePlanningCanvasNode
} from "../../api.js";
import { EmptyState } from "../../components/ui/index.js";
import type {
  CalendarEventVisibility,
  CalendarEventVisibilityHiddenScope,
  CalendarSource,
  CalendarViewEvent,
  Category,
  Initiative,
  PlanningCanvasInitiativeNode,
  PlanningCanvasRelationEdge,
  PlanningCanvasViewData,
  ProjectPhase
} from "../../types.js";

type CreateInitiativeInput = {
  categoryId: number;
  parentId?: number | null;
  type: Initiative["type"];
  projectPhase?: ProjectPhase;
  name: string;
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
  isLocked?: boolean;
};
type UpdateInitiativeInput = {
  categoryId?: number;
  parentId?: number | null;
  type?: Initiative["type"];
  projectPhase?: ProjectPhase;
  name?: string;
  status?: Initiative["status"];
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
  isLocked?: boolean;
};

const LOCKED_TIMEFRAME_TOOLTIP = "Zeitraum ist gesperrt und kann nicht verschoben werden";
const LOCKED_CANVAS_TIMEFRAME_TOOLTIP = "Zeitraum ist gesperrt; Projekt kann nur vertikal verschoben werden";
const projectPhaseOptions: Array<{ value: ProjectPhase; label: string }> = [
  { value: "planning", label: "Planning" },
  { value: "doing", label: "Doing" }
];

type PlanningCanvasRelatedProjectDirection = "predecessor" | "successor";
type PlanningCanvasTimeDragMode = "move" | "resize-start" | "resize-end" | "move-start" | "move-end";
type PlanningCanvasGoogleTimeDragMode = "resize-start" | "resize-end";
type PlanningCanvasTimeDragState = {
  nodeId: number;
  initiativeId: number;
  pointerId: number;
  mode: PlanningCanvasTimeDragMode;
  startClientX: number;
  startClientY: number;
  originY: number;
  originStartDate: string | null;
  originEndDate: string | null;
  locksTimeframe: boolean;
  draftY: number;
  draftStartDate: string | null;
  draftEndDate: string | null;
  moved: boolean;
};
type PlanningCanvasGoogleTimeDragState = {
  eventId: string;
  pointerId: number;
  mode: PlanningCanvasGoogleTimeDragMode;
  startClientX: number;
  originStartDate: string;
  originEndDate: string;
  draftStartDate: string;
  draftEndDate: string;
  moved: boolean;
};
type PlanningCanvasGoogleTimeChangeDraft = {
  event: Extract<CalendarViewEvent, { source: "google" }>;
  originStartDate: string;
  originEndDate: string;
  nextStartDate: string;
  nextEndDate: string;
};
type PlanningCanvasGoogleCreateDragState = {
  pointerId: number;
  row: number;
  startClientX: number;
  startDate: string;
  draftEndDate: string;
  moved: boolean;
};
type PlanningCanvasGoogleCreateDraft = {
  row: number;
  title: string;
  calendarSourceId: number | null;
  startDate: string;
  endDate: string;
};
type PlanningCanvasGroupDragState = {
  pointerId: number;
  startClientY: number;
  nodeIds: number[];
  openOnClickInitiativeId?: number;
  originYByNodeId: Record<number, number>;
  draftYByNodeId: Record<number, number>;
  moved: boolean;
};

export function PlanningCanvasView(props: {
  categories: Category[];
  onOpenInitiative: (initiativeId: number) => void;
  onAfterChange: () => Promise<void>;
}) {
  const stageRef = useRef<HTMLDivElement | null>(null);
  const canvasZoomRef = useRef(1);
  const parkingDragRef = useRef(false);
  const canvasGesturePointersRef = useRef(new Map<number, { x: number; y: number }>());
  const canvasGestureRef = useRef<
    | { mode: "pan"; pointerId: number; lastX: number; lastY: number }
    | { mode: "pinch"; distance: number; zoom: number; centerX: number; centerY: number }
    | null
  >(null);
  const [view, setView] = useState<PlanningCanvasViewData | null>(null);
  const [editingNode, setEditingNode] = useState<PlanningCanvasInitiativeNode | null>(null);
  const [creatingRelatedProject, setCreatingRelatedProject] = useState<{
    anchor: PlanningCanvasInitiativeNode;
    direction: PlanningCanvasRelatedProjectDirection;
  } | null>(null);
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState<number | "all">("all");
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [timeDrag, setTimeDrag] = useState<PlanningCanvasTimeDragState | null>(null);
  const [groupDrag, setGroupDrag] = useState<PlanningCanvasGroupDragState | null>(null);
  const [googleTimeDrag, setGoogleTimeDrag] = useState<PlanningCanvasGoogleTimeDragState | null>(null);
  const [googleCreateDrag, setGoogleCreateDrag] = useState<PlanningCanvasGoogleCreateDragState | null>(null);
  const [pendingGoogleTimeChange, setPendingGoogleTimeChange] = useState<PlanningCanvasGoogleTimeChangeDraft | null>(null);
  const [pendingGoogleCreate, setPendingGoogleCreate] = useState<PlanningCanvasGoogleCreateDraft | null>(null);
  const [editingGoogleEvent, setEditingGoogleEvent] = useState<Extract<CalendarViewEvent, { source: "google" }> | null>(null);
  const [googleMutationBusy, setGoogleMutationBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarEvents, setCalendarEvents] = useState<CalendarViewEvent[]>([]);
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([]);
  const [hiddenGoogleEvents, setHiddenGoogleEvents] = useState<CalendarEventVisibility[]>([]);
  const [showHiddenGoogleEvents, setShowHiddenGoogleEvents] = useState(false);
  const [recurringHideTarget, setRecurringHideTarget] = useState<Extract<CalendarViewEvent, { source: "google" }> | null>(null);

  const loadCanvas = async () => {
    try {
      setError(null);
      const next = await fetchPlanningCanvas({
        search,
        categoryId: categoryId === "all" ? undefined : categoryId
      });
      setView(next);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Planning Canvas konnte nicht geladen werden.");
    }
  };

  useEffect(() => {
    void loadCanvas();
  }, [search, categoryId]);

  const nodes = view?.nodes ?? [];
  const nodeByInitiative = useMemo(() => new Map(nodes.map((node) => [node.initiativeId, node])), [nodes]);
  const canvasRange = useMemo(() => planningCanvasRange(PLANNING_CANVAS_MONTH_COUNT), []);
  const monthLabels = useMemo(() => planningCanvasMonths(canvasRange), [canvasRange]);
  const weekLabels = useMemo(() => planningCanvasWeeks(canvasRange), [canvasRange]);
  const weekendSpans = useMemo(() => planningCanvasWeekends(canvasRange), [canvasRange]);
  const todayX = useMemo(() => planningCanvasDateX(dateOnlyLocal(new Date()), canvasRange), [canvasRange]);
  const baseTimeVisuals = useMemo(() => nodes.map((node) => planningCanvasTimeVisual(node, canvasRange)).filter(isPlanningCanvasTimeVisual), [nodes, canvasRange]);
  const googleTimeVisuals = useMemo(
    () => layoutPlanningCanvasGoogleTimeVisuals(
      calendarEvents.filter((event) => isPlanningCanvasGoogleTimeEvent(event, nodes)),
      canvasRange
    ),
    [calendarEvents, canvasRange, nodes]
  );
  const childcareGapSpans = useMemo(() => planningCanvasChildcareGapSpans(googleTimeVisuals), [googleTimeVisuals]);
  const childcareOverlapSpans = useMemo(() => planningCanvasChildcareOverlapSpans(googleTimeVisuals), [googleTimeVisuals]);
  const googleLaneCount = Math.max(1, ...googleTimeVisuals.map((visual) => visual.row + 1));
  const writableCalendarSources = useMemo(() => calendarSources.filter((source) => source.enabled && !source.readOnly), [calendarSources]);
  const googleLaneRows = useMemo(() => Array.from({ length: googleLaneCount }, (_, row) => row), [googleLaneCount]);
  const googleCreatePreview = googleCreateDrag
    ? planningCanvasGoogleCreatePreview(googleCreateDrag, canvasRange)
    : pendingGoogleCreate
      ? planningCanvasGoogleCreateDraftPreview(pendingGoogleCreate, canvasRange)
      : null;
  const timeVisuals = useMemo(
    () => baseTimeVisuals.map((visual) => ({ ...visual, top: visual.top + googleLaneCount * PLANNING_CANVAS_TIME_LANE_HEIGHT })),
    [baseTimeVisuals, googleLaneCount]
  );
  const timeVisualByInitiative = useMemo(() => new Map(timeVisuals.map((visual) => [visual.initiativeId, visual])), [timeVisuals]);
  const visibleUnmappedInitiatives = useMemo(
    () => (view?.unmappedInitiatives ?? []).filter(({ initiative }) => initiative.status !== "completed" && initiative.status !== "archived"),
    [view?.unmappedInitiatives]
  );
  const stageWidth = canvasRange.width * canvasZoom;
  const stageHeight = Math.max(980, Math.max(0, ...timeVisuals.map((visual) => visual.top + PLANNING_CANVAS_TIME_BAR_HEIGHT + 160)));
  const edges = view?.relationEdges ?? [];
  const relationGroups = useMemo(() => buildPlanningCanvasRelationGroups(nodes, edges), [nodes, edges]);

  useEffect(() => {
    canvasZoomRef.current = canvasZoom;
  }, [canvasZoom]);

  const loadPlanningCanvasCalendar = useCallback(async () => {
    const start = dateOnlyFromUtc(canvasRange.start);
    const end = dateOnlyFromUtc(canvasRange.end);
    const [calendar, hiddenEvents, sources] = await Promise.all([
      fetchCalendarView(start, end, { surface: "planning_canvas" }),
      fetchHiddenCalendarEvents("planning_canvas"),
      fetchCalendarSources()
    ]);
    setCalendarEvents(calendar.events);
    setHiddenGoogleEvents(hiddenEvents);
    setCalendarSources(sources);
  }, [canvasRange]);

  useEffect(() => {
    let cancelled = false;
    void loadPlanningCanvasCalendar()
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Google Calendar konnte nicht geladen werden.");
      });
    return () => {
      cancelled = true;
    };
  }, [loadPlanningCanvasCalendar]);

  const hideGoogleEventFromCanvas = async (event: Extract<CalendarViewEvent, { source: "google" }>, hiddenScope: CalendarEventVisibilityHiddenScope) => {
    try {
      setError(null);
      const hiddenEvent = await hideCalendarEvent({
        surface: "planning_canvas",
        hiddenScope,
        calendarSourceId: event.sourceId,
        externalCalendarId: event.externalCalendarId,
        externalEventId: event.externalEventId,
        recurringEventId: event.recurringEventId,
        originalStartAt: hiddenScope === "recurring_instance" ? event.originalStartAt ?? event.startAt : event.originalStartAt,
        iCalUID: event.iCalUID,
        titleSnapshot: event.title,
        startAtSnapshot: event.startAt,
        endAtSnapshot: event.endAt
      });
      setRecurringHideTarget(null);
      await loadPlanningCanvasCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Event konnte nicht ausgeblendet werden.");
    }
  };

  const restoreHiddenGoogleEvent = async (hiddenEvent: CalendarEventVisibility) => {
    try {
      setError(null);
      await unhideCalendarEvent(hiddenEvent.id);
      await loadPlanningCanvasCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Event konnte nicht wieder eingeblendet werden.");
    }
  };

  const setZoomAroundPoint = (nextZoomInput: number, clientX?: number, clientY?: number) => {
    const wrap = stageRef.current;
    const currentZoom = canvasZoomRef.current;
    const nextZoom = clampCanvasZoom(nextZoomInput);
    if (!wrap || nextZoom === currentZoom) {
      setCanvasZoom(nextZoom);
      canvasZoomRef.current = nextZoom;
      return;
    }

    const rect = wrap.getBoundingClientRect();
    const focusX = clientX === undefined ? wrap.clientWidth / 2 : clientX - rect.left;
    const canvasX = (wrap.scrollLeft + focusX) / currentZoom;

    canvasZoomRef.current = nextZoom;
    setCanvasZoom(nextZoom);
    window.requestAnimationFrame(() => {
      wrap.scrollLeft = canvasX * nextZoom - focusX;
    });
  };

  const addInitiativeToCanvas = async (initiativeId: number, x: number, y: number) => {
    if (!view) return;
    try {
      setError(null);
      const parked = view.unmappedInitiatives.find((item) => item.initiative.id === initiativeId);
      const dropDate = planningCanvasDateFromX(x, canvasRange) ?? dateOnlyLocal(new Date());
      const startDate = parked?.initiative.startDate ?? dropDate;
      const endDate = parked?.initiative.endDate && parked.initiative.endDate >= startDate ? parked.initiative.endDate : shiftDate(startDate, 6);
      if (parked && (parked.initiative.startDate !== startDate || parked.initiative.endDate !== endDate)) {
        await updateInitiative(initiativeId, { startDate, endDate });
      }
      const node = await createPlanningCanvasNode({
        canvasId: view.canvas.id,
        initiativeId,
        x: clampCanvasCoordinate(planningCanvasDateX(startDate, canvasRange) ?? x),
        y: clampCanvasCoordinate(planningCanvasStorageYFromCanvasY(y, googleLaneCount)),
        width: null,
        height: null
      });
      await props.onAfterChange();
      await loadCanvas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Initiative konnte nicht platziert werden.");
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    const initiativeId = Number(event.dataTransfer.getData("application/x-dmax-initiative-id"));
    if (!initiativeId || !stageRef.current) return;
    event.preventDefault();
    const rect = stageRef.current.getBoundingClientRect();
    void addInitiativeToCanvas(
      initiativeId,
      (event.clientX - rect.left + stageRef.current.scrollLeft) / canvasZoom,
      event.clientY - rect.top + stageRef.current.scrollTop
    );
  };

  const onCanvasWheel = (event: ReactWheelEvent<HTMLDivElement>) => {
    if (!event.ctrlKey && !event.metaKey) {
      return;
    }
    event.preventDefault();
    const delta = event.deltaY > 0 ? -PLANNING_CANVAS_ZOOM_STEP : PLANNING_CANVAS_ZOOM_STEP;
    setZoomAroundPoint(canvasZoomRef.current + delta, event.clientX, event.clientY);
  };

  const onCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "mouse" || (event.target as HTMLElement).closest(".planning-canvas-time-bar, .planning-canvas-time-marker, .planning-canvas-edge-hit")) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    canvasGesturePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const pointers = Array.from(canvasGesturePointersRef.current.values());
    if (pointers.length >= 2) {
      const [first, second] = pointers;
      canvasGestureRef.current = {
        mode: "pinch",
        distance: pointerDistance(first, second),
        zoom: canvasZoomRef.current,
        centerX: (first.x + second.x) / 2,
        centerY: (first.y + second.y) / 2
      };
      return;
    }
    canvasGestureRef.current = { mode: "pan", pointerId: event.pointerId, lastX: event.clientX, lastY: event.clientY };
  };

  const onCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const wrap = stageRef.current;
    if (!wrap || !canvasGesturePointersRef.current.has(event.pointerId)) {
      return;
    }
    canvasGesturePointersRef.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    const gesture = canvasGestureRef.current;
    if (!gesture) return;

    if (gesture.mode === "pinch") {
      const pointers = Array.from(canvasGesturePointersRef.current.values());
      if (pointers.length < 2) return;
      const [first, second] = pointers;
      const nextDistance = pointerDistance(first, second);
      const centerX = (first.x + second.x) / 2;
      const centerY = (first.y + second.y) / 2;
      wrap.scrollLeft -= centerX - gesture.centerX;
      wrap.scrollTop -= centerY - gesture.centerY;
      setZoomAroundPoint(gesture.zoom * (nextDistance / Math.max(1, gesture.distance)), centerX, centerY);
      canvasGestureRef.current = { ...gesture, centerX, centerY };
      return;
    }

    if (gesture.mode === "pan" && gesture.pointerId === event.pointerId) {
      wrap.scrollLeft -= event.clientX - gesture.lastX;
      wrap.scrollTop -= event.clientY - gesture.lastY;
      canvasGestureRef.current = { ...gesture, lastX: event.clientX, lastY: event.clientY };
    }
  };

  const endCanvasPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    canvasGesturePointersRef.current.delete(event.pointerId);
    const pointers = Array.from(canvasGesturePointersRef.current.values());
    if (pointers.length === 1) {
      const [pointer] = pointers;
      canvasGestureRef.current = { mode: "pan", pointerId: Array.from(canvasGesturePointersRef.current.keys())[0]!, lastX: pointer.x, lastY: pointer.y };
    } else {
      canvasGestureRef.current = null;
    }
  };

  const applyTimeDragPreview = (drag: PlanningCanvasTimeDragState, clientX: number, clientY: number) => {
    if (!view) return drag;
    const dayDelta = planningCanvasDayDeltaFromPointer(drag.startClientX, clientX, canvasZoom);
    const nextDates = planningCanvasShiftDatesForDrag(drag, dayDelta);
    const nextY = planningCanvasYForTimeDrag(drag, clientY);
    const moved = drag.moved || Math.abs(clientX - drag.startClientX) > 3 || Math.abs(clientY - drag.startClientY) > 3 || dayDelta !== 0 || nextY !== drag.originY;
    setView({
      ...view,
      nodes: view.nodes.map((node) =>
        node.id === drag.nodeId
          ? {
              ...node,
              y: nextY,
              initiative: {
                ...node.initiative,
                startDate: nextDates.startDate,
                endDate: nextDates.endDate
              }
            }
          : node
      )
    });
    return { ...drag, draftY: nextY, draftStartDate: nextDates.startDate, draftEndDate: nextDates.endDate, moved };
  };

  const applyGroupDragPreview = (drag: PlanningCanvasGroupDragState, clientY: number) => {
    if (!view) return drag;
    const laneDelta = planningCanvasLaneDeltaFromPointer(drag.startClientY, clientY);
    const draftYByNodeId = Object.fromEntries(
      drag.nodeIds.map((nodeId) => [nodeId, planningCanvasClampLaneY((drag.originYByNodeId[nodeId] ?? 0) + laneDelta * PLANNING_CANVAS_TIME_LANE_HEIGHT)])
    ) as Record<number, number>;
    const moved = drag.moved || Math.abs(clientY - drag.startClientY) > 3 || drag.nodeIds.some((nodeId) => draftYByNodeId[nodeId] !== drag.originYByNodeId[nodeId]);
    setView({
      ...view,
      nodes: view.nodes.map((node) => (draftYByNodeId[node.id] === undefined ? node : { ...node, y: draftYByNodeId[node.id]! }))
    });
    return { ...drag, draftYByNodeId, moved };
  };

  const startGroupDrag = (event: ReactPointerEvent<HTMLElement | SVGPathElement>, initiativeId: number, openOnClickInitiativeId?: number) => {
    const group = relationGroups.byInitiativeId.get(initiativeId);
    if (!group || group.nodeIds.length <= 1) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    const groupNodeIds = new Set(group.nodeIds);
    const originYByNodeId = Object.fromEntries(nodes.filter((node) => groupNodeIds.has(node.id)).map((node) => [node.id, node.y])) as Record<number, number>;
    setGroupDrag({
      pointerId: event.pointerId,
      startClientY: event.clientY,
      nodeIds: group.nodeIds,
      openOnClickInitiativeId,
      originYByNodeId,
      draftYByNodeId: originYByNodeId,
      moved: false
    });
  };

  const onGroupPointerMove = (event: ReactPointerEvent<HTMLElement | SVGPathElement>) => {
    if (!groupDrag || groupDrag.pointerId !== event.pointerId) return;
    setGroupDrag(applyGroupDragPreview(groupDrag, event.clientY));
  };

  const finishGroupDrag = async (event: ReactPointerEvent<HTMLElement | SVGPathElement>) => {
    if (!groupDrag || groupDrag.pointerId !== event.pointerId) return;
    const finalDrag = applyGroupDragPreview(groupDrag, event.clientY);
    setGroupDrag(null);
    const changedNodeIds = finalDrag.nodeIds.filter((nodeId) => finalDrag.draftYByNodeId[nodeId] !== finalDrag.originYByNodeId[nodeId]);
    if (changedNodeIds.length === 0) {
      if (!finalDrag.moved && finalDrag.openOnClickInitiativeId) {
        window.open(`/initiatives/${finalDrag.openOnClickInitiativeId}`, "_blank", "noopener,noreferrer");
      }
      return;
    }
    try {
      setError(null);
      await Promise.all(changedNodeIds.map((nodeId) => updatePlanningCanvasNode(nodeId, { y: finalDrag.draftYByNodeId[nodeId]! })));
      await props.onAfterChange();
      await loadCanvas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projektgruppe konnte nicht verschoben werden.");
      await loadCanvas();
    }
  };

  const cancelGroupDrag = () => {
    if (!groupDrag) return;
    setGroupDrag(null);
    void loadCanvas();
  };

  const startTimeDrag = (event: ReactPointerEvent<HTMLElement>, visual: PlanningCanvasTimeVisual, mode: PlanningCanvasTimeDragMode) => {
    if (visual.isLocked && mode !== "move") {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const node = nodes.find((candidate) => candidate.id === visual.nodeId);
    if (!node) return;
    const group = relationGroups.byInitiativeId.get(visual.initiativeId);
    if (mode === "move" && group && !group.hasPrecedes && group.parentInitiativeIds.has(visual.initiativeId)) {
      startGroupDrag(event, visual.initiativeId, visual.initiativeId);
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setTimeDrag({
      nodeId: node.id,
      initiativeId: node.initiativeId,
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      originY: node.y,
      originStartDate: node.initiative.startDate,
      originEndDate: node.initiative.endDate,
      locksTimeframe: visual.isLocked,
      draftY: node.y,
      draftStartDate: node.initiative.startDate,
      draftEndDate: node.initiative.endDate,
      moved: false
    });
  };

  const onTimePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!timeDrag || timeDrag.pointerId !== event.pointerId) return;
    const nextDrag = applyTimeDragPreview(timeDrag, event.clientX, event.clientY);
    setTimeDrag(nextDrag);
  };

  const finishTimeDrag = async (event: ReactPointerEvent<HTMLElement>) => {
    if (!timeDrag || timeDrag.pointerId !== event.pointerId) return;
    const finalDrag = applyTimeDragPreview(timeDrag, event.clientX, event.clientY);
    setTimeDrag(null);
    const datesChanged = finalDrag.draftStartDate !== finalDrag.originStartDate || finalDrag.draftEndDate !== finalDrag.originEndDate;
    const laneChanged = finalDrag.draftY !== finalDrag.originY;
    if (!datesChanged && !laneChanged) {
      if (finalDrag.mode === "move" && !finalDrag.moved) {
        window.open(`/initiatives/${finalDrag.initiativeId}`, "_blank", "noopener,noreferrer");
      }
      return;
    }
    try {
      setError(null);
      if (datesChanged) {
        await updateInitiative(finalDrag.initiativeId, {
          startDate: finalDrag.draftStartDate,
          endDate: finalDrag.draftEndDate
        });
      }
      if (laneChanged) {
        await updatePlanningCanvasNode(finalDrag.nodeId, { y: finalDrag.draftY });
      }
      await props.onAfterChange();
      await loadCanvas();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Projektzeitraum oder Zeile konnte nicht gespeichert werden.");
      await loadCanvas();
    }
  };

  const cancelTimeDrag = () => {
    if (!timeDrag) return;
    setTimeDrag(null);
    void loadCanvas();
  };

  const applyGoogleTimeDragPreview = (drag: PlanningCanvasGoogleTimeDragState, clientX: number): PlanningCanvasGoogleTimeDragState => {
    const dayDelta = planningCanvasDayDeltaFromPointer(drag.startClientX, clientX, canvasZoom);
    const nextDates = planningCanvasShiftGoogleDatesForDrag(drag, dayDelta);
    const moved = drag.moved || Math.abs(clientX - drag.startClientX) > 3 || dayDelta !== 0;
    setCalendarEvents((current) =>
      current.map((event) =>
        event.source === "google" && event.id === drag.eventId
          ? { ...event, startAt: nextDates.startDate, endAt: nextDates.endDate }
          : event
      )
    );
    return { ...drag, draftStartDate: nextDates.startDate, draftEndDate: nextDates.endDate, moved };
  };

  const startGoogleTimeDrag = (event: ReactPointerEvent<HTMLElement>, visual: PlanningCanvasGoogleTimeVisual, mode: PlanningCanvasGoogleTimeDragMode) => {
    if (!visual.event.editable || googleMutationBusy) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGoogleTimeDrag({
      eventId: visual.event.id,
      pointerId: event.pointerId,
      mode,
      startClientX: event.clientX,
      originStartDate: datePart(visual.event.startAt),
      originEndDate: datePart(visual.event.endAt),
      draftStartDate: datePart(visual.event.startAt),
      draftEndDate: datePart(visual.event.endAt),
      moved: false
    });
  };

  const onGoogleTimePointerMove = (event: ReactPointerEvent<HTMLElement>) => {
    if (!googleTimeDrag || googleTimeDrag.pointerId !== event.pointerId) return;
    setGoogleTimeDrag(applyGoogleTimeDragPreview(googleTimeDrag, event.clientX));
  };

  const finishGoogleTimeDrag = (event: ReactPointerEvent<HTMLElement>) => {
    if (!googleTimeDrag || googleTimeDrag.pointerId !== event.pointerId) return;
    const finalDrag = applyGoogleTimeDragPreview(googleTimeDrag, event.clientX);
    setGoogleTimeDrag(null);
    const changed = finalDrag.draftStartDate !== finalDrag.originStartDate || finalDrag.draftEndDate !== finalDrag.originEndDate;
    const target = calendarEvents.find((candidate): candidate is Extract<CalendarViewEvent, { source: "google" }> =>
      candidate.source === "google" && candidate.id === finalDrag.eventId
    );
    if (!target) {
      void loadPlanningCanvasCalendar();
      return;
    }
    if (!changed) return;
    setPendingGoogleTimeChange({
      event: {
        ...target,
        startAt: finalDrag.originStartDate,
        endAt: finalDrag.originEndDate
      },
      originStartDate: finalDrag.originStartDate,
      originEndDate: finalDrag.originEndDate,
      nextStartDate: finalDrag.draftStartDate,
      nextEndDate: finalDrag.draftEndDate
    });
  };

  const cancelGoogleTimeChange = () => {
    const draft = pendingGoogleTimeChange;
    setPendingGoogleTimeChange(null);
    if (!draft) {
      void loadPlanningCanvasCalendar();
      return;
    }
    setCalendarEvents((current) =>
      current.map((event) =>
        event.source === "google" && event.id === draft.event.id
          ? { ...event, startAt: draft.originStartDate, endAt: draft.originEndDate }
          : event
      )
    );
  };

  const confirmGoogleTimeChange = async () => {
    if (!pendingGoogleTimeChange) return;
    try {
      setGoogleMutationBusy(true);
      setError(null);
      await updateGoogleOnlyEvent({
        calendarSourceId: pendingGoogleTimeChange.event.sourceId,
        externalEventId: pendingGoogleTimeChange.event.externalEventId,
        title: pendingGoogleTimeChange.event.title,
        startAt: pendingGoogleTimeChange.nextStartDate,
        endAt: pendingGoogleTimeChange.nextEndDate,
        allDay: true
      });
      setPendingGoogleTimeChange(null);
      await loadPlanningCanvasCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Event konnte nicht gespeichert werden.");
      cancelGoogleTimeChange();
    } finally {
      setGoogleMutationBusy(false);
    }
  };

  const startGoogleCreateDrag = (event: ReactPointerEvent<HTMLDivElement>, row: number) => {
    if (googleMutationBusy || pendingGoogleCreate || pendingGoogleTimeChange || editingGoogleEvent) return;
    const stage = stageRef.current;
    if (!stage) return;
    const rect = stage.getBoundingClientRect();
    const canvasX = (event.clientX - rect.left + stage.scrollLeft) / canvasZoom;
    const startDate = planningCanvasDateFromX(canvasX, canvasRange);
    if (!startDate) return;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setGoogleCreateDrag({
      pointerId: event.pointerId,
      row,
      startClientX: event.clientX,
      startDate,
      draftEndDate: startDate,
      moved: false
    });
  };

  const applyGoogleCreateDragPreview = (drag: PlanningCanvasGoogleCreateDragState, clientX: number): PlanningCanvasGoogleCreateDragState => {
    const dayDelta = Math.max(0, planningCanvasDayDeltaFromPointer(drag.startClientX, clientX, canvasZoom));
    return {
      ...drag,
      draftEndDate: shiftDate(drag.startDate, dayDelta),
      moved: drag.moved || Math.abs(clientX - drag.startClientX) > 3 || dayDelta > 0
    };
  };

  const onGoogleCreatePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!googleCreateDrag || googleCreateDrag.pointerId !== event.pointerId) return;
    setGoogleCreateDrag(applyGoogleCreateDragPreview(googleCreateDrag, event.clientX));
  };

  const finishGoogleCreateDrag = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!googleCreateDrag || googleCreateDrag.pointerId !== event.pointerId) return;
    const finalDrag = applyGoogleCreateDragPreview(googleCreateDrag, event.clientX);
    setGoogleCreateDrag(null);
    if (finalDrag.draftEndDate <= finalDrag.startDate) return;
    const rowSourceId = googleTimeVisuals.find((visual) => visual.row === finalDrag.row && visual.event.editable)?.event.sourceId ?? null;
    const defaultSource = writableCalendarSources.find((source) => source.id === rowSourceId) ?? writableCalendarSources[0] ?? null;
    setPendingGoogleCreate({
      row: finalDrag.row,
      title: "Neues Google Event",
      calendarSourceId: defaultSource?.id ?? null,
      startDate: finalDrag.startDate,
      endDate: finalDrag.draftEndDate
    });
  };

  const cancelGoogleCreate = () => {
    setGoogleCreateDrag(null);
    setPendingGoogleCreate(null);
  };

  const confirmGoogleCreate = async () => {
    if (!pendingGoogleCreate?.calendarSourceId || !pendingGoogleCreate.title.trim()) return;
    try {
      setGoogleMutationBusy(true);
      setError(null);
      await createGoogleOnlyEvent({
        calendarSourceId: pendingGoogleCreate.calendarSourceId,
        title: pendingGoogleCreate.title.trim(),
        startAt: pendingGoogleCreate.startDate,
        endAt: pendingGoogleCreate.endDate,
        allDay: true
      });
      setPendingGoogleCreate(null);
      await loadPlanningCanvasCalendar();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Event konnte nicht erstellt werden.");
      setPendingGoogleCreate(null);
    } finally {
      setGoogleMutationBusy(false);
    }
  };

  const saveGoogleEventEdit = async (input: { title: string; startDate: string; endDate: string }) => {
    if (!editingGoogleEvent || !editingGoogleEvent.editable) return;
    await updateGoogleOnlyEvent({
      calendarSourceId: editingGoogleEvent.sourceId,
      externalEventId: editingGoogleEvent.externalEventId,
      title: input.title.trim(),
      startAt: input.startDate,
      endAt: input.endDate,
      allDay: true
    });
    setEditingGoogleEvent(null);
    await loadPlanningCanvasCalendar();
  };

  return (
    <section className="planning-canvas-view">
      <aside className="planning-canvas-parking">
        <div className="planning-canvas-toolbar">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search initiatives" />
          <select value={categoryId} onChange={(event) => setCategoryId(event.target.value === "all" ? "all" : Number(event.target.value))}>
            <option value="all">All categories</option>
            {props.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </div>
        <div className="planning-canvas-zoom-controls" aria-label="Canvas zoom">
          <button type="button" className="icon-button compact" onClick={() => setZoomAroundPoint(canvasZoomRef.current - PLANNING_CANVAS_ZOOM_STEP)} title="Zoom out">
            <ZoomOut size={16} />
          </button>
          <input
            type="range"
            min={PLANNING_CANVAS_MIN_ZOOM}
            max={PLANNING_CANVAS_MAX_ZOOM}
            step={PLANNING_CANVAS_ZOOM_STEP}
            value={canvasZoom}
            onChange={(event) => setZoomAroundPoint(Number(event.target.value))}
            aria-label="Canvas zoom"
          />
          <button type="button" className="icon-button compact" onClick={() => setZoomAroundPoint(canvasZoomRef.current + PLANNING_CANVAS_ZOOM_STEP)} title="Zoom in">
            <ZoomIn size={16} />
          </button>
          <button type="button" className="secondary-action compact" onClick={() => setZoomAroundPoint(1)}>
            {Math.round(canvasZoom * 100)}%
          </button>
        </div>
        <div className="planning-canvas-parking-list">
          {visibleUnmappedInitiatives.map(({ initiative, category, openTaskCount }) => (
            <article
              key={initiative.id}
              draggable
              role="button"
              tabIndex={0}
              onDragStart={(event) => {
                parkingDragRef.current = true;
                event.dataTransfer.setData("application/x-dmax-initiative-id", String(initiative.id));
              }}
              onDragEnd={() => {
                window.setTimeout(() => {
                  parkingDragRef.current = false;
                }, 0);
              }}
              onClick={() => {
                if (parkingDragRef.current) return;
                window.open(`/initiatives/${initiative.id}`, "_blank", "noopener,noreferrer");
              }}
              onKeyDown={(event) => {
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                window.open(`/initiatives/${initiative.id}`, "_blank", "noopener,noreferrer");
              }}
              className="planning-canvas-parking-item"
            >
              <div>
                <strong>{initiative.name}</strong>
                <span>
                  {category?.name ?? "No category"} · {initiative.status} · {openTaskCount} open
                </span>
              </div>
            </article>
          ))}
          {view && visibleUnmappedInitiatives.length === 0 ? <EmptyState title="No unplaced initiatives" /> : null}
        </div>
        {hiddenGoogleEvents.length > 0 ? (
          <div className="planning-canvas-parking-bottom">
            <div className="planning-canvas-hidden-panel">
              <button
                type="button"
                className="planning-canvas-hidden-toggle"
                title="Ausgeblendete Google Events anzeigen"
                aria-label="Ausgeblendete Google Events anzeigen"
                onClick={() => setShowHiddenGoogleEvents((current) => !current)}
              >
                <Eye size={13} />
                <span>{hiddenGoogleEvents.length} Google Termine ausgeblendet</span>
              </button>
              {showHiddenGoogleEvents ? (
                <div className="planning-canvas-hidden-popover">
                  <strong>Ausgeblendete Google Events</strong>
                  {hiddenGoogleEvents.map((hiddenEvent) => (
                    <div className="planning-canvas-hidden-row" key={hiddenEvent.id}>
                      <span>
                        {hiddenEvent.titleSnapshot}
                        <small>{planningCanvasHiddenEventMeta(hiddenEvent)}</small>
                      </span>
                      <button
                        type="button"
                        className="icon-button compact"
                        title="Wieder einblenden"
                        aria-label={`${hiddenEvent.titleSnapshot} wieder einblenden`}
                        onClick={() => void restoreHiddenGoogleEvent(hiddenEvent)}
                      >
                        <Eye size={13} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}
      </aside>

      <div
        className="planning-canvas-stage-wrap"
        ref={stageRef}
        onWheel={onCanvasWheel}
        onPointerDown={onCanvasPointerDown}
        onPointerMove={onCanvasPointerMove}
        onPointerUp={endCanvasPointer}
        onPointerCancel={endCanvasPointer}
        onPointerLeave={endCanvasPointer}
        onDragOver={(event) => event.preventDefault()}
        onDrop={onDrop}
      >
        {error ? <div className="error-banner">{error}</div> : null}
        <div
          className="planning-canvas-stage"
          style={
            {
              width: stageWidth,
              height: stageHeight,
              "--planning-canvas-week-width": `${PLANNING_CANVAS_WEEK_WIDTH * canvasZoom}px`,
              "--planning-canvas-time-lane-height": `${PLANNING_CANVAS_TIME_LANE_HEIGHT}px`,
              "--planning-canvas-time-header-height": `${PLANNING_CANVAS_TIME_HEADER_HEIGHT}px`
            } as CSSProperties
          }
        >
          <div
            className="planning-canvas-stage-content"
            style={{
              width: stageWidth,
              height: stageHeight
            }}
          >
            <div className="planning-canvas-time-header">
              {monthLabels.map((month) => (
                <div key={month.key} className="planning-canvas-month" style={{ left: month.left * canvasZoom, width: month.width * canvasZoom }}>
                  {month.label}
                </div>
              ))}
              {weekLabels.map((week, index) => (
                <div
                  key={week.key}
                  className={`planning-canvas-week-label ${index % 2 === 0 ? "visible" : ""}`}
                  style={{ left: week.left * canvasZoom, width: PLANNING_CANVAS_WEEK_WIDTH * canvasZoom }}
                  title={week.title}
                >
                  {week.label}
                </div>
              ))}
            </div>
            <div className="planning-canvas-weekends" aria-hidden="true">
              {weekendSpans.map((weekend) => (
                <div
                  key={weekend.key}
                  className="planning-canvas-weekend"
                  style={{ left: weekend.left * canvasZoom, width: weekend.width * canvasZoom }}
                  title={weekend.title}
                />
              ))}
            </div>
            {todayX !== null ? (
              <div className="planning-canvas-today-line" style={{ left: todayX * canvasZoom }} title={`Today · ${formatDateOnly(dateOnlyLocal(new Date()))}`}>
              </div>
            ) : null}
            <div className="planning-canvas-time-layer">
              {googleLaneRows.map((row) => (
                <div
                  key={`google-row-${row}`}
                  className="planning-canvas-google-row-dropzone"
                  style={{ top: PLANNING_CANVAS_TIME_HEADER_HEIGHT + row * PLANNING_CANVAS_TIME_LANE_HEIGHT }}
                  onPointerDown={(event) => startGoogleCreateDrag(event, row)}
                  onPointerMove={onGoogleCreatePointerMove}
                  onPointerUp={finishGoogleCreateDrag}
                  onPointerCancel={cancelGoogleCreate}
                >
                </div>
              ))}
              {googleLaneRows.map((row) => (
                <div
                  key={`google-row-icon-${row}`}
                  className="planning-canvas-google-row-icon-row"
                  style={{ top: PLANNING_CANVAS_TIME_HEADER_HEIGHT + row * PLANNING_CANVAS_TIME_LANE_HEIGHT }}
                  aria-hidden="true"
                >
                  <span className="planning-canvas-google-row-icon">
                    <GoogleCalendarGlyph />
                  </span>
                </div>
              ))}
              {childcareGapSpans.map((span) => (
                <div
                  key={span.id}
                  className="planning-canvas-childcare-lane-span gap"
                  style={{ left: span.left * canvasZoom, top: PLANNING_CANVAS_TIME_HEADER_HEIGHT, width: span.width * canvasZoom }}
                  title={span.title}
                  aria-hidden="true"
                />
              ))}
              {childcareOverlapSpans.map((span) => (
                <div
                  key={span.id}
                  className="planning-canvas-childcare-lane-span overlap"
                  style={{ left: span.left * canvasZoom, top: PLANNING_CANVAS_TIME_HEADER_HEIGHT, width: span.width * canvasZoom }}
                  title={span.title}
                  aria-hidden="true"
                />
              ))}
              {googleTimeVisuals.map((visual) => (
                <div
                  key={visual.id}
                  className={`planning-canvas-google-time-bar ${visual.event.editable ? "editable" : "readonly"} ${visual.special ? `special ${visual.special.className}` : ""} ${visual.hasChildcareConflict ? "childcare-conflict" : ""}`}
                  style={{ left: visual.left * canvasZoom, top: visual.top, width: visual.width * canvasZoom, backgroundColor: visual.color, color: visual.special?.textColor }}
                  title={visual.title}
                  aria-label={visual.title}
                  role="button"
                  tabIndex={0}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest("button")) return;
                    setEditingGoogleEvent(visual.event);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      setEditingGoogleEvent(visual.event);
                    }
                  }}
                >
                  <span className="planning-canvas-time-bar-label">{visual.name}</span>
                  {visual.event.editable ? (
                    <>
                      <button
                        type="button"
                        className="planning-canvas-google-time-handle start"
                        aria-label={`Startdatum fuer ${visual.name} aendern`}
                        title="Startdatum ändern"
                        onPointerDown={(event) => startGoogleTimeDrag(event, visual, "resize-start")}
                        onPointerMove={onGoogleTimePointerMove}
                        onPointerUp={finishGoogleTimeDrag}
                        onPointerCancel={() => {
                          setGoogleTimeDrag(null);
                          void loadPlanningCanvasCalendar();
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                      <button
                        type="button"
                        className="planning-canvas-google-time-handle end"
                        aria-label={`Enddatum fuer ${visual.name} aendern`}
                        title="Enddatum ändern"
                        onPointerDown={(event) => startGoogleTimeDrag(event, visual, "resize-end")}
                        onPointerMove={onGoogleTimePointerMove}
                        onPointerUp={finishGoogleTimeDrag}
                        onPointerCancel={() => {
                          setGoogleTimeDrag(null);
                          void loadPlanningCanvasCalendar();
                        }}
                        onClick={(event) => event.stopPropagation()}
                      />
                    </>
                  ) : null}
                  <button
                    type="button"
                    className="planning-canvas-google-hide-button"
                    title="Dieses Event ausblenden"
                    aria-label={`${visual.name} ausblenden`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onPointerMove={(event) => event.stopPropagation()}
                    onPointerUp={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                    }}
                    onClick={(event) => {
                      event.preventDefault();
                      event.stopPropagation();
                      if (visual.event.recurring) {
                        setRecurringHideTarget(visual.event);
                      } else {
                        void hideGoogleEventFromCanvas(visual.event, "event");
                      }
                    }}
                  >
                    <EyeOff size={13} />
                  </button>
                </div>
              ))}
              {googleCreatePreview ? (
                <div
                  className="planning-canvas-google-create-preview"
                  style={{ left: googleCreatePreview.left * canvasZoom, top: googleCreatePreview.top, width: googleCreatePreview.width * canvasZoom }}
                  aria-hidden="true"
                >
                  <span>{pendingGoogleCreate ? pendingGoogleCreate.title : "Neues Google Event"}</span>
                </div>
              ) : null}
              {timeVisuals.map((visual) =>
                visual.kind === "bar" ? (
                  <div
                    key={`time-${visual.nodeId}`}
                    className={`planning-canvas-time-bar ${visual.projectPhase} ${visual.status === "completed" ? "completed" : ""} ${visual.isLocked ? "locked" : ""}`}
                    style={{ left: visual.left * canvasZoom, top: visual.top, width: visual.width * canvasZoom, backgroundColor: visual.color, color: visual.textColor }}
                    title={visual.isLocked ? LOCKED_CANVAS_TIMEFRAME_TOOLTIP : visual.title}
                    role="button"
                    tabIndex={0}
                    aria-label={visual.isLocked ? `${visual.name}: ${LOCKED_CANVAS_TIMEFRAME_TOOLTIP}` : `Move dates for ${visual.name}`}
                    onPointerDown={(event) => startTimeDrag(event, visual, "move")}
                    onPointerMove={onTimePointerMove}
                    onPointerUp={(event) => void finishTimeDrag(event)}
                    onPointerCancel={cancelTimeDrag}
                  >
                    {visual.isLocked ? <span className="planning-canvas-time-lock-badge" aria-hidden="true"><Lock size={10} /></span> : null}
                    {visual.hasGoogleCalendarBinding ? <GoogleCalendarTimebarBadge /> : null}
                    <span className="planning-canvas-time-bar-label">
                      {visual.name}
                    </span>
                    <div className="planning-canvas-time-actions">
                      <button
                        type="button"
                        className="icon-button compact"
                        aria-label={`Edit ${visual.name}`}
                        title="Edit project"
                        onPointerDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.stopPropagation();
                          const node = nodeByInitiative.get(visual.initiativeId);
                          if (node) setEditingNode(node);
                        }}
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                    <button
                      type="button"
                      className="planning-canvas-time-relation-handle left"
                      aria-label={`Create predecessor project for ${visual.name}`}
                      title="Create predecessor project"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        const node = nodeByInitiative.get(visual.initiativeId);
                        if (node) setCreatingRelatedProject({ anchor: node, direction: "predecessor" });
                      }}
                    >
                      <Plus size={13} />
                    </button>
                    <button
                      type="button"
                      className="planning-canvas-time-relation-handle right"
                      aria-label={`Create successor project for ${visual.name}`}
                      title="Create successor project"
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation();
                        const node = nodeByInitiative.get(visual.initiativeId);
                        if (node) setCreatingRelatedProject({ anchor: node, direction: "successor" });
                      }}
                    >
                      <Plus size={13} />
                    </button>
                    {!visual.isLocked ? (
                      <>
                        <button
                          type="button"
                          className="planning-canvas-time-handle start"
                          aria-label={`Change start date for ${visual.name}`}
                          title="Change start date"
                          onPointerDown={(event) => startTimeDrag(event, visual, "resize-start")}
                          onPointerMove={onTimePointerMove}
                          onPointerUp={(event) => void finishTimeDrag(event)}
                          onPointerCancel={cancelTimeDrag}
                          onClick={(event) => event.stopPropagation()}
                        />
                        <button
                          type="button"
                          className="planning-canvas-time-handle end"
                          aria-label={`Change end date for ${visual.name}`}
                          title="Change end date"
                          onPointerDown={(event) => startTimeDrag(event, visual, "resize-end")}
                          onPointerMove={onTimePointerMove}
                          onPointerUp={(event) => void finishTimeDrag(event)}
                          onPointerCancel={cancelTimeDrag}
                          onClick={(event) => event.stopPropagation()}
                        />
                      </>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    key={`time-${visual.nodeId}`}
                    className={`planning-canvas-time-marker ${visual.kind} ${visual.isLocked ? "locked" : ""}`}
                    style={{ left: visual.left * canvasZoom, top: visual.top, borderColor: visual.color, backgroundColor: visual.color, color: visual.color }}
                    title={visual.isLocked ? LOCKED_TIMEFRAME_TOOLTIP : visual.title}
                    aria-label={visual.isLocked ? `${visual.name}: ${LOCKED_TIMEFRAME_TOOLTIP}` : `${visual.kind === "start" ? "Move start date" : "Move end date"} for ${visual.name}`}
                    onPointerDown={(event) => startTimeDrag(event, visual, visual.kind === "start" ? "move-start" : "move-end")}
                    onPointerMove={onTimePointerMove}
                    onPointerUp={(event) => void finishTimeDrag(event)}
                    onPointerCancel={cancelTimeDrag}
                  />
                )
              )}
            </div>
            <svg className="planning-canvas-edges" width={stageWidth} height={stageHeight} aria-hidden="true">
              <defs>
                <marker id="planning-canvas-arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 z" />
                </marker>
              </defs>
              {edges.map((edge, index) => {
                const from = timeVisualByInitiative.get(edge.fromInitiativeId);
                const to = timeVisualByInitiative.get(edge.toInitiativeId);
                if (!from || !to) return null;
                const edgeKey = `${edge.kind}-${edge.relationId ?? index}-${edge.fromInitiativeId}-${edge.toInitiativeId}`;
                if (edge.kind === "parent_child") {
                  const fromX = (from.left + from.width / 2) * canvasZoom;
                  const fromY = from.top + PLANNING_CANVAS_TIME_BAR_HEIGHT;
                  const toX = (to.left + to.width / 2) * canvasZoom;
                  const toY = to.top;
                  const midY = fromY + (toY - fromY) / 2;
                  return (
                    <g key={edgeKey} className="planning-canvas-edge-group parent_child">
                      <path
                        className="planning-canvas-edge parent_child"
                        d={`M ${fromX} ${fromY} C ${fromX} ${midY}, ${toX} ${midY}, ${toX} ${toY}`}
                      />
                      <circle className="planning-canvas-edge-dot" cx={fromX} cy={fromY} r="4" />
                      <circle className="planning-canvas-edge-dot" cx={toX} cy={toY} r="4" />
                    </g>
                  );
                }
                const fromX = (from.left + from.width) * canvasZoom;
                const fromY = from.top + PLANNING_CANVAS_TIME_BAR_HEIGHT / 2;
                const toX = to.left * canvasZoom;
                const toY = to.top + PLANNING_CANVAS_TIME_BAR_HEIGHT / 2;
                const curve = Math.max(80, Math.abs(toX - fromX) / 2);
                return (
                  <g key={edgeKey} className="planning-canvas-edge-group precedes">
                    <path
                      className="planning-canvas-edge precedes"
                      d={`M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX} ${toY}`}
                    />
                    <path
                      className="planning-canvas-edge-hit precedes"
                      d={`M ${fromX} ${fromY} C ${fromX + curve} ${fromY}, ${toX - curve} ${toY}, ${toX} ${toY}`}
                      onPointerDown={(event) => startGroupDrag(event, edge.fromInitiativeId)}
                      onPointerMove={onGroupPointerMove}
                      onPointerUp={(event) => void finishGroupDrag(event)}
                      onPointerCancel={cancelGroupDrag}
                    />
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      </div>

      {recurringHideTarget ? (
        <section className="compact-modal planning-canvas-hide-modal" role="dialog" aria-modal="true" aria-label="Recurring Google Event ausblenden">
          <header>
            <div>
              <span>Google Serie</span>
              <h2>{recurringHideTarget.title}</h2>
            </div>
            <button type="button" className="icon-button" aria-label="Schliessen" onClick={() => setRecurringHideTarget(null)}>
              <X size={18} />
            </button>
          </header>
          <p>Dieses Event gehoert zu einer wiederkehrenden Serie.</p>
          <div className="planning-canvas-hide-options">
            <button type="button" className="secondary-action compact" onClick={() => void hideGoogleEventFromCanvas(recurringHideTarget, "recurring_instance")}>
              Nur dieses Vorkommen ausblenden
            </button>
            <button type="button" className="primary-action compact" onClick={() => void hideGoogleEventFromCanvas(recurringHideTarget, "recurring_series")}>
              Ganze Serie ausblenden
            </button>
          </div>
        </section>
      ) : null}

      {pendingGoogleTimeChange ? (
        <PlanningCanvasGoogleEventChangeModal
          draft={pendingGoogleTimeChange}
          busy={googleMutationBusy}
          onCancel={cancelGoogleTimeChange}
          onConfirm={() => void confirmGoogleTimeChange()}
        />
      ) : null}

      {pendingGoogleCreate ? (
        <PlanningCanvasGoogleEventCreateModal
          draft={pendingGoogleCreate}
          sources={writableCalendarSources}
          busy={googleMutationBusy}
          onChange={setPendingGoogleCreate}
          onCancel={cancelGoogleCreate}
          onConfirm={() => void confirmGoogleCreate()}
        />
      ) : null}

      {editingGoogleEvent ? (
        <PlanningCanvasGoogleEventEditModal
          event={editingGoogleEvent}
          busy={googleMutationBusy}
          onCancel={() => setEditingGoogleEvent(null)}
          onSave={async (input) => {
            try {
              setGoogleMutationBusy(true);
              setError(null);
              await saveGoogleEventEdit(input);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Google Event konnte nicht gespeichert werden.");
              await loadPlanningCanvasCalendar();
              throw err;
            } finally {
              setGoogleMutationBusy(false);
            }
          }}
        />
      ) : null}

      {editingNode ? (
        <PlanningCanvasProjectModal
          node={editingNode}
          categories={props.categories}
          onClose={() => setEditingNode(null)}
          onOpenInitiative={props.onOpenInitiative}
          onSave={async (initiativeId, input) => {
            await updateInitiative(initiativeId, input);
            await props.onAfterChange();
            await loadCanvas();
            setEditingNode(null);
          }}
        />
      ) : null}
      {creatingRelatedProject && view ? (
        <PlanningCanvasRelatedProjectModal
          anchor={creatingRelatedProject.anchor}
          direction={creatingRelatedProject.direction}
          categories={props.categories}
          onClose={() => setCreatingRelatedProject(null)}
          onCreate={async (input) => {
            const defaultDates = defaultRelatedProjectDates(creatingRelatedProject.anchor.initiative, creatingRelatedProject.direction);
            const startDate = input.startDate || (input.endDate ? shiftDate(input.endDate, -6) : defaultDates.startDate);
            const endDate = input.endDate || shiftDate(startDate, 6);
            const created = await createInitiative({ ...input, startDate, endDate, type: "project", projectPhase: "planning" });
            if (creatingRelatedProject.direction === "predecessor") {
              await createInitiativeRelation({ predecessorInitiativeId: created.id, successorInitiativeId: creatingRelatedProject.anchor.initiativeId });
            } else {
              await createInitiativeRelation({ predecessorInitiativeId: creatingRelatedProject.anchor.initiativeId, successorInitiativeId: created.id });
            }

            const anchor = creatingRelatedProject.anchor;
            await createPlanningCanvasNode({
              canvasId: view.canvas.id,
              initiativeId: created.id,
              x: clampCanvasCoordinate(planningCanvasDateX(startDate, canvasRange) ?? anchor.x),
              y: clampCanvasCoordinate(anchor.y),
              width: null,
              height: null
            });

            await props.onAfterChange();
            await loadCanvas();
            setCreatingRelatedProject(null);
          }}
        />
      ) : null}
    </section>
  );
}

function PlanningCanvasProjectModal(props: {
  node: PlanningCanvasInitiativeNode;
  categories: Category[];
  onClose: () => void;
  onOpenInitiative: (initiativeId: number) => void;
  onSave: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
}) {
  const { initiative } = props.node;
  const [draft, setDraft] = useState({
    name: initiative.name,
    categoryId: initiative.categoryId,
    status: initiative.status,
    projectPhase: initiative.projectPhase,
    startDate: initiative.startDate ?? "",
    endDate: initiative.endDate ?? "",
    summary: initiative.summary ?? ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  const dateRangeInvalid = initiativeDateRangeInvalid(draft.startDate, draft.endDate);

  const save = async () => {
    if (busy || !draft.name.trim() || dateRangeInvalid) return;
    setBusy(true);
    setError(null);
    try {
      const input: UpdateInitiativeInput = {
        name: draft.name.trim(),
        categoryId: draft.categoryId,
        status: draft.status,
        projectPhase: draft.projectPhase,
        summary: nullableText(draft.summary)
      };
      if (!initiative.isLocked) {
        input.startDate = draft.startDate || null;
        input.endDate = draft.endDate || null;
      }
      await props.onSave(initiative.id, input);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project could not be saved.");
      setBusy(false);
    }
  };

  return (
    <div className="planning-canvas-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="planning-canvas-modal" role="dialog" aria-modal="true" aria-label="Edit project" onMouseDown={(event) => event.stopPropagation()}>
        <header className="planning-canvas-modal-header">
          <div>
            <h2>Edit project</h2>
            <p>{initiative.name}</p>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        <div className="planning-canvas-modal-form">
          <label>
            Name
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Category
            <select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: Number(event.target.value) }))}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Initiative["status"] }))}>
              <option value="active">active</option>
              <option value="paused">paused</option>
              <option value="completed">completed</option>
              <option value="archived">archived</option>
            </select>
          </label>
          <label>
            Project phase
            <select value={draft.projectPhase} onChange={(event) => setDraft((current) => ({ ...current, projectPhase: event.target.value as ProjectPhase }))}>
              {projectPhaseOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="planning-canvas-modal-date-grid">
            <label>
              From
              <input
                type="date"
                value={draft.startDate}
                disabled={initiative.isLocked}
                title={initiative.isLocked ? LOCKED_TIMEFRAME_TOOLTIP : undefined}
                onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
              />
            </label>
            <label>
              To
              <input
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                disabled={initiative.isLocked}
                title={initiative.isLocked ? LOCKED_TIMEFRAME_TOOLTIP : undefined}
                onPointerDown={(event) => primeEmptyDatePickerMonth(event, draft.startDate, draft.endDate)}
                onFocus={(event) => primeEmptyDatePickerMonth(event, draft.startDate, draft.endDate)}
                onBlur={(event) => restorePrimedEmptyDateInput(event, draft.endDate)}
                onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
          </div>
          {initiative.isLocked ? (
            <div className="planning-canvas-lock-note" title={LOCKED_TIMEFRAME_TOOLTIP}>
              <Lock size={14} aria-hidden="true" />
              <span>Zeitraum ist gesperrt. Aendere ihn auf der Projekt-Detailseite.</span>
            </div>
          ) : null}
          <label>
            Summary
            <textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} rows={4} />
          </label>
        </div>

        {dateRangeInvalid ? <div className="error-banner">From date cannot be after To date.</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        <footer className="planning-canvas-modal-actions">
          <button
            type="button"
            className="secondary-action compact"
            onClick={() => {
              props.onOpenInitiative(initiative.id);
              props.onClose();
            }}
          >
            <ExternalLink size={16} /> Full detail
          </button>
          <button type="button" className="secondary-action compact" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="primary-action compact" disabled={busy || !draft.name.trim() || dateRangeInvalid} onClick={() => void save()}>
            Save
          </button>
        </footer>
      </section>
    </div>
  );
}

function PlanningCanvasGoogleEventChangeModal(props: {
  draft: PlanningCanvasGoogleTimeChangeDraft;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const currentRange = `${formatDateOnly(props.draft.originStartDate)} - ${formatDateOnly(props.draft.originEndDate)}`;
  const nextRange = `${formatDateOnly(props.draft.nextStartDate)} - ${formatDateOnly(props.draft.nextEndDate)}`;
  return (
    <div className="planning-canvas-modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section className="planning-canvas-modal planning-canvas-google-event-modal" role="dialog" aria-modal="true" aria-label="Google Event verschieben" onMouseDown={(event) => event.stopPropagation()}>
        <header className="planning-canvas-modal-header">
          <div>
            <span>Google Event</span>
            <h2>Änderung bestätigen</h2>
          </div>
          <button type="button" className="icon-button" aria-label="Schliessen" disabled={props.busy} onClick={props.onCancel}>
            <X size={18} />
          </button>
        </header>
        <div className="planning-canvas-modal-form">
          <p>
            Möchtest du das Event <strong>{props.draft.event.title}</strong> wirklich von <strong>{currentRange}</strong> auf <strong>{nextRange}</strong> verschieben?
          </p>
        </div>
        <footer className="planning-canvas-modal-actions">
          <button type="button" className="secondary-action compact" disabled={props.busy} onClick={props.onCancel}>Abbrechen</button>
          <button type="button" className="primary-action compact" disabled={props.busy} onClick={props.onConfirm}>Änderung speichern</button>
        </footer>
      </section>
    </div>
  );
}

function PlanningCanvasGoogleEventCreateModal(props: {
  draft: PlanningCanvasGoogleCreateDraft;
  sources: CalendarSource[];
  busy: boolean;
  onChange: (draft: PlanningCanvasGoogleCreateDraft) => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const dateRange = `${formatDateOnly(props.draft.startDate)} - ${formatDateOnly(props.draft.endDate)}`;
  const canSave = Boolean(props.draft.title.trim() && props.draft.calendarSourceId && props.sources.length > 0);
  return (
    <div className="planning-canvas-modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section className="planning-canvas-modal planning-canvas-google-event-modal" role="dialog" aria-modal="true" aria-label="Google Event erstellen" onMouseDown={(event) => event.stopPropagation()}>
        <header className="planning-canvas-modal-header">
          <div>
            <span>Google Event</span>
            <h2>Neues Event erstellen</h2>
            <p>{dateRange}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Schliessen" disabled={props.busy} onClick={props.onCancel}>
            <X size={18} />
          </button>
        </header>
        <div className="planning-canvas-modal-form">
          <label>
            Titel
            <input
              value={props.draft.title}
              disabled={props.busy}
              onChange={(event) => props.onChange({ ...props.draft, title: event.target.value })}
            />
          </label>
          <label>
            Google Kalender
            <select
              value={props.draft.calendarSourceId ?? ""}
              disabled={props.busy || props.sources.length === 0}
              onChange={(event) => props.onChange({ ...props.draft, calendarSourceId: Number(event.target.value) || null })}
            >
              {props.sources.length === 0 ? <option value="">Keine schreibbare Quelle</option> : null}
              {props.sources.map((source) => (
                <option key={source.id} value={source.id}>
                  {source.displayName} · {source.accountLabel}
                </option>
              ))}
            </select>
          </label>
          {props.sources.length === 0 ? <div className="config-hint">Keine schreibbare Google-Kalenderquelle konfiguriert.</div> : null}
        </div>
        <footer className="planning-canvas-modal-actions">
          <button type="button" className="secondary-action compact" disabled={props.busy} onClick={props.onCancel}>Abbrechen</button>
          <button type="button" className="primary-action compact" disabled={props.busy || !canSave} onClick={props.onConfirm}>Google Event erstellen</button>
        </footer>
      </section>
    </div>
  );
}

function PlanningCanvasGoogleEventEditModal(props: {
  event: Extract<CalendarViewEvent, { source: "google" }>;
  busy: boolean;
  onCancel: () => void;
  onSave: (input: { title: string; startDate: string; endDate: string }) => Promise<void>;
}) {
  const [title, setTitle] = useState(props.event.title);
  const [startDate, setStartDate] = useState(datePart(props.event.startAt));
  const [endDate, setEndDate] = useState(datePart(props.event.endAt));
  const [error, setError] = useState<string | null>(null);
  const disabled = props.busy || !props.event.editable;
  const dateRangeInvalid = Boolean(startDate && endDate && endDate < startDate);
  const canSave = props.event.editable && title.trim().length > 0 && startDate.length > 0 && endDate.length > 0 && !dateRangeInvalid;

  const save = async () => {
    if (!canSave) return;
    try {
      setError(null);
      await props.onSave({ title, startDate, endDate });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Event konnte nicht gespeichert werden.");
    }
  };

  return (
    <div className="planning-canvas-modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section className="planning-canvas-modal planning-canvas-google-event-modal" role="dialog" aria-modal="true" aria-label="Google Event bearbeiten" onMouseDown={(event) => event.stopPropagation()}>
        <header className="planning-canvas-modal-header">
          <div>
            <span>Google Event</span>
            <h2>Event bearbeiten</h2>
            <p>{props.event.sourceDisplayName}</p>
          </div>
          <button type="button" className="icon-button" aria-label="Schliessen" disabled={props.busy} onClick={props.onCancel}>
            <X size={18} />
          </button>
        </header>
        <div className="planning-canvas-modal-form">
          <label>
            Titel
            <input
              value={title}
              disabled={disabled}
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>
          <label>
            Startdatum
            <input
              type="date"
              value={startDate}
              disabled={disabled}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </label>
          <label>
            Enddatum
            <input
              type="date"
              value={endDate}
              min={startDate || undefined}
              disabled={disabled}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </label>
          {!props.event.editable ? <div className="config-hint">{props.event.readOnlyReason ?? "Dieses Google Event ist schreibgeschützt."}</div> : null}
          {dateRangeInvalid ? <div className="form-error">Das Enddatum darf nicht vor dem Startdatum liegen.</div> : null}
          {error ? <div className="form-error">{error}</div> : null}
        </div>
        <footer className="planning-canvas-modal-actions">
          <button type="button" className="secondary-action compact" disabled={props.busy} onClick={props.onCancel}>Abbrechen</button>
          <button type="button" className="primary-action compact" disabled={props.busy || !canSave} onClick={() => void save()}>Google Event speichern</button>
        </footer>
      </section>
    </div>
  );
}

function GoogleCalendarGlyph() {
  return (
    <svg viewBox="0 0 48 48" focusable="false">
      <path fill="#ffc107" d="M43.61 20.08H42V20H24v8h11.3c-1.65 4.66-6.08 8-11.3 8-6.63 0-12-5.37-12-12s5.37-12 12-12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 12.95 4 4 12.95 4 24s8.95 20 20 20 20-8.95 20-20c0-1.34-.14-2.65-.39-3.92z" />
      <path fill="#ff3d00" d="M6.31 14.69l6.57 4.82C14.66 15.11 18.96 12 24 12c3.06 0 5.84 1.15 7.96 3.04l5.66-5.66C34.05 6.05 29.27 4 24 4 16.32 4 9.66 8.34 6.31 14.69z" />
      <path fill="#4caf50" d="M24 44c5.17 0 9.86-1.98 13.41-5.19l-6.19-5.24C29.21 35.09 26.72 36 24 36c-5.2 0-9.62-3.31-11.29-7.95l-6.52 5.02C9.5 39.56 16.23 44 24 44z" />
      <path fill="#1976d2" d="M43.61 20.08H42V20H24v8h11.3a12.04 12.04 0 0 1-4.09 5.57l.01-.01 6.19 5.24C36.97 39.2 44 34 44 24c0-1.34-.14-2.65-.39-3.92z" />
    </svg>
  );
}

function GoogleCalendarTimebarBadge() {
  return (
    <span className="planning-canvas-time-google-badge" title="Linked to Google Calendar" aria-hidden="true">
      <GoogleCalendarGlyph />
    </span>
  );
}

function PlanningCanvasRelatedProjectModal(props: {
  anchor: PlanningCanvasInitiativeNode;
  direction: PlanningCanvasRelatedProjectDirection;
  categories: Category[];
  onClose: () => void;
  onCreate: (input: Omit<CreateInitiativeInput, "type">) => Promise<void>;
}) {
  const relationLabel = props.direction === "predecessor" ? "predecessor" : "successor";
  const [draft, setDraft] = useState({
    name: "",
    categoryId: props.anchor.initiative.categoryId,
    startDate: "",
    endDate: "",
    summary: ""
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dateRangeInvalid = initiativeDateRangeInvalid(draft.startDate, draft.endDate);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") props.onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  const create = async () => {
    if (busy || !draft.name.trim() || dateRangeInvalid) return;
    setBusy(true);
    setError(null);
    try {
      await props.onCreate({
        categoryId: draft.categoryId,
        name: draft.name.trim(),
        startDate: draft.startDate || null,
        endDate: draft.endDate || null,
        summary: nullableText(draft.summary)
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Project could not be created.");
      setBusy(false);
    }
  };

  return (
    <div className="planning-canvas-modal-backdrop" role="presentation" onMouseDown={props.onClose}>
      <section className="planning-canvas-modal" role="dialog" aria-modal="true" aria-label={`Create ${relationLabel} project`} onMouseDown={(event) => event.stopPropagation()}>
        <header className="planning-canvas-modal-header">
          <div>
            <h2>Create {relationLabel} project</h2>
            <p>
              {props.direction === "predecessor" ? "Before" : "After"} {props.anchor.initiative.name}
            </p>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} title="Close">
            <X size={18} />
          </button>
        </header>

        <div className="planning-canvas-modal-form">
          <label>
            Name
            <input autoFocus value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Category
            <select value={draft.categoryId} onChange={(event) => setDraft((current) => ({ ...current, categoryId: Number(event.target.value) }))}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <div className="planning-canvas-modal-date-grid">
            <label>
              From
              <input type="date" value={draft.startDate} onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))} />
            </label>
            <label>
              To
              <input
                type="date"
                value={draft.endDate}
                min={draft.startDate || undefined}
                onPointerDown={(event) => primeEmptyDatePickerMonth(event, draft.startDate, draft.endDate)}
                onFocus={(event) => primeEmptyDatePickerMonth(event, draft.startDate, draft.endDate)}
                onBlur={(event) => restorePrimedEmptyDateInput(event, draft.endDate)}
                onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
              />
            </label>
          </div>
          <label>
            Summary
            <textarea value={draft.summary} onChange={(event) => setDraft((current) => ({ ...current, summary: event.target.value }))} rows={4} />
          </label>
        </div>

        {dateRangeInvalid ? <div className="error-banner">From date cannot be after To date.</div> : null}
        {error ? <div className="error-banner">{error}</div> : null}

        <footer className="planning-canvas-modal-actions">
          <button type="button" className="secondary-action compact" onClick={props.onClose}>
            Cancel
          </button>
          <button type="button" className="primary-action compact" disabled={busy || !draft.name.trim() || dateRangeInvalid} onClick={() => void create()}>
            Create {relationLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}
const PLANNING_CANVAS_LOOKBACK_MONTHS = 1;
const PLANNING_CANVAS_MONTH_COUNT = 11;
const PLANNING_CANVAS_WEEK_WIDTH = 88;
const PLANNING_CANVAS_MIN_ZOOM = 0.1;
const PLANNING_CANVAS_MAX_ZOOM = 1.5;
const PLANNING_CANVAS_ZOOM_STEP = 0.1;
const PLANNING_CANVAS_TIME_HEADER_HEIGHT = 52;
const PLANNING_CANVAS_TIME_LANE_HEIGHT = 52;
const PLANNING_CANVAS_TIME_BAR_TOP_OFFSET = 10;
const PLANNING_CANVAS_TIME_BAR_HEIGHT = 32;
const PLANNING_CANVAS_TIME_MARKER_WIDTH = 10;

type PlanningCanvasRange = {
  start: Date;
  end: Date;
  totalDays: number;
  weekCount: number;
  width: number;
};

type PlanningCanvasTimeVisual = {
  nodeId: number;
  initiativeId: number;
  name: string;
  nodeX: number;
  nodeY: number;
  kind: "bar" | "start" | "end";
  status: Initiative["status"];
  projectPhase: ProjectPhase;
  isLocked: boolean;
  hasGoogleCalendarBinding: boolean;
  left: number;
  width: number;
  top: number;
  color: string;
  textColor: string;
  title: string;
};

type PlanningCanvasGoogleTimeVisual = {
  id: string;
  name: string;
  event: Extract<CalendarViewEvent, { source: "google" }>;
  left: number;
  width: number;
  top: number;
  row: number;
  color: string;
  title: string;
  htmlLink: string | null;
  special: PlanningCanvasSpecialGoogleEventMatch | null;
  hasChildcareConflict: boolean;
};
type PlanningCanvasChildcareLaneSpan = {
  id: string;
  left: number;
  width: number;
  title: string;
};
type PlanningCanvasRelationGroup = {
  initiativeIds: Set<number>;
  nodeIds: number[];
  hasPrecedes: boolean;
  parentInitiativeIds: Set<number>;
};

function buildPlanningCanvasRelationGroups(
  nodes: PlanningCanvasInitiativeNode[],
  edges: PlanningCanvasRelationEdge[]
): { byInitiativeId: Map<number, PlanningCanvasRelationGroup> } {
  const nodeByInitiativeId = new Map(nodes.map((node) => [node.initiativeId, node]));
  const adjacency = new Map<number, Set<number>>();
  const relatedInitiativeIds = new Set<number>();
  const componentMetaByEdgeKey = new Map<string, { hasPrecedes: boolean; parentInitiativeIds: Set<number> }>();

  const addNeighbor = (fromId: number, toId: number) => {
    const neighbors = adjacency.get(fromId) ?? new Set<number>();
    neighbors.add(toId);
    adjacency.set(fromId, neighbors);
  };

  for (const edge of edges) {
    if (!nodeByInitiativeId.has(edge.fromInitiativeId) || !nodeByInitiativeId.has(edge.toInitiativeId)) continue;
    addNeighbor(edge.fromInitiativeId, edge.toInitiativeId);
    addNeighbor(edge.toInitiativeId, edge.fromInitiativeId);
    relatedInitiativeIds.add(edge.fromInitiativeId);
    relatedInitiativeIds.add(edge.toInitiativeId);
    const key = `${edge.fromInitiativeId}:${edge.toInitiativeId}`;
    componentMetaByEdgeKey.set(key, {
      hasPrecedes: edge.kind === "precedes",
      parentInitiativeIds: edge.kind === "parent_child" ? new Set([edge.fromInitiativeId]) : new Set()
    });
  }

  const visited = new Set<number>();
  const byInitiativeId = new Map<number, PlanningCanvasRelationGroup>();
  for (const startId of relatedInitiativeIds) {
    if (visited.has(startId)) continue;
    const stack = [startId];
    const initiativeIds = new Set<number>();
    let hasPrecedes = false;
    const parentInitiativeIds = new Set<number>();
    visited.add(startId);

    while (stack.length > 0) {
      const currentId = stack.pop()!;
      initiativeIds.add(currentId);
      for (const nextId of adjacency.get(currentId) ?? []) {
        const forward = componentMetaByEdgeKey.get(`${currentId}:${nextId}`);
        const backward = componentMetaByEdgeKey.get(`${nextId}:${currentId}`);
        const meta = forward ?? backward;
        if (meta?.hasPrecedes) hasPrecedes = true;
        meta?.parentInitiativeIds.forEach((id) => parentInitiativeIds.add(id));
        if (!visited.has(nextId)) {
          visited.add(nextId);
          stack.push(nextId);
        }
      }
    }

    const nodeIds = [...initiativeIds]
      .map((initiativeId) => nodeByInitiativeId.get(initiativeId)?.id)
      .filter((nodeId): nodeId is number => nodeId !== undefined);
    if (nodeIds.length <= 1) continue;
    const group: PlanningCanvasRelationGroup = { initiativeIds, nodeIds, hasPrecedes, parentInitiativeIds };
    initiativeIds.forEach((initiativeId) => byInitiativeId.set(initiativeId, group));
  }

  return { byInitiativeId };
}

function planningCanvasRange(monthCount: number): PlanningCanvasRange {
  const today = new Date();
  const firstMonth = new Date(Date.UTC(today.getFullYear(), today.getMonth() - PLANNING_CANVAS_LOOKBACK_MONTHS, 1));
  const lastMonthEnd = new Date(Date.UTC(firstMonth.getUTCFullYear(), firstMonth.getUTCMonth() + monthCount, 0));
  const rangeStart = startOfUtcWeek(firstMonth);
  const rangeEnd = endOfUtcWeek(lastMonthEnd);
  const totalDays = daysBetween(rangeStart, rangeEnd) + 1;
  const weekCount = Math.ceil(totalDays / 7);
  return {
    start: rangeStart,
    end: rangeEnd,
    totalDays,
    weekCount,
    width: weekCount * PLANNING_CANVAS_WEEK_WIDTH
  };
}

function planningCanvasMonths(range: PlanningCanvasRange): Array<{ key: string; label: string; left: number; width: number }> {
  const months: Array<{ key: string; label: string; left: number; width: number }> = [];
  let cursor = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), 1));
  if (cursor < range.start) {
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  while (cursor <= range.end) {
    const monthStart = cursor < range.start ? range.start : cursor;
    const monthEndCandidate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const monthEnd = monthEndCandidate > range.end ? range.end : monthEndCandidate;
    months.push({
      key: `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}`,
      label: cursor.toLocaleDateString("de-DE", { month: "short", year: "numeric", timeZone: "UTC" }),
      left: planningCanvasDateX(dateOnlyFromUtc(monthStart), range) ?? 0,
      width: ((daysBetween(monthStart, monthEnd) + 1) / 7) * PLANNING_CANVAS_WEEK_WIDTH
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return months;
}

function planningCanvasWeeks(range: PlanningCanvasRange): Array<{ key: string; label: string; left: number; title: string }> {
  return Array.from({ length: range.weekCount }, (_, index) => {
    const weekStart = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate() + index * 7));
    return {
      key: dateOnlyFromUtc(weekStart),
      label: weekStart.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", timeZone: "UTC" }),
      left: index * PLANNING_CANVAS_WEEK_WIDTH,
      title: `Week of ${formatDateOnly(dateOnlyFromUtc(weekStart))}`
    };
  });
}

function planningCanvasWeekends(range: PlanningCanvasRange): Array<{ key: string; left: number; width: number; title: string }> {
  return Array.from({ length: range.weekCount }, (_, index) => {
    const saturday = new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate() + index * 7 + 5));
    const sunday = new Date(Date.UTC(saturday.getUTCFullYear(), saturday.getUTCMonth(), saturday.getUTCDate() + 1));
    return {
      key: dateOnlyFromUtc(saturday),
      left: index * PLANNING_CANVAS_WEEK_WIDTH + (PLANNING_CANVAS_WEEK_WIDTH / 7) * 5,
      width: (PLANNING_CANVAS_WEEK_WIDTH / 7) * 2,
      title: `${formatDateOnly(dateOnlyFromUtc(saturday))} - ${formatDateOnly(dateOnlyFromUtc(sunday))}`
    };
  });
}

function planningCanvasDateX(date: string, range: PlanningCanvasRange): number | null {
  const parsed = parseDateOnlyUtc(date);
  if (!parsed) return null;
  const dayOffset = daysBetween(range.start, parsed);
  if (dayOffset < 0 || dayOffset > range.totalDays) {
    return null;
  }
  return (dayOffset / 7) * PLANNING_CANVAS_WEEK_WIDTH;
}

function planningCanvasDateFromX(x: number, range: PlanningCanvasRange): string | null {
  const dayOffset = Math.round((x / PLANNING_CANVAS_WEEK_WIDTH) * 7);
  if (dayOffset < 0 || dayOffset > range.totalDays) return null;
  return dateOnlyFromUtc(new Date(Date.UTC(range.start.getUTCFullYear(), range.start.getUTCMonth(), range.start.getUTCDate() + dayOffset)));
}

function planningCanvasPhaseColor(color: string, projectPhase: ProjectPhase): string {
  if (projectPhase !== "planning") return color;
  return mixHexColor(color, "#ffffff", 0.58) ?? color;
}

function mixHexColor(color: string, mixWith: string, mixRatio: number): string | null {
  const from = parseHexColor(color);
  const to = parseHexColor(mixWith);
  if (!from || !to) return null;
  const ratio = Math.max(0, Math.min(1, mixRatio));
  const mixed = from.map((channel, index) => Math.round(channel * (1 - ratio) + to[index]! * ratio));
  return `#${mixed.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function parseHexColor(color: string): [number, number, number] | null {
  const value = color.trim();
  const short = value.match(/^#([0-9a-f]{3})$/i);
  if (short) {
    return short[1]!.split("").map((part) => Number.parseInt(`${part}${part}`, 16)) as [number, number, number];
  }
  const full = value.match(/^#([0-9a-f]{6})$/i);
  if (!full) return null;
  const hex = full[1]!;
  return [0, 2, 4].map((index) => Number.parseInt(hex.slice(index, index + 2), 16)) as [number, number, number];
}

function planningCanvasTimeVisual(node: PlanningCanvasInitiativeNode, range: PlanningCanvasRange): PlanningCanvasTimeVisual | null {
  const start = node.initiative.startDate ? parseDateOnlyUtc(node.initiative.startDate) : null;
  const end = node.initiative.endDate ? parseDateOnlyUtc(node.initiative.endDate) : null;
  if (!start && !end) return null;

  const top = planningCanvasTimeLaneTop(node.y);
  const color = planningCanvasPhaseColor(node.category?.color ?? "#27806f", node.initiative.projectPhase);
  const base = {
    nodeId: node.id,
    initiativeId: node.initiativeId,
    name: node.initiative.name,
    nodeX: node.x,
    nodeY: node.y,
    status: node.initiative.status,
    projectPhase: node.initiative.projectPhase,
    isLocked: node.initiative.isLocked,
    hasGoogleCalendarBinding: node.hasGoogleCalendarBinding,
    top,
    color,
    textColor: node.initiative.projectPhase === "planning" ? "#17211c" : "#ffffff"
  };

  if (start && end) {
    if (end < range.start || start > range.end) return null;
    const clippedStart = start < range.start ? range.start : start;
    const clippedEnd = end > range.end ? range.end : end;
    const left = planningCanvasDateX(dateOnlyFromUtc(clippedStart), range);
    const endExclusive = new Date(Date.UTC(clippedEnd.getUTCFullYear(), clippedEnd.getUTCMonth(), clippedEnd.getUTCDate() + 1));
    const right = planningCanvasDateX(dateOnlyFromUtc(endExclusive), range) ?? range.width;
    if (left === null) return null;
    return {
      ...base,
      kind: "bar",
      left,
      width: Math.max(1, right - left),
      title: `${node.initiative.name}: ${formatDateOnly(node.initiative.startDate!)} - ${formatDateOnly(node.initiative.endDate!)}`
    };
  }

  const markerDate = start ?? end;
  const left = markerDate ? planningCanvasDateX(dateOnlyFromUtc(markerDate), range) : null;
  if (left === null) return null;
  return {
    ...base,
    kind: start ? "start" : "end",
    left,
    width: PLANNING_CANVAS_TIME_MARKER_WIDTH,
    title: `${node.initiative.name}: ${start ? "starts" : "ends"} ${formatDateOnly(node.initiative.startDate ?? node.initiative.endDate ?? "")}`
  };
}

function isPlanningCanvasTimeVisual(value: PlanningCanvasTimeVisual | null): value is PlanningCanvasTimeVisual {
  return value !== null;
}

function layoutPlanningCanvasGoogleTimeVisuals(events: Array<Extract<CalendarViewEvent, { source: "google" }>>, range: PlanningCanvasRange): PlanningCanvasGoogleTimeVisual[] {
  const rowRightEdges: number[] = [];
  const baseVisuals = events
    .map((event) => planningCanvasGoogleTimeVisual(event, range))
    .filter(isPlanningCanvasGoogleTimeVisual)
    .sort((left, right) => left.left - right.left || right.width - left.width || left.name.localeCompare(right.name));
  const specialVisuals = baseVisuals
    .filter((visual) => visual.special)
    .sort((left, right) =>
      left.left - right.left
      || right.width - left.width
      || (left.special?.priority ?? 0) - (right.special?.priority ?? 0)
      || left.name.localeCompare(right.name)
    );
  const normalRowOffset = specialVisuals.length > 0 ? 1 : 0;
  const childcareVisuals = specialVisuals.map((visual) => ({
    ...visual,
    row: 0,
    top: planningCanvasGoogleLaneTop(0),
    hasChildcareConflict: specialVisuals.some((candidate) =>
      candidate.id !== visual.id
      && candidate.special?.kind !== visual.special?.kind
      && planningCanvasIntervalsOverlap(visual, candidate)
    )
  }));
  const regularVisuals = baseVisuals
    .filter((visual) => !visual.special)
    .map((visual) => {
      const availableRow = rowRightEdges.findIndex((right) => right <= visual.left);
      const nextRow = availableRow === -1 ? rowRightEdges.length : availableRow;
      rowRightEdges[nextRow] = visual.left + visual.width;
      return {
        ...visual,
        row: nextRow + normalRowOffset,
        top: planningCanvasGoogleLaneTop(nextRow + normalRowOffset)
      };
    });
  return [...childcareVisuals, ...regularVisuals];
}

function planningCanvasGoogleTimeVisual(event: Extract<CalendarViewEvent, { source: "google" }>, range: PlanningCanvasRange): PlanningCanvasGoogleTimeVisual | null {
  const start = parseDateOnlyUtc(datePart(event.startAt));
  const end = parseDateOnlyUtc(datePart(event.endAt));
  if (!start || !end || end < range.start || start > range.end) return null;
  const clippedStart = start < range.start ? range.start : start;
  const clippedEnd = end > range.end ? range.end : end;
  const left = planningCanvasDateX(dateOnlyFromUtc(clippedStart), range);
  const endExclusive = new Date(Date.UTC(clippedEnd.getUTCFullYear(), clippedEnd.getUTCMonth(), clippedEnd.getUTCDate() + 1));
  const right = planningCanvasDateX(dateOnlyFromUtc(endExclusive), range) ?? range.width;
  if (left === null) return null;
  const special = classifyPlanningCanvasSpecialGoogleEvent(event);
  return {
    id: event.id,
    name: event.title,
    event,
    left,
    width: Math.max(1, right - left),
    top: planningCanvasGoogleLaneTop(0),
    row: 0,
    color: special?.color ?? event.color ?? "#5167b8",
    title: `${event.title}: ${formatDateOnly(datePart(event.startAt))} - ${formatDateOnly(datePart(event.endAt))} · ${event.sourceDisplayName}`,
    htmlLink: event.htmlLink,
    special,
    hasChildcareConflict: false
  };
}

function isPlanningCanvasGoogleTimeVisual(value: PlanningCanvasGoogleTimeVisual | null): value is PlanningCanvasGoogleTimeVisual {
  return value !== null;
}

function planningCanvasChildcareGapSpans(visuals: PlanningCanvasGoogleTimeVisual[]): PlanningCanvasChildcareLaneSpan[] {
  const intervals = visuals
    .filter((visual) => visual.special)
    .sort((left, right) => left.left - right.left || left.width - right.width);
  if (intervals.length <= 1) return [];

  const merged: Array<{ left: number; right: number }> = [];
  for (const visual of intervals) {
    const right = visual.left + visual.width;
    const last = merged.at(-1);
    if (!last || visual.left > last.right) {
      merged.push({ left: visual.left, right });
    } else {
      last.right = Math.max(last.right, right);
    }
  }

  const gaps: PlanningCanvasChildcareLaneSpan[] = [];
  for (let index = 1; index < merged.length; index += 1) {
    const previous = merged[index - 1]!;
    const current = merged[index]!;
    const width = current.left - previous.right;
    if (width <= 0) continue;
    gaps.push({
      id: `childcare-gap-${index}-${previous.right}-${current.left}`,
      left: previous.right,
      width,
      title: "Betreuungsluecke: kein Kinder-Betreuungs-Event"
    });
  }
  return gaps;
}

function planningCanvasChildcareOverlapSpans(visuals: PlanningCanvasGoogleTimeVisual[]): PlanningCanvasChildcareLaneSpan[] {
  const specialVisuals = visuals.filter((visual) => visual.special);
  const overlaps: Array<{ left: number; right: number }> = [];
  for (let leftIndex = 0; leftIndex < specialVisuals.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < specialVisuals.length; rightIndex += 1) {
      const left = specialVisuals[leftIndex]!;
      const right = specialVisuals[rightIndex]!;
      if (left.special?.kind === right.special?.kind || !planningCanvasIntervalsOverlap(left, right)) continue;
      overlaps.push({
        left: Math.max(left.left, right.left),
        right: Math.min(left.left + left.width, right.left + right.width)
      });
    }
  }
  return mergePlanningCanvasSpans(overlaps).map((span, index) => ({
    id: `childcare-overlap-${index}-${span.left}-${span.right}`,
    left: span.left,
    width: span.right - span.left,
    title: "Ueberschneidung: Bianka und Dietrich haben Kinder"
  }));
}

function mergePlanningCanvasSpans(spans: Array<{ left: number; right: number }>): Array<{ left: number; right: number }> {
  const sorted = spans
    .filter((span) => span.right > span.left)
    .sort((left, right) => left.left - right.left || left.right - right.right);
  const merged: Array<{ left: number; right: number }> = [];
  for (const span of sorted) {
    const last = merged.at(-1);
    if (!last || span.left > last.right) {
      merged.push({ ...span });
    } else {
      last.right = Math.max(last.right, span.right);
    }
  }
  return merged;
}

function planningCanvasIntervalsOverlap(
  left: Pick<PlanningCanvasGoogleTimeVisual, "left" | "width">,
  right: Pick<PlanningCanvasGoogleTimeVisual, "left" | "width">
): boolean {
  return left.left < right.left + right.width && right.left < left.left + left.width;
}

function isPlanningCanvasGoogleTimeEvent(event: CalendarViewEvent, nodes: PlanningCanvasInitiativeNode[]): event is Extract<CalendarViewEvent, { source: "google" }> {
  if (event.source !== "google" || (!event.allDay && datePart(event.startAt) === datePart(event.endAt))) {
    return false;
  }
  if (isExcludedPlanningCanvasGoogleEvent(event)) {
    return false;
  }
  const placedInitiativeIds = new Set(nodes.map((node) => node.initiativeId));
  return event.binding?.localEntityType !== "initiative_project_span" || !placedInitiativeIds.has(event.binding.localEntityId);
}

function isExcludedPlanningCanvasGoogleEvent(event: Extract<CalendarViewEvent, { source: "google" }>): boolean {
  const sourceName = event.sourceDisplayName.toLocaleLowerCase("de-DE");
  const calendarId = event.externalCalendarId.toLocaleLowerCase("de-DE");
  const title = event.title.toLocaleLowerCase("de-DE");
  return calendarId.includes("#holiday@group.v.calendar.google.com")
    || sourceName.includes("feiertage in deutschland")
    || sourceName.includes("german holidays")
    || calendarId.includes("birthday")
    || sourceName.includes("geburtstag")
    || sourceName.includes("birthdays")
    || title.includes("geburtstag");
}

function planningCanvasHiddenEventMeta(hiddenEvent: CalendarEventVisibility): string {
  const scope = hiddenEvent.hiddenScope === "recurring_series"
    ? "Serie"
    : hiddenEvent.hiddenScope === "recurring_instance"
      ? "Vorkommen"
      : "Event";
  const date = hiddenEvent.startAtSnapshot ? formatDateOnly(datePart(hiddenEvent.startAtSnapshot)) : "ohne Datum";
  return `${scope} · ${date}`;
}

function planningCanvasGoogleLaneTop(row: number): number {
  return PLANNING_CANVAS_TIME_HEADER_HEIGHT + row * PLANNING_CANVAS_TIME_LANE_HEIGHT + PLANNING_CANVAS_TIME_BAR_TOP_OFFSET;
}

function planningCanvasStorageYFromCanvasY(y: number, googleLaneCount: number): number {
  return Math.max(PLANNING_CANVAS_TIME_HEADER_HEIGHT, y - googleLaneCount * PLANNING_CANVAS_TIME_LANE_HEIGHT);
}

function planningCanvasTimeLaneTop(y: number): number {
  const laneIndex = Math.max(0, Math.round(Math.max(0, y - PLANNING_CANVAS_TIME_HEADER_HEIGHT) / PLANNING_CANVAS_TIME_LANE_HEIGHT));
  return PLANNING_CANVAS_TIME_HEADER_HEIGHT + laneIndex * PLANNING_CANVAS_TIME_LANE_HEIGHT + PLANNING_CANVAS_TIME_BAR_TOP_OFFSET;
}

function planningCanvasYForTimeDrag(
  drag: {
    startClientY: number;
    originY: number;
  },
  clientY: number
): number {
  const nextY = drag.originY + (clientY - drag.startClientY);
  return planningCanvasClampLaneY(nextY);
}

function planningCanvasClampLaneY(y: number): number {
  const laneIndex = Math.max(0, Math.round(Math.max(0, y - PLANNING_CANVAS_TIME_HEADER_HEIGHT) / PLANNING_CANVAS_TIME_LANE_HEIGHT));
  return PLANNING_CANVAS_TIME_HEADER_HEIGHT + laneIndex * PLANNING_CANVAS_TIME_LANE_HEIGHT;
}

function planningCanvasLaneDeltaFromPointer(startClientY: number, clientY: number): number {
  return Math.round((clientY - startClientY) / PLANNING_CANVAS_TIME_LANE_HEIGHT);
}

function planningCanvasDayDeltaFromPointer(startClientX: number, clientX: number, zoom: number): number {
  const dayWidth = (PLANNING_CANVAS_WEEK_WIDTH * zoom) / 7;
  return Math.round((clientX - startClientX) / dayWidth);
}

function planningCanvasShiftDatesForDrag(
  drag: {
    mode: PlanningCanvasTimeDragMode;
    originStartDate: string | null;
    originEndDate: string | null;
    locksTimeframe?: boolean;
  },
  dayDelta: number
): { startDate: string | null; endDate: string | null } {
  if (dayDelta === 0 || drag.locksTimeframe) {
    return { startDate: drag.originStartDate, endDate: drag.originEndDate };
  }

  if (drag.mode === "move") {
    return {
      startDate: drag.originStartDate ? shiftDate(drag.originStartDate, dayDelta) : null,
      endDate: drag.originEndDate ? shiftDate(drag.originEndDate, dayDelta) : null
    };
  }

  if (drag.mode === "resize-start" || drag.mode === "move-start") {
    const shiftedStart = drag.originStartDate ? shiftDate(drag.originStartDate, dayDelta) : null;
    const startDate = shiftedStart && drag.originEndDate && shiftedStart > drag.originEndDate ? drag.originEndDate : shiftedStart;
    return { startDate, endDate: drag.originEndDate };
  }

  const shiftedEnd = drag.originEndDate ? shiftDate(drag.originEndDate, dayDelta) : null;
  const endDate = shiftedEnd && drag.originStartDate && shiftedEnd < drag.originStartDate ? drag.originStartDate : shiftedEnd;
  return { startDate: drag.originStartDate, endDate };
}

function planningCanvasShiftGoogleDatesForDrag(
  drag: Pick<PlanningCanvasGoogleTimeDragState, "mode" | "originStartDate" | "originEndDate">,
  dayDelta: number
): { startDate: string; endDate: string } {
  if (dayDelta === 0) {
    return { startDate: drag.originStartDate, endDate: drag.originEndDate };
  }

  if (drag.mode === "resize-start") {
    const shiftedStart = shiftDate(drag.originStartDate, dayDelta);
    return { startDate: shiftedStart > drag.originEndDate ? drag.originEndDate : shiftedStart, endDate: drag.originEndDate };
  }

  const shiftedEnd = shiftDate(drag.originEndDate, dayDelta);
  return { startDate: drag.originStartDate, endDate: shiftedEnd < drag.originStartDate ? drag.originStartDate : shiftedEnd };
}

function planningCanvasGoogleCreatePreview(
  drag: PlanningCanvasGoogleCreateDragState,
  range: PlanningCanvasRange
): { left: number; width: number; top: number } | null {
  return planningCanvasGoogleCreatePreviewForDates(drag.row, drag.startDate, drag.draftEndDate, range);
}

function planningCanvasGoogleCreateDraftPreview(
  draft: PlanningCanvasGoogleCreateDraft,
  range: PlanningCanvasRange
): { left: number; width: number; top: number } | null {
  return planningCanvasGoogleCreatePreviewForDates(draft.row, draft.startDate, draft.endDate, range);
}

function planningCanvasGoogleCreatePreviewForDates(
  row: number,
  startDate: string,
  endDate: string,
  range: PlanningCanvasRange
): { left: number; width: number; top: number } | null {
  const start = parseDateOnlyUtc(startDate);
  const end = parseDateOnlyUtc(endDate);
  if (!start || !end) return null;
  const left = planningCanvasDateX(dateOnlyFromUtc(start), range);
  const endExclusive = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() + 1));
  const right = planningCanvasDateX(dateOnlyFromUtc(endExclusive), range) ?? range.width;
  if (left === null || right <= left) return null;
  return {
    left,
    width: right - left,
    top: planningCanvasGoogleLaneTop(row)
  };
}

function defaultRelatedProjectDates(
  anchor: Pick<Initiative, "startDate" | "endDate">,
  direction: PlanningCanvasRelatedProjectDirection
): { startDate: string; endDate: string } {
  if (direction === "predecessor") {
    const anchorStart = anchor.startDate ?? anchor.endDate ?? dateOnlyLocal(new Date());
    const startDate = shiftDate(anchorStart, -7);
    return { startDate, endDate: shiftDate(startDate, 6) };
  }

  const anchorEnd = anchor.endDate ?? anchor.startDate ?? dateOnlyLocal(new Date());
  const startDate = shiftDate(anchorEnd, 1);
  return { startDate, endDate: shiftDate(startDate, 6) };
}

function startOfUtcWeek(date: Date): Date {
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + mondayOffset));
}

function endOfUtcWeek(date: Date): Date {
  const start = startOfUtcWeek(date);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + 6));
}

function clampCanvasCoordinate(value: number): number {
  return Math.max(0, Math.min(100000, value));
}

function clampCanvasZoom(value: number): number {
  return Math.max(PLANNING_CANVAS_MIN_ZOOM, Math.min(PLANNING_CANVAS_MAX_ZOOM, Number(value.toFixed(2))));
}

function formatPlanningCanvasDateRange(initiative: Pick<Initiative, "startDate" | "endDate">): string | null {
  if (initiative.startDate && initiative.endDate) {
    return `from ${formatDateOnly(initiative.startDate)} · to ${formatDateOnly(initiative.endDate)}`;
  }
  if (initiative.startDate) {
    return `from ${formatDateOnly(initiative.startDate)}`;
  }
  if (initiative.endDate) {
    return `to ${formatDateOnly(initiative.endDate)}`;
  }
  return null;
}

function pointerDistance(first: { x: number; y: number }, second: { x: number; y: number }): number {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}


function initiativeDateRangeInvalid(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate > endDate);
}


function primeEmptyDatePickerMonth(
  event: ReactPointerEvent<HTMLInputElement> | ReactFocusEvent<HTMLInputElement>,
  preferredDate: string,
  committedValue: string
): void {
  if (!preferredDate || committedValue) return;
  const input = event.currentTarget;
  input.dataset.primedEmptyDate = "true";
  input.dataset.primedDateValue = preferredDate;
  input.value = preferredDate;
}


function restorePrimedEmptyDateInput(event: ReactFocusEvent<HTMLInputElement>, committedValue: string): void {
  const input = event.currentTarget;
  const primedDate = input.dataset.primedDateValue;
  const shouldRestoreEmpty = input.dataset.primedEmptyDate === "true" && !committedValue && primedDate && input.value === primedDate;
  delete input.dataset.primedEmptyDate;
  delete input.dataset.primedDateValue;
  if (shouldRestoreEmpty) {
    input.value = "";
  }
}


function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}


function parseDateOnlyUtc(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}


function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}


function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}


function shiftDate(date: string, days: number): string {
  const parsed = parseDateOnlyUtc(date) ?? startOfUtcDay(new Date());
  return dateOnlyFromUtc(new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate() + days)));
}


function dateOnlyLocal(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}


function dateOnlyFromUtc(date: Date): string {
  return date.toISOString().slice(0, 10);
}


function datePart(value: string): string {
  return value.slice(0, 10);
}
