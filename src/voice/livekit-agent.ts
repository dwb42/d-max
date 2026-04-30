import {
  AudioFrame,
  AudioSource,
  AudioStream,
  LocalAudioTrack,
  RemoteAudioTrack,
  RemoteParticipant,
  RemoteTrackPublication,
  Room,
  RoomEvent,
  Track,
  TrackPublishOptions,
  TrackSource,
  dispose
} from "@livekit/rtc-node";
import { env } from "../config/env.js";
import { createLiveKitAgentToken } from "../api/livekit.js";
import { getLatestRegisteredVoiceSession } from "../api/voice-session-registry.js";
import type { RegisteredVoiceSession } from "../api/voice-session-registry.js";
import { openDatabase } from "../db/connection.js";
import { createToolRunner } from "../mcp/tool-registry.js";
import { VoiceToolBridge } from "./tool-bridge.js";
import { mergeVoiceTranscripts, prepareVoiceCapture, shouldCaptureVoiceTranscript } from "./transcript-capture.js";
import { XaiRealtimeSession } from "./xai-realtime-session.js";

type AudioStats = {
  frames: number;
  samples: number;
  peak: number;
  startedAt: number;
};

type RunningAgent = {
  roomName: string;
  room: Room;
  activeStreams: Set<Promise<void>>;
  xai: XaiRealtimeSession | null;
  audioOutput: AgentAudioOutput | null;
  transcriptCapture: Promise<void>;
  transcriptBuffer: VoiceTranscriptBuffer | null;
  session: RegisteredVoiceSession;
};

type AgentAudioOutput = {
  track: LocalAudioTrack;
  source: AudioSource;
  enqueue: (audio: Int16Array) => void;
  clear: () => void;
  close: () => Promise<void>;
};

type VoiceTranscriptBuffer = {
  push: (transcript: string) => void;
  flush: () => Promise<void>;
};

const explicitRoomName = process.argv.find((arg) => arg.startsWith("--room="))?.slice("--room=".length);
const watchMode = process.argv.includes("--watch") || !explicitRoomName;
let running: RunningAgent | null = null;
let stopping = false;

if (!env.livekitUrl) {
  console.error("LIVEKIT_URL is required.");
  process.exit(1);
}

const livekitUrl = env.livekitUrl;
const db = openDatabase();
const voiceBridge = new VoiceToolBridge(createToolRunner(), db);

if (watchMode) {
  console.log(JSON.stringify({ event: "agent_watch_started" }, null, 2));
  await followLatestRoom();
  const interval = setInterval(() => {
    void followLatestRoom().catch((error: unknown) => {
      console.error(JSON.stringify({ event: "agent_watch_error", error: error instanceof Error ? error.message : "unknown" }, null, 2));
    });
  }, 750);

  process.on("SIGINT", () => {
    clearInterval(interval);
    void shutdown();
  });
  process.on("SIGTERM", () => {
    clearInterval(interval);
    void shutdown();
  });
} else {
  await switchToRoom({
    roomName: explicitRoomName,
    participantName: "browser",
    mode: "drive",
    thinkingSpaceId: null,
    createdAt: new Date().toISOString()
  });
  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
}

async function followLatestRoom(): Promise<void> {
  if (stopping) {
    return;
  }

  const latest = getLatestRegisteredVoiceSession();
  if (!latest) {
    return;
  }

  if (running?.roomName === latest.roomName) {
    return;
  }

  await switchToRoom(latest);
}

async function switchToRoom(session: RegisteredVoiceSession): Promise<void> {
  if (running) {
    await stopRunningAgent();
  }

  const roomName = session.roomName;
  const token = await createLiveKitAgentToken({ roomName });
  const room = new Room();
  const activeStreams = new Set<Promise<void>>();
  const audioOutput = createAgentAudioOutput(roomName);
  let transcriptCapture = Promise.resolve();
  const captureTranscript = (transcript: string | null) => {
    if (!transcript) {
      return;
    }
    transcriptCapture = transcriptCapture.then(() => captureVoiceTranscript(session, transcript)).catch((error: unknown) => {
      console.error(JSON.stringify({ event: "voice_transcript_capture_error", roomName, error: error instanceof Error ? error.message : "unknown" }, null, 2));
    });
    if (running?.roomName === roomName) {
      running.transcriptCapture = transcriptCapture;
    }
  };
  const transcriptBuffer = createVoiceTranscriptBuffer(captureTranscript);
  const xai = createXaiSession(audioOutput);
  running = { roomName, room, activeStreams, xai, audioOutput, transcriptCapture, transcriptBuffer, session };

  console.log(JSON.stringify({ event: "agent_starting", roomName }, null, 2));

  if (xai) {
    await xai.connect();
    console.log(JSON.stringify({ event: "xai_connected", roomName, model: env.xaiRealtimeModel }, null, 2));
  } else {
    console.log(JSON.stringify({ event: "xai_skipped", reason: "XAI_API_KEY is not set" }, null, 2));
  }

  room
    .on(RoomEvent.Connected, () => {
      console.log(JSON.stringify({ event: "agent_connected", roomName, participant: room.localParticipant?.identity }, null, 2));
    })
    .on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log(JSON.stringify({ event: "participant_connected", roomName, identity: participant.identity }, null, 2));
    })
    .on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log(JSON.stringify({ event: "participant_disconnected", roomName, identity: participant.identity }, null, 2));
      if (running?.roomName === roomName) {
        running.xai?.close();
        running.xai = null;
        running.audioOutput?.clear();
      }
    })
    .on(RoomEvent.TrackSubscribed, (track: Track, publication: RemoteTrackPublication, participant: RemoteParticipant) => {
      console.log(
        JSON.stringify(
          {
            event: "track_subscribed",
            roomName,
            participant: participant.identity,
            trackSid: publication.sid,
            kind: track.kind
          },
          null,
          2
        )
      );

      if (track instanceof RemoteAudioTrack && !isAgentParticipant(participant.identity)) {
        const streamTask = consumeAudioTrack(track, participant.identity, roomName, xai).catch((error: unknown) => {
          console.error(JSON.stringify({ event: "audio_stream_error", roomName, error: error instanceof Error ? error.message : "unknown" }, null, 2));
        });
        activeStreams.add(streamTask);
        streamTask.finally(() => activeStreams.delete(streamTask));
      }
    })
    .on(RoomEvent.Disconnected, (reason) => {
      console.log(JSON.stringify({ event: "agent_disconnected", roomName, reason }, null, 2));
    });

  await room.connect(livekitUrl, token, { autoSubscribe: true, dynacast: true });

  if (audioOutput) {
    const localParticipant = room.localParticipant;
    if (!localParticipant) {
      throw new Error("LiveKit local participant is unavailable after connecting.");
    }

    const options = new TrackPublishOptions();
    options.source = TrackSource.SOURCE_MICROPHONE;
    await localParticipant.publishTrack(audioOutput.track, options);
    console.log(JSON.stringify({ event: "agent_audio_output_published", roomName, sampleRate: 24000, channels: 1 }, null, 2));
  }
}

async function stopRunningAgent(): Promise<void> {
  if (!running) {
    return;
  }

  const current = running;
  running = null;
  console.log(JSON.stringify({ event: "agent_room_switching", fromRoom: current.roomName }, null, 2));
  await current.transcriptBuffer?.flush();
  await current.room.disconnect();
  current.xai?.close();
  await current.audioOutput?.close();
  await current.transcriptCapture;
  await Promise.allSettled(Array.from(current.activeStreams));
}

async function consumeAudioTrack(track: RemoteAudioTrack, participantIdentity: string, roomName: string, xai: XaiRealtimeSession | null): Promise<void> {
  const stream = new AudioStream(track, 24000, 1);
  const reader = stream.getReader();
  const stats: AudioStats = {
    frames: 0,
    samples: 0,
    peak: 0,
    startedAt: Date.now()
  };
  let lastLogAt = Date.now();

  console.log(JSON.stringify({ event: "audio_stream_started", roomName, participant: participantIdentity }, null, 2));

  while (true) {
    const result = await reader.read();
    if (result.done) {
      break;
    }

    const frame = result.value;
    stats.frames += 1;
    stats.samples += frame.samplesPerChannel;
    stats.peak = Math.max(stats.peak, peakAbs(frame.data));
    xai?.appendPcm16(frame.data);

    const now = Date.now();
    if (now - lastLogAt >= 1000) {
      console.log(
        JSON.stringify(
          {
            event: "audio_frames_received",
            roomName,
            participant: participantIdentity,
            frames: stats.frames,
            samples: stats.samples,
            sampleRate: frame.sampleRate,
            channels: frame.channels,
            peak: stats.peak,
            seconds: Number(((now - stats.startedAt) / 1000).toFixed(1))
          },
          null,
          2
        )
      );
      lastLogAt = now;
      stats.peak = 0;
    }
  }

  console.log(JSON.stringify({ event: "audio_stream_finished", roomName, participant: participantIdentity }, null, 2));
}

function createXaiSession(audioOutput: AgentAudioOutput | null): XaiRealtimeSession | null {
  if (!env.xaiApiKey) {
    return null;
  }

  return new XaiRealtimeSession({
    apiKey: env.xaiApiKey,
    model: env.xaiRealtimeModel,
    onAudioDelta: (audio) => {
      audioOutput?.enqueue(audio);
    },
    onEvent: (event) => {
      const type = String(event.type ?? "unknown");
      if (type === "conversation.item.input_audio_transcription.completed" && typeof event.transcript === "string") {
        running?.transcriptBuffer?.push(event.transcript);
      }
      if (
        type === "session.created" ||
        type === "session.updated" ||
        type === "input_audio_buffer.speech_started" ||
        type === "input_audio_buffer.speech_stopped" ||
        type === "conversation.item.input_audio_transcription.completed" ||
        type === "response.created" ||
        type === "response.output_audio.delta" ||
        type === "response.output_audio_transcript.delta" ||
        type === "response.done" ||
        type === "error"
      ) {
        console.log(JSON.stringify({ event: "xai_event", type, payload: compactXaiPayload(event) }, null, 2));
      }
    }
  });
}

function createAgentAudioOutput(roomName: string): AgentAudioOutput | null {
  if (!env.xaiApiKey) {
    return null;
  }

  const source = new AudioSource(24000, 1, 1000);
  const track = LocalAudioTrack.createAudioTrack("dmax-grok-voice", source);
  let queue = Promise.resolve();
  let frames = 0;
  let samples = 0;
  let lastLogAt = Date.now();

  const enqueue = (audio: Int16Array) => {
    const frameAudio = new Int16Array(audio.length);
    frameAudio.set(audio);
    queue = queue
      .then(async () => {
        await source.captureFrame(new AudioFrame(frameAudio, 24000, 1, frameAudio.length));
        frames += 1;
        samples += frameAudio.length;

        const now = Date.now();
        if (now - lastLogAt >= 1000) {
          console.log(
            JSON.stringify(
              {
                event: "agent_audio_output_frames_sent",
                roomName,
                frames,
                samples,
                queuedMs: Math.round(source.queuedDuration)
              },
              null,
              2
            )
          );
          lastLogAt = now;
          frames = 0;
          samples = 0;
        }
      })
      .catch((error: unknown) => {
        console.error(JSON.stringify({ event: "agent_audio_output_error", roomName, error: error instanceof Error ? error.message : "unknown" }, null, 2));
      });
  };

  return {
    track,
    source,
    enqueue,
    clear: () => {
      source.clearQueue();
    },
    close: async () => {
      await queue;
      await track.close();
    }
  };
}

async function captureVoiceTranscript(session: RegisteredVoiceSession, transcript: string): Promise<void> {
  const capture = prepareVoiceCapture(transcript);
  if (!session.thinkingSpaceId || !capture) {
    return;
  }

  const result = await voiceBridge.captureThinking({
    spaceId: session.thinkingSpaceId,
    rawInput: capture.rawInput,
    summary: capture.summary,
    thoughts: capture.thoughts
  });

  console.log(
    JSON.stringify(
      {
        event: "voice_transcript_captured",
        roomName: session.roomName,
        spaceId: session.thinkingSpaceId,
        sessionId: result.sessionId,
        savedThoughts: result.savedThoughts,
        thoughtTypes: capture.thoughts.map((thought) => thought.type)
      },
      null,
      2
    )
  );
}

function createVoiceTranscriptBuffer(onFlush: (transcript: string | null) => void): VoiceTranscriptBuffer {
  let pending: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const flushNow = () => {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }

    const transcript = pending;
    pending = null;
    onFlush(transcript);
  };

  return {
    push: (transcript: string) => {
      if (!shouldCaptureVoiceTranscript(transcript)) {
        return;
      }

      pending = mergeVoiceTranscripts(pending, transcript);
      if (timer) {
        clearTimeout(timer);
      }
      timer = setTimeout(flushNow, 2000);
    },
    flush: async () => {
      flushNow();
    }
  };
}

function isAgentParticipant(identity: string): boolean {
  return identity.startsWith("dmax-agent");
}

function compactXaiPayload(event: Record<string, unknown>): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...event };
  if (typeof copy.delta === "string" && copy.delta.length > 80) {
    copy.delta = `[base64:${copy.delta.length}]`;
  }
  return copy;
}

function peakAbs(data: Int16Array): number {
  let peak = 0;
  for (const sample of data) {
    peak = Math.max(peak, Math.abs(sample));
  }
  return peak;
}

async function shutdown(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  console.log(JSON.stringify({ event: "agent_stopping" }, null, 2));
  await stopRunningAgent();
  await dispose();
  db.close();
  process.exit(0);
}
