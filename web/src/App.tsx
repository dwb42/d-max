import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MutableRefObject, ReactNode } from "react";
import {
  Blocks,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Circle,
  ClipboardList,
  Copy,
  FileText,
  GitPullRequestArrow,
  GripVertical,
  Lightbulb,
  LayoutGrid,
  Mic,
  Mic2,
  Pause,
  Play,
  Plus,
  Repeat2,
  Send,
  Square,
  X
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import {
  completeTask,
  createCategory,
  createChatConversation,
  createInitiative,
  createTask,
  createVoiceSession,
  fetchChatActivity,
  fetchChatConversations,
  fetchChatMessages,
  fetchOpenClawStatus,
  fetchOverview,
  fetchInitiatives,
  fetchPromptLogs,
  fetchPromptTemplates,
  fetchInitiativeDetail,
  fetchTaskDetail,
  prewarmOpenClaw,
  reorderCategories,
  reorderInitiatives,
  reorderTasks,
  subscribeStateEvents,
  streamChatMessage,
  transcribeVoiceMessage,
  updateCategory,
  updateInitiative,
  updateTask,
  updateTaskStatus
} from "./api.js";
import type {
  AppOverview,
  AppConversation,
  ConversationContext,
  ChatActivity,
  AppPromptLog,
  PersistedChatMessage,
  OpenClawStatus,
  Initiative,
  InitiativeDetail,
  InitiativeType,
  PromptTemplateDefinition,
  StateEvent,
  Task,
  TaskDetail
} from "./types.js";
import "./styles.css";

type CollectionView = "ideas" | "projects" | "habits";
type View = "drive" | "lifeAreas" | "lifeArea" | "timeline" | CollectionView | "initiative" | "tasks" | "task" | "promptTemplates" | "prompts";
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
  type: InitiativeType;
  name: string;
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
};
type UpdateInitiativeInput = {
  categoryId?: number;
  parentId?: number | null;
  type?: InitiativeType;
  name?: string;
  status?: Initiative["status"];
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
};
type UpdateTaskInput = {
  title?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  notes?: string | null;
  dueAt?: string | null;
};

type NavItem = { id: Exclude<View, "initiative" | "task">; label: string; icon: typeof Mic; path: string };

const primaryNavItems: NavItem[] = [
  { id: "lifeAreas", label: "Lebensbereiche", icon: LayoutGrid, path: "/categories" },
  { id: "ideas", label: "Ideen", icon: Lightbulb, path: "/ideas" },
  { id: "projects", label: "Projekte", icon: Blocks, path: "/projects" },
  { id: "habits", label: "Gewohnheiten", icon: Repeat2, path: "/habits" },
  { id: "tasks", label: "Massnahmen", icon: ClipboardList, path: "/tasks" },
  { id: "timeline", label: "Timeline", icon: CalendarDays, path: "/calendar/timeline" }
];

const secondaryNavItems: NavItem[] = [
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
  if (pathname === "/calendar/timeline") return { view: "timeline", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/chat" || pathname === "/") return { view: "lifeAreas", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/ideas") return { view: "ideas", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/projects") return { view: "projects", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/habits") return { view: "habits", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/tasks") return { view: "tasks", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/prompt-vorlagen") return { view: "promptTemplates", initiativeId: null, taskId: null, categoryName: null };
  if (pathname === "/prompts") return { view: "prompts", initiativeId: null, taskId: null, categoryName: null };
  return { view: "lifeAreas", initiativeId: null, taskId: null, categoryName: null };
}

function pathForRoute(view: View, initiativeId?: number | null): string {
  if (view === "initiative") return `/initiatives/${initiativeId}`;
  if (view === "task") return "/tasks";
  if (view === "lifeAreas") return "/categories";
  if (view === "timeline") return "/calendar/timeline";
  if (view === "promptTemplates") return "/prompt-vorlagen";
  return `/${view}`;
}

function pathForLifeArea(categoryName: string): string {
  return `/categories/${encodeURIComponent(categoryName)}`;
}

function pathForCollectionCategory(view: CollectionView, categoryName: string): string {
  return `/${view}/${encodeURIComponent(categoryName)}`;
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

  if (route.view === "timeline") {
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
  const appShellRef = useRef<HTMLDivElement | null>(null);
  const view = route.view;
  const hasUserCategories = Boolean(overview?.categories.some((category) => !category.isSystem));
  const isEmptyState = Boolean(overview && !hasUserCategories && overview.initiatives.length === 0 && overview.tasks.length === 0);
  const routeConversationContext = useMemo(() => getRouteConversationContext(route, overview, initiativeDetail, taskDetail), [route, overview, initiativeDetail, taskDetail]);
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
    window.history.pushState(null, "", path);
    setRoute(routeFromPath(path));
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
    setChatActivities([]);
    setChatMessages((current) => [...current, optimisticMessage, { id: streamingAssistantId, role: "assistant", text: "" }]);

    try {
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
        }
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
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: err instanceof Error ? err.message : "Chat request failed."
        }
      ]);
    } finally {
      setChatBusy(false);
      setActiveActivityConversationId(null);
      setChatActivities([]);
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
    const onPopState = () => setRoute(routeFromPath(`${window.location.pathname}${window.location.search}`));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

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
            onUpdateInitiative={async (initiativeId, input) => {
              await updateInitiative(initiativeId, input);
              await refresh();
              setInitiativeDetail(await fetchInitiativeDetail(initiativeId));
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
          <LifeAreasView
            categories={overview?.categories ?? []}
            initiatives={lifeAreaInitiatives ?? overview?.initiatives ?? []}
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
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onComplete={async (taskId) => {
              await completeTask(taskId);
              await refresh();
              if (route.initiativeId) setInitiativeDetail(await fetchInitiativeDetail(route.initiativeId));
            }}
            onStatus={async (taskId, status) => {
              await updateTaskStatus(taskId, status);
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
            onUpdateInitiative={async (initiativeId, input) => {
              await updateInitiative(initiativeId, input);
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
          />
          )}
          {!isEmptyState && view === "tasks" && (
          <TasksView
            tasks={overview?.tasks ?? []}
            initiatives={overview?.initiatives ?? []}
            onComplete={async (taskId) => {
              await completeTask(taskId);
              await refresh();
            }}
            onStatus={async (taskId, status) => {
              await updateTaskStatus(taskId, status);
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
          activities={chatActivities}
          voicePhase={chatVoicePhase}
          voiceLevel={chatVoiceLevel}
          onSubmit={(text) => void submitChatMessage(text)}
          onStartVoiceMessage={() => void startChatVoiceMessage()}
          onConfirmVoiceMessage={() => void confirmChatVoiceMessage()}
          onDiscardVoiceMessage={discardChatVoiceMessage}
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
    <button
      key={item.id}
      type="button"
      className={`nav-item ${active ? "active" : ""}`}
      title={item.label}
      aria-current={active ? "page" : undefined}
      onClick={() => navigate(item.path)}
    >
      <Icon size={18} />
      <span>{item.label}</span>
    </button>
  );
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
  activities: ChatActivity[];
  voicePhase: ChatVoicePhase;
  voiceLevel: number;
  onSubmit: (text: string) => void;
  onStartVoiceMessage: () => void;
  onConfirmVoiceMessage: () => void;
  onDiscardVoiceMessage: () => void;
  threadRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const isVoiceActive = props.voicePhase !== "idle";
  const visibleMessages = props.messages.filter((message) => message.text.trim() || message.activities?.length || message.source);
  const latestMessage = props.messages.at(-1);
  const hasCurrentAssistantText = Boolean(latestMessage?.role === "assistant" && latestMessage.text.trim());
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
            <p>DMAX denkt...</p>
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
  activities: ChatActivity[];
  voicePhase: ChatVoicePhase;
  voiceLevel: number;
  onSubmit: (text: string) => void;
  onStartVoiceMessage: () => void;
  onConfirmVoiceMessage: () => void;
  onDiscardVoiceMessage: () => void;
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
        activities={props.activities}
        voicePhase={props.voicePhase}
        voiceLevel={props.voiceLevel}
        onSubmit={props.onSubmit}
        onStartVoiceMessage={props.onStartVoiceMessage}
        onConfirmVoiceMessage={props.onConfirmVoiceMessage}
        onDiscardVoiceMessage={props.onDiscardVoiceMessage}
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

const taskStatusOptions: Array<{ value: Task["status"]; label: string }> = [
  { value: "open", label: "Offen" },
  { value: "in_progress", label: "In Arbeit" },
  { value: "blocked", label: "Blockiert" },
  { value: "done", label: "Erledigt" },
  { value: "cancelled", label: "Abgebrochen" }
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

function displayInitiativeName(project: Pick<Initiative, "name" | "isSystem">): string {
  return project.isSystem && project.name === "Inbox" ? "Task Inbox" : project.name;
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
  const canReorderVisibleInitiatives = true;
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
        </section>
      ))}
      {groups.length === 0 ? <EmptyState title={`Keine ${pluralLabel.toLowerCase()} in dieser Ansicht`} /> : null}
    </section>
  );
}

const timelineMonthOptions = [3, 6, 12, 18];

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
  onOpenTask: (taskId: number) => void;
  onComplete: (taskId: number) => Promise<void>;
  onStatus: (taskId: number, status: string) => Promise<void>;
  onReorderTasks?: (initiativeId: number, taskIds: number[]) => Promise<void>;
  onCreateTask: (initiativeId: number, title: string) => Promise<void>;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
}) {
  if (!props.detail) {
    return <EmptyState title="Loading initiative..." />;
  }

  const initiativeId = props.detail.initiative.id;
  const initiative = props.detail.initiative;
  return (
    <section className="initiative-detail">
      <InitiativeMarkdownPanel initiative={initiative} onUpdateInitiative={props.onUpdateInitiative} />
      <Panel title="Massnahmen">
        {props.detail.tasks.length === 0 ? (
          <EmptyState title="Noch keine Massnahmen" />
        ) : (
          <TasksView
            tasks={props.detail.tasks}
            initiatives={[props.detail.initiative]}
            onComplete={props.onComplete}
            onStatus={props.onStatus}
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
    </section>
  );
}

function InitiativeDetailHeader(props: {
  initiative: Initiative | null;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(props.initiative?.name ?? "");
    setEditingName(false);
    setBusy(false);
  }, [props.initiative?.id, props.initiative?.name]);

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
                onChange={(event) => void props.onUpdateInitiative(initiative.id, { type: event.target.value as InitiativeType })}
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
                onChange={(event) => void props.onUpdateInitiative(initiative.id, { status: event.target.value as Initiative["status"] })}
              >
                {initiativeStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {initiative.isSystem ? <span className="system-badge">System</span> : null}
          </>
        ) : null}
      </div>
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
            <label className={`detail-pill-select task-status ${task.status}`} title="Status ändern">
              <select
                value={task.status}
                disabled={busy}
                aria-label="Task-Status"
                onChange={(event) => void props.onUpdateTask(task.id, { status: event.target.value as Task["status"] })}
              >
                {taskStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
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
  onComplete: (taskId: number) => Promise<void>;
  onStatus: (taskId: number, status: string) => Promise<void>;
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
              void props.onComplete(task.id);
            }}
            title="Complete task"
          >
            {task.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </button>
          <div>
            <h2>{task.title}</h2>
            {showInitiativeName ? (
              <p>{initiativeById.get(task.initiativeId) ? displayInitiativeName(initiativeById.get(task.initiativeId)!) : `Initiative ${task.initiativeId}`}</p>
            ) : null}
          </div>
          <select
            value={task.status}
            onClick={(event) => event.stopPropagation()}
            onChange={(event) => void props.onStatus(task.id, event.target.value)}
          >
            <option value="open">open</option>
            <option value="in_progress">in progress</option>
            <option value="blocked">blocked</option>
            <option value="done">done</option>
            <option value="cancelled">cancelled</option>
          </select>
          <span className={`priority ${task.priority}`}>{task.priority}</span>
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
    timeline: "Timeline",
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
    timeline: "Aktive Projekte entlang der Zeitachse.",
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

function initiativeDateRangeInvalid(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate > endDate);
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
