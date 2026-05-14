import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  PointerEvent as ReactPointerEvent,
  FocusEvent as ReactFocusEvent,
  ReactNode,
  WheelEvent as ReactWheelEvent
} from "react";
import {
  Blocks,
  Building2,
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
  Eye,
  EyeOff,
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
  Users,
  X,
  ZoomIn,
  ZoomOut
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import {
  classifyPlanningCanvasSpecialGoogleEvent
} from "./planning-canvas-special-google-events.js";
import type {
  PlanningCanvasSpecialGoogleEventMatch
} from "./planning-canvas-special-google-events.js";
import {
  createCategory,
  createOrganization,
  createPerson,
  createPartyRelationship,
  createEntityParticipant,
  createGoogleEventFromDmax,
  createGoogleOnlyEvent,
  createGoogleCalendarAuthUrl,
  createCalendarSource,
  createChatConversation,
  createInitiative,
  createInitiativeRelation,
  createPlanningCanvasNode,
  createTask,
  createTaskChecklistItem,
  createPartyContactPoint,
  createPartyAddress,
  createVoiceSession,
  deleteInitiativeRelation,
  deleteEntityParticipant,
  deletePartyContactPoint,
  deletePartyAddress,
  deleteTask,
  deleteMediaAttachment,
  deleteTaskChecklistItem,
  disconnectGoogleCalendar,
  fetchCalendarView,
  fetchChatActivity,
  fetchChatConversations,
  fetchChatMessages,
  fetchCalendarSources,
  fetchGoogleCalendarAccounts,
  fetchGoogleCalendars,
  fetchGoogleCalendarAuthStatus,
  fetchHiddenCalendarEvents,
  fetchInitiativeGraph,
  fetchOpenClawStatus,
  fetchOverview,
  fetchInitiatives,
  fetchPlanningCanvas,
  fetchPromptLogs,
  fetchPromptTemplates,
  fetchInitiativeDetail,
  fetchOrganizations,
  fetchOrganizationDetail,
  fetchParticipantRoleTypes,
  fetchPeople,
  fetchPersonDetail,
  fetchRelationshipTypes,
  fetchTaskDetail,
  generateChatMessageAudio,
  prewarmOpenClaw,
  reanalyzeMediaAsset,
  reorderCategories,
  reorderInitiatives,
  reorderMediaAttachments,
  reorderTaskChecklistItems,
  reorderTasks,
  subscribeStateEvents,
  streamChatMessage,
  hideCalendarEvent,
  transcribeVoiceMessage,
  updateCalendarSource,
  updateCategory,
  updateOrganization,
  updatePartyContactPoint,
  updatePartyAddress,
  updatePerson,
  updateInitiative,
  updateGoogleOnlyEvent,
  updateMediaAssetAnalysis,
  updateMediaAttachment,
  updatePlanningCanvasNode,
  updateTask,
  updateTaskChecklistItem,
  updateTaskStatus,
  unhideCalendarEvent,
  unlinkCalendarBinding,
  uploadMediaAttachment
} from "./api.js";
import {
  ConfirmModal,
  DescriptionBlock,
  EditModal,
  EmptyState,
  EntityDetailPage,
  EntityHeader,
  EntityList,
  EntityListItem,
  EntityListPage,
  ErrorState,
  InlineEditableText,
  MetadataGrid,
  RelationGroup,
  RelationItem,
  RelationList,
  RichText,
  SectionBlock,
  handleModalEscape,
  renderInlineMarkup,
  useModalEscape
} from "./components/ui/index.js";
import { AddressBlock, ContactPointList } from "./components/party/index.js";
import type { AddressInput, ContactPointInput } from "./components/party/index.js";
import type {
  AppOverview,
  AppConversation,
  Category,
  CalendarViewEvent,
  CalendarEventVisibility,
  CalendarEventVisibilityHiddenScope,
  CalendarSource,
  ConversationContext,
  ContextPayload,
  ContextPayloadBlock,
  ContextPayloadDeduplication,
  ContextPayloadEntity,
  ContextPayloadOmittedEntity,
  GoogleCalendarAccountStatus,
  GoogleCalendarAuthStatus,
  GoogleCalendarListItem,
  ChatActivity,
  AppPromptLog,
  PersistedChatMessage,
  OpenClawStatus,
  Organization,
  OrganizationDetail,
  ParticipantRoleType,
  PartyRelationshipWithParties,
  Person,
  PersonDetail,
  RelationshipType,
  EntityParticipant,
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
  | "people"
  | "organizations"
  | CollectionView
  | "initiative"
  | "person"
  | "organization"
  | "tasks"
  | "task"
  | "promptTemplates"
  | "prompts";
type RouteState = {
  view: View;
  initiativeId: number | null;
  taskId: number | null;
  partyId?: number | null;
  categoryName: string | null;
};
type VoiceState = "idle" | "connecting" | "listening" | "speaking";
type ChatVoicePhase = "idle" | "recording" | "transcribing";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: "text" | "voice";
  audioGenerationStatus?: PersistedChatMessage["audioGenerationStatus"];
  audioProvider?: string | null;
  audioError?: string | null;
  audioUrl?: string | null;
  audioMimeType?: string | null;
  audioDurationMs?: number | null;
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

type NavItem = { id: Exclude<View, "initiative" | "task">; label: string; icon: typeof Mic; path: string };

const primaryNavItems: NavItem[] = [
  { id: "lifeAreas", label: "Lebensbereiche", icon: LayoutGrid, path: "/categories" },
  { id: "ideas", label: "Ideen", icon: Lightbulb, path: "/ideas" },
  { id: "projects", label: "Projekte", icon: Blocks, path: "/projects" },
  { id: "habits", label: "Gewohnheiten", icon: Repeat2, path: "/habits" },
  { id: "tasks", label: "Massnahmen", icon: ClipboardList, path: "/tasks" },
  { id: "people", label: "Personen", icon: Users, path: "/people" },
  { id: "organizations", label: "Organisationen", icon: Building2, path: "/organizations" },
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
  const personMatch = pathname.match(/^\/people\/(\d+)$/);
  if (personMatch) {
    return { view: "person", initiativeId: null, taskId: null, partyId: Number(personMatch[1]), categoryName: null };
  }
  const organizationMatch = pathname.match(/^\/organizations\/(\d+)$/);
  if (organizationMatch) {
    return { view: "organization", initiativeId: null, taskId: null, partyId: Number(organizationMatch[1]), categoryName: null };
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
  if (pathname === "/people") return { view: "people", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/organizations") return { view: "organizations", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/config") return { view: "config", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/prompt-vorlagen") return { view: "promptTemplates", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/prompts") return { view: "prompts", initiativeId: null, taskId: null, categoryName: null };
  return { view: "lifeAreas", initiativeId: null, taskId: null, categoryName: null };
}

function pathForRoute(view: View, initiativeId?: number | null): string {
  if (view === "initiative") return `/initiatives/${initiativeId}`;
  if (view === "task") return "/tasks";
  if (view === "person") return "/people";
  if (view === "organization") return "/organizations";
  if (view === "lifeAreas") return "/categories";
  if (view === "calendar") return "/calendar";
  if (view === "timeline") return "/calendar/timeline";
  if (view === "planningCanvas") return "/planning-canvas";
  if (view === "config") return "/config";
  if (view === "promptTemplates") return "/prompt-vorlagen";
  if (view === "people") return "/people";
  if (view === "organizations") return "/organizations";
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
  taskDetail: TaskDetail | null,
  personDetail: PersonDetail | null,
  organizationDetail: OrganizationDetail | null
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

  if (route.view === "people" || route.view === "organizations") {
    return { context: { type: route.view }, label: titleForView(route.view) };
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

  if (route.view === "person" && route.partyId) {
    return {
      context: { type: "person", partyId: route.partyId },
      label: personDetail?.person.displayName ?? `Person ${route.partyId}`
    };
  }

  if (route.view === "organization" && route.partyId) {
    return {
      context: { type: "organization", partyId: route.partyId },
      label: organizationDetail?.organization.displayName ?? `Organisation ${route.partyId}`
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
    case "people":
    case "organizations":
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
    case "person":
    case "organization":
      return `${context.type}:${context.partyId}`;
  }
}

function contextualAgentErrorMessage(err: unknown): string {
  const message = err instanceof Error ? err.message : "";
  if (message.includes("contextEntityId is required")) {
    return "DMAX konnte den Kontext für diese Ansicht nicht öffnen. Der technische Kontext wurde nicht vollständig übergeben.";
  }
  if (message.includes("gateway") || message.includes("OpenClaw")) {
    return "DMAX ist gerade nicht erreichbar. Bitte versuche es gleich erneut.";
  }
  return "Der DMAX-Kontext konnte gerade nicht geladen werden.";
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
    source: message.source === "app_voice_message" ? "voice" : message.source === "app_text" ? "text" : undefined,
    audioGenerationStatus: message.audioGenerationStatus,
    audioProvider: message.audioProvider,
    audioError: message.audioError,
    audioUrl: message.audioAttachment?.asset.fileUrl ?? null,
    audioMimeType: message.audioAttachment?.asset.mimeType ?? null,
    audioDurationMs: message.audioAttachment?.asset.durationMs ?? null
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
  const [peopleList, setPeopleList] = useState<Person[] | null>(null);
  const [organizationList, setOrganizationList] = useState<Organization[] | null>(null);
  const [personDetail, setPersonDetail] = useState<PersonDetail | null>(null);
  const [personLoadError, setPersonLoadError] = useState<string | null>(null);
  const [organizationDetail, setOrganizationDetail] = useState<OrganizationDetail | null>(null);
  const [organizationLoadError, setOrganizationLoadError] = useState<string | null>(null);
  const [participantRoleTypes, setParticipantRoleTypes] = useState<ParticipantRoleType[]>([]);
  const [relationshipTypes, setRelationshipTypes] = useState<RelationshipType[]>([]);
  const [personCoreModalOpen, setPersonCoreModalOpen] = useState(false);
  const [organizationCoreModalOpen, setOrganizationCoreModalOpen] = useState(false);
  const [categoryCreateModalOpen, setCategoryCreateModalOpen] = useState(false);
  const [ideaCreateModalOpen, setIdeaCreateModalOpen] = useState(false);
  const [projectCreateModalOpen, setProjectCreateModalOpen] = useState(false);
  const [habitCreateModalOpen, setHabitCreateModalOpen] = useState(false);
  const [taskCreateModalOpen, setTaskCreateModalOpen] = useState(false);
  const [personCreateModalOpen, setPersonCreateModalOpen] = useState(false);
  const [organizationCreateModalOpen, setOrganizationCreateModalOpen] = useState(false);
  const [initiativeDetail, setInitiativeDetail] = useState<InitiativeDetail | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [taskLoadError, setTaskLoadError] = useState<string | null>(null);
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
  const shouldShowOnboarding =
    isEmptyState && view !== "lifeAreas" && view !== "people" && view !== "organizations" && view !== "person" && view !== "organization";
  const routeConversationContext = useMemo(
    () => getRouteConversationContext(route, overview, initiativeDetail, taskDetail, personDetail, organizationDetail),
    [route, overview, initiativeDetail, taskDetail, personDetail, organizationDetail]
  );
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
      if (source === "voice") {
        void generateAudioForAssistantReply(result.conversationId, messagesWithActivities);
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
          text: contextualAgentErrorMessage(err)
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

  async function generateAudioForAssistantReply(conversationId: number | null, messages: ChatMessage[]) {
    const assistant = [...messages]
      .reverse()
      .find((message) => message.role === "assistant" && message.audioGenerationStatus === "pending");
    const messageId = assistant ? Number(assistant.id) : NaN;
    if (!assistant || !Number.isFinite(messageId)) {
      return;
    }

    try {
      const updated = chatMessageFromPersisted(await generateChatMessageAudio(messageId));
      setChatMessages((current) => current.map((message) => (message.id === updated.id ? { ...updated, activities: message.activities } : message)));
    } catch {
      if (!conversationId) {
        setChatMessages((current) =>
          current.map((message) =>
            message.id === assistant.id
              ? { ...message, audioGenerationStatus: "failed", audioError: "Sprachantwort konnte nicht erzeugt werden." }
              : message
          )
        );
        return;
      }

      const nextMessages = await loadPersistedChatMessages(conversationId).catch(() => null);
      if (nextMessages) {
        setChatMessages((current) => attachActivitiesToLastAssistant(nextMessages, current.find((message) => message.activities?.length)?.activities ?? []));
      }
    }
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
    setAgentDrawer({
      open: true,
      context,
      label,
      conversationId: null,
      conversations: []
    });
    setChatMessages([]);
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
      setError(contextualAgentErrorMessage(err));
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
      setError(contextualAgentErrorMessage(err));
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
        setChatVoicePhase("idle");
        await submitChatMessage(transcript, "voice");
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

  async function refresh(options: { silentErrors?: boolean } = {}) {
    try {
      if (!options.silentErrors) {
        setError(null);
      }
      const data = await fetchOverview();
      setOverview(data);
    } catch (err) {
      if (!options.silentErrors) {
        setError(err instanceof Error ? err.message : "Failed to load d-max state.");
      }
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
      await Promise.all([
        fetchPeople().then(setPeopleList).catch(() => undefined),
        fetchOrganizations().then(setOrganizationList).catch(() => undefined)
      ]);
    }

    if (route.view === "task" && route.taskId) {
      await fetchTaskDetail(route.taskId)
        .then((detail) => {
          setTaskDetail(detail);
          setTaskLoadError(null);
        })
        .catch(() => {
          setTaskDetail(null);
          setTaskLoadError("Maßnahme nicht gefunden");
        });
      await Promise.all([
        fetchPeople().then(setPeopleList).catch(() => undefined),
        fetchOrganizations().then(setOrganizationList).catch(() => undefined)
      ]);
    }

    if (route.view === "people") {
      await fetchPeople().then(setPeopleList).catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load people."));
    }

    if (route.view === "organizations") {
      await fetchOrganizations()
        .then(setOrganizationList)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load organizations."));
    }

    if (route.view === "person" && route.partyId) {
      await fetchPersonDetail(route.partyId)
        .then((detail) => {
          setPersonDetail(detail);
          setPersonLoadError(null);
        })
        .catch(() => {
          setPersonDetail(null);
          setPersonLoadError("Person nicht gefunden");
        });
    }

    if (route.view === "organization" && route.partyId) {
      await fetchOrganizationDetail(route.partyId)
        .then(setOrganizationDetail)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load organization."));
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
      void refresh({ silentErrors: true });
    }, 5000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh({ silentErrors: true });
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
    void Promise.all([
      fetchPeople().then(setPeopleList).catch(() => undefined),
      fetchOrganizations().then(setOrganizationList).catch(() => undefined)
    ]);
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
      setTaskLoadError(null);
      return;
    }

    fetchTaskDetail(route.taskId)
      .then((detail) => {
        setTaskDetail(detail);
        setTaskLoadError(null);
      })
      .catch(() => {
        setTaskDetail(null);
        setTaskLoadError("Maßnahme nicht gefunden");
      });
    void Promise.all([
      fetchPeople().then(setPeopleList).catch(() => undefined),
      fetchOrganizations().then(setOrganizationList).catch(() => undefined)
    ]);
  }, [route]);

  useEffect(() => {
    if (route.view !== "people") {
      setPeopleList(null);
      return;
    }

    fetchPeople()
      .then(setPeopleList)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load people."));
  }, [route]);

  useEffect(() => {
    if (route.view !== "organizations") {
      setOrganizationList(null);
      return;
    }

    fetchOrganizations()
      .then(setOrganizationList)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load organizations."));
  }, [route]);

  useEffect(() => {
    if (route.view !== "person" || !route.partyId) {
      setPersonDetail(null);
      setPersonLoadError(null);
      setPersonCoreModalOpen(false);
      return;
    }

    setPersonCoreModalOpen(false);
    setPersonDetail(null);
    setPersonLoadError(null);
    fetchPersonDetail(route.partyId)
      .then(setPersonDetail)
      .catch(() => {
        setPersonDetail(null);
        setPersonLoadError("Person nicht gefunden");
      });
  }, [route]);

  useEffect(() => {
    if (route.view !== "organization" || !route.partyId) {
      setOrganizationDetail(null);
      setOrganizationLoadError(null);
      setOrganizationCoreModalOpen(false);
      return;
    }

    setOrganizationCoreModalOpen(false);
    setOrganizationDetail(null);
    setOrganizationLoadError(null);
    fetchOrganizationDetail(route.partyId)
      .then(setOrganizationDetail)
      .catch(() => {
        setOrganizationDetail(null);
        setOrganizationLoadError("Organisation nicht gefunden");
      });
    fetchPeople()
      .then(setPeopleList)
      .catch(() => undefined);
  }, [route]);

  useEffect(() => {
    fetchParticipantRoleTypes()
      .then(setParticipantRoleTypes)
      .catch(() => undefined);
    fetchRelationshipTypes()
      .then(setRelationshipTypes)
      .catch(() => undefined);
  }, []);

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
    if (view === "organizations") {
      return (
        <header className="topbar">
          <div>
            <h1>Organisationen</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="section-primary-action" onClick={() => setOrganizationCreateModalOpen(true)}>
              <Plus size={15} />
              Organisation hinzufügen
            </button>
          </div>
        </header>
      );
    }

    if (view === "people") {
      return (
        <header className="topbar">
          <div>
            <h1>Personen</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="section-primary-action" onClick={() => setPersonCreateModalOpen(true)}>
              <Plus size={15} />
              Person hinzufügen
            </button>
          </div>
        </header>
      );
    }

    if (view === "lifeAreas") {
      return (
        <header className="topbar">
          <div>
            <h1>Lebensbereiche</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="section-primary-action" onClick={() => setCategoryCreateModalOpen(true)}>
              <Plus size={15} />
              Lebensbereich hinzufügen
            </button>
          </div>
        </header>
      );
    }

    if (view === "ideas") {
      return (
        <header className="topbar">
          <div>
            {route.categoryName ? (
              <>
                <button className="topbar-title-link" onClick={() => navigate("/ideas")}>
                  Ideen
                </button>
                <p>{route.categoryName}</p>
              </>
            ) : (
              <h1>Ideen</h1>
            )}
          </div>
          <div className="topbar-actions">
            <button type="button" className="section-primary-action" onClick={() => setIdeaCreateModalOpen(true)}>
              <Plus size={15} />
              Idee hinzufügen
            </button>
          </div>
        </header>
      );
    }

    if (view === "projects") {
      return (
        <header className="topbar">
          <div>
            {route.categoryName ? (
              <>
                <button className="topbar-title-link" onClick={() => navigate("/projects")}>
                  Projekte
                </button>
                <p>{route.categoryName}</p>
              </>
            ) : (
              <h1>Projekte</h1>
            )}
          </div>
          <div className="topbar-actions">
            <button type="button" className="section-primary-action" onClick={() => setProjectCreateModalOpen(true)}>
              <Plus size={15} />
              Projekt hinzufügen
            </button>
          </div>
        </header>
      );
    }

    if (view === "habits") {
      return (
        <header className="topbar">
          <div>
            {route.categoryName ? (
              <>
                <button className="topbar-title-link" onClick={() => navigate("/habits")}>
                  Gewohnheiten
                </button>
                <p>{route.categoryName}</p>
              </>
            ) : (
              <h1>Gewohnheiten</h1>
            )}
          </div>
          <div className="topbar-actions">
            <button type="button" className="section-primary-action" onClick={() => setHabitCreateModalOpen(true)}>
              <Plus size={15} />
              Gewohnheit hinzufügen
            </button>
          </div>
        </header>
      );
    }

    if (view === "tasks") {
      return (
        <header className="topbar">
          <div>
            <h1>Maßnahmen</h1>
          </div>
          <div className="topbar-actions">
            <button type="button" className="section-primary-action" onClick={() => setTaskCreateModalOpen(true)}>
              <Plus size={15} />
              Maßnahme hinzufügen
            </button>
          </div>
        </header>
      );
    }

    if (view === "lifeArea") {
      const category = overview?.categories.find((candidate) => candidate.name.toLowerCase() === route.categoryName?.toLowerCase()) ?? null;
      const initiatives = category ? (lifeAreaInitiatives ?? overview?.initiatives ?? []).filter((initiative) => initiative.categoryId === category.id) : [];
      const tasks = category ? (overview?.tasks ?? []).filter((task) => initiatives.some((initiative) => initiative.id === task.initiativeId)) : [];
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button className="small-button back-button" onClick={() => navigate("/categories")}>
                Zurück zu Lebensbereichen
              </button>
            </div>
          </div>
          <EntityHeader
            titleContent={category ? (
              <InlineEditableText
                value={category.name}
                label="Name des Lebensbereichs"
                required
                className="entity-title-edit"
                onSave={async (value) => {
                  const nextName = value.trim();
                  if (!nextName || nextName === category.name) return;
                  await updateCategory(category.id, { name: nextName });
                  await refresh();
                  navigate(pathForLifeArea(nextName));
                }}
              />
            ) : undefined}
            title={category ? undefined : overview ? "Lebensbereich nicht gefunden" : "Lebensbereich"}
            subtitle={category ? null : overview ? null : "Wird geladen"}
            facts={category ? categoryHeaderFacts(category, initiatives, tasks) : []}
          />
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
            category={category ?? null}
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
      const taskHeader = taskLoadError ? (
        <EntityHeader
          title="Maßnahme nicht gefunden"
          subtitle="Die Maßnahme existiert nicht oder konnte nicht geladen werden."
        />
      ) : (
        <EntityHeader
          titleContent={(
            <TaskHeaderTitle
              task={task}
              onUpdateTask={async (taskId, input) => {
                await updateTask(taskId, input);
                await refresh();
                setTaskDetail(await fetchTaskDetail(taskId));
              }}
            />
          )}
          subtitle={task ? null : "Wird geladen"}
          facts={task ? taskHeaderFacts(task, async (taskId, input) => {
            await updateTask(taskId, input);
            await refresh();
            setTaskDetail(await fetchTaskDetail(taskId));
          }) : []}
        />
      );
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
          {taskHeader}
        </div>
      );
    }

    if (view === "person") {
      const person = personDetail?.person ?? null;
      const personHeader = personLoadError ? (
        <EntityHeader
          title="Person nicht gefunden"
          subtitle="Der Eintrag konnte nicht geladen werden."
        />
      ) : (
        <EntityHeader
          titleContent={(
            <InlineEditableText
              value={person?.displayName ?? "Person"}
              label="Personenname"
              required
              disabled={!person}
              className="entity-title-edit"
              onSave={async (value) => {
                if (!person) return;
                await updatePerson(person.id, { displayName: value });
                setPersonDetail(await fetchPersonDetail(person.id));
                setPeopleList(await fetchPeople());
              }}
            />
          )}
          subtitle={person ? personHeaderContext(person) : "Wird geladen"}
          secondaryActions={personDetail ? (
            <button
              type="button"
              className="small-button header-secondary-action"
              onClick={() => setPersonCoreModalOpen(true)}
              title="Stammdaten bearbeiten"
            >
              <Pencil size={15} />
              Stammdaten
            </button>
          ) : null}
        />
      );
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button className="small-button back-button" onClick={() => navigate("/people")}>
                Zurück zu Personen
              </button>
            </div>
          </div>
          {personHeader}
        </div>
      );
    }

    if (view === "organization") {
      const organization = organizationDetail?.organization ?? null;
      const organizationTypeLabel = organization?.organizationType?.trim() || "Organisation";
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button className="small-button back-button" onClick={() => navigate("/organizations")}>
                Zurück zu Organisationen
              </button>
            </div>
          </div>
          <EntityHeader
            titleContent={(
              <InlineEditableText
                value={organization?.displayName ?? "Organisation"}
                label="Organisationsname"
                required
                disabled={!organization}
                className="entity-title-edit"
                onSave={async (value) => {
                  if (!organization) return;
                  await updateOrganization(organization.id, { name: value });
                  setOrganizationDetail(await fetchOrganizationDetail(organization.id));
                  setOrganizationList(await fetchOrganizations());
                }}
              />
            )}
            subtitleContent={(
              <InlineEditableText
                value={organizationTypeLabel}
                label="Organisationstyp"
                disabled={!organization}
                className="entity-subtitle-edit"
                onSave={async (value) => {
                  if (!organization) return;
                  await updateOrganization(organization.id, { organizationType: value.trim() || null });
                  setOrganizationDetail(await fetchOrganizationDetail(organization.id));
                  setOrganizationList(await fetchOrganizations());
                }}
              />
            )}
            secondaryActions={organizationDetail ? (
              <button
                type="button"
                className="small-button header-secondary-action"
                onClick={() => setOrganizationCoreModalOpen(true)}
                title="Stammdaten bearbeiten"
              >
                <Pencil size={15} />
                Stammdaten
              </button>
            ) : null}
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
      className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""} ${agentDrawer.open ? "with-agent-drawer" : ""} ${view === "ideas" ? "ideas-route" : ""} ${view === "projects" ? "projects-route" : ""} ${view === "habits" ? "habits-route" : ""} ${view === "tasks" ? "tasks-route" : ""} ${view === "organizations" ? "organizations-route" : ""} ${view === "people" ? "people-route" : ""} ${view === "person" ? "person-route" : ""} ${view === "organization" ? "organization-route" : ""} ${view === "initiative" ? "initiative-route" : ""} ${view === "lifeArea" ? "life-area-route" : ""} ${view === "lifeAreas" ? "life-areas-route" : ""}`}
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

          {shouldShowOnboarding ? (
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
              tasks={overview.tasks}
              onOpenLifeArea={(categoryName) => navigate(pathForLifeArea(categoryName))}
            />
            ) : <EmptyState title="Lebensbereiche werden geladen" />
          )}
          {view === "lifeArea" && (
          <LifeAreaDetailView
            category={overview?.categories.find((category) => category.name.toLowerCase() === route.categoryName?.toLowerCase()) ?? null}
            initiatives={lifeAreaInitiatives ?? overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            onBack={() => navigate("/categories")}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
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
          {!isEmptyState && view === "ideas" && (
          <IdeasView
            categories={overview?.categories ?? []}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            categoryFilterName={route.categoryName}
            onOpenIdea={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onCreateClick={() => setIdeaCreateModalOpen(true)}
          />
          )}
          {!isEmptyState && view === "projects" && (
          <ProjectsView
            categories={overview?.categories ?? []}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            categoryFilterName={route.categoryName}
            onOpenProject={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onCreateClick={() => setProjectCreateModalOpen(true)}
          />
          )}
          {!isEmptyState && view === "habits" && (
          <HabitsView
            categories={overview?.categories ?? []}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            categoryFilterName={route.categoryName}
            onOpenHabit={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onCreateClick={() => setHabitCreateModalOpen(true)}
          />
          )}
          {!isEmptyState && isCollectionView(view) && view !== "ideas" && view !== "projects" && view !== "habits" && (
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
            people={peopleList ?? []}
            organizations={organizationList ?? []}
            participantRoleTypes={participantRoleTypes}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onCreateParticipant={async (input) => {
              await createEntityParticipant(input);
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onDeleteParticipant={async (participantId) => {
              await deleteEntityParticipant(participantId);
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
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
            loadError={taskLoadError}
            people={peopleList ?? []}
            organizations={organizationList ?? []}
            participantRoleTypes={participantRoleTypes}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onOpenCategory={(categoryName, initiativeType) => navigate(pathForCollectionCategory(collectionViewForInitiativeType(initiativeType), categoryName))}
            onCreateParticipant={async (input) => {
              await createEntityParticipant(input);
              if (route.taskId) setTaskDetail(await fetchTaskDetail(route.taskId));
            }}
            onDeleteParticipant={async (participantId) => {
              await deleteEntityParticipant(participantId);
              if (route.taskId) setTaskDetail(await fetchTaskDetail(route.taskId));
            }}
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
          <TasksListView
            tasks={overview?.tasks ?? []}
            initiatives={overview?.initiatives ?? []}
            categories={overview?.categories ?? []}
            onToggleTaskStatus={async (task) => {
              await updateTaskStatus(task.id, task.status === "done" ? "open" : "done");
              await refresh();
            }}
            onDeleteTask={async (task) => {
              await deleteTask(task.id);
              await refresh();
            }}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onCreateClick={() => setTaskCreateModalOpen(true)}
          />
          )}
          {view === "people" && (
          <PeopleView
            people={peopleList ?? []}
            onOpenPerson={(partyId) => navigate(`/people/${partyId}`)}
            onCreateClick={() => setPersonCreateModalOpen(true)}
          />
          )}
          {view === "organizations" && (
          <OrganizationsView
            organizations={organizationList ?? []}
            onOpenOrganization={(partyId) => navigate(`/organizations/${partyId}`)}
            onCreateClick={() => setOrganizationCreateModalOpen(true)}
          />
          )}
          {view === "person" && (
          <PersonDetailView
            detail={personDetail}
            loadError={personLoadError}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            coreModalOpen={personCoreModalOpen}
            onCloseCoreModal={() => setPersonCoreModalOpen(false)}
            onUpdatePerson={async (partyId, input) => {
              await updatePerson(partyId, input);
              setPersonDetail(await fetchPersonDetail(partyId));
              setPeopleList(await fetchPeople());
            }}
            onCreateContactPoint={async (partyId, input) => {
              await createPartyContactPoint({ partyId, ...input });
              setPersonDetail(await fetchPersonDetail(partyId));
            }}
            onUpdateContactPoint={async (contactPointId, input) => {
              await updatePartyContactPoint(contactPointId, input);
              if (route.partyId) setPersonDetail(await fetchPersonDetail(route.partyId));
            }}
            onDeleteContactPoint={async (contactPointId) => {
              await deletePartyContactPoint(contactPointId);
              if (route.partyId) setPersonDetail(await fetchPersonDetail(route.partyId));
            }}
            onCreateAddress={async (partyId, input) => {
              await createPartyAddress({ partyId, ...input });
              setPersonDetail(await fetchPersonDetail(partyId));
            }}
            onUpdateAddress={async (addressId, input) => {
              await updatePartyAddress(addressId, input);
              if (route.partyId) setPersonDetail(await fetchPersonDetail(route.partyId));
            }}
            onDeleteAddress={async (addressId) => {
              await deletePartyAddress(addressId);
              if (route.partyId) setPersonDetail(await fetchPersonDetail(route.partyId));
            }}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onOpenPerson={(partyId) => navigate(`/people/${partyId}`)}
            onOpenOrganization={(partyId) => navigate(`/organizations/${partyId}`)}
          />
          )}
          {view === "organization" && (
          <OrganizationDetailView
            detail={organizationDetail}
            loadError={organizationLoadError}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            people={peopleList ?? []}
            organizations={organizationList ?? []}
            relationshipTypes={relationshipTypes}
            coreModalOpen={organizationCoreModalOpen}
            onCloseCoreModal={() => setOrganizationCoreModalOpen(false)}
            onUpdateOrganization={async (partyId, input) => {
              await updateOrganization(partyId, input);
              setOrganizationDetail(await fetchOrganizationDetail(partyId));
              setOrganizationList(await fetchOrganizations());
            }}
            onCreateContactPoint={async (partyId, input) => {
              await createPartyContactPoint({ partyId, ...input });
              setOrganizationDetail(await fetchOrganizationDetail(partyId));
            }}
            onUpdateContactPoint={async (contactPointId, input) => {
              await updatePartyContactPoint(contactPointId, input);
              if (route.partyId) setOrganizationDetail(await fetchOrganizationDetail(route.partyId));
            }}
            onDeleteContactPoint={async (contactPointId) => {
              await deletePartyContactPoint(contactPointId);
              if (route.partyId) setOrganizationDetail(await fetchOrganizationDetail(route.partyId));
            }}
            onCreateAddress={async (partyId, input) => {
              await createPartyAddress({ partyId, ...input });
              setOrganizationDetail(await fetchOrganizationDetail(partyId));
            }}
            onUpdateAddress={async (addressId, input) => {
              await updatePartyAddress(addressId, input);
              if (route.partyId) setOrganizationDetail(await fetchOrganizationDetail(route.partyId));
            }}
            onDeleteAddress={async (addressId) => {
              await deletePartyAddress(addressId);
              if (route.partyId) setOrganizationDetail(await fetchOrganizationDetail(route.partyId));
            }}
            onCreateRelationship={async (input) => {
              await createPartyRelationship(input);
              if (route.partyId) setOrganizationDetail(await fetchOrganizationDetail(route.partyId));
            }}
            onCreateParticipant={async (input) => {
              await createEntityParticipant(input);
              if (route.partyId) setOrganizationDetail(await fetchOrganizationDetail(route.partyId));
            }}
            onOpenInitiative={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onOpenPerson={(partyId) => navigate(`/people/${partyId}`)}
            onOpenOrganization={(partyId) => navigate(`/organizations/${partyId}`)}
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
      {categoryCreateModalOpen ? (
        <CategoryCreateModal
          onCancel={() => setCategoryCreateModalOpen(false)}
          onCreate={async (input) => {
            const category = await createCategory(input);
            await refresh();
            setCategoryCreateModalOpen(false);
            navigate(pathForLifeArea(category.name));
          }}
        />
      ) : null}
      {ideaCreateModalOpen ? (
        <IdeaCreateModal
          categories={overview?.categories ?? []}
          categoryFilterName={route.view === "ideas" ? route.categoryName : null}
          onCancel={() => setIdeaCreateModalOpen(false)}
          onCreate={async (input) => {
            const initiative = await createInitiative(input);
            await refresh();
            setIdeaCreateModalOpen(false);
            navigate(`/initiatives/${initiative.id}`);
          }}
        />
      ) : null}
      {projectCreateModalOpen ? (
        <ProjectCreateModal
          categories={overview?.categories ?? []}
          categoryFilterName={route.view === "projects" ? route.categoryName : null}
          onCancel={() => setProjectCreateModalOpen(false)}
          onCreate={async (input) => {
            const initiative = await createInitiative(input);
            await refresh();
            setProjectCreateModalOpen(false);
            navigate(`/initiatives/${initiative.id}`);
          }}
        />
      ) : null}
      {habitCreateModalOpen ? (
        <HabitCreateModal
          categories={overview?.categories ?? []}
          categoryFilterName={route.view === "habits" ? route.categoryName : null}
          onCancel={() => setHabitCreateModalOpen(false)}
          onCreate={async (input) => {
            const initiative = await createInitiative(input);
            await refresh();
            setHabitCreateModalOpen(false);
            navigate(`/initiatives/${initiative.id}`);
          }}
        />
      ) : null}
      {taskCreateModalOpen ? (
        <TaskCreateModal
          initiatives={overview?.initiatives ?? []}
          onCancel={() => setTaskCreateModalOpen(false)}
          onCreate={async (input) => {
            const task = await createTask(input);
            await refresh();
            setTaskCreateModalOpen(false);
            navigate(`/tasks/${task.id}`);
          }}
        />
      ) : null}
      {personCreateModalOpen ? (
        <PersonCreateModal
          onCancel={() => setPersonCreateModalOpen(false)}
          onCreate={async (input) => {
            const person = await createPerson(input);
            setPeopleList(await fetchPeople());
            await refresh();
            setPersonCreateModalOpen(false);
            navigate(`/people/${person.id}`);
          }}
        />
      ) : null}
      {organizationCreateModalOpen ? (
        <OrganizationCreateModal
          onCancel={() => setOrganizationCreateModalOpen(false)}
          onCreate={async (input) => {
            const organization = await createOrganization(input);
            setOrganizationList(await fetchOrganizations());
            await refresh();
            setOrganizationCreateModalOpen(false);
            navigate(`/organizations/${organization.id}`);
          }}
        />
      ) : null}
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
    || (view === "task" && item.id === "tasks")
    || (view === "person" && item.id === "people")
    || (view === "organization" && item.id === "organizations");

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
            {message.role === "assistant" && hasChatAudioState(message) ? <ChatAudioPlayer message={message} /> : null}
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

function hasChatAudioState(message: ChatMessage): boolean {
  return Boolean(message.audioUrl || message.audioGenerationStatus === "pending" || message.audioGenerationStatus === "failed");
}

function ChatAudioPlayer(props: { message: ChatMessage }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((props.message.audioDurationMs ?? 0) / 1000);
  const status = props.message.audioGenerationStatus ?? "none";
  const canPlay = Boolean(props.message.audioUrl && status === "ready");
  const progress = duration > 0 ? Math.min(1, currentTime / duration) : 0;

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio || !canPlay) {
      return;
    }

    if (playing) {
      audio.pause();
      setPlaying(false);
      return;
    }

    try {
      await audio.play();
      setPlaying(true);
    } catch {
      setPlaying(false);
    }
  }

  if (status === "pending") {
    return (
      <div className="chat-audio-player pending">
        <VoiceProcessingIndicator />
        <span>Audio wird erzeugt</span>
      </div>
    );
  }

  if (status === "failed" && !props.message.audioUrl) {
    return <div className="chat-audio-player failed">Audio nicht verfügbar</div>;
  }

  if (!props.message.audioUrl) {
    return null;
  }

  return (
    <div className="chat-audio-player">
      <button type="button" className="icon-button" onClick={() => void togglePlayback()} disabled={!canPlay} title={playing ? "Pause" : "Abspielen"}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
      </button>
      <div className="chat-audio-progress" aria-hidden="true">
        <span style={{ width: `${progress * 100}%` }} />
      </div>
      <time>{formatAudioTime(currentTime)}{duration > 0 ? ` / ${formatAudioTime(duration)}` : ""}</time>
      <audio
        ref={audioRef}
        preload="metadata"
        src={props.message.audioUrl}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || duration)}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPause={() => setPlaying(false)}
        onEnded={() => {
          setPlaying(false);
          setCurrentTime(0);
        }}
      />
    </div>
  );
}

function formatAudioTime(seconds: number): string {
  const safeSeconds = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  return `${minutes}:${String(safeSeconds % 60).padStart(2, "0")}`;
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
        <div className="agent-context-title">
          <span>DMAX-Kontext</span>
          <strong>{props.label}</strong>
        </div>
        <div className="agent-drawer-actions">
          <button className="small-button" onClick={() => setShowOldChats((current) => !current)} disabled={props.conversations.length === 0}>
            Alte Chats
            {props.conversations.length > 0 ? ` (${props.conversations.length})` : ""}
          </button>
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

function taskPriorityLabel(priority: Task["priority"]): string {
  return taskPriorityOptions.find((option) => option.value === priority)?.label ?? priority;
}

function taskStatusLabel(status: Task["status"]): string {
  return status === "done" ? "Erledigt" : "Offen";
}

function initiativeTypeLabel(type: InitiativeType): string {
  return initiativeTypeOptions.find((option) => option.value === type)?.label ?? "Eintrag";
}

function initiativeStatusLabel(status: Initiative["status"]): string {
  return initiativeStatusOptions.find((option) => option.value === status)?.label ?? status;
}

function projectPhaseLabel(phase: ProjectPhase): string {
  return projectPhaseOptions.find((option) => option.value === phase)?.label ?? phase;
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

function categoryHeaderFacts(category: Category, initiatives: Initiative[], tasks: Task[]): Array<{ label: string; value: ReactNode }> {
  const items: Array<{ label: string; value: ReactNode }> = [
    { label: "Symbol", value: <span className="category-symbol-fact">{category.emoji}</span> },
    { label: "Farbe", value: <span className="category-color-fact"><span style={{ background: category.color }} />{category.color}</span> },
    { label: "Arbeit", value: `${initiatives.length} ${propsCountLabel(initiatives.length, "Eintrag", "Einträge")} · ${tasks.length} ${propsCountLabel(tasks.length, "Maßnahme", "Maßnahmen")}` }
  ];
  if (category.isSystem) {
    items.push({ label: "Status", value: "Systembereich" });
  }
  return items;
}

function categoryMetadataItems(category: Category, initiatives: Initiative[], tasks: Task[]): Array<{ label: string; value: ReactNode | null | undefined }> {
  const projects = initiatives.filter((initiative) => initiative.type === "project");
  const ideas = initiatives.filter((initiative) => initiative.type === "idea");
  const habits = initiatives.filter((initiative) => initiative.type === "habit");
  return [
    { label: "Symbol", value: category.emoji },
    { label: "Farbe", value: <span className="category-color-fact"><span style={{ background: category.color }} />{category.color}</span> },
    { label: "Projekte", value: projects.length },
    { label: "Ideen", value: ideas.length },
    { label: "Gewohnheiten", value: habits.length },
    { label: "Maßnahmen", value: tasks.length },
    { label: "Systembereich", value: category.isSystem ? "Ja" : null },
    { label: "Erstellt", value: category.createdAt ? formatDateTimeForUi(category.createdAt) : null },
    { label: "Aktualisiert", value: category.updatedAt ? formatDateTimeForUi(category.updatedAt) : null }
  ];
}

function LifeAreasView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  onOpenLifeArea: (categoryName: string) => void;
}) {
  const items = props.categories.map((category) => categoryListItemData(category, props.initiatives, props.tasks));

  return (
    <EntityListPage className="category-list-page">
      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Lebensbereiche"
          description="Lege den ersten Lebensbereich an, um Projekte, Ideen, Gewohnheiten und Maßnahmen einzuordnen."
        />
      ) : (
        <EntityList>
          {items.map((item) => (
            <EntityListItem
              key={item.category.id}
              marker={(
                <span className="category-list-marker">
                  <span aria-hidden="true">{item.category.emoji}</span>
                  <span className="category-list-swatch" style={{ background: item.category.color }} />
                </span>
              )}
              title={item.category.name}
              meta={item.category.isSystem ? "Systembereich" : `${item.totalInitiatives} ${propsCountLabel(item.totalInitiatives, "Eintrag", "Einträge")}`}
              description={item.description}
              stats={[
                { label: "Projekte", value: item.projectCount },
                { label: "Ideen", value: item.ideaCount },
                { label: "Gewohnheiten", value: item.habitCount },
                { label: "Maßnahmen", value: item.taskCount }
              ]}
              onOpen={() => props.onOpenLifeArea(item.category.name)}
            />
          ))}
        </EntityList>
      )}
    </EntityListPage>
  );
}

function categoryListItemData(category: Category, initiatives: Initiative[], tasks: Task[]) {
  const categoryInitiatives = initiatives.filter((initiative) => initiative.categoryId === category.id);
  const initiativeIds = new Set(categoryInitiatives.map((initiative) => initiative.id));
  return {
    category,
    description: category.description ? firstMarkdownLine(category.description) : null,
    totalInitiatives: categoryInitiatives.length,
    projectCount: categoryInitiatives.filter((initiative) => initiative.type === "project").length,
    ideaCount: categoryInitiatives.filter((initiative) => initiative.type === "idea").length,
    habitCount: categoryInitiatives.filter((initiative) => initiative.type === "habit").length,
    taskCount: tasks.filter((task) => initiativeIds.has(task.initiativeId)).length
  };
}

function CategoryCreateModal(props: {
  onCancel: () => void;
  onCreate: (input: { name: string; description?: string | null; color?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = Boolean(name.trim());

  return (
    <EditModal
      title="Lebensbereich hinzufügen"
      label="Lebensbereich hinzufügen"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canCreate || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            name: name.trim(),
            description: description.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Lebensbereich konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>
            Anlegen
          </button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>
            Abbrechen
          </button>
        </>
      )}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <label>
        Beschreibung
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} />
      </label>
      {error ? <ErrorState title="Anlegen fehlgeschlagen" description={error} /> : null}
    </EditModal>
  );
}

function IdeasView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenIdea: (initiativeId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const categoryFilter = props.categoryFilterName
    ? props.categories.find((category) => category.name.toLowerCase() === props.categoryFilterName?.toLowerCase()) ?? null
    : null;
  const ideas = sortInitiativesForDisplay(
    props.initiatives.filter((initiative) => initiative.type === "idea" && (!props.categoryFilterName || initiative.categoryId === categoryFilter?.id))
  );
  const trimmedSearch = search.trim().toLowerCase();
  const filteredIdeas = ideas.filter((idea) => {
    if (!trimmedSearch) return true;
    const category = categoryById.get(idea.categoryId);
    return [
      displayInitiativeName(idea),
      idea.summary,
      idea.markdown,
      initiativeStatusLabel(idea.status),
      category?.name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="idea-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Idee suchen" aria-label="Idee suchen" />
      </div>

      {props.categoryFilterName && !categoryFilter ? (
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der gefilterte Ideenbereich existiert nicht oder konnte nicht geladen werden."
        />
      ) : null}
      {!props.categoryFilterName && props.initiatives.filter((initiative) => initiative.type === "idea").length === 0 ? (
        <EmptyState
          title="Noch keine Ideen"
          description="Lege die erste Idee an, um mögliche Vorhaben und offene Gedanken festzuhalten."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Idee hinzufügen
            </button>
          )}
        />
      ) : null}
      {ideas.length > 0 && filteredIdeas.length === 0 ? (
        <EmptyState
          title="Keine Ideen gefunden"
          description="Passe die Suche an, um die Ideenliste wieder zu erweitern."
        />
      ) : null}
      {props.categoryFilterName && categoryFilter && ideas.length === 0 ? (
        <EmptyState
          title="Keine Ideen in diesem Lebensbereich"
          description="Dieser Lebensbereich enthält noch keine Ideen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Idee hinzufügen
            </button>
          )}
        />
      ) : null}
      {filteredIdeas.length > 0 ? (
        <EntityList>
          {filteredIdeas.map((idea) => {
            const category = categoryById.get(idea.categoryId) ?? null;
            const taskCount = props.tasks.filter((task) => task.initiativeId === idea.id).length;
            return (
              <EntityListItem
                key={idea.id}
                marker={(
                  <span className="idea-list-avatar">
                    <span>{ideaInitials(idea)}</span>
                    {category ? <span className="idea-list-swatch" style={{ background: category.color }} /> : null}
                  </span>
                )}
                title={displayInitiativeName(idea)}
                meta={ideaListMeta(idea, category)}
                description={ideaDescriptionPreview(idea)}
                stats={taskCount > 0 ? [{ label: "Maßnahmen", value: taskCount }] : undefined}
                onOpen={() => props.onOpenIdea(idea.id)}
              />
            );
          })}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

function IdeaCreateModal(props: {
  categories: AppOverview["categories"];
  categoryFilterName: string | null;
  onCancel: () => void;
  onCreate: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const preferred = preferredCategoryId(props.categories, props.categoryFilterName);
  const [categoryId, setCategoryId] = useState<number>(preferred);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCategoryId = props.categories.some((category) => category.id === categoryId) ? categoryId : preferred;
  const canCreate = Boolean(name.trim() && selectedCategoryId);

  return (
    <EditModal
      title="Idee hinzufügen"
      label="Idee hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || !selectedCategoryId || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            categoryId: selectedCategoryId,
            type: "idea",
            name: trimmedName,
            markdown: defaultInitiativeMarkdown("idea", trimmedName)
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Idee konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Anlegen</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      {props.categories.length === 0 ? (
        <ErrorState title="Kein Lebensbereich vorhanden" description="Lege zuerst einen Lebensbereich an, bevor du eine Idee erstellst." />
      ) : (
        <>
          <label>
            Lebensbereich
            <select value={selectedCategoryId || ""} onChange={(event) => setCategoryId(Number(event.target.value))} disabled={creating}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Idee benennen" autoFocus disabled={creating} />
          </label>
        </>
      )}
      {error ? <ErrorState title="Idee konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function ideaListMeta(idea: Initiative, category: Category | null): string {
  return [
    initiativeStatusLabel(idea.status),
    category?.name ?? null
  ].filter(Boolean).join(" · ");
}

function ideaDescriptionPreview(idea: Initiative): string | null {
  const summary = idea.summary?.trim();
  if (summary) return summary;

  const ignoredLines = new Set(["gedanke", "offene fragen", "noch offen.", "-", ""]);
  const line = idea.markdown
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => entry && !ignoredLines.has(entry.toLowerCase()));
  return line ?? null;
}

function ideaInitials(idea: Initiative): string {
  const initials = displayInitiativeName(idea)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "I";
}

function ProjectsView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenProject: (initiativeId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const categoryFilter = props.categoryFilterName
    ? props.categories.find((category) => category.name.toLowerCase() === props.categoryFilterName?.toLowerCase()) ?? null
    : null;
  const projects = sortInitiativesForDisplay(
    props.initiatives.filter((initiative) => initiative.type === "project" && (!props.categoryFilterName || initiative.categoryId === categoryFilter?.id))
  );
  const trimmedSearch = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    if (!trimmedSearch) return true;
    const category = categoryById.get(project.categoryId);
    return [
      displayInitiativeName(project),
      project.summary,
      project.markdown,
      initiativeStatusLabel(project.status),
      projectPhaseLabel(project.projectPhase),
      category?.name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="project-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Projekt suchen" aria-label="Projekt suchen" />
      </div>

      {props.categoryFilterName && !categoryFilter ? (
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der gefilterte Projektbereich existiert nicht oder konnte nicht geladen werden."
        />
      ) : null}
      {!props.categoryFilterName && props.initiatives.filter((initiative) => initiative.type === "project").length === 0 ? (
        <EmptyState
          title="Noch keine Projekte"
          description="Lege das erste Projekt an, um konkrete Planung und Maßnahmen zu bündeln."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Projekt hinzufügen
            </button>
          )}
        />
      ) : null}
      {projects.length > 0 && filteredProjects.length === 0 ? (
        <EmptyState
          title="Keine Projekte gefunden"
          description="Passe die Suche an, um die Projektliste wieder zu erweitern."
        />
      ) : null}
      {props.categoryFilterName && categoryFilter && projects.length === 0 ? (
        <EmptyState
          title="Keine Projekte in diesem Lebensbereich"
          description="Dieser Lebensbereich enthält noch keine Projekte."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Projekt hinzufügen
            </button>
          )}
        />
      ) : null}
      {filteredProjects.length > 0 ? (
        <EntityList>
          {filteredProjects.map((project) => {
            const category = categoryById.get(project.categoryId) ?? null;
            const counts = projectTaskCounts(project, props.tasks);
            return (
              <EntityListItem
                key={project.id}
                marker={(
                  <span className="project-list-avatar">
                    <span>{projectInitials(project)}</span>
                    {category ? <span className="project-list-swatch" style={{ background: category.color }} /> : null}
                  </span>
                )}
                title={displayInitiativeName(project)}
                meta={projectListMeta(project, category)}
                description={projectDescriptionPreview(project)}
                stats={[
                  { label: "Offen", value: counts.open },
                  { label: "Erledigt", value: counts.done },
                  { label: "Maßnahmen", value: counts.total }
                ]}
                onOpen={() => props.onOpenProject(project.id)}
              />
            );
          })}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

function ProjectCreateModal(props: {
  categories: AppOverview["categories"];
  categoryFilterName: string | null;
  onCancel: () => void;
  onCreate: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const preferred = preferredCategoryId(props.categories, props.categoryFilterName);
  const [categoryId, setCategoryId] = useState<number>(preferred);
  const [name, setName] = useState("");
  const [projectPhase, setProjectPhase] = useState<ProjectPhase>("planning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCategoryId = props.categories.some((category) => category.id === categoryId) ? categoryId : preferred;
  const dateRangeInvalid = initiativeDateRangeInvalid(startDate, endDate);
  const canCreate = Boolean(name.trim() && selectedCategoryId && !dateRangeInvalid);

  return (
    <EditModal
      title="Projekt hinzufügen"
      label="Projekt hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || !selectedCategoryId || creating || dateRangeInvalid) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            categoryId: selectedCategoryId,
            type: "project",
            projectPhase,
            name: trimmedName,
            markdown: defaultInitiativeMarkdown("project", trimmedName),
            startDate: startDate || null,
            endDate: endDate || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Projekt konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Anlegen</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      {props.categories.length === 0 ? (
        <ErrorState title="Kein Lebensbereich vorhanden" description="Lege zuerst einen Lebensbereich an, bevor du ein Projekt erstellst." />
      ) : (
        <>
          <label>
            Lebensbereich
            <select value={selectedCategoryId || ""} onChange={(event) => setCategoryId(Number(event.target.value))} disabled={creating}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Projekt benennen" autoFocus disabled={creating} />
          </label>
          <label>
            Phase
            <select value={projectPhase} onChange={(event) => setProjectPhase(event.target.value as ProjectPhase)} disabled={creating}>
              {projectPhaseOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-two-column">
            <label>
              Start
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={creating} />
            </label>
            <label>
              Ende
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onPointerDown={(event) => primeEmptyDatePickerMonth(event, startDate, endDate)}
                onFocus={(event) => primeEmptyDatePickerMonth(event, startDate, endDate)}
                onBlur={(event) => restorePrimedEmptyDateInput(event, endDate)}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={creating}
              />
            </label>
          </div>
          {dateRangeInvalid ? <p className="field-error">Das Enddatum darf nicht vor dem Startdatum liegen.</p> : null}
        </>
      )}
      {error ? <ErrorState title="Projekt konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function projectTaskCounts(project: Initiative, tasks: Task[]): { total: number; open: number; done: number } {
  const projectTasks = tasks.filter((task) => task.initiativeId === project.id);
  return {
    total: projectTasks.length,
    open: projectTasks.filter((task) => task.status !== "done").length,
    done: projectTasks.filter((task) => task.status === "done").length
  };
}

function projectListMeta(project: Initiative, category: Category | null): string {
  return [
    initiativeStatusLabel(project.status),
    projectPhaseLabel(project.projectPhase),
    category?.name ?? null,
    formatInitiativeDateRangeForUi(project)
  ].filter(Boolean).join(" · ");
}

function projectDescriptionPreview(project: Initiative): string | null {
  const summary = project.summary?.trim();
  if (summary) return summary;

  const ignoredLines = new Set(["ziel", "kontext", "naechste massnahmen", "nächste maßnahmen", "noch offen.", "-", ""]);
  const line = project.markdown
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => entry && !ignoredLines.has(entry.toLowerCase()));
  return line ?? null;
}

function projectInitials(project: Initiative): string {
  const initials = displayInitiativeName(project)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "P";
}

function HabitsView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenHabit: (initiativeId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const categoryFilter = props.categoryFilterName
    ? props.categories.find((category) => category.name.toLowerCase() === props.categoryFilterName?.toLowerCase()) ?? null
    : null;
  const habits = sortInitiativesForDisplay(
    props.initiatives.filter((initiative) => initiative.type === "habit" && (!props.categoryFilterName || initiative.categoryId === categoryFilter?.id))
  );
  const trimmedSearch = search.trim().toLowerCase();
  const filteredHabits = habits.filter((habit) => {
    if (!trimmedSearch) return true;
    const category = categoryById.get(habit.categoryId);
    return [
      displayInitiativeName(habit),
      habit.summary,
      habit.markdown,
      initiativeStatusLabel(habit.status),
      category?.name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="habit-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Gewohnheit suchen" aria-label="Gewohnheit suchen" />
      </div>

      {props.categoryFilterName && !categoryFilter ? (
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der gefilterte Gewohnheitsbereich existiert nicht oder konnte nicht geladen werden."
        />
      ) : null}
      {!props.categoryFilterName && props.initiatives.filter((initiative) => initiative.type === "habit").length === 0 ? (
        <EmptyState
          title="Noch keine Gewohnheiten"
          description="Lege die erste Gewohnheit an, um wiederkehrende Praxis im System sichtbar zu machen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Gewohnheit hinzufügen
            </button>
          )}
        />
      ) : null}
      {habits.length > 0 && filteredHabits.length === 0 ? (
        <EmptyState
          title="Keine Gewohnheiten gefunden"
          description="Passe die Suche an, um die Gewohnheitenliste wieder zu erweitern."
        />
      ) : null}
      {props.categoryFilterName && categoryFilter && habits.length === 0 ? (
        <EmptyState
          title="Keine Gewohnheiten in diesem Lebensbereich"
          description="Dieser Lebensbereich enthält noch keine Gewohnheiten."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Gewohnheit hinzufügen
            </button>
          )}
        />
      ) : null}
      {filteredHabits.length > 0 ? (
        <EntityList>
          {filteredHabits.map((habit) => {
            const category = categoryById.get(habit.categoryId) ?? null;
            const taskCount = props.tasks.filter((task) => task.initiativeId === habit.id).length;
            return (
              <EntityListItem
                key={habit.id}
                marker={(
                  <span className="habit-list-avatar">
                    <span>{habitInitials(habit)}</span>
                    {category ? <span className="habit-list-swatch" style={{ background: category.color }} /> : null}
                  </span>
                )}
                title={displayInitiativeName(habit)}
                meta={habitListMeta(habit, category)}
                description={habitDescriptionPreview(habit)}
                stats={taskCount > 0 ? [{ label: "Maßnahmen", value: taskCount }] : undefined}
                onOpen={() => props.onOpenHabit(habit.id)}
              />
            );
          })}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

function HabitCreateModal(props: {
  categories: AppOverview["categories"];
  categoryFilterName: string | null;
  onCancel: () => void;
  onCreate: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const preferred = preferredCategoryId(props.categories, props.categoryFilterName);
  const [categoryId, setCategoryId] = useState<number>(preferred);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCategoryId = props.categories.some((category) => category.id === categoryId) ? categoryId : preferred;
  const canCreate = Boolean(name.trim() && selectedCategoryId);

  return (
    <EditModal
      title="Gewohnheit hinzufügen"
      label="Gewohnheit hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || !selectedCategoryId || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            categoryId: selectedCategoryId,
            type: "habit",
            name: trimmedName,
            markdown: defaultInitiativeMarkdown("habit", trimmedName)
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gewohnheit konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Anlegen</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      {props.categories.length === 0 ? (
        <ErrorState title="Kein Lebensbereich vorhanden" description="Lege zuerst einen Lebensbereich an, bevor du eine Gewohnheit erstellst." />
      ) : (
        <>
          <label>
            Lebensbereich
            <select value={selectedCategoryId || ""} onChange={(event) => setCategoryId(Number(event.target.value))} disabled={creating}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Gewohnheit benennen" autoFocus disabled={creating} />
          </label>
        </>
      )}
      {error ? <ErrorState title="Gewohnheit konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function habitListMeta(habit: Initiative, category: Category | null): string {
  return [
    initiativeStatusLabel(habit.status),
    category?.name ?? null
  ].filter(Boolean).join(" · ");
}

function habitDescriptionPreview(habit: Initiative): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/ß/g, "ss");
  const title = normalize(displayInitiativeName(habit));
  const summary = habit.summary?.trim();
  if (summary && normalize(summary) !== title) return summary;

  const ignoredLines = new Set(["praxis", "rhythmus", "reflexion", "noch offen.", "noch keine reflexion.", "-", ""]);
  const line = habit.markdown
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => {
      const normalized = entry.toLowerCase();
      return entry && normalize(entry) !== title && !ignoredLines.has(normalized);
    });
  return line ?? null;
}

function habitInitials(habit: Initiative): string {
  const initials = displayInitiativeName(habit)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "G";
}

function LifeAreaDetailView(props: {
  category: AppOverview["categories"][number] | null;
  initiatives: Initiative[];
  tasks: Task[];
  onBack: () => void;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
  onUpdateCategory: (categoryId: number, input: { name?: string; description?: string | null; color?: string | null }) => Promise<void>;
}) {
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionBusy, setDescriptionBusy] = useState(false);

  useEffect(() => {
    setDescriptionDraft(props.category?.description ?? "");
    setDescriptionModalOpen(false);
  }, [props.category]);

  if (!props.category) {
    return (
      <EntityDetailPage className="category-detail-page">
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der angeforderte Lebensbereich existiert nicht oder konnte nicht geladen werden."
        />
      </EntityDetailPage>
    );
  }

  const category = props.category;
  const initiatives = props.initiatives.filter((initiative) => initiative.categoryId === category.id);
  const initiativeIds = new Set(initiatives.map((initiative) => initiative.id));
  const tasks = props.tasks.filter((task) => initiativeIds.has(task.initiativeId));

  return (
    <>
      <EntityDetailPage
        className="category-detail-page"
        aside={<MetadataGrid items={categoryMetadataItems(category, initiatives, tasks)} />}
      >
        <DescriptionBlock
          text={category.description}
          emptyTitle="Noch kein Kontext erfasst."
          emptyDescription="Klicken, um Zweck, Grenzen oder aktuelle Leitgedanken dieses Lebensbereichs zu ergänzen."
          onEdit={() => {
            setDescriptionDraft(category.description ?? "");
            setDescriptionModalOpen(true);
          }}
        />

        <CategoryRelatedWorkSection
          category={category}
          initiatives={initiatives}
          tasks={tasks}
          onOpenInitiative={props.onOpenInitiative}
          onOpenTask={props.onOpenTask}
          onCreateInitiative={props.onCreateInitiative}
        />
      </EntityDetailPage>

      {descriptionModalOpen ? (
        <EditModal
          title="Kontext bearbeiten"
          label="Lebensbereich-Kontext bearbeiten"
          className="markdown-modal"
          onCancel={() => setDescriptionModalOpen(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            if (descriptionBusy) return;
            setDescriptionBusy(true);
            try {
              await props.onUpdateCategory(category.id, { description: descriptionDraft });
              setDescriptionModalOpen(false);
            } finally {
              setDescriptionBusy(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={descriptionBusy}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setDescriptionModalOpen(false)} disabled={descriptionBusy}>Abbrechen</button>
            </>
          )}
        >
          <label>
            Beschreibung
            <textarea
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              rows={14}
              autoFocus
            />
          </label>
        </EditModal>
      ) : null}
    </>
  );
}

function CategoryRelatedWorkSection(props: {
  category: Category;
  initiatives: Initiative[];
  tasks: Task[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const [openCreateType, setOpenCreateType] = useState<InitiativeType | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creatingType, setCreatingType] = useState<InitiativeType | null>(null);
  const initiativesByType = initiativeTypeOptions.map((option) => ({
    ...option,
    initiatives: props.initiatives
      .filter((initiative) => initiative.type === option.value)
      .sort(compareInitiativeCandidates)
  }));
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const tasks = [...props.tasks].sort(compareCategoryTasks);

  async function createForType(type: InitiativeType) {
    const name = draftName.trim();
    if (!name || creatingType) return;
    setCreatingType(type);
    try {
      await props.onCreateInitiative({
        categoryId: props.category.id,
        type,
        name,
        markdown: defaultInitiativeMarkdown(type, name)
      });
      setDraftName("");
      setOpenCreateType(null);
    } finally {
      setCreatingType(null);
    }
  }

  return (
    <SectionBlock title="Verknüpfte Arbeit" className="category-related-work">
      <div className="relation-section-stack">
        {initiativesByType.map((group) => {
          const createOpen = openCreateType === group.value;
          const creating = creatingType === group.value;
          return (
            <RelationGroup
              key={group.value}
              title={pluralLabelForInitiativeType(group.value)}
              actions={(
                <button
                  type="button"
                  className="section-primary-action"
                  onClick={() => {
                    setOpenCreateType((current) => current === group.value ? null : group.value);
                    setDraftName("");
                  }}
                >
                  <Plus size={15} />
                  {group.label} hinzufügen
                </button>
              )}
              emptyMode="none"
            >
              {createOpen ? (
                <form
                  className="category-create-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createForType(group.value);
                  }}
                >
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder={`${group.label} benennen`}
                    aria-label={`${group.label} benennen`}
                    autoFocus
                  />
                  <button type="submit" className="primary-button" disabled={!draftName.trim() || creating}>
                    Anlegen
                  </button>
                  <button type="button" className="small-button" onClick={() => setOpenCreateType(null)} disabled={creating}>
                    Abbrechen
                  </button>
                </form>
              ) : null}
              {group.initiatives.map((initiative) => (
                <RelationItem
                  key={initiative.id}
                  icon={<span>{categoryInitiativeIconLabel(initiative.type)}</span>}
                  title={displayInitiativeName(initiative)}
                  meta={categoryInitiativeMeta(initiative)}
                  detail={initiative.summary}
                  onOpen={() => props.onOpenInitiative(initiative.id)}
                />
              ))}
            </RelationGroup>
          );
        })}

        <RelationGroup title="Maßnahmen" emptyMode="none">
          {tasks.map((task) => {
            const initiative = initiativeById.get(task.initiativeId) ?? null;
            return (
              <RelationItem
                key={task.id}
                icon={<span>M</span>}
                title={task.title}
                meta={categoryTaskMeta(task)}
                detail={initiative ? displayInitiativeName(initiative) : null}
                onOpen={() => props.onOpenTask(task.id)}
              />
            );
          })}
        </RelationGroup>
      </div>
    </SectionBlock>
  );
}

function categoryInitiativeIconLabel(type: InitiativeType): string {
  if (type === "idea") return "I";
  if (type === "habit") return "G";
  return "P";
}

function categoryInitiativeMeta(initiative: Initiative): string {
  const parts = [initiativeTypeLabel(initiative.type), initiativeStatusLabel(initiative.status)];
  const dateRange = initiative.type === "project" ? formatInitiativeDateRangeForUi(initiative) : "";
  if (dateRange) parts.push(dateRange);
  return parts.join(" · ");
}

function categoryTaskMeta(task: Task): string {
  const parts = [taskStatusLabel(task.status), taskPriorityLabel(task.priority)];
  if (task.dueAt) parts.push(formatTaskDueDate(task.dueAt));
  return parts.join(" · ");
}

function compareCategoryTasks(left: Task, right: Task): number {
  const statusRank = { open: 0, done: 1 };
  return statusRank[left.status] - statusRank[right.status]
    || (left.dueAt ?? "9999-12-31").localeCompare(right.dueAt ?? "9999-12-31")
    || left.sortOrder - right.sortOrder
    || left.title.localeCompare(right.title)
    || left.id - right.id;
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
              onKeyDown={(event) => handleModalEscape(event, () => setAddAccountOpen(false))}
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
                <button className="primary-action compact" type="submit" disabled={!globalStatus?.configured || !newAccountLabel.trim()}>
                  <Clock size={16} />
                  OAuth starten
                </button>
                <button className="secondary-action compact" type="button" onClick={() => setAddAccountOpen(false)}>Abbrechen</button>
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
  const canvasRange = useMemo(() => planningCanvasRange(view?.canvas.defaultStartDate ?? null, PLANNING_CANVAS_MONTH_COUNT), [view?.canvas.defaultStartDate]);
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
              {googleLaneRows.map((row) => (
                <span
                  key={`google-row-icon-${row}`}
                  className="planning-canvas-google-row-icon"
                  style={{ top: PLANNING_CANVAS_TIME_HEADER_HEIGHT + row * PLANNING_CANVAS_TIME_LANE_HEIGHT + (PLANNING_CANVAS_TIME_LANE_HEIGHT - 18) / 2 }}
                  aria-hidden="true"
                >
                  <GoogleCalendarGlyph />
                </span>
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
  people: Person[];
  organizations: Organization[];
  participantRoleTypes: ParticipantRoleType[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleTypeId?: number | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onDeleteParticipant: (participantId: number) => Promise<void>;
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
    return <EmptyState title="Initiative wird geladen" description="Die Detaildaten werden aus DMAX geladen." />;
  }

  const initiativeId = props.detail.initiative.id;
  const initiative = props.detail.initiative;
  const predecessors = props.detail.predecessors ?? [];
  const successors = props.detail.successors ?? [];
  const participants = props.detail.participants ?? [];
  const mediaAttachments = props.detail.mediaAttachments ?? [];
  const category = props.categories.find((candidate) => candidate.id === initiative.categoryId) ?? null;
  const openTasks = props.detail.tasks.filter((task) => task.status !== "done").length;
  const doneTasks = props.detail.tasks.length - openTasks;
  const relationCount =
    participants.length
    + predecessors.length
    + successors.length
    + props.allInitiatives.filter((candidate) => candidate.parentId === initiative.id).length
    + (initiative.parentId ? 1 : 0);
  return (
    <EntityDetailPage
      className="initiative-reference-detail"
      aside={(
        <MetadataGrid
          items={[
            { label: "Typ", value: initiativeTypeLabel(initiative.type) },
            { label: "Lebensbereich", value: category?.name ?? null },
            { label: "Status", value: initiativeStatusLabel(initiative.status) },
            { label: "Phase", value: initiative.type === "project" ? projectPhaseLabel(initiative.projectPhase) : null },
            { label: "Zeitraum", value: initiative.type === "project" ? formatInitiativeDateRangeForUi(initiative) : null },
            { label: "Zeitraum fixiert", value: initiative.type === "project" ? (initiative.isLocked ? "Ja" : "Nein") : null },
            { label: "Maßnahmen", value: `${openTasks} offen · ${doneTasks} erledigt` },
            { label: "Beteiligte", value: String(participants.length) },
            { label: "Beziehungen", value: String(relationCount) },
            { label: "Medien", value: String(mediaAttachments.length) },
            { label: "Aktualisiert", value: formatDateTimeForUi(initiative.updatedAt) }
          ]}
        />
      )}
    >
      <InitiativeMarkdownPanel initiative={initiative} onUpdateInitiative={props.onUpdateInitiative} />
      <SectionBlock
        title="Maßnahmen"
        description={`${openTasks} offen · ${doneTasks} erledigt`}
        actions={<TaskCreateInlineForm label="Maßnahme hinzufügen" onCreateTask={(title) => props.onCreateTask(initiativeId, title)} />}
        className="initiative-tasks-section"
      >
        {props.detail.tasks.length === 0 ? (
          <EmptyState title="Noch keine Maßnahmen" description="Lege die nächste konkrete Aktion direkt hier an." />
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
      </SectionBlock>
      <ParticipantsPanel
        entityType="initiative"
        entityId={initiative.id}
        participants={participants}
        people={props.people}
        organizations={props.organizations}
        roleTypes={props.participantRoleTypes}
        surface="section"
        onCreateParticipant={props.onCreateParticipant}
        onDeleteParticipant={props.onDeleteParticipant}
      />
      <InitiativeRelationsPanel
        initiative={initiative}
        allInitiatives={props.allInitiatives}
        categories={props.categories}
        predecessors={predecessors}
        successors={successors}
        onOpenInitiative={props.onOpenInitiative}
        onCreateInitiative={props.onCreateInitiative}
        onUpdateInitiative={props.onUpdateInitiative}
        onCreateRelation={props.onCreateRelation}
        onDeleteRelation={props.onDeleteRelation}
      />
      <MediaAttachmentsPanel
        entityType="initiative"
        entityId={initiative.id}
        attachments={mediaAttachments}
        surface="section"
        onUpload={props.onUploadMedia}
        onUpdate={props.onUpdateMedia}
        onDelete={props.onDeleteMedia}
        onReorder={props.onReorderMedia}
      />
    </EntityDetailPage>
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
    <SectionBlock
      title="Beziehungen"
      description={hasRelations ? "Struktur, Abhängigkeiten und Initiative-Verbindungen." : "Noch keine strukturellen Beziehungen."}
      className="initiative-relations-panel"
      actions={(
        <button type="button" className="small-button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Weniger" : "Bearbeiten"}
        </button>
      )}
    >
      {expanded ? (
      <div className="initiative-relations-grid">
        <div className="initiative-relation-group">
          <InitiativeParentChildColumn
            title="Übergeordnet"
            emptyLabel="Keine übergeordnete Initiative"
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
              <option value="">{parentInitiative ? "Übergeordnete Initiative ändern" : "Übergeordnete Initiative verknüpfen"}</option>
              {initiativeCandidateOptionGroups(parentCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!parentDraft || busyRelationId !== null} title="Parent verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Übergeordnete Initiative anlegen"
            namePlaceholder="Neue übergeordnete Initiative"
            categories={props.categories}
            draft={createDrafts.parent}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("parent", input)}
            onSubmit={() => void createRelatedInitiative("parent")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeParentChildColumn
            title="Untergeordnet"
            emptyLabel="Keine untergeordneten Initiativen"
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
              <option value="">Untergeordnete Initiative verknüpfen</option>
              {initiativeCandidateOptionGroups(childCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!childDraft || busyRelationId !== null} title="Child verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Untergeordnete Initiative anlegen"
            namePlaceholder="Neue untergeordnete Initiative"
            categories={props.categories}
            draft={createDrafts.child}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("child", input)}
            onSubmit={() => void createRelatedInitiative("child")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeRelationColumn
            title="Vorgänger"
            emptyLabel="Keine Vorgänger"
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
              <option value="">Vorgänger verknüpfen</option>
              {initiativeCandidateOptionGroups(predecessorCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!predecessorDraft || busyRelationId !== null} title="Vorgänger verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Vorgänger anlegen"
            namePlaceholder="Neuer Vorgänger"
            categories={props.categories}
            draft={createDrafts.predecessor}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("predecessor", input)}
            onSubmit={() => void createRelatedInitiative("predecessor")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeRelationColumn
            title="Nachfolger"
            emptyLabel="Keine Nachfolger"
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
              <option value="">Nachfolger verknüpfen</option>
              {initiativeCandidateOptionGroups(successorCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!successorDraft || busyRelationId !== null} title="Nachfolger verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Nachfolger anlegen"
            namePlaceholder="Neuer Nachfolger"
            categories={props.categories}
            draft={createDrafts.successor}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("successor", input)}
            onSubmit={() => void createRelatedInitiative("successor")}
          />
        </div>
      </div>
      ) : (
        <RelationList emptyTitle="Beziehungen eingeklappt" emptyDescription="Öffne den Bereich, um Parent/Child- und Vorgänger/Nachfolger-Beziehungen zu bearbeiten.">
          {null}
        </RelationList>
      )}
    </SectionBlock>
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
  category: AppOverview["categories"][number] | null;
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
            {props.category ? <span className="detail-pill-static">{props.category.name}</span> : null}
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

function TaskHeaderTitle(props: {
  task: Task | null;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
}) {
  if (!props.task) return <>Maßnahme</>;
  return (
    <InlineEditableText
      value={props.task.title}
      label="Maßnahmentitel"
      required
      className="entity-title-edit"
      onSave={(value) => props.onUpdateTask(props.task!.id, { title: value })}
    />
  );
}

function taskHeaderFacts(
  task: Task,
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>
): Array<{ label: string; value: ReactNode }> {
  return [
    {
      label: "Status",
      value: <TaskStatusToggle task={task} onUpdateTask={onUpdateTask} />
    },
    {
      label: "Priorität",
      value: <TaskPrioritySelect task={task} onUpdateTask={onUpdateTask} />
    },
    {
      label: "Fällig",
      value: <TaskDueDateEditor task={task} onUpdateTask={onUpdateTask} />
    }
  ];
}

function TaskStatusToggle(props: {
  task: Task;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function toggleStatus() {
    if (busy) return;
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { status: props.task.status === "done" ? "open" : "done" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`task-status-toggle task-header-control ${props.task.status}`}
      disabled={busy}
      onClick={() => void toggleStatus()}
      title={props.task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
    >
      {props.task.status === "done" ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      {taskStatusLabel(props.task.status)}
    </button>
  );
}

function TaskPrioritySelect(props: {
  task: Task;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function updatePriority(priority: Task["priority"]) {
    if (busy || priority === props.task.priority) return;
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { priority });
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className={`detail-pill-select task-header-control priority ${props.task.priority}`} title="Priorität ändern">
      <select
        value={props.task.priority}
        disabled={busy}
        aria-label="Priorität"
        onChange={(event) => void updatePriority(event.target.value as Task["priority"])}
      >
        {taskPriorityOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const writableSources = sources.filter((source) => source.enabled && !source.readOnly);
  const hasCompleteDateRange = Boolean(props.startDate && props.endDate);
  const dateRangeChanged = props.startDate !== (props.initiative.startDate ?? "") || props.endDate !== (props.initiative.endDate ?? "") || props.isLocked !== props.initiative.isLocked;
  const lockTitle = props.isLocked
    ? "Start- und Endzeitpunkt sind gesperrt und sollen nicht verschoben werden"
    : "Zeitraum ist flexibel und kann verschoben werden";
  const bindingCalendarLabel = props.binding?.calendarSource
    ? props.binding.calendarSource.accountLabel
    : props.binding?.externalCalendarId ?? "nicht verknüpft";

  useModalEscape(props.onCancel, !unlinkConfirmOpen);

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

  async function unlinkGoogleEvent(deleteGoogleEvent: boolean) {
    if (!props.binding || calendarBusy) return;
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
      <section
        className="compact-modal project-date-calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Projektzeitraum und Google Calendar"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => handleModalEscape(event, props.onCancel)}
      >
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
            <button type="button" className="project-date-text-link project-date-modal-full" disabled={calendarBusy} onClick={() => setUnlinkConfirmOpen(true)}>
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
        {unlinkConfirmOpen ? (
          <ConfirmModal
            title="Google Event ebenfalls löschen?"
            description={<p>Die Verknüpfung zum Projektzeitraum wird gelöst. Entscheide, ob das verknüpfte Google Event im Kalender ebenfalls gelöscht werden soll.</p>}
            confirmLabel="Event löschen"
            busy={calendarBusy}
            onCancel={() => setUnlinkConfirmOpen(false)}
            extraActions={(
              <button
                type="button"
                className="small-button"
                disabled={calendarBusy}
                onClick={() => {
                  void unlinkGoogleEvent(false);
                }}
              >
                Nur Verknüpfung lösen
              </button>
            )}
            onConfirm={() => unlinkGoogleEvent(true)}
          />
        ) : null}
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
      <EditModal
        title="Beschreibung bearbeiten"
        label="Initiative-Beschreibung bearbeiten"
        className="markdown-modal"
        onCancel={() => {
          setMarkdown(props.initiative.markdown);
          setEditing(false);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void saveMarkdown();
        }}
        footer={(
          <>
            <button className="primary-action compact" type="submit" disabled={busy}>
              Speichern
            </button>
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
          </>
        )}
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
      </EditModal>
    );
  }

  return (
    <DescriptionBlock
      text={props.initiative.markdown}
      emptyTitle="Noch keine Beschreibung vorhanden."
      emptyDescription="Klicke in diese Fläche, um Kontext zu ergänzen."
      onEdit={() => setEditing(true)}
    />
  );
}

function TaskDetailView(props: {
  detail: TaskDetail | null;
  loadError: string | null;
  people: Person[];
  organizations: Organization[];
  participantRoleTypes: ParticipantRoleType[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenCategory: (categoryName: string, initiativeType: InitiativeType) => void;
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleTypeId?: number | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onDeleteParticipant: (participantId: number) => Promise<void>;
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
  if (props.loadError) {
    return (
      <EntityDetailPage>
        <ErrorState
          title="Maßnahme nicht gefunden"
          description="Diese Maßnahme existiert nicht mehr oder konnte nicht geladen werden."
        />
      </EntityDetailPage>
    );
  }

  if (!props.detail) {
    return (
      <EntityDetailPage>
        <EmptyState title="Maßnahme wird geladen" />
      </EntityDetailPage>
    );
  }

  const { task, initiative, category } = props.detail;
  const checklistItems = props.detail.checklistItems ?? [];
  const participants = props.detail.participants ?? [];
  const mediaAttachments = props.detail.mediaAttachments ?? [];
  const checklistDone = checklistItems.filter((item) => item.status === "done").length;
  const aside = (
    <MetadataGrid
      items={[
        { label: "Status", value: taskStatusLabel(task.status) },
        { label: "Priorität", value: taskPriorityLabel(task.priority) },
        { label: "Fällig", value: task.dueAt ? formatTaskDueDate(task.dueAt) : "Ohne Fälligkeitsdatum" },
        { label: "Projekt", value: initiative ? displayInitiativeName(initiative) : null },
        { label: "Lebensbereich", value: category?.name ?? null },
        { label: "Checkliste", value: checklistItems.length > 0 ? `${checklistDone}/${checklistItems.length}` : null },
        { label: "Beteiligte", value: participants.length > 0 ? String(participants.length) : null },
        { label: "Medien", value: mediaAttachments.length > 0 ? String(mediaAttachments.length) : null },
        { label: "Erstellt", value: task.createdAt ? formatDateTimeForUi(task.createdAt) : null },
        { label: "Aktualisiert", value: task.updatedAt ? formatDateTimeForUi(task.updatedAt) : null },
        { label: "Erledigt", value: task.completedAt ? formatDateTimeForUi(task.completedAt) : null }
      ]}
    />
  );

  return (
    <EntityDetailPage className="task-detail" aside={aside}>
      <TaskNotesPanel task={task} onUpdateTask={props.onUpdateTask} />
      <TaskChecklistPanel
        task={task}
        items={checklistItems}
        onCreateItem={props.onCreateChecklistItem}
        onUpdateItem={props.onUpdateChecklistItem}
        onDeleteItem={props.onDeleteChecklistItem}
        onReorderItems={props.onReorderChecklistItems}
      />
      <TaskContextSection
        initiative={initiative ?? null}
        category={category ?? null}
        onOpenInitiative={props.onOpenInitiative}
        onOpenCategory={props.onOpenCategory}
      />
      <ParticipantsPanel
        entityType="task"
        entityId={task.id}
        participants={participants}
        people={props.people}
        organizations={props.organizations}
        roleTypes={props.participantRoleTypes}
        surface="section"
        createMode="modal"
        onCreateParticipant={props.onCreateParticipant}
        onDeleteParticipant={props.onDeleteParticipant}
      />
      <MediaAttachmentsPanel
        entityType="task"
        entityId={task.id}
        attachments={mediaAttachments}
        surface="section"
        onUpload={props.onUploadMedia}
        onUpdate={props.onUpdateMedia}
        onDelete={props.onDeleteMedia}
        onReorder={props.onReorderMedia}
      />
    </EntityDetailPage>
  );
}

function TaskContextSection(props: {
  initiative: Initiative | null;
  category: Category | null;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenCategory: (categoryName: string, initiativeType: InitiativeType) => void;
}) {
  if (!props.initiative && !props.category) {
    return (
      <SectionBlock title="Kontext">
        <RelationList emptyMode="inline" emptyTitle="Noch kein Projekt- oder Lebensbereichskontext.">
          {null}
        </RelationList>
      </SectionBlock>
    );
  }

  return (
    <SectionBlock title="Kontext">
      <RelationList emptyMode="none">
        {props.initiative ? (
          <RelationItem
            icon={<ListTree size={16} />}
            title={displayInitiativeName(props.initiative)}
            meta={initiativeTypeLabel(props.initiative.type)}
            onOpen={() => props.onOpenInitiative(props.initiative!.id)}
          />
        ) : null}
        {props.category ? (
          <RelationItem
            icon={<LayoutGrid size={16} />}
            title={props.category.name}
            meta="Lebensbereich"
            onOpen={() => props.category ? props.onOpenCategory(props.category.name, props.initiative?.type ?? "project") : undefined}
          />
        ) : null}
      </RelationList>
    </SectionBlock>
  );
}

function ParticipantsPanel(props: {
  entityType: "initiative" | "task";
  entityId: number;
  participants: EntityParticipant[];
  people: Person[];
  organizations: Organization[];
  roleTypes: ParticipantRoleType[];
  surface?: "panel" | "section";
  createMode?: "inline" | "modal";
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleTypeId?: number | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onDeleteParticipant: (participantId: number) => Promise<void>;
}) {
  const parties = [
    ...props.people.map((person) => ({ id: person.id, type: "person" as const, displayName: person.displayName })),
    ...props.organizations.map((organization) => ({ id: organization.id, type: "organization" as const, displayName: organization.displayName }))
  ].sort((left, right) => left.displayName.localeCompare(right.displayName));
  const roleTypes = props.roleTypes.filter((roleType) => !roleType.appliesToEntityType || roleType.appliesToEntityType === props.entityType);
  const [partyId, setPartyId] = useState("");
  const [roleTypeId, setRoleTypeId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const createMode = props.createMode ?? "inline";
  const resetCreateDraft = () => {
    setPartyId("");
    setRoleTypeId("");
    setRoleLabel("");
    setIsPrimary(false);
  };
  const submitParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPartyId = Number(partyId);
    if (!parsedPartyId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onCreateParticipant({
        partyId: parsedPartyId,
        entityType: props.entityType,
        entityId: props.entityId,
        roleTypeId: roleTypeId ? Number(roleTypeId) : null,
        roleLabel: roleLabel.trim() || null,
        isPrimary
      });
      resetCreateDraft();
      setIsCreateModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beteiligung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };
  const participantFields = (
    <>
      <select value={partyId} onChange={(event) => setPartyId(event.target.value)} aria-label="Person oder Organisation">
        <option value="">Person oder Organisation</option>
        {parties.map((party) => (
          <option key={party.id} value={party.id}>{party.displayName}</option>
        ))}
      </select>
      <select value={roleTypeId} onChange={(event) => setRoleTypeId(event.target.value)} aria-label="Rolle">
        <option value="">Rolle</option>
        {roleTypes.map((roleType) => (
          <option key={roleType.id} value={roleType.id}>{roleType.label}</option>
        ))}
      </select>
      <input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} placeholder="Freie Rolle" aria-label="Freie Rolle" />
      <label className="inline-checkbox">
        <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
        Primär
      </label>
    </>
  );
  const relationList = props.surface === "section" ? (
    <RelationList emptyMode={createMode === "modal" ? "none" : "inline"} emptyTitle="Noch keine Beteiligten.">
      {props.participants.map((participant) => (
        <RelationItem
          key={participant.id}
          icon={participant.party.type === "person" ? <Users size={16} /> : <Building2 size={16} />}
          title={participant.party.displayName}
          meta={participantRoleSummary(participant)}
          actions={(
            <button
              type="button"
              className="icon-button compact"
              disabled={busy}
              title="Beteiligung entfernen"
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError(null);
                try {
                  await props.onDeleteParticipant(participant.id);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Beteiligung konnte nicht entfernt werden.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          )}
        />
      ))}
    </RelationList>
  ) : (
    <div className="relationship-list">
      {props.participants.length === 0 ? <p className="muted-text">Noch keine Beteiligten.</p> : null}
      {props.participants.map((participant) => (
        <div className="relationship-row" key={participant.id}>
          <div className="entity-icon">{participant.party.type === "person" ? <Users size={16} /> : <Building2 size={16} />}</div>
          <div>
            <strong>{participant.party.displayName}</strong>
            <p>{participantRoleSummary(participant)}</p>
          </div>
          <button
            type="button"
            className="icon-button compact"
            disabled={busy}
            title="Beteiligung entfernen"
            onClick={async () => {
              if (busy) return;
              setBusy(true);
              setError(null);
              try {
                await props.onDeleteParticipant(participant.id);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Beteiligung konnte nicht entfernt werden.");
              } finally {
                setBusy(false);
              }
            }}
          >
            <Trash2 size={14} />
          </button>
        </div>
      ))}
    </div>
  );
  const content = (
    <>
      {relationList}
      {createMode === "inline" ? (
        <form className="contact-point-create-form participant-create-form" onSubmit={submitParticipant}>
          {participantFields}
          <button type="submit" className={props.surface === "section" ? "section-primary-action" : "primary-button"} disabled={!partyId || busy}>
            <Plus size={15} />
            Verknüpfen
          </button>
        </form>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {isCreateModalOpen ? (
        <EditModal
          title="Beteiligte hinzufügen"
          label="Beteiligte hinzufügen"
          onCancel={() => {
            resetCreateDraft();
            setError(null);
            setIsCreateModalOpen(false);
          }}
          onSubmit={submitParticipant}
          footer={(
            <>
              <button className="primary-action compact" type="submit" disabled={!partyId || busy}>
                Verknüpfen
              </button>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={() => {
                  resetCreateDraft();
                  setError(null);
                  setIsCreateModalOpen(false);
                }}
              >
                Abbrechen
              </button>
            </>
          )}
        >
          <div className="participant-modal-fields">
            {participantFields}
          </div>
          {error ? <p className="inline-error">{error}</p> : null}
        </EditModal>
      ) : null}
    </>
  );

  if (props.surface === "section") {
    return (
      <SectionBlock
        title="Beteiligte"
        actions={createMode === "modal" ? (
          <button type="button" className="section-primary-action" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={15} />
            Beteiligte hinzufügen
          </button>
        ) : null}
      >
        {content}
      </SectionBlock>
    );
  }

  return (
    <Panel title="Beteiligte">
      {content}
    </Panel>
  );
}

function MediaAttachmentsPanel(props: {
  entityType: Extract<MediaEntityType, "initiative" | "task">;
  entityId: number;
  attachments: MediaAttachment[];
  surface?: "panel" | "section";
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
      className={`${props.surface === "section" ? "section-block" : "panel"} media-panel ${dragActive ? "drag-active" : ""}`}
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

  const completedCount = props.items.filter((item) => item.status === "done").length;

  return (
    <SectionBlock
      title="Checkliste"
      className="task-checklist-panel"
      actions={<span className="task-checklist-progress">{completedCount}/{props.items.length}</span>}
    >

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
    </SectionBlock>
  );
}

function TaskDueDateEditor(props: { task: Task; onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const inputValue = props.task.dueAt ? datePart(props.task.dueAt) : "";

  useEffect(() => {
    setBusy(false);
  }, [props.task.id, props.task.dueAt]);

  const saveDueDate = async (nextDueAt: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { dueAt: nextDueAt });
    } finally {
      setBusy(false);
    }
  };

  const openDatePicker = () => {
    const input = inputRef.current;
    if (!input || busy) return;
    input.focus();
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof pickerInput.showPicker === "function") {
        pickerInput.showPicker();
      } else {
        input.click();
      }
    } catch {
      input.click();
    }
  };

  return (
    <div className="task-date-editor">
      <label
        className="task-date-picker-control task-header-control"
        title="Fälligkeitsdatum bearbeiten"
        role="button"
        aria-label="Fälligkeitsdatum bearbeiten"
        tabIndex={0}
        onClick={(event) => {
          event.preventDefault();
          openDatePicker();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openDatePicker();
        }}
      >
        <CalendarDays size={14} aria-hidden="true" />
        <span>{props.task.dueAt ? formatTaskDueDate(props.task.dueAt) : "Ohne Datum"}</span>
        <input
          ref={inputRef}
          type="date"
          value={inputValue}
          disabled={busy}
          aria-label="Fälligkeitsdatum"
          tabIndex={-1}
          onChange={(event) => {
            const value = event.target.value;
            void saveDueDate(value || null);
          }}
        />
      </label>
      {props.task.dueAt ? (
        <button type="button" className="icon-button danger" disabled={busy} onClick={() => void saveDueDate(null)} title="Fälligkeitsdatum entfernen">
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
      <EditModal
        title="Notizen bearbeiten"
        label="Aufgaben-Notizen bearbeiten"
        onCancel={() => {
          setNotes(props.task.notes ?? "");
          setEditing(false);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void saveNotes();
        }}
        footer={(
          <>
            <button className="primary-action compact" type="submit" disabled={busy}>
              Speichern
            </button>
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
          </>
        )}
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
      </EditModal>
    );
  }

  return (
    <DescriptionBlock
      text={props.task.notes}
      emptyTitle="Noch keine Notizen vorhanden."
      emptyDescription="Klicke in diese Fläche, um Kontext zu ergänzen."
      onEdit={() => setEditing(true)}
    />
  );
}

function TasksListView(props: {
  tasks: Task[];
  initiatives: Initiative[];
  categories: AppOverview["categories"];
  onToggleTaskStatus: (task: Task) => Promise<void>;
  onDeleteTask: (task: Task) => Promise<void>;
  onOpenTask: (taskId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const sortedTasks = sortTasksForList(props.tasks, initiativeById);
  const trimmedSearch = search.trim().toLowerCase();
  const filteredTasks = sortedTasks.filter((task) => {
    if (!trimmedSearch) return true;
    const initiative = initiativeById.get(task.initiativeId) ?? null;
    const category = initiative ? categoryById.get(initiative.categoryId) ?? null : null;
    return [
      task.title,
      task.notes,
      taskStatusLabel(task.status),
      taskPriorityLabel(task.priority),
      task.dueAt ? formatTaskDueDate(task.dueAt) : null,
      initiative ? displayInitiativeName(initiative) : null,
      initiative ? initiativeTypeLabel(initiative.type) : null,
      category?.name ?? null
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="task-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Maßnahme suchen" aria-label="Maßnahme suchen" />
      </div>

      {props.tasks.length === 0 ? (
        <EmptyState
          title="Keine offenen Maßnahmen"
          description="Lege eine Maßnahme an oder öffne ein Projekt, um die nächste konkrete Aktion festzuhalten."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Maßnahme hinzufügen
            </button>
          )}
        />
      ) : null}
      {props.tasks.length > 0 && filteredTasks.length === 0 ? (
        <EmptyState
          title="Keine Maßnahmen gefunden"
          description="Passe die Suche an, um die Maßnahmenliste wieder zu erweitern."
        />
      ) : null}
      {filteredTasks.length > 0 ? (
        <EntityList>
          {filteredTasks.map((task) => {
            const initiative = initiativeById.get(task.initiativeId) ?? null;
            const category = initiative ? categoryById.get(initiative.categoryId) ?? null : null;
            return (
              <EntityListItem
                key={task.id}
                title={task.title}
                meta={taskListMeta(task)}
                description={taskListContext(initiative, category)}
                onOpen={() => props.onOpenTask(task.id)}
                openLabel={`Maßnahme ${task.title} öffnen`}
                leadingAction={(
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => void props.onToggleTaskStatus(task)}
                      title={task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
                      aria-label={task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
                    >
                      {task.status === "done" ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </button>
                )}
                actions={(
                  <span className="task-list-actions">
                    <button
                      type="button"
                      className="icon-button subtle-danger"
                      onClick={() => setTaskToDelete(task)}
                      title="Maßnahme löschen"
                      aria-label="Maßnahme löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                )}
              />
            );
          })}
        </EntityList>
      ) : null}
      {taskToDelete ? (
        <ConfirmModal
          title="Maßnahme löschen?"
          description={(
            <>
              <p>Die Maßnahme „{taskToDelete.title}“ wird gelöscht.</p>
              <p>Beim Löschen werden ebenfalls entfernt:</p>
              <ul>
                <li>Beschreibung</li>
                <li>Checkliste, falls vorhanden</li>
                <li>Angehängte Medien</li>
              </ul>
            </>
          )}
          confirmLabel="Maßnahme löschen"
          onCancel={() => setTaskToDelete(null)}
          onConfirm={async () => {
            await props.onDeleteTask(taskToDelete);
            setTaskToDelete(null);
          }}
        />
      ) : null}
    </EntityListPage>
  );
}

function TaskCreateModal(props: {
  initiatives: Initiative[];
  onCancel: () => void;
  onCreate: (input: { initiativeId: number; title: string; priority?: Task["priority"]; dueAt?: string | null }) => Promise<void>;
}) {
  const sortedInitiatives = sortInitiativesForDisplay(props.initiatives);
  const [initiativeId, setInitiativeId] = useState<number>(sortedInitiatives[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedInitiativeId = sortedInitiatives.some((initiative) => initiative.id === initiativeId) ? initiativeId : sortedInitiatives[0]?.id ?? 0;
  const canCreate = Boolean(title.trim() && selectedInitiativeId);

  return (
    <EditModal
      title="Maßnahme hinzufügen"
      label="Maßnahme hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || !selectedInitiativeId || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            initiativeId: selectedInitiativeId,
            title: trimmedTitle,
            priority,
            dueAt: dueAt || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Maßnahme konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Anlegen</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      {sortedInitiatives.length === 0 ? (
        <ErrorState title="Kein Kontext vorhanden" description="Lege zuerst ein Projekt, eine Idee oder eine Gewohnheit an, bevor du eine Maßnahme erstellst." />
      ) : (
        <>
          <label>
            Kontext
            <select value={selectedInitiativeId || ""} onChange={(event) => setInitiativeId(Number(event.target.value))} disabled={creating}>
              {sortedInitiatives.map((initiative) => (
                <option key={initiative.id} value={initiative.id}>
                  {displayInitiativeName(initiative)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Titel
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Maßnahme benennen" autoFocus disabled={creating} />
          </label>
          <div className="modal-two-column">
            <label>
              Priorität
              <select value={priority} onChange={(event) => setPriority(event.target.value as Task["priority"])} disabled={creating}>
                {taskPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fällig
              <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} disabled={creating} />
            </label>
          </div>
        </>
      )}
      {error ? <ErrorState title="Maßnahme konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function taskListMeta(task: Task): string {
  return [
    taskStatusLabel(task.status),
    taskPriorityLabel(task.priority),
    task.dueAt ? `Fällig ${formatTaskDueDate(task.dueAt)}` : null
  ].filter(Boolean).join(" · ");
}

function taskListContext(initiative: Initiative | null, category: Category | null): string | null {
  if (!initiative) return null;
  return [
    displayInitiativeName(initiative),
    category?.name ?? null
  ].filter(Boolean).join(" · ");
}

function sortTasksForList(tasks: Task[], initiativeById: Map<number, Initiative>): Task[] {
  const priorityRank: Record<Task["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  return [...tasks].sort((left, right) => {
    const statusCompare = taskCompletionRank(left.status) - taskCompletionRank(right.status);
    if (statusCompare) return statusCompare;
    const dueCompare = (left.dueAt ?? "9999-12-31").localeCompare(right.dueAt ?? "9999-12-31");
    if (dueCompare) return dueCompare;
    const priorityCompare = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityCompare) return priorityCompare;
    const leftInitiative = initiativeById.get(left.initiativeId);
    const rightInitiative = initiativeById.get(right.initiativeId);
    return (leftInitiative?.sortOrder ?? 0) - (rightInitiative?.sortOrder ?? 0)
      || left.sortOrder - right.sortOrder
      || left.title.localeCompare(right.title)
      || left.id - right.id;
  });
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
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const initiativeById = new Map(props.initiatives.map((project) => [project.id, project]));
  const visibleTasks = props.groupByCompletionStatus ? sortTasksByCompletionAndRank(props.tasks) : props.tasks;
  const taskIds = visibleTasks.map((task) => task.id);
  const showInitiativeName = props.showInitiativeName ?? true;
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
                setTaskToDelete(task);
              }}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </article>
      ))}
      {taskToDelete && props.onDeleteTask ? (
        <ConfirmModal
          title="Aufgabe löschen?"
          description={(
            <>
              <p>Die Aufgabe „{taskToDelete.title}“ wird gelöscht.</p>
              <p>Beim Löschen werden ebenfalls entfernt:</p>
              <ul>
                <li>Beschreibung</li>
                <li>Checkliste, falls vorhanden</li>
                <li>Angehängte Medien</li>
              </ul>
            </>
          )}
          confirmLabel="Aufgabe löschen"
          onCancel={() => setTaskToDelete(null)}
          onConfirm={async () => {
            await props.onDeleteTask?.(taskToDelete);
            setTaskToDelete(null);
          }}
        />
      ) : null}
    </section>
  );
}

function PeopleView(props: {
  people: Person[];
  onOpenPerson: (partyId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const filteredPeople = props.people.filter((person) => {
    const needle = trimmedSearch;
    if (!needle) return true;
    return [person.displayName, person.firstName, person.lastName, person.academicTitle, salutationLabel(person.salutation)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <EntityListPage className="person-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Person suchen" aria-label="Person suchen" />
      </div>

      {props.people.length === 0 ? (
        <EmptyState
          title="Noch keine Personen"
          description="Lege die erste Person an, um Kontakte, Beziehungen und Beteiligungen sichtbar zu machen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Person hinzufügen
            </button>
          )}
        />
      ) : null}
      {props.people.length > 0 && filteredPeople.length === 0 ? (
        <EmptyState
          title="Keine Personen gefunden"
          description="Passe die Suche an, um die Personenliste wieder zu erweitern."
        />
      ) : null}
      {filteredPeople.length > 0 ? (
        <EntityList>
          {filteredPeople.map((person) => (
            <EntityListItem
              key={person.id}
              marker={<span className="person-list-avatar">{personInitials(person)}</span>}
              title={person.displayName}
              meta={personListMeta(person)}
              onOpen={() => props.onOpenPerson(person.id)}
            />
          ))}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

function PersonCreateModal(props: {
  onCancel: () => void;
  onCreate: (input: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    salutation?: Person["salutation"];
    academicTitle?: string | null;
    nameSuffix?: string | null;
  }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [salutation, setSalutation] = useState<Person["salutation"]>("unknown");
  const [academicTitle, setAcademicTitle] = useState("");
  const [nameSuffix, setNameSuffix] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = Boolean(firstName.trim() || lastName.trim());

  return (
    <EditModal
      title="Person hinzufügen"
      label="Person hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canCreate || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            salutation,
            academicTitle: academicTitle.trim() || null,
            nameSuffix: nameSuffix.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Person konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      <div className="person-create-fields">
        <label>
          Anrede
          <select value={salutation} onChange={(event) => setSalutation(event.target.value as Person["salutation"])} disabled={creating}>
            <option value="unknown">Unbekannt</option>
            <option value="mr">Herr</option>
            <option value="mrs">Frau</option>
          </select>
        </label>
        <label>
          Titel
          <input value={academicTitle} onChange={(event) => setAcademicTitle(event.target.value)} placeholder="Dr., Prof. Dr." disabled={creating} />
        </label>
        <label>
          Vorname
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Vorname" disabled={creating} />
        </label>
        <label>
          Nachname
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Nachname" disabled={creating} />
        </label>
        <label>
          Zusatz
          <input value={nameSuffix} onChange={(event) => setNameSuffix(event.target.value)} placeholder="Suffix" disabled={creating} />
        </label>
      </div>
      {error ? <ErrorState title="Person konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function personListMeta(person: Person): string | null {
  const nameParts = [person.firstName, person.lastName].filter(Boolean).join(" ");
  const parts = [
    person.salutation !== "unknown" ? salutationLabel(person.salutation) : null,
    person.academicTitle,
    nameParts && nameParts !== person.displayName ? nameParts : null,
    person.nameSuffix
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function personInitials(person: Person): string {
  const sourceParts = [person.firstName, person.lastName].filter((part): part is string => Boolean(part));
  const fallbackParts = person.displayName.split(/\s+/).filter(Boolean);
  const initials = (sourceParts.length > 0 ? sourceParts : fallbackParts)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "P";
}

function OrganizationsView(props: {
  organizations: Organization[];
  onOpenOrganization: (partyId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const filteredOrganizations = props.organizations.filter((organization) => {
    const needle = trimmedSearch;
    if (!needle) return true;
    return [organization.displayName, organization.name, organization.legalName, organization.organizationType]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <EntityListPage className="organization-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Organisation suchen" aria-label="Organisation suchen" />
      </div>

      {props.organizations.length === 0 ? (
        <EmptyState
          title="Noch keine Organisationen"
          description="Lege die erste Organisation an, um Kontakte, Beziehungen und DMAX-Kontexte sichtbar zu machen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Organisation hinzufügen
            </button>
          )}
        />
      ) : null}
      {props.organizations.length > 0 && filteredOrganizations.length === 0 ? (
        <EmptyState
          title="Keine Organisationen gefunden"
          description="Passe die Suche an, um die Organisationsliste wieder zu erweitern."
        />
      ) : null}
      {filteredOrganizations.length > 0 ? (
        <EntityList>
          {filteredOrganizations.map((organization) => (
            <EntityListItem
              key={organization.id}
              marker={<span className="organization-list-avatar">{organizationInitials(organization)}</span>}
              title={organization.displayName}
              meta={organizationListMeta(organization)}
              onOpen={() => props.onOpenOrganization(organization.id)}
            />
          ))}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

function OrganizationCreateModal(props: {
  onCancel: () => void;
  onCreate: (input: { name: string; legalName?: string | null; organizationType?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [organizationType, setOrganizationType] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = Boolean(name.trim());

  return (
    <EditModal
      title="Organisation hinzufügen"
      label="Organisation hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            name: trimmedName,
            legalName: legalName.trim() || null,
            organizationType: organizationType.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Organisation konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      <div className="organization-create-fields">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Organisation" disabled={creating} />
        </label>
        <label>
          Rechtlicher Name
          <input value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Legal Name" disabled={creating} />
        </label>
        <label>
          Typ
          <input value={organizationType} onChange={(event) => setOrganizationType(event.target.value)} placeholder="Firma, Verein, Club" disabled={creating} />
        </label>
      </div>
      {error ? <ErrorState title="Organisation konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function organizationListMeta(organization: Organization): string | null {
  const parts = [
    organization.organizationType,
    organization.legalName && organization.legalName !== organization.displayName ? organization.legalName : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function organizationInitials(organization: Organization): string {
  const parts = organization.displayName.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "O";
}

function PersonDetailView(props: {
  detail: PersonDetail | null;
  loadError: string | null;
  initiatives: Initiative[];
  tasks: Task[];
  coreModalOpen: boolean;
  onCloseCoreModal: () => void;
  onUpdatePerson: (partyId: number, input: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    salutation?: Person["salutation"];
    academicTitle?: string | null;
    nameSuffix?: string | null;
  }) => Promise<void>;
  onCreateContactPoint: (partyId: number, input: ContactPointInput) => Promise<void>;
  onUpdateContactPoint: (contactPointId: number, input: Partial<ContactPointInput>) => Promise<void>;
  onDeleteContactPoint: (contactPointId: number) => Promise<void>;
  onCreateAddress: (partyId: number, input: AddressInput) => Promise<void>;
  onUpdateAddress: (addressId: number, input: Partial<AddressInput>) => Promise<void>;
  onDeleteAddress: (addressId: number) => Promise<void>;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const person = props.detail?.person;

  if (props.loadError) {
    return (
      <ErrorState
        title="Person nicht gefunden"
        description="Diese Person existiert nicht oder konnte nicht geladen werden. Gehe zurück zur Personenliste und wähle einen vorhandenen Eintrag."
      />
    );
  }

  if (!props.detail || !person) return <EmptyState title="Person wird geladen" description="Die Detaildaten werden aus DMAX geladen." />;

  return (
    <EntityDetailPage
      className="person-reference-detail"
      aside={(
        <MetadataGrid
          items={[
            { label: "Anrede", value: salutationLabel(person.salutation) },
            { label: "Titel", value: person.academicTitle },
            { label: "Vorname", value: person.firstName },
            { label: "Nachname", value: person.lastName },
            { label: "Namenszusatz", value: person.nameSuffix },
            { label: "Kontaktwege", value: props.detail.contactPoints.length },
            { label: "Anschriften", value: props.detail.addresses.length },
            { label: "Beziehungen", value: props.detail.relationships.length },
            { label: "DMAX-Kontexte", value: props.detail.participants.length },
            { label: "Erstellt", value: formatDateTimeForUi(person.createdAt) },
            { label: "Aktualisiert", value: formatDateTimeForUi(person.updatedAt) }
          ]}
        />
      )}
    >
      {props.coreModalOpen ? (
        <PersonCoreModal
          person={person}
          onCancel={props.onCloseCoreModal}
          onSave={async (input) => {
            await props.onUpdatePerson(person.id, input);
            props.onCloseCoreModal();
          }}
        />
      ) : null}
      <div className="entity-detail-two-column">
        <ContactPointList
          partyId={person.id}
          contactPoints={props.detail.contactPoints}
          description="Direkte Wege zu dieser Person."
          emptyDescription="E-Mail, Telefon oder Messenger können ergänzt werden."
          deleteDescription={(contactPoint) => <p>„{contactPoint.value}“ wird aus dieser Person entfernt.</p>}
          onCreate={props.onCreateContactPoint}
          onUpdate={props.onUpdateContactPoint}
          onDelete={props.onDeleteContactPoint}
        />
        <AddressBlock
          partyId={person.id}
          addresses={props.detail.addresses}
          description="Postalische Orte und weitere Adressen."
          emptyDescription="Post- oder Besuchsadressen können ergänzt werden."
          deleteDescription={(address) => <p>„{address.line1}“ wird aus dieser Person entfernt.</p>}
          onCreate={props.onCreateAddress}
          onUpdate={props.onUpdateAddress}
          onDelete={props.onDeleteAddress}
        />
      </div>
      <PersonRelationsSection
        person={person}
        relationships={props.detail.relationships}
        onOpenPerson={props.onOpenPerson}
        onOpenOrganization={props.onOpenOrganization}
      />
      <PersonParticipationsSection
        participants={props.detail.participants}
        initiatives={props.initiatives}
        tasks={props.tasks}
        onOpenInitiative={props.onOpenInitiative}
        onOpenTask={props.onOpenTask}
      />
    </EntityDetailPage>
  );
}

function PersonCoreModal(props: {
  person: Person;
  onCancel: () => void;
  onSave: (input: {
    displayName?: string;
    firstName: string | null;
    lastName: string | null;
    salutation: Person["salutation"];
    academicTitle: string | null;
    nameSuffix: string | null;
  }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(props.person.displayName);
  const [firstName, setFirstName] = useState(props.person.firstName ?? "");
  const [lastName, setLastName] = useState(props.person.lastName ?? "");
  const [salutation, setSalutation] = useState<Person["salutation"]>(props.person.salutation);
  const [academicTitle, setAcademicTitle] = useState(props.person.academicTitle ?? "");
  const [nameSuffix, setNameSuffix] = useState(props.person.nameSuffix ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = Boolean(displayName.trim() || firstName.trim() || lastName.trim());

  return (
    <EditModal
      title="Person bearbeiten"
      label="Person bearbeiten"
      className="party-edit-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave || saving) return;
        setSaving(true);
        setError(null);
        try {
          await props.onSave({
            displayName: displayName.trim() || undefined,
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            salutation,
            academicTitle: academicTitle.trim() || null,
            nameSuffix: nameSuffix.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Person konnte nicht gespeichert werden.");
        } finally {
          setSaving(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canSave || saving}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={saving}>Abbrechen</button>
        </>
      )}
    >
      <label>
        Anzeigename
        <input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label>
        Anrede
        <select value={salutation} onChange={(event) => setSalutation(event.target.value as Person["salutation"])}>
          <option value="unknown">Unbekannt</option>
          <option value="mr">Herr</option>
          <option value="mrs">Frau</option>
        </select>
      </label>
      <label>
        Titel
        <input value={academicTitle} onChange={(event) => setAcademicTitle(event.target.value)} />
      </label>
      <div className="modal-two-column">
        <label>
          Vorname
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          Nachname
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
      </div>
      <label>
        Zusatz
        <input value={nameSuffix} onChange={(event) => setNameSuffix(event.target.value)} />
      </label>
      {error ? <p className="inline-error">{error}</p> : null}
    </EditModal>
  );
}

function PersonRelationsSection(props: {
  person: Person;
  relationships: PersonDetail["relationships"];
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const organizationRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type === "organization";
  });
  const personRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type === "person";
  });

  return (
    <SectionBlock title="Beziehungen" description="Organisationen und Personen, die mit dieser Person verbunden sind.">
      <div className="relation-section-stack">
        <RelationGroup
          title="Organisationen"
          description="Arbeit, Mitgliedschaften und andere Organisationsbeziehungen."
          emptyTitle="Keine Organisationsbeziehungen"
          emptyDescription="Diese Person ist noch mit keiner Organisation verbunden."
        >
          {organizationRelationships.map((relationship) => {
            const organization = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
            return (
              <RelationItem
                key={relationship.id}
                icon={<Building2 size={16} />}
                title={organization.displayName}
                meta={partyRelationshipLabel(relationship, props.person.id)}
                onOpen={() => props.onOpenOrganization(organization.id)}
              />
            );
          })}
        </RelationGroup>
        <RelationGroup
          title="Personen"
          description="Weitere direkte Personenbeziehungen."
          emptyTitle="Keine Personenbeziehungen"
          emptyDescription="Noch keine weitere Person ist verknüpft."
        >
          {personRelationships.map((relationship) => {
            const otherPerson = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
            return (
              <RelationItem
                key={relationship.id}
                icon={<Users size={16} />}
                title={otherPerson.displayName}
                meta={partyRelationshipLabel(relationship, props.person.id)}
                onOpen={() => props.onOpenPerson(otherPerson.id)}
              />
            );
          })}
        </RelationGroup>
      </div>
    </SectionBlock>
  );
}

function PersonParticipationsSection(props: {
  participants: EntityParticipant[];
  initiatives: Initiative[];
  tasks: Task[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
}) {
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const taskById = new Map(props.tasks.map((task) => [task.id, task]));

  return (
    <SectionBlock title="DMAX-Kontexte" description="Initiativen und Maßnahmen, in denen diese Person vorkommt.">
      <RelationList emptyTitle="Keine DMAX-Kontexte" emptyDescription="Diese Person ist noch keiner Initiative oder Maßnahme zugeordnet.">
        {props.participants.map((participant) => {
          const title =
            participant.entityType === "initiative"
              ? initiativeById.get(participant.entityId)?.name
              : participant.entityType === "task"
                ? taskById.get(participant.entityId)?.title
                : null;
          return (
            <RelationItem
              key={participant.id}
              icon={participant.entityType === "task" ? <ClipboardList size={16} /> : <Blocks size={16} />}
              title={title ?? `${entityTypeLabel(participant.entityType)} #${participant.entityId}`}
              meta={`${entityTypeLabel(participant.entityType)} · ${participantRoleSummary(participant)}`}
              onOpen={() => {
                if (participant.entityType === "initiative") props.onOpenInitiative(participant.entityId);
                if (participant.entityType === "task") props.onOpenTask(participant.entityId);
              }}
            />
          );
        })}
      </RelationList>
    </SectionBlock>
  );
}

function OrganizationDetailView(props: {
  detail: OrganizationDetail | null;
  loadError: string | null;
  initiatives: Initiative[];
  tasks: Task[];
  people: Person[];
  organizations: Organization[];
  relationshipTypes: RelationshipType[];
  coreModalOpen: boolean;
  onCloseCoreModal: () => void;
  onUpdateOrganization: (partyId: number, input: { name?: string; legalName?: string | null; organizationType?: string | null; markdown?: string | null }) => Promise<void>;
  onCreateContactPoint: (partyId: number, input: ContactPointInput) => Promise<void>;
  onUpdateContactPoint: (contactPointId: number, input: Partial<ContactPointInput>) => Promise<void>;
  onDeleteContactPoint: (contactPointId: number) => Promise<void>;
  onCreateAddress: (partyId: number, input: AddressInput) => Promise<void>;
  onUpdateAddress: (addressId: number, input: Partial<AddressInput>) => Promise<void>;
  onDeleteAddress: (addressId: number) => Promise<void>;
  onCreateRelationship: (input: {
    fromPartyId: number;
    toPartyId: number;
    relationshipTypeId: number;
    roleLabel?: string | null;
    status?: "active" | "inactive";
  }) => Promise<void>;
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const organization = props.detail?.organization;

  if (props.loadError) {
    return (
      <ErrorState
        title="Organisation nicht gefunden"
        description="Diese Organisation existiert nicht oder konnte nicht geladen werden. Gehe zurück zur Organisationsliste und wähle einen vorhandenen Eintrag."
      />
    );
  }

  if (!props.detail || !organization) return <EmptyState title="Organisation wird geladen" description="Die Detaildaten werden aus DMAX geladen." />;

  return (
    <EntityDetailPage
      className="organization-reference-detail"
      aside={(
        <MetadataGrid
          items={[
            { label: "Name", value: organization.name },
            { label: "Anzeigename", value: organization.displayName !== organization.name ? organization.displayName : null },
            { label: "Rechtlicher Name", value: organization.legalName },
            { label: "Organisationstyp", value: organization.organizationType },
            { label: "Erstellt", value: formatDateTimeForUi(organization.createdAt) },
            { label: "Aktualisiert", value: formatDateTimeForUi(organization.updatedAt) }
          ]}
        />
      )}
    >
      {props.coreModalOpen ? (
        <OrganizationCoreModal
          organization={organization}
          onCancel={props.onCloseCoreModal}
          onSave={async (input) => {
            await props.onUpdateOrganization(organization.id, input);
            props.onCloseCoreModal();
          }}
        />
      ) : null}
      <OrganizationDescriptionSection
        organization={organization}
        onUpdateOrganization={(input) => props.onUpdateOrganization(organization.id, input)}
      />
      <div className="entity-detail-two-column">
        <ContactPointList
          partyId={organization.id}
          contactPoints={props.detail.contactPoints}
          description={null}
          onCreate={props.onCreateContactPoint}
          onUpdate={props.onUpdateContactPoint}
          onDelete={props.onDeleteContactPoint}
        />
        <AddressBlock
          partyId={organization.id}
          addresses={props.detail.addresses}
          description={null}
          onCreate={props.onCreateAddress}
          onUpdate={props.onUpdateAddress}
          onDelete={props.onDeleteAddress}
        />
      </div>
      <OrganizationRelationsSection
        organization={organization}
        people={props.people}
        organizations={props.organizations}
        relationshipTypes={props.relationshipTypes}
        relationships={props.detail.relationships}
        onCreateRelationship={props.onCreateRelationship}
        onOpenPerson={props.onOpenPerson}
        onOpenOrganization={props.onOpenOrganization}
      />
      <OrganizationParticipationsSection
        organization={organization}
        participants={props.detail.participants}
        initiatives={props.initiatives}
        tasks={props.tasks}
        onCreateParticipant={props.onCreateParticipant}
        onOpenInitiative={props.onOpenInitiative}
        onOpenTask={props.onOpenTask}
      />
    </EntityDetailPage>
  );
}

function OrganizationCoreModal(props: {
  organization: Organization;
  onCancel: () => void;
  onSave: (input: { name: string; legalName: string | null; organizationType: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(props.organization.name);
  const [legalName, setLegalName] = useState(props.organization.legalName ?? "");
  const [organizationType, setOrganizationType] = useState(props.organization.organizationType ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <EditModal
      title="Organisation bearbeiten"
      label="Organisation bearbeiten"
      className="party-edit-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim() || saving) return;
          setSaving(true);
          setError(null);
          try {
            await props.onSave({
              name: name.trim(),
              legalName: legalName.trim() || null,
              organizationType: organizationType.trim() || null
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Organisation konnte nicht gespeichert werden.");
          } finally {
            setSaving(false);
          }
        }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!name.trim() || saving}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={saving}>Abbrechen</button>
        </>
      )}
    >
        <label>
          Name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Rechtlicher Name
          <input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
        </label>
        <label>
          Typ
          <input value={organizationType} onChange={(event) => setOrganizationType(event.target.value)} />
        </label>
        {error ? <p className="inline-error">{error}</p> : null}
    </EditModal>
  );
}

function OrganizationDescriptionSection(props: {
  organization: Organization;
  onUpdateOrganization: (input: { markdown: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState(props.organization.markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMarkdown(props.organization.markdown);
    setEditing(false);
    setSaving(false);
    setError(null);
  }, [props.organization.id, props.organization.markdown]);

  return (
    <>
      <DescriptionBlock
        text={props.organization.markdown}
        emptyTitle="Noch keine Beschreibung vorhanden."
        onEdit={() => setEditing(true)}
      />
      {editing ? (
        <EditModal
          title="Beschreibung"
          label="Organisationsbeschreibung bearbeiten"
          className="markdown-modal"
          onCancel={() => setEditing(false)}
          onSubmit={async (event) => {
              event.preventDefault();
              if (saving) return;
              setSaving(true);
              setError(null);
              try {
                await props.onUpdateOrganization({ markdown });
                setEditing(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Beschreibung konnte nicht gespeichert werden.");
              } finally {
                setSaving(false);
              }
            }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setEditing(false)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
            <textarea
              autoFocus
              className="initiative-markdown-editor"
              value={markdown}
              rows={18}
              disabled={saving}
              onChange={(event) => setMarkdown(event.target.value)}
            />
            {error ? <p className="inline-error">{error}</p> : null}
        </EditModal>
      ) : null}
    </>
  );
}

function OrganizationRelationsSection(props: {
  organization: Organization;
  people: Person[];
  organizations: Organization[];
  relationshipTypes: RelationshipType[];
  relationships: OrganizationDetail["relationships"];
  onCreateRelationship: (input: {
    fromPartyId: number;
    toPartyId: number;
    relationshipTypeId: number;
    roleLabel?: string | null;
    status?: "active" | "inactive";
  }) => Promise<void>;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const [personManagerOpen, setPersonManagerOpen] = useState(false);
  const [organizationManagerOpen, setOrganizationManagerOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [relationshipTypeId, setRelationshipTypeId] = useState("");
  const [organizationRelationshipTypeId, setOrganizationRelationshipTypeId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [organizationRoleLabel, setOrganizationRoleLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type === "person";
  });
  const existingPersonIds = new Set(memberRelationships.map((relationship) => (
    relationship.fromPartyId === props.organization.id ? relationship.toParty.id : relationship.fromParty.id
  )));
  const availablePeople = props.people.filter((person) => !existingPersonIds.has(person.id));
  const defaultRelationshipType =
    props.relationshipTypes.find((type) => type.key === "member_of")
    ?? props.relationshipTypes.find((type) => type.key === "works_for")
    ?? props.relationshipTypes[0];
  const selectedRelationshipTypeId = relationshipTypeId || (defaultRelationshipType ? String(defaultRelationshipType.id) : "");
  const otherRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type !== "person";
  });
  const existingOrganizationIds = new Set(otherRelationships.map((relationship) => (
    relationship.fromPartyId === props.organization.id ? relationship.toParty.id : relationship.fromParty.id
  )));
  const availableOrganizations = props.organizations.filter((organization) => organization.id !== props.organization.id && !existingOrganizationIds.has(organization.id));
  const defaultOrganizationRelationshipType =
    props.relationshipTypes.find((type) => type.key === "partner_of")
    ?? props.relationshipTypes.find((type) => type.key === "customer_of")
    ?? props.relationshipTypes[0];
  const selectedOrganizationRelationshipTypeId =
    organizationRelationshipTypeId || (defaultOrganizationRelationshipType ? String(defaultOrganizationRelationshipType.id) : "");

  return (
    <SectionBlock title="Beziehungen">
      <div className="relation-section-stack">
        <RelationGroup
          title="Personen"
          emptyMode="none"
          actions={(
            <button type="button" className="section-primary-action" onClick={() => setPersonManagerOpen(true)} disabled={saving || availablePeople.length === 0 || props.relationshipTypes.length === 0}>
              <Plus size={15} />
              Person verknüpfen
            </button>
          )}
        >
          {memberRelationships.map((relationship) => {
          const person = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
          const direction =
            relationship.relationshipType.directionality === "symmetric"
              ? relationship.relationshipType.label
              : relationship.fromPartyId === person.id
                ? relationship.relationshipType.label
                : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
          return (
            <RelationItem
              key={relationship.id}
              icon={<Users size={16} />}
              title={person.displayName}
              meta={[direction, relationship.roleLabel].filter(Boolean).join(" · ")}
              onOpen={() => props.onOpenPerson(person.id)}
            />
          );
          })}
        </RelationGroup>
        <RelationGroup
          title="Organisationen"
          emptyMode="none"
          actions={(
            <button type="button" className="section-primary-action" onClick={() => setOrganizationManagerOpen(true)} disabled={saving || availableOrganizations.length === 0 || props.relationshipTypes.length === 0}>
              <Plus size={15} />
              Organisation verknüpfen
            </button>
          )}
        >
          {otherRelationships.map((relationship) => {
            const otherParty = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
            const label =
              relationship.relationshipType.directionality === "symmetric"
                ? relationship.relationshipType.label
                : relationship.fromPartyId === props.organization.id
                  ? relationship.relationshipType.label
                  : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
            return (
              <RelationItem
                key={relationship.id}
                icon={<Building2 size={16} />}
                title={otherParty.displayName}
                meta={[label, relationship.roleLabel].filter(Boolean).join(" · ")}
                onOpen={() => props.onOpenOrganization(otherParty.id)}
              />
            );
          })}
        </RelationGroup>
      </div>
      {error ? <ErrorState title="Beziehung konnte nicht gespeichert werden" description={error} /> : null}
      {personManagerOpen ? (
        <EditModal
          title="Person verknüpfen"
          label="Person mit Organisation verknüpfen"
          className="party-edit-modal"
          onCancel={() => setPersonManagerOpen(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            const nextPersonId = Number(personId);
            const nextTypeId = Number(selectedRelationshipTypeId);
            if (!nextPersonId || !nextTypeId || saving) return;
            setSaving(true);
            setError(null);
            try {
              await props.onCreateRelationship({
                fromPartyId: nextPersonId,
                toPartyId: props.organization.id,
                relationshipTypeId: nextTypeId,
                roleLabel: roleLabel.trim() || null,
                status: "active"
              });
              setPersonId("");
              setRoleLabel("");
              setPersonManagerOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Beziehung konnte nicht hinzugefügt werden.");
            } finally {
              setSaving(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={!personId || !selectedRelationshipTypeId || saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setPersonManagerOpen(false)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
          <label>
            Person
            <select value={personId} onChange={(event) => setPersonId(event.target.value)} disabled={saving}>
              <option value="">Person auswählen</option>
              {availablePeople.map((person) => (
                <option key={person.id} value={person.id}>{person.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            Beziehung
            <select value={selectedRelationshipTypeId} onChange={(event) => setRelationshipTypeId(event.target.value)} disabled={saving || props.relationshipTypes.length === 0}>
              {props.relationshipTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </label>
          <label>
            Rolle / Kontext
            <input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} disabled={saving} />
          </label>
        </EditModal>
      ) : null}
      {organizationManagerOpen ? (
        <EditModal
          title="Organisation verknüpfen"
          label="Organisation mit Organisation verknüpfen"
          className="party-edit-modal"
          onCancel={() => setOrganizationManagerOpen(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            const nextOrganizationId = Number(organizationId);
            const nextTypeId = Number(selectedOrganizationRelationshipTypeId);
            if (!nextOrganizationId || !nextTypeId || saving) return;
            setSaving(true);
            setError(null);
            try {
              await props.onCreateRelationship({
                fromPartyId: props.organization.id,
                toPartyId: nextOrganizationId,
                relationshipTypeId: nextTypeId,
                roleLabel: organizationRoleLabel.trim() || null,
                status: "active"
              });
              setOrganizationId("");
              setOrganizationRoleLabel("");
              setOrganizationManagerOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Organisation konnte nicht verknüpft werden.");
            } finally {
              setSaving(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={!organizationId || !selectedOrganizationRelationshipTypeId || saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setOrganizationManagerOpen(false)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
          <label>
            Organisation
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={saving}>
              <option value="">Organisation auswählen</option>
              {availableOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            Beziehung
            <select value={selectedOrganizationRelationshipTypeId} onChange={(event) => setOrganizationRelationshipTypeId(event.target.value)} disabled={saving || props.relationshipTypes.length === 0}>
              {props.relationshipTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </label>
          <label>
            Rolle / Kontext
            <input value={organizationRoleLabel} onChange={(event) => setOrganizationRoleLabel(event.target.value)} disabled={saving} />
          </label>
        </EditModal>
      ) : null}
    </SectionBlock>
  );
}

function partyRelationshipLabel(relationship: PartyRelationshipWithParties, perspectivePartyId: number): string {
  const label =
    relationship.relationshipType.directionality === "symmetric"
      ? relationship.relationshipType.label
      : relationship.fromPartyId === perspectivePartyId
        ? relationship.relationshipType.label
        : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
  return [label, relationship.roleLabel].filter(Boolean).join(" · ");
}

function PartyRelationshipsPanel(props: { partyId: number; relationships: PersonDetail["relationships"] }) {
  return (
    <Panel title="Beziehungen">
      <div className="relationship-list">
        {props.relationships.length === 0 ? <p className="muted-text">Noch keine Beziehungen.</p> : null}
        {props.relationships.map((relationship) => {
          const otherParty = relationship.fromPartyId === props.partyId ? relationship.toParty : relationship.fromParty;
          const label =
            relationship.relationshipType.directionality === "symmetric"
              ? relationship.relationshipType.label
              : relationship.fromPartyId === props.partyId
                ? relationship.relationshipType.label
                : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
          return (
            <div className="relationship-row" key={relationship.id}>
              <div className="entity-icon">{otherParty.type === "person" ? <Users size={16} /> : <Building2 size={16} />}</div>
              <div>
                <strong>{otherParty.displayName}</strong>
                <p>{label}{relationship.roleLabel ? ` · ${relationship.roleLabel}` : ""}</p>
              </div>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}

function OrganizationParticipationsSection(props: {
  organization: Organization;
  participants: EntityParticipant[];
  initiatives: Initiative[];
  tasks: Task[];
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
}) {
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const taskById = new Map(props.tasks.map((task) => [task.id, task]));
  const linkedInitiativeIds = new Set(props.participants.filter((participant) => participant.entityType === "initiative").map((participant) => participant.entityId));
  const linkedTaskIds = new Set(props.participants.filter((participant) => participant.entityType === "task").map((participant) => participant.entityId));
  const availableInitiatives = props.initiatives.filter((initiative) => !linkedInitiativeIds.has(initiative.id));
  const availableTasks = props.tasks.filter((task) => !linkedTaskIds.has(task.id));
  const [linkType, setLinkType] = useState<"initiative" | "task" | null>(null);
  const [entityId, setEntityId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availableEntities = linkType === "task" ? availableTasks : availableInitiatives;

  return (
    <SectionBlock
      title="Verknüpfte Initiativen und Maßnahmen"
      actions={(
        <>
          <button
            type="button"
            className="section-primary-action"
            disabled={saving || availableInitiatives.length === 0}
            onClick={() => {
              setLinkType("initiative");
              setEntityId("");
              setRoleLabel("");
            }}
          >
            <Plus size={15} />
            Initiative verknüpfen
          </button>
          <button
            type="button"
            className="section-primary-action"
            disabled={saving || availableTasks.length === 0}
            onClick={() => {
              setLinkType("task");
              setEntityId("");
              setRoleLabel("");
            }}
          >
            <Plus size={15} />
            Maßnahme verknüpfen
          </button>
        </>
      )}
    >
      <RelationList emptyMode="none">
        {props.participants.map((participant) => {
          const title =
            participant.entityType === "initiative"
              ? initiativeById.get(participant.entityId)?.name
              : participant.entityType === "task"
                ? taskById.get(participant.entityId)?.title
                : null;
          return (
            <RelationItem
              key={participant.id}
              icon={participant.entityType === "task" ? <ClipboardList size={16} /> : <Blocks size={16} />}
              title={title ?? `${entityTypeLabel(participant.entityType)} #${participant.entityId}`}
              meta={`${entityTypeLabel(participant.entityType)} · ${participantRoleSummary(participant)}`}
              onOpen={() => {
                if (participant.entityType === "initiative") props.onOpenInitiative(participant.entityId);
                if (participant.entityType === "task") props.onOpenTask(participant.entityId);
              }}
            />
          );
        })}
      </RelationList>
      {error ? <ErrorState title="Verknüpfung konnte nicht gespeichert werden" description={error} /> : null}
      {linkType ? (
        <EditModal
          title={linkType === "task" ? "Maßnahme verknüpfen" : "Initiative verknüpfen"}
          label={linkType === "task" ? "Organisation mit Maßnahme verknüpfen" : "Organisation mit Initiative verknüpfen"}
          className="party-edit-modal"
          onCancel={() => setLinkType(null)}
          onSubmit={async (event) => {
            event.preventDefault();
            const nextEntityId = Number(entityId);
            if (!nextEntityId || saving) return;
            setSaving(true);
            setError(null);
            try {
              await props.onCreateParticipant({
                partyId: props.organization.id,
                entityType: linkType,
                entityId: nextEntityId,
                roleLabel: roleLabel.trim() || null,
                isPrimary: false
              });
              setEntityId("");
              setRoleLabel("");
              setLinkType(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Verknüpfung konnte nicht gespeichert werden.");
            } finally {
              setSaving(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={!entityId || saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setLinkType(null)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
          <label>
            {linkType === "task" ? "Maßnahme" : "Initiative"}
            <select value={entityId} onChange={(event) => setEntityId(event.target.value)} disabled={saving}>
              <option value="">{linkType === "task" ? "Maßnahme auswählen" : "Initiative auswählen"}</option>
              {availableEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>{linkType === "task" ? (entity as Task).title : (entity as Initiative).name}</option>
              ))}
            </select>
          </label>
          <label>
            Rolle / Kontext
            <input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} disabled={saving} />
          </label>
        </EditModal>
      ) : null}
    </SectionBlock>
  );
}

function PartyParticipationsPanel(props: {
  participants: EntityParticipant[];
  initiatives: Initiative[];
  tasks: Task[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
}) {
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const taskById = new Map(props.tasks.map((task) => [task.id, task]));

  return (
    <Panel title="DMAX-Kontexte">
      <div className="relationship-list">
        {props.participants.length === 0 ? <p className="muted-text">Noch keine Beteiligungen.</p> : null}
        {props.participants.map((participant) => {
          const title =
            participant.entityType === "initiative"
              ? initiativeById.get(participant.entityId)?.name
              : participant.entityType === "task"
                ? taskById.get(participant.entityId)?.title
                : null;
          return (
            <button
              type="button"
              className="relationship-row relationship-button"
              key={participant.id}
              onClick={() => {
                if (participant.entityType === "initiative") props.onOpenInitiative(participant.entityId);
                if (participant.entityType === "task") props.onOpenTask(participant.entityId);
              }}
            >
              <div className="entity-icon">{participant.entityType === "task" ? <ClipboardList size={16} /> : <Blocks size={16} />}</div>
              <div>
                <strong>{title ?? `${entityTypeLabel(participant.entityType)} #${participant.entityId}`}</strong>
                <p>{entityTypeLabel(participant.entityType)} · {participantRoleSummary(participant)}</p>
              </div>
            </button>
          );
        })}
      </div>
    </Panel>
  );
}

function entityTypeLabel(entityType: EntityParticipant["entityType"]): string {
  if (entityType === "task") return "Massnahme";
  if (entityType === "calendar_entry") return "Kalendereintrag";
  return "Initiative";
}

function participantRoleSummary(participant: EntityParticipant): string {
  const parts = [participant.roleType?.label, participant.roleLabel].filter((part): part is string => Boolean(part));
  const uniqueParts = [...new Set(parts)];
  if (participant.isPrimary) {
    uniqueParts.push("primär");
  }
  return uniqueParts.length > 0 ? uniqueParts.join(" · ") : "Rolle offen";
}

function salutationLabel(salutation: Person["salutation"]): string {
  if (salutation === "mr") return "Herr";
  if (salutation === "mrs") return "Frau";
  return "Anrede unbekannt";
}

function personHeaderContext(person: Person): string {
  const nameParts = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return [
    person.salutation !== "unknown" ? salutationLabel(person.salutation) : null,
    person.academicTitle,
    nameParts && nameParts !== person.displayName ? nameParts : null,
    person.nameSuffix
  ]
    .filter(Boolean)
    .join(" · ") || "Person";
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

function TaskCreateInlineForm(props: { label?: string; onCreateTask: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className={props.label ? "section-primary-action" : "task-create-inline-button"}
        onClick={() => {
          setOpen(true);
          setTitle("");
        }}
        title={props.label ?? "Massnahme hinzufuegen"}
        aria-label={props.label ?? "Massnahme hinzufuegen"}
      >
        <Plus size={17} />
        {props.label ? <span>{props.label}</span> : null}
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
              <ContextPayloadDebugView payload={selected.contextPayload} finalPromptChars={selected.finalPrompt.length} contextType={selected.contextType} />
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

function ContextPayloadDebugView(props: {
  payload: AppPromptLog["contextPayload"];
  finalPromptChars: number;
  contextType: ConversationContext["type"];
}) {
  const normalized = normalizeContextPayload(props.payload);
  const payload = normalized.payload;
  const loadedEntities = payload?.loadedEntities ?? [];
  const omittedEntities = payload?.omittedEntities ?? [];
  const blocks = payload?.blocks ?? [];
  const deduplications = payload?.deduplications ?? [];
  const truncatedBlocks = blocks.filter((block) => block.truncated);
  const omittedBlocks = blocks.filter((block) => block.omitted);
  const contextMode = formatContextPayloadContext(payload?.context) ?? props.contextType;

  return (
    <section className="prompt-section context-payload-debug">
      <div className="context-debug-heading">
        <div>
          <h3>Context Payload Debug</h3>
          <p>Strukturierte Sicht auf geladene Entities, Budgeting, Truncation und Deduplikation.</p>
        </div>
        <span>{props.finalPromptChars.toLocaleString("de-DE")} chars final prompt</span>
      </div>

      <details className="context-debug-details" open>
        <summary>Overview</summary>
        <div className="context-debug-overview">
          <ContextDebugStat label="Context Mode" value={contextMode} />
          <ContextDebugStat label="Title" value={payload?.title ?? "none"} />
          <ContextDebugStat label="Version" value={formatUnknown(payload?.version)} />
          <ContextDebugStat label="Data Sources" value={(payload?.dataSources ?? []).join(", ") || "none"} />
          <ContextDebugStat label="Loaded Entities" value={String(loadedEntities.length)} />
          <ContextDebugStat label="Omitted Entities" value={String(omittedEntities.length)} tone={omittedEntities.length > 0 ? "warn" : undefined} />
          <ContextDebugStat label="Blocks" value={String(blocks.length)} />
          <ContextDebugStat label="Truncated Blocks" value={String(truncatedBlocks.length)} tone={truncatedBlocks.length > 0 ? "warn" : undefined} />
          <ContextDebugStat label="Omitted Blocks" value={String(omittedBlocks.length)} tone={omittedBlocks.length > 0 ? "warn" : undefined} />
          <ContextDebugStat label="Deduplications" value={String(deduplications.length)} />
        </div>
      </details>

      <EntityDebugSection title="Loaded Entities" entities={loadedEntities} defaultOpen />
      <OmittedEntityDebugSection entities={omittedEntities} defaultOpen={omittedEntities.length > 0} />
      <BlockDebugSection blocks={blocks} defaultOpen={truncatedBlocks.length > 0 || omittedBlocks.length > 0} />
      {deduplications.length > 0 ? <DeduplicationDebugSection deduplications={deduplications} /> : null}
      <JsonDebugSection title="Budgets" value={payload?.budgets ?? []} defaultOpen={false} />
      <JsonDebugSection title="Raw JSON" value={normalized.rawValue} defaultOpen={false} />
      {normalized.warning ? <p className="context-debug-warning">{normalized.warning}</p> : null}
    </section>
  );
}

function ContextDebugStat({ label, value, tone }: { label: string; value: string; tone?: "warn" }) {
  return (
    <div className={tone ? `context-debug-stat ${tone}` : "context-debug-stat"}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function EntityDebugSection({ title, entities, defaultOpen = false }: { title: string; entities: ContextPayloadEntity[]; defaultOpen?: boolean }) {
  const grouped = groupByRole(entities);
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>{title} ({entities.length})</summary>
      {entities.length === 0 ? (
        <p className="muted-text">none</p>
      ) : (
        <div className="context-debug-role-groups">
          {grouped.map(([role, roleEntities]) => (
            <div className="context-debug-role-group" key={role}>
              <h4>{role}</h4>
              <ContextDebugTable
                headers={["Type", "ID", "Title", "Kind", "Chars", "State"]}
                rows={roleEntities.map((entity) => [
                  entity.entityType ?? "unknown",
                  <code>{entity.id ?? "n/a"}</code>,
                  entity.title ?? "none",
                  entity.kind ?? "none",
                  formatOptionalNumber(entity.emittedChars),
                  entity.truncated ? <DebugBadge label="truncated" tone="warn" /> : <DebugBadge label="full" />
                ])}
              />
            </div>
          ))}
        </div>
      )}
    </details>
  );
}

function OmittedEntityDebugSection({ entities, defaultOpen = false }: { entities: ContextPayloadOmittedEntity[]; defaultOpen?: boolean }) {
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>Omitted Entities ({entities.length})</summary>
      {entities.length === 0 ? (
        <p className="muted-text">none</p>
      ) : (
        <ContextDebugTable
          headers={["Role", "Type", "ID", "Title", "Reason", "Original Chars"]}
          rows={entities.map((entity) => [
            entity.role ?? "unknown",
            entity.entityType ?? "unknown",
            <code>{entity.id ?? "n/a"}</code>,
            entity.title ?? "none",
            <DebugBadge label={entity.reason ?? "unknown"} tone="warn" />,
            formatOptionalNumber(entity.originalChars)
          ])}
        />
      )}
    </details>
  );
}

function BlockDebugSection({ blocks, defaultOpen = false }: { blocks: ContextPayloadBlock[]; defaultOpen?: boolean }) {
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>Blocks / Budget & Truncation ({blocks.length})</summary>
      {blocks.length === 0 ? (
        <p className="muted-text">none</p>
      ) : (
        <ContextDebugTable
          headers={["Label", "Kind", "Original", "Emitted", "State", "Reason"]}
          rows={blocks.map((block) => [
            block.label ?? block.id ?? "unnamed",
            block.kind ?? "unknown",
            formatOptionalNumber(block.originalChars),
            formatOptionalNumber(block.emittedChars),
            <span className="context-debug-badge-row">
              {block.truncated ? <DebugBadge label="truncated" tone="warn" /> : null}
              {block.omitted ? <DebugBadge label="omitted" tone="danger" /> : null}
              {!block.truncated && !block.omitted ? <DebugBadge label="full" /> : null}
            </span>,
            block.reason ? <DebugBadge label={block.reason} tone={block.reason === "duplicate" ? "info" : "warn"} /> : "none"
          ])}
        />
      )}
    </details>
  );
}

function DeduplicationDebugSection({ deduplications }: { deduplications: ContextPayloadDeduplication[] }) {
  return (
    <details className="context-debug-details">
      <summary>Deduplications ({deduplications.length})</summary>
      <ContextDebugTable
        headers={["Source Block", "Duplicate Of", "Reason"]}
        rows={deduplications.map((deduplication) => [
          <code>{deduplication.sourceBlock ?? "unknown"}</code>,
          <code>{deduplication.duplicateOf ?? "unknown"}</code>,
          deduplication.reason ?? "none"
        ])}
      />
    </details>
  );
}

function JsonDebugSection({ title, value, defaultOpen = false }: { title: string; value: unknown; defaultOpen?: boolean }) {
  return (
    <details className="context-debug-details" open={defaultOpen}>
      <summary>{title}</summary>
      <pre className="context-debug-json">{formatJson(value)}</pre>
    </details>
  );
}

function ContextDebugTable({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="context-debug-table-wrap">
      <table className="context-debug-table">
        <thead>
          <tr>
            {headers.map((header) => <th key={header}>{header}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex}>
              {row.map((cell, cellIndex) => <td key={cellIndex}>{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DebugBadge({ label, tone }: { label: string; tone?: "warn" | "danger" | "info" }) {
  return <span className={tone ? `context-debug-badge ${tone}` : "context-debug-badge"}>{label}</span>;
}

function normalizeContextPayload(payload: AppPromptLog["contextPayload"]): { payload: ContextPayload | null; rawValue: unknown; warning?: string } {
  if (!payload) {
    return { payload: null, rawValue: {}, warning: "No context payload was stored for this prompt log." };
  }
  if (typeof payload === "string") {
    try {
      const parsed = JSON.parse(payload) as unknown;
      return isRecord(parsed) ? { payload: coerceContextPayload(parsed), rawValue: parsed } : { payload: null, rawValue: payload, warning: "Context payload string did not parse to an object." };
    } catch {
      return { payload: null, rawValue: payload, warning: "Context payload is a string but could not be parsed as JSON." };
    }
  }
  return { payload: coerceContextPayload(payload), rawValue: payload };
}

function coerceContextPayload(value: Record<string, unknown>): ContextPayload {
  return {
    ...value,
    dataSources: stringArray(value.dataSources),
    current: unknownArray(value.current),
    parents: unknownArray(value.parents),
    children: unknownArray(value.children),
    siblings: unknownArray(value.siblings),
    neighbors: unknownArray(value.neighbors),
    related: unknownArray(value.related),
    limits: unknownArray(value.limits),
    notes: stringArray(value.notes),
    loadedEntities: recordArray(value.loadedEntities) as ContextPayloadEntity[],
    omittedEntities: recordArray(value.omittedEntities) as ContextPayloadOmittedEntity[],
    blocks: recordArray(value.blocks) as ContextPayloadBlock[],
    deduplications: recordArray(value.deduplications) as ContextPayloadDeduplication[]
  };
}

function groupByRole<T extends { role?: string }>(items: T[]): Array<[string, T[]]> {
  const order = ["current", "parent", "child", "sibling", "neighbor", "related", "unknown"];
  const grouped = new Map<string, T[]>();
  items.forEach((item) => {
    const key = item.role || "unknown";
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  });
  return [...grouped.entries()].sort(([left], [right]) => order.indexOf(left) - order.indexOf(right));
}

function formatContextPayloadContext(context: unknown): string | null {
  if (!isRecord(context)) return null;
  const type = context.type;
  if (typeof type !== "string") return null;
  const entityId = typeof context.categoryId === "number"
    ? context.categoryId
    : typeof context.initiativeId === "number"
      ? context.initiativeId
      : typeof context.taskId === "number"
        ? context.taskId
        : typeof context.partyId === "number"
          ? context.partyId
          : null;
  return entityId ? `${type} #${entityId}` : type;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function unknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function formatUnknown(value: unknown): string {
  if (value === null || value === undefined) return "n/a";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function formatOptionalNumber(value: unknown): string {
  return typeof value === "number" ? value.toLocaleString("de-DE") : "n/a";
}

function formatJson(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? {}, null, 2);
  } catch {
    return String(value);
  }
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
    people: "Personen",
    person: "Person",
    organizations: "Organisationen",
    organization: "Organisation",
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
    people: "Personen, Anreden und spaetere Kontaktkontexte.",
    person: "Kontaktwege, Beziehungen und Beteiligungen.",
    organizations: "Organisationen als Container und Akteure.",
    organization: "Kontaktwege, Beziehungen und Beteiligungen.",
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
