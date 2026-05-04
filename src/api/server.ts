import http from "node:http";
import { URL } from "node:url";
import { z } from "zod";
import { env } from "../config/env.js";
import { openDatabase } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { CategoryRepository } from "../repositories/categories.js";
import { CalendarService } from "../calendar/calendar-service.js";
import { GoogleCalendarAuth } from "../calendar/google-calendar-auth.js";
import { GoogleCalendarProvider } from "../calendar/google-calendar-provider.js";
import { CalendarEntryRepository } from "../repositories/calendar-entries.js";
import { CalendarSourceRepository } from "../repositories/calendar-sources.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import type { InitiativeType } from "../repositories/initiatives.js";
import type { TaskStatus } from "../repositories/tasks.js";
import { TaskRepository } from "../repositories/tasks.js";
import { StateEventRepository } from "../repositories/state-events.js";
import type { CreateStateEventInput, StateEvent } from "../repositories/state-events.js";
import { AppChatService } from "../chat/app-chat.js";
import { conversationContextSchema, listPromptTemplates } from "../chat/conversation-context.js";
import {
  checkOpenClawGatewayStatus,
  createOpenClawActivityCursor,
  listOpenClawSessionActivities,
  listOpenClawSessionActivitiesSince,
  warmOpenClawGateway
} from "../chat/openclaw-agent.js";
import type { OpenClawActivityCursor } from "../chat/openclaw-agent.js";
import { transcribeAudio } from "../chat/openai-transcription.js";
import { createLiveKitVoiceSession } from "./livekit.js";
import { createChatTurnTraceId, recordChatTurnDiagnosticEvent } from "../diagnostics/chat-turns.js";

const port = env.dmaxApiPort;

migrate(env.databasePath);

const db = openDatabase();
const categories = new CategoryRepository(db);
const calendarEntries = new CalendarEntryRepository(db);
const calendarSources = new CalendarSourceRepository(db);
const googleCalendarAuth = new GoogleCalendarAuth();
const initiatives = new InitiativeRepository(db);
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

    if (req.method === "GET" && url.pathname === "/api/openclaw/status") {
      sendJson(res, 200, { openClaw: await checkOpenClawGatewayStatus() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/openclaw/prewarm") {
      const traceStartedAt = new Date().toISOString();
      const traceId = getRequestTraceId(req);
      recordApiDiagnostic(traceId, traceStartedAt, "api_prewarm_request_started");
      const body = prewarmOpenClawBody.parse(await readJson(req));
      recordApiDiagnostic(traceId, traceStartedAt, "api_prewarm_body_read_finished");
      if (body.context) {
        const prepared = await chat.prepareConversationContext(body.context, { traceId, traceStartedAt });
        recordApiDiagnostic(traceId, traceStartedAt, "api_prewarm_response_send_started", {
          conversationId: prepared.conversation.id,
          created: prepared.created,
          openClawSessionId: prepared.openClawSession?.sessionId ?? null
        });
        sendJson(res, 200, {
          ok: true,
          state: prepared.openClawSession ? "ready" : "warming",
          conversation: prepared.conversation,
          created: prepared.created,
          openClawSessionKey: prepared.openClawSessionKey,
          openClawSessionId: prepared.openClawSession?.sessionId ?? null
        });
        return;
      }

      void warmOpenClawGateway().catch((error) => {
        console.error("OpenClaw prewarm failed", error);
      });
      recordApiDiagnostic(traceId, traceStartedAt, "api_prewarm_gateway_warmup_dispatched");
      sendJson(res, 202, { ok: true, state: "warming", conversation: null });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/app/overview") {
      const activeInitiatives = initiatives.list({ status: "active" });
      const openTasks = tasks.list().filter((task) => task.status !== "done" && task.status !== "cancelled");

      sendJson(res, 200, {
        categories: categories.list(),
        initiatives: activeInitiatives,
        tasks: openTasks
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/calendar") {
      const startDate = calendarDateQuery.parse(url.searchParams.get("start"));
      const endDate = calendarDateQuery.parse(url.searchParams.get("end"));
      if (startDate > endDate) {
        sendJson(res, 400, { error: "Calendar start cannot be after end" });
        return;
      }
      sendJson(res, 200, await new CalendarService(db).getView({ startDate, endDate }));
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/calendar/entries") {
      const body = createCalendarEntryBody.parse(await readJson(req));
      const entry = calendarEntries.create(body);
      emitApiStateEvent({
        operation: "createCalendarEntry",
        entityType: "calendar_entry",
        entityId: entry.id,
        initiativeId: entry.initiativeId,
        taskId: entry.taskId
      });
      sendJson(res, 200, { entry });
      return;
    }

    const calendarEntryMatch = url.pathname.match(/^\/api\/calendar\/entries\/(\d+)$/);
    if (req.method === "PATCH" && calendarEntryMatch) {
      const body = updateCalendarEntryBody.parse(await readJson(req));
      const entry = calendarEntries.update({ id: Number(calendarEntryMatch[1]), ...body });
      emitApiStateEvent({
        operation: "updateCalendarEntry",
        entityType: "calendar_entry",
        entityId: entry.id,
        initiativeId: entry.initiativeId,
        taskId: entry.taskId
      });
      sendJson(res, 200, { entry });
      return;
    }

    if (req.method === "DELETE" && calendarEntryMatch) {
      const id = Number(calendarEntryMatch[1]);
      const existing = calendarEntries.findById(id);
      calendarEntries.delete(id);
      emitApiStateEvent({
        operation: "deleteCalendarEntry",
        entityType: "calendar_entry",
        entityId: id,
        initiativeId: existing?.initiativeId ?? null,
        taskId: existing?.taskId ?? null
      });
      sendJson(res, 200, { deleted: true, id });
      return;
    }

    const completeCalendarEntryMatch = url.pathname.match(/^\/api\/calendar\/entries\/(\d+)\/complete$/);
    if (req.method === "POST" && completeCalendarEntryMatch) {
      const entry = calendarEntries.complete(Number(completeCalendarEntryMatch[1]));
      emitApiStateEvent({
        operation: "completeCalendarEntry",
        entityType: "calendar_entry",
        entityId: entry.id,
        initiativeId: entry.initiativeId,
        taskId: entry.taskId
      });
      if (entry.taskId) {
        emitApiStateEvent({
          operation: "completeTask",
          entityType: "task",
          entityId: entry.taskId,
          taskId: entry.taskId,
          initiativeId: tasks.findById(entry.taskId)?.initiativeId ?? null
        });
      }
      sendJson(res, 200, { entry });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/calendar-sources") {
      sendJson(res, 200, { sources: calendarSources.list() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/google-calendar/status") {
      sendJson(res, 200, { googleCalendar: googleCalendarAuth.status() });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config/google-calendar/auth-url") {
      const body = googleCalendarAuthUrlBody.parse(await readJson(req));
      sendJson(res, 200, { authUrl: googleCalendarAuth.createAuthorizationUrl(body.loginHint ?? null) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config/google-calendar/disconnect") {
      googleCalendarAuth.disconnect();
      sendJson(res, 200, { disconnected: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/google-calendar/calendars") {
      sendJson(res, 200, { calendars: await new GoogleCalendarProvider().listCalendars() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/google-calendar/oauth/callback") {
      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");
      const error = url.searchParams.get("error");
      if (error) {
        sendHtmlRedirect(res, `/config?google=error&detail=${encodeURIComponent(error)}`);
        return;
      }
      if (!code || !state) {
        sendHtmlRedirect(res, "/config?google=error&detail=missing_code_or_state");
        return;
      }
      await googleCalendarAuth.handleCallback({ code, state });
      sendHtmlRedirect(res, "/config?google=connected");
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config/calendar-sources") {
      const body = createCalendarSourceBody.parse(await readJson(req));
      const source = calendarSources.create(body);
      emitApiStateEvent({ operation: "createCalendarSource", entityType: "calendar_source", entityId: source.id });
      sendJson(res, 200, { source });
      return;
    }

    const calendarSourceMatch = url.pathname.match(/^\/api\/config\/calendar-sources\/(\d+)$/);
    if (req.method === "PATCH" && calendarSourceMatch) {
      const body = updateCalendarSourceBody.parse(await readJson(req));
      const source = calendarSources.update({ id: Number(calendarSourceMatch[1]), ...body });
      emitApiStateEvent({ operation: "updateCalendarSource", entityType: "calendar_source", entityId: source.id });
      sendJson(res, 200, { source });
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

    const categoryMatch = url.pathname.match(/^\/api\/categories\/(\d+)$/);
    if (req.method === "PATCH" && categoryMatch) {
      const body = updateCategoryBody.parse(await readJson(req));
      const category = categories.update({ id: Number(categoryMatch[1]), ...body });
      emitApiStateEvent({ operation: "updateCategory", entityType: "category", entityId: category.id, categoryId: category.id });
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

    if (req.method === "GET" && (url.pathname === "/api/initiatives" || url.pathname === "/api/projects")) {
      sendJson(res, 200, {
        initiatives: initiatives.list({
          status: parseOptionalStatus(url.searchParams.get("status")),
          type: parseOptionalInitiativeType(url.searchParams.get("type"))
        })
      });
      return;
    }

    if (req.method === "POST" && (url.pathname === "/api/initiatives" || url.pathname === "/api/projects")) {
      const body = createInitiativeBody.parse(await readJson(req));
      const initiative = initiatives.create(body);
      emitApiStateEvent({ operation: "createInitiative", entityType: "initiative", entityId: initiative.id, initiativeId: initiative.id, categoryId: initiative.categoryId });
      sendJson(res, 200, { initiative });
      return;
    }

    if (req.method === "PATCH" && (url.pathname === "/api/initiatives/order" || url.pathname === "/api/projects/order")) {
      const body = reorderInitiativesBody.parse(await readJson(req));
      const nextInitiatives = initiatives.reorderWithinCategory(body.categoryId, body.initiativeIds);
      emitApiStateEvent({ operation: "reorderInitiatives", entityType: "initiative", categoryId: body.categoryId });
      sendJson(res, 200, { initiatives: nextInitiatives });
      return;
    }

    const initiativeMatch = url.pathname.match(/^\/api\/(?:initiatives|projects)\/(\d+)$/);
    if (req.method === "GET" && initiativeMatch) {
      const initiative = initiatives.findById(Number(initiativeMatch[1]));
      if (!initiative) {
        sendJson(res, 404, { error: "Initiative not found" });
        return;
      }

      sendJson(res, 200, {
        initiative,
        tasks: tasks.list({ initiativeId: initiative.id })
      });
      return;
    }

    if (req.method === "PATCH" && initiativeMatch) {
      const body = updateInitiativeBody.parse(await readJson(req));
      const initiative = initiatives.update({ id: Number(initiativeMatch[1]), ...body });
      emitApiStateEvent({ operation: "updateInitiative", entityType: "initiative", entityId: initiative.id, initiativeId: initiative.id, categoryId: initiative.categoryId });
      sendJson(res, 200, { initiative });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/tasks") {
      const status = url.searchParams.get("status") as TaskStatus | null;
      sendJson(res, 200, { tasks: tasks.list({ status: status ?? undefined }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/tasks") {
      const body = createTaskBody.parse(await readJson(req));
      const task = tasks.create(body);
      emitApiStateEvent({ operation: "createTask", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { task });
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/tasks/order") {
      const body = reorderTasksBody.parse(await readJson(req));
      const nextTasks = tasks.reorderWithinInitiative(body.initiativeId, body.taskIds);
      emitApiStateEvent({ operation: "reorderTasks", entityType: "task", initiativeId: body.initiativeId });
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

      const initiative = initiatives.findById(task.initiativeId);
      const category = initiative ? categories.findById(initiative.categoryId) : null;
      sendJson(res, 200, { task, initiative, category });
      return;
    }

    if (req.method === "PATCH" && taskMatch) {
      const body = updateTaskBody.parse(await readJson(req));
      const task = tasks.update({ id: Number(taskMatch[1]), ...body });
      emitApiStateEvent({ operation: "updateTask", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { task });
      return;
    }

    const completeTaskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/complete$/);
    if (req.method === "POST" && completeTaskMatch) {
      const task = tasks.complete(Number(completeTaskMatch[1]));
      emitApiStateEvent({ operation: "completeTask", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
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
      const traceStartedAt = new Date().toISOString();
      const traceId = getRequestTraceId(req);
      recordApiDiagnostic(traceId, traceStartedAt, "api_body_read_started");
      const body = chatMessageBody.parse(await readJson(req));
      recordApiDiagnostic(traceId, traceStartedAt, "api_body_read_finished");
      const prepared = chat.prepareMessageTurn(body, { traceStartedAt, traceId });
      if (!prepared) {
        sendJson(res, 200, {
          reply: "Schreib mir kurz, was du sortieren oder anlegen möchtest.",
          conversationId: body.conversationId ?? null,
          context: body.context ?? { type: "global" },
          messages: [],
          activities: []
        });
        return;
      }
      const agentResult = await chat.runPreparedTurn(prepared);
      const result = chat.completePreparedTurn(prepared, agentResult);
      recordApiDiagnostic(traceId, traceStartedAt, "api_response_send_started", { conversationId: result.conversationId });
      sendJson(res, 200, result);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/chat/message/stream") {
      const traceStartedAt = new Date().toISOString();
      const traceId = getRequestTraceId(req);
      recordApiDiagnostic(traceId, traceStartedAt, "api_body_read_started");
      const body = chatMessageBody.parse(await readJson(req));
      recordApiDiagnostic(traceId, traceStartedAt, "api_body_read_finished");
      const prepared = chat.prepareMessageTurn(body, { traceStartedAt, traceId });
      if (!prepared) {
        sendSse(res, async (send) => {
          send("done", {
            reply: "Schreib mir kurz, was du sortieren oder anlegen möchtest.",
            conversationId: body.conversationId ?? null,
            context: body.context ?? { type: "global" },
            messages: [],
            activities: []
          });
        }, traceId);
        return;
      }

      await sendSse(res, async (send, signal) => {
        recordApiDiagnostic(traceId, traceStartedAt, "api_sse_opened", { conversationId: prepared.conversationId });
        send("conversation", {
          conversationId: prepared.conversationId,
          context: prepared.context
        });
        recordApiDiagnostic(traceId, traceStartedAt, "api_sse_conversation_sent", { conversationId: prepared.conversationId });

        let activityCursor: OpenClawActivityCursor | null = null;
        void chat.prepareOpenClawConversationSession(prepared.conversationId)
          .then((openClawSession) => {
            activityCursor = openClawSession?.sessionId ? createOpenClawActivityCursor(openClawSession.sessionId) : null;
          })
          .catch(() => undefined);

        let lastActivitiesJson = "";
        const publishActivities = (activities = activityCursor ? listOpenClawSessionActivitiesSince(activityCursor) : []) => {
          const nextJson = JSON.stringify(activities);
          if (nextJson === lastActivitiesJson) {
            return activities;
          }
          lastActivitiesJson = nextJson;
          send("activity", { activities });
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_activity_sent", { activityCount: activities.length });
          return activities;
        };
        const activityInterval = setInterval(publishActivities, 1000);

        try {
          const agentResult = await chat.runPreparedTurn(prepared, { signal });
          clearInterval(activityInterval);
          const activities = agentResult.activities.length ? agentResult.activities : publishActivities();
          const result = chat.completePreparedTurn(prepared, { ...agentResult, activities });
          send("activity", { activities: result.activities });
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_final_activity_sent", { activityCount: result.activities.length });
          let sentFirstAnswerDelta = false;
          for (const chunk of chunkText(result.reply, 18)) {
            if (!sentFirstAnswerDelta) {
              sentFirstAnswerDelta = true;
              recordApiDiagnostic(traceId, traceStartedAt, "api_sse_first_answer_delta_sent", { replyChars: result.reply.length });
            }
            send("answer_delta", { delta: chunk });
            await delay(18);
          }
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_answer_deltas_finished", { replyChars: result.reply.length });
          send("done", result);
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_done_sent", { conversationId: result.conversationId });
        } catch (error) {
          clearInterval(activityInterval);
          if (isAbortError(error) || signal.aborted) {
            recordApiDiagnostic(traceId, traceStartedAt, "api_sse_aborted");
            return;
          }
          const detail = error instanceof Error ? error.message : "Unknown agent error";
          const agentResult = { text: `Ich konnte den Agent-Turn nicht sauber abschließen: ${detail}`, activities: [] };
          const result = chat.completePreparedTurn(prepared, agentResult);
          send("activity", { activities: result.activities });
          let sentFirstAnswerDelta = false;
          for (const chunk of chunkText(result.reply, 18)) {
            if (!sentFirstAnswerDelta) {
              sentFirstAnswerDelta = true;
              recordApiDiagnostic(traceId, traceStartedAt, "api_sse_first_answer_delta_sent", { replyChars: result.reply.length, error: true });
            }
            send("answer_delta", { delta: chunk });
            await delay(18);
          }
          send("done", result);
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_error_done_sent", { error: detail });
        }
      }, traceId);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/diagnostics/chat-event") {
      const body = browserDiagnosticBody.parse(await readJson(req));
      recordChatTurnDiagnosticEvent({
        traceId: body.traceId,
        source: "browser",
        event: body.event,
        ts: body.ts,
        msFromTraceStart: body.msFromTraceStart,
        detail: body.detail ?? undefined
      });
      sendJson(res, 204, null);
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

      const openClawSession = await chat.prepareOpenClawConversationSession(conversationId).catch(() => null);
      const latestPromptCreatedAt = latestPromptLogCreatedAt(conversationId);
      const activities = openClawSession?.sessionId
        ? listOpenClawSessionActivities(openClawSession.sessionId).filter((activity) =>
            !latestPromptCreatedAt || !activity.timestamp || activity.timestamp >= latestPromptCreatedAt
          )
        : [];
      sendJson(res, 200, { activities });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/debug/prompts") {
      sendJson(res, 200, { prompts: chat.listPromptLogs() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/debug/prompt-templates") {
      sendJson(res, 200, { templates: listPromptTemplates() });
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
  void warmOpenClawGateway().catch((error: unknown) => {
    console.error(
      `OpenClaw gateway warmup failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  });
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

const calendarDateQuery = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const calendarDateTime = z.string().trim().min(1);
const calendarEntryType = z.enum(["initiative_focus", "task_work", "standalone"]);

const createCalendarEntryBody = z.object({
  type: calendarEntryType,
  title: z.string().trim().min(1),
  startAt: calendarDateTime,
  endAt: calendarDateTime,
  initiativeId: z.number().int().positive().nullable().optional(),
  taskId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional()
});

const updateCalendarEntryBody = z.object({
  type: calendarEntryType.optional(),
  title: z.string().trim().min(1).optional(),
  startAt: calendarDateTime.optional(),
  endAt: calendarDateTime.optional(),
  status: z.enum(["open", "done"]).optional(),
  initiativeId: z.number().int().positive().nullable().optional(),
  taskId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional()
});

const createCalendarSourceBody = z.object({
  provider: z.literal("google").optional(),
  accountLabel: z.string().trim().min(1),
  calendarId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  enabled: z.boolean().optional(),
  readOnly: z.boolean().optional()
});

const updateCalendarSourceBody = z.object({
  accountLabel: z.string().trim().min(1).optional(),
  calendarId: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  enabled: z.boolean().optional(),
  readOnly: z.boolean().optional()
});

const googleCalendarAuthUrlBody = z.object({
  loginHint: z.string().trim().min(1).nullable().optional()
});

const createCategoryBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

const updateCategoryBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

const initiativeDateBody = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").nullable();

const createInitiativeBody = z.object({
  categoryId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable().optional(),
  type: z.enum(["idea", "project", "habit"]).optional(),
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().optional(),
  startDate: initiativeDateBody.optional(),
  endDate: initiativeDateBody.optional()
});

const updateInitiativeBody = z.object({
  categoryId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  type: z.enum(["idea", "project", "habit"]).optional(),
  name: z.string().trim().min(1).optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
  summary: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().optional(),
  startDate: initiativeDateBody.optional(),
  endDate: initiativeDateBody.optional()
});

const reorderCategoriesBody = z.object({
  categoryIds: z.array(z.number().int().positive()).min(1)
});

const reorderInitiativesBody = z.union([
  z.object({
    categoryId: z.number().int().positive(),
    initiativeIds: z.array(z.number().int().positive()).min(1)
  }),
  z
    .object({
      categoryId: z.number().int().positive(),
      projectIds: z.array(z.number().int().positive()).min(1)
    })
    .transform((body) => ({ categoryId: body.categoryId, initiativeIds: body.projectIds }))
]);

const reorderTasksBody = z.union([
  z.object({
    initiativeId: z.number().int().positive(),
    taskIds: z.array(z.number().int().positive()).min(1)
  }),
  z
    .object({
      projectId: z.number().int().positive(),
      taskIds: z.array(z.number().int().positive()).min(1)
    })
    .transform((body) => ({ initiativeId: body.projectId, taskIds: body.taskIds }))
]);

const createTaskBody = z.object({
  initiativeId: z.number().int().positive(),
  title: z.string().trim().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: initiativeDateBody.optional()
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

const prewarmOpenClawBody = z.object({
  context: conversationContextSchema.nullable().optional()
});

const browserDiagnosticBody = z.object({
  traceId: z.string().trim().min(1).max(120),
  event: z.string().trim().min(1).max(120),
  ts: z.string().trim().min(1),
  msFromTraceStart: z.number().finite().nonnegative().optional(),
  detail: z.record(z.unknown()).optional()
});

const createConversationBody = z.object({
  context: conversationContextSchema
});

function parseConversationContextQuery(url: URL) {
  const contextType = z
    .enum([
      "global",
      "categories",
      "ideas",
      "projects",
      "habits",
      "tasks",
      "initiatives",
      "category",
      "idea",
      "project",
      "habit",
      "initiative",
      "task"
    ])
    .parse(url.searchParams.get("contextType"));
  const entityId = parseOptionalPositiveInt(url.searchParams.get("contextEntityId"));

  if (contextType === "global") {
    return { type: "global" as const };
  }

  if (["categories", "ideas", "projects", "habits", "tasks", "initiatives"].includes(contextType)) {
    return { type: contextType } as
      | { type: "categories" }
      | { type: "ideas" }
      | { type: "projects" }
      | { type: "habits" }
      | { type: "tasks" }
      | { type: "initiatives" };
  }

  if (!entityId) {
    throw new Error(`contextEntityId is required for ${contextType} conversations`);
  }

  if (contextType === "category") return { type: "category" as const, categoryId: entityId };
  if (contextType === "idea" || contextType === "project" || contextType === "habit" || contextType === "initiative") {
    return { type: contextType, initiativeId: entityId } as
      | { type: "idea"; initiativeId: number }
      | { type: "project"; initiativeId: number }
      | { type: "habit"; initiativeId: number }
      | { type: "initiative"; initiativeId: number };
  }
  return { type: "task" as const, taskId: entityId };
}

function parseOptionalStatus(status: string | null) {
  if (status === "active" || status === "paused" || status === "completed" || status === "archived") {
    return status;
  }

  return undefined;
}

function parseOptionalInitiativeType(type: string | null): InitiativeType | undefined {
  if (type === "idea" || type === "project" || type === "habit") {
    return type;
  }

  return undefined;
}

function latestPromptLogCreatedAt(conversationId: number): string | null {
  const row = db
    .prepare("select created_at from app_prompt_logs where conversation_id = ? order by created_at desc, id desc limit 1")
    .get(conversationId) as { created_at: string } | undefined;
  return row?.created_at ?? null;
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

function sendHtmlRedirect(res: http.ServerResponse, path: string): void {
  const target = new URL(path, env.dmaxWebBaseUrl).toString();
  res.writeHead(302, {
    location: target,
    "content-type": "text/html; charset=utf-8"
  });
  res.end(`<!doctype html><meta http-equiv="refresh" content="0;url=${escapeHtml(target)}"><a href="${escapeHtml(target)}">Return to d-max</a>`);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function getRequestTraceId(req: http.IncomingMessage): string {
  const header = req.headers["x-dmax-trace-id"];
  if (typeof header === "string" && header.trim()) {
    return header.trim().slice(0, 120);
  }

  return createChatTurnTraceId();
}

function recordApiDiagnostic(
  traceId: string,
  traceStartedAt: string,
  event: string,
  detail?: Record<string, unknown>
): void {
  recordChatTurnDiagnosticEvent({ traceId, traceStartedAt, source: "api", event, detail });
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
  handler: (send: (event: string, payload: unknown) => void, signal: AbortSignal) => Promise<void>,
  traceId?: string
): Promise<void> {
  res.writeHead(200, {
    "content-type": "text/event-stream; charset=utf-8",
    "cache-control": "no-cache, no-transform",
    connection: "keep-alive",
    ...(traceId ? { "x-dmax-trace-id": traceId } : {})
  });

  const abortController = new AbortController();
  const abort = () => abortController.abort();
  res.req.once("aborted", abort);
  res.req.once("close", abort);

  const send = (event: string, payload: unknown) => {
    if (abortController.signal.aborted || res.writableEnded) {
      return;
    }
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(payload)}\n\n`);
  };

  try {
    await handler(send, abortController.signal);
  } finally {
    res.req.off("aborted", abort);
    res.req.off("close", abort);
    if (!res.writableEnded) {
      res.end();
    }
  }
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
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
    "access-control-allow-headers": "content-type,x-dmax-trace-id",
    "access-control-expose-headers": "x-dmax-trace-id"
  });
  res.end(JSON.stringify(body));
}
