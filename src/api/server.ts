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
import { ThinkingRepository } from "../repositories/thinking.js";
import { AppChatService } from "../chat/app-chat.js";
import { createLiveKitVoiceSession } from "./livekit.js";

const port = env.dmaxApiPort;

migrate(env.databasePath);

const db = openDatabase();
const categories = new CategoryRepository(db);
const projects = new ProjectRepository(db);
const tasks = new TaskRepository(db);
const thinking = new ThinkingRepository(db);
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
      const activeSpaces = thinking.listSpaces({ status: "active" });

      sendJson(res, 200, {
        categories: categories.list(),
        projects: activeProjects,
        tasks: openTasks,
        thinkingSpaces: activeSpaces
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
      sendJson(res, 200, { category });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/projects") {
      sendJson(res, 200, { projects: projects.list({ status: parseOptionalStatus(url.searchParams.get("status")) }) });
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
        tasks: tasks.list({ projectId: project.id }),
        thoughtLinks: thinking.listThoughtLinks({ toEntityType: "project", toEntityId: project.id })
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      const status = url.searchParams.get("status") as TaskStatus | null;
      sendJson(res, 200, { tasks: tasks.list({ status: status ?? undefined }) });
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
      sendJson(res, 200, { task });
      return;
    }

    const completeTaskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/complete$/);
    if (req.method === "POST" && completeTaskMatch) {
      const task = tasks.complete(Number(completeTaskMatch[1]));
      sendJson(res, 200, { task });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/thinking/spaces") {
      sendJson(res, 200, { spaces: thinking.listSpaces({ status: "active" }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/voice/session") {
      const body = voiceSessionBody.parse(await readJson(req));
      const session = await createLiveKitVoiceSession(body);
      sendJson(res, 200, { session });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/message") {
      const body = chatMessageBody.parse(await readJson(req));
      const result = await chat.handleMessage(body);
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/chat/messages") {
      sendJson(res, 200, { messages: chat.listMessages() });
      return;
    }

    const thinkingContextMatch = url.pathname.match(/^\/api\/thinking\/spaces\/(\d+)\/context$/);
    if (req.method === "GET" && thinkingContextMatch) {
      sendJson(res, 200, { context: thinking.getThinkingContext(Number(thinkingContextMatch[1])) });
      return;
    }

    const thoughtMatch = url.pathname.match(/^\/api\/thinking\/thoughts\/(\d+)$/);
    if (req.method === "PATCH" && thoughtMatch) {
      const body = updateThoughtBody.parse(await readJson(req));
      const thought = thinking.updateThought({ id: Number(thoughtMatch[1]), ...body });
      sendJson(res, 200, { thought });
      return;
    }

    const tensionMatch = url.pathname.match(/^\/api\/thinking\/tensions\/(\d+)$/);
    if (req.method === "PATCH" && tensionMatch) {
      const body = updateTensionBody.parse(await readJson(req));
      const tension = thinking.updateTension({ id: Number(tensionMatch[1]), ...body });
      sendJson(res, 200, { tension });
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

const updateThoughtBody = z.object({
  status: z.enum(["active", "parked", "resolved", "contradicted", "discarded"]).optional(),
  maturity: z.enum(["spark", "named", "connected", "testable", "committed", "operational"]).optional(),
  heat: z.number().min(0).max(1).optional()
});

const updateTensionBody = z.object({
  status: z.enum(["unresolved", "parked", "resolved", "discarded"]).optional(),
  pressure: z.enum(["low", "medium", "high"]).optional()
});

const voiceSessionBody = z.object({
  mode: z.literal("drive"),
  thinkingSpaceId: z.number().int().positive().nullable().optional()
});

const chatMessageBody = z.object({
  message: z.string().trim().min(1),
  thinkingSpaceId: z.number().int().positive().nullable().optional(),
  source: z.enum(["app_text", "app_voice_message"]).optional()
});

function parseOptionalStatus(status: string | null) {
  if (status === "active" || status === "paused" || status === "completed" || status === "archived") {
    return status;
  }

  return undefined;
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

function sendJson(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": "http://localhost:5173",
    "access-control-allow-methods": "GET,POST,PATCH,OPTIONS",
    "access-control-allow-headers": "content-type"
  });
  res.end(JSON.stringify(body));
}
