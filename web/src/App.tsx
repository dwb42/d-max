import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, DragEvent, MutableRefObject, ReactNode } from "react";
import {
  Blocks,
  CheckCircle2,
  Circle,
  ClipboardList,
  Copy,
  GitPullRequestArrow,
  GripVertical,
  Mic,
  Mic2,
  PanelRightOpen,
  Pause,
  Play,
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
  createVoiceSession,
  fetchChatActivity,
  fetchChatConversations,
  fetchChatMessages,
  fetchOverview,
  fetchPromptLogs,
  fetchProjectDetail,
  fetchTaskDetail,
  reorderCategories,
  reorderProjects,
  reorderTasks,
  subscribeStateEvents,
  streamChatMessage,
  transcribeVoiceMessage,
  updateTaskStatus
} from "./api.js";
import type {
  AppOverview,
  AppConversation,
  ConversationContext,
  ChatActivity,
  AppPromptLog,
  PersistedChatMessage,
  Project,
  ProjectDetail,
  StateEvent,
  Task,
  TaskDetail
} from "./types.js";
import "./styles.css";

type View = "drive" | "projects" | "project" | "tasks" | "task" | "prompts";
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

const navItems: Array<{ id: Exclude<View, "project">; label: string; icon: typeof Mic; path: string }> = [
  { id: "drive", label: "Drive", icon: Mic, path: "/drive" },
  { id: "projects", label: "Projects", icon: Blocks, path: "/projects" },
  { id: "tasks", label: "Tasks", icon: ClipboardList, path: "/tasks" },
  { id: "prompts", label: "Prompts", icon: GitPullRequestArrow, path: "/prompts" }
];

function routeFromPath(path: string): RouteState {
  const [pathname] = path.split("?");
  const projectMatch = pathname.match(/^\/projects\/(\d+)$/);
  if (projectMatch) {
    return { view: "project", projectId: Number(projectMatch[1]), taskId: null, categoryName: null };
  }
  const categoryMatch = pathname.match(/^\/projects\/([^/]+)$/);
  if (categoryMatch) {
    return { view: "projects", projectId: null, taskId: null, categoryName: decodeURIComponent(categoryMatch[1] ?? "") };
  }
  const taskMatch = pathname.match(/^\/tasks\/(\d+)$/);
  if (taskMatch) {
    return { view: "task", projectId: null, taskId: Number(taskMatch[1]), categoryName: null };
  }

  if (pathname === "/drive") return { view: "drive", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/chat" || pathname === "/") return { view: "projects", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/projects") return { view: "projects", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/tasks") return { view: "tasks", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/prompts") return { view: "prompts", projectId: null, taskId: null, categoryName: null };
  return { view: "projects", projectId: null, taskId: null, categoryName: null };
}

function pathForRoute(view: View, projectId?: number | null): string {
  if (view === "project") return `/projects/${projectId}`;
  if (view === "task") return "/tasks";
  return `/${view}`;
}

function pathForProjectCategory(categoryName: string): string {
  return `/projects/${encodeURIComponent(categoryName)}`;
}

function getRouteConversationContext(
  route: RouteState,
  overview: AppOverview | null,
  projectDetail: ProjectDetail | null,
  taskDetail: TaskDetail | null
): { context: ConversationContext; label: string } | null {
  if (route.view === "projects" && route.categoryName) {
    const category = overview?.categories.find((candidate) => candidate.name.toLowerCase() === route.categoryName?.toLowerCase());
    return category ? { context: { type: "category", categoryId: category.id }, label: category.name } : null;
  }

  if (route.view === "projects") {
    return { context: { type: "projects" }, label: "Projects" };
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
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [promptLogs, setPromptLogs] = useState<AppPromptLog[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<number | null>(null);
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
  const isEmptyState = Boolean(overview && overview.categories.length === 0 && overview.projects.length === 0 && overview.tasks.length === 0);
  const routeConversationContext = useMemo(() => getRouteConversationContext(route, overview, projectDetail, taskDetail), [route, overview, projectDetail, taskDetail]);
  const routeConversationContextKey = routeConversationContext ? conversationContextKey(routeConversationContext.context) : "none";

  useEffect(() => {
    if (!agentDrawer.open || !routeConversationContext || chatBusy) {
      return;
    }

    const currentKey = conversationContextKey(agentDrawer.context);
    if (currentKey === routeConversationContextKey) {
      if (agentDrawer.label !== routeConversationContext.label) {
        setAgentDrawer((current) => ({ ...current, label: routeConversationContext.label }));
      }
      return;
    }

    void openContextualAgent(routeConversationContext.context, routeConversationContext.label);
  }, [
    agentDrawer.context,
    agentDrawer.label,
    agentDrawer.open,
    chatBusy,
    routeConversationContext,
    routeConversationContextKey
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

  return (
    <div
      className={`app-shell ${agentDrawer.open ? "with-agent-drawer" : ""}`}
      ref={appShellRef}
      style={{ "--agent-drawer-width": `${agentDrawerWidth}px` } as CSSProperties}
    >
      <aside className="sidebar">
        <button className="brand brand-link" onClick={() => navigate("/projects")} title="Zur Startseite">
          <div className="brand-mark">d</div>
          <div>
            <div className="brand-name">d-max</div>
            <div className="brand-subtitle">voice-first memory</div>
          </div>
        </button>

        <nav className="nav">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = view === item.id || (view === "project" && item.id === "projects") || (view === "task" && item.id === "tasks");
            return (
              <button key={item.id} className={`nav-item ${active ? "active" : ""}`} onClick={() => navigate(item.path)}>
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <main className="main">
        {view !== "project" && view !== "task" ? (
          <header className="topbar">
            <div>
              {view === "projects" && route.categoryName ? (
                <button className="topbar-title-link" onClick={() => navigate("/projects")}>
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

        {!isEmptyState && routeConversationContext && view !== "project" && view !== "task" ? (
          <button
            className="context-agent-button"
            onClick={() => void openContextualAgent(routeConversationContext.context, routeConversationContext.label)}
          >
            <PanelRightOpen size={18} />
            d-max
          </button>
        ) : null}

        {isEmptyState ? (
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
        {!isEmptyState && view === "projects" && (
          <ProjectsView
            categories={overview?.categories ?? []}
            projects={overview?.projects ?? []}
            tasks={overview?.tasks ?? []}
            categoryFilterName={route.categoryName}
            onOpenProject={(projectId) => navigate(`/projects/${projectId}`)}
            onOpenCategory={(categoryName) => navigate(pathForProjectCategory(categoryName))}
            onReorderCategories={async (categoryIds) => {
              await reorderCategories(categoryIds);
              await refresh();
            }}
            onReorderProjects={async (categoryId, projectIds) => {
              await reorderProjects(categoryId, projectIds);
              await refresh();
            }}
          />
        )}
        {!isEmptyState && view === "project" && (
          <ProjectDetailView
            detail={projectDetail}
            categories={overview?.categories ?? []}
            onBack={() => navigate("/projects")}
            onBackToCategory={(categoryName) => navigate(pathForProjectCategory(categoryName))}
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
            onAskDmax={
              routeConversationContext
                ? () => void openContextualAgent(routeConversationContext.context, routeConversationContext.label)
                : undefined
            }
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
            onAskDmax={
              routeConversationContext
                ? () => void openContextualAgent(routeConversationContext.context, routeConversationContext.label)
                : undefined
            }
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
  return (
    <section className="chat-layout">
      <div className="chat-thread" ref={props.threadRef}>
        {props.messages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role}`}>
            <RichText text={message.text} />
            {message.activities?.length ? <ActivityTrail activities={message.activities} /> : null}
            {message.source ? <span>{message.source === "voice" ? "voice message" : "text"}</span> : null}
          </article>
        ))}
        {props.busy ? (
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

function ProjectsView({
  categories,
  projects,
  tasks,
  categoryFilterName,
  onOpenProject,
  onOpenCategory,
  onReorderCategories,
  onReorderProjects
}: {
  categories: AppOverview["categories"];
  projects: Project[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenProject: (projectId: number) => void;
  onOpenCategory: (categoryName: string) => void;
  onReorderCategories: (categoryIds: number[]) => Promise<void>;
  onReorderProjects: (categoryId: number, projectIds: number[]) => Promise<void>;
}) {
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [categoryDropId, setCategoryDropId] = useState<number | null>(null);
  const [draggedProject, setDraggedProject] = useState<{ categoryId: number; projectId: number } | null>(null);
  const [projectDropId, setProjectDropId] = useState<number | null>(null);
  const visibleCategories = categoryFilterName
    ? categories.filter((category) => category.name.toLowerCase() === categoryFilterName.toLowerCase())
    : categories;
  const groupedProjects = visibleCategories
    .map((category) => ({
      category,
      projects: projects.filter((project) => project.categoryId === category.id)
    }))
    .filter((group) => group.projects.length > 0);
  const uncategorizedProjects = categoryFilterName ? [] : projects.filter((project) => !categories.some((category) => category.id === project.categoryId));
  const groups = uncategorizedProjects.length > 0
    ? [...groupedProjects, { category: { id: 0, name: "Uncategorized", description: null, isSystem: false }, projects: uncategorizedProjects }]
    : groupedProjects;
  const reorderableCategoryIds = groups.map((group) => group.category.id).filter((id) => id > 0);

  return (
    <section className="project-grid">
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
            {group.category.id !== 0 && !categoryFilterName ? (
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
            <span>{group.projects.length} projects</span>
          </div>
          <div className="project-category-list">
            {group.projects.map((project) => {
              const projectTasks = tasks.filter((task) => task.projectId === project.id);
              return (
                <article
                  className={`project-row clickable draggable-row ${draggedProject?.projectId === project.id ? "dragging" : ""} ${projectDropId === project.id ? "drag-over" : ""}`}
                  key={project.id}
                  draggable
                  onClick={() => onOpenProject(project.id)}
                  onDragStart={(event) => {
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
                    <h3>{project.name}</h3>
                    <p>{project.summary ?? firstMarkdownLine(project.markdown)}</p>
                  </div>
                  <div className="row-meta">
                    <span>{project.status}</span>
                    <span>{projectTasks.length} tasks</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}
      {groups.length === 0 ? <EmptyState title="No projects yet" /> : null}
    </section>
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
  onAskDmax?: () => void;
}) {
  if (!props.detail) {
    return <EmptyState title="Loading project..." />;
  }

  const category = props.categories.find((candidate) => candidate.id === props.detail?.project.categoryId);
  const projectId = props.detail.project.id;
  return (
    <section className="project-detail">
      <div className="back-actions">
        <div className="back-action-group">
          <button className="small-button back-button" onClick={props.onBack}>
            Back to Projects
          </button>
          {category ? (
            <button className="small-button back-button" onClick={() => props.onBackToCategory(category.name)}>
              Back to {category.name}
            </button>
          ) : null}
        </div>
        {props.onAskDmax ? (
          <button className="small-button ask-dmax-small" onClick={props.onAskDmax}>
            <PanelRightOpen size={15} />
            d-max
          </button>
        ) : null}
      </div>
      <div className="section-heading">
        <h2>{props.detail.project.name}</h2>
        <p>{props.detail.project.summary ?? firstMarkdownLine(props.detail.project.markdown)}</p>
      </div>
      <section className="panel">
        <RichText text={props.detail.project.markdown || "No project markdown yet."} />
      </section>
      <Panel title="Tasks">
        {props.detail.tasks.length === 0 ? (
          <EmptyState title="No tasks yet" />
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
  onAskDmax?: () => void;
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
            Back to Tasks
          </button>
          {project ? (
            <button className="small-button back-button" onClick={() => props.onOpenProject(project.id)}>
              Back to Project
            </button>
          ) : null}
        </div>
        {props.onAskDmax ? (
          <button className="small-button ask-dmax-small" onClick={props.onAskDmax}>
            <PanelRightOpen size={15} />
            d-max
          </button>
        ) : null}
      </div>

      <div className="section-heading task-detail-heading">
        <div>
          <h2>{task.title}</h2>
          <p>{project?.name ?? `Project ${task.projectId}`}</p>
        </div>
        <button className="small-button" onClick={() => void props.onComplete(task.id)}>
          Mark Done
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

      <Panel title="Notes">
        <p className="notes-text">{task.notes ?? "No notes yet."}</p>
      </Panel>
    </section>
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
            <p>{projectById.get(task.projectId)?.name ?? `Project ${task.projectId}`}</p>
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

function PromptSection({ title, text, emphasis = false }: { title: string; text: string; emphasis?: boolean }) {
  return (
    <section className={`prompt-section ${emphasis ? "emphasis" : ""}`}>
      <h3>{title}</h3>
      <pre>{text || "—"}</pre>
    </section>
  );
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
    projects: "Projects",
    project: "Project",
    task: "Task",
    prompts: "Prompt Inspector",
    tasks: "Tasks"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    drive: "Realtime voice surface; LiveKit connection comes next.",
    projects: "",
    project: "Project memory, linked tasks, and extracted context.",
    task: "Task status, priority, notes, and project context.",
    prompts: "Debug view for d-max prompts sent to OpenClaw.",
    tasks: "Concrete work across active projects."
  }[view];
}

function firstMarkdownLine(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean) ?? "No project memory yet";
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
