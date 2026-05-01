import { randomUUID } from "node:crypto";
import { AccessToken } from "livekit-server-sdk";
import { env } from "../config/env.js";
import { registerVoiceSession } from "./voice-session-registry.js";

export type LiveKitVoiceSession = {
  livekitUrl: string;
  token: string;
  roomName: string;
  participantName: string;
};

export async function createLiveKitVoiceSession(input: { mode: "drive" }): Promise<LiveKitVoiceSession> {
  if (!env.livekitUrl || !env.livekitApiKey || !env.livekitApiSecret) {
    throw new Error("LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET are required.");
  }

  const roomName = `dmax-${input.mode}-${randomUUID()}`;
  const participantName = `dietrich-${randomUUID()}`;
  const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
    identity: participantName,
    name: "Dietrich",
    metadata: JSON.stringify({ mode: input.mode })
  });

  token.addGrant({
    room: roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  const session = {
    livekitUrl: env.livekitUrl,
    token: await token.toJwt(),
    roomName,
    participantName
  };

  registerVoiceSession({
    roomName,
    participantName,
    mode: input.mode,
    createdAt: new Date().toISOString()
  });

  return session;
}

export async function createLiveKitAgentToken(input: { roomName: string }): Promise<string> {
  if (!env.livekitApiKey || !env.livekitApiSecret) {
    throw new Error("LIVEKIT_API_KEY and LIVEKIT_API_SECRET are required.");
  }

  const identity = `dmax-agent-${randomUUID()}`;
  const token = new AccessToken(env.livekitApiKey, env.livekitApiSecret, {
    identity,
    name: "d-max Voice Agent",
    metadata: JSON.stringify({ role: "dmax_voice_agent" })
  });

  token.addGrant({
    room: input.roomName,
    roomJoin: true,
    canPublish: true,
    canSubscribe: true,
    canPublishData: true
  });

  return token.toJwt();
}
