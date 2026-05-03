import { beforeEach, describe, expect, it } from "vitest";
import type Database from "better-sqlite3";
import { AppChatService } from "../../src/chat/app-chat.js";
import { CategoryRepository } from "../../src/repositories/categories.js";
import { ProjectRepository } from "../../src/repositories/projects.js";
import { TaskRepository } from "../../src/repositories/tasks.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("AppChatService", () => {
  let db: Database.Database;
  let service: AppChatService;
  let agentMessages: string[];

  beforeEach(() => {
    db = createTestDatabase();
    agentMessages = [];
    service = new AppChatService(db, async (message) => {
      agentMessages.push(message);
      return { text: `agent reply to: ${message}`, activities: [] };
    });
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
    expect(messages[0].conversationId).toBeTypeOf("number");
    expect(messages[1].conversationId).toBe(messages[0].conversationId);
  });

  it("replies with the OpenClaw agent answer", async () => {
    const result = await service.handleMessage({
      message: "Projekt einwöchige Fahrradtour im Juni und Projekt Tourenrad kaufen."
    });

    expect(result.reply).toContain("agent reply to:");
    expect(result.conversationId).toBeTypeOf("number");
    expect(result.context).toEqual({ type: "global" });
    expect(agentMessages[0]).toContain("Type: global");
    expect(agentMessages[0]).toContain("Initiative type guidance");
    expect(agentMessages[0]).toContain("Use type=idea");
    expect(agentMessages[0]).toContain("Use type=habit");
    expect(agentMessages[0]).toContain("Projekt einwöchige Fahrradtour im Juni");
  });

  it("passes project context into the agent turn", async () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new ProjectRepository(db).create({
      categoryId: category.id,
      name: "Health Rhythm",
      summary: "Build a stable health rhythm.",
      markdown: "# Overview\n\nSleep, training, and evening energy.\n"
    });
    new TaskRepository(db).create({ projectId: project.id, title: "Plan next training week", priority: "high" });

    const result = await service.handleMessage({
      message: "Fasse mir dieses Projekt zusammen.",
      context: { type: "project", projectId: project.id }
    });

    expect(result.context).toEqual({ type: "project", projectId: project.id });
    expect(result.conversationId).toBeTypeOf("number");
    expect(agentMessages[0]).toContain("Type: project");
    expect(agentMessages[0]).toContain("Health Rhythm");
    expect(agentMessages[0]).toContain("Plan next training week");
  });

  it("logs the exact prompt sent to OpenClaw with readable sections", async () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new ProjectRepository(db).create({
      categoryId: category.id,
      name: "Health Rhythm",
      markdown: "# Overview\n\nSleep, training, and evening energy.\n"
    });

    const result = await service.handleMessage({
      message: "Fasse mir dieses Projekt zusammen.",
      context: { type: "project", projectId: project.id }
    });
    const promptLog = service.listPromptLogs()[0];

    expect(promptLog).toMatchObject({
      conversationId: result.conversationId,
      contextType: "project",
      contextEntityId: project.id,
      userInput: "Fasse mir dieses Projekt zusammen.",
      openClawSessionId: `explicit:dmax-web-chat-${result.conversationId}`
    });
    expect(promptLog.systemInstructions).toContain("Context contract");
    expect(promptLog.systemInstructions).toContain("Initiative type guidance");
    expect(promptLog.contextData).toContain("Health Rhythm");
    expect(promptLog.memoryHistory).toContain("No previous app chat messages");
    expect(promptLog.tools).toContain("createProject");
    expect(promptLog.tools).toContain("createProject with type = idea");
    expect(promptLog.tools).toContain("system Inbox category");
    expect(promptLog.finalPrompt).toBe(agentMessages[0]);
    expect(promptLog.turnTrace?.events.map((event) => event.label)).toEqual(
      expect.arrayContaining([
        "chat_prepare_started",
        "context_resolved",
        "prompt_log_persisted",
        "agent_turn_started",
        "agent_turn_finished",
        "assistant_message_persisted"
      ])
    );
    expect(promptLog.turnTrace?.totalMs).toBeTypeOf("number");
  });

  it("starts a fresh contextual conversation unless a conversation id is provided", async () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new ProjectRepository(db).create({ categoryId: category.id, name: "Health Rhythm" });

    const first = await service.handleMessage({
      message: "Erste Frage",
      context: { type: "project", projectId: project.id }
    });
    const second = await service.handleMessage({
      message: "Neue Frage",
      context: { type: "project", projectId: project.id }
    });
    const continued = await service.handleMessage({
      message: "Folgefrage",
      conversationId: first.conversationId,
      context: { type: "project", projectId: project.id }
    });

    expect(second.conversationId).not.toBe(first.conversationId);
    expect(continued.conversationId).toBe(first.conversationId);
  });

  it("creates and lists empty contextual chat sessions", () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new ProjectRepository(db).create({ categoryId: category.id, name: "Health Rhythm" });

    const first = service.createConversation({ type: "project", projectId: project.id });
    const second = service.createConversation({ type: "project", projectId: project.id });

    expect(service.listConversations({ type: "project", projectId: project.id }).map((conversation) => conversation.id)).toEqual([
      second.id,
      first.id
    ]);
    expect(first.title).toBeNull();
    expect(second.title).toBeNull();
    expect(service.listMessages({ conversationId: second.id })).toEqual([]);
  });

  it("continues a pre-created empty contextual chat session", async () => {
    const category = new CategoryRepository(db).create({ name: "Health" });
    const project = new ProjectRepository(db).create({ categoryId: category.id, name: "Health Rhythm" });
    const conversation = service.createConversation({ type: "project", projectId: project.id });

    const result = await service.handleMessage({
      message: "Weiter mit dieser Session.",
      conversationId: conversation.id,
      context: { type: "project", projectId: project.id }
    });

    expect(result.conversationId).toBe(conversation.id);
    expect(service.listMessages({ conversationId: conversation.id })).toHaveLength(2);
    expect(service.listConversations({ type: "project", projectId: project.id })[0]).toMatchObject({
      id: conversation.id,
      title: "Weiter mit dieser Session"
    });
  });

  it("persists an assistant error message when the agent turn fails", async () => {
    service = new AppChatService(db, async () => {
      throw new Error("agent timeout");
    });

    const result = await service.handleMessage({
      message: "Bitte starten."
    });
    const messages = service.listMessages({ conversationId: result.conversationId });

    expect(result.reply).toContain("agent timeout");
    expect(messages).toHaveLength(2);
    expect(messages[1]).toMatchObject({ role: "assistant", source: "system" });
    expect(messages[1].content).toContain("agent timeout");
  });

  it("rejects concurrent turns in the same conversation before persisting a duplicate user message", async () => {
    let releaseAgent!: () => void;
    let agentStarted!: () => void;
    const started = new Promise<void>((resolve) => {
      agentStarted = resolve;
    });
    const release = new Promise<void>((resolve) => {
      releaseAgent = resolve;
    });
    const conversation = service.createConversation({ type: "global" });
    service = new AppChatService(db, async () => {
      agentStarted();
      await release;
      return { text: "done", activities: [] };
    });

    const firstTurn = service.handleMessage({
      message: "Erste Nachricht",
      conversationId: conversation.id
    });
    await started;

    await expect(
      service.handleMessage({
        message: "Zweite Nachricht",
        conversationId: conversation.id
      })
    ).rejects.toThrow(/läuft bereits ein Agent-Turn/);
    expect(service.listMessages({ conversationId: conversation.id }).map((message) => message.content)).toEqual(["Erste Nachricht"]);

    releaseAgent();
    await firstTurn;
    expect(service.listMessages({ conversationId: conversation.id }).map((message) => message.content)).toEqual(["Erste Nachricht", "done"]);
  });
});
