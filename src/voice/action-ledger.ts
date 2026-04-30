import type { PendingVoiceAction, VoiceActionLedgerEntry, VoiceActionStatus } from "./types.js";

export class VoiceActionLedger {
  private readonly entriesById = new Map<string, VoiceActionLedgerEntry>();
  private readonly entriesByIdempotencyKey = new Map<string, VoiceActionLedgerEntry>();

  propose(action: PendingVoiceAction): VoiceActionLedgerEntry {
    const existing = this.entriesByIdempotencyKey.get(action.idempotencyKey);
    if (existing) {
      return existing;
    }

    const entry: VoiceActionLedgerEntry = { ...action, status: "pending" };
    this.entriesById.set(entry.id, entry);
    this.entriesByIdempotencyKey.set(entry.idempotencyKey, entry);
    return entry;
  }

  confirm(id: string, at: string): VoiceActionLedgerEntry {
    return this.update(id, "confirmed", { confirmedAt: at });
  }

  commit(id: string, at: string): VoiceActionLedgerEntry {
    return this.update(id, "committed", { committedAt: at });
  }

  cancel(id: string, at: string): VoiceActionLedgerEntry {
    return this.update(id, "cancelled", { cancelledAt: at });
  }

  interrupt(id: string, at: string): VoiceActionLedgerEntry {
    return this.update(id, "interrupted", { interruptedAt: at });
  }

  findById(id: string): VoiceActionLedgerEntry | null {
    return this.entriesById.get(id) ?? null;
  }

  findByIdempotencyKey(idempotencyKey: string): VoiceActionLedgerEntry | null {
    return this.entriesByIdempotencyKey.get(idempotencyKey) ?? null;
  }

  list(): VoiceActionLedgerEntry[] {
    return Array.from(this.entriesById.values());
  }

  private update(id: string, status: VoiceActionStatus, patch: Partial<VoiceActionLedgerEntry>): VoiceActionLedgerEntry {
    const existing = this.entriesById.get(id);
    if (!existing) {
      throw new Error(`Pending voice action not found: ${id}`);
    }

    const updated: VoiceActionLedgerEntry = { ...existing, ...patch, status };
    this.entriesById.set(id, updated);
    this.entriesByIdempotencyKey.set(updated.idempotencyKey, updated);
    return updated;
  }
}

