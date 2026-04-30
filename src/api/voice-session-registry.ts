import fs from "node:fs";
import path from "node:path";

export type RegisteredVoiceSession = {
  roomName: string;
  participantName: string;
  mode: "drive";
  thinkingSpaceId: number | null;
  createdAt: string;
};

const registryPath = path.resolve("data/voice-sessions.json");

export function registerVoiceSession(session: RegisteredVoiceSession): void {
  const sessions = listRegisteredVoiceSessions();
  const next = [session, ...sessions.filter((item) => item.roomName !== session.roomName)].slice(0, 20);
  fs.mkdirSync(path.dirname(registryPath), { recursive: true });
  fs.writeFileSync(registryPath, JSON.stringify(next, null, 2));
}

export function listRegisteredVoiceSessions(): RegisteredVoiceSession[] {
  if (!fs.existsSync(registryPath)) {
    return [];
  }

  const raw = fs.readFileSync(registryPath, "utf8");
  return JSON.parse(raw) as RegisteredVoiceSession[];
}

export function getLatestRegisteredVoiceSession(): RegisteredVoiceSession | null {
  return listRegisteredVoiceSessions()[0] ?? null;
}

