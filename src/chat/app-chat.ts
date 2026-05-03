import type Database from "better-sqlite3";
import { AppConversationRepository } from "../repositories/app-conversations.js";
import type { AppConversation } from "../repositories/app-conversations.js";
import { AppChatRepository } from "../repositories/app-chat.js";
import type { AppChatMessage } from "../repositories/app-chat.js";
import { AppPromptLogRepository } from "../repositories/app-prompt-logs.js";
import type { AppPromptLog } from "../repositories/app-prompt-logs.js";
import { prepareOpenClawSession, readOpenClawTrajectorySummary, runOpenClawSessionTurn } from "./openclaw-agent.js";
import type { OpenClawActivity, OpenClawPreparedSession } from "./openclaw-agent.js";
import { buildContextualAgentMessage, conversationContextFromStorage, resolveConversationContext } from "./conversation-context.js";
import type { ConversationContext } from "./conversation-context.js";
import { deriveConversationTitle } from "./conversation-title.js";
import { env } from "../config/env.js";
import { addTurnTraceEvent, completeTurnTrace, createTurnTrace } from "./turn-trace.js";
import type { AppChatTurnTrace } from "./turn-trace.js";
import type { ChatTurnDiagnosticContext } from "../diagnostics/chat-turns.js";

export type AppChatMessageInput = {
  message: string;
  conversationId?: number | null;
  context?: ConversationContext | null;
  source?: "app_text" | "app_voice_message";
};

export type AppChatMessageResult = {
  reply: string;
  conversationId: number | null;
  context: ConversationContext;
  messages: AppChatMessage[];
  activities: OpenClawActivity[];
};

export type AppChatAgentRunner = (
  message: string,
  options: { conversationId: number; promptLogId: number; trace: AppChatTurnTrace }
) => Promise<{ text: string; activities: OpenClawActivity[]; openClawSessionId?: string | null; openClawSessionKey?: string | null }>;

export type PreparedAppChatTurn = {
  conversationId: number;
  promptLogId: number;
  context: ConversationContext;
  agentMessage: string;
  trace: AppChatTurnTrace;
};

export type PreparedConversationContext = {
  conversation: AppConversation;
  context: ConversationContext;
  created: boolean;
  openClawSessionKey: string;
  openClawSession: OpenClawPreparedSession | null;
};

export class AppChatService {
  private readonly chatMessages: AppChatRepository;
  private readonly conversations: AppConversationRepository;
  private readonly promptLogs: AppPromptLogRepository;
  private readonly activeConversationTurns = new Set<number>();

  constructor(
    private readonly db: Database.Database,
    private readonly runAgent: AppChatAgentRunner = async (message, options) => {
      const sessionKey = openClawSessionKeyForConversation(options.conversationId);
      const result = await runOpenClawSessionTurn(message, {
        sessionKey,
        label: openClawSessionLabelForConversation(options.conversationId)
      }, {
        timeoutSeconds: env.dmaxOpenClawTimeoutSeconds,
        diagnostics: createDiagnosticContext(options.trace, {
          conversationId: options.conversationId,
          promptLogId: options.promptLogId,
          openClawSessionId: sessionKey
        })
      });
      return {
        text: result.text,
        activities: result.activities,
        openClawSessionId: result.sessionId,
        openClawSessionKey: result.sessionKey
      };
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

  async prepareConversationContext(
    context: ConversationContext,
    diagnostics?: ChatTurnDiagnosticContext
  ): Promise<PreparedConversationContext> {
    const resolved = resolveConversationContext(this.db, context);
    const existing = this.conversations.findLatestByContext({
      contextType: resolved.contextType,
      contextEntityId: resolved.contextEntityId
    });
    const conversation = existing ?? this.conversations.create({
      title: resolved.title,
      contextType: resolved.contextType,
      contextEntityId: resolved.contextEntityId
    });
    const openClawSessionKey = openClawSessionKeyForConversation(conversation.id);

    let openClawSession: OpenClawPreparedSession | null = null;
    try {
      openClawSession = await prepareOpenClawSession({
        key: openClawSessionKey,
        label: openClawSessionLabelForConversation(conversation.id, conversation.title ?? resolved.title),
        model: env.dmaxOpenClawModel
      }, { diagnostics });
    } catch {
      // Prewarm must not make page navigation fail. The real chat turn still reports OpenClaw errors.
    }

    return {
      conversation,
      context: resolved.context,
      created: !existing,
      openClawSessionKey,
      openClawSession
    };
  }

  async prepareOpenClawConversationSession(conversationId: number): Promise<OpenClawPreparedSession | null> {
    const conversation = this.conversations.findById(conversationId);
    if (!conversation) {
      return null;
    }

    return await prepareOpenClawSession({
      key: openClawSessionKeyForConversation(conversation.id),
      label: openClawSessionLabelForConversation(conversation.id, conversation.title),
      model: env.dmaxOpenClawModel
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
        messages: [],
        activities: []
      };
    }

    const agentResult = await this.runPreparedTurn(prepared);
    return this.completePreparedTurn(prepared, agentResult);
  }

  prepareMessageTurn(input: AppChatMessageInput, options: { traceStartedAt?: string; traceId?: string } = {}): PreparedAppChatTurn | null {
    const trace = createTurnTrace(
      options.traceStartedAt,
      options.traceStartedAt ? "api_request_received" : "chat_turn_started",
      options.traceId
    );
    const message = input.message.trim();
    if (!message) {
      return null;
    }

    addTurnTraceEvent(trace, "chat_prepare_started", {
      hasConversationId: Boolean(input.conversationId),
      hasContext: Boolean(input.context),
      source: input.source ?? "app_text"
    });
    const source = input.source ?? "app_text";
    if (input.conversationId && this.activeConversationTurns.has(input.conversationId)) {
      throw new Error("In dieser Chat-Session läuft bereits ein Agent-Turn. Warte kurz, bis d-max geantwortet hat.");
    }

    const resolved = this.resolveInputContext(input);
    addTurnTraceEvent(trace, "context_resolved", {
      contextType: resolved.contextType,
      contextEntityId: resolved.contextEntityId
    });
    const conversation = this.conversations.findById(input.conversationId ?? 0)
      ?? this.conversations.create({
        title: deriveConversationTitle(message),
        contextType: resolved.contextType,
        contextEntityId: resolved.contextEntityId
      });
    addTurnTraceEvent(trace, "conversation_ready", {
      conversationId: conversation.id,
      reusedConversation: Boolean(input.conversationId)
    });
    const previousMessages = this.chatMessages.list(20, { conversationId: conversation.id });
    if (previousMessages.length === 0 && !conversation.title?.trim()) {
      this.conversations.updateTitle(conversation.id, deriveConversationTitle(message));
    }
    const userMessage = this.chatMessages.create({ conversationId: conversation.id, role: "user", content: message, source });
    addTurnTraceEvent(trace, "user_message_persisted", {
      userMessageId: userMessage.id,
      previousMessages: previousMessages.length
    });

    const agentMessage = buildContextualAgentMessage(message, resolved);
    addTurnTraceEvent(trace, "agent_prompt_built", {
      promptChars: agentMessage.length
    });
    const promptLog = this.promptLogs.create({
      conversationId: conversation.id,
      userMessageId: userMessage.id,
      openClawSessionId: openClawSessionKeyForConversation(conversation.id),
      contextType: resolved.contextType,
      contextEntityId: resolved.contextEntityId,
      userInput: message,
      systemInstructions: resolved.promptSections.systemInstructions,
      contextData: resolved.promptSections.contextData,
      memoryHistory: formatMemoryHistory(previousMessages),
      tools: OPENCLAW_TOOL_CONTEXT,
      finalPrompt: agentMessage,
      turnTrace: trace
    });
    addTurnTraceEvent(trace, "prompt_log_persisted", {
      promptLogId: promptLog.id,
      openClawSessionId: openClawSessionKeyForConversation(conversation.id)
    });
    this.persistTurnTrace(promptLog.id, trace);

    return {
      conversationId: conversation.id,
      promptLogId: promptLog.id,
      context: resolved.context,
      agentMessage,
      trace
    };
  }

  async runPreparedTurn(prepared: PreparedAppChatTurn): Promise<{
    text: string;
    activities: OpenClawActivity[];
    openClawSessionId?: string | null;
    openClawSessionKey?: string | null;
  }> {
    if (this.activeConversationTurns.has(prepared.conversationId)) {
      throw new Error("In dieser Chat-Session läuft bereits ein Agent-Turn. Warte kurz, bis d-max geantwortet hat.");
    }

    this.activeConversationTurns.add(prepared.conversationId);
    addTurnTraceEvent(prepared.trace, "agent_turn_started", {
      openClawSessionId: openClawSessionKeyForConversation(prepared.conversationId)
    });
    this.persistTurnTrace(prepared.promptLogId, prepared.trace);
    try {
      const result = await this.runAgentSafely(prepared.agentMessage, prepared.conversationId, prepared.promptLogId, prepared.trace);
      addTurnTraceEvent(prepared.trace, "agent_turn_finished", {
        replyChars: result.text.length,
        activities: result.activities.length
      });
      this.persistTurnTrace(prepared.promptLogId, prepared.trace);
      return result;
    } finally {
      this.activeConversationTurns.delete(prepared.conversationId);
    }
  }

  completePreparedTurn(
    prepared: PreparedAppChatTurn,
    agentResult: {
      text: string;
      activities: OpenClawActivity[];
      openClawSessionId?: string | null;
      openClawSessionKey?: string | null;
    }
  ): AppChatMessageResult {
    addTurnTraceEvent(prepared.trace, "response_creation_started", {
      replyChars: agentResult.text.length,
      activities: agentResult.activities.length
    });
    const assistantMessage = this.chatMessages.create({
      conversationId: prepared.conversationId,
      role: "assistant",
      content: agentResult.text,
      source: "system"
    });
    addTurnTraceEvent(prepared.trace, "assistant_message_persisted", {
      assistantMessageId: assistantMessage.id
    });
    this.conversations.touch(prepared.conversationId);
    addTurnTraceEvent(prepared.trace, "conversation_touched");
    prepared.trace.openClaw = readOpenClawTrajectorySummary(agentResult.openClawSessionId ?? `dmax-web-chat-${prepared.conversationId}`, {
      after: prepared.trace.startedAt
    });
    addTurnTraceEvent(prepared.trace, "response_creation_finished");
    completeTurnTrace(prepared.trace);
    this.persistTurnTrace(prepared.promptLogId, prepared.trace);

    return {
      reply: agentResult.text,
      conversationId: prepared.conversationId,
      context: prepared.context,
      messages: [assistantMessage],
      activities: agentResult.activities
    };
  }

  private async runAgentSafely(
    message: string,
    conversationId: number,
    promptLogId: number,
    trace: AppChatTurnTrace
  ): Promise<{
    text: string;
    activities: OpenClawActivity[];
    openClawSessionId?: string | null;
    openClawSessionKey?: string | null;
  }> {
    try {
      return await this.runAgent(message, { conversationId, promptLogId, trace });
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

  private persistTurnTrace(promptLogId: number, trace: AppChatTurnTrace): void {
    try {
      this.promptLogs.updateTurnTrace(promptLogId, trace);
    } catch {
      // Trace persistence is diagnostic only; it must not break chat delivery.
    }
  }
}

function openClawSessionKeyForConversation(conversationId: number): string {
  return `explicit:dmax-web-chat-${conversationId}`;
}

function openClawSessionLabelForConversation(conversationId: number, title?: string | null): string {
  const cleanedTitle = title?.trim();
  return cleanedTitle ? `d-max app conversation ${conversationId}: ${cleanedTitle}` : `d-max app conversation ${conversationId}`;
}

function createDiagnosticContext(
  trace: AppChatTurnTrace,
  detail: Omit<ChatTurnDiagnosticContext, "traceId" | "traceStartedAt">
): ChatTurnDiagnosticContext {
  return {
    traceId: trace.traceId,
    traceStartedAt: trace.startedAt,
    ...detail
  };
}

const OPENCLAW_TOOL_CONTEXT = [
  "OpenClaw receives d-max MCP tools through the configured MCP server.",
  "The full tool schemas are owned by OpenClaw at runtime; d-max does not inline those schemas into the message string.",
  "",
  "Initiative behavior:",
  "- The technical object is still Project, but each project has type: idea, project, or habit.",
  "- When Dietrich says idea, impulse, thought, maybe, possibility, or wants to document/sort something loose, createProject with type = idea. Ideas are not time-bound.",
  "- When Dietrich says project, plan, execute, implement, ship, finish, travel, or describes a concrete outcome with a bounded timeframe, createProject with type = project. Use startDate/endDate in YYYY-MM-DD when he gives a time span.",
  "- When Dietrich says habit, Gewohnheit, routine, regularly, daily, weekly, or describes an ongoing practice, createProject with type = habit. Habits usually do not have a clear start/end date.",
  "- categoryId stays required. Use listCategories to find the system Inbox category when the correct category is unclear.",
  "- Changing an existing project's type is a lifecycle change and requires confirmation before updateProject with type.",
  "- Never treat a repeated request as confirmation for a lifecycle change. Ask for an explicit yes/confirmation first.",
  "- The MCP tool path does not trust self-set confirmed flags; a returned requiresConfirmation result means the change was not applied.",
  "",
  "Known d-max tool surface:",
  "- Categories: listCategories, createCategory, updateCategory",
  "- Projects/initiatives: listProjects, getProject, createProject, updateProject, archiveProject, updateProjectMarkdown",
  "- Tasks: listTasks, createTask, updateTask, completeTask, deleteTask"
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
