import http from "node:http";
import { URL } from "node:url";
import { z } from "zod";
import { env } from "../config/env.js";
import { openDatabase } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { CategoryRepository } from "../repositories/categories.js";
import { ProjectRepository } from "../repositories/projects.js";
import type { TaskStatus } from "../repositories/tasks.js";
import { TaskRepository } from "../repositories/tasks.js";
import { StateEventRepository } from "../repositories/state-events.js";
import type { CreateStateEventInput, StateEvent } from "../repositories/state-events.js";
import { AppChatService } from "../chat/app-chat.js";
import { conversationContextSchema } from "../chat/conversation-context.js";
import { listOpenClawSessionActivities } from "../chat/openclaw-agent.js";
import { transcribeAudio } from "../chat/openai-transcription.js";
import { createLiveKitVoiceSession } from "./livekit.js";

const port = env.dmaxApiPort;

migrate(env.databasePath);

const db = openDatabase();
const categories = new CategoryRepository(db);
const projects = new ProjectRepository(db);
const tasks = new TaskRepository(db);
const stateEvents = new StateEventRepository(db);
const chat = new AppChatService(db);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "OPTIONS") {
      sendJson(res, 204, null);
      return;
    }

    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    if (req.method === "GET" && url.pathname === "/health") {
      sendJson(res, 200, { ok: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/app/overview") {
      const activeProjects = projects.list({ status: "active" });
      const openTasks = tasks.list().filter((task) => task.status !== "done" && task.status !== "cancelled");

      sendJson(res, 200, {
        categories: categories.list(),
        projects: activeProjects,
        tasks: openTasks
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/categories") {
      sendJson(res, 200, { categories: categories.list() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/categories") {
      const body = createCategoryBody.parse(await readJson(req));
      const category = categories.create(body);
      emitApiStateEvent({ operation: "createCategory", entityType: "category", entityId: category.id, categoryId: category.id });
      sendJson(res, 200, { category });
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/categories/order") {
      const body = reorderCategoriesBody.parse(await readJson(req));
      const nextCategories = categories.reorder(body.categoryIds);
      emitApiStateEvent({ operation: "reorderCategories", entityType: "category" });
      sendJson(res, 200, { categories: nextCategories });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      sendJson(res, 200, { projects: projects.list({ status: parseOptionalStatus(url.searchParams.get("status")) }) });
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/projects/order") {
      const body = reorderProjectsBody.parse(await readJson(req));
      const nextProjects = projects.reorderWithinCategory(body.categoryId, body.projectIds);
      emitApiStateEvent({ operation: "reorderProjects", entityType: "project", categoryId: body.categoryId });
      sendJson(res, 200, { projects: nextProjects });
      return;
    }

    const projectMatch = url.pathname.match(/^\/api\/projects\/(\d+)$/);
    if (req.method === "GET" && projectMatch) {
      const project = projects.findById(Number(projectMatch[1]));
      if (!project) {
        sendJson(res, 404, { error: "Project not found" });
        return;
      }

      sendJson(res, 200, {
        project,
        tasks: tasks.list({ projectId: project.id })
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      const status = url.searchParams.get("status") as TaskStatus | null;
      sendJson(res, 200, { tasks: tasks.list({ status: status ?? undefined }) });
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/tasks/order") {
      const body = reorderTasksBody.parse(await readJson(req));
      const nextTasks = tasks.reorderWithinProject(body.projectId, body.taskIds);
      emitApiStateEvent({ operation: "reorderTasks", entityType: "task", projectId: body.projectId });
      sendJson(res, 200, { tasks: nextTasks });
      return;
    }

    const taskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)$/);
    if (req.method === "GET" && taskMatch) {
      const task = tasks.findById(Number(taskMatch[1]));
      if (!task) {
        sendJson(res, 404, { error: "Task not found" });
        return;
      }

      const project = projects.findById(task.projectId);
      const category = project ? categories.findById(project.categoryId) : null;
      sendJson(res, 200, { task, project, category });
      return;
    }

    if (req.method === "PATCH" && taskMatch) {
      const body = updateTaskBody.parse(await readJson(req));
      const task = tasks.update({ id: Number(taskMatch[1]), ...body });
      emitApiStateEvent({ operation: "updateTask", entityType: "task", entityId: task.id, taskId: task.id, projectId: task.projectId });
      sendJson(res, 200, { task });
      return;
    }

    const completeTaskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/complete$/);
    if (req.method === "POST" && completeTaskMatch) {
      const task = tasks.complete(Number(completeTaskMatch[1]));
      emitApiStateEvent({ operation: "completeTask", entityType: "task", entityId: task.id, taskId: task.id, projectId: task.projectId });
      sendJson(res, 200, { task });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice/session") {
      const body = voiceSessionBody.parse(await readJson(req));
      const session = await createLiveKitVoiceSession(body);
      sendJson(res, 200, { session });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/voice/transcribe") {
      const audio = await readBuffer(req, 25 * 1024 * 1024);
      const text = await transcribeAudio({
        audio,
        mimeType: req.headers["content-type"] ?? "audio/webm",
        filename: typeof req.headers["x-audio-filename"] === "string" ? req.headers["x-audio-filename"] : undefined
      });
      sendJson(res, 200, { text });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/chat/conversations") {
      const context = parseConversationContextQuery(url);
      sendJson(res, 200, { conversations: chat.listConversations(context) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/conversations") {
      const body = createConversationBody.parse(await readJson(req));
      sendJson(res, 200, { conversation: chat.createConversation(body.context) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/message") {
      const body = chatMessageBody.parse(await readJson(req));
      const result = await chat.handleMessage(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/message/stream") {
      const body = chatMessageBody.parse(await readJson(req));
      const prepared = chat.prepareMessageTurn(body);
      if (!prepared) {
        sendSse(res, async (send) => {
          send("done", {
            reply: "Schreib mir kurz, was du sortieren oder anlegen möchtest.",
            conversationId: body.conversationId ?? null,
            context: body.context ?? { type: "global" },
            messages: [],
            activities: []
          });
        });
        return;
      }

      await sendSse(res, async (send) => {
        send("conversation", {
          conversationId: prepared.conversationId,
          context: prepared.context
        });

        const sessionId = `dmax-web-chat-${prepared.conversationId}`;
        let lastActivitiesJson = "";
        const publishActivities = () => {
          const activities = listOpenClawSessionActivities(sessionId);
          const nextJson = JSON.stringify(activities);
          if (nextJson === lastActivitiesJson) {
            return activities;
          }
          lastActivitiesJson = nextJson;
          send("activity", { activities });
          return activities;
        };
        const activityInterval = setInterval(publishActivities, 1000);

        try {
          const agentResult = await chat.runPreparedTurn(prepared);
          clearInterval(activityInterval);
          const activities = agentResult.activities.length ? agentResult.activities : publishActivities();
          const result = chat.completePreparedTurn(prepared, { ...agentResult, activities });
          send("activity", { activities: result.activities });
          for (const chunk of chunkText(result.reply, 18)) {
            send("answer_delta", { delta: chunk });
            await delay(18);
          }
          send("done", result);
        } catch (error) {
          clearInterval(activityInterval);
          const detail = error instanceof Error ? error.message : "Unknown agent error";
          const agentResult = { text: `Ich konnte den Agent-Turn nicht sauber abschließen: ${detail}`, activities: publishActivities() };
          const result = chat.completePreparedTurn(prepared, agentResult);
          send("activity", { activities: result.activities });
          for (const chunk of chunkText(result.reply, 18)) {
            send("answer_delta", { delta: chunk });
            await delay(18);
          }
          send("done", result);
        }
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/chat/messages") {
      const conversationId = parseOptionalPositiveInt(url.searchParams.get("conversationId"));
      sendJson(res, 200, { messages: chat.listMessages(conversationId ? { conversationId } : undefined) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/chat/activity") {
      const conversationId = parseOptionalPositiveInt(url.searchParams.get("conversationId"));
      if (!conversationId) {
        sendJson(res, 400, { error: "conversationId is required" });
        return;
      }

      sendJson(res, 200, { activities: listOpenClawSessionActivities(`dmax-web-chat-${conversationId}`) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/debug/prompts") {
      sendJson(res, 200, { prompts: chat.listPromptLogs() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/state/events") {
      const after = parseOptionalNonNegativeInt(url.searchParams.get("after"));
      await streamStateEvents(req, res, after ?? stateEvents.latestId());
      return;
    }

    sendJson(res, 404, { error: "Not found" });
  } catch (error) {
    const status = error instanceof z.ZodError ? 400 : 500;
    sendJson(res, status, { error: error instanceof Error ? error.message : "Unknown error" });
  }
});

server.listen(port, () => {
  console.log(`d-max api server listening on http://localhost:${port}`);
});

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

function shutdown(): void {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

const updateTaskBody = z.object({
  title: z.string().trim().min(1).optional(),
  status: z.enum(["open", "in_progress", "blocked", "done", "cancelled"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: z.string().trim().min(1).nullable().optional()
});

const createCategoryBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().trim().min(1).nullable().optional()
});

const reorderCategoriesBody = z.object({
  categoryIds: z.array(z.number().int().positive()).min(1)
});

const reorderProjectsBody = z.object({
  categoryId: z.number().int().positive(),
  projectIds: z.array(z.number().int().positive()).min(1)
});

const reorderTasksBody = z.object({
  projectId: z.number().int().positive(),
  taskIds: z.array(z.number().int().positive()).min(1)
});

const voiceSessionBody = z.object({
  mode: z.literal("drive")
});

const chatMessageBody = z.object({
  message: z.string().trim().min(1),
  conversationId: z.number().int().positive().nullable().optional(),
  context: conversationContextSchema.nullable().optional(),
  source: z.enum(["app_text", "app_voice_message"]).optional()
});

const createConversationBody = z.object({
  context: conversationContextSchema
});

function parseConversationContextQuery(url: URL) {
  const contextType = z
    .enum(["global", "projects", "category", "project", "task"])
    .parse(url.searchParams.get("contextType"));
  const entityId = parseOptionalPositiveInt(url.searchParams.get("contextEntityId"));

  if (contextType === "global" || contextType === "projects") {
    return { type: contextType };
  }

  if (!entityId) {
    throw new Error(`contextEntityId is required for ${contextType} conversations`);
  }

  if (contextType === "category") return { type: "category" as const, categoryId: entityId };
  if (contextType === "project") return { type: "project" as const, projectId: entityId };
  return { type: "task" as const, taskId: entityId };
}

function parseOptionalStatus(status: string | null) {
  if (status === "active" || status === "paused" || status === "completed" || status === "archived") {
    return status;
  }

  return undefined;
}

function parseOptionalPositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

function parseOptionalNonNegativeInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

function emitApiStateEvent(input: Omit<CreateStateEventInput, "source">): StateEvent {
  return stateEvents.create({ source: "api", ...input });
}

async function streamStateEvents(req: http.IncomingMessage, res: http.ServerResponse, after: number): Promise<void> {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  let closed = false;
  let lastEventId = after;
  req.on("close", () => {
    closed = true;
  });

  const send = (event: string, payload: unknown, id?: number) => {
    if (id !== undefined) {
      res.write(`id: ${id}\n`);
    }
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  send("ready", { lastEventId });

  while (!closed) {
    const events = stateEvents.listAfter(lastEventId, 50);
    for (const event of events) {
      lastEventId = event.id;
      send("state_change", event, event.id);
    }

    if (events.length === 0) {
      res.write(": heartbeat\n\n");
      await delay(1000);
    }
  }

  res.end();
}

async function sendSse(
  res: http.ServerResponse,
  handler: (send: (event: string, payload: unknown) => void) => Promise<void>
): Promise<void> {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive"
  });

  const send = (event: string, payload: unknown) => {
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await handler(send);
  } finally {
    res.end();
  }
}

function chunkText(text: string, size: number): string[] {
  const chunks: string[] = [];
  for (let index = 0; index < text.length; index += size) {
    chunks.push(text.slice(index, index + size));
  }
  return chunks;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readJson(req: http.IncomingMessage): Promise<unknown> {
  const body = await readBody(req);
  return body ? JSON.parse(body) : {};
}

function readBody(req: http.IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    let body = "";
    req.setEncoding("utf8");
    req.on("data", (chunk) => {
      body += chunk;
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function readBuffer(req: http.IncomingMessage, maxBytes: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let total = 0;
    req.on("data", (chunk: Buffer) => {
      total += chunk.length;
      if (total > maxBytes) {
        reject(new Error(`Request body exceeds ${maxBytes} bytes.`));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:5173",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body));
}
