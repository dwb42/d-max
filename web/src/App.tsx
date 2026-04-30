import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject, ReactNode } from "react";
import {
  Blocks,
  CheckCircle2,
  Circle,
  ClipboardList,
  GitPullRequestArrow,
  Lightbulb,
  MessageCircle,
  Mic,
  Mic2,
  Pause,
  Play,
  RefreshCw,
  Send,
  Square,
  StopCircle
} from "lucide-react";
import { Room, RoomEvent, Track } from "livekit-client";
import type { RemoteTrack } from "livekit-client";
import {
  completeTask,
  createCategory,
  createVoiceSession,
  fetchChatMessages,
  fetchOverview,
  fetchProjectDetail,
  fetchTaskDetail,
  fetchThinkingContext,
  sendChatMessage,
  updateTaskStatus,
  updateTension,
  updateThought
} from "./api.js";
import type { AppOverview, PersistedChatMessage, Project, ProjectDetail, Task, TaskDetail, ThinkingContext, ThinkingSpace, Thought } from "./types.js";
import "./styles.css";

type View = "drive" | "chat" | "thinking" | "projects" | "project" | "tasks" | "task" | "review";
type RouteState = {
  view: View;
  projectId: number | null;
  taskId: number | null;
  categoryName: string | null;
};
type VoiceState = "idle" | "listening" | "thinking" | "speaking";
type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  source?: "text" | "voice";
};
type AudioMeterHandle = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  raf: number;
};
type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionEventLike = {
  results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal?: boolean }>;
};

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const navItems: Array<{ id: Exclude<View, "project">; label: string; icon: typeof Mic; path: string }> = [
  { id: "drive", label: "Drive", icon: Mic, path: "/drive" },
  { id: "chat", label: "Chat", icon: MessageCircle, path: "/chat" },
  { id: "thinking", label: "Thinking", icon: Lightbulb, path: "/brainstorms" },
  { id: "projects", label: "Projects", icon: Blocks, path: "/projects" },
  { id: "tasks", label: "Tasks", icon: ClipboardList, path: "/tasks" },
  { id: "review", label: "Review", icon: CheckCircle2, path: "/review" }
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
  if (pathname === "/chat" || pathname === "/") return { view: "chat", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/brainstorms" || pathname === "/thinking") return { view: "thinking", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/projects") return { view: "projects", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/tasks") return { view: "tasks", projectId: null, taskId: null, categoryName: null };
  if (pathname === "/review") return { view: "review", projectId: null, taskId: null, categoryName: null };
  return { view: "chat", projectId: null, taskId: null, categoryName: null };
}

function pathForRoute(view: View, projectId?: number | null): string {
  if (view === "thinking") return "/brainstorms";
  if (view === "project") return `/projects/${projectId}`;
  if (view === "task") return "/tasks";
  return `/${view}`;
}

function pathForProjectCategory(categoryName: string): string {
  return `/projects/${encodeURIComponent(categoryName)}`;
}

async function loadPersistedChatMessages(): Promise<ChatMessage[]> {
  const messages = await fetchChatMessages();
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

export default function App() {
  const [route, setRoute] = useState<RouteState>(() => routeFromPath(`${window.location.pathname}${window.location.search}`));
  const [overview, setOverview] = useState<AppOverview | null>(null);
  const [projectDetail, setProjectDetail] = useState<ProjectDetail | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetail | null>(null);
  const [selectedSpaceId, setSelectedSpaceId] = useState<number | null>(null);
  const [thinkingContext, setThinkingContext] = useState<ThinkingContext | null>(null);
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
  const [chatRecording, setChatRecording] = useState(false);
  const [chatVoiceLevel, setChatVoiceLevel] = useState(0);
  const [chatVoiceTranscript, setChatVoiceTranscript] = useState("");
  const speechRecognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const chatAudioMeterRef = useRef<AudioMeterHandle | null>(null);
  const chatRecordingRef = useRef(false);
  const chatVoiceTranscriptRef = useRef("");
  const chatMediaStreamRef = useRef<MediaStream | null>(null);
  const audioMeterRef = useRef<AudioMeterHandle | null>(null);
  const remoteAudioElementsRef = useRef<HTMLAudioElement[]>([]);
  const chatThreadRef = useRef<HTMLDivElement | null>(null);
  const view = route.view;
  const isEmptyState = Boolean(overview && overview.categories.length === 0 && overview.projects.length === 0 && overview.tasks.length === 0);

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

    setChatDraft("");
    setChatBusy(true);
    setChatMessages((current) => [...current, optimisticMessage]);

    try {
      const result = await sendChatMessage({
        message,
        thinkingSpaceId: selectedSpaceId,
        source: source === "voice" ? "app_voice_message" : "app_text"
      });
      setChatMessages(await loadPersistedChatMessages());
      await refresh();
      if (result.thinkingSpaceId) {
        setSelectedSpaceId(result.thinkingSpaceId);
      }
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
    }
  }

  async function startChatVoiceMessage() {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setChatMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: "assistant",
          text: "Voice Message wird in diesem Browser noch nicht unterstützt. In Chrome funktioniert Diktat normalerweise."
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

    speechRecognitionRef.current?.stop();
    chatMediaStreamRef.current = stream;
    chatRecordingRef.current = true;
    chatVoiceTranscriptRef.current = "";
    setChatVoiceTranscript("");
    setChatVoiceLevel(0);
    setChatRecording(true);
    startAudioMeter(stream, chatAudioMeterRef, setChatVoiceLevel);

    const recognition = new Recognition();
    speechRecognitionRef.current = recognition;
    recognition.lang = "de-DE";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();
      if (transcript) {
        chatVoiceTranscriptRef.current = transcript;
        setChatVoiceTranscript(transcript);
      }
    };
    recognition.onerror = (event) => {
      if (event.error === "no-speech") {
        return;
      }
      setChatMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: `Voice Message Fehler: ${event.error ?? "unbekannt"}` }
      ]);
    };
    recognition.onend = () => {
      speechRecognitionRef.current = null;
      if (chatRecordingRef.current) {
        try {
          recognition.start();
          speechRecognitionRef.current = recognition;
        } catch {
          // Chrome may reject immediate restarts while it is finalizing audio.
        }
      }
    };
    recognition.start();
  }

  async function stopAndSendChatVoiceMessage() {
    chatRecordingRef.current = false;
    setChatRecording(false);
    speechRecognitionRef.current?.stop();
    speechRecognitionRef.current = null;
    stopAudioMeter(chatAudioMeterRef);
    setChatVoiceLevel(0);
    chatMediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    chatMediaStreamRef.current = null;

    const transcript = chatVoiceTranscriptRef.current.trim();
    chatVoiceTranscriptRef.current = "";
    setChatVoiceTranscript("");
    if (transcript) {
      await submitChatMessage(transcript, "voice");
    } else {
      setChatMessages((current) => [
        ...current,
        { id: crypto.randomUUID(), role: "assistant", text: "Ich habe keine verwertbare Voice Message erkannt." }
      ]);
    }
  }

  async function refresh() {
    try {
      setError(null);
      const data = await fetchOverview();
      setOverview(data);
      setSelectedSpaceId((current) => current ?? data.thinkingSpaces[0]?.id ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load d-max state.");
    }
  }

  useEffect(() => {
    void refresh();
    void loadPersistedChatMessages().then((messages) => {
      if (messages.length > 0) {
        setChatMessages(messages);
      }
    });
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(`${window.location.pathname}${window.location.search}`));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => {
      void refresh();
      if (!chatBusy && !chatRecording) {
        void loadPersistedChatMessages().then((messages) => {
          if (messages.length > 0) {
            setChatMessages(messages);
          }
        });
      }
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
  }, [chatBusy, chatRecording]);

  useEffect(() => {
    if (!selectedSpaceId) {
      setThinkingContext(null);
      return;
    }

    fetchThinkingContext(selectedSpaceId)
      .then(setThinkingContext)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : "Failed to load thinking context."));
  }, [selectedSpaceId]);

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
  }, [chatMessages, chatBusy]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand brand-link" onClick={() => navigate("/chat")} title="Zur Startseite">
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

        <div className="sidebar-footer">
          <button className="icon-text-button" onClick={() => void refresh()}>
            <RefreshCw size={16} />
            Sync now
          </button>
        </div>
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
                setVoiceState("thinking");
                const session = await createVoiceSession({ mode: "drive", thinkingSpaceId: selectedSpaceId });
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
            thinkingContext={thinkingContext}
            spaces={overview?.thinkingSpaces ?? []}
            selectedSpaceId={selectedSpaceId}
            setSelectedSpaceId={setSelectedSpaceId}
          />
        )}
        {!isEmptyState && view === "chat" && (
          <ChatView
            messages={chatMessages}
            draft={chatDraft}
            setDraft={setChatDraft}
            busy={chatBusy}
            recording={chatRecording}
            voiceLevel={chatVoiceLevel}
            voiceTranscript={chatVoiceTranscript}
            thinkingContext={thinkingContext}
            onSubmit={(text) => void submitChatMessage(text)}
            onStartVoiceMessage={() => void startChatVoiceMessage()}
            onStopVoiceMessage={() => void stopAndSendChatVoiceMessage()}
            threadRef={chatThreadRef}
          />
        )}
        {!isEmptyState && view === "thinking" && (
          <ThinkingView
            spaces={overview?.thinkingSpaces ?? []}
            selectedSpaceId={selectedSpaceId}
            setSelectedSpaceId={setSelectedSpaceId}
            context={thinkingContext}
            onThoughtUpdate={async (thoughtId, status) => {
              await updateThought(thoughtId, { status });
              if (selectedSpaceId) setThinkingContext(await fetchThinkingContext(selectedSpaceId));
            }}
            onTensionResolve={async (tensionId) => {
              await updateTension(tensionId, { status: "resolved" });
              if (selectedSpaceId) setThinkingContext(await fetchThinkingContext(selectedSpaceId));
            }}
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
        {!isEmptyState && view === "review" && <ReviewView overview={overview} context={thinkingContext} onNavigate={navigate} />}
      </main>
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
  thinkingContext: ThinkingContext | null;
  spaces: ThinkingSpace[];
  selectedSpaceId: number | null;
  setSelectedSpaceId: (id: number) => void;
}) {
  const stateLabel = {
    idle: "Ready",
    listening: "Listening",
    thinking: "Thinking",
    speaking: "Speaking"
  }[props.voiceState];

  return (
    <section className="drive-layout">
      <div className={`voice-orb ${props.voiceState}`}>
        <SoundWave level={props.audioLevel} active={props.voiceState === "listening"} />
        <strong>{stateLabel}</strong>
        <span>{props.thinkingContext?.space.title ?? "No active Brainstorm"}</span>
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
        <label>
          Brainstorm
          <select value={props.selectedSpaceId ?? ""} onChange={(event) => props.setSelectedSpaceId(Number(event.target.value))}>
            {props.spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.title}
              </option>
            ))}
          </select>
        </label>
        <div className="open-loop">
          <span>Current open loop</span>
          <p>{props.thinkingContext?.openLoops.recommendation ?? "Start a Brainstorm to create a voice context."}</p>
        </div>
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
  recording: boolean;
  voiceLevel: number;
  voiceTranscript: string;
  thinkingContext: ThinkingContext | null;
  onSubmit: (text: string) => void;
  onStartVoiceMessage: () => void;
  onStopVoiceMessage: () => void;
  threadRef: MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <section className="chat-layout">
      <div className="chat-thread" ref={props.threadRef}>
        {props.messages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role}`}>
            <RichText text={message.text} />
            {message.source ? <span>{message.source === "voice" ? "voice message" : "text"}</span> : null}
          </article>
        ))}
        {props.busy ? (
          <article className="chat-message assistant pending">
            <span className="thinking-dots">
              <i />
              <i />
              <i />
            </span>
            <p>d-max denkt...</p>
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
        <textarea
          value={props.draft}
          onChange={(event) => props.setDraft(event.target.value)}
          rows={3}
          placeholder="Nachricht an d-max"
          disabled={props.recording}
        />
        {props.recording ? (
          <div className="voice-message-recorder">
            <SoundWave level={props.voiceLevel} active={props.recording} />
            <div>
              <strong>Recording voice message</strong>
              <p>{props.voiceTranscript || "Sprich deine Nachricht vollständig ein. Gesendet wird erst beim Stoppen."}</p>
            </div>
          </div>
        ) : null}
        <div className="chat-actions">
          <button
            type="button"
            className={`secondary-action compact ${props.recording ? "active" : ""}`}
            onClick={props.recording ? props.onStopVoiceMessage : props.onStartVoiceMessage}
          >
            {props.recording ? <StopCircle size={18} /> : <Mic2 size={18} />}
            {props.recording ? "Stop & Send" : "Voice Message"}
          </button>
          <button type="submit" className="primary-action compact" disabled={props.busy || !props.draft.trim()}>
            <Send size={18} />
            {props.busy ? "Sending" : "Send"}
          </button>
        </div>
      </form>

      <aside className="chat-context">
        <span>Brainstorm</span>
        <strong>{props.thinkingContext?.space.title ?? "App Chat"}</strong>
        <p>{props.thinkingContext?.openLoops.recommendation ?? "Messages are captured into a Brainstorm once they contain useful state."}</p>
      </aside>
    </section>
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

function ThinkingView(props: {
  spaces: ThinkingSpace[];
  selectedSpaceId: number | null;
  setSelectedSpaceId: (id: number) => void;
  context: ThinkingContext | null;
  onThoughtUpdate: (thoughtId: number, status: string) => Promise<void>;
  onTensionResolve: (tensionId: number) => Promise<void>;
}) {
  return (
    <section className="split-view">
      <div className="list-pane">
        {props.spaces.map((space) => (
          <button key={space.id} className={`space-row ${props.selectedSpaceId === space.id ? "active" : ""}`} onClick={() => props.setSelectedSpaceId(space.id)}>
            <strong>{space.title}</strong>
            <span>{space.summary ?? "No summary yet"}</span>
          </button>
        ))}
      </div>

      <div className="detail-pane">
        {!props.context ? (
          <EmptyState title="No thinking space selected" />
        ) : (
          <>
            <div className="section-heading">
              <h2>{props.context.space.title}</h2>
              <p>{props.context.openLoops.recommendation}</p>
            </div>
            <div className="grid two">
              <Panel title="Tensions">
                {props.context.unresolvedTensions.map((tension) => (
                  <div className="tension-row" key={tension.id}>
                    <div>
                      <strong>{tension.want}</strong>
                      <span>{tension.but}</span>
                    </div>
                    <button className="icon-button" onClick={() => void props.onTensionResolve(tension.id)} title="Resolve tension">
                      <CheckCircle2 size={17} />
                    </button>
                  </div>
                ))}
              </Panel>
              <Panel title="Candidates">
                {[...props.context.projectCandidates, ...props.context.taskCandidates].map((thought) => (
                  <ThoughtRow key={thought.id} thought={thought} onPark={() => void props.onThoughtUpdate(thought.id, "parked")} />
                ))}
              </Panel>
            </div>
            <Panel title="Hot Thoughts">
              <div className="thought-list">
                {props.context.openLoops.hotThoughts.map((thought) => (
                  <ThoughtRow key={thought.id} thought={thought} onPark={() => void props.onThoughtUpdate(thought.id, "parked")} />
                ))}
              </div>
            </Panel>
          </>
        )}
      </div>
    </section>
  );
}

function ProjectsView({
  categories,
  projects,
  tasks,
  categoryFilterName,
  onOpenProject,
  onOpenCategory
}: {
  categories: AppOverview["categories"];
  projects: Project[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenProject: (projectId: number) => void;
  onOpenCategory: (categoryName: string) => void;
}) {
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

  return (
    <section className="project-grid">
      {groups.map((group) => (
        <section className="project-category" key={group.category.id}>
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
            <span>{group.projects.length} projects</span>
          </div>
          <div className="project-category-list">
            {group.projects.map((project) => {
              const projectTasks = tasks.filter((task) => task.projectId === project.id);
              return (
                <article className="project-row clickable" key={project.id} onClick={() => onOpenProject(project.id)}>
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
}) {
  if (!props.detail) {
    return <EmptyState title="Loading project..." />;
  }

  const category = props.categories.find((candidate) => candidate.id === props.detail?.project.categoryId);
  return (
    <section className="project-detail">
      <div className="back-actions">
        <button className="small-button back-button" onClick={props.onBack}>
          Back to Projects
        </button>
        {category ? (
          <button className="small-button back-button" onClick={() => props.onBackToCategory(category.name)}>
            Back to {category.name}
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
        <button className="small-button back-button" onClick={props.onBack}>
          Back to Tasks
        </button>
        {project ? (
          <button className="small-button back-button" onClick={() => props.onOpenProject(project.id)}>
            Back to Project
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
}) {
  const projectById = new Map(props.projects.map((project) => [project.id, project]));
  return (
    <section className="task-list">
      {props.tasks.map((task) => (
        <article className={`task-row ${task.status} ${props.onOpenTask ? "clickable" : ""}`} key={task.id} onClick={() => props.onOpenTask?.(task.id)}>
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

function ReviewView({ overview, context, onNavigate }: { overview: AppOverview | null; context: ThinkingContext | null; onNavigate: (path: string) => void }) {
  const candidateCount = (context?.projectCandidates.length ?? 0) + (context?.taskCandidates.length ?? 0);
  const blockedTasks = overview?.tasks.filter((task) => task.status === "blocked") ?? [];
  const urgentTasks = overview?.tasks.filter((task) => task.priority === "urgent" || task.priority === "high") ?? [];

  return (
    <section className="review-layout">
      <Panel title="Needs Review">
        <div className="review-kpis">
          <Metric label="Candidates" value={candidateCount} />
          <Metric label="Tensions" value={context?.unresolvedTensions.length ?? 0} />
          <Metric label="Blocked" value={blockedTasks.length} />
        </div>
        <p className="muted">{context?.openLoops.recommendation ?? "No active Brainstorm selected."}</p>
      </Panel>
      <div className="grid two">
        <Panel title="Project Candidates">
          {(context?.projectCandidates ?? []).length === 0 ? <EmptyState title="No project candidates" /> : null}
          {context?.projectCandidates.map((thought) => <ThoughtRow key={thought.id} thought={thought} />)}
        </Panel>
        <Panel title="Task Candidates">
          {(context?.taskCandidates ?? []).length === 0 ? <EmptyState title="No task candidates" /> : null}
          {context?.taskCandidates.map((thought) => <ThoughtRow key={thought.id} thought={thought} />)}
        </Panel>
      </div>
      <Panel title="Execution Friction">
        {[...blockedTasks, ...urgentTasks].slice(0, 8).map((task) => (
          <button key={task.id} className="review-row" onClick={() => onNavigate("/tasks")}>
            <strong>{task.title}</strong>
            <span>
              {task.status} · {task.priority}
            </span>
          </button>
        ))}
        {blockedTasks.length + urgentTasks.length === 0 ? <EmptyState title="No high-pressure execution friction" /> : null}
      </Panel>
    </section>
  );
}

function OnboardingView({ onCreateCategory, onNavigate }: { onCreateCategory: (name: string) => Promise<void>; onNavigate: (path: string) => void }) {
  const [busyCategory, setBusyCategory] = useState<string | null>(null);
  const starterCategories = ["Business", "Reisen", "Health & Fitness", "Family", "Learning", "Soul"];

  return (
    <section className="onboarding">
      <div>
        <span className="eyebrow">Fresh start</span>
        <h2>Baue dein d-max Memory von null auf.</h2>
        <p>Starte per Chat oder Drive Mode. Kategorien kannst du direkt anlegen, Projekte und Tasks entstehen weiter ueber d-max.</p>
      </div>
      <div className="quick-actions">
        <button className="primary-action" onClick={() => onNavigate("/chat")}>
          <MessageCircle size={18} />
          Start Chat
        </button>
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
                <li key={line}>{line.replace(/^\d+\.\s+|^[-*]\s+/, "")}</li>
              ))}
            </Tag>
          );
        }
        return <p key={index}>{block}</p>;
      })}
    </div>
  );
}

function ThoughtRow({ thought, onPark }: { thought: Thought; onPark?: () => void }) {
  return (
    <div className="thought-row">
      <GitPullRequestArrow size={16} />
      <div>
        <strong>{thought.content}</strong>
        <span>
          {thought.type} · {thought.maturity} · heat {thought.heat.toFixed(1)}
        </span>
      </div>
      {onPark ? (
        <button className="small-button" onClick={onPark}>
          Park
        </button>
      ) : null}
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
    chat: "Chat",
    thinking: "Thinking Memory",
    projects: "Projects",
    project: "Project",
    task: "Task",
    review: "Review",
    tasks: "Tasks"
  }[view];
}

function subtitleForView(view: View): string {
  return {
    drive: "Realtime voice surface; LiveKit connection comes next.",
    chat: "Text chat and push-to-dictate voice messages.",
    thinking: "Brainstorm spaces, open loops, tensions, and candidates.",
    projects: "",
    project: "Project memory, linked tasks, and extracted context.",
    task: "Task status, priority, notes, and project context.",
    review: "Candidates, open loops, and execution friction.",
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
