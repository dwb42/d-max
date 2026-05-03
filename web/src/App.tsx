import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MutableRefObject, ReactNode } from "react";
import {
  Blocks,
  CalendarDays,
  CheckCircle2,
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
  createProject,
  createVoiceSession,
  fetchChatActivity,
  fetchChatConversations,
  fetchChatMessages,
  fetchOpenClawStatus,
  fetchOverview,
  fetchProjects,
  fetchPromptLogs,
  fetchPromptTemplates,
  fetchProjectDetail,
  fetchTaskDetail,
  prewarmOpenClaw,
  reorderCategories,
  reorderProjects,
  reorderTasks,
  subscribeStateEvents,
  streamChatMessage,
  transcribeVoiceMessage,
  updateCategory,
  updateProject,
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
  Project,
  ProjectDetail,
  ProjectType,
  PromptTemplateDefinition,
  StateEvent,
  Task,
  TaskDetail
} from "./types.js";
import "./styles.css";

type CollectionView = "ideas" | "projects" | "habits";
type View = "drive" | "lifeAreas" | "lifeArea" | "timeline" | CollectionView | "project" | "tasks" | "task" | "promptTemplates" | "prompts";
type RouteState = {
  view: View;
  projectId: number | null;
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

type NavItem = { id: Exclude<View, "project" | "task">; label: string; icon: typeof Mic; path: string };

const primaryNavItems: NavItem[] = [
  { id: "lifeAreas", label: "Lebensbereiche", icon: LayoutGrid, path: "/lebensbereiche" },
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
  const lifeAreaMatch = pathname.match(/^\/lebensbereiche\/([^/]+)$/);
  if (lifeAreaMatch) {
    return { view: "lifeArea", projectId: null, taskId: null, categoryName: decodeURIComponent(lifeAreaMatch[1] ?? "") };
  }
  const ideaCategoryMatch = pathname.match(/^\/ideas\/([^/]+)$/);
  if (ideaCategoryMatch) {
    return { view: "ideas", projectId: null, taskId: null, categoryName: decodeURIComponent(ideaCategoryMatch[1] ?? "") };
  }
  const projectMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch) {
    return { view: "project", projectId: Number(projectMatch[1]), taskId: null, categoryName: null };
  }
  const categoryMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (categoryMatch) {
    return { view: "projects", projectId: null, taskId: null, categoryName: decodeURIComponent(categoryMatch[1] ?? "") };
  }
  const habitCategoryMatch = pathname.match(/^\/habits\/([^/]+)$/);
  if (habitCategoryMatch) {
    return { view: "habits", projectId: null, taskId: null, categoryName: decodeURIComponent(habitCategoryMatch[1] ?? "") };
  }
  const taskMatch = pathname.match(/^\/tasks\/(\d+)$/);
  if (taskMatch) {
    return { view: "task", projectId: null, taskId: Number(taskMatch[1]), categoryName: null };
  }

  if (pathname === "/drive") return { view: "drive", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/lebensbereiche") return { view: "lifeAreas", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/calendar/timeline") return { view: "timeline", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/chat" || pathname === "/") return { view: "lifeAreas", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/ideas") return { view: "ideas", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/projects") return { view: "projects", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/habits") return { view: "habits", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/tasks") return { view: "tasks", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/prompt-vorlagen") return { view: "promptTemplates", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/prompts") return { view: "prompts", projectId: null, taskId: null, categoryName: null };
  return { view: "lifeAreas", projectId: null, taskId: null, categoryName: null };
}

function pathForRoute(view: View, projectId?: number | null): string {
  if (view === "project") return `/projects/${projectId}`;
  if (view === "task") return "/tasks";
  if (view === "lifeAreas") return "/lebensbereiche";
  if (view === "timeline") return "/calendar/timeline";
  if (view === "promptTemplates") return "/prompt-vorlagen";
  return `/${view}`;
}

function pathForLifeArea(categoryName: string): string {
  return `/lebensbereiche/${encodeURIComponent(categoryName)}`;
}

function pathForCollectionCategory(view: CollectionView, categoryName: string): string {
  return `/${view}/${encodeURIComponent(categoryName)}`;
}

function collectionViewForProjectType(type: ProjectType): CollectionView {
  if (type === "idea") return "ideas";
  if (type === "habit") return "habits";
  return "projects";
}

function getRouteConversationContext(
  route: RouteState,
  overview: AppOverview | null,
  projectDetail: ProjectDetail | null,
  taskDetail: TaskDetail | null
): { context: ConversationContext; label: string } | null {
  if ((isCollectionView(route.view) || route.view === "lifeArea") && route.categoryName) {
    const category = overview?.categories.find((candidate) => candidate.name.toLowerCase() === route.categoryName?.toLowerCase());
    return category ? { context: { type: "category", categoryId: category.id }, label: category.name } : null;
  }

  if (isCollectionView(route.view)) {
    return { context: { type: "projects" }, label: titleForView(route.view) };
  }

  if (route.view === "lifeAreas" || route.view === "timeline") {
    return { context: { type: "projects" }, label: titleForView(route.view) };
  }

  if (route.view === "project" && route.projectId) {
    return {
      context: { type: "project", projectId: route.projectId },
      label: projectDetail?.project.name ?? `Project ${route.projectId}`
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

  if (context.type === "global" || context.type === "projects") {
    return context.type;
  }

  if (context.type === "category") {
    return `category:${context.categoryId}`;
  }

  if (context.type === "project") {
    return `project:${context.projectId}`;
  }

  return `task:${context.taskId}`;
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
  const [lifeAreaProjects, setLifeAreaProjects] = useState<Project[] | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
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
  const isEmptyState = Boolean(overview && !hasUserCategories && overview.projects.length === 0 && overview.tasks.length === 0);
  const routeConversationContext = useMemo(() => getRouteConversationContext(route, overview, projectDetail, taskDetail), [route, overview, projectDetail, taskDetail]);
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
      await fetchProjects()
        .then(setLifeAreaProjects)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load initiatives."));
    }

    if (route.view === "project" && route.projectId) {
      await fetchProjectDetail(route.projectId)
        .then(setProjectDetail)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load project."));
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
    if (route.view !== "project" || !route.projectId) {
      setProjectDetail(null);
      return;
    }

    fetchProjectDetail(route.projectId)
      .then(setProjectDetail)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load project."));
  }, [route]);

  useEffect(() => {
    if (route.view !== "lifeAreas" && route.view !== "lifeArea") {
      setLifeAreaProjects(null);
      return;
    }

    fetchProjects()
      .then(setLifeAreaProjects)
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

  return (
    <div
      className={`app-shell ${agentDrawer.open ? "with-agent-drawer" : ""}`}
      ref={appShellRef}
      style={{ "--agent-drawer-width": `${agentDrawerWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <button className="brand brand-link" onClick={() => navigate("/projects")} title="Zur Startseite">
          <div className="brand-mark">D</div>
          <div>
            <div className="brand-name">MAX</div>
          </div>
        </button>

        <nav className="nav primary-nav">
          {primaryNavItems.map((item) => renderNavItem(item, view, projectDetail, navigate))}
        </nav>

        <nav className="nav secondary-nav">
          {secondaryNavItems.map((item) => renderNavItem(item, view, projectDetail, navigate))}
        </nav>
      </aside>

      <main className="main">
        <DmaxAgentButton
          status={openClawStatus}
          active={agentDrawer.open && conversationContextKey(agentDrawer.context) === agentTargetKey}
          onClick={() => toggleContextualAgent(agentTarget.context, agentTarget.label)}
        />
        {view !== "project" && view !== "task" && view !== "lifeArea" ? (
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
        ) : null}

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
            projects={lifeAreaProjects ?? overview?.projects ?? []}
            onOpenLifeArea={(categoryName) => navigate(pathForLifeArea(categoryName))}
            onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
          />
        )}
        {view === "lifeArea" && (
          <LifeAreaDetailView
            category={overview?.categories.find((category) => category.name.toLowerCase() === route.categoryName?.toLowerCase()) ?? null}
            projects={lifeAreaProjects ?? overview?.projects ?? []}
            onBack={() => navigate("/lebensbereiche")}
            onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
            onUpdateCategory={async (categoryId, input) => {
              await updateCategory(categoryId, input);
              await refresh();
            }}
          />
        )}
        {!isEmptyState && view === "timeline" && (
          <TimelineView
            categories={overview?.categories ?? []}
            projects={overview?.projects ?? []}
            onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
          />
        )}
        {!isEmptyState && isCollectionView(view) && (
          <ProjectsView
            categories={overview?.categories ?? []}
            projects={overview?.projects ?? []}
            tasks={overview?.tasks ?? []}
            projectType={projectTypeForCollectionView(view)}
            singularLabel={singularLabelForCollectionView(view)}
            pluralLabel={titleForView(view)}
            categoryFilterName={route.categoryName}
            onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
            onOpenCategory={(categoryName) => navigate(pathForCollectionCategory(view, categoryName))}
            onReorderCategories={async (categoryIds) => {
              await reorderCategories(categoryIds);
              await refresh();
            }}
            onReorderProjects={async (categoryId, projectIds) => {
              await reorderProjects(categoryId, projectIds);
              await refresh();
            }}
            onCreateProject={async (input) => {
              try {
                setError(null);
                const project = await createProject(input);
                await refresh();
                navigate(`/projects/${project.id}`);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Eintrag konnte nicht angelegt werden.");
                throw err;
              }
            }}
          />
        )}
        {!isEmptyState && view === "project" && (
          <ProjectDetailView
            detail={projectDetail}
            categories={overview?.categories ?? []}
            onBack={() => navigate(`/${collectionViewForProjectType(projectDetail?.project.type ?? "project")}`)}
            onBackToCategory={(categoryName) =>
              navigate(pathForCollectionCategory(collectionViewForProjectType(projectDetail?.project.type ?? "project"), categoryName))
            }
            onOpenTask={(taskId) => navigate(`/tasks/${taskId}`)}
            onComplete={async (taskId) => {
              await completeTask(taskId);
              await refresh();
              if (route.projectId) setProjectDetail(await fetchProjectDetail(route.projectId));
            }}
            onStatus={async (taskId, status) => {
              await updateTaskStatus(taskId, status);
              await refresh();
              if (route.projectId) setProjectDetail(await fetchProjectDetail(route.projectId));
            }}
            onReorderTasks={async (projectId, taskIds) => {
              await reorderTasks(projectId, taskIds);
              await refresh();
              if (route.projectId) setProjectDetail(await fetchProjectDetail(route.projectId));
            }}
            onUpdateProject={async (projectId, input) => {
              await updateProject(projectId, input);
              await refresh();
              setProjectDetail(await fetchProjectDetail(projectId));
            }}
          />
        )}
        {!isEmptyState && view === "task" && (
          <TaskDetailView
            detail={taskDetail}
            onBack={() => navigate("/tasks")}
            onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
            onComplete={async (taskId) => {
              await completeTask(taskId);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
            onStatus={async (taskId, status) => {
              await updateTaskStatus(taskId, status);
              await refresh();
              setTaskDetail(await fetchTaskDetail(taskId));
            }}
          />
        )}
        {!isEmptyState && view === "tasks" && (
          <TasksView
            tasks={overview?.tasks ?? []}
            projects={overview?.projects ?? []}
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
  projectDetail: ProjectDetail | null,
  navigate: (path: string) => void
) {
  const Icon = item.icon;
  const active =
    view === item.id
    || (view === "lifeArea" && item.id === "lifeAreas")
    || (view === "project" && projectDetail?.project.type && collectionViewForProjectType(projectDetail.project.type) === item.id)
    || (view === "task" && item.id === "tasks");

  return (
    <button key={item.id} className={`nav-item ${active ? "active" : ""}`} onClick={() => navigate(item.path)}>
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
  const hasStreamingAssistantText = props.messages.some((message) => message.role === "assistant" && message.text.trim());
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
        {props.busy && !hasStreamingAssistantText ? (
          <article className="chat-message assistant pending">
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
            <p>d-max denkt...</p>
            {props.activities.length ? <ActivityTrail activities={props.activities} /> : null}
          </article>
        ) : null}
      </div>

      <form
        className="chat-composer"
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
            <SoundWave level={props.voiceLevel} active />
            <div className="voice-message-copy">
              <strong>Voice Message aufnehmen</strong>
              <p>Sprich deine Nachricht. Der Text wird erst nach deiner Bestätigung erzeugt.</p>
            </div>
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
            <span className="loading-dots">
              <i />
              <i />
              <i />
            </span>
            <div className="voice-message-copy">
              <strong>Transkription läuft</strong>
              <p>Die bestätigte Aufnahme wird in bearbeitbaren Text umgewandelt.</p>
            </div>
          </div>
        ) : null}
        <div className="chat-actions">
          <button
            type="button"
            className="secondary-action compact"
            onClick={props.onStartVoiceMessage}
            disabled={props.busy || isVoiceActive}
          >
            <Mic2 size={18} />
            Voice Message
          </button>
          <button type="submit" className="primary-action compact" disabled={props.busy || isVoiceActive || !props.draft.trim()}>
            <Send size={18} />
            {props.busy ? "Sending" : "Send"}
          </button>
        </div>
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

function isCollectionView(view: View): view is CollectionView {
  return view === "ideas" || view === "projects" || view === "habits";
}

function projectTypeForCollectionView(view: CollectionView): ProjectType {
  if (view === "ideas") return "idea";
  if (view === "habits") return "habit";
  return "project";
}

function singularLabelForCollectionView(view: CollectionView): string {
  if (view === "ideas") return "Idee";
  if (view === "habits") return "Gewohnheit";
  return "Projekt";
}

const projectTypeOptions: Array<{ value: ProjectType; label: string }> = [
  { value: "idea", label: "Idee" },
  { value: "project", label: "Projekt" },
  { value: "habit", label: "Gewohnheit" }
];

function projectTypeLabel(type: ProjectType): string {
  return projectTypeOptions.find((option) => option.value === type)?.label ?? "Eintrag";
}

function preferredCategoryId(categories: AppOverview["categories"], categoryFilterName: string | null): number {
  const categoryFromRoute = categoryFilterName
    ? categories.find((category) => category.name.toLowerCase() === categoryFilterName.toLowerCase())
    : null;
  return categoryFromRoute?.id ?? categories.find((category) => category.name === "Inbox")?.id ?? categories[0]?.id ?? 0;
}

function defaultProjectMarkdown(type: ProjectType, name: string): string {
  if (type === "idea") {
    return `# Gedanke\n\n${name}\n\n# Offene Fragen\n\n- \n`;
  }

  if (type === "habit") {
    return `# Praxis\n\n${name}\n\n# Rhythmus\n\nNoch offen.\n\n# Reflexion\n\nNoch keine Reflexion.\n`;
  }

  return `# Ziel\n\n${name}\n\n# Kontext\n\nNoch offen.\n\n# Naechste Massnahmen\n\n- \n`;
}

function ProjectTypeBadge({ type }: { type: ProjectType }) {
  return <span className={`type-badge ${type}`}>{projectTypeLabel(type)}</span>;
}

function displayProjectName(project: Pick<Project, "name" | "isSystem">): string {
  return project.isSystem && project.name === "Inbox" ? "Task Inbox" : project.name;
}

function propsCountLabel(count: number, singularLabel: string, pluralLabel: string): string {
  return count === 1 ? singularLabel : pluralLabel;
}

function LifeAreasView(props: {
  categories: AppOverview["categories"];
  projects: Project[];
  onOpenLifeArea: (categoryName: string) => void;
  onOpenProject: (projectId: number) => void;
}) {
  const groups = props.categories.map((category) => {
    const initiatives = props.projects.filter((project) => project.categoryId === category.id);
    return {
      category,
      initiatives,
      byType: projectTypeOptions.map((option) => ({
        ...option,
        projects: initiatives.filter((project) => project.type === option.value)
      }))
    };
  });

  return (
    <section className="life-area-view">
      {groups.map((group) => (
        <section className="life-area-section" key={group.category.id}>
          <div className="life-area-heading">
            <div>
              <span className="life-area-color" style={{ background: group.category.color }} />
              <button className="life-area-title-link" onClick={() => props.onOpenLifeArea(group.category.name)}>
                {group.category.name}
              </button>
              {group.category.isSystem ? <span className="system-badge">System</span> : null}
            </div>
            <span>{group.initiatives.length} {propsCountLabel(group.initiatives.length, "Initiative", "Initiatives")}</span>
          </div>
          {group.category.description ? <p className="life-area-description">{firstMarkdownLine(group.category.description)}</p> : null}

          <LifeAreaInitiativeGroups groups={group.byType} onOpenProject={props.onOpenProject} />
        </section>
      ))}
      {groups.length === 0 ? <EmptyState title="Noch keine Lebensbereiche" /> : null}
    </section>
  );
}

function LifeAreaDetailView(props: {
  category: AppOverview["categories"][number] | null;
  projects: Project[];
  onBack: () => void;
  onOpenProject: (projectId: number) => void;
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
  const initiatives = props.projects.filter((project) => project.categoryId === category.id);
  const groups = projectTypeOptions.map((option) => ({
    ...option,
    projects: initiatives.filter((project) => project.type === option.value)
  }));

  return (
    <section className="project-detail life-area-detail">
      <div className="back-actions">
        <div className="back-action-group">
          <button className="small-button back-button" onClick={props.onBack}>
            Zurueck zu Lebensbereiche
          </button>
        </div>
      </div>

      <div className="section-heading">
        <div className="project-title-line">
          <span className="life-area-color large" style={{ background: category.color }} />
          <h2>{category.name}</h2>
          {category.isSystem ? <span className="system-badge">System</span> : null}
        </div>
        <p>{category.description ? firstMarkdownLine(category.description) : `${initiatives.length} ${propsCountLabel(initiatives.length, "Initiative", "Initiatives")}`}</p>
      </div>

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
        <LifeAreaInitiativeGroups groups={groups} onOpenProject={props.onOpenProject} />
      </section>
    </section>
  );
}

function LifeAreaInitiativeGroups(props: {
  groups: Array<{ value: ProjectType; label: string; projects: Project[] }>;
  onOpenProject: (projectId: number) => void;
}) {
  return (
    <div className="life-area-type-grid">
      {props.groups.map((typeGroup) => (
        <section className="life-area-type-section" key={typeGroup.value}>
          <div className="life-area-type-heading">
            <ProjectTypeBadge type={typeGroup.value} />
            <span>{typeGroup.projects.length}</span>
          </div>
          {typeGroup.projects.length === 0 ? (
            <div className="life-area-empty">Keine {typeGroup.label.toLowerCase()}.</div>
          ) : (
            <div className="life-area-initiative-list">
              {typeGroup.projects.map((project) => (
                <button className="life-area-initiative-row" key={project.id} onClick={() => props.onOpenProject(project.id)}>
                  <span>{displayProjectName(project)}</span>
                  <small>
                    {project.type === "project" && formatProjectDateRangeForUi(project) ? `${formatProjectDateRangeForUi(project)} · ` : ""}
                    {project.status}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>
      ))}
    </div>
  );
}

function ProjectsView({
  categories,
  projects,
  tasks,
  projectType,
  singularLabel,
  pluralLabel,
  categoryFilterName,
  onOpenProject,
  onOpenCategory,
  onReorderCategories,
  onReorderProjects,
  onCreateProject
}: {
  categories: AppOverview["categories"];
  projects: Project[];
  tasks: Task[];
  projectType: ProjectType;
  singularLabel: string;
  pluralLabel: string;
  categoryFilterName: string | null;
  onOpenProject: (projectId: number) => void;
  onOpenCategory: (categoryName: string) => void;
  onReorderCategories: (categoryIds: number[]) => Promise<void>;
  onReorderProjects: (categoryId: number, projectIds: number[]) => Promise<void>;
  onCreateProject: (input: {
    categoryId: number;
    type: ProjectType;
    name: string;
    summary?: string | null;
    markdown?: string;
    startDate?: string | null;
    endDate?: string | null;
  }) => Promise<void>;
}) {
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [categoryDropId, setCategoryDropId] = useState<number | null>(null);
  const [draggedProject, setDraggedProject] = useState<{ categoryId: number; projectId: number } | null>(null);
  const [projectDropId, setProjectDropId] = useState<number | null>(null);
  const [newProjectCategoryId, setNewProjectCategoryId] = useState<number>(() => preferredCategoryId(categories, categoryFilterName));
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectStartDate, setNewProjectStartDate] = useState("");
  const [newProjectEndDate, setNewProjectEndDate] = useState("");
  const [creatingProject, setCreatingProject] = useState(false);
  const visibleCategories = categoryFilterName
    ? categories.filter((category) => category.name.toLowerCase() === categoryFilterName.toLowerCase())
    : categories;
  const visibleProjects = projects.filter((project) => project.type === projectType);
  const groupedProjects = visibleCategories
    .map((category) => ({
      category,
      projects: visibleProjects.filter((project) => project.categoryId === category.id)
    }))
    .filter((group) => group.projects.length > 0);
  const uncategorizedProjects = categoryFilterName ? [] : visibleProjects.filter((project) => !categories.some((category) => category.id === project.categoryId));
  const groups = uncategorizedProjects.length > 0
    ? [...groupedProjects, { category: { id: 0, name: "Uncategorized", description: null, isSystem: false }, projects: uncategorizedProjects }]
    : groupedProjects;
  const reorderableCategoryIds = groups.map((group) => group.category.id).filter((id) => id > 0);
  const canReorderVisibleProjects = true;
  const selectedCategoryId = categories.some((category) => category.id === newProjectCategoryId)
    ? newProjectCategoryId
    : preferredCategoryId(categories, categoryFilterName);
  const hasDateFields = projectType === "project";
  const hasInvalidNewProjectDateRange = hasDateFields && projectDateRangeInvalid(newProjectStartDate, newProjectEndDate);

  useEffect(() => {
    const preferred = preferredCategoryId(categories, categoryFilterName);
    if (categoryFilterName || !categories.some((category) => category.id === newProjectCategoryId)) {
      setNewProjectCategoryId(preferred);
    }
  }, [categories, categoryFilterName, newProjectCategoryId]);

  return (
    <section className="project-grid">
      <form
        className={`entry-create ${hasDateFields ? "with-dates" : ""}`}
        onSubmit={async (event) => {
          event.preventDefault();
          const name = newProjectName.trim();
          if (!name || !selectedCategoryId || creatingProject || hasInvalidNewProjectDateRange) {
            return;
          }
          setCreatingProject(true);
          try {
            await onCreateProject({
              categoryId: selectedCategoryId,
              type: projectType,
              name,
              markdown: defaultProjectMarkdown(projectType, name),
              startDate: hasDateFields ? newProjectStartDate || null : undefined,
              endDate: hasDateFields ? newProjectEndDate || null : undefined
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
          value={newProjectName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder={`${singularLabel} benennen`}
        />
        {hasDateFields ? (
          <div className="entry-date-fields">
            <label>
              Start
              <input
                type="date"
                value={newProjectStartDate}
                onChange={(event) => setNewProjectStartDate(event.target.value)}
                aria-label="Startdatum"
              />
            </label>
            <label>
              Ende
              <input
                type="date"
                value={newProjectEndDate}
                min={newProjectStartDate || undefined}
                onChange={(event) => setNewProjectEndDate(event.target.value)}
                aria-label="Enddatum"
              />
            </label>
          </div>
        ) : null}
        <button
          className="primary-action compact"
          type="submit"
          disabled={!newProjectName.trim() || !selectedCategoryId || creatingProject || hasInvalidNewProjectDateRange}
        >
          <Plus size={17} />
          {creatingProject ? "Anlegen" : "Anlegen"}
        </button>
      </form>

      {groups.map((group) => (
        <section
          className={`project-category ${draggedCategoryId === group.category.id ? "dragging" : ""} ${categoryDropId === group.category.id ? "drag-over" : ""}`}
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
          <div className="project-category-heading">
            <div>
              {group.category.id === 0 ? (
                <h2>{group.category.name}</h2>
              ) : (
                <button className="category-link" onClick={() => onOpenCategory(group.category.name)}>
                  {group.category.name}
                </button>
              )}
            </div>
            {group.category.id !== 0 && !categoryFilterName && canReorderVisibleProjects ? (
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
            <span>{group.projects.length} {propsCountLabel(group.projects.length, singularLabel, pluralLabel)}</span>
          </div>
          <div className="project-category-list">
            {group.projects.map((project) => {
              const projectTasks = tasks.filter((task) => task.projectId === project.id);
              return (
                <article
                  className={`project-row clickable ${canReorderVisibleProjects ? "draggable-row" : ""} ${draggedProject?.projectId === project.id ? "dragging" : ""} ${projectDropId === project.id ? "drag-over" : ""}`}
                  key={project.id}
                  draggable={canReorderVisibleProjects}
                  onClick={() => onOpenProject(project.id)}
                  onDragStart={(event) => {
                    if (!canReorderVisibleProjects) return;
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedProject({ categoryId: group.category.id, projectId: project.id });
                  }}
                  onDragOver={(event) => {
                    if (!draggedProject || draggedProject.categoryId !== group.category.id) return;
                    event.preventDefault();
                    setProjectDropId(project.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedProject || draggedProject.categoryId !== group.category.id) return;
                    const projectIds = group.projects.map((candidate) => candidate.id);
                    const nextIds = moveIdToDropPosition(projectIds, draggedProject.projectId, project.id, dropAfter(event));
                    setDraggedProject(null);
                    setProjectDropId(null);
                    void onReorderProjects(group.category.id, nextIds);
                  }}
                  onDragEnd={() => {
                    setDraggedProject(null);
                    setProjectDropId(null);
                  }}
                >
                  <div>
                    <div className="project-title-line">
                      <h3>{displayProjectName(project)}</h3>
                      <ProjectTypeBadge type={project.type} />
                      {project.isSystem ? <span className="system-badge">System</span> : null}
                    </div>
                    <p>{project.summary ?? firstMarkdownLine(project.markdown)}</p>
                  </div>
                  <div className="row-meta">
                    {project.type === "project" && formatProjectDateRangeForUi(project) ? <span>{formatProjectDateRangeForUi(project)}</span> : null}
                    <span>{project.status}</span>
                    <span>{projectTasks.length} Massnahmen</span>
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
  projects: Project[];
  onOpenProject: (projectId: number) => void;
}) {
  const [monthsAhead, setMonthsAhead] = useState(6);
  const today = useMemo(() => startOfUtcDay(new Date()), []);
  const range = useMemo(() => visibleTimelineRange(today, monthsAhead), [today, monthsAhead]);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const monthLabels = useMemo(() => buildTimelineMonths(range.start, range.end), [range]);
  const weekLabels = useMemo(() => buildTimelineWeeks(range.start, range.end), [range]);
  const todayOffset = dateOffsetPercent(today, range.start, totalDays);
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const entries = props.projects
    .filter((project) => project.type === "project" && project.status === "active" && project.startDate && project.endDate)
    .map((project) => {
      const category = categoryById.get(project.categoryId);
      const start = project.startDate ? parseDateOnlyUtc(project.startDate) : null;
      const end = project.endDate ? parseDateOnlyUtc(project.endDate) : null;
      if (!category || !start || !end || end < range.start || start > range.end) {
        return null;
      }

      const clippedStart = start < range.start ? range.start : start;
      const clippedEnd = end > range.end ? range.end : end;
      return {
        project,
        category,
        left: dateOffsetPercent(clippedStart, range.start, totalDays),
        width: Math.max(((daysBetween(clippedStart, clippedEnd) + 1) / totalDays) * 100, 0.7)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => {
      const dateCompare = (a.project.startDate ?? "").localeCompare(b.project.startDate ?? "");
      return dateCompare || a.project.sortOrder - b.project.sortOrder || a.project.name.localeCompare(b.project.name);
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
                        key={entry.project.id}
                        onClick={() => props.onOpenProject(entry.project.id)}
                        style={
                          {
                            left: `${entry.left}%`,
                            width: `${entry.width}%`,
                            top: `${14 + index * 38}px`,
                            "--category-color": entry.category.color
                          } as CSSProperties
                        }
                        title={`${displayProjectName(entry.project)} · ${formatProjectDateRangeForUi(entry.project) ?? ""}`}
                      >
                        <span>{displayProjectName(entry.project)}</span>
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

function ProjectDetailView(props: {
  detail: ProjectDetail | null;
  categories: AppOverview["categories"];
  onBack: () => void;
  onBackToCategory: (categoryName: string) => void;
  onOpenTask: (taskId: number) => void;
  onComplete: (taskId: number) => Promise<void>;
  onStatus: (taskId: number, status: string) => Promise<void>;
  onReorderTasks?: (projectId: number, taskIds: number[]) => Promise<void>;
  onUpdateProject: (
    projectId: number,
    input: {
      categoryId?: number;
      parentId?: number | null;
      name?: string;
      status?: Project["status"];
      summary?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    }
  ) => Promise<void>;
}) {
  if (!props.detail) {
    return <EmptyState title="Loading project..." />;
  }

  const category = props.categories.find((candidate) => candidate.id === props.detail?.project.categoryId);
  const projectId = props.detail.project.id;
  const project = props.detail.project;
  const backLabel = titleForView(collectionViewForProjectType(project.type));
  return (
    <section className="project-detail">
      <div className="back-actions">
        <div className="back-action-group">
          <button className="small-button back-button" onClick={props.onBack}>
            Zurueck zu {backLabel}
          </button>
          {category ? (
            <button className="small-button back-button" onClick={() => props.onBackToCategory(category.name)}>
              Zurueck zu {category.name}
            </button>
          ) : null}
        </div>
      </div>
      <div className="section-heading">
        <div className="project-title-line">
          <h2>{displayProjectName(project)}</h2>
          <ProjectTypeBadge type={project.type} />
          {project.isSystem ? <span className="system-badge">System</span> : null}
        </div>
        <p>{project.summary ?? firstMarkdownLine(project.markdown)}</p>
      </div>
      <ProjectBasicsForm project={project} categories={props.categories} onUpdateProject={props.onUpdateProject} />
      <section className="panel">
        <RichText text={project.markdown || "No project markdown yet."} />
      </section>
      <Panel title="Massnahmen">
        {props.detail.tasks.length === 0 ? (
          <EmptyState title="Noch keine Massnahmen" />
        ) : (
          <TasksView
            tasks={props.detail.tasks}
            projects={[props.detail.project]}
            onComplete={props.onComplete}
            onStatus={props.onStatus}
            onOpenTask={props.onOpenTask}
            onReorderTasks={(taskIds) => void props.onReorderTasks?.(projectId, taskIds)}
          />
        )}
      </Panel>
    </section>
  );
}

function TaskDetailView(props: {
  detail: TaskDetail | null;
  onBack: () => void;
  onOpenProject: (projectId: number) => void;
  onComplete: (taskId: number) => Promise<void>;
  onStatus: (taskId: number, status: string) => Promise<void>;
}) {
  if (!props.detail) {
    return <EmptyState title="Loading task..." />;
  }

  const { task, project, category } = props.detail;
  return (
    <section className="task-detail">
      <div className="back-actions">
        <div className="back-action-group">
          <button className="small-button back-button" onClick={props.onBack}>
            Zurueck zu Massnahmen
          </button>
          {project ? (
            <button className="small-button back-button" onClick={() => props.onOpenProject(project.id)}>
              Zurueck zum Eintrag
            </button>
          ) : null}
        </div>
      </div>

      <div className="section-heading task-detail-heading">
        <div>
          <h2>{task.title}</h2>
          <p>{project?.name ?? `Project ${task.projectId}`}</p>
        </div>
        <button className="small-button" onClick={() => void props.onComplete(task.id)}>
          Erledigt
        </button>
      </div>

      <section className="panel task-detail-panel">
        <dl className="detail-list">
          <div>
            <dt>Status</dt>
            <dd>
              <select value={task.status} onChange={(event) => void props.onStatus(task.id, event.target.value)}>
                <option value="open">open</option>
                <option value="in_progress">in progress</option>
                <option value="blocked">blocked</option>
                <option value="done">done</option>
                <option value="cancelled">cancelled</option>
              </select>
            </dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>
              <span className={`priority ${task.priority}`}>{task.priority}</span>
            </dd>
          </div>
          <div>
            <dt>Due</dt>
            <dd>{task.dueAt ?? "No due date"}</dd>
          </div>
          <div>
            <dt>Completed</dt>
            <dd>{task.completedAt ?? "Not completed"}</dd>
          </div>
          <div>
            <dt>Updated</dt>
            <dd>{task.updatedAt ?? "Unknown"}</dd>
          </div>
        </dl>
      </section>

      <Panel title="Notizen">
        <p className="notes-text">{task.notes ?? "Noch keine Notizen."}</p>
      </Panel>
    </section>
  );
}

function ProjectBasicsForm(props: {
  project: Project;
  categories: AppOverview["categories"];
  onUpdateProject: (
    projectId: number,
    input: {
      categoryId?: number;
      parentId?: number | null;
      name?: string;
      status?: Project["status"];
      summary?: string | null;
      startDate?: string | null;
      endDate?: string | null;
    }
  ) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(props.project.name);
  const [summary, setSummary] = useState(props.project.summary ?? "");
  const [categoryId, setCategoryId] = useState(props.project.categoryId);
  const [status, setStatus] = useState<Project["status"]>(props.project.status);
  const [startDate, setStartDate] = useState(props.project.startDate ?? "");
  const [endDate, setEndDate] = useState(props.project.endDate ?? "");
  const [busy, setBusy] = useState(false);
  const hasDateFields = props.project.type === "project";
  const hasInvalidDateRange = hasDateFields && projectDateRangeInvalid(startDate, endDate);

  useEffect(() => {
    setName(props.project.name);
    setSummary(props.project.summary ?? "");
    setCategoryId(props.project.categoryId);
    setStatus(props.project.status);
    setStartDate(props.project.startDate ?? "");
    setEndDate(props.project.endDate ?? "");
  }, [props.project]);

  if (!editing) {
    const category = props.categories.find((candidate) => candidate.id === props.project.categoryId);
    return (
      <section className="panel basics-panel">
        <div className="panel-heading-row">
          <h3>Basisdaten</h3>
          <button className="small-button" onClick={() => setEditing(true)}>
            Bearbeiten
          </button>
        </div>
        <dl className="detail-list compact">
          <div>
            <dt>Typ</dt>
            <dd>
              <ProjectTypeBadge type={props.project.type} />
            </dd>
          </div>
          <div>
            <dt>Kategorie</dt>
            <dd>{category?.name ?? `Category ${props.project.categoryId}`}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd>{props.project.status}</dd>
          </div>
          {hasDateFields ? (
            <>
              <div>
                <dt>Start</dt>
                <dd>{props.project.startDate ?? "Offen"}</dd>
              </div>
              <div>
                <dt>Ende</dt>
                <dd>{props.project.endDate ?? "Offen"}</dd>
              </div>
            </>
          ) : null}
        </dl>
      </section>
    );
  }

  return (
    <form
      className="panel basics-panel"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || busy || hasInvalidDateRange) return;
        setBusy(true);
        try {
          await props.onUpdateProject(props.project.id, {
            name: trimmedName,
            summary: summary.trim() || null,
            categoryId,
            status,
            startDate: hasDateFields ? startDate || null : undefined,
            endDate: hasDateFields ? endDate || null : undefined
          });
          setEditing(false);
        } finally {
          setBusy(false);
        }
      }}
    >
      <div className="panel-heading-row">
        <h3>Basisdaten bearbeiten</h3>
        <button
          type="button"
          className="small-button"
          onClick={() => {
            setName(props.project.name);
            setSummary(props.project.summary ?? "");
            setCategoryId(props.project.categoryId);
            setStatus(props.project.status);
            setStartDate(props.project.startDate ?? "");
            setEndDate(props.project.endDate ?? "");
            setEditing(false);
          }}
        >
          Abbrechen
        </button>
      </div>
      <div className="basics-form-grid">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Kategorie
          <select value={categoryId} onChange={(event) => setCategoryId(Number(event.target.value))}>
            {props.categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Status
          <select value={status} onChange={(event) => setStatus(event.target.value as Project["status"])}>
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="completed">completed</option>
            <option value="archived">archived</option>
          </select>
        </label>
        {hasDateFields ? (
          <>
            <label>
              Start
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
            </label>
            <label>
              Ende
              <input type="date" value={endDate} min={startDate || undefined} onChange={(event) => setEndDate(event.target.value)} />
            </label>
          </>
        ) : null}
        <label className="basics-summary-field">
          Summary
          <textarea value={summary} onChange={(event) => setSummary(event.target.value)} rows={3} />
        </label>
      </div>
      <div className="form-actions">
        <button className="primary-action compact" type="submit" disabled={!name.trim() || busy || hasInvalidDateRange}>
          Speichern
        </button>
      </div>
    </form>
  );
}

function TasksView(props: {
  tasks: Task[];
  projects: Project[];
  onComplete: (taskId: number) => Promise<void>;
  onStatus: (taskId: number, status: string) => Promise<void>;
  onOpenTask?: (taskId: number) => void;
  onReorderTasks?: (taskIds: number[]) => void;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [taskDropId, setTaskDropId] = useState<number | null>(null);
  const projectById = new Map(props.projects.map((project) => [project.id, project]));
  const taskIds = props.tasks.map((task) => task.id);
  return (
    <section className="task-list">
      {props.tasks.map((task) => (
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
            <p>{projectById.get(task.projectId) ? displayProjectName(projectById.get(task.projectId)!) : `Project ${task.projectId}`}</p>
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

function PromptTemplatesView(props: {
  templates: PromptTemplateDefinition[];
  onRefresh: () => void;
}) {
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
        {props.templates.map((template) => (
          <section className="prompt-template-card panel" key={template.id}>
            <div className="prompt-template-card-heading">
              <div>
                <h3>{template.name}</h3>
                <p>{template.route}</p>
              </div>
              <span>{template.effectiveContext}</span>
            </div>
            <PromptSection title="System / Instructions" text={template.systemInstructions} />
            <PromptSection title="Kontextdaten Template" text={template.contextDataTemplate} />
            <PromptSection title="Finaler Prompt Template" text={template.finalPromptTemplate} emphasis />
          </section>
        ))}
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
      {activities.map((activity) => (
        <div key={activity.id} className={`activity-item ${activity.status}`}>
          <span className="activity-dot" />
          <div>
            <strong>{activity.title}</strong>
            {activity.detail ? <p>{renderInlineMarkup(activity.detail)}</p> : null}
          </div>
        </div>
      ))}
    </div>
  );
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
    project: "Eintrag",
    task: "Massnahme",
    prompts: "Prompt Inspector",
    promptTemplates: "Prompt-Vorlagen",
    tasks: "Massnahmen"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    drive: "Realtime voice surface; LiveKit connection comes next.",
    lifeAreas: "Categories mit ihren Ideen, Projekten und Gewohnheiten.",
    lifeArea: "Beschreibung, Kontext und Initiatives.",
    timeline: "Aktive Projekte entlang der Zeitachse.",
    ideas: "",
    projects: "",
    habits: "",
    project: "Memory, Massnahmen und Kontext.",
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
    .find(Boolean) ?? "No project memory yet";
}

function projectDateRangeInvalid(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate > endDate);
}

function formatProjectDateRangeForUi(project: Pick<Project, "startDate" | "endDate">): string | null {
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
