import { describe, expect, it } from "vitest";
import { DmaxTelegramBot, startTelegramBot } from "../../src/telegram/bot.js";
import type { AppChatService } from "../../src/chat/app-chat.js";

describe("DMAX Telegram bot bridge", () => {
  it("routes authorized Telegram text through the API-owned app chat service", async () => {
    const sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const chat = {
      async handleMessage(input: { message: string; context: unknown; source: string }) {
        expect(input).toEqual({
          message: "Was steht heute an?",
          context: { type: "global" },
          source: "app_text"
        });
        return { reply: "Heute: Fokusblock planen." };
      }
    } as AppChatService;
    const bot = new DmaxTelegramBot({
      token: "test-token",
      allowedUserIds: new Set(["42"]),
      chat,
      fetchImpl: telegramFetch(sent)
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        text: "  Was steht heute an?  ",
        chat: { id: 100 },
        from: { id: 42 }
      }
    });

    expect(sent).toEqual([
      {
        method: "sendMessage",
        payload: {
          chat_id: 100,
          text: "Heute: Fokusblock planen."
        }
      }
    ]);
  });

  it("ignores unauthorized Telegram senders", async () => {
    const sent: Array<{ method: string; payload: Record<string, unknown> }> = [];
    const chat = {
      async handleMessage() {
        throw new Error("unauthorized sender should not reach app chat");
      }
    } as unknown as AppChatService;
    const bot = new DmaxTelegramBot({
      token: "test-token",
      allowedUserIds: new Set(["42"]),
      chat,
      fetchImpl: telegramFetch(sent)
    });

    await bot.handleUpdate({
      update_id: 1,
      message: {
        text: "hello",
        chat: { id: 100 },
        from: { id: 7 }
      }
    });

    expect(sent).toEqual([]);
  });

  it("does not start without both token and allowed user ids", () => {
    const chat = {} as AppChatService;

    expect(startTelegramBot({ token: "", allowedUserIds: "42", chat })).toBeNull();
    expect(startTelegramBot({ token: "test-token", allowedUserIds: "", chat })).toBeNull();
  });
});

function telegramFetch(sent: Array<{ method: string; payload: Record<string, unknown> }>): typeof fetch {
  return (async (url, init) => {
    const method = String(url).split("/").pop() ?? "";
    sent.push({
      method,
      payload: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>
    });
    return new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: {
        "content-type": "application/json"
      }
    });
  }) as typeof fetch;
}
