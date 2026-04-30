import { describe, expect, it } from "vitest";
import { VoiceActionLedger } from "../../src/voice/action-ledger.js";
import type { PendingVoiceAction } from "../../src/voice/types.js";

const action: PendingVoiceAction = {
  id: "action-1",
  tool: "createTask",
  input: { projectId: 1, title: "Grok SIP Spike bauen" },
  summary: "Create task: Grok SIP Spike bauen",
  requiresConfirmation: true,
  unsafeAfterInterruption: true,
  idempotencyKey: "createTask:1:Grok SIP Spike bauen",
  createdAt: "2026-04-28T20:00:00.000Z"
};

describe("VoiceActionLedger", () => {
  it("deduplicates proposals by idempotency key", () => {
    const ledger = new VoiceActionLedger();

    const first = ledger.propose(action);
    const second = ledger.propose({ ...action, id: "action-2" });

    expect(second).toBe(first);
    expect(ledger.list()).toHaveLength(1);
  });

  it("tracks confirmation and commit timestamps", () => {
    const ledger = new VoiceActionLedger();

    ledger.propose(action);
    ledger.confirm(action.id, "2026-04-28T20:01:00.000Z");
    const committed = ledger.commit(action.id, "2026-04-28T20:02:00.000Z");

    expect(committed).toMatchObject({
      status: "committed",
      confirmedAt: "2026-04-28T20:01:00.000Z",
      committedAt: "2026-04-28T20:02:00.000Z"
    });
  });
});

