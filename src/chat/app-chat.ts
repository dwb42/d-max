import type Database from "better-sqlite3";
import { AppConversationRepository } from "../repositories/app-conversations.js";
import type { AppConversation } from "../repositories/app-conversations.js";
import { AppChatRepository } from "../repositories/app-chat.js";
import type { AppChatMessage } from "../repositories/app-chat.js";
import { AppPromptLogRepository } from "../repositories/app-prompt-logs.js";
import type { AppPromptLog } from "../repositories/app-prompt-logs.js";
import { runOpenClawAgentTurn } from "./openclaw-agent.js";
import type { OpenClawActivity } from "./openclaw-agent.js";
import { buildContextualAgentMessage, conversationContextFromStorage, resolveConversationContext } from "./conversation-context.js";
import type { ConversationContext } from "./conversation-context.js";
import { deriveConversationTitle } from "./conversation-title.js";
import { env } from "../config/env.js";

export type AppChatMessageInput = {
  message: string;
  conversationId?: number | null;
  context?: ConversationContext | null;
  thinkingSpaceId?: number | null;
  source?: "app_text" | "app_voice_message";
};

export type AppChatMessageResult = {
  reply: string;
  conversationId: number | null;
  context: ConversationContext;
  thinkingSpaceId: number | null;
  captured: boolean;
  savedThoughts: number;
  messages: AppChatMessage[];
  activities: OpenClawActivity[];
};

export type AppChatAgentRunner = (message: string, options: { conversationId: number }) => Promise<{ text: string; activities: OpenClawActivity[] }>;

export type PreparedAppChatTurn = {
  conversationId: number;
  context: ConversationContext;
  thinkingSpaceId: number | null;
  agentMessage: string;
};

export class AppChatService {
  private readonly chatMessages: AppChatRepository;
  private readonly conversations: AppConversationRepository;
  private readonly promptLogs: AppPromptLogRepository;

  constructor(
    private readonly db: Database.Database,
    private readonly runAgent: AppChatAgentRunner = async (message, options) => {
      const result = await runOpenClawAgentTurn(message, {
        sessionId: `dmax-web-chat-${options.conversationId}`,
        timeoutSeconds: env.dmaxOpenClawTimeoutSeconds
      });
      return { text: result.text, activities: result.activities };
    }
  ) {
    this.chatMessages = new AppChatRepository(db);
    this.conversations = new AppConversationRepository(db);
    this.promptLogs = new AppPromptLogRepository(db);
  }

  listMessages(filters: { conversationId?: number | null } = {}): AppChatMessage[] {
    return this.chatMessages.list(80, filters);
  }

  listConversations(context: ConversationContext): AppConversation[] {
    const resolved = resolveConversationContext(this.db, context);
    return this.conversations.listByContext({
      contextType: resolved.contextType,
      contextEntityId: resolved.contextEntityId
    });
  }

  createConversation(context: ConversationContext): AppConversation {
    const resolved = resolveConversationContext(this.db, context);
    return this.conversations.create({
      title: null,
      contextType: resolved.contextType,
      contextEntityId: resolved.contextEntityId
    });
  }

  listPromptLogs(): AppPromptLog[] {
    return this.promptLogs.list();
  }

  async handleMessage(input: AppChatMessageInput): Promise<AppChatMessageResult> {
    const prepared = this.prepareMessageTurn(input);
    if (!prepared) {
      const reply = "Schreib mir kurz, was du sortieren oder anlegen möchtest.";
      return {
        reply,
        conversationId: input.conversationId ?? null,
        context: input.context ?? { type: "global" },
        thinkingSpaceId: input.thinkingSpaceId ?? null,
        captured: false,
        savedThoughts: 0,
        messages: [],
        activities: []
      };
    }

    const agentResult = await this.runPreparedTurn(prepared);
    return this.completePreparedTurn(prepared, agentResult);
  }

  prepareMessageTurn(input: AppChatMessageInput): PreparedAppChatTurn | null {
    const message = input.message.trim();
    if (!message) {
      return null;
    }

    const source = input.source ?? "app_text";
    const spaceId = input.thinkingSpaceId ?? null;
    const resolved = this.resolveInputContext(input);
    const conversation = this.conversations.findById(input.conversationId ?? 0)
      ?? this.conversations.create({
        title: deriveConversationTitle(message),
        contextType: resolved.contextType,
        contextEntityId: resolved.contextEntityId
      });
    const previousMessages = this.chatMessages.list(20, { conversationId: conversation.id });
    if (previousMessages.length === 0 && !conversation.title?.trim()) {
      this.conversations.updateTitle(conversation.id, deriveConversationTitle(message));
    }
    const userMessage = this.chatMessages.create({ conversationId: conversation.id, role: "user", content: message, source, thinkingSpaceId: spaceId });

    const agentMessage = buildContextualAgentMessage(message, resolved);
    this.promptLogs.create({
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      openClawSessionId: `dmax-web-chat-${conversation.id}`,
      contextType: resolved.contextType,
      contextEntityId: resolved.contextEntityId,
      userInput: message,
      systemInstructions: resolved.promptSections.systemInstructions,
      contextData: resolved.promptSections.contextData,
      memoryHistory: formatMemoryHistory(previousMessages),
      tools: OPENCLAW_TOOL_CONTEXT,
      finalPrompt: agentMessage
    });

    return {
      conversationId: conversation.id,
      context: resolved.context,
      thinkingSpaceId: spaceId,
      agentMessage
    };
  }

  async runPreparedTurn(prepared: PreparedAppChatTurn): Promise<{ text: string; activities: OpenClawActivity[] }> {
    return await this.runAgentSafely(prepared.agentMessage, prepared.conversationId);
  }

  completePreparedTurn(
    prepared: PreparedAppChatTurn,
    agentResult: { text: string; activities: OpenClawActivity[] }
  ): AppChatMessageResult {
    const assistantMessage = this.chatMessages.create({
      conversationId: prepared.conversationId,
      role: "assistant",
      content: agentResult.text,
      source: "system",
      thinkingSpaceId: prepared.thinkingSpaceId
    });
    this.conversations.touch(prepared.conversationId);

    return {
      reply: agentResult.text,
      conversationId: prepared.conversationId,
      context: prepared.context,
      thinkingSpaceId: prepared.thinkingSpaceId,
      captured: false,
      savedThoughts: 0,
      messages: [assistantMessage],
      activities: agentResult.activities
    };
  }

  private async runAgentSafely(message: string, conversationId: number): Promise<{ text: string; activities: OpenClawActivity[] }> {
    try {
      return await this.runAgent(message, { conversationId });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "Unknown agent error";
      return { text: `Ich konnte den Agent-Turn nicht sauber abschließen: ${detail}`, activities: [] };
    }
  }

  private resolveInputContext(input: AppChatMessageInput) {
    if (input.conversationId) {
      const conversation = this.conversations.findById(input.conversationId);
      if (conversation) {
        return resolveConversationContext(
          this.db,
          conversationContextFromStorage(conversation.contextType, conversation.contextEntityId)
        );
      }
    }

    if (input.context) {
      return resolveConversationContext(this.db, input.context);
    }

    return resolveConversationContext(this.db, null);
  }
}

const OPENCLAW_TOOL_CONTEXT = [
  "OpenClaw receives d-max MCP tools through the configured MCP server.",
  "The full tool schemas are owned by OpenClaw at runtime; d-max does not inline those schemas into the message string.",
  "",
  "Known d-max tool surface:",
  "- Categories: listCategories, createCategory, updateCategory",
  "- Projects: listProjects, getProject, createProject, updateProject, archiveProject, updateProjectMarkdown",
  "- Tasks: listTasks, createTask, updateTask, completeTask, deleteTask",
  "- Thinking Memory: listThinkingSpaces, getThinkingSpace, getThinkingContext, createThinkingSpace, updateThinkingSpace, createThinkingSession, captureThoughts, listThoughts, updateThought, linkThought, listThoughtLinks, createTension, updateTension, renderOpenLoops, renderProjectGate, renderTaskGate"
].join("\n");

function formatMemoryHistory(messages: AppChatMessage[]): string {
  if (messages.length === 0) {
    return "No previous app chat messages were present in this conversation before this turn.";
  }

  return messages
    .map((message) => {
      const source = message.source === "app_voice_message" ? "voice" : message.source === "app_text" ? "text" : "system";
      return `[${message.createdAt}] ${message.role.toUpperCase()} (${source}):\n${message.content}`;
    })
    .join("\n\n---\n\n");
}
