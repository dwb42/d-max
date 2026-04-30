import type Database from "better-sqlite3";
import { AppChatRepository } from "../repositories/app-chat.js";
import type { AppChatMessage } from "../repositories/app-chat.js";
import { runOpenClawAgentTurn } from "./openclaw-agent.js";

export type AppChatMessageInput = {
  message: string;
  thinkingSpaceId?: number | null;
  source?: "app_text" | "app_voice_message";
};

export type AppChatMessageResult = {
  reply: string;
  thinkingSpaceId: number | null;
  captured: boolean;
  savedThoughts: number;
  messages: AppChatMessage[];
};

export type AppChatAgentRunner = (message: string) => Promise<string>;

export class AppChatService {
  private readonly chatMessages: AppChatRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly runAgent: AppChatAgentRunner = async (message) => (await runOpenClawAgentTurn(message)).text
  ) {
    this.chatMessages = new AppChatRepository(db);
  }

  listMessages(): AppChatMessage[] {
    return this.chatMessages.list();
  }

  async handleMessage(input: AppChatMessageInput): Promise<AppChatMessageResult> {
    const message = input.message.trim();
    if (!message) {
      const reply = "Schreib mir kurz, was du sortieren oder anlegen möchtest.";
      return {
        reply,
        thinkingSpaceId: input.thinkingSpaceId ?? null,
        captured: false,
        savedThoughts: 0,
        messages: []
      };
    }

    const source = input.source ?? "app_text";
    const spaceId = input.thinkingSpaceId ?? null;
    this.chatMessages.create({ role: "user", content: message, source, thinkingSpaceId: spaceId });
    const reply = await this.runAgent(message);
    const assistantMessage = this.chatMessages.create({ role: "assistant", content: reply, source: "system", thinkingSpaceId: spaceId });

    return {
      reply,
      thinkingSpaceId: spaceId,
      captured: false,
      savedThoughts: 0,
      messages: [assistantMessage]
    };
  }
}
