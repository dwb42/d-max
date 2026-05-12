import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  FocusEvent as ReactFocusEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent
} from "react";
import {
  Blocks,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Clock,
  Copy,
  ExternalLink,
  FileText,
  GitPullRequestArrow,
  GripVertical,
  Image,
  Lightbulb,
  ListTree,
  LayoutGrid,
  Lock,
  LockOpen,
  Mic,
  Mic2,
  Paperclip,
  Pause,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  Repeat2,
  Send,
  Settings,
  Square,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import {
  createCategory,
  createGoogleEventFromDmax,
  createGoogleCalendarAuthUrl,
  createCalendarSource,
  createChatConversation,
  createInitiative,
  createInitiativeRelation,
  createPlanningCanvasNode,
  createTask,
  createTaskChecklistItem,
  createVoiceSession,
  deleteInitiativeRelation,
  deleteTask,
  deleteMediaAttachment,
  deleteTaskChecklistItem,
  disconnectGoogleCalendar,
  fetchChatActivity,
  fetchChatConversations,
  fetchChatMessages,
  fetchCalendarSources,
  fetchGoogleCalendarAccounts,
  fetchGoogleCalendars,
  fetchGoogleCalendarAuthStatus,
  fetchInitiativeGraph,
  fetchOpenClawStatus,
  fetchOverview,
  fetchInitiatives,
  fetchPlanningCanvas,
  fetchPromptLogs,
  fetchPromptTemplates,
  fetchInitiativeDetail,
  fetchTaskDetail,
  prewarmOpenClaw,
  reanalyzeMediaAsset,
  reorderCategories,
  reorderInitiatives,
  reorderMediaAttachments,
  reorderTaskChecklistItems,
  reorderTasks,
  subscribeStateEvents,
  streamChatMessage,
  transcribeVoiceMessage,
  updateCalendarSource,
  updateCategory,
  updateInitiative,
  updateMediaAssetAnalysis,
  updateMediaAttachment,
  updatePlanningCanvasNode,
  updateTask,
  updateTaskChecklistItem,
  updateTaskStatus,
  unlinkCalendarBinding,
  uploadMediaAttachment
} from "./api.js";
import type {
  AppOverview,
  AppConversation,
  Category,
  CalendarSource,
  ConversationContext,
  GoogleCalendarAccountStatus,
  GoogleCalendarAuthStatus,
  GoogleCalendarListItem,
  ChatActivity,
  AppPromptLog,
  PersistedChatMessage,
  OpenClawStatus,
  MediaAttachment,
  MediaAsset,
  MediaEntityType,
  Initiative,
  InitiativeDetail,
  InitiativeRelationWithInitiatives,
  InitiativeType,
  ProjectPhase,
  PlanningCanvasInitiativeNode,
  PlanningCanvasRelationEdge,
  PlanningCanvasViewData,
  PromptTemplateDefinition,
  StateEvent,
  Task,
  TaskChecklistItem,
  TaskDetail
} from "./types.js";
import "./styles.css";

const CalendarRoute = lazy(() => import("./routes/CalendarRoute.js"));

type CollectionView = "ideas" | "projects" | "habits";
type View =
  | "drive"
  | "lifeAreas"
  | "lifeArea"
  | "calendar"
  | "timeline"
  | "planningCanvas"
  | "config"
  | CollectionView
  | "initiative"
  | "tasks"
  | "task"
  | "promptTemplates"
  | "prompts";
type RouteState = {
  view: View;
  initiativeId: number | null;
  taskId: number | null;
  categoryName: string | null;
};
type VoiceState = "idle" | "connecting" | "listening" | "speaking";
type ChatVoicePhase = "idle" | "recording" | "transcribing";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: "text" | "voice";
  activities?: ChatActivity[];
};
type ContextualAgentState = {
  open: boolean;
  context: ConversationContext | null;
  label: string;
  conversationId: number | null;
  conversations: AppConversation[];
};
type AudioMeterHandle = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  raf: number;
};
type CreateInitiativeInput = {
  categoryId: number;
  parentId?: number | null;
  type: InitiativeType;
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
  type?: InitiativeType;
  projectPhase?: ProjectPhase;
  name?: string;
  status?: Initiative["status"];
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
  isLocked?: boolean;
};
type UpdateTaskInput = {
  title?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  notes?: string | null;
  dueAt?: string | null;
};
const LOCKED_TIMEFRAME_TOOLTIP = "Zeitraum ist gesperrt und kann nicht verschoben werden";
const LOCKED_CANVAS_TIMEFRAME_TOOLTIP = "Zeitraum ist gesperrt; Projekt kann nur vertikal verschoben werden";
type RelationshipCreateSlot = "parent" | "child" | "predecessor" | "successor";
type RelationshipCreateDraft = {
  name: string;
  type: Exclude<InitiativeType, "habit">;
  categoryId: string;
};
type PlanningCanvasRelatedProjectDirection = "predecessor" | "successor";
type PlanningCanvasTimeDragMode = "move" | "resize-start" | "resize-end" | "move-start" | "move-end";
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
type PlanningCanvasGroupDragState = {
  pointerId: number;
  startClientY: number;
  nodeIds: number[];
  openOnClickInitiativeId?: number;
  originYByNodeId: Record<number, number>;
  draftYByNodeId: Record<number, number>;
  moved: boolean;
};

type NavItem = { id: Exclude<View, "initiative" | "task">; label: string; icon: typeof Mic; path: string };

const primaryNavItems: NavItem[] = [
  { id: "lifeAreas", label: "Lebensbereiche", icon: LayoutGrid, path: "/categories" },
  { id: "ideas", label: "Ideen", icon: Lightbulb, path: "/ideas" },
  { id: "projects", label: "Projekte", icon: Blocks, path: "/projects" },
  { id: "habits", label: "Gewohnheiten", icon: Repeat2, path: "/habits" },
  { id: "tasks", label: "Massnahmen", icon: ClipboardList, path: "/tasks" },
  { id: "calendar", label: "Kalender", icon: CalendarDays, path: "/calendar" },
  { id: "timeline", label: "Timeline", icon: ListTree, path: "/calendar/timeline" },
  { id: "planningCanvas", label: "Planning Canvas", icon: GitPullRequestArrow, path: "/planning-canvas" }
];

const secondaryNavItems: NavItem[] = [
  { id: "config", label: "Config", icon: Settings, path: "/config" },
  { id: "promptTemplates", label: "Prompt-Vorlagen", icon: FileText, path: "/prompt-vorlagen" },
  { id: "prompts", label: "Prompts", icon: GitPullRequestArrow, path: "/prompts" },
  { id: "drive", label: "Drive", icon: Mic, path: "/drive" }
];

function routeFromPath(path: string): RouteState {
  const [pathname] = path.split("?");
  const lifeAreaMatch = pathname.match(/^\/categories\/([^/]+)$/) ?? pathname.match(/^\/lebensbereiche\/([^/]+)$/);
  if (lifeAreaMatch) {
    return { view: "lifeArea", initiativeId: null, taskId: null, categoryName: decodeURIComponent(lifeAreaMatch[1] ?? "") };
  }
  const ideaCategoryMatch = pathname.match(/^\/ideas\/([^/]+)$/);
  if (ideaCategoryMatch) {
    return { view: "ideas", initiativeId: null, taskId: null, categoryName: decodeURIComponent(ideaCategoryMatch[1] ?? "") };
  }
  const initiativeMatch = pathname.match(/^\/initiatives\/(\d+)$/) ?? pathname.match(/^\/projects\/(\d+)$/);
  if (initiativeMatch) {
    return { view: "initiative", initiativeId: Number(initiativeMatch[1]), taskId: null, categoryName: null };
  }
  const categoryMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (categoryMatch) {
    return { view: "projects", initiativeId: null, taskId: null, categoryName: decodeURIComponent(categoryMatch[1] ?? "") };
  }
  const habitCategoryMatch = pathname.match(/^\/habits\/([^/]+)$/);
  if (habitCategoryMatch) {
    return { view: "habits", initiativeId: null, taskId: null, categoryName: decodeURIComponent(habitCategoryMatch[1] ?? "") };
  }
  const taskMatch = pathname.match(/^\/tasks\/(\d+)$/);
  if (taskMatch) {
    return { view: "task", initiativeId: null, taskId: Number(taskMatch[1]), categoryName: null };
  }

  if (pathname === "/drive") return { view: "drive", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/categories" || pathname === "/lebensbereiche") return { view: "lifeAreas", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/calendar") return { view: "calendar", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/calendar/timeline") return { view: "timeline", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/planning-canvas") return { view: "planningCanvas", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/chat" || pathname === "/") return { view: "lifeAreas", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/ideas") return { view: "ideas", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/projects") return { view: "projects", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/habits") return { view: "habits", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/tasks") return { view: "tasks", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/config") return { view: "config", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/prompt-vorlagen") return { view: "promptTemplates", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/prompts") return { view: "prompts", initiativeId: null, taskId: null, categoryName: null };
  return { view: "lifeAreas", initiativeId: null, taskId: null, categoryName: null };
}

function pathForRoute(view: View, initiativeId?: number | null): string {
  if (view === "initiative") return `/initiatives/${initiativeId}`;
  if (view === "task") return "/tasks";
  if (view === "lifeAreas") return "/categories";
  if (view === "calendar") return "/calendar";
  if (view === "timeline") return "/calendar/timeline";
  if (view === "planningCanvas") return "/planning-canvas";
  if (view === "config") return "/config";
  if (view === "promptTemplates") return "/prompt-vorlagen";
  return `/${view}`;
}

function pathForLifeArea(categoryName: string): string {
  return `/categories/${encodeURIComponent(categoryName)}`;
}

function pathForCollectionCategory(view: CollectionView, categoryName: string): string {
  return `/${view}/${encodeURIComponent(categoryName)}`;
}

function defaultCalendarControls(): CalendarControlsState {
  return {
    mode: "week",
    anchorDate: dateOnlyLocal(new Date()),
    showAllDay: true
  };
}

function calendarControlsFromPath(path: string): CalendarControlsState {
  const defaults = defaultCalendarControls();
  const [pathname, search = ""] = path.split("?");
  if (pathname !== "/calendar") {
    return defaults;
  }

  const params = new URLSearchParams(search);
  const view = params.get("view") ?? params.get("mode");
  const date = params.get("date");
  const allDay = params.get("allDay");
  return {
    mode: view === "day" ? "day" : "week",
    anchorDate: date && isDateOnlyString(date) ? date : defaults.anchorDate,
    showAllDay: allDay === null ? defaults.showAllDay : allDay !== "0" && allDay.toLowerCase() !== "false"
  };
}

function calendarPathForControls(controls: CalendarControlsState): string {
  const params = new URLSearchParams();
  params.set("view", controls.mode);
  params.set("date", controls.anchorDate);
  params.set("allDay", controls.showAllDay ? "1" : "0");
  return `/calendar?${params.toString()}`;
}

function isDateOnlyString(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && Boolean(parseDateOnlyUtc(value));
}

function collectionViewForInitiativeType(type: InitiativeType): CollectionView {
  if (type === "idea") return "ideas";
  if (type === "habit") return "habits";
  return "projects";
}

function getRouteConversationContext(
  route: RouteState,
  overview: AppOverview | null,
  initiativeDetail: InitiativeDetail | null,
  taskDetail: TaskDetail | null
): { context: ConversationContext; label: string } | null {
  if ((isCollectionView(route.view) || route.view === "lifeArea") && route.categoryName) {
    const category = overview?.categories.find((candidate) => candidate.name.toLowerCase() === route.categoryName?.toLowerCase());
    return category ? { context: { type: "category", categoryId: category.id }, label: category.name } : null;
  }

  if (isCollectionView(route.view)) {
    return { context: { type: route.view }, label: titleForView(route.view) };
  }

  if (route.view === "lifeAreas") {
    return { context: { type: "categories" }, label: titleForView(route.view) };
  }

  if (route.view === "timeline" || route.view === "planningCanvas") {
    return { context: { type: "initiatives" }, label: titleForView(route.view) };
  }

  if (route.view === "initiative" && route.initiativeId) {
    const initiativeContextType = initiativeDetail ? initiativeDetail.initiative.type : "initiative";
    return {
      context: { type: initiativeContextType, initiativeId: route.initiativeId },
      label: initiativeDetail?.initiative.name ?? `Initiative ${route.initiativeId}`
    };
  }

  if (route.view === "task" && route.taskId) {
    return {
      context: { type: "task", taskId: route.taskId },
      label: taskDetail?.task.title ?? `Task ${route.taskId}`
    };
  }

  return null;
}

function conversationContextKey(context: ConversationContext | null): string {
  if (!context) {
    return "none";
  }

  switch (context.type) {
    case "global":
    case "categories":
    case "ideas":
    case "projects":
    case "habits":
    case "tasks":
    case "initiatives":
      return context.type;
    case "category":
      return `category:${context.categoryId}`;
    case "idea":
    case "project":
    case "habit":
    case "initiative":
      return `${context.type}:${context.initiativeId}`;
    case "task":
      return `task:${context.taskId}`;
  }
}

async function loadPersistedChatMessages(conversationId?: number | null): Promise<ChatMessage[]> {
  const messages = await fetchChatMessages(conversationId);
  return messages.map(chatMessageFromPersisted);
}

function chatMessageFromPersisted(message: PersistedChatMessage): ChatMessage {
  return {
    id: String(message.id),
    role: message.role,
    text: message.content,
    source: message.source === "app_voice_message" ? "voice" : message.source === "app_text" ? "text" : undefined
  };
}

function attachActivitiesToLastAssistant(messages: ChatMessage[], activities: ChatActivity[]): ChatMessage[] {
  if (activities.length === 0) {
    return messages;
  }

  let lastAssistantIndex = -1;
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    if (messages[index]?.role === "assistant") {
      lastAssistantIndex = index;
      break;
    }
  }
  if (lastAssistantIndex === -1) {
    return messages;
  }

  return messages.map((message, index) => (index === lastAssistantIndex ? { ...message, activities } : message));
}

function moveIdToDropPosition(ids: number[], draggedId: number, targetId: number, placeAfter: boolean): number[] {
  if (draggedId === targetId) {
    return ids;
  }

  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) {
    return ids;
  }

  const insertIndex = placeAfter ? targetIndex + 1 : targetIndex;
  return [...withoutDragged.slice(0, insertIndex), draggedId, ...withoutDragged.slice(insertIndex)];
}

function dropAfter(event: DragEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function preferredAudioMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => routeFromPath(`${window.location.pathname}${window.location.search}`));
  const [overview, setOverview] = useState<AppOverview | null>(null);
  const [lifeAreaInitiatives, setLifeAreaInitiatives] = useState<Initiative[] | null>(null);
  const [initiativeDetail, setInitiativeDetail] = useState<InitiativeDetail | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [calendarControls, setCalendarControls] = useState<CalendarControlsState>(() => calendarControlsFromPath(`${window.location.pathname}${window.location.search}`));
  const [promptTemplates, setPromptTemplates] = useState<PromptTemplateDefinition[]>([]);
  const [promptLogs, setPromptLogs] = useState<AppPromptLog[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
  const [openClawStatus, setOpenClawStatus] = useState<OpenClawStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiceState, setVoiceState] = useState<VoiceState>("idle");
  const [voiceRoom, setVoiceRoom] = useState<Room | null>(null);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceRoomName, setVoiceRoomName] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: "welcome",
      role: "assistant",
      text: "Schreib oder diktiere mir, was du sortieren, merken oder als Kandidat erfassen möchtest."
    }
  ]);
  const [chatDraft, setChatDraft] = useState("");
  const [chatBusy, setChatBusy] = useState(false);
  const [chatActivities, setChatActivities] = useState<ChatActivity[]>([]);
  const [chatTurnStartedAt, setChatTurnStartedAt] = useState<number | null>(null);
  const [activeActivityConversationId, setActiveActivityConversationId] = useState<number | null>(null);
  const [chatVoicePhase, setChatVoicePhase] = useState<ChatVoicePhase>("idle");
  const [chatVoiceLevel, setChatVoiceLevel] = useState(0);
  const [agentDrawer, setAgentDrawer] = useState<ContextualAgentState>({
    open: false,
    context: null,
    label: "Global Chat",
    conversationId: null,
    conversations: []
  });
  const [agentDrawerWidth, setAgentDrawerWidth] = useState(() => {
    const stored = window.localStorage.getItem("dmax.agentDrawerWidth");
    const parsed = stored ? Number(stored) : 560;
    return Number.isFinite(parsed) ? Math.min(Math.max(parsed, 420), 820) : 560;
  });
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => window.localStorage.getItem("dmax.sidebarCollapsed") === "true");
  const chatAudioMeterRef = useRef<AudioMeterHandle | null>(null);
  const chatMediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chatVoiceChunksRef = useRef<BlobPart[]>([]);
  const chatMediaStreamRef = useRef<MediaStream | null>(null);
  const audioMeterRef = useRef<AudioMeterHandle | null>(null);
  const remoteAudioElementsRef = useRef<HTMLAudioElement[]>([]);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const chatAbortControllerRef = useRef<AbortController | null>(null);
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const view = route.view;
  const hasUserCategories = Boolean(overview?.categories.some((category) => !category.isSystem));
  const isEmptyState = Boolean(overview && !hasUserCategories && overview.initiatives.length === 0 && overview.tasks.length === 0);
  const routeConversationContext = useMemo(() => getRouteConversationContext(route, overview, initiativeDetail, taskDetail), [route, overview, initiativeDetail, taskDetail]);
  const calendarHeaderRange = useMemo(
    () => calendarVisibleRange(calendarControls.anchorDate, calendarControls.mode),
    [calendarControls.anchorDate, calendarControls.mode]
  );
  const calendarHeaderDays = useMemo(() => daysInRange(calendarHeaderRange.start, calendarHeaderRange.end), [calendarHeaderRange]);
  const agentTarget = useMemo<{ context: ConversationContext; label: string }>(
    () => routeConversationContext ?? { context: { type: "global" }, label: "Global Chat" },
    [routeConversationContext]
  );
  const agentTargetKey = conversationContextKey(agentTarget.context);

  useEffect(() => {
    let active = true;

    async function loadOpenClawStatus() {
      try {
        const status = await fetchOpenClawStatus();
        if (active) {
          setOpenClawStatus(status);
        }
      } catch (err) {
        if (active) {
          setOpenClawStatus({
            state: "unavailable",
            detail: err instanceof Error ? err.message : "OpenClaw status request failed.",
            checkedAt: new Date().toISOString()
          });
        }
      }
    }

    void loadOpenClawStatus();
    const interval = window.setInterval(() => void loadOpenClawStatus(), 15_000);
    return () => {
      active = false;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    void prewarmOpenClaw(agentTarget.context).catch(() => undefined);
  }, [agentTargetKey]);

  useEffect(() => {
    if (!agentDrawer.open || chatBusy) {
      return;
    }

    const currentKey = conversationContextKey(agentDrawer.context);
    if (currentKey === agentTargetKey) {
      if (agentDrawer.label !== agentTarget.label) {
        setAgentDrawer((current) => ({ ...current, label: agentTarget.label }));
      }
      return;
    }

    void openContextualAgent(agentTarget.context, agentTarget.label);
  }, [
    agentDrawer.context,
    agentDrawer.label,
    agentDrawer.open,
    agentTarget,
    agentTargetKey,
    chatBusy,
  ]);

  function navigate(path: string) {
    const nextPath = path === "/calendar" ? calendarPathForControls(calendarControls) : path;
    window.history.pushState(null, "", nextPath);
    setRoute(routeFromPath(nextPath));
    if (routeFromPath(nextPath).view === "calendar") {
      setCalendarControls(calendarControlsFromPath(nextPath));
    }
  }

  function updateCalendarControls(updater: CalendarControlsState | ((current: CalendarControlsState) => CalendarControlsState)) {
    setCalendarControls((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const nextPath = calendarPathForControls(next);
      window.history.pushState(null, "", nextPath);
      setRoute(routeFromPath(nextPath));
      return next;
    });
  }

  function toggleSidebar() {
    setSidebarCollapsed((current) => {
      const next = !current;
      window.localStorage.setItem("dmax.sidebarCollapsed", String(next));
      return next;
    });
  }

  async function submitChatMessage(text: string, source: "text" | "voice" = "text") {
    const message = text.trim();
    if (!message || chatBusy) {
      return;
    }

    const optimisticMessage: ChatMessage = {
      id: `pending-${crypto.randomUUID()}`,
      role: "user",
      text: message,
      source
    };
    const streamingAssistantId = `streaming-${crypto.randomUUID()}`;

    setChatDraft("");
    setChatBusy(true);
    setChatTurnStartedAt(Date.now());
    setChatActivities([]);
    setChatMessages((current) => [...current, optimisticMessage, { id: streamingAssistantId, role: "assistant", text: "" }]);

    try {
      const abortController = new AbortController();
      chatAbortControllerRef.current = abortController;
      const activeContext = agentDrawer.open ? agentDrawer.context : null;
      const activeConversationId = agentDrawer.open ? agentDrawer.conversationId : null;
      if (!activeContext) {
        throw new Error("Kein aktiver d-max Kontext geöffnet.");
      }
      setActiveActivityConversationId(activeConversationId ?? null);
      const result = await streamChatMessage(
        {
          message,
          conversationId: activeConversationId,
          context: activeContext,
          source: source === "voice" ? "app_voice_message" : "app_text"
        },
        {
          onConversation: (payload) => {
            setActiveActivityConversationId(payload.conversationId);
            if (agentDrawer.open) {
              setAgentDrawer((current) => ({ ...current, conversationId: payload.conversationId }));
            }
          },
          onActivity: setChatActivities,
          onAnswerDelta: (delta) => {
            setChatMessages((current) =>
              current.map((chatMessage) =>
                chatMessage.id === streamingAssistantId ? { ...chatMessage, text: `${chatMessage.text}${delta}` } : chatMessage
              )
            );
          }
        },
        { signal: abortController.signal }
      );
      const nextMessages = await loadPersistedChatMessages(result.conversationId);
      const messagesWithActivities = attachActivitiesToLastAssistant(nextMessages, result.activities ?? []);
      if (agentDrawer.open) {
        const conversations = activeContext ? await fetchChatConversations(activeContext).catch(() => agentDrawer.conversations) : agentDrawer.conversations;
        setAgentDrawer((current) => ({ ...current, conversationId: result.conversationId, conversations }));
        setChatMessages(messagesWithActivities);
      }
      await refresh();
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        setChatMessages((current) => current.filter((message) => message.id !== streamingAssistantId));
        return;
      }
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? err.message : "Chat request failed."
        }
      ]);
    } finally {
      chatAbortControllerRef.current = null;
      setChatBusy(false);
      setChatTurnStartedAt(null);
      setActiveActivityConversationId(null);
      setChatActivities([]);
    }
  }

  function abortChatTurn() {
    chatAbortControllerRef.current?.abort();
    setChatMessages((current) => [
      ...current.filter((message) => !(message.role === "assistant" && message.id.startsWith("streaming-") && !message.text.trim())),
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text: "Turn abgebrochen."
      }
    ]);
  }

  async function openContextualAgent(context: ConversationContext, label: string) {
    const preferredConversationId =
      conversationContextKey(agentDrawer.context) === conversationContextKey(context) ? agentDrawer.conversationId : null;
    await loadContextualAgent(context, label, preferredConversationId);
  }

  function toggleContextualAgent(context: ConversationContext, label: string) {
    if (agentDrawer.open && conversationContextKey(agentDrawer.context) === conversationContextKey(context)) {
      closeContextualAgent();
      return;
    }

    void openContextualAgent(context, label);
  }

  async function loadContextualAgent(context: ConversationContext, label: string, preferredConversationId?: number | null) {
    try {
      setError(null);
      setActiveActivityConversationId(null);
      setChatActivities([]);
      const conversations = await fetchChatConversations(context);
      const selectedConversationId =
        conversations.find((conversation) => conversation.id === preferredConversationId)?.id ?? conversations[0]?.id ?? null;
      const messages = selectedConversationId ? await loadPersistedChatMessages(selectedConversationId) : [];
      setAgentDrawer({
        open: true,
        context,
        label,
        conversationId: selectedConversationId,
        conversations
      });
      setChatMessages(messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load contextual chat.");
    }
  }

  async function selectContextualConversation(conversationId: number) {
    try {
      const messages = await loadPersistedChatMessages(conversationId);
      setAgentDrawer((current) => ({ ...current, conversationId }));
      setChatMessages(messages);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load chat session.");
    }
  }

  async function startNewContextualConversation() {
    if (!agentDrawer.context) {
      return;
    }
    try {
      const conversation = await createChatConversation(agentDrawer.context);
      const conversations = await fetchChatConversations(agentDrawer.context);
      setAgentDrawer((current) => ({
        ...current,
        conversationId: conversation.id,
        conversations
      }));
      setChatMessages([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create chat session.");
    }
  }

  function closeContextualAgent() {
    setAgentDrawer((current) => ({ ...current, open: false }));
    setChatMessages([]);
  }

  async function startChatVoiceMessage() {
    if (!window.MediaRecorder) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Voice Message wird in diesem Browser noch nicht unterstützt."
        }
      ]);
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? `Mikrofon nicht verfügbar: ${err.message}` : "Mikrofon nicht verfügbar."
        }
      ]);
      return;
    }

    chatMediaRecorderRef.current?.stop();
    chatMediaStreamRef.current = stream;
    chatVoiceChunksRef.current = [];
    setChatVoiceLevel(0);
    setChatVoicePhase("recording");
    startAudioMeter(stream, chatAudioMeterRef, setChatVoiceLevel);

    const mimeType = preferredAudioMimeType();
    const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
    chatMediaRecorderRef.current = recorder;
    recorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        chatVoiceChunksRef.current.push(event.data);
      }
    };
    recorder.onerror = () => {
      setChatMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: "Voice Message Fehler: Aufnahme konnte nicht gespeichert werden." }
      ]);
    };
    recorder.start(250);
  }

  async function confirmChatVoiceMessage() {
    setChatVoicePhase("transcribing");
    stopAudioMeter(chatAudioMeterRef);
    setChatVoiceLevel(0);

    try {
      const audio = await stopChatVoiceRecording();
      stopChatMediaStream();
      const transcript = (await transcribeVoiceMessage(audio)).trim();
      if (transcript) {
        setChatDraft(transcript);
      } else {
        setChatMessages((current) => [
          ...current,
          { id: crypto.randomUUID(), role: "assistant", text: "Ich habe keine verwertbare Voice Message erkannt." }
        ]);
      }
    } catch (err) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? `Voice Message Fehler: ${err.message}` : "Voice Message Fehler: Transkription fehlgeschlagen."
        }
      ]);
    } finally {
      stopChatMediaStream();
      chatVoiceChunksRef.current = [];
      setChatVoicePhase("idle");
    }
  }

  function discardChatVoiceMessage() {
    if (chatMediaRecorderRef.current?.state === "recording") {
      chatMediaRecorderRef.current.stop();
    }
    chatMediaRecorderRef.current = null;
    stopAudioMeter(chatAudioMeterRef);
    setChatVoiceLevel(0);
    stopChatMediaStream();
    chatVoiceChunksRef.current = [];
    setChatVoicePhase("idle");
  }

  function stopChatVoiceRecording(): Promise<Blob> {
    const recorder = chatMediaRecorderRef.current;
    if (!recorder) {
      return Promise.reject(new Error("Keine aktive Aufnahme gefunden."));
    }

    return new Promise((resolve, reject) => {
      const mimeType = recorder.mimeType || "audio/webm";
      const finish = () => {
        chatMediaRecorderRef.current = null;
        const audio = new Blob(chatVoiceChunksRef.current, { type: mimeType });
        if (audio.size === 0) {
          reject(new Error("Die Aufnahme war leer."));
          return;
        }
        resolve(audio);
      };

      recorder.onstop = finish;
      recorder.onerror = () => reject(new Error("Aufnahme konnte nicht abgeschlossen werden."));
      if (recorder.state === "inactive") {
        finish();
      } else {
        recorder.stop();
      }
    });
  }

  function stopChatMediaStream() {
    chatMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    chatMediaStreamRef.current = null;
  }

  async function refresh() {
    try {
      setError(null);
      const data = await fetchOverview();
      setOverview(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load d-max state.");
    }
  }

  async function refreshVisibleState(_event?: StateEvent) {
    await refresh();

    if (route.view === "lifeAreas" || route.view === "lifeArea") {
      await fetchInitiatives()
        .then(setLifeAreaInitiatives)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load initiatives."));
    }

    if (route.view === "initiative" && route.initiativeId) {
      await fetchInitiativeDetail(route.initiativeId)
        .then(setInitiativeDetail)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load initiative."));
    }

    if (route.view === "task" && route.taskId) {
      await fetchTaskDetail(route.taskId)
        .then(setTaskDetail)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load task."));
    }

  }

  async function loadPrompts() {
    try {
      const prompts = await fetchPromptLogs();
      setPromptLogs(prompts);
      setSelectedPromptId((current) => (current && prompts.some((prompt) => prompt.id === current) ? current : prompts.at(-1)?.id ?? null));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompt logs.");
    }
  }

  async function loadPromptTemplates() {
    try {
      setPromptTemplates(await fetchPromptTemplates());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load prompt templates.");
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  useEffect(() => {
    let debounce: number | null = null;
    const unsubscribe = subscribeStateEvents({
      onStateChange: (event) => {
        if (debounce) {
          window.clearTimeout(debounce);
        }
        debounce = window.setTimeout(() => {
          void refreshVisibleState(event);
        }, 120);
      }
    });

    return () => {
      if (debounce) {
        window.clearTimeout(debounce);
      }
      unsubscribe();
    };
  }, [route]);

  useEffect(() => {
    const onPopState = () => {
      const path = `${window.location.pathname}${window.location.search}`;
      const nextRoute = routeFromPath(path);
      setRoute(nextRoute);
      if (nextRoute.view === "calendar") {
        setCalendarControls(calendarControlsFromPath(path));
      }
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (route.view !== "calendar") return;
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const nextPath = calendarPathForControls(calendarControls);
    if (currentPath !== nextPath) {
      window.history.replaceState(null, "", nextPath);
    }
  }, [route.view, calendarControls]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
    }, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (route.view !== "initiative" || !route.initiativeId) {
      setInitiativeDetail(null);
      return;
    }

    fetchInitiativeDetail(route.initiativeId)
      .then(setInitiativeDetail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load initiative."));
  }, [route]);

  useEffect(() => {
    if (route.view !== "lifeAreas" && route.view !== "lifeArea") {
      setLifeAreaInitiatives(null);
      return;
    }

    fetchInitiatives()
      .then(setLifeAreaInitiatives)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load initiatives."));
  }, [route]);

  useEffect(() => {
    if (route.view !== "task" || !route.taskId) {
      setTaskDetail(null);
      return;
    }

    fetchTaskDetail(route.taskId)
      .then(setTaskDetail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load task."));
  }, [route]);

  useEffect(() => {
    chatThreadRef.current?.scrollTo({ top: chatThreadRef.current.scrollHeight, behavior: "smooth" });
  }, [chatMessages, chatBusy, chatActivities]);

  useEffect(() => {
    if (!chatBusy || !activeActivityConversationId) {
      return;
    }

    let cancelled = false;
    const loadActivity = () => {
      fetchChatActivity(activeActivityConversationId)
        .then((activities) => {
          if (!cancelled) {
            setChatActivities(activities);
          }
        })
        .catch(() => undefined);
    };
    loadActivity();
    const interval = window.setInterval(loadActivity, 1000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [chatBusy, activeActivityConversationId]);

  useEffect(() => {
    if (view !== "prompts") {
      return;
    }

    void loadPrompts();
  }, [view]);

  useEffect(() => {
    if (view !== "promptTemplates") {
      return;
    }

    void loadPromptTemplates();
  }, [view]);

  function renderContentHeader() {
    if (view === "lifeArea") {
      const category = overview?.categories.find((candidate) => candidate.name.toLowerCase() === route.categoryName?.toLowerCase()) ?? null;
      const initiatives = category ? (lifeAreaInitiatives ?? overview?.initiatives ?? []).filter((initiative) => initiative.categoryId === category.id) : [];
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button className="small-button back-button" onClick={() => navigate("/categories")}>
                Zurueck zu Lebensbereiche
              </button>
            </div>
          </div>
          <div className="section-heading">
            <div className="initiative-title-line">
              {category ? <span className="life-area-emoji large" aria-hidden="true">{category.emoji}</span> : null}
              <h1>{category?.name ?? "Lebensbereich"}</h1>
              {category?.isSystem ? <span className="system-badge">System</span> : null}
            </div>
            <p>
              {category?.description
                ? firstMarkdownLine(category.description)
                : `${initiatives.length} ${propsCountLabel(initiatives.length, "Initiative", "Initiatives")}`}
            </p>
          </div>
        </div>
      );
    }

    if (view === "initiative") {
      const initiative = initiativeDetail?.initiative ?? null;
      const category = initiative ? overview?.categories.find((candidate) => candidate.id === initiative.categoryId) : null;
      const backLabel = titleForView(collectionViewForInitiativeType(initiative?.type ?? "project"));
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button className="small-button back-button" onClick={() => navigate(`/${collectionViewForInitiativeType(initiative?.type ?? "project")}`)}>
                Zurueck zu {backLabel}
              </button>
              {category && initiative ? (
                <button className="small-button back-button" onClick={() => navigate(pathForCollectionCategory(collectionViewForInitiativeType(initiative.type), category.name))}>
                  Zurueck zu {category.name}
                </button>
              ) : null}
            </div>
          </div>
          <InitiativeDetailHeader
            initiative={initiative}
            projectCalendarBinding={initiativeDetail?.projectCalendarBinding ?? null}
            onUpdateInitiative={async (initiativeId, input) => {
              await updateInitiative(initiativeId, input);
              await refresh();
              setInitiativeDetail(await fetchInitiativeDetail(initiativeId));
            }}
            onCalendarBindingChange={async () => {
              await refresh();
              if (initiative) {
                setInitiativeDetail(await fetchInitiativeDetail(initiative.id));
              }
            }}
          />
        </div>
      );
    }

    if (view === "task") {
      const task = taskDetail?.task ?? null;
      const initiative = taskDetail?.initiative ?? null;
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button className="small-button back-button" onClick={() => navigate("/tasks")}>
                Zurück zu Maßnahmen
              </button>
              {initiative ? (
                <button className="small-button back-button truncate" onClick={() => navigate(`/initiatives/${initiative.id}`)} title={initiative.name}>
                  Zurück zu {initiative.name}
                </button>
              ) : null}
            </div>
          </div>
          <TaskDetailHeader
            task={task}
            onUpdateTask={async (taskId, input) => {
              await updateTask(taskId, input);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
          />
        </div>
      );
    }

    return (
      <header className="topbar">
        <div>
          {isCollectionView(view) && route.categoryName ? (
            <button className="topbar-title-link" onClick={() => navigate(`/${view}`)}>
              {titleForView(view)}
            </button>
          ) : (
            <h1>{titleForView(view)}</h1>
          )}
          {subtitleForView(view) ? <p>{subtitleForView(view)}</p> : null}
        </div>
        {view === "calendar" ? (
          <CalendarHeaderControls
            mode={calendarControls.mode}
            anchorDate={calendarControls.anchorDate}
            days={calendarHeaderDays}
            onModeChange={(mode) => updateCalendarControls((current) => ({ ...current, mode }))}
            onToday={() => updateCalendarControls((current) => ({ ...current, anchorDate: dateOnlyLocal(new Date()) }))}
            onShift={(days) => updateCalendarControls((current) => ({ ...current, anchorDate: shiftDate(current.anchorDate, days) }))}
          />
        ) : null}
      </header>
    );
  }

  return (
    <div
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${agentDrawer.open ? "with-agent-drawer" : ""}`}
      ref={appShellRef}
      style={{ "--agent-drawer-width": `${agentDrawerWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <div className="sidebar-main">
          <div className="sidebar-header">
            <button className="brand brand-link" onClick={() => navigate("/projects")} title="Zur Startseite">
              <div className="brand-mark">D</div>
              <div className="brand-copy">
                <div className="brand-name">MAX</div>
              </div>
            </button>
            <button
              type="button"
              className="sidebar-toggle"
              aria-label={sidebarCollapsed ? "Navigation ausklappen" : "Navigation einklappen"}
              title={sidebarCollapsed ? "Navigation ausklappen" : "Navigation einklappen"}
              aria-expanded={!sidebarCollapsed}
              onClick={toggleSidebar}
            >
              {sidebarCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
            </button>
          </div>

          <nav className="nav primary-nav">
            {primaryNavItems.map((item) => renderNavItem(item, view, initiativeDetail, navigate))}
          </nav>
        </div>

        <nav className="nav secondary-nav">
          {secondaryNavItems.map((item) => renderNavItem(item, view, initiativeDetail, navigate))}
        </nav>
      </aside>

      <main className="main">
        <div className="content-sticky-header">
          <div className="content-header-main">{renderContentHeader()}</div>
          <DmaxAgentButton
            status={openClawStatus}
            active={agentDrawer.open && conversationContextKey(agentDrawer.context) === agentTargetKey}
            onClick={() => toggleContextualAgent(agentTarget.context, agentTarget.label)}
          />
        </div>

        <div className="content-scroll-area">
          {error ? <div className="error-banner">{error}</div> : null}

          {isEmptyState && view !== "lifeAreas" ? (
          <OnboardingView
            onCreateCategory={async (name) => {
              await createCategory({ name });
              await refresh();
            }}
            onNavigate={navigate}
          />
          ) : null}

          {!isEmptyState && view === "drive" && (
          <DriveView
            voiceState={voiceState}
            voiceError={voiceError}
            voiceRoomName={voiceRoomName}
            onStart={async () => {
              try {
                setVoiceError(null);
                setVoiceState("connecting");
                const session = await createVoiceSession({ mode: "drive" });
                const room = new Room({
                  adaptiveStream: true,
                  dynacast: true
                });
                room.on(RoomEvent.Disconnected, () => {
                  detachAllRemoteAudio(remoteAudioElementsRef);
                  stopAudioMeter(audioMeterRef);
                  setAudioLevel(0);
                  setVoiceState("idle");
                  setVoiceRoom(null);
                  setVoiceRoomName(null);
                });
                room.on(RoomEvent.TrackSubscribed, (track) => {
                  attachRemoteAudio(track, remoteAudioElementsRef, setVoiceError);
                });
                room.on(RoomEvent.TrackUnsubscribed, (track) => {
                  detachRemoteAudio(track, remoteAudioElementsRef);
                });
                await room.connect(session.livekitUrl, session.token);
                await room.startAudio();
                await room.localParticipant.setMicrophoneEnabled(true);
                const micPublication = room.localParticipant.getTrackPublication(Track.Source.Microphone);
                const micTrack = micPublication?.audioTrack?.mediaStreamTrack;
                if (micTrack) {
                  startAudioMeter(new MediaStream([micTrack]), audioMeterRef, setAudioLevel);
                }
                setVoiceRoom(room);
                setVoiceRoomName(session.roomName);
                setVoiceState("listening");
              } catch (err) {
                stopAudioMeter(audioMeterRef);
                setAudioLevel(0);
                setVoiceState("idle");
                setVoiceError(err instanceof Error ? err.message : "Failed to start LiveKit session.");
              }
            }}
            onEnd={async () => {
              await voiceRoom?.disconnect();
              detachAllRemoteAudio(remoteAudioElementsRef);
              stopAudioMeter(audioMeterRef);
              setAudioLevel(0);
              setVoiceRoom(null);
              setVoiceRoomName(null);
              setVoiceState("idle");
            }}
            audioLevel={audioLevel}
          />
          )}
          {view === "lifeAreas" && (
            overview ? (
            <LifeAreasView
              categories={overview.categories}
              initiatives={lifeAreaInitiatives ?? overview.initiatives}
              onOpenLifeArea={(categoryName) => navigate(pathForLifeArea(categoryName))}
              onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
              onReorderInitiatives={async (categoryId, initiativeIds) => {
                await reorderInitiatives(categoryId, initiativeIds);
                await refresh();
                setLifeAreaInitiatives(await fetchInitiatives());
              }}
              onCreateInitiative={async (input) => {
                try {
                  setError(null);
                  await createInitiative(input);
                  await refresh();
                  setLifeAreaInitiatives(await fetchInitiatives());
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Eintrag konnte nicht angelegt werden.");
                  throw err;
                }
              }}
            />
            ) : <EmptyState title="Lebensbereiche werden geladen" />
          )}
          {view === "lifeArea" && (
          <LifeAreaDetailView
            category={overview?.categories.find((category) => category.name.toLowerCase() === route.categoryName?.toLowerCase()) ?? null}
            initiatives={lifeAreaInitiatives ?? overview?.initiatives ?? []}
            onBack={() => navigate("/categories")}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onCreateInitiative={async (input) => {
              try {
                setError(null);
                await createInitiative(input);
                await refresh();
                setLifeAreaInitiatives(await fetchInitiatives());
              } catch (err) {
                setError(err instanceof Error ? err.message : "Eintrag konnte nicht angelegt werden.");
                throw err;
              }
            }}
            onUpdateCategory={async (categoryId, input) => {
              await updateCategory(categoryId, input);
              await refresh();
            }}
          />
          )}
          {!isEmptyState && view === "timeline" && (
          <TimelineView
            categories={overview?.categories ?? []}
            initiatives={overview?.initiatives ?? []}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
          />
          )}
          {!isEmptyState && view === "planningCanvas" && (
          <PlanningCanvasView
            categories={overview?.categories ?? []}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onAfterChange={refresh}
          />
          )}
          {!isEmptyState && view === "calendar" && (
          <Suspense fallback={<EmptyState title="Kalender wird geladen" />}>
            <CalendarRoute
              categories={overview?.categories ?? []}
              initiatives={overview?.initiatives ?? []}
              tasks={overview?.tasks ?? []}
              controls={calendarControls}
              onShowAllDayChange={() => updateCalendarControls((current) => ({ ...current, showAllDay: !current.showAllDay }))}
              onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
              onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
              onAfterChange={refresh}
            />
          </Suspense>
          )}
          {!isEmptyState && isCollectionView(view) && (
          <InitiativesView
            categories={overview?.categories ?? []}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            initiativeType={initiativeTypeForCollectionView(view)}
            singularLabel={singularLabelForCollectionView(view)}
            pluralLabel={titleForView(view)}
            categoryFilterName={route.categoryName}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onOpenCategory={(categoryName) => navigate(pathForCollectionCategory(view, categoryName))}
            onReorderCategories={async (categoryIds) => {
              await reorderCategories(categoryIds);
              await refresh();
            }}
            onReorderInitiatives={async (categoryId, initiativeIds) => {
              await reorderInitiatives(categoryId, initiativeIds);
              await refresh();
            }}
            onCreateInitiative={async (input) => {
              try {
                setError(null);
                const initiative = await createInitiative(input);
                await refresh();
                navigate(`/initiatives/${initiative.id}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Eintrag konnte nicht angelegt werden.");
                throw err;
              }
            }}
          />
          )}
          {!isEmptyState && view === "initiative" && (
          <InitiativeDetailView
            detail={initiativeDetail}
            allInitiatives={overview?.initiatives ?? []}
            categories={overview?.categories ?? []}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onToggleTaskStatus={async (task) => {
              await updateTaskStatus(task.id, task.status === "done" ? "open" : "done");
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onDeleteTask={async (task) => {
              await deleteTask(task.id);
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onReorderTasks={async (initiativeId, taskIds) => {
              await reorderTasks(initiativeId, taskIds);
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onCreateTask={async (initiativeId, title) => {
              await createTask({ initiativeId, title });
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onCreateInitiative={async (input) => {
              try {
                setError(null);
                const initiative = await createInitiative(input);
                await refresh();
                if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
                return initiative;
              } catch (err) {
                setError(err instanceof Error ? err.message : "Eintrag konnte nicht angelegt werden.");
                throw err;
              }
            }}
            onUpdateInitiative={async (initiativeId, input) => {
              await updateInitiative(initiativeId, input);
              await refresh();
              setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId ?? initiativeId));
            }}
            onCreateRelation={async (predecessorInitiativeId, successorInitiativeId) => {
              try {
                await createInitiativeRelation({ predecessorInitiativeId, successorInitiativeId });
                await refresh();
                if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
              } catch (err) {
                setError(err instanceof Error ? err.message : "Beziehung konnte nicht angelegt werden.");
                throw err;
              }
            }}
            onDeleteRelation={async (relationId) => {
              await deleteInitiativeRelation(relationId);
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onUploadMedia={async (initiativeId, file) => {
              await uploadMediaAttachment("initiative", initiativeId, file);
              await refresh();
              setInitiativeDetail(await fetchInitiativeDetail(initiativeId));
            }}
            onUpdateMedia={async (linkId, input) => {
              await updateMediaAttachment(linkId, input);
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onDeleteMedia={async (linkId) => {
              await deleteMediaAttachment(linkId);
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onReorderMedia={async (initiativeId, linkIds) => {
              await reorderMediaAttachments("initiative", initiativeId, linkIds);
              await refresh();
              setInitiativeDetail(await fetchInitiativeDetail(initiativeId));
            }}
          />
          )}
          {!isEmptyState && view === "task" && (
          <TaskDetailView
            detail={taskDetail}
            onBack={() => navigate("/tasks")}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onUpdateTask={async (taskId, input) => {
              await updateTask(taskId, input);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onCreateChecklistItem={async (taskId, name) => {
              await createTaskChecklistItem(taskId, { name });
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onUpdateChecklistItem={async (taskId, itemId, input) => {
              await updateTaskChecklistItem(taskId, itemId, input);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onDeleteChecklistItem={async (taskId, itemId) => {
              await deleteTaskChecklistItem(taskId, itemId);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onReorderChecklistItems={async (taskId, itemIds) => {
              await reorderTaskChecklistItems(taskId, itemIds);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onUploadMedia={async (taskId, file) => {
              await uploadMediaAttachment("task", taskId, file);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onUpdateMedia={async (linkId, input) => {
              await updateMediaAttachment(linkId, input);
              await refresh();
              if (route.taskId) setTaskDetail(await fetchTaskDetail(route.taskId));
            }}
            onDeleteMedia={async (linkId) => {
              await deleteMediaAttachment(linkId);
              await refresh();
              if (route.taskId) setTaskDetail(await fetchTaskDetail(route.taskId));
            }}
            onReorderMedia={async (taskId, linkIds) => {
              await reorderMediaAttachments("task", taskId, linkIds);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
          />
          )}
          {!isEmptyState && view === "tasks" && (
          <TasksView
            tasks={overview?.tasks ?? []}
            initiatives={overview?.initiatives ?? []}
            onToggleTaskStatus={async (task) => {
              await updateTaskStatus(task.id, task.status === "done" ? "open" : "done");
              await refresh();
            }}
            onDeleteTask={async (task) => {
              await deleteTask(task.id);
              await refresh();
            }}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
          />
          )}
          {view === "promptTemplates" && (
          <PromptTemplatesView
            templates={promptTemplates}
            onRefresh={() => void loadPromptTemplates()}
          />
          )}
          {view === "config" && (
          <ConfigView />
          )}
          {view === "prompts" && (
          <PromptInspectorView
            prompts={promptLogs}
            selectedPromptId={selectedPromptId}
            onSelectPrompt={setSelectedPromptId}
            onRefresh={() => void loadPrompts()}
          />
          )}
        </div>
      </main>
      {agentDrawer.open ? (
        <ResizeHandle
          appShellRef={appShellRef}
          width={agentDrawerWidth}
          setWidth={setAgentDrawerWidth}
        />
      ) : null}
      {agentDrawer.open ? (
        <AgentDrawer
          label={agentDrawer.label}
          conversations={agentDrawer.conversations}
          conversationId={agentDrawer.conversationId}
          messages={chatMessages}
          draft={chatDraft}
          setDraft={setChatDraft}
          busy={chatBusy}
          turnStartedAt={chatTurnStartedAt}
          activities={chatActivities}
          voicePhase={chatVoicePhase}
          voiceLevel={chatVoiceLevel}
          onSubmit={(text) => void submitChatMessage(text)}
          onStartVoiceMessage={() => void startChatVoiceMessage()}
          onConfirmVoiceMessage={() => void confirmChatVoiceMessage()}
          onDiscardVoiceMessage={discardChatVoiceMessage}
          onAbortTurn={abortChatTurn}
          onSelectConversation={(conversationId) => void selectContextualConversation(conversationId)}
          onNewChat={() => void startNewContextualConversation()}
          onClose={closeContextualAgent}
          threadRef={chatThreadRef}
        />
      ) : null}
    </div>
  );
}

function attachRemoteAudio(
  track: RemoteTrack,
  remoteAudioElementsRef: MutableRefObject<HTMLAudioElement[]>,
  setVoiceError: (error: string | null) => void
) {
  if (track.kind !== Track.Kind.Audio) {
    return;
  }

  const element = track.attach() as HTMLAudioElement;
  element.autoplay = true;
  element.setAttribute("playsinline", "true");
  element.style.display = "none";
  document.body.appendChild(element);
  remoteAudioElementsRef.current.push(element);

  element.play().catch((error: unknown) => {
    setVoiceError(error instanceof Error ? `Audio playback blocked: ${error.message}` : "Audio playback blocked.");
  });
}

function detachRemoteAudio(track: RemoteTrack, remoteAudioElementsRef: MutableRefObject<HTMLAudioElement[]>) {
  for (const element of track.detach()) {
    element.remove();
    remoteAudioElementsRef.current = remoteAudioElementsRef.current.filter((candidate) => candidate !== element);
  }
}

function detachAllRemoteAudio(remoteAudioElementsRef: MutableRefObject<HTMLAudioElement[]>) {
  for (const element of remoteAudioElementsRef.current) {
    element.remove();
  }
  remoteAudioElementsRef.current = [];
}

function renderNavItem(
  item: NavItem,
  view: View,
  initiativeDetail: InitiativeDetail | null,
  navigate: (path: string) => void
) {
  const Icon = item.icon;
  const active =
    view === item.id
    || (view === "lifeArea" && item.id === "lifeAreas")
    || (view === "initiative" && initiativeDetail?.initiative.type && collectionViewForInitiativeType(initiativeDetail.initiative.type) === item.id)
    || (view === "task" && item.id === "tasks");

  return (
    <a
      key={item.id}
      href={item.path}
      className={`nav-item ${active ? "active" : ""}`}
      title={item.label}
      aria-current={active ? "page" : undefined}
      onClick={(event) => {
        if (isModifiedNavigationClick(event)) {
          return;
        }
        event.preventDefault();
        navigate(item.path);
      }}
    >
      <Icon size={18} />
      <span>{item.label}</span>
    </a>
  );
}

function isModifiedNavigationClick(event: ReactMouseEvent<HTMLAnchorElement>): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

function DmaxAgentButton(props: { status: OpenClawStatus | null; active: boolean; onClick: () => void }) {
  const state = props.status?.state ?? "starting";
  const statusText = state === "ready" ? null : state === "starting" ? "Starting..." : "Offline";
  const tooltip = {
    ready: "Dein OpenClaw-Agent ist bereit.",
    starting: "Dein OpenClaw-Agent startet gerade. Bitte kurz warten.",
    unavailable: "Dein OpenClaw-Agent reagiert nicht."
  }[state];
  const ariaLabel = statusText ? `DMAX ${statusText}` : "DMAX bereit";

  return (
    <button
      type="button"
      className={`dmax-agent-button ${state} ${props.active ? "active" : ""}`}
      title={tooltip}
      aria-label={ariaLabel}
      onClick={props.onClick}
    >
      <span className="dmax-agent-status-dot" aria-hidden="true" />
      <span className="dmax-agent-label">DMAX</span>
      {statusText ? <span className="dmax-agent-status-text">{statusText}</span> : null}
    </button>
  );
}

function DriveView(props: {
  voiceState: VoiceState;
  voiceError: string | null;
  voiceRoomName: string | null;
  audioLevel: number;
  onStart: () => Promise<void>;
  onEnd: () => Promise<void>;
}) {
  const stateLabel = {
    idle: "Ready",
    listening: "Listening",
    connecting: "Connecting",
    speaking: "Speaking"
  }[props.voiceState];

  return (
    <section className="drive-layout">
      <div className={`voice-orb ${props.voiceState}`}>
        <SoundWave level={props.audioLevel} active={props.voiceState === "listening"} />
        <strong>{stateLabel}</strong>
        <span>{props.voiceRoomName ? "LiveKit connected" : "No active session"}</span>
      </div>

      <div className="drive-controls">
        <button className="primary-action" onClick={() => void (props.voiceState === "idle" ? props.onStart() : props.onEnd())}>
          {props.voiceState === "listening" ? <Pause size={20} /> : <Play size={20} />}
          {props.voiceState === "idle" ? "Start Drive Mode" : "Stop Drive Mode"}
        </button>
        <button className="secondary-action" onClick={() => void props.onEnd()}>
          <Square size={18} />
          End Session
        </button>
      </div>

      <div className="drive-context">
        <div className="open-loop">
          <span>LiveKit</span>
          <p>{props.voiceRoomName ? `Connected to ${props.voiceRoomName}` : "No active WebRTC room."}</p>
        </div>
        {props.voiceError ? <div className="error-banner">{props.voiceError}</div> : null}
      </div>
    </section>
  );
}

function ChatView(props: {
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  turnStartedAt: number | null;
  activities: ChatActivity[];
  voicePhase: ChatVoicePhase;
  voiceLevel: number;
  onSubmit: (text: string) => void;
  onStartVoiceMessage: () => void;
  onConfirmVoiceMessage: () => void;
  onDiscardVoiceMessage: () => void;
  onAbortTurn: () => void;
  threadRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isVoiceActive = props.voicePhase !== "idle";
  const visibleMessages = props.messages.filter((message) => message.text.trim() || message.activities?.length || message.source);
  const latestMessage = props.messages.at(-1);
  const hasCurrentAssistantText = Boolean(latestMessage?.role === "assistant" && latestMessage.text.trim());

  useEffect(() => {
    if (!props.busy || !props.turnStartedAt) {
      setElapsedSeconds(0);
      return;
    }

    const updateElapsed = () => setElapsedSeconds(Math.max(0, Math.floor((Date.now() - props.turnStartedAt!) / 1000)));
    updateElapsed();
    const interval = window.setInterval(updateElapsed, 1000);
    return () => window.clearInterval(interval);
  }, [props.busy, props.turnStartedAt]);

  return (
    <section className="chat-layout">
      <div className="chat-thread" ref={props.threadRef}>
        {visibleMessages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role}`}>
            <RichText text={message.text} />
            {message.activities?.length ? <ActivityTrail activities={message.activities} /> : null}
            {message.source ? <span>{message.source === "voice" ? "voice message" : "text"}</span> : null}
          </article>
        ))}
        {props.busy && !hasCurrentAssistantText ? (
          <article className="chat-message assistant pending">
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
            <div className="pending-turn-status">
              <p>DMAX denkt... <span>{formatElapsedSeconds(elapsedSeconds)}</span></p>
              <button type="button" className="pending-abort-button" onClick={props.onAbortTurn} title="Turn abbrechen" aria-label="Turn abbrechen">
                <Square size={12} />
              </button>
            </div>
            {props.activities.length ? <ActivityTrail activities={props.activities} /> : null}
          </article>
        ) : null}
      </div>

      <form
        className={`chat-composer ${isVoiceActive ? "voice-active" : ""}`}
        onSubmit={(event) => {
          event.preventDefault();
          props.onSubmit(props.draft);
        }}
      >
        {!isVoiceActive ? (
          <textarea
            value={props.draft}
            onChange={(event) => props.setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                props.onSubmit(props.draft);
              }
            }}
            rows={3}
            placeholder="Nachricht an d-max"
          />
        ) : null}
        {props.voicePhase === "recording" ? (
          <div className="voice-message-recorder">
            <VoiceMessageWaveform level={props.voiceLevel} active />
            <div className="voice-message-controls">
              <button type="button" className="icon-button danger" onClick={props.onDiscardVoiceMessage} title="Aufnahme verwerfen">
                <X size={18} />
              </button>
              <button type="button" className="icon-button confirm" onClick={props.onConfirmVoiceMessage} title="Aufnahme bestätigen">
                <CheckCircle2 size={18} />
              </button>
            </div>
          </div>
        ) : null}
        {props.voicePhase === "transcribing" ? (
          <div className="voice-message-recorder transcribing">
            <VoiceProcessingIndicator />
          </div>
        ) : null}
        {!isVoiceActive ? (
          <div className="chat-actions">
            <button type="button" className="secondary-action compact" onClick={props.onStartVoiceMessage} disabled={props.busy}>
              <Mic2 size={18} />
              Voice Message
            </button>
            <button type="submit" className="primary-action compact" disabled={props.busy || !props.draft.trim()}>
              <Send size={18} />
              {props.busy ? "Sending" : "Send"}
            </button>
          </div>
        ) : null}
      </form>
    </section>
  );
}

function AgentDrawer(props: {
  label: string;
  conversations: AppConversation[];
  conversationId: number | null;
  messages: ChatMessage[];
  draft: string;
  setDraft: (value: string) => void;
  busy: boolean;
  turnStartedAt: number | null;
  activities: ChatActivity[];
  voicePhase: ChatVoicePhase;
  voiceLevel: number;
  onSubmit: (text: string) => void;
  onStartVoiceMessage: () => void;
  onConfirmVoiceMessage: () => void;
  onDiscardVoiceMessage: () => void;
  onAbortTurn: () => void;
  onSelectConversation: (conversationId: number) => void;
  onNewChat: () => void;
  onClose: () => void;
  threadRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const [showOldChats, setShowOldChats] = useState(false);

  return (
    <aside className="agent-drawer" aria-label="Contextual d-max chat">
      <div className="agent-drawer-header">
        <button className="small-button" onClick={() => setShowOldChats((current) => !current)} disabled={props.conversations.length === 0}>
          Alte Chats
          {props.conversations.length > 0 ? ` (${props.conversations.length})` : ""}
        </button>
        <div className="agent-drawer-actions">
          <button
            className="small-button"
            onClick={() => {
              setShowOldChats(false);
              props.onNewChat();
            }}
            disabled={props.busy}
            title="Neuen Chat in diesem Kontext starten"
          >
            Neuer Chat
          </button>
          <button className="icon-button" onClick={props.onClose} title="Close">
            <X size={18} />
          </button>
        </div>
      </div>
      {showOldChats ? (
        <div className="agent-old-chats">
          {props.conversations.length === 0 ? <span>Keine alten Chats</span> : null}
          {props.conversations.map((conversation) => (
            <button
              key={conversation.id}
              className={conversation.id === props.conversationId ? "active" : ""}
              onClick={() => {
                props.onSelectConversation(conversation.id);
                setShowOldChats(false);
              }}
              disabled={props.busy}
            >
              <strong>{conversation.title?.trim() || "Neuer Chat"}</strong>
              <span>{formatConversationTimestamp(conversation)}</span>
            </button>
          ))}
        </div>
      ) : null}
      <ChatView
        messages={props.messages}
        draft={props.draft}
        setDraft={props.setDraft}
        busy={props.busy}
        turnStartedAt={props.turnStartedAt}
        activities={props.activities}
        voicePhase={props.voicePhase}
        voiceLevel={props.voiceLevel}
        onSubmit={props.onSubmit}
        onStartVoiceMessage={props.onStartVoiceMessage}
        onConfirmVoiceMessage={props.onConfirmVoiceMessage}
        onDiscardVoiceMessage={props.onDiscardVoiceMessage}
        onAbortTurn={props.onAbortTurn}
        threadRef={props.threadRef}
      />
    </aside>
  );
}

function formatConversationTimestamp(conversation: AppConversation): string {
  const updated = new Date(conversation.updatedAt);
  return Number.isNaN(updated.getTime())
    ? conversation.updatedAt
    : updated.toLocaleString("de-DE", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
}

function formatElapsedSeconds(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) {
    return `${seconds}s`;
  }
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
}

function ResizeHandle(props: {
  appShellRef: MutableRefObject<HTMLDivElement | null>;
  width: number;
  setWidth: (width: number) => void;
}) {
  return (
    <div
      className="agent-resize-handle"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize chat panel"
      tabIndex={0}
      onPointerDown={(event) => {
        event.preventDefault();
        const shell = props.appShellRef.current;
        const shellRight = shell?.getBoundingClientRect().right ?? window.innerWidth;
        const pointerId = event.pointerId;
        event.currentTarget.setPointerCapture(pointerId);

        const onPointerMove = (moveEvent: PointerEvent) => {
          const nextWidth = Math.min(Math.max(shellRight - moveEvent.clientX, 420), 820);
          props.setWidth(nextWidth);
          window.localStorage.setItem("dmax.agentDrawerWidth", String(Math.round(nextWidth)));
        };
        const onPointerUp = () => {
          window.removeEventListener("pointermove", onPointerMove);
          window.removeEventListener("pointerup", onPointerUp);
        };

        window.addEventListener("pointermove", onPointerMove);
        window.addEventListener("pointerup", onPointerUp);
      }}
      onKeyDown={(event) => {
        if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") {
          return;
        }
        event.preventDefault();
        const delta = event.key === "ArrowLeft" ? 32 : -32;
        const nextWidth = Math.min(Math.max(props.width + delta, 420), 820);
        props.setWidth(nextWidth);
        window.localStorage.setItem("dmax.agentDrawerWidth", String(Math.round(nextWidth)));
      }}
    />
  );
}

function SoundWave({ level, active }: { level: number; active: boolean }) {
  const bars = Array.from({ length: 17 }, (_, index) => {
    const distance = Math.abs(index - 8);
    const centerWeight = 1 - distance / 9;
    const jitter = Math.sin(index * 1.7 + level * 12) * 7;
    const shapedLevel = Math.pow(level, 0.58);
    const base = 9 + centerWeight * 18;
    const boost = active ? shapedLevel * (76 - distance * 4.6) + jitter : 0;
    const height = Math.max(7, Math.min(92, base + boost));
    const opacity = active ? 0.5 + shapedLevel * 0.5 : 0.35;
    return <span key={index} style={{ height: `${height}px`, opacity }} />;
  });

  return (
    <div className={`soundwave ${active ? "active" : ""}`} style={{ "--level": String(level) } as CSSProperties}>
      {bars}
    </div>
  );
}

function VoiceMessageWaveform({ level, active }: { level: number; active: boolean }) {
  const sampleCount = 64;
  const levelRef = useRef(level);
  const tickRef = useRef(0);
  const [samples, setSamples] = useState(() => Array.from({ length: sampleCount }, () => 0));

  useEffect(() => {
    levelRef.current = Math.min(Math.max(level, 0), 1);
  }, [level]);

  useEffect(() => {
    if (!active) {
      setSamples(Array.from({ length: sampleCount }, () => 0));
      return;
    }

    const interval = window.setInterval(() => {
      tickRef.current += 1;
      const currentLevel = levelRef.current;
      const shapedLevel = currentLevel < 0.035 ? 0 : Math.pow(currentLevel, 0.55);
      const texture = 0.48 + 0.52 * Math.abs(Math.sin(tickRef.current * 0.77));
      const contour = 0.82 + 0.18 * Math.sin(tickRef.current * 0.19);
      const nextSample = Math.min(1, shapedLevel * texture * contour);
      setSamples((current) => [...current.slice(1), nextSample]);
    }, 156);

    return () => window.clearInterval(interval);
  }, [active]);

  const bars = samples.map((sample, index) => {
    const height = 3 + sample * 39;
    const opacity = 0.36 + sample * 0.58;
    return (
      <span
        key={index}
        style={{
          "--bar": String(index),
          "--bar-height": `${Math.max(3, Math.min(42, height))}px`,
          "--bar-opacity": String(opacity)
        } as CSSProperties}
      />
    );
  });

  return (
    <div
      className={`voice-message-waveform ${active ? "active" : ""}`}
      aria-hidden="true"
    >
      <div className="voice-message-waveform-track">{bars}</div>
    </div>
  );
}

function VoiceProcessingIndicator() {
  return (
    <div className="voice-processing-indicator" aria-hidden="true">
      <span />
      <span />
      <span />
    </div>
  );
}

function isCollectionView(view: View): view is CollectionView {
  return view === "ideas" || view === "projects" || view === "habits";
}

function initiativeTypeForCollectionView(view: CollectionView): InitiativeType {
  if (view === "ideas") return "idea";
  if (view === "habits") return "habit";
  return "project";
}

function singularLabelForCollectionView(view: CollectionView): string {
  if (view === "ideas") return "Idee";
  if (view === "habits") return "Gewohnheit";
  return "Projekt";
}

const initiativeTypeOptions: Array<{ value: InitiativeType; label: string }> = [
  { value: "idea", label: "Idee" },
  { value: "project", label: "Projekt" },
  { value: "habit", label: "Gewohnheit" }
];

const initiativeStatusOptions: Array<{ value: Initiative["status"]; label: string }> = [
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausiert" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "archived", label: "Archiviert" }
];

const projectPhaseOptions: Array<{ value: ProjectPhase; label: string }> = [
  { value: "planning", label: "Planning" },
  { value: "doing", label: "Doing" }
];

const taskPriorityOptions: Array<{ value: Task["priority"]; label: string }> = [
  { value: "low", label: "Niedrig" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Hoch" },
  { value: "urgent", label: "Dringend" }
];

function initiativeTypeLabel(type: InitiativeType): string {
  return initiativeTypeOptions.find((option) => option.value === type)?.label ?? "Eintrag";
}

function initiativeStatusLabel(status: Initiative["status"]): string {
  return initiativeStatusOptions.find((option) => option.value === status)?.label ?? status;
}

function pluralLabelForInitiativeType(type: InitiativeType): string {
  if (type === "idea") return "Ideen";
  if (type === "habit") return "Gewohnheiten";
  return "Projekte";
}

function preferredCategoryId(categories: AppOverview["categories"], categoryFilterName: string | null): number {
  const categoryFromRoute = categoryFilterName
    ? categories.find((category) => category.name.toLowerCase() === categoryFilterName.toLowerCase())
    : null;
  return categoryFromRoute?.id ?? categories.find((category) => category.name === "Inbox")?.id ?? categories[0]?.id ?? 0;
}

function defaultInitiativeMarkdown(type: InitiativeType, name: string): string {
  if (type === "idea") {
    return `# Gedanke\n\n${name}\n\n# Offene Fragen\n\n- \n`;
  }

  if (type === "habit") {
    return `# Praxis\n\n${name}\n\n# Rhythmus\n\nNoch offen.\n\n# Reflexion\n\nNoch keine Reflexion.\n`;
  }

  return `# Ziel\n\n${name}\n\n# Kontext\n\nNoch offen.\n\n# Naechste Massnahmen\n\n- \n`;
}

function InitiativeTypeBadge({ type }: { type: InitiativeType }) {
  return <span className={`type-badge ${type}`}>{initiativeTypeLabel(type)}</span>;
}

function InitiativeTypeInitial({ type }: { type: InitiativeType }) {
  const label = initiativeTypeLabel(type);
  return (
    <span className={`type-initial ${type}`} title={label} aria-label={label}>
      {type === "idea" ? "I" : type === "project" ? "P" : "H"}
    </span>
  );
}

function displayInitiativeName(project: Pick<Initiative, "name" | "isSystem">): string {
  return project.isSystem && project.name === "Inbox" ? "Task Inbox" : project.name;
}

function initiativeDescendantIds(initiatives: Initiative[], initiativeId: number): Set<number> {
  const descendants = new Set<number>();
  const childrenByParent = new Map<number, Initiative[]>();
  for (const initiative of initiatives) {
    if (!initiative.parentId) continue;
    const children = childrenByParent.get(initiative.parentId) ?? [];
    children.push(initiative);
    childrenByParent.set(initiative.parentId, children);
  }

  const stack = [...(childrenByParent.get(initiativeId) ?? [])];
  while (stack.length > 0) {
    const child = stack.pop()!;
    if (descendants.has(child.id)) continue;
    descendants.add(child.id);
    stack.push(...(childrenByParent.get(child.id) ?? []));
  }
  return descendants;
}

function initiativeAncestorIds(initiatives: Initiative[], initiativeId: number): Set<number> {
  const byId = new Map(initiatives.map((initiative) => [initiative.id, initiative]));
  const ancestors = new Set<number>();
  let current = byId.get(initiativeId);
  while (current?.parentId && !ancestors.has(current.parentId)) {
    ancestors.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return ancestors;
}

function initiativeCandidateOptionGroups(
  initiatives: Initiative[],
  categories: AppOverview["categories"],
  currentCategoryId: number
): ReactNode[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryIds = [...new Set(initiatives.map((initiative) => initiative.categoryId))].sort((leftId, rightId) => {
    if (leftId === currentCategoryId) return -1;
    if (rightId === currentCategoryId) return 1;
    const leftName = categoryById.get(leftId)?.name ?? "Uncategorized";
    const rightName = categoryById.get(rightId)?.name ?? "Uncategorized";
    return leftName.localeCompare(rightName) || leftId - rightId;
  });

  return categoryIds.map((categoryId) => {
    const category = categoryById.get(categoryId);
    const categoryInitiatives = initiatives
      .filter((initiative) => initiative.categoryId === categoryId && initiative.type !== "habit")
      .sort(compareInitiativeCandidates);
    return (
      <optgroup key={categoryId} label={category?.name ?? "Uncategorized"}>
        {categoryInitiatives.map((initiative) => (
          <option key={initiative.id} value={initiative.id}>
            {initiativeCandidateOptionLabel(initiative)}
          </option>
        ))}
      </optgroup>
    );
  });
}

function compareInitiativeCandidates(left: Initiative, right: Initiative): number {
  const typeRank = { idea: 0, project: 1, habit: 2 };
  return typeRank[left.type] - typeRank[right.type] || displayInitiativeName(left).localeCompare(displayInitiativeName(right)) || left.id - right.id;
}

function initiativeCandidateOptionLabel(initiative: Initiative): string {
  const typeLabel = initiative.type === "idea" ? "Idea" : "Project";
  return `[${typeLabel}] ${displayInitiativeName(initiative)}`;
}

function propsCountLabel(count: number, singularLabel: string, pluralLabel: string): string {
  return count === 1 ? singularLabel : pluralLabel;
}

function LifeAreasView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  onOpenLifeArea: (categoryName: string) => void;
  onOpenInitiative: (initiativeId: number) => void;
  onReorderInitiatives: (categoryId: number, initiativeIds: number[]) => Promise<void>;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const groups = props.categories.map((category) => {
    const initiatives = props.initiatives.filter((project) => project.categoryId === category.id);
    return {
      category,
      initiatives,
      byType: initiativeTypeOptions.map((option) => ({
        ...option,
        categoryId: category.id,
        initiatives: initiatives.filter((initiative) => initiative.type === option.value)
      }))
    };
  });

  return (
    <section className="life-area-view">
      {groups.map((group) => (
        <section className="life-area-section" key={group.category.id}>
          <div className="life-area-heading">
            <div>
              <span className="life-area-emoji" aria-hidden="true">{group.category.emoji}</span>
              <button className="life-area-title-link" onClick={() => props.onOpenLifeArea(group.category.name)}>
                {group.category.name}
              </button>
              {group.category.isSystem ? <span className="system-badge">System</span> : null}
            </div>
            <span>{group.initiatives.length} {propsCountLabel(group.initiatives.length, "Initiative", "Initiatives")}</span>
          </div>
          {group.category.description ? <p className="life-area-description">{firstMarkdownLine(group.category.description)}</p> : null}

          <LifeAreaInitiativeGroups
            groups={group.byType}
            onOpenInitiative={props.onOpenInitiative}
            onReorderInitiatives={props.onReorderInitiatives}
            onCreateInitiative={props.onCreateInitiative}
          />
        </section>
      ))}
      {groups.length === 0 ? <EmptyState title="Noch keine Lebensbereiche" /> : null}
    </section>
  );
}

function LifeAreaDetailView(props: {
  category: AppOverview["categories"][number] | null;
  initiatives: Initiative[];
  onBack: () => void;
  onOpenInitiative: (initiativeId: number) => void;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
  onUpdateCategory: (categoryId: number, input: { name?: string; description?: string | null; color?: string | null }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDescription(props.category?.description ?? "");
    setEditing(false);
  }, [props.category]);

  if (!props.category) {
    return <EmptyState title="Lebensbereich nicht gefunden" />;
  }

  const category = props.category;
  const initiatives = props.initiatives.filter((project) => project.categoryId === category.id);
  const groups = initiativeTypeOptions.map((option) => ({
    ...option,
    categoryId: category.id,
    initiatives: initiatives.filter((initiative) => initiative.type === option.value)
  }));

  return (
    <section className="initiative-detail life-area-detail">
      <section className="panel life-area-description-panel">
        <div className="panel-heading-row">
          <h3>Beschreibung</h3>
          <button className="small-button" onClick={() => setEditing((current) => !current)}>
            {editing ? "Abbrechen" : "Bearbeiten"}
          </button>
        </div>
        {editing ? (
          <form
            className="life-area-description-form"
            onSubmit={async (event) => {
              event.preventDefault();
              if (busy) return;
              setBusy(true);
              try {
                await props.onUpdateCategory(category.id, { description });
                setEditing(false);
              } finally {
                setBusy(false);
              }
            }}
          >
            <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={16} />
            <div className="form-actions">
              <button className="primary-action compact" type="submit" disabled={busy}>
                Speichern
              </button>
            </div>
          </form>
        ) : category.description ? (
          <RichText text={category.description} />
        ) : (
          <EmptyState title="Noch keine Beschreibung" />
        )}
      </section>

      <section className="life-area-detail-initiatives">
        <div className="panel-heading-row">
          <h3>Initiatives</h3>
        </div>
        <LifeAreaInitiativeGroups
          groups={groups}
          onOpenInitiative={props.onOpenInitiative}
          onCreateInitiative={props.onCreateInitiative}
        />
      </section>
    </section>
  );
}

function LifeAreaInitiativeGroups(props: {
  groups: Array<{ value: InitiativeType; label: string; categoryId: number; initiatives: Initiative[] }>;
  onOpenInitiative: (initiativeId: number) => void;
  onReorderInitiatives?: (categoryId: number, initiativeIds: number[]) => Promise<void>;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const [openCreateKey, setOpenCreateKey] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [draggedInitiative, setDraggedInitiative] = useState<{ categoryId: number; type: InitiativeType; initiativeId: number } | null>(null);
  const [initiativeDropId, setInitiativeDropId] = useState<number | null>(null);

  return (
    <div className="life-area-type-grid">
      {props.groups.map((typeGroup) => {
        const createKey = `${typeGroup.categoryId}:${typeGroup.value}`;
        const createOpen = openCreateKey === createKey;
        const creating = creatingKey === createKey;
        const pluralLabel = pluralLabelForInitiativeType(typeGroup.value);
        const canReorder = Boolean(props.onReorderInitiatives) && typeGroup.initiatives.length > 1;
        return (
        <section className="life-area-type-section" key={createKey}>
          <div className="life-area-type-heading">
            <div className="life-area-type-title">
              <span className={`type-heading-label ${typeGroup.value}`}>{pluralLabel}</span>
              <button
                type="button"
                className="icon-button add-inline"
                title={`${typeGroup.label} hinzufügen`}
                aria-label={`${typeGroup.label} hinzufügen`}
                onClick={() => {
                  setOpenCreateKey((current) => current === createKey ? null : createKey);
                  setDraftName("");
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            <span>{typeGroup.initiatives.length}</span>
          </div>
          {createOpen ? (
            <form
              className="life-area-create-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const name = draftName.trim();
                if (!name || creating) {
                  return;
                }
                setCreatingKey(createKey);
                try {
                  await props.onCreateInitiative({
                    categoryId: typeGroup.categoryId,
                    type: typeGroup.value,
                    name,
                    markdown: defaultInitiativeMarkdown(typeGroup.value, name)
                  });
                  setDraftName("");
                  setOpenCreateKey(null);
                } finally {
                  setCreatingKey(null);
                }
              }}
            >
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Name"
                aria-label="Name"
              />
              <button type="submit" className="icon-button confirm" disabled={!draftName.trim() || creating} title="Anlegen" aria-label="Anlegen">
                <Plus size={17} />
              </button>
            </form>
          ) : null}
          {typeGroup.initiatives.length === 0 ? (
            <div className="life-area-empty">Keine {typeGroup.label.toLowerCase()}.</div>
          ) : (
            <div className="life-area-initiative-list">
              {typeGroup.initiatives.map((initiative) => (
                <button
                  className={`life-area-initiative-row ${canReorder ? "draggable-row" : ""} ${draggedInitiative?.initiativeId === initiative.id ? "dragging" : ""} ${initiativeDropId === initiative.id ? "drag-over" : ""}`}
                  key={initiative.id}
                  draggable={canReorder}
                  onClick={() => props.onOpenInitiative(initiative.id)}
                  onDragStart={(event) => {
                    if (!canReorder) return;
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedInitiative({ categoryId: typeGroup.categoryId, type: typeGroup.value, initiativeId: initiative.id });
                  }}
                  onDragOver={(event) => {
                    if (!draggedInitiative || draggedInitiative.categoryId !== typeGroup.categoryId || draggedInitiative.type !== typeGroup.value) return;
                    event.preventDefault();
                    setInitiativeDropId(initiative.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedInitiative || draggedInitiative.categoryId !== typeGroup.categoryId || draggedInitiative.type !== typeGroup.value) return;
                    const initiativeIds = typeGroup.initiatives.map((candidate) => candidate.id);
                    const nextIds = moveIdToDropPosition(initiativeIds, draggedInitiative.initiativeId, initiative.id, dropAfter(event));
                    setDraggedInitiative(null);
                    setInitiativeDropId(null);
                    void props.onReorderInitiatives?.(typeGroup.categoryId, nextIds);
                  }}
                  onDragEnd={() => {
                    setDraggedInitiative(null);
                    setInitiativeDropId(null);
                  }}
                >
                  <span>{displayInitiativeName(initiative)}</span>
                  <small>
                    {initiative.type === "project" && formatInitiativeDateRangeForUi(initiative) ? `${formatInitiativeDateRangeForUi(initiative)} · ` : ""}
                    {initiative.status}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>
      );
      })}
    </div>
  );
}

function InitiativesView({
  categories,
  initiatives,
  tasks,
  initiativeType,
  singularLabel,
  pluralLabel,
  categoryFilterName,
  onOpenInitiative,
  onOpenCategory,
  onReorderCategories,
  onReorderInitiatives,
  onCreateInitiative
}: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  initiativeType: InitiativeType;
  singularLabel: string;
  pluralLabel: string;
  categoryFilterName: string | null;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenCategory: (categoryName: string) => void;
  onReorderCategories: (categoryIds: number[]) => Promise<void>;
  onReorderInitiatives: (categoryId: number, initiativeIds: number[]) => Promise<void>;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [categoryDropId, setCategoryDropId] = useState<number | null>(null);
  const [draggedInitiative, setDraggedProject] = useState<{ categoryId: number; initiativeId: number } | null>(null);
  const [initiativeDropId, setProjectDropId] = useState<number | null>(null);
  const [newInitiativeCategoryId, setNewProjectCategoryId] = useState<number>(() => preferredCategoryId(categories, categoryFilterName));
  const [newInitiativeName, setNewProjectName] = useState("");
  const [newInitiativeStartDate, setNewProjectStartDate] = useState("");
  const [newInitiativeEndDate, setNewProjectEndDate] = useState("");
  const [creatingInitiative, setCreatingProject] = useState(false);
  const [projectRelations, setProjectRelations] = useState<InitiativeRelationWithInitiatives[]>([]);
  const visibleCategories = categoryFilterName
    ? categories.filter((category) => category.name.toLowerCase() === categoryFilterName.toLowerCase())
    : categories;
  const visibleInitiatives = initiatives.filter((project) => project.type === initiativeType);
  const groupedInitiatives = visibleCategories
    .map((category) => ({
      category,
      initiatives: visibleInitiatives.filter((initiative) => initiative.categoryId === category.id)
    }))
    .filter((group) => group.initiatives.length > 0);
  const uncategorizedInitiatives = categoryFilterName ? [] : visibleInitiatives.filter((initiative) => !categories.some((category) => category.id === initiative.categoryId));
  const groups = uncategorizedInitiatives.length > 0
    ? [...groupedInitiatives, { category: { id: 0, name: "Uncategorized", description: null, isSystem: false }, initiatives: uncategorizedInitiatives }]
    : groupedInitiatives;
  const reorderableCategoryIds = groups.map((group) => group.category.id).filter((id) => id > 0);
  const canReorderVisibleInitiatives = initiativeType !== "project";
  const selectedCategoryId = categories.some((category) => category.id === newInitiativeCategoryId)
    ? newInitiativeCategoryId
    : preferredCategoryId(categories, categoryFilterName);
  const hasDateFields = initiativeType === "project";
  const hasInvalidNewProjectDateRange = hasDateFields && initiativeDateRangeInvalid(newInitiativeStartDate, newInitiativeEndDate);

  useEffect(() => {
    const preferred = preferredCategoryId(categories, categoryFilterName);
    if (categoryFilterName || !categories.some((category) => category.id === newInitiativeCategoryId)) {
      setNewProjectCategoryId(preferred);
    }
  }, [categories, categoryFilterName, newInitiativeCategoryId]);

  useEffect(() => {
    if (initiativeType !== "project") {
      setProjectRelations([]);
      return;
    }
    let cancelled = false;
    fetchInitiativeGraph()
      .then((graph) => {
        if (!cancelled) setProjectRelations(graph.relations);
      })
      .catch(() => {
        if (!cancelled) setProjectRelations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initiativeType, initiatives]);

  return (
    <section className="initiative-grid">
      <form
        className={`entry-create ${hasDateFields ? "with-dates" : ""}`}
        onSubmit={async (event) => {
          event.preventDefault();
          const name = newInitiativeName.trim();
          if (!name || !selectedCategoryId || creatingInitiative || hasInvalidNewProjectDateRange) {
            return;
          }
          setCreatingProject(true);
          try {
            await onCreateInitiative({
              categoryId: selectedCategoryId,
              type: initiativeType,
              name,
              markdown: defaultInitiativeMarkdown(initiativeType, name),
              startDate: hasDateFields ? newInitiativeStartDate || null : undefined,
              endDate: hasDateFields ? newInitiativeEndDate || null : undefined
            });
            setNewProjectName("");
            setNewProjectStartDate("");
            setNewProjectEndDate("");
          } finally {
            setCreatingProject(false);
          }
        }}
      >
        <select value={selectedCategoryId || ""} onChange={(event) => setNewProjectCategoryId(Number(event.target.value))} aria-label="Kategorie">
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          value={newInitiativeName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder={`${singularLabel} benennen`}
        />
        {hasDateFields ? (
          <div className="entry-date-fields">
            <label>
              Start
              <input
                type="date"
                value={newInitiativeStartDate}
                onChange={(event) => setNewProjectStartDate(event.target.value)}
                aria-label="Startdatum"
              />
            </label>
            <label>
              Ende
              <input
                type="date"
                value={newInitiativeEndDate}
                min={newInitiativeStartDate || undefined}
                onPointerDown={(event) => primeEmptyDatePickerMonth(event, newInitiativeStartDate, newInitiativeEndDate)}
                onFocus={(event) => primeEmptyDatePickerMonth(event, newInitiativeStartDate, newInitiativeEndDate)}
                onBlur={(event) => restorePrimedEmptyDateInput(event, newInitiativeEndDate)}
                onChange={(event) => setNewProjectEndDate(event.target.value)}
                aria-label="Enddatum"
              />
            </label>
          </div>
        ) : null}
        <button
          className="primary-action compact"
          type="submit"
          disabled={!newInitiativeName.trim() || !selectedCategoryId || creatingInitiative || hasInvalidNewProjectDateRange}
        >
          <Plus size={17} />
          {creatingInitiative ? "Anlegen" : "Anlegen"}
        </button>
      </form>

      {groups.map((group) => (
        <section
          className={`initiative-category ${draggedCategoryId === group.category.id ? "dragging" : ""} ${categoryDropId === group.category.id ? "drag-over" : ""}`}
          key={group.category.id}
          onDragOver={(event) => {
            if (!draggedCategoryId || group.category.id === 0) return;
            event.preventDefault();
            setCategoryDropId(group.category.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!draggedCategoryId || group.category.id === 0) return;
            const nextIds = moveIdToDropPosition(reorderableCategoryIds, draggedCategoryId, group.category.id, dropAfter(event));
            setDraggedCategoryId(null);
            setCategoryDropId(null);
            void onReorderCategories(nextIds);
          }}
        >
          <div className="initiative-category-heading">
            <div>
              {group.category.id === 0 ? (
                <h2>{group.category.name}</h2>
              ) : (
                <button className="category-link" onClick={() => onOpenCategory(group.category.name)}>
                  {group.category.name}
                </button>
              )}
            </div>
            {group.category.id !== 0 && !categoryFilterName && canReorderVisibleInitiatives ? (
              <button
                className="drag-handle"
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedCategoryId(group.category.id);
                }}
                onDragEnd={() => {
                  setDraggedCategoryId(null);
                  setCategoryDropId(null);
                }}
                title="Kategorie ziehen"
              >
                <GripVertical size={17} />
              </button>
            ) : null}
            <span>{group.initiatives.length} {propsCountLabel(group.initiatives.length, singularLabel, pluralLabel)}</span>
          </div>
          {initiativeType === "project" ? (
            <ProjectStructureList
              projects={group.initiatives}
              tasks={tasks}
              relations={projectRelations}
              onOpenInitiative={onOpenInitiative}
            />
          ) : (
            <div className="initiative-category-list">
              {group.initiatives.map((project) => {
                const initiativeTasks = tasks.filter((task) => task.initiativeId === project.id);
                return (
                  <article
                    className={`initiative-row clickable ${canReorderVisibleInitiatives ? "draggable-row" : ""} ${draggedInitiative?.initiativeId === project.id ? "dragging" : ""} ${initiativeDropId === project.id ? "drag-over" : ""}`}
                    key={project.id}
                    draggable={canReorderVisibleInitiatives}
                    onClick={() => onOpenInitiative(project.id)}
                    onDragStart={(event) => {
                      if (!canReorderVisibleInitiatives) return;
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedProject({ categoryId: group.category.id, initiativeId: project.id });
                    }}
                    onDragOver={(event) => {
                      if (!draggedInitiative || draggedInitiative.categoryId !== group.category.id) return;
                      event.preventDefault();
                      setProjectDropId(project.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedInitiative || draggedInitiative.categoryId !== group.category.id) return;
                      const initiativeIds = group.initiatives.map((candidate) => candidate.id);
                      const nextIds = moveIdToDropPosition(initiativeIds, draggedInitiative.initiativeId, project.id, dropAfter(event));
                      setDraggedProject(null);
                      setProjectDropId(null);
                      void onReorderInitiatives(group.category.id, nextIds);
                    }}
                    onDragEnd={() => {
                      setDraggedProject(null);
                      setProjectDropId(null);
                    }}
                  >
                    <div>
                      <div className="initiative-title-line">
                        <h3>{displayInitiativeName(project)}</h3>
                        <InitiativeTypeBadge type={project.type} />
                        {project.isSystem ? <span className="system-badge">System</span> : null}
                      </div>
                      <p>{project.summary ?? firstMarkdownLine(project.markdown)}</p>
                    </div>
                    <div className="row-meta">
                      {project.type === "project" && formatInitiativeDateRangeForUi(project) ? <span>{formatInitiativeDateRangeForUi(project)}</span> : null}
                      <span>{project.status}</span>
                      <span>{initiativeTasks.length} Massnahmen</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ))}
      {groups.length === 0 ? <EmptyState title={`Keine ${pluralLabel.toLowerCase()} in dieser Ansicht`} /> : null}
    </section>
  );
}

function ProjectStructureList(props: {
  projects: Initiative[];
  tasks: Task[];
  relations: InitiativeRelationWithInitiatives[];
  onOpenInitiative: (initiativeId: number) => void;
}) {
  const projectIds = new Set(props.projects.map((project) => project.id));
  const childrenByParent = new Map<number, Initiative[]>();
  for (const project of props.projects) {
    if (!project.parentId || !projectIds.has(project.parentId)) continue;
    const children = childrenByParent.get(project.parentId) ?? [];
    children.push(project);
    childrenByParent.set(project.parentId, sortInitiativesForDisplay(children));
  }
  const roots = sortInitiativesForDisplay(props.projects.filter((project) => !project.parentId || !projectIds.has(project.parentId)));
  const relations = props.relations.filter((relation) => projectIds.has(relation.predecessorInitiativeId) && projectIds.has(relation.successorInitiativeId));

  const renderProject = (project: Initiative, depth: number): ReactNode => {
    const children = childrenByParent.get(project.id) ?? [];
    return (
      <div className="project-structure-node" key={project.id}>
        <ProjectStructureCard
          project={project}
          tasks={props.tasks.filter((task) => task.initiativeId === project.id)}
          onOpenInitiative={props.onOpenInitiative}
        />
        {children.length > 0 ? (
          <div className="project-children" style={{ marginLeft: Math.min(depth + 1, 4) * 18 }}>
            {renderRows(children, depth + 1)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderRows = (projects: Initiative[], depth: number): ReactNode => (
    <div className="project-structure-rows">
      {buildProjectRelationRows(projects, relations).map((row, index) => (
        <div className="project-relation-row" key={`${depth}-${index}-${row.map((project) => project.id).join("-")}`}>
          {row.map((project) => renderProject(project, depth))}
        </div>
      ))}
    </div>
  );

  return <div className="project-structure-list">{renderRows(roots, 0)}</div>;
}

function ProjectStructureCard(props: {
  project: Initiative;
  tasks: Task[];
  onOpenInitiative: (initiativeId: number) => void;
}) {
  return (
    <article className="initiative-row clickable project-structure-card" onClick={() => props.onOpenInitiative(props.project.id)}>
      <div>
        <div className="initiative-title-line">
          <h3>{displayInitiativeName(props.project)}</h3>
          <InitiativeTypeBadge type={props.project.type} />
          {props.project.isSystem ? <span className="system-badge">System</span> : null}
        </div>
        <p>{props.project.summary ?? firstMarkdownLine(props.project.markdown)}</p>
      </div>
      <div className="row-meta">
        {formatInitiativeDateRangeForUi(props.project) ? <span>{formatInitiativeDateRangeForUi(props.project)}</span> : null}
        <span>{props.project.status}</span>
        <span>{props.tasks.length} Massnahmen</span>
      </div>
    </article>
  );
}

function buildProjectRelationRows(projects: Initiative[], relations: InitiativeRelationWithInitiatives[]): Initiative[][] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectIds = new Set(projectById.keys());
  const successorsByProject = new Map<number, number[]>();
  const predecessors = new Set<number>();
  for (const relation of relations) {
    if (!projectIds.has(relation.predecessorInitiativeId) || !projectIds.has(relation.successorInitiativeId)) continue;
    const successors = successorsByProject.get(relation.predecessorInitiativeId) ?? [];
    successors.push(relation.successorInitiativeId);
    successorsByProject.set(relation.predecessorInitiativeId, successors);
    predecessors.add(relation.successorInitiativeId);
  }
  for (const [projectId, successors] of successorsByProject) {
    successorsByProject.set(projectId, sortInitiativesForDisplay(successors.map((id) => projectById.get(id)).filter(isInitiative)).map((project) => project.id));
  }

  const visited = new Set<number>();
  const starts = sortInitiativesForDisplay(projects.filter((project) => !predecessors.has(project.id)));
  const orderedStarts = [...starts, ...sortInitiativesForDisplay(projects.filter((project) => predecessors.has(project.id)))];
  const rows: Initiative[][] = [];

  for (const start of orderedStarts) {
    if (visited.has(start.id)) continue;
    const row: Initiative[] = [];
    let current: Initiative | undefined = start;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      row.push(current);
      const nextId: number | undefined = (successorsByProject.get(current.id) ?? []).find((id) => !visited.has(id));
      current = nextId ? projectById.get(nextId) : undefined;
    }
    if (row.length > 0) rows.push(row);
  }

  return rows;
}

function sortInitiativesForDisplay(initiatives: Initiative[]): Initiative[] {
  return [...initiatives].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id - right.id);
}

function isInitiative(value: Initiative | undefined): value is Initiative {
  return value !== undefined;
}

const timelineMonthOptions = [3, 6, 12, 18];

type CalendarMode = "day" | "week";
type CalendarControlsState = {
  mode: CalendarMode;
  anchorDate: string;
  showAllDay: boolean;
};

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

function ConfigView() {
  const initialGoogleAccountFromUrl = new URLSearchParams(window.location.search).get("account");
  const initialGoogleAccount = initialGoogleAccountFromUrl || "dw@b42.io";
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [accounts, setAccounts] = useState<GoogleCalendarAccountStatus[]>([]);
  const [globalStatus, setGlobalStatus] = useState<GoogleCalendarAuthStatus | null>(null);
  const [accountCalendars, setAccountCalendars] = useState<Record<string, { loading: boolean; calendars: GoogleCalendarListItem[]; error: string | null }>>({});
  const [newAccountLabel, setNewAccountLabel] = useState(initialGoogleAccount);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [manualSourceDraft, setManualSourceDraft] = useState({ calendarId: "", displayName: "", color: "#27806f" });
  const [error, setError] = useState<string | null>(null);
  const activeSources = sources.filter((source) => source.enabled);
  const knownAccountLabels = useMemo(() => {
    const labels = new Set(accounts.map((account) => account.accountLabel));
    for (const source of sources) {
      labels.add(source.accountLabel);
    }
    if (newAccountLabel.trim()) {
      labels.add(newAccountLabel.trim());
    }
    return [...labels].sort((left, right) => left.localeCompare(right));
  }, [accounts, newAccountLabel, sources]);

  async function loadConfig() {
    const [nextSources, nextAccounts, nextGlobalStatus] = await Promise.all([
      fetchCalendarSources(),
      fetchGoogleCalendarAccounts(),
      fetchGoogleCalendarAuthStatus()
    ]);
    setSources(nextSources);
    setAccounts(nextAccounts);
    setGlobalStatus(nextGlobalStatus);
    await Promise.all(nextAccounts.filter((account) => account.status.connected).map((account) => loadAccountCalendars(account.accountLabel)));
  }

  async function loadAccountCalendars(accountLabel: string) {
    setAccountCalendars((current) => ({
      ...current,
      [accountLabel]: { loading: true, calendars: current[accountLabel]?.calendars ?? [], error: null }
    }));
    try {
      const calendars = await fetchGoogleCalendars(accountLabel);
      setAccountCalendars((current) => ({
        ...current,
        [accountLabel]: { loading: false, calendars, error: null }
      }));
    } catch (err) {
      setAccountCalendars((current) => ({
        ...current,
        [accountLabel]: {
          loading: false,
          calendars: current[accountLabel]?.calendars ?? [],
          error: err instanceof Error ? err.message : "Google Kalender konnten nicht geladen werden."
        }
      }));
    }
  }

  async function connectAccount(accountLabel: string) {
    try {
      setError(null);
      const authUrl = await createGoogleCalendarAuthUrl({ loginHint: accountLabel.trim() });
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google OAuth konnte nicht gestartet werden.");
    }
  }

  async function toggleCalendarSource(accountLabel: string, calendar: GoogleCalendarListItem, enabled: boolean) {
    const existing = sources.find((source) => source.provider === "google" && source.accountLabel === accountLabel && source.calendarId === calendar.id);
    if (existing) {
      await updateCalendarSource(existing.id, {
        enabled,
        displayName: calendar.summary,
        color: normalizeGoogleColor(calendar.backgroundColor),
        readOnly: calendar.readOnly
      });
    } else if (enabled) {
      const reusableSource = sources.find((source) => source.provider === "google" && source.calendarId === calendar.id && !source.enabled);
      const sourceInput = {
        accountLabel,
        calendarId: calendar.id,
        displayName: calendar.summary,
        color: normalizeGoogleColor(calendar.backgroundColor),
        enabled: true,
        readOnly: calendar.readOnly
      };
      if (reusableSource) {
        await updateCalendarSource(reusableSource.id, sourceInput);
      } else {
        await createCalendarSource(sourceInput);
      }
    }
    await loadConfig();
  }

  useEffect(() => {
    loadConfig().catch((err: unknown) => setError(err instanceof Error ? err.message : "Calendar sources konnten nicht geladen werden."));
  }, []);

  return (
    <section className="config-layout">
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="config-section">
        <div className="config-section-header">
          <div>
            <h2>Google Kalenderquellen</h2>
            <p>Verbinde Google-Konten und waehle pro Konto aus, welche Kalender DMAX lesen und schreiben darf.</p>
          </div>
        </div>
        {globalStatus && !globalStatus.configured ? (
          <div className="config-hint">
            Setze `GOOGLE_OAUTH_CLIENT_ID` und `GOOGLE_OAUTH_CLIENT_SECRET`. Authorized redirect URI in Google:
            <code>{globalStatus.redirectUri}</code>
          </div>
        ) : null}

        <div className="google-connect-action">
          <button className="primary-action compact" type="button" disabled={!globalStatus?.configured} onClick={() => setAddAccountOpen(true)}>
            <Clock size={16} />
            Google-Konto hinzufuegen
          </button>
        </div>

        {addAccountOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setAddAccountOpen(false)}>
            <form
              className="compact-modal"
              onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
              onSubmit={(event) => {
                event.preventDefault();
                if (newAccountLabel.trim()) {
                  void connectAccount(newAccountLabel);
                }
              }}
            >
              <h3>Google-Konto hinzufuegen</h3>
              <label className="config-field">
                <span>Google-Konto</span>
                <input
                  list="google-account-options"
                  value={newAccountLabel}
                  onChange={(event) => setNewAccountLabel(event.target.value)}
                  placeholder="name@gmail.com"
                  autoFocus
                />
                <datalist id="google-account-options">
                  {knownAccountLabels.map((accountLabel) => <option key={accountLabel} value={accountLabel} />)}
                </datalist>
              </label>
              <div className="modal-actions">
                <button className="secondary-action compact" type="button" onClick={() => setAddAccountOpen(false)}>Abbrechen</button>
                <button className="primary-action compact" type="submit" disabled={!globalStatus?.configured || !newAccountLabel.trim()}>
                  <Clock size={16} />
                  OAuth starten
                </button>
              </div>
            </form>
          </div>
        ) : null}

        <section className="config-subsection">
          <div className="config-subsection-title">
            <strong>Verbundene Google-Konten</strong>
            <span>{accounts.length} Konten</span>
          </div>
          {accounts.length === 0 ? <EmptyState title="Noch kein Google-Konto verbunden" /> : null}
          <div className="google-account-card-list">
            {accounts.map((account) => {
              const calendarsState = accountCalendars[account.accountLabel] ?? { loading: false, calendars: [], error: null };
              const accountSources = sources.filter((source) => source.accountLabel === account.accountLabel);
              return (
                <article className="google-account-card" key={account.accountLabel}>
                  <header className="google-account-card-header">
                    <div>
                      <strong>
                        {account.accountLabel}{" "}
                        <span className={`google-account-heading-status ${account.status.connected ? "connected" : "disconnected"}`}>
                          ({account.status.connected ? "verbunden" : "getrennt"})
                        </span>
                      </strong>
                      <span>{accountSources.filter((source) => source.enabled).length} aktive Kalenderquellen</span>
                    </div>
                    <div className="google-auth-actions">
                      {account.status.connected ? (
                        <>
                          <button className="secondary-action compact" type="button" onClick={() => void loadAccountCalendars(account.accountLabel)}>
                            Kalender neu laden
                          </button>
                          <button
                            className="secondary-action compact"
                            type="button"
                            onClick={async () => {
                              await disconnectGoogleCalendar(account.accountLabel);
                              await loadConfig();
                            }}
                          >
                            Konto trennen
                          </button>
                        </>
                      ) : (
                        <button className="primary-action compact" type="button" onClick={() => void connectAccount(account.accountLabel)}>
                          Erneut verbinden
                        </button>
                      )}
                    </div>
                  </header>
                  {account.status.connected && !account.status.hasRequiredScope ? (
                    <div className="config-hint warning">
                      Dieses Konto nutzt noch einen alten read-only Token. Trenne es und verbinde es erneut, um Schreibzugriff zu aktivieren.
                    </div>
                  ) : null}
                  {!account.status.connected ? (
                    <div className="config-hint">
                      Dieses Konto ist in DMAX bekannt, aber aktuell nicht per OAuth verbunden. Bestehende Quellen bleiben sichtbar, koennen aber erst nach dem erneuten Verbinden live geladen werden.
                    </div>
                  ) : null}
                  {calendarsState.error ? <div className="error-banner">{calendarsState.error}</div> : null}
                  {account.status.connected ? (
                    <div className="google-calendar-picker">
                      {calendarsState.loading ? <span className="muted-inline">Kalender werden geladen...</span> : null}
                      {!calendarsState.loading && calendarsState.calendars.length === 0 ? <span className="muted-inline">Keine Kalender geladen.</span> : null}
                      {calendarsState.calendars.map((calendar) => {
                        const source = accountSources.find((candidate) => candidate.calendarId === calendar.id) ?? null;
                        const active = Boolean(source?.enabled);
                        return (
                          <article key={calendar.id} className="google-calendar-choice">
                            <span className="calendar-category-dot" style={{ background: calendar.backgroundColor ?? "#5167b8" }} />
                            <div>
                              <strong>{calendar.summary}</strong>
                              <span>{calendar.primary ? "primary · " : ""}{calendar.accessRole ?? "unknown"} · {calendar.id}</span>
                            </div>
                            <button
                              className={active ? "secondary-action compact" : "primary-action compact"}
                              type="button"
                              onClick={() => void toggleCalendarSource(account.accountLabel, calendar, !active)}
                            >
                              {active ? "Aus DMAX entfernen" : "In DMAX hinzufuegen"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="config-subsection">
          <div className="config-subsection-title">
            <strong>DMAX-Kalenderquellen</strong>
            <span>{activeSources.length} aktive Quellen</span>
          </div>
          <div className="config-hint">
            DMAX-Kalenderquellen sind die gespeicherte Auswahl, welche Google-Kalender DMAX im Kalender anzeigen und fuer Sync/Schreiben verwenden soll. Ein verbundenes Google-Konto kann viele Kalender haben; erst eine aktive DMAX-Quelle macht einen Kalender in DMAX sichtbar.
          </div>
        <form
          className="config-source-form"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              setError(null);
              await createCalendarSource({
                accountLabel: newAccountLabel.trim(),
                calendarId: manualSourceDraft.calendarId,
                displayName: manualSourceDraft.displayName || manualSourceDraft.calendarId,
                color: manualSourceDraft.color || null,
                enabled: true,
                readOnly: true
              });
              setManualSourceDraft({ calendarId: "", displayName: "", color: "#27806f" });
              await loadConfig();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Calendar source konnte nicht gespeichert werden.");
            }
          }}
        >
          <div className="config-subsection-title config-source-form-title">
            <strong>Manuelle Quelle</strong>
            <span>{newAccountLabel.trim()}</span>
          </div>
          <input value={manualSourceDraft.calendarId} onChange={(event) => setManualSourceDraft((current) => ({ ...current, calendarId: event.target.value }))} placeholder="Google Calendar ID" />
          <input value={manualSourceDraft.displayName} onChange={(event) => setManualSourceDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="Anzeigename" />
          <input className="color-input" value={manualSourceDraft.color} onChange={(event) => setManualSourceDraft((current) => ({ ...current, color: event.target.value }))} placeholder="#27806f" />
          <button className="primary-action compact" type="submit" disabled={!newAccountLabel.trim() || !manualSourceDraft.calendarId.trim()}>
            <Plus size={16} />
            Quelle
          </button>
        </form>

        <div className="config-source-list">
          {activeSources.length === 0 ? <EmptyState title="Noch keine aktiven Kalenderquellen" /> : null}
          {activeSources.map((source) => (
            <article className="config-source-row" key={source.id}>
              <span className="calendar-category-dot" style={{ background: source.color ?? "#27806f" }} />
              <div>
                <strong>{source.displayName}</strong>
                <span>{source.accountLabel} · {source.calendarId}</span>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={async (event) => {
                    await updateCalendarSource(source.id, { enabled: event.target.checked });
                    await loadConfig();
                  }}
                />
                Aktiv
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!source.readOnly}
                  onChange={async (event) => {
                    await updateCalendarSource(source.id, { readOnly: !event.target.checked });
                    await loadConfig();
                  }}
                />
                Schreiben
              </label>
              <span className="readonly-pill">{source.readOnly ? "read-only" : "write"}</span>
            </article>
          ))}
        </div>
        </section>
      </div>
    </section>
  );
}

function PlanningCanvasView(props: {
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
  const [error, setError] = useState<string | null>(null);

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
  const canvasRange = useMemo(() => planningCanvasRange(view?.canvas.defaultStartDate ?? null, PLANNING_CANVAS_MONTH_COUNT), [view?.canvas.defaultStartDate]);
  const monthLabels = useMemo(() => planningCanvasMonths(canvasRange), [canvasRange]);
  const weekLabels = useMemo(() => planningCanvasWeeks(canvasRange), [canvasRange]);
  const weekendSpans = useMemo(() => planningCanvasWeekends(canvasRange), [canvasRange]);
  const todayX = useMemo(() => planningCanvasDateX(dateOnlyLocal(new Date()), canvasRange), [canvasRange]);
  const timeVisuals = useMemo(() => nodes.map((node) => planningCanvasTimeVisual(node, canvasRange)).filter(isPlanningCanvasTimeVisual), [nodes, canvasRange]);
  const timeVisualByInitiative = useMemo(() => new Map(timeVisuals.map((visual) => [visual.initiativeId, visual])), [timeVisuals]);
  const visibleUnmappedInitiatives = useMemo(
    () => (view?.unmappedInitiatives ?? []).filter(({ initiative }) => initiative.status !== "completed" && initiative.status !== "archived"),
    [view?.unmappedInitiatives]
  );
  const stageWidth = canvasRange.width * canvasZoom;
  const stageHeight = Math.max(980, Math.max(0, ...nodes.map((node) => planningCanvasTimeLaneTop(node.y) + PLANNING_CANVAS_TIME_BAR_HEIGHT + 160)));
  const edges = view?.relationEdges ?? [];
  const relationGroups = useMemo(() => buildPlanningCanvasRelationGroups(nodes, edges), [nodes, edges]);

  useEffect(() => {
    canvasZoomRef.current = canvasZoom;
  }, [canvasZoom]);

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
        y: clampCanvasCoordinate(y),
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

function TimelineView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  onOpenInitiative: (initiativeId: number) => void;
}) {
  const [monthsAhead, setMonthsAhead] = useState(6);
  const today = useMemo(() => startOfUtcDay(new Date()), []);
  const range = useMemo(() => visibleTimelineRange(today, monthsAhead), [today, monthsAhead]);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const monthLabels = useMemo(() => buildTimelineMonths(range.start, range.end), [range]);
  const weekLabels = useMemo(() => buildTimelineWeeks(range.start, range.end), [range]);
  const todayOffset = dateOffsetPercent(today, range.start, totalDays);
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const entries = props.initiatives
    .filter((initiative) => initiative.type === "project" && initiative.status === "active" && initiative.startDate && initiative.endDate)
    .map((initiative) => {
      const category = categoryById.get(initiative.categoryId);
      const start = initiative.startDate ? parseDateOnlyUtc(initiative.startDate) : null;
      const end = initiative.endDate ? parseDateOnlyUtc(initiative.endDate) : null;
      if (!category || !start || !end || end < range.start || start > range.end) {
        return null;
      }

      const clippedStart = start < range.start ? range.start : start;
      const clippedEnd = end > range.end ? range.end : end;
      return {
        initiative,
        category,
        left: dateOffsetPercent(clippedStart, range.start, totalDays),
        width: Math.max(((daysBetween(clippedStart, clippedEnd) + 1) / totalDays) * 100, 0.7)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => {
      const dateCompare = (a.initiative.startDate ?? "").localeCompare(b.initiative.startDate ?? "");
      return dateCompare || a.initiative.sortOrder - b.initiative.sortOrder || a.initiative.name.localeCompare(b.initiative.name);
    });
  const groups = props.categories
    .map((category) => ({
      category,
      entries: entries.filter((entry) => entry.category.id === category.id)
    }))
    .filter((group) => group.entries.length > 0);
  const chartMinWidth = Math.max(980, totalDays * 7);

  return (
    <section className="timeline-panel">
      <div className="timeline-toolbar">
        <div>
          <h2>Projekt-Timeline</h2>
          <p>
            {formatTimelineRange(range.start, range.end)} · aktive Projekte mit Start und Ende
          </p>
        </div>
        <label>
          Zeitraum
          <select value={monthsAhead} onChange={(event) => setMonthsAhead(Number(event.target.value))}>
            {timelineMonthOptions.map((option) => (
              <option key={option} value={option}>
                +{option} Monate
              </option>
            ))}
          </select>
        </label>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Keine aktiven datierten Projekte in diesem Zeitraum" />
      ) : (
        <div className="timeline-scroll">
          <div className="timeline-frame" style={{ minWidth: chartMinWidth }}>
            <div className="timeline-header-row">
              <div className="timeline-corner">Kategorien</div>
              <div className="timeline-axis">
                <div className="timeline-months">
                  {monthLabels.map((month) => (
                    <div
                      className="timeline-month"
                      key={month.key}
                      style={{ left: `${month.left}%`, width: `${month.width}%` }}
                    >
                      {month.label}
                    </div>
                  ))}
                </div>
                <div className="timeline-weeks">
                  {weekLabels.map((week) => (
                    <div className="timeline-week" key={week.key} style={{ left: `${week.left}%` }}>
                      {week.label}
                    </div>
                  ))}
                </div>
                {todayOffset !== null ? (
                  <div className="timeline-today-label" style={{ left: `${todayOffset}%` }}>
                    Heute
                  </div>
                ) : null}
              </div>
            </div>

            <div className="timeline-body">
              {groups.map((group) => (
                <div
                  className="timeline-row"
                  key={group.category.id}
                  style={{ "--timeline-row-height": `${Math.max(78, 28 + group.entries.length * 38)}px` } as CSSProperties}
                >
                  <div className="timeline-row-label">
                    <span className="timeline-category-swatch" style={{ background: group.category.color }} />
                    <span>{group.category.name}</span>
                    <strong>{group.entries.length}</strong>
                  </div>
                  <div className="timeline-chart">
                    <TimelineGrid monthLabels={monthLabels} weekLabels={weekLabels} todayOffset={todayOffset} />
                    {group.entries.map((entry, index) => (
                      <button
                        className="timeline-bar"
                        key={entry.initiative.id}
                        onClick={() => props.onOpenInitiative(entry.initiative.id)}
                        style={
                          {
                            left: `${entry.left}%`,
                            width: `${entry.width}%`,
                            top: `${14 + index * 38}px`,
                            "--category-color": entry.category.color
                          } as CSSProperties
                        }
                        title={`${displayInitiativeName(entry.initiative)} · ${formatInitiativeDateRangeForUi(entry.initiative) ?? ""}`}
                      >
                        <span>{displayInitiativeName(entry.initiative)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TimelineGrid(props: {
  monthLabels: Array<{ key: string; left: number; width: number; label: string }>;
  weekLabels: Array<{ key: string; left: number; label: string }>;
  todayOffset: number | null;
}) {
  return (
    <div className="timeline-grid-lines" aria-hidden="true">
      {props.monthLabels.map((month) => (
        <span className="timeline-month-line" key={month.key} style={{ left: `${month.left}%` }} />
      ))}
      {props.weekLabels.map((week) => (
        <span className="timeline-week-line" key={week.key} style={{ left: `${week.left}%` }} />
      ))}
      {props.todayOffset !== null ? <span className="timeline-today-line" style={{ left: `${props.todayOffset}%` }} /> : null}
    </div>
  );
}

function InitiativeDetailView(props: {
  detail: InitiativeDetail | null;
  allInitiatives: Initiative[];
  categories: AppOverview["categories"];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onToggleTaskStatus: (task: Task) => Promise<void>;
  onDeleteTask: (task: Task) => Promise<void>;
  onReorderTasks?: (initiativeId: number, taskIds: number[]) => Promise<void>;
  onCreateTask: (initiativeId: number, title: string) => Promise<void>;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<Initiative>;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
  onCreateRelation: (predecessorInitiativeId: number, successorInitiativeId: number) => Promise<void>;
  onDeleteRelation: (relationId: number) => Promise<void>;
  onUploadMedia: (initiativeId: number, file: File) => Promise<void>;
  onUpdateMedia: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDeleteMedia: (linkId: number) => Promise<void>;
  onReorderMedia: (initiativeId: number, linkIds: number[]) => Promise<void>;
}) {
  if (!props.detail) {
    return <EmptyState title="Loading initiative..." />;
  }

  const initiativeId = props.detail.initiative.id;
  const initiative = props.detail.initiative;
  return (
    <section className="initiative-detail">
      <InitiativeMarkdownPanel initiative={initiative} onUpdateInitiative={props.onUpdateInitiative} />
      <MediaAttachmentsPanel
        entityType="initiative"
        entityId={initiative.id}
        attachments={props.detail.mediaAttachments ?? []}
        onUpload={props.onUploadMedia}
        onUpdate={props.onUpdateMedia}
        onDelete={props.onDeleteMedia}
        onReorder={props.onReorderMedia}
      />
      <Panel title="Massnahmen">
        {props.detail.tasks.length === 0 ? (
          <EmptyState title="Noch keine Massnahmen" />
        ) : (
          <TasksView
            tasks={props.detail.tasks}
            initiatives={[props.detail.initiative]}
            onToggleTaskStatus={props.onToggleTaskStatus}
            onDeleteTask={props.onDeleteTask}
            onOpenTask={props.onOpenTask}
            showInitiativeName={false}
            groupByCompletionStatus
            onReorderTasks={(taskIds) => void props.onReorderTasks?.(initiativeId, taskIds)}
          />
        )}
        <TaskCreateInlineForm
          onCreateTask={(title) => props.onCreateTask(initiativeId, title)}
        />
      </Panel>
      <InitiativeRelationsPanel
        initiative={initiative}
        allInitiatives={props.allInitiatives}
        categories={props.categories}
        predecessors={props.detail.predecessors ?? []}
        successors={props.detail.successors ?? []}
        onOpenInitiative={props.onOpenInitiative}
        onCreateInitiative={props.onCreateInitiative}
        onUpdateInitiative={props.onUpdateInitiative}
        onCreateRelation={props.onCreateRelation}
        onDeleteRelation={props.onDeleteRelation}
      />
    </section>
  );
}

function InitiativeRelationsPanel(props: {
  initiative: Initiative;
  allInitiatives: Initiative[];
  categories: AppOverview["categories"];
  predecessors: InitiativeRelationWithInitiatives[];
  successors: InitiativeRelationWithInitiatives[];
  onOpenInitiative: (initiativeId: number) => void;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<Initiative>;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
  onCreateRelation: (predecessorInitiativeId: number, successorInitiativeId: number) => Promise<void>;
  onDeleteRelation: (relationId: number) => Promise<void>;
}) {
  const [predecessorDraft, setPredecessorDraft] = useState("");
  const [successorDraft, setSuccessorDraft] = useState("");
  const [parentDraft, setParentDraft] = useState("");
  const [childDraft, setChildDraft] = useState("");
  const [busyRelationId, setBusyRelationId] = useState<number | "predecessor" | "successor" | "parent" | "child" | null>(null);
  const emptyCreateDraft = (): RelationshipCreateDraft => ({
    name: "",
    type: props.initiative.type === "idea" ? "idea" : "project",
    categoryId: String(props.initiative.categoryId || props.categories[0]?.id || "")
  });
  const [createDrafts, setCreateDrafts] = useState<Record<RelationshipCreateSlot, RelationshipCreateDraft>>(() => ({
    parent: emptyCreateDraft(),
    child: emptyCreateDraft(),
    predecessor: emptyCreateDraft(),
    successor: emptyCreateDraft()
  }));
  const predecessorIds = useMemo(() => new Set(props.predecessors.map((relation) => relation.predecessorInitiativeId)), [props.predecessors]);
  const successorIds = useMemo(() => new Set(props.successors.map((relation) => relation.successorInitiativeId)), [props.successors]);
  const childInitiatives = useMemo(
    () => props.allInitiatives.filter((initiative) => initiative.parentId === props.initiative.id),
    [props.allInitiatives, props.initiative.id]
  );
  const parentInitiative = props.initiative.parentId ? props.allInitiatives.find((initiative) => initiative.id === props.initiative.parentId) ?? null : null;
  const descendantIds = useMemo(() => initiativeDescendantIds(props.allInitiatives, props.initiative.id), [props.allInitiatives, props.initiative.id]);
  const ancestorIds = useMemo(() => initiativeAncestorIds(props.allInitiatives, props.initiative.id), [props.allInitiatives, props.initiative.id]);
  const hasRelations = props.predecessors.length > 0 || props.successors.length > 0 || Boolean(parentInitiative) || childInitiatives.length > 0;
  const [expanded, setExpanded] = useState(hasRelations);
  const selectableInitiatives = props.allInitiatives.filter((initiative) => initiative.type !== "habit");
  const predecessorCandidates = selectableInitiatives.filter((initiative) => initiative.id !== props.initiative.id && !predecessorIds.has(initiative.id));
  const successorCandidates = selectableInitiatives.filter((initiative) => initiative.id !== props.initiative.id && !successorIds.has(initiative.id));
  const parentCandidates = selectableInitiatives.filter(
    (initiative) => initiative.id !== props.initiative.id && initiative.id !== props.initiative.parentId && !descendantIds.has(initiative.id)
  );
  const childCandidates = selectableInitiatives.filter((initiative) => initiative.id !== props.initiative.id && initiative.parentId !== props.initiative.id && !ancestorIds.has(initiative.id));

  useEffect(() => {
    setPredecessorDraft("");
    setSuccessorDraft("");
    setParentDraft("");
    setChildDraft("");
    setCreateDrafts({
      parent: emptyCreateDraft(),
      child: emptyCreateDraft(),
      predecessor: emptyCreateDraft(),
      successor: emptyCreateDraft()
    });
    setBusyRelationId(null);
    setExpanded(hasRelations);
  }, [props.initiative.id, props.predecessors, props.successors, hasRelations]);

  const updateCreateDraft = (slot: RelationshipCreateSlot, input: Partial<RelationshipCreateDraft>) => {
    setCreateDrafts((current) => ({ ...current, [slot]: { ...current[slot], ...input } }));
  };
  const resetCreateDraft = (slot: RelationshipCreateSlot) => {
    setCreateDrafts((current) => ({ ...current, [slot]: emptyCreateDraft() }));
  };
  const createRelatedInitiative = async (slot: RelationshipCreateSlot) => {
    if (busyRelationId) return;
    const draft = createDrafts[slot];
    const name = draft.name.trim();
    const categoryId = Number(draft.categoryId);
    if (!name || !categoryId) return;
    setBusyRelationId(slot);
    try {
      const created = await props.onCreateInitiative({
        categoryId,
        parentId: slot === "child" ? props.initiative.id : null,
        type: draft.type,
        projectPhase: draft.type === "project" ? "planning" : undefined,
        name
      });
      if (slot === "parent") {
        await props.onUpdateInitiative(props.initiative.id, { parentId: created.id });
      } else if (slot === "predecessor") {
        await props.onCreateRelation(created.id, props.initiative.id);
      } else if (slot === "successor") {
        await props.onCreateRelation(props.initiative.id, created.id);
      }
      resetCreateDraft(slot);
    } finally {
      setBusyRelationId(null);
    }
  };

  const addPredecessor = async () => {
    const predecessorId = Number(predecessorDraft);
    if (!predecessorId || busyRelationId) return;
    setBusyRelationId("predecessor");
    try {
      await props.onCreateRelation(predecessorId, props.initiative.id);
      setPredecessorDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const addSuccessor = async () => {
    const successorId = Number(successorDraft);
    if (!successorId || busyRelationId) return;
    setBusyRelationId("successor");
    try {
      await props.onCreateRelation(props.initiative.id, successorId);
      setSuccessorDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const removeParent = async () => {
    if (busyRelationId) return;
    setBusyRelationId("parent");
    try {
      await props.onUpdateInitiative(props.initiative.id, { parentId: null });
    } finally {
      setBusyRelationId(null);
    }
  };
  const removeRelation = async (relationId: number) => {
    if (busyRelationId) return;
    setBusyRelationId(relationId);
    try {
      await props.onDeleteRelation(relationId);
    } finally {
      setBusyRelationId(null);
    }
  };
  const setParent = async () => {
    const parentId = Number(parentDraft);
    if (busyRelationId) return;
    if (!parentId) return;
    if (parentId === props.initiative.parentId) {
      setParentDraft("");
      return;
    }
    setBusyRelationId("parent");
    try {
      await props.onUpdateInitiative(props.initiative.id, { parentId });
      setParentDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const addChild = async () => {
    const childId = Number(childDraft);
    if (!childId || busyRelationId) return;
    setBusyRelationId("child");
    try {
      await props.onUpdateInitiative(childId, { parentId: props.initiative.id });
      setChildDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const removeChild = async (childId: number) => {
    if (busyRelationId) return;
    setBusyRelationId(childId);
    try {
      await props.onUpdateInitiative(childId, { parentId: null });
    } finally {
      setBusyRelationId(null);
    }
  };

  return (
    <details
      className="panel initiative-relations-panel"
      open={expanded}
      onToggle={(event) => setExpanded(event.currentTarget.open)}
    >
      <summary>
        <h3>Relations</h3>
        <span>{hasRelations ? "Verknüpft" : "Keine Relations"}</span>
      </summary>
      <div className="initiative-relations-grid">
        <div className="initiative-relation-group">
          <InitiativeParentChildColumn
            title="Parent"
            emptyLabel="None"
            initiatives={parentInitiative ? [parentInitiative] : []}
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onRemove={() => void removeParent()}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void setParent();
            }}
          >
            <select
              value={parentDraft}
              disabled={busyRelationId !== null || parentCandidates.length === 0}
              aria-label="Parent auswählen"
              onChange={(event) => setParentDraft(event.target.value)}
            >
              <option value="">{parentInitiative ? "Change parent" : "Add parent"}</option>
              {initiativeCandidateOptionGroups(parentCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!parentDraft || busyRelationId !== null} title="Parent verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Create parent"
            namePlaceholder="New parent"
            categories={props.categories}
            draft={createDrafts.parent}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("parent", input)}
            onSubmit={() => void createRelatedInitiative("parent")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeParentChildColumn
            title="Children"
            emptyLabel="None"
            initiatives={childInitiatives}
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onRemove={(initiativeId) => void removeChild(initiativeId)}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void addChild();
            }}
          >
            <select
              value={childDraft}
              disabled={busyRelationId !== null || childCandidates.length === 0}
              aria-label="Child auswählen"
              onChange={(event) => setChildDraft(event.target.value)}
            >
              <option value="">Add child</option>
              {initiativeCandidateOptionGroups(childCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!childDraft || busyRelationId !== null} title="Child verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Create child"
            namePlaceholder="New child"
            categories={props.categories}
            draft={createDrafts.child}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("child", input)}
            onSubmit={() => void createRelatedInitiative("child")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeRelationColumn
            title="Predecessors"
            emptyLabel="None"
            relations={props.predecessors}
            direction="predecessor"
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onDeleteRelation={removeRelation}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void addPredecessor();
            }}
          >
            <select
              value={predecessorDraft}
              disabled={busyRelationId !== null || predecessorCandidates.length === 0}
              aria-label="Vorgänger auswählen"
              onChange={(event) => setPredecessorDraft(event.target.value)}
            >
              <option value="">Add predecessor</option>
              {initiativeCandidateOptionGroups(predecessorCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!predecessorDraft || busyRelationId !== null} title="Vorgänger verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Create predecessor"
            namePlaceholder="New predecessor"
            categories={props.categories}
            draft={createDrafts.predecessor}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("predecessor", input)}
            onSubmit={() => void createRelatedInitiative("predecessor")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeRelationColumn
            title="Successors"
            emptyLabel="None"
            relations={props.successors}
            direction="successor"
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onDeleteRelation={removeRelation}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void addSuccessor();
            }}
          >
            <select
              value={successorDraft}
              disabled={busyRelationId !== null || successorCandidates.length === 0}
              aria-label="Nachfolger auswählen"
              onChange={(event) => setSuccessorDraft(event.target.value)}
            >
              <option value="">Add successor</option>
              {initiativeCandidateOptionGroups(successorCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!successorDraft || busyRelationId !== null} title="Nachfolger verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Create successor"
            namePlaceholder="New successor"
            categories={props.categories}
            draft={createDrafts.successor}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("successor", input)}
            onSubmit={() => void createRelatedInitiative("successor")}
          />
        </div>
      </div>
    </details>
  );
}

function InitiativeRelationCreateForm(props: {
  label: string;
  namePlaceholder: string;
  categories: AppOverview["categories"];
  draft: RelationshipCreateDraft;
  disabled: boolean;
  onDraftChange: (input: Partial<RelationshipCreateDraft>) => void;
  onSubmit: () => void;
}) {
  const canSubmit = props.draft.name.trim().length > 0 && Boolean(props.draft.categoryId) && !props.disabled;
  return (
    <form
      className="initiative-relation-create-control"
      aria-label={props.label}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <input
        value={props.draft.name}
        disabled={props.disabled}
        placeholder={props.namePlaceholder}
        aria-label={`${props.label} name`}
        onChange={(event) => props.onDraftChange({ name: event.target.value })}
      />
      <select
        value={props.draft.type}
        disabled={props.disabled}
        aria-label={`${props.label} type`}
        onChange={(event) => props.onDraftChange({ type: event.target.value === "idea" ? "idea" : "project" })}
      >
        <option value="project">Project</option>
        <option value="idea">Idea</option>
      </select>
      <select
        value={props.draft.categoryId}
        disabled={props.disabled || props.categories.length === 0}
        aria-label={`${props.label} category`}
        onChange={(event) => props.onDraftChange({ categoryId: event.target.value })}
      >
        {props.categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <button type="submit" className="icon-button compact" disabled={!canSubmit} title={props.label}>
        <Plus size={15} />
      </button>
    </form>
  );
}

function InitiativeParentChildColumn(props: {
  title: string;
  emptyLabel: string;
  initiatives: Initiative[];
  busyRelationId: number | string | null;
  onOpenInitiative: (initiativeId: number) => void;
  onRemove: (initiativeId: number) => void;
}) {
  return (
    <div className="initiative-relation-column">
      <h4>{props.title}</h4>
      {props.initiatives.length === 0 ? (
        <p>{props.emptyLabel}</p>
      ) : (
        <div className="initiative-relation-list">
          {props.initiatives.map((initiative) => (
            <div className="initiative-relation-row" key={initiative.id}>
              <button type="button" className="initiative-relation-link" onClick={() => props.onOpenInitiative(initiative.id)}>
                <InitiativeTypeInitial type={initiative.type} />
                <span>{displayInitiativeName(initiative)}</span>
                <small>{initiativeStatusLabel(initiative.status)}</small>
              </button>
              <button
                type="button"
                className="icon-button compact"
                disabled={props.busyRelationId !== null}
                onClick={() => props.onRemove(initiative.id)}
                title="Parent/Child-Verknüpfung entfernen"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InitiativeRelationColumn(props: {
  title: string;
  emptyLabel: string;
  relations: InitiativeRelationWithInitiatives[];
  direction: "predecessor" | "successor";
  busyRelationId: number | string | null;
  onOpenInitiative: (initiativeId: number) => void;
  onDeleteRelation: (relationId: number) => Promise<void>;
}) {
  return (
    <div className="initiative-relation-column">
      <h4>{props.title}</h4>
      {props.relations.length === 0 ? (
        <p>{props.emptyLabel}</p>
      ) : (
        <div className="initiative-relation-list">
          {props.relations.map((relation) => {
            const linkedInitiative = props.direction === "predecessor" ? relation.predecessor : relation.successor;
            return (
              <div className="initiative-relation-row" key={relation.id}>
                <button type="button" className="initiative-relation-link" onClick={() => props.onOpenInitiative(linkedInitiative.id)}>
                  <InitiativeTypeInitial type={linkedInitiative.type} />
                  <span>{displayInitiativeName(linkedInitiative)}</span>
                  <small>{initiativeStatusLabel(linkedInitiative.status)}</small>
                </button>
                <button
                  type="button"
                  className="icon-button compact"
                  disabled={props.busyRelationId !== null}
                  onClick={() => void props.onDeleteRelation(relation.id)}
                  title="Verknüpfung entfernen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function InitiativeDetailHeader(props: {
  initiative: Initiative | null;
  projectCalendarBinding: InitiativeDetail["projectCalendarBinding"] | null;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
  onCalendarBindingChange: () => Promise<void>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(props.initiative?.name ?? "");
    setStartDate(props.initiative?.startDate ?? "");
    setEndDate(props.initiative?.endDate ?? "");
    setIsLocked(props.initiative?.isLocked ?? false);
    setEditingName(false);
    setDateModalOpen(false);
    setDateRangeError(null);
    setHeaderError(null);
    setBusy(false);
  }, [props.initiative?.id, props.initiative?.name, props.initiative?.startDate, props.initiative?.endDate, props.initiative?.isLocked]);

  if (!props.initiative) {
    return (
      <div className="section-heading">
        <div className="initiative-title-line">
          <h1>Eintrag</h1>
        </div>
      </div>
    );
  }

  const initiative = props.initiative;
  const dateRange = initiative.type === "project" ? formatInitiativeDateRangeForUi(initiative) : null;
  const resetDateRangeDraft = () => {
    setStartDate(initiative.startDate ?? "");
    setEndDate(initiative.endDate ?? "");
    setIsLocked(initiative.isLocked);
    setDateRangeError(null);
    setDateModalOpen(false);
  };
  const saveName = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    if (trimmedName === initiative.name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdateInitiative(initiative.id, { name: trimmedName });
      setEditingName(false);
      setHeaderError(null);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };
  const saveHeaderPatch = async (input: UpdateInitiativeInput) => {
    if (busy) return;
    setBusy(true);
    setHeaderError(null);
    try {
      await props.onUpdateInitiative(initiative.id, input);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };
  const saveDateRange = async () => {
    if (busy) return;
    if (initiativeDateRangeInvalid(startDate, endDate)) {
      setDateRangeError("Start darf nicht nach Ende liegen.");
      return;
    }
    const nextStartDate = startDate || null;
    const nextEndDate = endDate || null;
    if (nextStartDate === initiative.startDate && nextEndDate === initiative.endDate && isLocked === initiative.isLocked) {
      setDateModalOpen(false);
      return;
    }
    setBusy(true);
    setDateRangeError(null);
    try {
      await props.onUpdateInitiative(initiative.id, { startDate: nextStartDate, endDate: nextEndDate, isLocked });
      setDateModalOpen(false);
      setHeaderError(null);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Zeitraum konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-heading initiative-header-inline">
      <div className="initiative-title-line">
        {editingName ? (
          <form
            className="initiative-title-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <input
              autoFocus
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setName(initiative.name);
                  setEditingName(false);
                }
              }}
            />
          </form>
        ) : (
          <button type="button" className="initiative-title-edit" onClick={() => setEditingName(true)} title="Titel bearbeiten">
            <h1>{displayInitiativeName(initiative)}</h1>
          </button>
        )}
        {!editingName ? (
          <>
            <label className={`detail-pill-select type ${initiative.type}`} title="Typ ändern">
              <select
                value={initiative.type}
                disabled={busy}
                aria-label="Initiative-Typ"
                onChange={(event) => void saveHeaderPatch({ type: event.target.value as InitiativeType })}
              >
                {initiativeTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`detail-pill-select status ${initiative.status}`} title="Status ändern">
              <select
                value={initiative.status}
                disabled={busy}
                aria-label="Initiative-Status"
                onChange={(event) => void saveHeaderPatch({ status: event.target.value as Initiative["status"] })}
              >
                {initiativeStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {initiative.type === "project" ? (
              <label className={`detail-pill-select phase ${initiative.projectPhase}`} title="Projektphase ändern">
                <select
                  value={initiative.projectPhase}
                  disabled={busy}
                  aria-label="Projektphase"
                  onChange={(event) => void saveHeaderPatch({ projectPhase: event.target.value as ProjectPhase })}
                >
                  {projectPhaseOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {initiative.type === "project" ? (
              <button
                type="button"
                className="initiative-date-pill"
                onClick={() => setDateModalOpen(true)}
                title={initiative.isLocked ? "Zeitraum ist gesperrt und kann nicht verschoben werden" : "Projektzeitraum und Google-Verknüpfung bearbeiten"}
              >
                <CalendarDays size={14} />
                <span>{dateRange ?? "Zeitraum setzen"}</span>
                {initiative.isLocked ? <Lock size={13} aria-hidden="true" /> : null}
                {props.projectCalendarBinding ? <span className="calendar-google-badge" title="Mit Google Calendar verknüpft">G</span> : null}
              </button>
            ) : null}
            {initiative.isSystem ? <span className="system-badge">System</span> : null}
            {headerError ? <span className="initiative-date-error">{headerError}</span> : null}
          </>
        ) : null}
      </div>
      {dateModalOpen && initiative.type === "project" ? (
        <ProjectDateCalendarModal
          initiative={initiative}
          binding={props.projectCalendarBinding ?? null}
          startDate={startDate}
          endDate={endDate}
          isLocked={isLocked}
          busy={busy}
          error={dateRangeError}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onLockedChange={setIsLocked}
          onSaveDateRange={saveDateRange}
          onCancel={resetDateRangeDraft}
          onCalendarBindingChange={props.onCalendarBindingChange}
        />
      ) : null}
    </div>
  );
}

function TaskDetailHeader(props: {
  task: Task | null;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
}) {
  const [editingTitle, setEditingTitle] = useState(false);
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setTitle(props.task?.title ?? "");
    setEditingTitle(false);
    setBusy(false);
  }, [props.task?.id, props.task?.title]);

  if (!props.task) {
    return (
      <div className="section-heading task-detail-heading">
        <div className="initiative-title-line">
          <h1>Maßnahme</h1>
        </div>
      </div>
    );
  }

  const task = props.task;
  const saveTitle = async () => {
    const trimmedTitle = title.trim();
    if (!trimmedTitle || busy) return;
    if (trimmedTitle === task.title) {
      setEditingTitle(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdateTask(task.id, { title: trimmedTitle });
      setEditingTitle(false);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-heading task-detail-heading">
      <div className="initiative-title-line">
        {editingTitle ? (
          <form
            className="initiative-title-form task-title-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveTitle();
            }}
          >
            <input
              autoFocus
              value={title}
              disabled={busy}
              onChange={(event) => setTitle(event.target.value)}
              onBlur={() => void saveTitle()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setTitle(task.title);
                  setEditingTitle(false);
                }
              }}
            />
          </form>
        ) : (
          <button type="button" className="initiative-title-edit" onClick={() => setEditingTitle(true)} title="Titel bearbeiten">
            <h1>{task.title}</h1>
          </button>
        )}
        {!editingTitle ? (
          <>
            <button
              type="button"
              className={`task-status-toggle ${task.status}`}
              disabled={busy}
              onClick={() => void props.onUpdateTask(task.id, { status: task.status === "done" ? "open" : "done" })}
              title={task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
            >
              {task.status === "done" ? <CheckCircle2 size={16} /> : <Circle size={16} />}
              {task.status === "done" ? "Erledigt" : "Open"}
            </button>
            <label className={`detail-pill-select priority ${task.priority}`} title="Priorität ändern">
              <select
                value={task.priority}
                disabled={busy}
                aria-label="Task-Priorität"
                onChange={(event) => void props.onUpdateTask(task.id, { priority: event.target.value as Task["priority"] })}
              >
                {taskPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        ) : null}
      </div>
    </div>
  );
}

function ProjectDateCalendarModal(props: {
  initiative: Initiative;
  binding: InitiativeDetail["projectCalendarBinding"] | null;
  startDate: string;
  endDate: string;
  isLocked: boolean;
  busy: boolean;
  error: string | null;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onLockedChange: (value: boolean) => void;
  onSaveDateRange: () => Promise<void>;
  onCancel: () => void;
  onCalendarBindingChange: () => Promise<void>;
}) {
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [calendarSourceId, setCalendarSourceId] = useState<number | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const writableSources = sources.filter((source) => source.enabled && !source.readOnly);
  const hasCompleteDateRange = Boolean(props.startDate && props.endDate);
  const dateRangeChanged = props.startDate !== (props.initiative.startDate ?? "") || props.endDate !== (props.initiative.endDate ?? "") || props.isLocked !== props.initiative.isLocked;
  const lockTitle = props.isLocked
    ? "Start- und Endzeitpunkt sind gesperrt und sollen nicht verschoben werden"
    : "Zeitraum ist flexibel und kann verschoben werden";
  const bindingCalendarLabel = props.binding?.calendarSource
    ? props.binding.calendarSource.accountLabel
    : props.binding?.externalCalendarId ?? "nicht verknüpft";

  useEffect(() => {
    fetchCalendarSources()
      .then((nextSources) => {
        setSources(nextSources);
        const firstWritable = nextSources.find((source) => source.enabled && !source.readOnly) ?? null;
        setCalendarSourceId(firstWritable?.id ?? null);
      })
      .catch((err: unknown) => setCalendarError(err instanceof Error ? err.message : "Kalenderquellen konnten nicht geladen werden."));
  }, []);

  async function createGoogleEvent() {
    if (!calendarSourceId || calendarBusy || !hasCompleteDateRange || dateRangeChanged) return;
    setCalendarBusy(true);
    setCalendarError(null);
    try {
      await createGoogleEventFromDmax({
        localEntityType: "initiative_project_span",
        localEntityId: props.initiative.id,
        calendarSourceId
      });
      await props.onCalendarBindingChange();
      props.onCancel();
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : "Google Event konnte nicht erstellt werden.");
    } finally {
      setCalendarBusy(false);
    }
  }

  async function unlinkGoogleEvent() {
    if (!props.binding || calendarBusy) return;
    const deleteGoogleEvent = window.confirm("Google Event ebenfalls löschen?");
    setCalendarBusy(true);
    setCalendarError(null);
    try {
      await unlinkCalendarBinding(props.binding.id, { deleteGoogleEvent });
      await props.onCalendarBindingChange();
      props.onCancel();
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : "Google-Verknüpfung konnte nicht gelöst werden.");
    } finally {
      setCalendarBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section className="compact-modal project-date-calendar-modal" role="dialog" aria-modal="true" aria-label="Projektzeitraum und Google Calendar" onMouseDown={(event) => event.stopPropagation()}>
        <header className="google-event-modal-header">
          <div>
            <span>Projektzeitraum</span>
            <strong>{displayInitiativeName(props.initiative)}</strong>
          </div>
          <button className="icon-button" type="button" title="Schließen" onClick={props.onCancel}>
            <X size={16} />
          </button>
        </header>

        <form
          className="project-date-modal-section"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onSaveDateRange();
          }}
        >
          <label className="google-event-field">
            <span>Start</span>
            <input type="date" value={props.startDate} disabled={props.busy} onChange={(event) => props.onStartDateChange(event.target.value)} />
          </label>
          <label className="google-event-field">
            <span>Ende</span>
            <input
              type="date"
              value={props.endDate}
              min={props.startDate || undefined}
              disabled={props.busy}
              onPointerDown={(event) => primeEmptyDatePickerMonth(event, props.startDate, props.endDate)}
              onFocus={(event) => primeEmptyDatePickerMonth(event, props.startDate, props.endDate)}
              onBlur={(event) => restorePrimedEmptyDateInput(event, props.endDate)}
              onChange={(event) => props.onEndDateChange(event.target.value)}
            />
          </label>
          {props.error ? <div className="error-banner project-date-modal-full">{props.error}</div> : null}
          <div className="project-date-lock-row project-date-modal-full">
            <span>{props.isLocked ? "Fixierter Zeitraum" : "Flexibler Zeitraum"}</span>
            <button
              type="button"
              className={`project-timeframe-lock-toggle ${props.isLocked ? "locked" : "unlocked"}`}
              disabled={props.busy}
              title={lockTitle}
              aria-label={lockTitle}
              aria-pressed={props.isLocked}
              onClick={() => props.onLockedChange(!props.isLocked)}
            >
              {props.isLocked ? <Lock size={17} aria-hidden="true" /> : <LockOpen size={17} aria-hidden="true" />}
            </button>
          </div>
        </form>

        <section className="project-date-modal-section project-google-section">
          <div className="project-google-summary project-date-modal-full">
            <span>Google Kalender</span>
            {props.binding ? (
              <strong>{bindingCalendarLabel}</strong>
            ) : writableSources.length > 0 ? (
              <select value={calendarSourceId ?? ""} onChange={(event) => setCalendarSourceId(Number(event.target.value))}>
                {writableSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.accountLabel}</option>
                ))}
              </select>
            ) : (
              <strong>nicht verknüpft</strong>
            )}
          </div>
          {props.binding ? (
            <button type="button" className="project-date-text-link project-date-modal-full" disabled={calendarBusy} onClick={() => void unlinkGoogleEvent()}>
              Verknüpfung lösen
            </button>
          ) : (
            <>
              {writableSources.length === 0 ? <div className="config-hint project-date-modal-full">Keine schreibbare Google-Kalenderquelle konfiguriert.</div> : null}
              <button
                type="button"
                className="project-date-text-link project-date-modal-full"
                disabled={calendarBusy || !calendarSourceId || !hasCompleteDateRange || dateRangeChanged}
                onClick={() => void createGoogleEvent()}
              >
                Google Event erstellen
              </button>
              {!hasCompleteDateRange ? <div className="config-hint project-date-modal-full">Start und Ende sind nötig, bevor ein Google-Ganztags-Event erstellt werden kann.</div> : null}
              {dateRangeChanged ? <div className="config-hint project-date-modal-full">OK speichert den Zeitraum. Danach kann ein Google Event erstellt werden.</div> : null}
            </>
          )}
          {calendarError ? <div className="error-banner project-date-modal-full">{calendarError}</div> : null}
        </section>

        <div className="modal-actions">
          <button type="button" className="primary-action compact" disabled={props.busy || calendarBusy} onClick={() => void props.onSaveDateRange()}>OK</button>
        </div>
      </section>
    </div>
  );
}

function InitiativeMarkdownPanel(props: {
  initiative: Initiative;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState(props.initiative.markdown);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMarkdown(props.initiative.markdown);
    setEditing(false);
    setBusy(false);
  }, [props.initiative.id, props.initiative.markdown]);

  const saveMarkdown = async () => {
    if (busy) return;
    if (markdown === props.initiative.markdown) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdateInitiative(props.initiative.id, { markdown });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form
        className="panel initiative-markdown-panel editing"
        onSubmit={(event) => {
          event.preventDefault();
          void saveMarkdown();
        }}
      >
        <textarea
          autoFocus
          className="initiative-markdown-editor"
          value={markdown}
          disabled={busy}
          rows={18}
          onChange={(event) => setMarkdown(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void saveMarkdown();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setMarkdown(props.initiative.markdown);
              setEditing(false);
            }
          }}
        />
        <div className="form-actions">
          <button
            type="button"
            className="small-button"
            onClick={() => {
              setMarkdown(props.initiative.markdown);
              setEditing(false);
            }}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button className="primary-action compact" type="submit" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    );
  }

  return (
    <button
      type="button"
      className="panel initiative-markdown-panel"
      onClick={() => setEditing(true)}
      title="Markdown bearbeiten"
    >
      <RichText text={props.initiative.markdown || "Noch kein Markdown."} />
    </button>
  );
}

function TaskDetailView(props: {
  detail: TaskDetail | null;
  onBack: () => void;
  onOpenInitiative: (initiativeId: number) => void;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
  onCreateChecklistItem: (taskId: number, name: string) => Promise<void>;
  onUpdateChecklistItem: (taskId: number, itemId: number, input: { name?: string; status?: TaskChecklistItem["status"] }) => Promise<void>;
  onDeleteChecklistItem: (taskId: number, itemId: number) => Promise<void>;
  onReorderChecklistItems: (taskId: number, itemIds: number[]) => Promise<void>;
  onUploadMedia: (taskId: number, file: File) => Promise<void>;
  onUpdateMedia: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDeleteMedia: (linkId: number) => Promise<void>;
  onReorderMedia: (taskId: number, linkIds: number[]) => Promise<void>;
}) {
  if (!props.detail) {
    return <EmptyState title="Loading task..." />;
  }

  const { task } = props.detail;
  return (
    <section className="task-detail">
      <section className="panel task-detail-panel">
        <dl className="detail-list">
          <div>
            <dt>Due Date</dt>
            <dd>
              <TaskDueDateEditor task={task} onUpdateTask={props.onUpdateTask} />
            </dd>
          </div>
          {task.status === "done" && task.completedAt ? (
          <div>
            <dt>Completed</dt>
            <dd>{task.completedAt}</dd>
          </div>
          ) : null}
        </dl>
      </section>

      <TaskNotesPanel task={task} onUpdateTask={props.onUpdateTask} />
      <MediaAttachmentsPanel
        entityType="task"
        entityId={task.id}
        attachments={props.detail.mediaAttachments ?? []}
        onUpload={props.onUploadMedia}
        onUpdate={props.onUpdateMedia}
        onDelete={props.onDeleteMedia}
        onReorder={props.onReorderMedia}
      />
      <TaskChecklistPanel
        task={task}
        items={props.detail.checklistItems ?? []}
        onCreateItem={props.onCreateChecklistItem}
        onUpdateItem={props.onUpdateChecklistItem}
        onDeleteItem={props.onDeleteChecklistItem}
        onReorderItems={props.onReorderChecklistItems}
      />
    </section>
  );
}

function MediaAttachmentsPanel(props: {
  entityType: Extract<MediaEntityType, "initiative" | "task">;
  entityId: number;
  attachments: MediaAttachment[];
  onUpload: (entityId: number, file: File) => Promise<void>;
  onUpdate: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDelete: (linkId: number) => Promise<void>;
  onReorder: (entityId: number, linkIds: number[]) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedLinkId, setDraggedLinkId] = useState<number | null>(null);
  const [dropLinkId, setDropLinkId] = useState<number | null>(null);
  const [modalMedia, setModalMedia] = useState<MediaAttachment | null>(null);
  const linkIds = props.attachments.map((attachment) => attachment.id);

  useEffect(() => {
    setBusy(false);
    setError(null);
    setDragActive(false);
    setDraggedLinkId(null);
    setDropLinkId(null);
    setModalMedia(null);
  }, [props.entityType, props.entityId]);

  useEffect(() => {
    setModalMedia((current) => {
      if (!current) return current;
      return props.attachments.find((attachment) => attachment.id === current.id) ?? current;
    });
  }, [props.attachments]);

  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of selected) {
        await props.onUpload(props.entityId, file);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const reorderAttachments = async (targetId: number, placeAfter: boolean) => {
    if (!draggedLinkId || draggedLinkId === targetId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onReorder(props.entityId, moveIdToDropPosition(linkIds, draggedLinkId, targetId, placeAfter));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reihenfolge konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
      setDraggedLinkId(null);
      setDropLinkId(null);
    }
  };

  return (
    <section
      className={`panel media-panel ${dragActive ? "drag-active" : ""}`}
      onDragOver={(event) => {
        if (draggedLinkId || event.dataTransfer.types.includes("application/x-dmax-media-link")) {
          return;
        }
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        if (draggedLinkId || event.dataTransfer.types.includes("application/x-dmax-media-link")) {
          return;
        }
        event.preventDefault();
        setDragActive(false);
        void uploadFiles(event.dataTransfer.files);
      }}
    >
      <div className="media-panel-header">
        <div>
          <h2>Medien</h2>
          <span>{props.attachments.length} Dateien</span>
        </div>
        <button type="button" className="icon-button" disabled={busy} onClick={() => fileInputRef.current?.click()} title="Dateien hinzufügen">
          <Upload size={17} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden-file-input"
          onChange={(event) => {
            if (event.target.files) {
              void uploadFiles(event.target.files);
            }
          }}
        />
      </div>

      <button type="button" className="media-drop-empty" disabled={busy} onClick={() => fileInputRef.current?.click()}>
        <Paperclip size={18} />
        <span>{busy ? "Upload und Analyse laufen..." : "Dateien hier ablegen oder auswählen"}</span>
      </button>

      {props.attachments.length > 0 ? (
        <div className="media-grid">
          {props.attachments.map((attachment) => (
            <MediaAttachmentCard
              key={attachment.id}
              attachment={attachment}
              busy={busy}
              dragging={draggedLinkId === attachment.id}
              dragOver={dropLinkId === attachment.id}
              onUpdate={props.onUpdate}
              onDelete={props.onDelete}
              onOpen={setModalMedia}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-dmax-media-link", String(attachment.id));
                setDraggedLinkId(attachment.id);
              }}
              onDragOver={(event) => {
                if (!draggedLinkId || draggedLinkId === attachment.id) return;
                event.preventDefault();
                event.stopPropagation();
                setDropLinkId(attachment.id);
              }}
              onDrop={(event) => {
                if (!draggedLinkId) return;
                event.preventDefault();
                event.stopPropagation();
                void reorderAttachments(attachment.id, dropAfter(event));
              }}
              onDragEnd={() => {
                setDraggedLinkId(null);
                setDropLinkId(null);
              }}
            />
          ))}
        </div>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {modalMedia ? (
        <MediaModal
          attachment={modalMedia}
          onClose={() => setModalMedia(null)}
          onUpdateLink={async (linkId, input) => {
            await props.onUpdate(linkId, input);
            setModalMedia((current) => (current && current.id === modalMedia.id ? { ...current, ...input } : current));
          }}
          onUpdateAsset={async (assetId, input) => {
            const updated = await updateMediaAssetAnalysis(assetId, input);
            setModalMedia((current) => (current && current.asset.id === assetId ? { ...current, asset: updated } : current));
            return updated;
          }}
          onReanalyzeAsset={async (assetId, input) => {
            const updated = await reanalyzeMediaAsset(assetId, input);
            setModalMedia((current) => (current && current.asset.id === assetId ? { ...current, asset: updated } : current));
            return updated;
          }}
        />
      ) : null}
    </section>
  );
}

function MediaAttachmentCard(props: {
  attachment: MediaAttachment;
  busy: boolean;
  dragging: boolean;
  dragOver: boolean;
  onUpdate: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDelete: (linkId: number) => Promise<void>;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onOpen: (attachment: MediaAttachment) => void;
}) {
  const { attachment } = props;
  const [caption, setCaption] = useState(attachment.caption ?? "");
  const [editingCaption, setEditingCaption] = useState(false);
  const [busy, setBusy] = useState(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setCaption(attachment.caption ?? "");
    setEditingCaption(false);
    setBusy(false);
  }, [attachment.id, attachment.caption]);

  const saveCaption = async () => {
    if (busy) return;
    const nextCaption = caption.trim() ? caption : null;
    if (nextCaption === attachment.caption) {
      setEditingCaption(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdate(attachment.id, { caption: nextCaption });
      setEditingCaption(false);
    } finally {
      setBusy(false);
    }
  };

  const deleteAttachment = async () => {
    if (busy || props.busy) return;
    setBusy(true);
    try {
      await props.onDelete(attachment.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`media-card ${attachment.asset.kind} ${props.dragging ? "dragging" : ""} ${props.dragOver ? "drag-over" : ""}`}
      draggable={!editingCaption && !busy && !props.busy}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (suppressClickRef.current || editingCaption || busy || props.busy) return;
        props.onOpen(attachment);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !editingCaption && !busy && !props.busy) {
          event.preventDefault();
          props.onOpen(attachment);
        }
      }}
      onDragStart={(event) => {
        suppressClickRef.current = true;
        props.onDragStart(event);
      }}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onDragEnd={() => {
        props.onDragEnd();
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }}
    >
      <div className="media-preview">
        <MediaPreview attachment={attachment} />
      </div>
      <div className="media-card-body">
        <div className="media-file-line">
          <strong title={attachment.asset.originalName}>{attachment.asset.originalName}</strong>
          <span>{formatBytes(attachment.asset.byteSize)}</span>
        </div>
        <span className="media-kind-line">{attachment.asset.mimeType}</span>
        {attachment.asset.summary ? <p className="media-analysis-text">{attachment.asset.summary}</p> : null}
        {!attachment.asset.summary && attachment.asset.textExcerpt ? <p className="media-analysis-text">{attachment.asset.textExcerpt}</p> : null}
        {editingCaption ? (
          <form
            className="media-caption-form"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveCaption();
            }}
          >
            <input
              autoFocus
              value={caption}
              disabled={busy}
              placeholder="Caption"
              onChange={(event) => setCaption(event.target.value)}
              onBlur={() => void saveCaption()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCaption(attachment.caption ?? "");
                  setEditingCaption(false);
                }
              }}
            />
          </form>
        ) : (
          <button
            type="button"
            className="media-caption-button"
            onClick={(event) => {
              event.stopPropagation();
              setEditingCaption(true);
            }}
            title="Caption bearbeiten"
          >
            {attachment.caption || "Caption hinzufügen"}
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-button danger media-delete"
        disabled={busy || props.busy}
        onClick={(event) => {
          event.stopPropagation();
          void deleteAttachment();
        }}
        title="Anhang entfernen"
      >
        <Trash2 size={16} />
      </button>
    </article>
  );
}

function MediaPreview(props: { attachment: MediaAttachment }) {
  const { asset } = props.attachment;
  if (asset.kind === "image") {
    return (
      <div className="media-image-button" title="Medium öffnen">
        <img src={asset.fileUrl} alt={props.attachment.caption ?? asset.originalName} loading="lazy" draggable={false} />
      </div>
    );
  }
  if (asset.kind === "audio") {
    return (
      <div className="media-document-link">
        <Mic2 size={30} />
        <strong>AUDIO</strong>
        <span>{asset.summary || "Audio öffnen"}</span>
      </div>
    );
  }
  if (asset.kind === "video") {
    return <video src={asset.fileUrl} muted playsInline preload="metadata" />;
  }
  if (asset.kind === "document") {
    if (asset.mimeType === "application/pdf") {
      return (
        <div className="media-pdf-preview" title="PDF öffnen">
          <iframe src={`${asset.fileUrl}#toolbar=0&navpanes=0&scrollbar=0`} title={asset.originalName} />
        </div>
      );
    }
    if (asset.mimeType === "text/plain" || asset.mimeType === "text/markdown") {
      return (
        <div className="media-text-preview" title="Dokument öffnen">
          <FileText size={24} />
          <span>{asset.textExcerpt || asset.summary || asset.originalName}</span>
        </div>
      );
    }
    return (
      <div className="media-document-link" title="Dokument öffnen">
        <FileText size={30} />
        <strong>{documentExtension(asset.originalName).toUpperCase() || "DOC"}</strong>
        <span>{asset.summary || "Dokument öffnen"}</span>
      </div>
    );
  }
  return (
    <div className="media-document-link">
      <Image size={30} />
      <span>Öffnen</span>
    </div>
  );
}

function MediaModal(props: {
  attachment: MediaAttachment;
  onClose: () => void;
  onUpdateLink: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onUpdateAsset: (assetId: number, input: { summary?: string | null; textExcerpt?: string | null; transcript?: string | null }) => Promise<MediaAsset>;
  onReanalyzeAsset: (assetId: number, input: { prompt?: string | null }) => Promise<MediaAsset>;
}) {
  const { attachment } = props;
  const { asset } = attachment;
  const [caption, setCaption] = useState(attachment.caption ?? "");
  const [summary, setSummary] = useState(asset.summary ?? "");
  const [textExcerpt, setTextExcerpt] = useState(asset.textExcerpt ?? "");
  const [transcript, setTranscript] = useState(asset.transcript ?? "");
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [reanalyzePrompt, setReanalyzePrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCaption(attachment.caption ?? "");
    setSummary(asset.summary ?? "");
    setTextExcerpt(asset.textExcerpt ?? "");
    setTranscript(asset.transcript ?? "");
    setEditingAnalysis(false);
    setReanalyzePrompt("");
    setBusy(false);
    setError(null);
  }, [attachment.id, attachment.caption, asset.id, asset.summary, asset.textExcerpt, asset.transcript]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  const saveCaption = async () => {
    if (busy) return;
    const nextCaption = nullableText(caption);
    if (nextCaption === attachment.caption) return;
    setBusy(true);
    setError(null);
    try {
      await props.onUpdateLink(attachment.id, { caption: nextCaption });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caption konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const saveAnalysis = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await props.onUpdateAsset(asset.id, {
        summary: nullableText(summary),
        textExcerpt: nullableText(textExcerpt),
        transcript: nullableText(transcript)
      });
      setSummary(updated.summary ?? "");
      setTextExcerpt(updated.textExcerpt ?? "");
      setTranscript(updated.transcript ?? "");
      setEditingAnalysis(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const runReanalysis = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await props.onReanalyzeAsset(asset.id, { prompt: nullableText(reanalyzePrompt) });
      setSummary(updated.summary ?? "");
      setTextExcerpt(updated.textExcerpt ?? "");
      setTranscript(updated.transcript ?? "");
      setEditingAnalysis(false);
      setReanalyzePrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse konnte nicht neu erstellt werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="media-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.caption ?? asset.originalName}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div className="media-modal">
        <div className="media-modal-header">
          <div>
            <strong>{asset.originalName}</strong>
            <span>{asset.mimeType} · {formatBytes(asset.byteSize)}</span>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} title="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="media-modal-content">
          <div className="media-modal-viewer">
            <MediaModalViewer attachment={attachment} />
          </div>
          <aside className="media-modal-meta">
            <section className="media-meta-section">
              <h3>Metadaten</h3>
              <dl className="media-meta-list">
                <div>
                  <dt>Typ</dt>
                  <dd>{asset.kind}</dd>
                </div>
                <div>
                  <dt>MIME</dt>
                  <dd>{asset.mimeType}</dd>
                </div>
                <div>
                  <dt>Größe</dt>
                  <dd>{formatBytes(asset.byteSize)}</dd>
                </div>
                <div>
                  <dt>Hochgeladen</dt>
                  <dd>{formatMediaTimestamp(asset.createdAt)}</dd>
                </div>
              </dl>
            </section>

            <section className="media-meta-section">
              <h3>Caption</h3>
              <input
                value={caption}
                disabled={busy}
                placeholder="Warum ist dieses Medium hier relevant?"
                onChange={(event) => setCaption(event.target.value)}
                onBlur={() => void saveCaption()}
              />
            </section>

            <section className="media-meta-section">
              <div className="media-section-title-row">
                <h3>Analyse</h3>
                <button type="button" className="small-text-button" disabled={busy} onClick={() => setEditingAnalysis((value) => !value)}>
                  {editingAnalysis ? "Abbrechen" : "Bearbeiten"}
                </button>
              </div>

              {editingAnalysis ? (
                <div className="media-analysis-form">
                  <label>
                    Zusammenfassung
                    <textarea value={summary} disabled={busy} rows={4} onChange={(event) => setSummary(event.target.value)} />
                  </label>
                  <label>
                    Textauszug / Inhaltsnotiz
                    <textarea value={textExcerpt} disabled={busy} rows={7} onChange={(event) => setTextExcerpt(event.target.value)} />
                  </label>
                  {asset.kind === "audio" || asset.kind === "video" ? (
                    <label>
                      Transkript
                      <textarea value={transcript} disabled={busy} rows={7} onChange={(event) => setTranscript(event.target.value)} />
                    </label>
                  ) : null}
                  <button type="button" className="primary-action compact" disabled={busy} onClick={() => void saveAnalysis()}>
                    Speichern
                  </button>
                </div>
              ) : (
                <div className="media-analysis-read">
                  <ExpandableText title="Zusammenfassung" text={asset.summary} emptyLabel="Keine Zusammenfassung gespeichert." />
                  <ExpandableText title="Textauszug / Inhaltsnotiz" text={asset.textExcerpt} emptyLabel="Kein Textauszug gespeichert." />
                  {asset.transcript ? <ExpandableText title="Transkript" text={asset.transcript} emptyLabel="Kein Transkript gespeichert." /> : null}
                </div>
              )}
            </section>

            <section className="media-meta-section">
              <h3>Analyse neu erstellen</h3>
              <textarea
                value={reanalyzePrompt}
                disabled={busy}
                rows={3}
                placeholder="Optionaler Fokus, z.B. bitte ausführlicher, nur Reisedaten extrahieren, auf Kosten achten..."
                onChange={(event) => setReanalyzePrompt(event.target.value)}
              />
              <button type="button" className="secondary-action compact" disabled={busy} onClick={() => void runReanalysis()}>
                <RefreshCw size={15} />
                {busy ? "Analysiere..." : "Neu analysieren"}
              </button>
            </section>

            {error ? <p className="inline-error">{error}</p> : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function MediaModalViewer(props: { attachment: MediaAttachment }) {
  const { asset } = props.attachment;
  if (asset.kind === "image") {
    return <img src={asset.fileUrl} alt={props.attachment.caption ?? asset.originalName} />;
  }
  if (asset.kind === "audio") {
    return (
      <div className="media-player-shell">
        <Mic2 size={34} />
        <strong>{asset.originalName}</strong>
        <audio controls src={asset.fileUrl} />
      </div>
    );
  }
  if (asset.kind === "video") {
    return <video controls src={asset.fileUrl} />;
  }
  if (asset.mimeType === "application/pdf") {
    return <iframe className="media-document-frame" src={`${asset.fileUrl}#toolbar=1&navpanes=0`} title={asset.originalName} />;
  }
  if (asset.mimeType === "text/plain" || asset.mimeType === "text/markdown") {
    return <pre className="media-text-document">{asset.textExcerpt || asset.summary || "Kein Textauszug gespeichert."}</pre>;
  }
  return (
    <div className="media-player-shell">
      <FileText size={40} />
      <strong>{asset.originalName}</strong>
      <span>{asset.summary || "Für diesen Dokumenttyp gibt es aktuell keine eingebettete Seitenvorschau."}</span>
      <a className="secondary-action compact" href={asset.fileUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={15} />
        Datei öffnen
      </a>
    </div>
  );
}

function ExpandableText(props: { title: string; text: string | null; emptyLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const text = props.text?.trim();
  const limit = 420;
  const canExpand = Boolean(text && text.length > limit);
  const visibleText = text && canExpand && !expanded ? `${text.slice(0, limit).trimEnd()}...` : text;

  return (
    <div className="media-expandable-text">
      <strong>{props.title}</strong>
      <p>{visibleText || props.emptyLabel}</p>
      {canExpand ? (
        <button type="button" className="small-text-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
        </button>
      ) : null}
    </div>
  );
}

function TaskChecklistPanel(props: {
  task: Task;
  items: TaskChecklistItem[];
  onCreateItem: (taskId: number, name: string) => Promise<void>;
  onUpdateItem: (taskId: number, itemId: number, input: { name?: string; status?: TaskChecklistItem["status"] }) => Promise<void>;
  onDeleteItem: (taskId: number, itemId: number) => Promise<void>;
  onReorderItems: (taskId: number, itemIds: number[]) => Promise<void>;
}) {
  const newItemInputRef = useRef<HTMLInputElement | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dropItemId, setDropItemId] = useState<number | null>(null);
  const itemIds = props.items.map((item) => item.id);

  useEffect(() => {
    setNewName("");
    setCreating(false);
    setBusyItemId(null);
    setEditingItemId(null);
    setEditingName("");
    setDraggedItemId(null);
    setDropItemId(null);
  }, [props.task.id]);

  const createItem = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName || creating) return;
    setCreating(true);
    try {
      await props.onCreateItem(props.task.id, trimmedName);
      setNewName("");
    } finally {
      setCreating(false);
      requestAnimationFrame(() => newItemInputRef.current?.focus());
    }
  };

  const saveItemName = async (item: TaskChecklistItem) => {
    const trimmedName = editingName.trim();
    if (!trimmedName || busyItemId) return;
    if (trimmedName === item.name) {
      setEditingItemId(null);
      return;
    }
    setBusyItemId(item.id);
    try {
      await props.onUpdateItem(props.task.id, item.id, { name: trimmedName });
      setEditingItemId(null);
    } finally {
      setBusyItemId(null);
    }
  };

  const toggleItem = async (item: TaskChecklistItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    try {
      await props.onUpdateItem(props.task.id, item.id, { status: item.status === "done" ? "todo" : "done" });
    } finally {
      setBusyItemId(null);
    }
  };

  const deleteItem = async (item: TaskChecklistItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    try {
      await props.onDeleteItem(props.task.id, item.id);
    } finally {
      setBusyItemId(null);
    }
  };

  return (
    <section className="panel task-checklist-panel">
      <div className="task-checklist-header">
        <h2>Checkliste</h2>
        <span>{props.items.filter((item) => item.status === "done").length}/{props.items.length}</span>
      </div>

      <div className="task-checklist-items">
        {props.items.map((item) => (
          <article
            key={item.id}
            className={`task-checklist-item ${item.status} ${draggedItemId === item.id ? "dragging" : ""} ${dropItemId === item.id ? "drag-over" : ""}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDraggedItemId(item.id);
            }}
            onDragOver={(event) => {
              if (!draggedItemId) return;
              event.preventDefault();
              setDropItemId(item.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggedItemId) return;
              void props.onReorderItems(props.task.id, moveIdToDropPosition(itemIds, draggedItemId, item.id, dropAfter(event)));
              setDraggedItemId(null);
              setDropItemId(null);
            }}
            onDragEnd={() => {
              setDraggedItemId(null);
              setDropItemId(null);
            }}
          >
            <button
              type="button"
              className="icon-button"
              disabled={busyItemId === item.id}
              onClick={() => void toggleItem(item)}
              title={item.status === "done" ? "Wieder öffnen" : "Abhaken"}
            >
              {item.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
            {editingItemId === item.id ? (
              <form
                className="task-checklist-name-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveItemName(item);
                }}
              >
                <input
                  autoFocus
                  value={editingName}
                  disabled={busyItemId === item.id}
                  onChange={(event) => setEditingName(event.target.value)}
                  onBlur={() => void saveItemName(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingItemId(null);
                      setEditingName("");
                    }
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="task-checklist-name"
                onClick={() => {
                  setEditingItemId(item.id);
                  setEditingName(item.name);
                }}
                title="Name bearbeiten"
              >
                {item.name}
              </button>
            )}
            <button
              type="button"
              className="icon-button danger"
              disabled={busyItemId === item.id}
              onClick={() => void deleteItem(item)}
              title="Checklisteneintrag löschen"
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>

      <form
        className="task-checklist-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createItem();
        }}
      >
        <input
          ref={newItemInputRef}
          value={newName}
          disabled={creating}
          placeholder="Neuer Eintrag"
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" className="icon-button" disabled={creating || !newName.trim()} title="Checklisteneintrag hinzufügen">
          <Plus size={17} />
        </button>
      </form>
    </section>
  );
}

function TaskDueDateEditor(props: { task: Task; onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [dueAt, setDueAt] = useState(props.task.dueAt ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setDueAt(props.task.dueAt ?? "");
    setEditing(false);
    setBusy(false);
  }, [props.task.id, props.task.dueAt]);

  const saveDueDate = async (nextDueAt: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { dueAt: nextDueAt });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (!editing) {
    return (
      <button type="button" className="task-date-button" onClick={() => setEditing(true)} title="Due Date bearbeiten">
        {props.task.dueAt ?? "No Due Date"}
      </button>
    );
  }

  return (
    <div className="task-date-editor">
      <input
        autoFocus
        type="date"
        value={dueAt}
        disabled={busy}
        onChange={(event) => {
          const value = event.target.value;
          setDueAt(value);
          void saveDueDate(value || null);
        }}
      />
      {props.task.dueAt ? (
        <button type="button" className="icon-button danger" disabled={busy} onClick={() => void saveDueDate(null)} title="Due Date entfernen">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

function TaskNotesPanel(props: { task: Task; onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(props.task.notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNotes(props.task.notes ?? "");
    setEditing(false);
    setBusy(false);
  }, [props.task.id, props.task.notes]);

  const saveNotes = async () => {
    if (busy) return;
    const nextNotes = notes.trim() ? notes : null;
    if (nextNotes === props.task.notes) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { notes: nextNotes });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <form
        className="panel task-notes-panel editing"
        onSubmit={(event) => {
          event.preventDefault();
          void saveNotes();
        }}
      >
        <textarea
          autoFocus
          className="initiative-markdown-editor"
          value={notes}
          disabled={busy}
          rows={10}
          onChange={(event) => setNotes(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void saveNotes();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setNotes(props.task.notes ?? "");
              setEditing(false);
            }
          }}
        />
        <div className="form-actions">
          <button
            type="button"
            className="small-button"
            onClick={() => {
              setNotes(props.task.notes ?? "");
              setEditing(false);
            }}
            disabled={busy}
          >
            Abbrechen
          </button>
          <button className="primary-action compact" type="submit" disabled={busy}>
            Speichern
          </button>
        </div>
      </form>
    );
  }

  return (
    <button type="button" className="panel task-notes-panel" onClick={() => setEditing(true)} title="Notizen bearbeiten">
      {props.task.notes ? <RichText text={props.task.notes} /> : null}
    </button>
  );
}

function TasksView(props: {
  tasks: Task[];
  initiatives: Initiative[];
  onToggleTaskStatus: (task: Task) => Promise<void>;
  onDeleteTask?: (task: Task) => Promise<void>;
  onOpenTask?: (taskId: number) => void;
  onReorderTasks?: (taskIds: number[]) => void;
  showInitiativeName?: boolean;
  groupByCompletionStatus?: boolean;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [taskDropId, setTaskDropId] = useState<number | null>(null);
  const initiativeById = new Map(props.initiatives.map((project) => [project.id, project]));
  const visibleTasks = props.groupByCompletionStatus ? sortTasksByCompletionAndRank(props.tasks) : props.tasks;
  const taskIds = visibleTasks.map((task) => task.id);
  const showInitiativeName = props.showInitiativeName ?? true;
  const confirmDeleteTask = (task: Task) => {
    if (!props.onDeleteTask) return;
    const confirmed = window.confirm(
      [
        `Bist du sicher, dass du die Aufgabe „${task.title}“ löschen möchtest?`,
        "",
        "Beim Löschen werden ebenfalls entfernt:",
        "- Beschreibung (Description)",
        "- Checkliste (falls vorhanden)",
        "- angehängte Medien (z. B. Bilder, Videos)"
      ].join("\n")
    );
    if (confirmed) {
      void props.onDeleteTask(task);
    }
  };
  return (
    <section className="task-list">
      {visibleTasks.map((task) => (
        <article
          className={`task-row ${task.status} ${props.onOpenTask ? "clickable" : ""} ${props.onReorderTasks ? "draggable-row" : ""} ${draggedTaskId === task.id ? "dragging" : ""} ${taskDropId === task.id ? "drag-over" : ""}`}
          key={task.id}
          draggable={Boolean(props.onReorderTasks)}
          onClick={() => props.onOpenTask?.(task.id)}
          onDragStart={(event) => {
            if (!props.onReorderTasks) return;
            event.dataTransfer.effectAllowed = "move";
            setDraggedTaskId(task.id);
          }}
          onDragOver={(event) => {
            if (!props.onReorderTasks || !draggedTaskId) return;
            event.preventDefault();
            setTaskDropId(task.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!props.onReorderTasks || !draggedTaskId) return;
            props.onReorderTasks(moveIdToDropPosition(taskIds, draggedTaskId, task.id, dropAfter(event)));
            setDraggedTaskId(null);
            setTaskDropId(null);
          }}
          onDragEnd={() => {
            setDraggedTaskId(null);
            setTaskDropId(null);
          }}
        >
          <button
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              void props.onToggleTaskStatus(task);
            }}
            title={task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
          >
            {task.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </button>
          <div>
            <h2>{task.title}</h2>
            {showInitiativeName || task.dueAt ? (
              <p className="task-row-meta">
                {showInitiativeName ? (
                  <span>{initiativeById.get(task.initiativeId) ? displayInitiativeName(initiativeById.get(task.initiativeId)!) : `Initiative ${task.initiativeId}`}</span>
                ) : null}
                {task.dueAt ? (
                  <span className="task-due-pill" title="Due Date">
                    <CalendarDays size={13} />
                    Fällig {formatTaskDueDate(task.dueAt)}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <span className={`priority ${task.priority}`}>{task.priority}</span>
          {props.onDeleteTask ? (
            <button
              type="button"
              className="icon-button subtle-danger task-delete-button"
              title="Aufgabe löschen"
              onClick={(event) => {
                event.stopPropagation();
                confirmDeleteTask(task);
              }}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}

function sortTasksByCompletionAndRank(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const statusCompare = taskCompletionRank(a.status) - taskCompletionRank(b.status);
    return statusCompare || a.sortOrder - b.sortOrder || a.id - b.id;
  });
}

function taskCompletionRank(status: Task["status"]): number {
  return status === "done" ? 1 : 0;
}

function TaskCreateInlineForm(props: { onCreateTask: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className="task-create-inline-button"
        onClick={() => {
          setOpen(true);
          setTitle("");
        }}
        title="Massnahme hinzufuegen"
        aria-label="Massnahme hinzufuegen"
      >
        <Plus size={17} />
      </button>
    );
  }

  return (
    <form
      className="task-create-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || creating) return;
        setCreating(true);
        try {
          await props.onCreateTask(trimmedTitle);
          setTitle("");
          setOpen(false);
        } finally {
          setCreating(false);
        }
      }}
    >
      <input
        autoFocus
        value={title}
        disabled={creating}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setTitle("");
            setOpen(false);
          }
        }}
        placeholder="Neue Massnahme"
        aria-label="Neue Massnahme"
      />
      <button type="submit" className="icon-button confirm" disabled={!title.trim() || creating} title="Anlegen" aria-label="Anlegen">
        <Plus size={17} />
      </button>
      <button
        type="button"
        className="icon-button danger"
        disabled={creating}
        onClick={() => {
          setTitle("");
          setOpen(false);
        }}
        title="Abbrechen"
        aria-label="Abbrechen"
      >
        <X size={17} />
      </button>
    </form>
  );
}

function PromptTemplatesView(props: {
  templates: PromptTemplateDefinition[];
  onRefresh: () => void;
}) {
  const [openTemplateId, setOpenTemplateId] = useState<string | null>(null);

  return (
    <section className="prompt-template-view">
      <div className="prompt-toolbar">
        <div>
          <span className="eyebrow">Agent Context</span>
          <h2>Prompt-Vorlagen</h2>
        </div>
        <button className="small-button" onClick={props.onRefresh}>
          Refresh
        </button>
      </div>

      <div className="prompt-template-list">
        {props.templates.map((template) => {
          const open = openTemplateId === template.id;
          return (
            <section className={`prompt-template-row panel ${open ? "open" : ""}`} key={template.id}>
              <button
                type="button"
                className="prompt-template-trigger"
                aria-expanded={open}
                onClick={() => setOpenTemplateId((current) => current === template.id ? null : template.id)}
              >
                <div>
                  <h3>{template.name}</h3>
                  <p>{template.route}</p>
              </div>
              <div className="prompt-template-row-meta">
                <span>{template.displayContext ?? template.effectiveContext}</span>
                <ChevronDown className="prompt-template-chevron" size={18} aria-hidden="true" />
              </div>
              </button>
              {open ? (
                <div className="prompt-template-detail">
                  <PromptSection title="System / Instructions" text={template.systemInstructions} />
                  <PromptSection title="Kontextdaten Template" text={template.contextDataTemplate} />
                  <PromptSection title="Finaler Prompt Template" text={template.finalPromptTemplate} emphasis />
                </div>
              ) : null}
            </section>
          );
        })}
        {props.templates.length === 0 ? <EmptyState title="Keine Prompt-Vorlagen geladen." /> : null}
      </div>
    </section>
  );
}

function PromptInspectorView(props: {
  prompts: AppPromptLog[];
  selectedPromptId: number | null;
  onSelectPrompt: (id: number) => void;
  onRefresh: () => void;
}) {
  const selected = props.prompts.find((prompt) => prompt.id === props.selectedPromptId) ?? props.prompts.at(-1) ?? null;

  return (
    <section className="prompt-inspector">
      <div className="prompt-toolbar">
        <div>
          <span className="eyebrow">Debug</span>
          <h2>Prompt Inspector</h2>
        </div>
        <button className="small-button" onClick={props.onRefresh}>
          Refresh
        </button>
      </div>

      <div className="prompt-inspector-layout">
        <aside className="prompt-log-list">
          {props.prompts.map((prompt) => (
            <button
              key={prompt.id}
              className={`prompt-log-row ${selected?.id === prompt.id ? "active" : ""}`}
              onClick={() => props.onSelectPrompt(prompt.id)}
            >
              <strong>Prompt #{prompt.id}</strong>
              <span>{formatPromptTimestamp(prompt.createdAt)}</span>
              <small>
                {prompt.contextType}
                {prompt.contextEntityId ? ` #${prompt.contextEntityId}` : ""} · conversation {prompt.conversationId ?? "none"}
              </small>
            </button>
          ))}
          {props.prompts.length === 0 ? <EmptyState title="Noch keine OpenClaw-Prompts geloggt." /> : null}
        </aside>

        <div className="prompt-detail">
          {!selected ? (
            <EmptyState title="Kein Prompt ausgewählt." />
          ) : (
            <>
              <div className="prompt-meta panel">
                <div>
                  <span>Zeitpunkt</span>
                  <strong>{formatPromptTimestamp(selected.createdAt)}</strong>
                </div>
                <div>
                  <span>Kontext</span>
                  <strong>
                    {selected.contextType}
                    {selected.contextEntityId ? ` #${selected.contextEntityId}` : ""}
                  </strong>
                </div>
                <div>
                  <span>Conversation</span>
                  <strong>{selected.conversationId ?? "none"}</strong>
                </div>
                <div>
                  <span>OpenClaw Session</span>
                  <strong>{selected.openClawSessionId}</strong>
                </div>
                <button
                  className="small-button prompt-copy-button"
                  onClick={() => void navigator.clipboard.writeText(selected.finalPrompt)}
                  title="Finalen Prompt kopieren"
                >
                  <Copy size={15} />
                  Copy Final
                </button>
              </div>

              {selected.turnTrace ? <TurnTracePanel trace={selected.turnTrace} /> : null}
              <PromptSection title="User Input" text={selected.userInput} />
              <PromptSection title="System / Instructions" text={selected.systemInstructions} />
              <PromptSection title="Kontextdaten" text={selected.contextData} />
              <PromptSection title="Memory / Historie" text={selected.memoryHistory} />
              <PromptSection title="Tools / Funktionen" text={selected.tools} />
              <PromptSection title="Finaler Prompt" text={selected.finalPrompt} emphasis />
            </>
          )}
        </div>
      </div>
    </section>
  );
}

function TurnTracePanel({ trace }: { trace: AppPromptLog["turnTrace"] }) {
  if (!trace) {
    return null;
  }

  const latestRun = trace.openClaw?.runs.at(-1) ?? null;
  return (
    <section className="prompt-section turn-trace-panel">
      <div className="turn-trace-heading">
        <h3>Turn Timeline</h3>
        <span>{trace.totalMs !== null ? formatDuration(trace.totalMs) : "läuft"}</span>
      </div>
      <p className="turn-trace-id">{trace.traceId}</p>
      {latestRun ? (
        <div className="turn-trace-summary">
          <div>
            <span>Vor OpenClaw Session</span>
            <strong>{formatNullableDuration(latestRun.preSessionDelayMs)}</strong>
          </div>
          <div>
            <span>Session bis Model Done</span>
            <strong>{formatNullableDuration(latestRun.sessionToModelCompletedMs)}</strong>
          </div>
          <div>
            <span>Tools</span>
            <strong>{latestRun.toolCount ?? "n/a"}</strong>
          </div>
          <div>
            <span>Tokens</span>
            <strong>{formatUsageTotal(latestRun.usage)}</strong>
          </div>
        </div>
      ) : null}
      <ol className="turn-trace-events">
        {trace.events.map((event, index) => (
          <li key={`${event.label}-${index}`}>
            <span>{formatDuration(event.msFromStart)}</span>
            <strong>{event.label}</strong>
            {event.detail ? <small>{formatTraceDetail(event.detail)}</small> : null}
          </li>
        ))}
      </ol>
      {trace.openClaw?.runs.length ? (
        <ol className="turn-trace-events openclaw-runs">
          {trace.openClaw.runs.map((run) => (
            <li key={run.runId}>
              <span>{formatNullableDuration(run.preSessionDelayMs)}</span>
              <strong>openclaw.session.started</strong>
              <small>
                model {formatNullableDuration(run.sessionToModelCompletedMs)} · total {formatNullableDuration(run.sessionToEndedMs)}
              </small>
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}

function PromptSection({ title, text, emphasis = false }: { title: string; text: string; emphasis?: boolean }) {
  return (
    <section className={`prompt-section ${emphasis ? "emphasis" : ""}`}>
      <h3>{title}</h3>
      <pre>{text || "—"}</pre>
    </section>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) {
    return `${ms}ms`;
  }
  return `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function formatNullableDuration(ms: number | null): string {
  return ms === null ? "n/a" : formatDuration(ms);
}

function formatUsageTotal(usage: Record<string, unknown> | null): string {
  const total = usage?.total;
  return typeof total === "number" ? total.toLocaleString("de-DE") : "n/a";
}

function formatTraceDetail(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([key, value]) => `${key}: ${typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? String(value) : JSON.stringify(value)}`)
    .join(" · ");
}

function formatPromptTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function OnboardingView({ onCreateCategory, onNavigate }: { onCreateCategory: (name: string) => Promise<void>; onNavigate: (path: string) => void }) {
  const [busyCategory, setBusyCategory] = useState<string | null>(null);
  const starterCategories = ["Business", "Reisen", "Health & Fitness", "Family", "Learning", "Soul"];

  return (
    <section className="onboarding">
      <div>
        <span className="eyebrow">Fresh start</span>
        <h2>Baue dein d-max Memory von null auf.</h2>
        <p>Starte mit Kategorien oder Drive Mode. Projekte und Tasks entstehen weiter ueber d-max im passenden Kontext.</p>
      </div>
      <div className="quick-actions">
        <button className="secondary-action" onClick={() => onNavigate("/drive")}>
          <Mic size={18} />
          Drive Mode
        </button>
      </div>
      <div className="category-chips">
        {starterCategories.map((name) => (
          <button
            key={name}
            className="chip-button"
            disabled={busyCategory === name}
            onClick={async () => {
              setBusyCategory(name);
              try {
                await onCreateCategory(name);
              } finally {
                setBusyCategory(null);
              }
            }}
          >
            {busyCategory === name ? "Adding..." : name}
          </button>
        ))}
      </div>
    </section>
  );
}

function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/).map((block) => block.trim()).filter(Boolean);

  return (
    <div className="rich-text">
      {blocks.map((block, index) => {
        const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
        if (lines.length > 1 && /^#{1,3}\s+/.test(lines[0])) {
          return (
            <section className="rich-section" key={index}>
              <h4>{lines[0].replace(/^#{1,3}\s+/, "")}</h4>
              <RichText text={lines.slice(1).join("\n")} />
            </section>
          );
        }
        if (lines.length === 1 && /^#{1,3}\s+/.test(lines[0])) {
          return <h4 key={index}>{lines[0].replace(/^#{1,3}\s+/, "")}</h4>;
        }
        const ordered = lines.every((line) => /^\d+\.\s+/.test(line));
        const unordered = lines.every((line) => /^[-*]\s+/.test(line));
        if (ordered || unordered) {
          const Tag = ordered ? "ol" : "ul";
          return (
            <Tag key={index}>
              {lines.map((line) => (
                <li key={line}>{renderInlineMarkup(line.replace(/^\d+\.\s+|^[-*]\s+/, ""))}</li>
              ))}
            </Tag>
          );
        }
        return <p key={index}>{renderInlineMarkup(block)}</p>;
      })}
    </div>
  );
}

function renderInlineMarkup(text: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  const pattern = /(\*\*([^*]+)\*\*|\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)|(https?:\/\/[^\s)<]+))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      nodes.push(text.slice(lastIndex, match.index));
    }

    if (match[2]) {
      nodes.push(<strong key={`${match.index}-strong`}>{match[2]}</strong>);
    } else {
      const label = match[3] ?? match[5];
      const href = match[4] ?? match[5];
      nodes.push(
        <a key={`${match.index}-link`} href={href} target="_blank" rel="noreferrer">
          {label}
        </a>
      );
    }
    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes.length ? nodes : [text];
}

function ActivityTrail({ activities }: { activities: ChatActivity[] }) {
  return (
    <div className="activity-trail">
      {activities.map((activity) => {
        const detail = activity.detail ? formatActivityDetail(activity.detail) : null;
        return (
          <div key={activity.id} className={`activity-item ${activity.status}`}>
            <span className="activity-dot" />
            <div>
              <strong>{activity.title}</strong>
              {detail ? <p>{renderInlineMarkup(detail)}</p> : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function formatActivityDetail(detail: string): string {
  const compact = detail.replace(/\s+/g, " ").trim();
  if (compact.length <= 220) {
    return compact;
  }

  return `${compact.slice(0, 217).trimEnd()}...`;
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h3>{title}</h3>
      {children}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="metric">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EmptyState({ title }: { title: string }) {
  return <div className="empty-state">{title}</div>;
}

function titleForView(view: View): string {
  return {
    drive: "Drive Mode",
    lifeAreas: "Lebensbereiche",
    lifeArea: "Lebensbereich",
    calendar: "Kalender",
    timeline: "Timeline",
    planningCanvas: "Planning Canvas",
    config: "Config",
    ideas: "Ideen",
    projects: "Projekte",
    habits: "Gewohnheiten",
    initiative: "Eintrag",
    task: "Massnahme",
    prompts: "Prompt Inspector",
    promptTemplates: "Prompt-Vorlagen",
    tasks: "Massnahmen"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    drive: "Realtime voice surface; LiveKit connection comes next.",
    lifeAreas: "",
    lifeArea: "Beschreibung, Kontext und Initiatives.",
    calendar: "",
    timeline: "Aktive Projekte entlang der Zeitachse.",
    planningCanvas: "",
    config: "Integrationen und Systemkonfiguration.",
    ideas: "",
    projects: "",
    habits: "",
    initiative: "Memory, Massnahmen und Kontext.",
    task: "Status, Prioritaet, Notizen und Kontext.",
    prompts: "Debug view for d-max prompts sent to OpenClaw.",
    promptTemplates: "Kontextabhängige Vorlagen für DMAX und OpenClaw.",
    tasks: "Konkrete Massnahmen ueber aktive Eintraege hinweg."
  }[view];
}

function firstMarkdownLine(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean) ?? "No initiative memory yet";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 100 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function formatMediaTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function documentExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
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

function formatInitiativeDateRangeForUi(project: Pick<Initiative, "startDate" | "endDate">): string | null {
  if (project.startDate && project.endDate) {
    return `${formatDateOnly(project.startDate)} - ${formatDateOnly(project.endDate)}`;
  }
  if (project.startDate) {
    return `ab ${formatDateOnly(project.startDate)}`;
  }
  if (project.endDate) {
    return `bis ${formatDateOnly(project.endDate)}`;
  }
  return null;
}

const PLANNING_CANVAS_MONTH_COUNT = 10;
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
  left: number;
  width: number;
  top: number;
  color: string;
  textColor: string;
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

function planningCanvasRange(defaultStartDate: string | null, monthCount: number): PlanningCanvasRange {
  const start = defaultStartDate ? parseDateOnlyUtc(defaultStartDate) ?? startOfUtcDay(new Date()) : startOfUtcDay(new Date());
  const firstMonth = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));
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

function visibleTimelineRange(today: Date, monthsAhead: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthsAhead + 1, 0));
  return { start, end };
}

function buildTimelineMonths(start: Date, end: Date): Array<{ key: string; left: number; width: number; label: string }> {
  const totalDays = daysBetween(start, end) + 1;
  const months: Array<{ key: string; left: number; width: number; label: string }> = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (cursor <= end) {
    const monthStart = cursor < start ? start : cursor;
    const monthEndCandidate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const monthEnd = monthEndCandidate > end ? end : monthEndCandidate;
    months.push({
      key: `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}`,
      left: dateOffsetPercent(monthStart, start, totalDays) ?? 0,
      width: ((daysBetween(monthStart, monthEnd) + 1) / totalDays) * 100,
      label: cursor.toLocaleDateString("de-DE", { month: "short", year: "numeric", timeZone: "UTC" })
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return months;
}

function buildTimelineWeeks(start: Date, end: Date): Array<{ key: string; left: number; label: string }> {
  const totalDays = daysBetween(start, end) + 1;
  const firstMonday = new Date(start);
  const day = firstMonday.getUTCDay();
  const daysUntilMonday = (8 - day) % 7;
  firstMonday.setUTCDate(firstMonday.getUTCDate() + daysUntilMonday);

  const weeks: Array<{ key: string; left: number; label: string }> = [];
  for (let cursor = firstMonday; cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 7))) {
    weeks.push({
      key: cursor.toISOString().slice(0, 10),
      left: dateOffsetPercent(cursor, start, totalDays) ?? 0,
      label: String(cursor.getUTCDate())
    });
  }

  return weeks;
}

function dateOffsetPercent(date: Date, start: Date, totalDays: number): number | null {
  if (date < start || totalDays <= 0) {
    return null;
  }

  return (daysBetween(start, date) / totalDays) * 100;
}

function parseDateOnlyUtc(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function formatTimelineRange(start: Date, end: Date): string {
  return `${start.toLocaleDateString("de-DE", { month: "short", year: "numeric", timeZone: "UTC" })} - ${end.toLocaleDateString("de-DE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  })}`;
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function formatTaskDueDate(value: string): string {
  return formatDateOnly(datePart(value));
}

function calendarVisibleRange(anchorDate: string, mode: CalendarMode): { start: string; end: string } {
  if (mode === "day") {
    return { start: anchorDate, end: anchorDate };
  }
  const date = parseDateOnlyUtc(anchorDate) ?? startOfUtcDay(new Date());
  const day = date.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() + mondayOffset));
  const sunday = new Date(Date.UTC(monday.getUTCFullYear(), monday.getUTCMonth(), monday.getUTCDate() + 6));
  return { start: dateOnlyFromUtc(monday), end: dateOnlyFromUtc(sunday) };
}

function daysInRange(start: string, end: string): string[] {
  const startDate = parseDateOnlyUtc(start);
  const endDate = parseDateOnlyUtc(end);
  if (!startDate || !endDate) return [];
  const days: string[] = [];
  for (let cursor = startDate; cursor <= endDate; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 1))) {
    days.push(dateOnlyFromUtc(cursor));
  }
  return days;
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

function dateTimeFromMinutes(date: string, minutes: number): string {
  const parsed = parseDateOnlyUtc(date) ?? startOfUtcDay(new Date());
  const next = new Date(Date.UTC(parsed.getUTCFullYear(), parsed.getUTCMonth(), parsed.getUTCDate(), 0, minutes));
  return `${dateOnlyFromUtc(next)}T${String(next.getUTCHours()).padStart(2, "0")}:${String(next.getUTCMinutes()).padStart(2, "0")}:00.000`;
}

function minutesFromDateTime(value: string): number {
  const time = value.includes("T") ? value.split("T")[1] ?? "00:00" : "00:00";
  const [hour, minute] = time.split(":").map(Number);
  return (hour || 0) * 60 + (minute || 0);
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

function durationMinutesBetween(startAt: string, endAt: string): number {
  const startDate = parseDateOnlyUtc(datePart(startAt));
  const endDate = parseDateOnlyUtc(datePart(endAt));
  const dayDelta = startDate && endDate ? daysBetween(startDate, endDate) : 0;
  return dayDelta * 1440 + minutesFromDateTime(endAt) - minutesFromDateTime(startAt);
}

function normalizeGoogleColor(color: string | null): string | null {
  return color && /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function formatCalendarDayName(date: string): string {
  const parsed = parseDateOnlyUtc(date);
  return parsed ? parsed.toLocaleDateString("de-DE", { weekday: "short", timeZone: "UTC" }) : date;
}

function formatCalendarRange(days: string[]): string {
  if (days.length === 0) return "";
  if (days.length === 1) return formatDateOnly(days[0]!);
  return `${formatDateOnly(days[0]!)} - ${formatDateOnly(days.at(-1)!)}`;
}

function formatDateTimeForUi(value: string): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short" });
}

function timeFromMinutes(minutes: number): string {
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

function formatTimeRange(startAt: string, endAt: string): string {
  return `${timeFromMinutes(minutesFromDateTime(startAt))}-${timeFromMinutes(minutesFromDateTime(endAt))}`;
}

function startAudioMeter(stream: MediaStream, ref: MutableRefObject<AudioMeterHandle | null>, setLevel: (level: number) => void): void {
  stopAudioMeter(ref);

  const context = new AudioContext();
  const source = context.createMediaStreamSource(stream);
  const analyser = context.createAnalyser();
  analyser.fftSize = 512;
  source.connect(analyser);

  const data = new Uint8Array(analyser.frequencyBinCount);

  const tick = () => {
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) {
      const centered = value - 128;
      sum += centered * centered;
    }
    const rms = Math.sqrt(sum / data.length) / 42;
    const nextLevel = Math.min(1, Math.max(0, rms));
    const previous = Number((analyser as AnalyserNode & { dmaxLevel?: number }).dmaxLevel ?? 0);
    const smoothed = nextLevel > previous ? previous * 0.18 + nextLevel * 0.82 : previous * 0.7 + nextLevel * 0.3;
    (analyser as AnalyserNode & { dmaxLevel?: number }).dmaxLevel = smoothed;
    setLevel(smoothed);
    const current = ref.current;
    if (current) {
      current.raf = requestAnimationFrame(tick);
    }
  };

  ref.current = {
    context,
    source,
    analyser,
    raf: requestAnimationFrame(tick)
  };
}

function stopAudioMeter(ref: MutableRefObject<AudioMeterHandle | null>): void {
  const current = ref.current;
  if (!current) {
    return;
  }

  cancelAnimationFrame(current.raf);
  current.source.disconnect();
  void current.context.close();
  ref.current = null;
}
