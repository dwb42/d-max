import { randomUUID } from "node:crypto";
import type { VoiceEventType, VoiceSessionEvent } from "./types.js";

export class VoiceSessionEventJournal {
  private readonly events: VoiceSessionEvent[] = [];

  constructor(private readonly sessionId: string) {}

  record(type: VoiceEventType, at: string, metadata?: VoiceSessionEvent["metadata"]): VoiceSessionEvent {
    const event: VoiceSessionEvent = {
      id: randomUUID(),
      sessionId: this.sessionId,
      type,
      at,
      ...(metadata ? { metadata } : {})
    };

    this.events.push(event);
    return event;
  }

  list(): VoiceSessionEvent[] {
    return [...this.events];
  }
}

