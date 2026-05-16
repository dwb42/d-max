import type { AppChatService } from "../chat/app-chat.js";

type TelegramFetch = typeof fetch;

type TelegramUpdate = {
  update_id: number;
  message?: {
    message_id?: number;
    text?: string;
    chat?: {
      id?: number;
      type?: string;
    };
    from?: {
      id?: number;
    };
  };
};

type TelegramApiResponse<T> = {
  ok: boolean;
  result?: T;
  description?: string;
};

export type TelegramBotOptions = {
  token?: string;
  allowedUserIds?: string;
  chat: AppChatService;
  fetchImpl?: TelegramFetch;
  pollTimeoutSeconds?: number;
  pollIntervalMs?: number;
};

export type TelegramBotController = {
  stop: () => void;
};

export function startTelegramBot(options: TelegramBotOptions): TelegramBotController | null {
  const token = options.token?.trim();
  if (!token) {
    console.log("[telegram] skipped because TELEGRAM_BOT_TOKEN is not configured.");
    return null;
  }

  const allowedUserIds = parseAllowedUserIds(options.allowedUserIds ?? "");
  if (allowedUserIds.size === 0) {
    console.log("[telegram] skipped because TELEGRAM_ALLOWED_USER_IDS is not configured.");
    return null;
  }

  const bot = new DmaxTelegramBot({ ...options, token, allowedUserIds });
  bot.start();
  return {
    stop: () => bot.stop()
  };
}

export class DmaxTelegramBot {
  private offset: number | undefined;
  private stopped = false;
  private readonly fetchImpl: TelegramFetch;
  private readonly pollTimeoutSeconds: number;
  private readonly pollIntervalMs: number;

  constructor(private readonly options: Omit<TelegramBotOptions, "token" | "allowedUserIds"> & {
    token: string;
    allowedUserIds: Set<string>;
  }) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.pollTimeoutSeconds = options.pollTimeoutSeconds ?? 25;
    this.pollIntervalMs = options.pollIntervalMs ?? 1000;
  }

  start(): void {
    console.log("[telegram] bot polling started.");
    void this.pollLoop();
  }

  stop(): void {
    this.stopped = true;
  }

  async handleUpdate(update: TelegramUpdate): Promise<void> {
    const message = update.message;
    const chatId = message?.chat?.id;
    const senderId = message?.from?.id ?? chatId;
    if (chatId === undefined || senderId === undefined) {
      return;
    }
    if (!this.options.allowedUserIds.has(String(senderId))) {
      return;
    }

    const text = message?.text?.trim();
    if (!text) {
      await this.sendMessage(chatId, "Ich kann im Telegram-Kanal aktuell nur Textnachrichten verarbeiten.");
      return;
    }

    const result = await this.options.chat.handleMessage({
      message: text,
      context: { type: "global" },
      source: "app_text"
    });
    await this.sendMessage(chatId, result.reply);
  }

  private async pollLoop(): Promise<void> {
    while (!this.stopped) {
      try {
        const updates = await this.callTelegram<TelegramUpdate[]>("getUpdates", {
          timeout: this.pollTimeoutSeconds,
          offset: this.offset,
          allowed_updates: ["message"]
        });
        for (const update of updates) {
          this.offset = update.update_id + 1;
          await this.handleUpdate(update);
        }
      } catch (error) {
        console.error(`[telegram] polling failed: ${error instanceof Error ? error.message : "unknown error"}`);
        await delay(this.pollIntervalMs);
      }
    }
  }

  private async sendMessage(chatId: number, text: string): Promise<void> {
    for (const chunk of splitTelegramMessage(text)) {
      await this.callTelegram("sendMessage", {
        chat_id: chatId,
        text: chunk
      });
    }
  }

  private async callTelegram<T>(method: string, payload: Record<string, unknown>): Promise<T> {
    const response = await this.fetchImpl(`https://api.telegram.org/bot${this.options.token}/${method}`, {
      method: "POST",
      headers: {
        "content-type": "application/json"
      },
      body: JSON.stringify(payload)
    });
    const body = await response.json() as TelegramApiResponse<T>;
    if (!response.ok || body.ok !== true) {
      throw new Error(body.description ?? `Telegram ${method} returned HTTP ${response.status}.`);
    }
    return body.result as T;
  }
}

function parseAllowedUserIds(value: string): Set<string> {
  return new Set(value.split(",").map((entry) => entry.trim()).filter(Boolean));
}

function splitTelegramMessage(text: string): string[] {
  const maxLength = 3900;
  if (text.length <= maxLength) {
    return [text];
  }

  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += maxLength) {
    chunks.push(text.slice(index, index + maxLength));
  }
  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
