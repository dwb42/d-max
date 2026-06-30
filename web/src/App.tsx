import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CSSProperties,
  FormEvent,
  MouseEvent as ReactMouseEvent,
  MutableRefObject,
  ReactNode
} from "react";
import {
  Blocks,
  Building2,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  FileText,
  GitPullRequestArrow,
  Image,
  Lightbulb,
  ListTree,
  LayoutGrid,
  LockOpen,
  Menu,
  Mic,
  Paperclip,
  Pencil,
  Plus,
  Repeat2,
  Settings,
  Upload,
  Users,
  X
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import {
  createCategory,
  createOrganization,
  createPerson,
  createPartyRelationship,
  createEntityParticipant,
  createGoogleEventFromDmax,
  createChatConversation,
  createInitiative,
  createInitiativeRelation,
  createTask,
  createTaskChecklistItem,
  createPartyContactPoint,
  createPartyAddress,
  createVoiceSession,
  deletePartyRelationship,
  deleteInitiativeRelation,
  deleteEntityParticipant,
  deletePartyContactPoint,
  deletePartyAddress,
  deleteTask,
  deleteMediaAttachment,
  deleteTaskChecklistItem,
  fetchCalendarView,
  fetchChatActivity,
  fetchChatConversations,
  fetchChatMessages,
  fetchOpenClawStatus,
  fetchOverview,
  fetchInitiatives,
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
  transcribeVoiceMessage,
  updateCategory,
  updateOrganization,
  updatePartyContactPoint,
  updatePartyAddress,
  updatePerson,
  updateInitiative,
  updateMediaAssetAnalysis,
  updateMediaAttachment,
  updateTask,
  updateTaskChecklistItem,
  updateTaskStatus,
  uploadMediaAttachment
} from "./api.js";
import {
  ConfirmModal,
  DescriptionBlock,
  EditModal,
  EmptyState,
  EntityDetailPage,
  EntityHeader,
  ErrorState,
  InlineEditableText,
  MetadataGrid,
  RelationGroup,
  RelationItem,
  RelationList,
  SectionBlock,
  useModalEscape
} from "./components/ui/index.js";
import { AddressBlock, ContactPointList } from "./components/party/index.js";
import type { AddressInput, ContactPointInput } from "./components/party/index.js";
import {
  CategoryCreateModal,
  CategoryListPage,
  HabitCreateModal,
  HabitListPage,
  IdeaCreateModal,
  IdeaListPage,
  OrganizationCreateModal,
  OrganizationListPage,
  PersonCreateModal,
  PersonListPage,
  ProjectCreateModal,
  ProjectListPage,
  TaskCreateModal,
  TaskListPage
} from "./pages/lists/index.js";
import {
  CategoryDetailPage,
  InitiativeDetailHeader,
  InitiativeDetailView,
  OrganizationDetailView,
  PersonHeaderRelations,
  PersonDetailView,
  personDisplayTitle,
  personName,
  TaskDetailView,
  TaskHeaderTitle,
  categoryHeaderFacts,
  taskHeaderFacts
} from "./pages/details/index.js";
import { ConfigView } from "./pages/config/ConfigView.js";
import { PlanningCanvasView } from "./pages/planning/PlanningCanvasView.js";
import { PromptInspectorView, PromptTemplatesView } from "./pages/debug/PromptDebugPages.js";
import { AgentDrawer, DmaxAgentButton, DriveView, ResizeHandle } from "./pages/chat/ChatSurfaces.js";
import type { AudioMeterHandle, ChatMessage, ChatVoicePhase, ContextualAgentState, VoiceState } from "./pages/chat/ChatSurfaces.js";
import { displayInitiativeName, InitiativesView, OnboardingView, TimelineView } from "./pages/overview/InitiativeSurfaces.js";
import type { CreateInitiativeInput } from "./pages/overview/InitiativeSurfaces.js";
import type {
  AppOverview,
  AppConversation,
  Category,
  ConversationContext,
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
  InitiativeType,
  ProjectPhase,
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
type TaskBackTarget =
  | { type: "tasks" }
  | { type: "person"; partyId: number }
  | { type: "initiative"; initiativeId: number };
type DmaxHistoryState = {
  dmaxTaskBackTarget?: TaskBackTarget | null;
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
type RelationshipCreateSlot = "parent" | "child" | "predecessor" | "successor";
type RelationshipCreateDraft = {
  name: string;
  type: Exclude<InitiativeType, "habit">;
  categoryId: string;
};
type NavItem = { id: Exclude<View, "initiative" | "task">; label: string; icon: typeof Mic; path: string };

const primaryNavItems: NavItem[] = [
  { id: "lifeAreas", label: "Lebensbereiche", icon: LayoutGrid, path: "/categories" },
  { id: "ideas", label: "Ideen", icon: Lightbulb, path: "/ideas" },
  { id: "projects", label: "Projekte", icon: Blocks, path: "/projects" },
  { id: "habits", label: "Gewohnheiten", icon: Repeat2, path: "/habits" },
  { id: "tasks", label: "Maßnahmen", icon: ClipboardList, path: "/tasks" },
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

const mobileNavItems: NavItem[] = [...primaryNavItems, ...secondaryNavItems];

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

function readTaskBackTargetFromHistory(): TaskBackTarget | null {
  const state = window.history.state as DmaxHistoryState | null;
  return state?.dmaxTaskBackTarget ?? null;
}

function taskBackTargetFromRoute(route: RouteState): TaskBackTarget | null {
  if (route.view === "tasks") return { type: "tasks" };
  if (route.view === "person" && route.partyId) return { type: "person", partyId: route.partyId };
  if (route.view === "initiative" && route.initiativeId) return { type: "initiative", initiativeId: route.initiativeId };
  return null;
}

function historyStateForTaskBackTarget(taskBackTarget: TaskBackTarget | null): DmaxHistoryState {
  return { dmaxTaskBackTarget: taskBackTarget };
}

function taskBackLinkForTarget(
  taskBackTarget: TaskBackTarget | null,
  currentInitiative: Initiative | null,
  initiatives: Initiative[],
  people: Person[]
): { path: string; label: string; title?: string } | null {
  if (!taskBackTarget) return null;
  if (taskBackTarget.type === "tasks") {
    return { path: "/tasks", label: "Zurück zu Maßnahmen" };
  }
  if (taskBackTarget.type === "person") {
    const person = people.find((candidate) => candidate.id === taskBackTarget.partyId);
    const label = person ? personDisplayTitle(person) : `Person ${taskBackTarget.partyId}`;
    return { path: `/people/${taskBackTarget.partyId}`, label: `Zurück zu „${label}“`, title: label };
  }
  const initiative = currentInitiative?.id === taskBackTarget.initiativeId
    ? currentInitiative
    : initiatives.find((candidate) => candidate.id === taskBackTarget.initiativeId) ?? null;
  const label = initiative ? displayInitiativeName(initiative) : `Initiative ${taskBackTarget.initiativeId}`;
  return { path: `/initiatives/${taskBackTarget.initiativeId}`, label: `Zurück zu „${label}“`, title: label };
}

function partyContextBackLink(
  participants: EntityParticipant[] | undefined,
  initiatives: Initiative[],
  tasks: Task[]
): { path: string; label: string; title?: string } | null {
  if (!participants || participants.length === 0) return null;
  const sortedParticipants = [...participants].sort((left, right) => {
    if (left.isPrimary !== right.isPrimary) return left.isPrimary ? -1 : 1;
    if (left.entityType !== right.entityType) return left.entityType === "task" ? -1 : 1;
    return left.id - right.id;
  });
  const participant = sortedParticipants[0];
  if (!participant) return null;

  if (participant.entityType === "task") {
    const task = tasks.find((candidate) => candidate.id === participant.entityId);
    const label = task?.title ?? `Maßnahme ${participant.entityId}`;
    return { path: `/tasks/${participant.entityId}`, label, title: label };
  }

  if (participant.entityType === "initiative") {
    const initiative = initiatives.find((candidate) => candidate.id === participant.entityId);
    const label = initiative ? displayInitiativeName(initiative) : `Initiative ${participant.entityId}`;
    return { path: `/initiatives/${participant.entityId}`, label, title: label };
  }

  if (participant.entityType === "calendar_entry") {
    const label = `Kalendereintrag ${participant.entityId}`;
    return { path: "/calendar", label, title: label };
  }

  return null;
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

  if (route.view === "tasks") {
    return { context: { type: "tasks" }, label: titleForView(route.view) };
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
      label: personDetail?.person ? personName(personDetail.person) : `Person ${route.partyId}`
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
  const chatMessages = messages.map(chatMessageFromPersisted);
  if (!conversationId) {
    return chatMessages;
  }

  const activities = await fetchChatActivity(conversationId).catch(() => []);
  return attachActivitiesToLastAssistant(chatMessages, activities);
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
    audioDurationMs: message.audioAttachment?.asset.durationMs ?? null,
    researchSummary: message.researchSummary
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

function preferredAudioMimeType(): string {
  const candidates = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
  return candidates.find((candidate) => MediaRecorder.isTypeSupported(candidate)) ?? "";
}

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => routeFromPath(`${window.location.pathname}${window.location.search}`));
  const [taskBackTarget, setTaskBackTarget] = useState<TaskBackTarget | null>(() => readTaskBackTargetFromHistory());
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
  const [chatAutoPlayMessageId, setChatAutoPlayMessageId] = useState<string | null>(null);
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
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
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
    let timeoutId: number | null = null;

    async function loadOpenClawStatus() {
      try {
        const status = await fetchOpenClawStatus();
        if (active) {
          setOpenClawStatus(status);
          timeoutId = window.setTimeout(loadOpenClawStatus, status.state === "ready" ? 15_000 : 2_000);
        }
      } catch (err) {
        if (active) {
          setOpenClawStatus({
            state: "unavailable",
            detail: err instanceof Error ? err.message : "OpenClaw status request failed.",
            checkedAt: new Date().toISOString()
          });
          timeoutId = window.setTimeout(loadOpenClawStatus, 2_000);
        }
      }
    }

    void loadOpenClawStatus();
    return () => {
      active = false;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  useEffect(() => {
    let active = true;

    async function prewarmAndRefreshStatus() {
      try {
        await prewarmOpenClaw(agentTarget.context);
        const status = await fetchOpenClawStatus();
        if (active) {
          setOpenClawStatus(status);
        }
      } catch {
        // The status polling effect owns user-visible availability state.
      }
    }

    void prewarmAndRefreshStatus();
    return () => {
      active = false;
    };
  }, [agentTarget.context, agentTargetKey]);

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
    const nextRoute = routeFromPath(nextPath);
    const nextTaskBackTarget = nextRoute.view === "task" ? taskBackTargetFromRoute(route) : null;
    window.history.pushState(historyStateForTaskBackTarget(nextTaskBackTarget), "", nextPath);
    setTaskBackTarget(nextTaskBackTarget);
    setRoute(nextRoute);
    if (nextRoute.view === "calendar") {
      setCalendarControls(calendarControlsFromPath(nextPath));
    }
  }

  function updateCalendarControls(updater: CalendarControlsState | ((current: CalendarControlsState) => CalendarControlsState)) {
    setCalendarControls((current) => {
      const next = typeof updater === "function" ? updater(current) : updater;
      const nextPath = calendarPathForControls(next);
      window.history.pushState(historyStateForTaskBackTarget(null), "", nextPath);
      setTaskBackTarget(null);
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

  function navigateFromMobileMenu(path: string) {
    setMobileNavOpen(false);
    navigate(path);
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
        throw new Error("Kein aktiver DMAX-Kontext geöffnet.");
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
      if (updated.audioUrl && updated.audioGenerationStatus === "ready") {
        setChatAutoPlayMessageId(updated.id);
      }
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
      const status = await fetchOpenClawStatus();
      setOpenClawStatus(status);
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
        setError(err instanceof Error ? err.message : "Failed to load DMAX state.");
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
      setTaskBackTarget(readTaskBackTargetFromHistory());
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
      window.history.replaceState(historyStateForTaskBackTarget(null), "", nextPath);
      setTaskBackTarget(null);
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
      const tasks = category ? (overview?.tasks ?? []).filter((task) => task.initiativeId !== null && initiatives.some((initiative) => initiative.id === task.initiativeId)) : [];
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
      const taskBackLink = taskBackLinkForTarget(taskBackTarget, initiative, overview?.initiatives ?? [], peopleList ?? []);
      const taskContextLink = initiative
        ? {
            path: `/initiatives/${initiative.id}`,
            label: displayInitiativeName(initiative),
            title: displayInitiativeName(initiative)
          }
        : taskBackLink;
      const taskHeader = taskLoadError ? (
        <EntityHeader
          title="Maßnahme nicht gefunden"
          subtitle="Die Maßnahme existiert nicht oder konnte nicht geladen werden."
        />
      ) : (
        <EntityHeader
          icon={<ClipboardList size={20} />}
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
          {taskContextLink ? (
            <div className="back-actions">
              <div className="back-action-group">
                <button className="small-button back-button truncate" onClick={() => navigate(taskContextLink.path)} title={taskContextLink.title}>
                  {taskContextLink.label}
                </button>
              </div>
            </div>
          ) : null}
          {taskHeader}
        </div>
      );
    }

    if (view === "person") {
      const person = personDetail?.person ?? null;
      const personContextBackLink = partyContextBackLink(personDetail?.participants, overview?.initiatives ?? [], overview?.tasks ?? []);
      const personHeader = personLoadError ? (
        <EntityHeader
          title="Person nicht gefunden"
          subtitle="Der Eintrag konnte nicht geladen werden."
        />
      ) : (
        <EntityHeader
          icon={<Users size={20} />}
          title={person ? personDisplayTitle(person) : "Person"}
          subtitleContent={person && personDetail ? (
            <PersonHeaderRelations
              person={person}
              relationships={personDetail.relationships}
              onOpenPerson={(partyId) => navigate(`/people/${partyId}`)}
              onOpenOrganization={(partyId) => navigate(`/organizations/${partyId}`)}
            />
          ) : person ? null : "Wird geladen"}
          secondaryActions={personDetail ? (
            <button
              type="button"
              className="small-button header-secondary-action"
              onClick={() => setPersonCoreModalOpen(true)}
              title="Person anpassen"
            >
              <Pencil size={15} />
              Anpassen
            </button>
          ) : null}
        />
      );
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button
                className="small-button back-button truncate"
                onClick={() => navigate(personContextBackLink?.path ?? "/people")}
                title={personContextBackLink?.title}
              >
                {personContextBackLink?.label ?? "Zurück zu Personen"}
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
      const organizationContextBackLink = partyContextBackLink(organizationDetail?.participants, overview?.initiatives ?? [], overview?.tasks ?? []);
      return (
        <div className="content-header-title">
          <div className="back-actions">
            <div className="back-action-group">
              <button
                className="small-button back-button truncate"
                onClick={() => navigate(organizationContextBackLink?.path ?? "/organizations")}
                title={organizationContextBackLink?.title}
              >
                {organizationContextBackLink?.label ?? "Zurück zu Organisationen"}
              </button>
            </div>
          </div>
          <EntityHeader
            icon={<Building2 size={20} />}
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
                title="Organisation anpassen"
              >
                <Pencil size={15} />
                Anpassen
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
            <button
              type="button"
              className="mobile-nav-toggle"
              aria-label={mobileNavOpen ? "Navigation schließen" : "Navigation öffnen"}
              title={mobileNavOpen ? "Navigation schließen" : "Navigation öffnen"}
              aria-expanded={mobileNavOpen}
              aria-controls="mobile-main-navigation"
              onClick={() => setMobileNavOpen((current) => !current)}
            >
              {mobileNavOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>

          <nav className="nav primary-nav">
            {primaryNavItems.map((item) => renderNavItem(item, view, initiativeDetail, navigate))}
          </nav>
        </div>

        <nav id="mobile-main-navigation" className={`nav mobile-nav ${mobileNavOpen ? "open" : ""}`} aria-label="Hauptnavigation">
          {mobileNavItems.map((item) => renderNavItem(item, view, initiativeDetail, navigateFromMobileMenu))}
        </nav>

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
            <CategoryListPage
              categories={overview.categories}
              initiatives={lifeAreaInitiatives ?? overview.initiatives}
              tasks={overview.tasks}
              onOpenLifeArea={(categoryName) => navigate(pathForLifeArea(categoryName))}
            />
            ) : <EmptyState title="Lebensbereiche werden geladen" />
          )}
          {view === "lifeArea" && (
          <CategoryDetailPage
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
          <IdeaListPage
            categories={overview?.categories ?? []}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            categoryFilterName={route.categoryName}
            onOpenIdea={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onCreateClick={() => setIdeaCreateModalOpen(true)}
          />
          )}
          {!isEmptyState && view === "projects" && (
          <ProjectListPage
            categories={overview?.categories ?? []}
            initiatives={overview?.initiatives ?? []}
            tasks={overview?.tasks ?? []}
            categoryFilterName={route.categoryName}
            onOpenProject={(initiativeId) => navigate(`/initiatives/${initiativeId}`)}
            onCreateClick={() => setProjectCreateModalOpen(true)}
          />
          )}
          {!isEmptyState && view === "habits" && (
          <HabitListPage
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
            onOpenPerson={(partyId) => navigate(`/people/${partyId}`)}
            onOpenOrganization={(partyId) => navigate(`/organizations/${partyId}`)}
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
            projects={(overview?.initiatives ?? []).filter((initiative) => initiative.type === "project")}
            categories={overview?.categories ?? []}
            people={peopleList ?? []}
            organizations={organizationList ?? []}
            participantRoleTypes={participantRoleTypes}
            onCreateParticipant={async (input) => {
              await createEntityParticipant(input);
              if (route.taskId) setTaskDetail(await fetchTaskDetail(route.taskId));
            }}
            onDeleteParticipant={async (participantId) => {
              await deleteEntityParticipant(participantId);
              if (route.taskId) setTaskDetail(await fetchTaskDetail(route.taskId));
            }}
            onOpenPerson={(partyId) => navigate(`/people/${partyId}`)}
            onOpenOrganization={(partyId) => navigate(`/organizations/${partyId}`)}
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onUpdateTask={async (taskId, input) => {
              await updateTask(taskId, input);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onMoveTask={async (taskId, targetProjectId) => {
              await updateTask(taskId, { initiativeId: targetProjectId });
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
          <TaskListPage
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
          <PersonListPage
            people={peopleList ?? []}
            onOpenPerson={(partyId) => navigate(`/people/${partyId}`)}
            onCreateClick={() => setPersonCreateModalOpen(true)}
          />
          )}
          {view === "organizations" && (
          <OrganizationListPage
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
            people={peopleList ?? []}
            organizations={organizationList ?? []}
            relationshipTypes={relationshipTypes}
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
            onCreateRelationship={async (input) => {
              await createPartyRelationship(input);
              if (route.partyId) setPersonDetail(await fetchPersonDetail(route.partyId));
            }}
            onDeleteRelationship={async (relationshipId) => {
              await deletePartyRelationship(relationshipId);
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
          agentStatus={openClawStatus}
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
          autoPlayAudioMessageId={chatAutoPlayMessageId}
          onAutoPlayAudioSettled={() => setChatAutoPlayMessageId(null)}
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

function sortTasksByCompletionAndRank(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const statusCompare = taskCompletionRank(a.status) - taskCompletionRank(b.status);
    return statusCompare || a.sortOrder - b.sortOrder || a.id - b.id;
  });
}

function taskCompletionRank(status: Task["status"]): number {
  return status === "done" ? 1 : 0;
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
    task: "Maßnahme",
    prompts: "Prompt Inspector",
    promptTemplates: "Prompt-Vorlagen",
    tasks: "Maßnahmen"
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
    prompts: "Debug view for DMAX prompts sent to OpenClaw.",
    promptTemplates: "Kontextabhängige Vorlagen für DMAX und OpenClaw.",
    tasks: "Konkrete Maßnahmen über aktive Einträge hinweg."
  }[view];
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
