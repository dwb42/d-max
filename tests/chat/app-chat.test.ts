import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { AppChatService } from "../../src/chat/app-chat.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("AppChatService", () => {
  let db: Database.Database;
  let service: AppChatService;

  beforeEach(() => {
    db = createTestDatabase();
    service = new AppChatService(db, async (message) => `agent reply to: ${message}`);
  });

  it("persists user and assistant messages", async () => {
    await service.handleMessage({
      message: "Projekt einwöchige Fahrradtour im Juni und Projekt Tourenrad kaufen.",
      source: "app_voice_message"
    });

    const messages = service.listMessages();
    expect(messages).toHaveLength(2);
    expect(messages[0]).toMatchObject({ role: "user", source: "app_voice_message" });
    expect(messages[1]).toMatchObject({ role: "assistant", source: "system" });
  });

  it("replies with the OpenClaw agent answer", async () => {
    const result = await service.handleMessage({
      message: "Projekt einwöchige Fahrradtour im Juni und Projekt Tourenrad kaufen."
    });

    expect(result.reply).toBe("agent reply to: Projekt einwöchige Fahrradtour im Juni und Projekt Tourenrad kaufen.");
  });
});
