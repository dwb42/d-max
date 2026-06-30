import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MutableRefObject } from "react";
import { CheckCircle2, ChevronDown, Mic2, Pause, Play, Send, Square, X } from "lucide-react";
import { RichText, renderInlineMarkup } from "../../components/ui/index.js";
import type {
  AppConversation,
  ChatActivity,
  ChatResearchSummary,
  ChatWorkspaceSummary,
  ConversationContext,
  OpenClawStatus,
  PersistedChatMessage
} from "../../types.js";

export type VoiceState = "idle" | "connecting" | "listening" | "speaking";
export type ChatVoicePhase = "idle" | "recording" | "transcribing";
export type ChatMessage = {
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
  researchSummary?: ChatResearchSummary | null;
};
export type ContextualAgentState = {
  open: boolean;
  context: ConversationContext | null;
  label: string;
  conversationId: number | null;
  conversations: AppConversation[];
};
export type AudioMeterHandle = {
  context: AudioContext;
  source: MediaStreamAudioSourceNode;
  analyser: AnalyserNode;
  raf: number;
};

export function DmaxAgentButton(props: { status: OpenClawStatus | null; active: boolean; onClick: () => void }) {
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

export function DriveView(props: {
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
  autoPlayAudioMessageId: string | null;
  onAutoPlayAudioSettled: () => void;
  threadRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const isVoiceActive = props.voicePhase !== "idle";
  const visibleMessages = props.messages.filter((message) => message.text.trim() || message.activities?.length || message.source);
  const showEmptyState = visibleMessages.length === 0 && !props.busy;
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
      <div className={`chat-thread ${showEmptyState ? "empty" : ""}`} ref={props.threadRef}>
        {showEmptyState ? <div className="chat-empty-state">Noch keine Nachrichten in diesem Chat.</div> : null}
        {visibleMessages.map((message) => (
          <article key={message.id} className={`chat-message ${message.role}`}>
            {message.role === "assistant" ? (
              <>
                <ResearchSummaryBubble summary={message.researchSummary ?? researchSummaryFromActivities(message.activities ?? [])} />
                <GoogleWorkspaceBubble summary={workspaceSummaryFromActivities(message.activities ?? [])} />
                {message.activities?.length ? <ActivityTrail activities={message.activities} /> : null}
              </>
            ) : null}
            <RichText text={message.text} />
            {message.role === "assistant" && hasChatAudioState(message) ? (
              <ChatAudioPlayer
                message={message}
                autoPlay={props.autoPlayAudioMessageId === message.id}
                onAutoPlaySettled={props.onAutoPlayAudioSettled}
              />
            ) : null}
            {message.role !== "assistant" && message.activities?.length ? <ActivityTrail activities={message.activities} /> : null}
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
            <ResearchSummaryBubble summary={researchSummaryFromActivities(props.activities)} live />
            <GoogleWorkspaceBubble summary={workspaceSummaryFromActivities(props.activities)} live />
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
            placeholder="Nachricht an DMAX"
          />
        ) : null}
        {props.voicePhase === "recording" ? (
          <div className="voice-message-recorder">
            <VoiceMessageWaveform level={props.voiceLevel} active />
            <div className="voice-message-controls">
              <button type="button" className="icon-button danger voice-discard-button" onClick={props.onDiscardVoiceMessage} title="Aufnahme verwerfen" aria-label="Voice Message Aufnahme abbrechen">
                <X size={18} />
              </button>
              <button type="button" className="icon-button confirm voice-send-button" onClick={props.onConfirmVoiceMessage} title="Voice Message abschicken" aria-label="Voice Message abschicken">
                <CheckCircle2 size={28} />
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
            <button type="button" className="secondary-action compact voice-entry-action" onClick={props.onStartVoiceMessage} disabled={props.busy}>
              <Mic2 size={22} />
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

function ChatAudioPlayer(props: { message: ChatMessage; autoPlay?: boolean; onAutoPlaySettled?: () => void }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const autoPlayAttemptedRef = useRef(false);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState((props.message.audioDurationMs ?? 0) / 1000);
  const status = props.message.audioGenerationStatus ?? "none";
  const canPlay = Boolean(props.message.audioUrl && status === "ready");

  useEffect(() => {
    autoPlayAttemptedRef.current = false;
  }, [props.message.id, props.message.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!props.autoPlay || !audio || !canPlay || autoPlayAttemptedRef.current) {
      return;
    }

    autoPlayAttemptedRef.current = true;
    audio.currentTime = 0;
    setCurrentTime(0);
    void audio
      .play()
      .then(() => {
        setPlaying(true);
      })
      .catch(() => {
        setPlaying(false);
      })
      .finally(() => {
        props.onAutoPlaySettled?.();
      });
  }, [canPlay, props.autoPlay, props.message.audioUrl, props.onAutoPlaySettled]);

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

  function seekAudio(nextTime: number) {
    const audio = audioRef.current;
    if (!audio || !canPlay || duration <= 0) {
      return;
    }

    const boundedTime = Math.min(Math.max(nextTime, 0), duration);
    audio.currentTime = boundedTime;
    setCurrentTime(boundedTime);
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
      <button type="button" className="chat-audio-play-button" onClick={() => void togglePlayback()} disabled={!canPlay} title={playing ? "Pause" : "Abspielen"} aria-label={playing ? "Sprachantwort pausieren" : "Sprachantwort abspielen"}>
        {playing ? <Pause size={28} /> : <Play size={28} />}
        {playing ? "Pause" : "Abspielen"}
      </button>
      <input
        className="chat-audio-seek"
        type="range"
        min="0"
        max={duration > 0 ? duration : 0}
        step="0.1"
        value={duration > 0 ? Math.min(currentTime, duration) : 0}
        disabled={!canPlay || duration <= 0}
        aria-label="Position der Sprachantwort"
        onChange={(event) => seekAudio(Number(event.currentTarget.value))}
      />
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

export function AgentDrawer(props: {
  label: string;
  conversations: AppConversation[];
  conversationId: number | null;
  agentStatus: OpenClawStatus | null;
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
  autoPlayAudioMessageId: string | null;
  onAutoPlayAudioSettled: () => void;
  onSelectConversation: (conversationId: number) => void;
  onNewChat: () => void;
  onClose: () => void;
  threadRef: MutableRefObject<HTMLDivElement | null>;
}) {
  const [showOldChats, setShowOldChats] = useState(false);

  return (
    <aside className="agent-drawer" aria-label="Contextual DMAX chat">
      <div className="agent-drawer-header">
        <div className="agent-context-title">
          <span>DMAX-Kontext</span>
          <strong>{props.label}</strong>
        </div>
        <div className="agent-drawer-actions">
          <div className="agent-drawer-mobile-toggle">
            <DmaxAgentButton status={props.agentStatus} active={true} onClick={props.onClose} />
          </div>
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
        autoPlayAudioMessageId={props.autoPlayAudioMessageId}
        onAutoPlayAudioSettled={props.onAutoPlayAudioSettled}
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

export function ResizeHandle(props: {
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

function ResearchSummaryBubble({ summary, live = false }: { summary: ChatResearchSummary | null; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!summary) {
    return null;
  }

  const pageLabel = summary.pageCount === 1 ? "1 Seite" : `${summary.pageCount} Seiten`;
  const searchLabel = summary.searchCount === 1 ? "1 Suchlauf" : `${summary.searchCount} Suchläufe`;
  const title = live || summary.status === "running" ? "Webrecherche-Agent aktiv" : "Webrecherche abgeschlossen";
  const subtitle = summary.status === "failed"
    ? "Webrecherche mit Fehlern beendet"
    : `${searchLabel}, ${pageLabel} geprüft`;
  const activeTargets = live ? [...summary.queries.slice(-2), ...summary.pages.map((page) => page.url).slice(-2)].slice(-3) : [];

  return (
    <div className={`research-bubble ${live ? "live" : summary.status}`}>
      <button type="button" className="research-bubble-summary" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="research-status-dot" aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {activeTargets.length ? (
        <div className="research-active-targets">
          {activeTargets.map((target) => <span key={target}>{formatActivityDetail(target)}</span>)}
        </div>
      ) : null}
      {open ? (
        <div className="research-details">
          {summary.queries.length ? (
            <div>
              <strong>Suchanfragen</strong>
              <ul>
                {summary.queries.map((query) => <li key={query}>{query}</li>)}
              </ul>
            </div>
          ) : null}
          {summary.pages.length ? (
            <div>
              <strong>Geprüfte Seiten</strong>
              <ul>
                {summary.pages.map((page) => (
                  <li key={page.url}>
                    <a href={page.url} target="_blank" rel="noreferrer">{displayUrl(page.url)}</a>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function GoogleWorkspaceBubble({ summary, live = false }: { summary: ChatWorkspaceSummary | null; live?: boolean }) {
  const [open, setOpen] = useState(false);
  if (!summary) {
    return null;
  }

  const operationLabel = summary.operationCount === 1 ? "1 Tabellenaktion" : `${summary.operationCount} Tabellenaktionen`;
  const title = live || summary.status === "running" ? "Google-Workspace-Agent aktiv" : "Google Workspace abgeschlossen";
  const subtitle = summary.status === "failed"
    ? "Google Workspace mit Fehlern beendet"
    : `${operationLabel}, ${summary.readCount} lesen, ${summary.writeCount} schreiben`;
  const activeTargets = live
    ? summary.operations
        .slice(-3)
        .map((operation) => [operationLabelForWorkspace(operation.operation, operation.service), operation.range ?? operation.spreadsheetId ?? operation.fileId].filter(Boolean).join(" · "))
    : [];

  return (
    <div className={`workspace-bubble ${live ? "live" : summary.status}`}>
      <button type="button" className="workspace-bubble-summary" onClick={() => setOpen((current) => !current)} aria-expanded={open}>
        <span className="workspace-status-dot" aria-hidden="true" />
        <span>
          <strong>{title}</strong>
          <span>{subtitle}</span>
        </span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {activeTargets.length ? (
        <div className="workspace-active-targets">
          {activeTargets.map((target) => <span key={target}>{formatActivityDetail(target)}</span>)}
        </div>
      ) : null}
      {open ? (
        <div className="workspace-details">
          {summary.operations.length ? (
            <ul>
              {summary.operations.map((operation, index) => (
                <li key={`${operation.operation}-${operation.spreadsheetId ?? ""}-${operation.range ?? ""}-${index}`}>
                  <strong>{operationLabelForWorkspace(operation.operation, operation.service)}</strong>
                  {operation.range ? <span>{operation.range}</span> : null}
                  {operation.spreadsheetId || operation.fileId ? <span>{shortFileId(operation.spreadsheetId ?? operation.fileId ?? "")}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <span>Subagent wurde aktiviert.</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

function researchSummaryFromActivities(activities: ChatActivity[]): ChatResearchSummary | null {
  const researchActivities = activities.filter((activity) => activity.kind === "research" || activity.agentId === "dmax-research");
  const queries = uniqueActivityValues(researchActivities.flatMap((activity) => activity.query ? [activity.query] : []));
  const urls = uniqueActivityValues(researchActivities.flatMap((activity) => activity.url ? [activity.url] : []));
  if (researchActivities.length === 0 && queries.length === 0 && urls.length === 0) {
    return null;
  }
  const completed = [...researchActivities].reverse().find((activity) => activity.kind === "research" && activity.status !== "running");
  const failed = researchActivities.some((activity) => activity.status === "failed");
  return {
    agentId: "dmax-research",
    status: failed ? "failed" : completed ? "completed" : "running",
    startedAt: researchActivities.find((activity) => activity.kind === "research" && activity.status === "running")?.timestamp ?? null,
    completedAt: completed?.timestamp ?? null,
    searchCount: researchActivities.filter((activity) => activity.toolName === "web_search" && activity.kind === "tool_call").length,
    pageCount: researchActivities.filter((activity) => activity.toolName === "web_fetch" && activity.kind === "tool_call").length,
    queries,
    pages: urls.map((url) => ({ url }))
  };
}

function workspaceSummaryFromActivities(activities: ChatActivity[]): ChatWorkspaceSummary | null {
  const workspaceActivities = activities.filter((activity) => activity.kind === "workspace" || activity.agentId === "dmax-google-workspace");
  if (workspaceActivities.length === 0) {
    return null;
  }
  const operations = workspaceActivities
    .filter((activity) => activity.operation)
    .map((activity) => ({
      operation: activity.operation ?? "sheets",
      service: activity.service ?? null,
      fileId: activity.fileId ?? null,
      spreadsheetId: activity.spreadsheetId ?? null,
      range: activity.range ?? null,
      status: activity.status
    }));
  const completed = [...workspaceActivities].reverse().find((activity) => activity.kind === "workspace" && activity.status !== "running");
  const failed = workspaceActivities.some((activity) => activity.status === "failed");
  return {
    agentId: "dmax-google-workspace",
    status: failed ? "failed" : completed ? "completed" : "running",
    startedAt: workspaceActivities.find((activity) => activity.kind === "workspace" && activity.status === "running")?.timestamp ?? null,
    completedAt: completed?.timestamp ?? null,
    operationCount: operations.length,
    readCount: operations.filter((operation) => isWorkspaceReadOperation(operation.operation)).length,
    writeCount: operations.filter((operation) => isWorkspaceWriteOperation(operation.operation)).length,
    operations
  };
}

function operationLabelForWorkspace(operation: string, service?: string | null): string {
  const labels: Record<string, string> = {
    get: "Tabelle gelesen",
    read: "Tabelle gelesen",
    show: "Tabelle gelesen",
    metadata: "Metadaten gelesen",
    raw: "Tabelle gelesen",
    update: "Zellen aktualisiert",
    edit: "Zellen aktualisiert",
    set: "Zellen aktualisiert",
    append: "Zeilen angehaengt",
    add: "Zeilen angehaengt",
    create: "Tabelle erstellt",
    new: "Tabelle erstellt"
  };
  const serviceLabel = service ? workspaceServiceLabel(service) : "Workspace";
  return labels[operation] ?? `${serviceLabel} ${operation}`;
}

function workspaceServiceLabel(service: string): string {
  const labels: Record<string, string> = {
    drive: "Drive",
    docs: "Docs",
    sheets: "Sheets",
    slides: "Slides",
    forms: "Forms",
    sites: "Sites"
  };
  return labels[service] ?? "Workspace";
}

function isWorkspaceReadOperation(operation: string): boolean {
  return ["get", "read", "show", "metadata", "info", "raw", "export", "download", "dl", "notes", "links", "hyperlinks"].includes(operation);
}

function isWorkspaceWriteOperation(operation: string): boolean {
  return ["create", "new", "update", "edit", "set", "append", "add", "insert", "clear", "format", "merge", "unmerge", "freeze", "add-tab", "rename-tab", "delete-tab"].includes(operation);
}

function shortFileId(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}...${value.slice(-6)}` : value;
}

function uniqueActivityValues(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))];
}

function displayUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname === "/" ? "" : parsed.pathname}`;
  } catch {
    return url;
  }
}

function formatActivityDetail(detail: string): string {
  const compact = detail.replace(/\s+/g, " ").trim();
  if (compact.length <= 220) {
    return compact;
  }

  return `${compact.slice(0, 217).trimEnd()}...`;
}
