import http from "node:http";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { URL } from "node:url";
import { z } from "zod";
import { env } from "../config/env.js";
import { openDatabase } from "../db/connection.js";
import { migrate } from "../db/migrate.js";
import { CategoryRepository } from "../repositories/categories.js";
import { CalendarService } from "../calendar/calendar-service.js";
import { assertCanLinkExistingProjectSpan } from "../calendar/calendar-linking-rules.js";
import { GoogleCalendarAuth } from "../calendar/google-calendar-auth.js";
import { GoogleCalendarProvider } from "../calendar/google-calendar-provider.js";
import { CalendarEventBindingRepository } from "../repositories/calendar-event-bindings.js";
import { CalendarEventVisibilityRepository } from "../repositories/calendar-event-visibility.js";
import { CalendarEntryRepository } from "../repositories/calendar-entries.js";
import { CalendarSourceRepository } from "../repositories/calendar-sources.js";
import { InitiativeRelationRepository } from "../repositories/initiative-relations.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import type { InitiativeStatus, InitiativeType } from "../repositories/initiatives.js";
import { PlanningCanvasRepository } from "../repositories/planning-canvas.js";
import { MediaAssetRepository } from "../repositories/media-assets.js";
import type { MediaAsset } from "../repositories/media-assets.js";
import { MediaLinkRepository } from "../repositories/media-links.js";
import type { MediaAttachment, MediaEntityType, MediaLink } from "../repositories/media-links.js";
import {
  EntityParticipantRepository,
  OrganizationRepository,
  ParticipantRoleTypeRepository,
  PartyAddressRepository,
  PartyContactPointRepository,
  PartyRelationshipRepository,
  PersonRepository,
  RelationshipTypeRepository
} from "../repositories/parties.js";
import { analyzeMedia } from "../media/media-analysis.js";
import { MediaStorage } from "../media/media-storage.js";
import type { TaskStatus } from "../repositories/tasks.js";
import { TaskRepository } from "../repositories/tasks.js";
import { TaskChecklistItemRepository } from "../repositories/task-checklist-items.js";
import { StateEventRepository } from "../repositories/state-events.js";
import type { CreateStateEventInput, StateEvent } from "../repositories/state-events.js";
import { AppChatService } from "../chat/app-chat.js";
import type { AppChatMessageResult } from "../chat/app-chat.js";
import { AppChatRepository } from "../repositories/app-chat.js";
import type { AppChatMessage } from "../repositories/app-chat.js";
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
import { synthesizeSpeech } from "../chat/text-to-speech.js";
import { createLiveKitVoiceSession } from "./livekit.js";
import { sendStaticWebAsset } from "./static-files.js";
import { createChatTurnTraceId, recordChatTurnDiagnosticEvent } from "../diagnostics/chat-turns.js";
import { createToolRunner } from "../mcp/tool-registry.js";
import { startTelegramBot, type TelegramBotController } from "../telegram/bot.js";

const port = env.dmaxApiPort;

migrate(env.databasePath);

const db = openDatabase();
const categories = new CategoryRepository(db);
const calendarEntries = new CalendarEntryRepository(db);
const calendarBindings = new CalendarEventBindingRepository(db);
const calendarEventVisibility = new CalendarEventVisibilityRepository(db);
const calendarSources = new CalendarSourceRepository(db);
const googleCalendarAuth = new GoogleCalendarAuth();
const initiatives = new InitiativeRepository(db);
const initiativeRelations = new InitiativeRelationRepository(db);
const planningCanvas = new PlanningCanvasRepository(db);
const mediaAssets = new MediaAssetRepository(db);
const mediaLinks = new MediaLinkRepository(db);
const mediaStorage = new MediaStorage(env.dmaxMediaStorageDir);
const people = new PersonRepository(db);
const organizations = new OrganizationRepository(db);
const relationshipTypes = new RelationshipTypeRepository(db);
const partyRelationships = new PartyRelationshipRepository(db);
const participantRoleTypes = new ParticipantRoleTypeRepository(db);
const entityParticipants = new EntityParticipantRepository(db);
const partyContactPoints = new PartyContactPointRepository(db);
const partyAddresses = new PartyAddressRepository(db);
const tasks = new TaskRepository(db);
const taskChecklistItems = new TaskChecklistItemRepository(db);
const stateEvents = new StateEventRepository(db);
const chat = new AppChatService(db);
const chatMessages = new AppChatRepository(db);
const dmaxToolRunner = createToolRunner();
let telegramBot: TelegramBotController | null = null;

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

    const internalToolMatch = url.pathname.match(/^\/internal\/openclaw\/tools\/([^/]+)$/);
    if (req.method === "POST" && internalToolMatch) {
      if (!authorizeInternalToolRequest(req)) {
        sendJson(res, env.dmaxInternalToolToken ? 401 : 503, {
          ok: false,
          error: env.dmaxInternalToolToken ? "Unauthorized internal tool request." : "Internal tool endpoint is not configured."
        });
        return;
      }

      const traceStartedAt = new Date().toISOString();
      const rawToolName = decodeURIComponent(internalToolMatch[1] ?? "");
      const toolName = rawToolName.startsWith("d-max__") ? rawToolName.slice("d-max__".length) : rawToolName;
      const tool = dmaxToolRunner.list().find((candidate) => candidate.name === toolName);
      const requestTraceId = getRequestTraceId(req);
      if (!tool) {
        recordApiDiagnostic(requestTraceId, traceStartedAt, "api_internal_tool_unknown", { toolName });
        sendJson(res, 404, { ok: false, error: `Unknown tool: ${toolName}` });
        return;
      }

      const body = internalToolBody.parse(await readJson(req));
      const traceId = body.traceId ?? requestTraceId;
      const startedAt = Date.now();
      recordApiDiagnostic(traceId, traceStartedAt, "api_internal_tool_started", {
        toolName,
        inputKeys: isRecord(body.input) ? Object.keys(body.input) : []
      });

      try {
        const result = await dmaxToolRunner.run(tool.name, body.input ?? {}, { db });
        recordApiDiagnostic(traceId, traceStartedAt, "api_internal_tool_finished", {
          toolName,
          ok: result.ok,
          durationMs: Date.now() - startedAt
        });
        sendJson(res, 200, { ok: true, result });
      } catch (error) {
        recordApiDiagnostic(traceId, traceStartedAt, "api_internal_tool_failed", {
          toolName,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        });
        sendJson(res, 500, { ok: false, error: error instanceof Error ? error.message : "Unknown tool execution error." });
      }
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
      const openTasks = tasks.list().filter((task) => task.status !== "done");

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
      const hiddenSurface = calendarHiddenSurfaceQuery.parse(url.searchParams.get("surface") ?? undefined);
      if (startDate > endDate) {
        sendJson(res, 400, { error: "Calendar start cannot be after end" });
        return;
      }
      sendJson(res, 200, await new CalendarService(db).getView({ startDate, endDate }, { hiddenSurface }));
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/calendar/hidden-events") {
      const surface = calendarEventVisibilitySurface.parse(url.searchParams.get("surface"));
      sendJson(res, 200, { hiddenEvents: calendarEventVisibility.list({ surfaces: [surface, "global"] }) });
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

    if (req.method === "POST" && url.pathname === "/api/calendar/google-events") {
      const body = createGoogleEventBody.parse(await readJson(req));
      if ("localEntityType" in body) {
        const result = await createGoogleEventFromDmax(body);
        emitApiStateEvent({
          operation: "createGoogleCalendarEvent",
          entityType: result.binding.localEntityType === "calendar_entry" ? "calendar_entry" : "initiative",
          entityId: result.binding.localEntityId,
          initiativeId: result.binding.localEntityType === "initiative_project_span" ? result.binding.localEntityId : result.entry?.initiativeId ?? null,
          taskId: result.entry?.taskId ?? null
        });
        sendJson(res, 200, result);
        return;
      }

      const source = requireWritableCalendarSource(body.calendarSourceId);
      const event = await new GoogleCalendarProvider().createEvent(source, {
        title: body.title,
        startAt: body.startAt,
        endAt: body.endAt,
        allDay: body.allDay
      });
      sendJson(res, 200, { event });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/calendar/google-only-events") {
      const body = createGoogleOnlyEventBody.parse(await readJson(req));
      const source = requireWritableCalendarSource(body.calendarSourceId);
      const event = await new GoogleCalendarProvider().createEvent(source, {
        title: body.title,
        startAt: body.startAt,
        endAt: body.endAt,
        allDay: body.allDay
      });
      sendJson(res, 200, { event });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/calendar/hidden-events") {
      const body = createCalendarEventVisibilityBody.parse(await readJson(req));
      const hiddenEvent = calendarEventVisibility.create(body);
      emitApiStateEvent({ operation: "hideCalendarEvent", entityType: "calendar_event_visibility", entityId: hiddenEvent.id });
      sendJson(res, 200, { hiddenEvent });
      return;
    }

    const calendarEventVisibilityMatch = url.pathname.match(/^\/api\/calendar\/hidden-events\/(\d+)$/);
    if (req.method === "DELETE" && calendarEventVisibilityMatch) {
      const hiddenEvent = calendarEventVisibility.delete(Number(calendarEventVisibilityMatch[1]));
      if (!hiddenEvent) {
        sendJson(res, 404, { error: "Hidden calendar event not found" });
        return;
      }
      emitApiStateEvent({ operation: "unhideCalendarEvent", entityType: "calendar_event_visibility", entityId: hiddenEvent.id });
      sendJson(res, 200, { deleted: true, id: hiddenEvent.id });
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/calendar/google-events") {
      const body = updateGoogleOnlyEventBody.parse(await readJson(req));
      const source = requireWritableCalendarSource(body.calendarSourceId);
      const event = await new GoogleCalendarProvider().updateEvent(source, body.externalEventId, {
        title: body.title,
        startAt: body.startAt,
        endAt: body.endAt,
        allDay: body.allDay
      });
      sendJson(res, 200, { event });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/calendar/bindings/from-google") {
      const body = linkGoogleEventBody.parse(await readJson(req));
      const result = await linkGoogleEventToDmax(body);
      GoogleCalendarProvider.clearEventListCache();
      emitApiStateEvent({
        operation: "linkGoogleCalendarEvent",
        entityType: result.binding.localEntityType === "calendar_entry" ? "calendar_entry" : "initiative",
        entityId: result.binding.localEntityId,
        initiativeId: result.binding.localEntityType === "initiative_project_span" ? result.binding.localEntityId : result.entry?.initiativeId ?? null,
        taskId: result.entry?.taskId ?? null
      });
      sendJson(res, 200, result);
      return;
    }

    const calendarBindingMatch = url.pathname.match(/^\/api\/calendar\/bindings\/(\d+)$/);
    if (req.method === "DELETE" && calendarBindingMatch) {
      const body = unlinkCalendarBindingBody.parse(await readJson(req).catch(() => ({})));
      const existing = calendarBindings.findById(Number(calendarBindingMatch[1]));
      if (!existing) {
        sendJson(res, 404, { error: "Calendar event binding not found" });
        return;
      }
      if (body.deleteGoogleEvent) {
        const source = existing.calendarSourceId ? calendarSources.findById(existing.calendarSourceId) : null;
        if (source) {
          await new GoogleCalendarProvider().deleteEvent(source, existing.externalEventId);
        }
      }
      const binding = calendarBindings.unlink(existing.id);
      GoogleCalendarProvider.clearEventListCache();
      emitApiStateEvent({
        operation: "unlinkGoogleCalendarEvent",
        entityType: binding.localEntityType === "calendar_entry" ? "calendar_entry" : "initiative",
        entityId: binding.localEntityId
      });
      sendJson(res, 200, { binding });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/calendar-sources") {
      sendJson(res, 200, { sources: calendarSources.list() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/google-calendar/status") {
      sendJson(res, 200, { googleCalendar: googleCalendarAuth.status(url.searchParams.get("accountLabel")) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/google-calendar/accounts") {
      sendJson(res, 200, { accounts: googleCalendarAuth.listAccountStatuses(calendarSources.list().map((source) => source.accountLabel)) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config/google-calendar/auth-url") {
      const body = googleCalendarAuthUrlBody.parse(await readJson(req));
      sendJson(res, 200, { authUrl: googleCalendarAuth.createAuthorizationUrl(body.loginHint ?? null) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config/google-calendar/disconnect") {
      const body = googleCalendarDisconnectBody.parse(await readJson(req).catch(() => ({})));
      googleCalendarAuth.disconnect(body.accountLabel ?? null);
      GoogleCalendarProvider.clearEventListCache();
      sendJson(res, 200, { disconnected: true });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/google-calendar/calendars") {
      sendJson(res, 200, { calendars: await new GoogleCalendarProvider().listCalendars(url.searchParams.get("accountLabel")) });
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
      const result = await googleCalendarAuth.handleCallback({ code, state });
      GoogleCalendarProvider.clearEventListCache();
      const accountQuery = result.accountLabel ? `&account=${encodeURIComponent(result.accountLabel)}` : "";
      sendHtmlRedirect(res, `/config?google=connected${accountQuery}`);
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/config/calendar-sources") {
      const body = createCalendarSourceBody.parse(await readJson(req));
      const source = calendarSources.create(body);
      GoogleCalendarProvider.clearEventListCache();
      emitApiStateEvent({ operation: "createCalendarSource", entityType: "calendar_source", entityId: source.id });
      sendJson(res, 200, { source });
      return;
    }

    const calendarSourceMatch = url.pathname.match(/^\/api\/config\/calendar-sources\/(\d+)$/);
    if (req.method === "PATCH" && calendarSourceMatch) {
      const body = updateCalendarSourceBody.parse(await readJson(req));
      const source = calendarSources.update({ id: Number(calendarSourceMatch[1]), ...body });
      GoogleCalendarProvider.clearEventListCache();
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

    if (req.method === "GET" && url.pathname === "/api/people") {
      sendJson(res, 200, { people: people.list({ search: url.searchParams.get("search") ?? undefined }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/people") {
      const body = createPersonBody.parse(await readJson(req));
      const person = people.create(body);
      emitApiStateEvent({ operation: "createPerson", entityType: "person", entityId: person.id });
      sendJson(res, 200, { person });
      return;
    }

    const personMatch = url.pathname.match(/^\/api\/people\/(\d+)$/);
    if (req.method === "GET" && personMatch) {
      const person = people.findById(Number(personMatch[1]));
      if (!person) {
        sendJson(res, 404, { error: "Person not found" });
        return;
      }
      sendJson(res, 200, {
        person,
        relationships: partyRelationships.list({ partyId: person.id }),
        participants: entityParticipants.list({ partyId: person.id }),
        contactPoints: partyContactPoints.list({ partyId: person.id }),
        addresses: partyAddresses.list({ partyId: person.id })
      });
      return;
    }

    if (req.method === "PATCH" && personMatch) {
      const body = updatePersonBody.parse(await readJson(req));
      const person = people.update({ id: Number(personMatch[1]), ...body });
      emitApiStateEvent({ operation: "updatePerson", entityType: "person", entityId: person.id });
      sendJson(res, 200, { person });
      return;
    }

    if (req.method === "DELETE" && personMatch) {
      const person = people.delete(Number(personMatch[1]));
      if (!person) {
        sendJson(res, 404, { error: "Person not found" });
        return;
      }
      emitApiStateEvent({ operation: "deletePerson", entityType: "person", entityId: person.id });
      sendJson(res, 200, { deleted: true, id: person.id });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/organizations") {
      sendJson(res, 200, { organizations: organizations.list({ search: url.searchParams.get("search") ?? undefined }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/organizations") {
      const body = createOrganizationBody.parse(await readJson(req));
      const organization = organizations.create(body);
      emitApiStateEvent({ operation: "createOrganization", entityType: "organization", entityId: organization.id });
      sendJson(res, 200, { organization });
      return;
    }

    const organizationMatch = url.pathname.match(/^\/api\/organizations\/(\d+)$/);
    if (req.method === "GET" && organizationMatch) {
      const organization = organizations.findById(Number(organizationMatch[1]));
      if (!organization) {
        sendJson(res, 404, { error: "Organization not found" });
        return;
      }
      sendJson(res, 200, {
        organization,
        relationships: partyRelationships.list({ partyId: organization.id }),
        participants: entityParticipants.list({ partyId: organization.id }),
        contactPoints: partyContactPoints.list({ partyId: organization.id }),
        addresses: partyAddresses.list({ partyId: organization.id })
      });
      return;
    }

    if (req.method === "PATCH" && organizationMatch) {
      const body = updateOrganizationBody.parse(await readJson(req));
      const organization = organizations.update({ id: Number(organizationMatch[1]), ...body });
      emitApiStateEvent({ operation: "updateOrganization", entityType: "organization", entityId: organization.id });
      sendJson(res, 200, { organization });
      return;
    }

    if (req.method === "DELETE" && organizationMatch) {
      const organization = organizations.delete(Number(organizationMatch[1]));
      if (!organization) {
        sendJson(res, 404, { error: "Organization not found" });
        return;
      }
      emitApiStateEvent({ operation: "deleteOrganization", entityType: "organization", entityId: organization.id });
      sendJson(res, 200, { deleted: true, id: organization.id });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/relationship-types") {
      sendJson(res, 200, { relationshipTypes: relationshipTypes.list() });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/config/participant-role-types") {
      sendJson(res, 200, { participantRoleTypes: participantRoleTypes.list({ appliesToEntityType: parseOptionalParticipantEntityType(url.searchParams.get("appliesToEntityType")) }) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/party-relationships") {
      sendJson(res, 200, {
        relationships: partyRelationships.list({
          partyId: parseOptionalPositiveInt(url.searchParams.get("partyId")) ?? undefined,
          relationshipTypeId: parseOptionalPositiveInt(url.searchParams.get("relationshipTypeId")) ?? undefined,
          status: parseOptionalRelationshipStatus(url.searchParams.get("status"))
        })
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/party-relationships") {
      const body = createPartyRelationshipBody.parse(await readJson(req));
      const relationship = partyRelationships.create(body);
      emitApiStateEvent({ operation: "createPartyRelationship", entityType: "party_relationship", entityId: relationship.id });
      sendJson(res, 200, { relationship });
      return;
    }

    const partyRelationshipMatch = url.pathname.match(/^\/api\/party-relationships\/(\d+)$/);
    if (req.method === "DELETE" && partyRelationshipMatch) {
      const relationship = partyRelationships.delete(Number(partyRelationshipMatch[1]));
      if (!relationship) {
        sendJson(res, 404, { error: "Party relationship not found" });
        return;
      }
      emitApiStateEvent({ operation: "deletePartyRelationship", entityType: "party_relationship", entityId: relationship.id });
      sendJson(res, 200, { deleted: true, id: relationship.id });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/entity-participants") {
      sendJson(res, 200, {
        participants: entityParticipants.list({
          partyId: parseOptionalPositiveInt(url.searchParams.get("partyId")) ?? undefined,
          entityType: parseOptionalParticipantEntityType(url.searchParams.get("entityType")),
          entityId: parseOptionalPositiveInt(url.searchParams.get("entityId")) ?? undefined
        })
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/entity-participants") {
      const body = createEntityParticipantBody.parse(await readJson(req));
      const participant = entityParticipants.create(body);
      emitApiStateEvent(stateEventForEntityParticipant("createEntityParticipant", participant));
      sendJson(res, 200, { participant });
      return;
    }

    const entityParticipantMatch = url.pathname.match(/^\/api\/entity-participants\/(\d+)$/);
    if (req.method === "PATCH" && entityParticipantMatch) {
      const body = updateEntityParticipantBody.parse(await readJson(req));
      const participant = entityParticipants.update({ id: Number(entityParticipantMatch[1]), ...body });
      emitApiStateEvent(stateEventForEntityParticipant("updateEntityParticipant", participant));
      sendJson(res, 200, { participant });
      return;
    }

    if (req.method === "DELETE" && entityParticipantMatch) {
      const participant = entityParticipants.delete(Number(entityParticipantMatch[1]));
      if (!participant) {
        sendJson(res, 404, { error: "Entity participant not found" });
        return;
      }
      emitApiStateEvent(stateEventForEntityParticipant("deleteEntityParticipant", participant));
      sendJson(res, 200, { deleted: true, id: participant.id });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/party-contact-points") {
      const partyId = parseOptionalPositiveInt(url.searchParams.get("partyId"));
      if (!partyId) {
        sendJson(res, 400, { error: "partyId is required" });
        return;
      }
      sendJson(res, 200, { contactPoints: partyContactPoints.list({ partyId, type: parseOptionalContactPointType(url.searchParams.get("type")) }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/party-contact-points") {
      const body = createPartyContactPointBody.parse(await readJson(req));
      const contactPoint = partyContactPoints.create(body);
      emitApiStateEvent({ operation: "createPartyContactPoint", entityType: "party_contact_point", entityId: contactPoint.id });
      sendJson(res, 200, { contactPoint });
      return;
    }

    const partyContactPointMatch = url.pathname.match(/^\/api\/party-contact-points\/(\d+)$/);
    if (req.method === "PATCH" && partyContactPointMatch) {
      const body = updatePartyContactPointBody.parse(await readJson(req));
      const contactPoint = partyContactPoints.update({ id: Number(partyContactPointMatch[1]), ...body });
      emitApiStateEvent({ operation: "updatePartyContactPoint", entityType: "party_contact_point", entityId: contactPoint.id });
      sendJson(res, 200, { contactPoint });
      return;
    }

    if (req.method === "DELETE" && partyContactPointMatch) {
      const contactPoint = partyContactPoints.delete(Number(partyContactPointMatch[1]));
      if (!contactPoint) {
        sendJson(res, 404, { error: "Party contact point not found" });
        return;
      }
      emitApiStateEvent({ operation: "deletePartyContactPoint", entityType: "party_contact_point", entityId: contactPoint.id });
      sendJson(res, 200, { deleted: true, id: contactPoint.id });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/party-addresses") {
      const partyId = parseOptionalPositiveInt(url.searchParams.get("partyId"));
      if (!partyId) {
        sendJson(res, 400, { error: "partyId is required" });
        return;
      }
      sendJson(res, 200, { addresses: partyAddresses.list({ partyId }) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/party-addresses") {
      const body = createPartyAddressBody.parse(await readJson(req));
      const address = partyAddresses.create(body);
      emitApiStateEvent({ operation: "createPartyAddress", entityType: "party_address", entityId: address.id });
      sendJson(res, 200, { address });
      return;
    }

    const partyAddressMatch = url.pathname.match(/^\/api\/party-addresses\/(\d+)$/);
    if (req.method === "PATCH" && partyAddressMatch) {
      const body = updatePartyAddressBody.parse(await readJson(req));
      const address = partyAddresses.update({ id: Number(partyAddressMatch[1]), ...body });
      emitApiStateEvent({ operation: "updatePartyAddress", entityType: "party_address", entityId: address.id });
      sendJson(res, 200, { address });
      return;
    }

    if (req.method === "DELETE" && partyAddressMatch) {
      const address = partyAddresses.delete(Number(partyAddressMatch[1]));
      if (!address) {
        sendJson(res, 404, { error: "Party address not found" });
        return;
      }
      emitApiStateEvent({ operation: "deletePartyAddress", entityType: "party_address", entityId: address.id });
      sendJson(res, 200, { deleted: true, id: address.id });
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

    if (req.method === "GET" && url.pathname === "/api/initiative-relations") {
      sendJson(res, 200, {
        relations: initiativeRelations.list({
          initiativeId: parseOptionalPositiveInt(url.searchParams.get("initiativeId")) ?? undefined,
          predecessorInitiativeId: parseOptionalPositiveInt(url.searchParams.get("predecessorInitiativeId")) ?? undefined,
          successorInitiativeId: parseOptionalPositiveInt(url.searchParams.get("successorInitiativeId")) ?? undefined,
          relationType: parseOptionalInitiativeRelationType(url.searchParams.get("relationType"))
        })
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/initiative-relations") {
      const body = createInitiativeRelationBody.parse(await readJson(req));
      const relation = initiativeRelations.create(body);
      emitApiStateEvent({
        operation: "createInitiativeRelation",
        entityType: "initiative_relation",
        entityId: relation.id,
        initiativeId: relation.successorInitiativeId
      });
      sendJson(res, 200, { relation });
      return;
    }

    const initiativeRelationMatch = url.pathname.match(/^\/api\/initiative-relations\/(\d+)$/);
    if (req.method === "DELETE" && initiativeRelationMatch) {
      const relation = initiativeRelations.delete(Number(initiativeRelationMatch[1]));
      if (!relation) {
        sendJson(res, 404, { error: "Initiative relation not found" });
        return;
      }

      emitApiStateEvent({
        operation: "deleteInitiativeRelation",
        entityType: "initiative_relation",
        entityId: relation.id,
        initiativeId: relation.successorInitiativeId
      });
      sendJson(res, 200, { deleted: true, id: relation.id });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/initiative-graph") {
      sendJson(res, 200, {
        graph: initiativeRelations.getInitiativeGraph({
          initiativeId: parseOptionalPositiveInt(url.searchParams.get("initiativeId")) ?? undefined,
          maxDepth: parseOptionalGraphDepth(url.searchParams.get("maxDepth"))
        })
      });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/planning-canvas") {
      sendJson(res, 200, {
        view: planningCanvas.getView({
          canvasId: parseOptionalPositiveInt(url.searchParams.get("canvasId")) ?? undefined,
          filters: parsePlanningCanvasFilters(url)
        })
      });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/planning-canvas/nodes") {
      const body = createPlanningCanvasNodeBody.parse(await readJson(req));
      const node = planningCanvas.createNode(body);
      emitApiStateEvent({
        operation: "createPlanningCanvasNode",
        entityType: "planning_canvas_node",
        entityId: node.id,
        initiativeId: node.initiativeId
      });
      sendJson(res, 200, { node });
      return;
    }

    const planningCanvasNodeMatch = url.pathname.match(/^\/api\/planning-canvas\/nodes\/(\d+)$/);
    if (req.method === "PATCH" && planningCanvasNodeMatch) {
      const body = updatePlanningCanvasNodeBody.parse(await readJson(req));
      const node = planningCanvas.updateNode({ id: Number(planningCanvasNodeMatch[1]), ...body });
      emitApiStateEvent({
        operation: "updatePlanningCanvasNode",
        entityType: "planning_canvas_node",
        entityId: node.id,
        initiativeId: node.initiativeId
      });
      sendJson(res, 200, { node });
      return;
    }

    if (req.method === "DELETE" && planningCanvasNodeMatch) {
      const node = planningCanvas.deleteNode(Number(planningCanvasNodeMatch[1]));
      if (!node) {
        sendJson(res, 404, { error: "Planning canvas node not found" });
        return;
      }
      emitApiStateEvent({
        operation: "deletePlanningCanvasNode",
        entityType: "planning_canvas_node",
        entityId: node.id,
        initiativeId: node.initiativeId
      });
      sendJson(res, 200, { deleted: true, id: node.id });
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
        predecessors: initiativeRelations.getInitiativePredecessors(initiative.id),
        successors: initiativeRelations.getInitiativeSuccessors(initiative.id),
        tasks: tasks.list({ initiativeId: initiative.id }),
        participants: entityParticipants.list({ entityType: "initiative", entityId: initiative.id }),
        mediaAttachments: mediaLinks.listForEntity("initiative", initiative.id).map(mediaAttachmentForApi),
        projectCalendarBinding: initiative.type === "project" ? projectCalendarBindingForApi(initiative.id) : null
      });
      return;
    }

    if (req.method === "PATCH" && initiativeMatch) {
      const body = updateInitiativeBody.parse(await readJson(req));
      const initiative = initiatives.update({ id: Number(initiativeMatch[1]), ...body });
      if (initiative.type === "project") {
        await new CalendarService(db).syncLinkedLocalEntity({
          localEntityType: "initiative_project_span",
          localEntityId: initiative.id
        });
      }
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
      sendJson(res, 200, {
        task,
        checklistItems: taskChecklistItems.listByTask(task.id),
        initiative,
        category,
        participants: entityParticipants.list({ entityType: "task", entityId: task.id }),
        mediaAttachments: mediaLinks.listForEntity("task", task.id).map(mediaAttachmentForApi)
      });
      return;
    }

    if (req.method === "PATCH" && taskMatch) {
      const body = updateTaskBody.parse(await readJson(req));
      const task = tasks.update({ id: Number(taskMatch[1]), ...body });
      emitApiStateEvent({ operation: "updateTask", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { task });
      return;
    }

    if (req.method === "DELETE" && taskMatch) {
      const existing = tasks.findById(Number(taskMatch[1]));
      if (!existing) {
        sendJson(res, 404, { error: "Task not found" });
        return;
      }
      tasks.delete(existing.id);
      emitApiStateEvent({ operation: "deleteTask", entityType: "task", entityId: existing.id, taskId: existing.id, initiativeId: existing.initiativeId });
      sendJson(res, 200, { deleted: true, id: existing.id });
      return;
    }

    const completeTaskMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/complete$/);
    if (req.method === "POST" && completeTaskMatch) {
      const task = tasks.complete(Number(completeTaskMatch[1]));
      emitApiStateEvent({ operation: "completeTask", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { task });
      return;
    }

    const checklistItemCollectionMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/checklist-items$/);
    if (req.method === "POST" && checklistItemCollectionMatch) {
      const taskId = Number(checklistItemCollectionMatch[1]);
      const task = tasks.findById(taskId);
      if (!task) {
        sendJson(res, 404, { error: "Task not found" });
        return;
      }

      const body = createTaskChecklistItemBody.parse(await readJson(req));
      const item = taskChecklistItems.create({ taskId, ...body });
      emitApiStateEvent({ operation: "createTaskChecklistItem", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { item });
      return;
    }

    const checklistItemOrderMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/checklist-items\/order$/);
    if (req.method === "PATCH" && (checklistItemOrderMatch || checklistItemCollectionMatch)) {
      const taskId = Number((checklistItemOrderMatch ?? checklistItemCollectionMatch)![1]);
      const task = tasks.findById(taskId);
      if (!task) {
        sendJson(res, 404, { error: "Task not found" });
        return;
      }

      const body = reorderTaskChecklistItemsBody.parse(await readJson(req));
      const items = taskChecklistItems.reorderWithinTask(taskId, body.itemIds);
      emitApiStateEvent({ operation: "reorderTaskChecklistItems", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { items });
      return;
    }

    const checklistItemMatch = url.pathname.match(/^\/api\/tasks\/(\d+)\/checklist-items\/(\d+)$/);
    if (req.method === "PATCH" && checklistItemMatch) {
      const taskId = Number(checklistItemMatch[1]);
      const itemId = Number(checklistItemMatch[2]);
      const task = tasks.findById(taskId);
      const existingItem = taskChecklistItems.findById(itemId);
      if (!task || !existingItem || existingItem.taskId !== taskId) {
        sendJson(res, 404, { error: "Checklist item not found" });
        return;
      }

      const body = updateTaskChecklistItemBody.parse(await readJson(req));
      const item = taskChecklistItems.update({ id: itemId, ...body });
      emitApiStateEvent({ operation: "updateTaskChecklistItem", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { item });
      return;
    }

    if (req.method === "DELETE" && checklistItemMatch) {
      const taskId = Number(checklistItemMatch[1]);
      const itemId = Number(checklistItemMatch[2]);
      const task = tasks.findById(taskId);
      const existingItem = taskChecklistItems.findById(itemId);
      if (!task || !existingItem || existingItem.taskId !== taskId) {
        sendJson(res, 404, { error: "Checklist item not found" });
        return;
      }

      taskChecklistItems.delete(itemId);
      emitApiStateEvent({ operation: "deleteTaskChecklistItem", entityType: "task", entityId: task.id, taskId: task.id, initiativeId: task.initiativeId });
      sendJson(res, 200, { deleted: true, id: itemId });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/media/attachments") {
      const target = parseMediaEntityTarget(url);
      ensureMediaEntityExists(target.entityType, target.entityId);
      const file = await readBuffer(req, env.dmaxMediaMaxUploadBytes);
      const stored = mediaStorage.store({
        buffer: file,
        mimeType: req.headers["content-type"] ?? "application/octet-stream",
        originalName: typeof req.headers["x-file-name"] === "string" ? decodeHeaderValue(req.headers["x-file-name"]) : null
      });
      const existingAsset = mediaAssets.findByHash(stored.sha256, stored.byteSize);
      const analysis = existingAsset
        ? null
        : await analyzeMedia({
            buffer: file,
            kind: stored.kind,
            mimeType: stored.mimeType,
            originalName: stored.originalName
          });
      const asset = existingAsset ?? mediaAssets.create({ ...stored, ...analysis });
      const attachment = mediaLinks.create({
        assetId: asset.id,
        entityType: target.entityType,
        entityId: target.entityId,
        caption: target.caption
      });
      emitApiStateEvent(stateEventForMediaLink("createMediaAttachment", attachment));
      sendJson(res, 200, { attachment: mediaAttachmentForApi(attachment) });
      return;
    }

    const mediaAssetFileMatch = url.pathname.match(/^\/api\/media\/assets\/(\d+)\/file$/);
    if (req.method === "GET" && mediaAssetFileMatch) {
      const asset = mediaAssets.findById(Number(mediaAssetFileMatch[1]));
      if (!asset) {
        sendJson(res, 404, { error: "Media asset not found" });
        return;
      }

      sendMediaFile(res, asset.mimeType, mediaStorage.absolutePath(asset.storagePath));
      return;
    }

    const mediaAssetAnalyzeMatch = url.pathname.match(/^\/api\/media\/assets\/(\d+)\/analyze$/);
    if (req.method === "POST" && mediaAssetAnalyzeMatch) {
      const asset = mediaAssets.findById(Number(mediaAssetAnalyzeMatch[1]));
      if (!asset) {
        sendJson(res, 404, { error: "Media asset not found" });
        return;
      }
      const body = reanalyzeMediaAssetBody.parse(await readJson(req));
      const file = readFileSync(mediaStorage.absolutePath(asset.storagePath));
      const analysis = await analyzeMedia({
        buffer: file,
        kind: asset.kind,
        mimeType: asset.mimeType,
        originalName: asset.originalName,
        prompt: body.prompt
      });
      const updatedAsset = mediaAssets.updateDerivedText({ id: asset.id, ...analysis });
      emitApiStateEvent({ operation: "reanalyzeMediaAsset", entityType: "media_asset", entityId: updatedAsset.id });
      sendJson(res, 200, { asset: mediaAssetForApi(updatedAsset) });
      return;
    }

    const mediaAssetMatch = url.pathname.match(/^\/api\/media\/assets\/(\d+)$/);
    if (req.method === "GET" && mediaAssetMatch) {
      const asset = mediaAssets.findById(Number(mediaAssetMatch[1]));
      if (!asset) {
        sendJson(res, 404, { error: "Media asset not found" });
        return;
      }
      sendJson(res, 200, { asset: mediaAssetForApi(asset) });
      return;
    }

    if (req.method === "PATCH" && mediaAssetMatch) {
      const asset = mediaAssets.findById(Number(mediaAssetMatch[1]));
      if (!asset) {
        sendJson(res, 404, { error: "Media asset not found" });
        return;
      }
      const body = updateMediaAssetBody.parse(await readJson(req));
      const updatedAsset = mediaAssets.updateDerivedText({ id: asset.id, ...body });
      emitApiStateEvent({ operation: "updateMediaAssetAnalysis", entityType: "media_asset", entityId: updatedAsset.id });
      sendJson(res, 200, { asset: mediaAssetForApi(updatedAsset) });
      return;
    }

    if (req.method === "GET" && url.pathname === "/api/media/links") {
      const target = parseMediaEntityTarget(url);
      ensureMediaEntityExists(target.entityType, target.entityId);
      sendJson(res, 200, { attachments: mediaLinks.listForEntity(target.entityType, target.entityId).map(mediaAttachmentForApi) });
      return;
    }

    if (req.method === "POST" && url.pathname === "/api/media/links") {
      const body = createMediaLinkBody.parse(await readJson(req));
      ensureMediaEntityExists(body.entityType, body.entityId);
      if (!mediaAssets.findById(body.assetId)) {
        sendJson(res, 404, { error: "Media asset not found" });
        return;
      }
      const attachment = mediaLinks.create(body);
      emitApiStateEvent(stateEventForMediaLink("createMediaLink", attachment));
      sendJson(res, 200, { attachment: mediaAttachmentForApi(attachment) });
      return;
    }

    const mediaLinkMatch = url.pathname.match(/^\/api\/media\/links\/(\d+)$/);
    if (req.method === "PATCH" && mediaLinkMatch) {
      const body = updateMediaLinkBody.parse(await readJson(req));
      const attachment = mediaLinks.update({ id: Number(mediaLinkMatch[1]), ...body });
      emitApiStateEvent(stateEventForMediaLink("updateMediaLink", attachment));
      sendJson(res, 200, { attachment: mediaAttachmentForApi(attachment) });
      return;
    }

    if (req.method === "DELETE" && mediaLinkMatch) {
      const existing = mediaLinks.findById(Number(mediaLinkMatch[1]));
      if (!existing) {
        sendJson(res, 404, { error: "Media link not found" });
        return;
      }
      mediaLinks.delete(existing.id);
      emitApiStateEvent(stateEventForMediaLink("deleteMediaLink", existing));
      sendJson(res, 200, { deleted: true, id: existing.id });
      return;
    }

    if (req.method === "PATCH" && url.pathname === "/api/media/links/order") {
      const body = reorderMediaLinksBody.parse(await readJson(req));
      ensureMediaEntityExists(body.entityType, body.entityId);
      const attachments = mediaLinks.reorderWithinEntity(body.entityType, body.entityId, body.linkIds);
      emitApiStateEvent({
        operation: "reorderMediaLinks",
        entityType: "media_link",
        ...stateScopeForMediaEntity(body.entityType, body.entityId)
      });
      sendJson(res, 200, { attachments: attachments.map(mediaAttachmentForApi) });
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
      sendJson(res, 200, appChatResultForApi(result));
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
          const apiResult = appChatResultForApi(result);
          send("activity", { activities: result.activities });
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_final_activity_sent", { activityCount: result.activities.length });
          let sentFirstAnswerDelta = false;
          for (const chunk of chunkText(apiResult.reply, 18)) {
            if (!sentFirstAnswerDelta) {
              sentFirstAnswerDelta = true;
              recordApiDiagnostic(traceId, traceStartedAt, "api_sse_first_answer_delta_sent", { replyChars: apiResult.reply.length });
            }
            send("answer_delta", { delta: chunk });
            await delay(18);
          }
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_answer_deltas_finished", { replyChars: apiResult.reply.length });
          send("done", apiResult);
          recordApiDiagnostic(traceId, traceStartedAt, "api_sse_done_sent", { conversationId: apiResult.conversationId });
        } catch (error) {
          clearInterval(activityInterval);
          if (isAbortError(error) || signal.aborted) {
            recordApiDiagnostic(traceId, traceStartedAt, "api_sse_aborted");
            return;
          }
          const detail = error instanceof Error ? error.message : "Unknown agent error";
          const agentResult = { text: `Ich konnte den Agent-Turn nicht sauber abschließen: ${detail}`, activities: [] };
          const result = chat.completePreparedTurn(prepared, agentResult);
          const apiResult = appChatResultForApi(result);
          send("activity", { activities: result.activities });
          let sentFirstAnswerDelta = false;
          for (const chunk of chunkText(apiResult.reply, 18)) {
            if (!sentFirstAnswerDelta) {
              sentFirstAnswerDelta = true;
              recordApiDiagnostic(traceId, traceStartedAt, "api_sse_first_answer_delta_sent", { replyChars: apiResult.reply.length, error: true });
            }
            send("answer_delta", { delta: chunk });
            await delay(18);
          }
          send("done", apiResult);
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
      sendJson(res, 200, { messages: chat.listMessages(conversationId ? { conversationId } : undefined).map(chatMessageForApi) });
      return;
    }

    const chatMessageAudioMatch = url.pathname.match(/^\/api\/chat\/messages\/(\d+)\/audio$/);
    if (req.method === "POST" && chatMessageAudioMatch) {
      const messageId = Number(chatMessageAudioMatch[1]);
      const message = chatMessages.findById(messageId);
      if (!message || message.role !== "assistant") {
        sendJson(res, 404, { error: "Assistant chat message not found" });
        return;
      }

      const existingAudio = assistantAudioAttachment(message.id);
      if (existingAudio) {
        const updated = message.audioGenerationStatus === "ready"
          ? message
          : chatMessages.updateAudio({
              id: message.id,
              audioGenerationStatus: "ready",
              audioError: null,
              audioGeneratedAt: message.audioGeneratedAt ?? new Date().toISOString()
            });
        sendJson(res, 200, { message: chatMessageForApi(updated) });
        return;
      }

      chatMessages.updateAudio({
        id: message.id,
        audioGenerationStatus: "pending",
        audioProvider: "openai",
        audioError: null
      });

      try {
        const speech = await synthesizeSpeech({ text: message.content });
        const stored = mediaStorage.store({
          buffer: speech.audio,
          mimeType: speech.mimeType,
          originalName: `dmax-chat-message-${message.id}.mp3`
        });
        const asset = mediaAssets.findByHash(stored.sha256, stored.byteSize)
          ?? mediaAssets.create({
            ...stored,
            summary: `Sprachantwort zu Chat-Nachricht ${message.id}`,
            textExcerpt: null,
            transcript: null
          });
        const attachment = mediaLinks.create({
          assetId: asset.id,
          entityType: "app_chat_message",
          entityId: message.id,
          role: "assistant_audio"
        });
        emitApiStateEvent(stateEventForMediaLink("createChatMessageAudio", attachment));
        const updated = chatMessages.updateAudio({
          id: message.id,
          audioGenerationStatus: "ready",
          audioProvider: `${speech.provider}:${speech.model}`,
          audioError: null,
          audioGeneratedAt: new Date().toISOString()
        });
        sendJson(res, 200, { message: chatMessageForApi(updated) });
      } catch (error) {
        const detail = error instanceof Error ? error.message : "Unknown text-to-speech error";
        const updated = chatMessages.updateAudio({
          id: message.id,
          audioGenerationStatus: "failed",
          audioProvider: "openai",
          audioError: detail
        });
        sendJson(res, 500, { error: detail, message: chatMessageForApi(updated) });
      }
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

    if (sendStaticWebAsset(req, res, url.pathname, { webDistDir: env.dmaxWebDistDir })) {
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
  telegramBot = startTelegramBot({
    token: env.telegramBotToken,
    allowedUserIds: env.telegramAllowedUserIds,
    chat
  });
  void warmOpenClawGateway().catch((error: unknown) => {
    console.error(
      `OpenClaw gateway warmup failed: ${error instanceof Error ? error.message : "unknown error"}`
    );
  });
});

process.on("SIGINT", () => shutdown());
process.on("SIGTERM", () => shutdown());

function shutdown(): void {
  telegramBot?.stop();
  server.close(() => {
    db.close();
    process.exit(0);
  });
}

const updateTaskBody = z.object({
  title: z.string().trim().min(1).optional(),
  status: z.enum(["open", "done"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: z.string().trim().min(1).nullable().optional()
});

const calendarDateQuery = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
const calendarDateTime = z.string().trim().min(1);
const calendarEntryType = z.enum(["initiative_focus", "task_work", "standalone"]);
const calendarEventVisibilitySurface = z.enum(["planning_canvas", "calendar", "global"]);
const calendarHiddenSurfaceQuery = calendarEventVisibilitySurface.nullish().transform((value) => value ?? null);
const calendarEventVisibilityHiddenScope = z.enum(["event", "recurring_instance", "recurring_series"]);

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

const calendarBindingLocalEntityType = z.enum(["calendar_entry", "initiative_project_span"]);

const createGoogleEventFromDmaxBody = z.object({
  localEntityType: calendarBindingLocalEntityType,
  localEntityId: z.number().int().positive(),
  calendarSourceId: z.number().int().positive()
});

const createGoogleEventBody = z.union([
  createGoogleEventFromDmaxBody,
  z.object({
    calendarSourceId: z.number().int().positive(),
    title: z.string().trim().min(1),
    startAt: z.string().trim().min(1),
    endAt: z.string().trim().min(1),
    allDay: z.boolean()
  })
]);

const updateGoogleOnlyEventBody = z.object({
  calendarSourceId: z.number().int().positive(),
  externalEventId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1),
  allDay: z.boolean()
});

const createGoogleOnlyEventBody = z.object({
  calendarSourceId: z.number().int().positive(),
  title: z.string().trim().min(1),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1),
  allDay: z.boolean()
});

const createCalendarEventVisibilityBody = z.object({
  provider: z.literal("google").optional(),
  surface: calendarEventVisibilitySurface,
  hiddenScope: calendarEventVisibilityHiddenScope,
  calendarSourceId: z.number().int().positive().nullable().optional(),
  externalCalendarId: z.string().trim().min(1),
  externalEventId: z.string().trim().min(1).nullable().optional(),
  recurringEventId: z.string().trim().min(1).nullable().optional(),
  originalStartAt: z.string().trim().min(1).nullable().optional(),
  iCalUID: z.string().trim().min(1).nullable().optional(),
  titleSnapshot: z.string().trim().min(1),
  startAtSnapshot: z.string().trim().min(1).nullable().optional(),
  endAtSnapshot: z.string().trim().min(1).nullable().optional()
});

const linkGoogleEventBody = z.object({
  calendarSourceId: z.number().int().positive(),
  externalCalendarId: z.string().trim().min(1),
  externalEventId: z.string().trim().min(1),
  externalEtag: z.string().nullable().optional(),
  externalUpdatedAt: z.string().nullable().optional(),
  title: z.string().trim().min(1),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1),
  allDay: z.boolean(),
  initialDirection: z.enum(["google_to_dmax", "dmax_to_google"]).optional(),
  target: z.discriminatedUnion("type", [
    z.object({ type: z.literal("existing_project_span"), initiativeId: z.number().int().positive() }),
    z.object({ type: z.literal("new_project"), categoryId: z.number().int().positive(), name: z.string().trim().min(1).optional() }),
    z.object({ type: z.literal("existing_project_entry"), initiativeId: z.number().int().positive() }),
    z.object({ type: z.literal("existing_task_entry"), taskId: z.number().int().positive() }),
    z.object({ type: z.literal("new_task_entry"), initiativeId: z.number().int().positive(), title: z.string().trim().min(1).optional() })
  ])
});

const unlinkCalendarBindingBody = z.object({
  deleteGoogleEvent: z.boolean().optional()
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

const googleCalendarDisconnectBody = z.object({
  accountLabel: z.string().trim().min(1).nullable().optional()
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

const partySalutationBody = z.enum(["mr", "mrs", "unknown"]);
const participantEntityTypeBody = z.enum(["initiative", "task", "calendar_entry"]);
const contactPointTypeBody = z.enum(["email", "phone", "whatsapp", "signal", "telegram", "linkedin", "website", "other"]);
const relationshipStatusBody = z.enum(["active", "inactive"]);
const partyDateBody = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").nullable();

const createPersonBody = z.object({
  displayName: z.string().trim().min(1).optional(),
  firstName: z.string().trim().min(1).nullable().optional(),
  lastName: z.string().trim().min(1).nullable().optional(),
  salutation: partySalutationBody.optional(),
  academicTitle: z.string().trim().min(1).nullable().optional(),
  nameSuffix: z.string().trim().min(1).nullable().optional()
});

const updatePersonBody = createPersonBody.partial();

const createOrganizationBody = z.object({
  name: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  legalName: z.string().trim().min(1).nullable().optional(),
  organizationType: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().nullable().optional()
});

const updateOrganizationBody = createOrganizationBody.partial();

const createPartyRelationshipBody = z.object({
  fromPartyId: z.number().int().positive(),
  toPartyId: z.number().int().positive(),
  relationshipTypeId: z.number().int().positive(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  startedOn: partyDateBody.optional(),
  endedOn: partyDateBody.optional(),
  status: relationshipStatusBody.optional()
});

const createEntityParticipantBody = z.object({
  partyId: z.number().int().positive(),
  entityType: participantEntityTypeBody,
  entityId: z.number().int().positive(),
  roleTypeId: z.number().int().positive().nullable().optional(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional()
});

const updateEntityParticipantBody = z.object({
  roleTypeId: z.number().int().positive().nullable().optional(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional()
});

const createPartyContactPointBody = z.object({
  partyId: z.number().int().positive(),
  type: contactPointTypeBody,
  label: z.string().trim().min(1).nullable().optional(),
  value: z.string().trim().min(1),
  normalizedValue: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional(),
  isPreferred: z.boolean().optional(),
  canSend: z.boolean().optional(),
  canReceive: z.boolean().optional(),
  provider: z.string().trim().min(1).nullable().optional()
});

const updatePartyContactPointBody = createPartyContactPointBody.omit({ partyId: true }).partial();

const createPartyAddressBody = z.object({
  partyId: z.number().int().positive(),
  label: z.string().trim().min(1).nullable().optional(),
  line1: z.string().trim().min(1),
  line2: z.string().trim().min(1).nullable().optional(),
  postalCode: z.string().trim().min(1).nullable().optional(),
  city: z.string().trim().min(1).nullable().optional(),
  region: z.string().trim().min(1).nullable().optional(),
  country: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional()
});

const updatePartyAddressBody = createPartyAddressBody.omit({ partyId: true }).partial();

const initiativeDateBody = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").nullable();
const projectPhaseBody = z.enum(["planning", "doing"]);

const createInitiativeBody = z.object({
  categoryId: z.number().int().positive(),
  parentId: z.number().int().positive().nullable().optional(),
  type: z.enum(["idea", "project", "habit"]).optional(),
  projectPhase: projectPhaseBody.optional(),
  name: z.string().trim().min(1),
  summary: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().optional(),
  startDate: initiativeDateBody.optional(),
  endDate: initiativeDateBody.optional(),
  isLocked: z.boolean().optional()
});

const updateInitiativeBody = z.object({
  categoryId: z.number().int().positive().optional(),
  parentId: z.number().int().positive().nullable().optional(),
  type: z.enum(["idea", "project", "habit"]).optional(),
  projectPhase: projectPhaseBody.optional(),
  name: z.string().trim().min(1).optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
  summary: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().optional(),
  startDate: initiativeDateBody.optional(),
  endDate: initiativeDateBody.optional(),
  isLocked: z.boolean().optional()
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

const createInitiativeRelationBody = z.object({
  predecessorInitiativeId: z.number().int().positive(),
  successorInitiativeId: z.number().int().positive(),
  relationType: z.literal("precedes").optional()
});

const planningCanvasCoordinate = z.number().finite().min(0).max(100000);

const createPlanningCanvasNodeBody = z.object({
  canvasId: z.number().int().positive().optional(),
  initiativeId: z.number().int().positive(),
  x: planningCanvasCoordinate,
  y: planningCanvasCoordinate,
  width: planningCanvasCoordinate.nullable().optional(),
  height: planningCanvasCoordinate.nullable().optional(),
  collapsed: z.boolean().optional()
});

const updatePlanningCanvasNodeBody = z.object({
  x: planningCanvasCoordinate.optional(),
  y: planningCanvasCoordinate.optional(),
  width: planningCanvasCoordinate.nullable().optional(),
  height: planningCanvasCoordinate.nullable().optional(),
  collapsed: z.boolean().optional()
});

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

const createTaskChecklistItemBody = z.object({
  name: z.string().trim().min(1)
});

const updateTaskChecklistItemBody = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.enum(["todo", "done"]).optional()
});

const reorderTaskChecklistItemsBody = z.object({
  itemIds: z.array(z.number().int().positive()).min(1)
});

const mediaEntityTypeBody = z.enum(["category", "initiative", "task", "calendar_entry", "app_chat_message"]);

const createMediaLinkBody = z.object({
  assetId: z.number().int().positive(),
  entityType: mediaEntityTypeBody,
  entityId: z.number().int().positive(),
  caption: z.string().nullable().optional(),
  role: z.string().trim().min(1).nullable().optional()
});

const updateMediaLinkBody = z.object({
  caption: z.string().nullable().optional(),
  role: z.string().trim().min(1).nullable().optional()
});

const updateMediaAssetBody = z.object({
  summary: z.string().nullable().optional(),
  textExcerpt: z.string().nullable().optional(),
  transcript: z.string().nullable().optional()
});

const reanalyzeMediaAssetBody = z.object({
  prompt: z.string().nullable().optional()
});

const reorderMediaLinksBody = z.object({
  entityType: mediaEntityTypeBody,
  entityId: z.number().int().positive(),
  linkIds: z.array(z.number().int().positive()).min(1)
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

const internalToolBody = z.object({
  input: z.unknown().optional(),
  traceId: z.string().trim().min(1).max(160).optional()
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
      "people",
      "organizations",
      "category",
      "idea",
      "project",
      "habit",
      "initiative",
      "task",
      "person",
      "organization"
    ])
    .parse(url.searchParams.get("contextType"));
  const entityId = parseOptionalPositiveInt(url.searchParams.get("contextEntityId"));

  if (contextType === "global") {
    return { type: "global" as const };
  }

  if (["categories", "ideas", "projects", "habits", "tasks", "initiatives", "people", "organizations"].includes(contextType)) {
    return { type: contextType } as
      | { type: "categories" }
      | { type: "ideas" }
      | { type: "projects" }
      | { type: "habits" }
      | { type: "tasks" }
      | { type: "initiatives" }
      | { type: "people" }
      | { type: "organizations" };
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
  if (contextType === "task") return { type: "task" as const, taskId: entityId };
  return { type: contextType, partyId: entityId } as { type: "person"; partyId: number } | { type: "organization"; partyId: number };
}

function parseOptionalStatus(status: string | null): InitiativeStatus | undefined {
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

function parseOptionalInitiativeRelationType(type: string | null): "precedes" | undefined {
  return type === "precedes" ? "precedes" : undefined;
}

function parseOptionalParticipantEntityType(type: string | null): "initiative" | "task" | "calendar_entry" | undefined {
  return type === "initiative" || type === "task" || type === "calendar_entry" ? type : undefined;
}

function parseOptionalContactPointType(type: string | null): "email" | "phone" | "whatsapp" | "signal" | "telegram" | "linkedin" | "website" | "other" | undefined {
  if (
    type === "email" ||
    type === "phone" ||
    type === "whatsapp" ||
    type === "signal" ||
    type === "telegram" ||
    type === "linkedin" ||
    type === "website" ||
    type === "other"
  ) {
    return type;
  }
  return undefined;
}

function parseOptionalRelationshipStatus(status: string | null): "active" | "inactive" | undefined {
  return status === "active" || status === "inactive" ? status : undefined;
}

function parsePlanningCanvasFilters(url: URL) {
  return {
    search: url.searchParams.get("search")?.trim() || undefined,
    categoryId: parseOptionalPositiveInt(url.searchParams.get("categoryId")) ?? undefined,
    type: parseOptionalInitiativeType(url.searchParams.get("type")),
    status: parseOptionalStatus(url.searchParams.get("status")),
    includeArchived: url.searchParams.get("includeArchived") === "true"
  };
}

function parseOptionalGraphDepth(value: string | null): number | undefined {
  const parsed = parseOptionalNonNegativeInt(value);
  return parsed === null ? undefined : Math.min(parsed, 20);
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

async function createGoogleEventFromDmax(input: z.infer<typeof createGoogleEventFromDmaxBody>) {
  const source = requireWritableCalendarSource(input.calendarSourceId);
  const provider = new GoogleCalendarProvider();

  if (calendarBindings.findActiveByLocal({ localEntityType: input.localEntityType, localEntityId: input.localEntityId })) {
    throw new Error("This DMAX time object is already linked to a Google event.");
  }

  if (input.localEntityType === "calendar_entry") {
    const entry = calendarEntries.findById(input.localEntityId);
    if (!entry) {
      throw new Error(`Calendar entry not found: ${input.localEntityId}`);
    }
    const event = await provider.createEvent(source, {
      title: entry.title,
      startAt: entry.startAt,
      endAt: entry.endAt,
      allDay: false,
      description: googleMarkerDescription("calendar_entry", entry.id)
    });
    const binding = calendarBindings.create({
      localEntityType: "calendar_entry",
      localEntityId: entry.id,
      calendarSourceId: source.id,
      externalCalendarId: event.externalCalendarId,
      externalEventId: event.externalEventId,
      externalEtag: event.etag,
      externalUpdatedAt: event.updatedAt,
      lastSyncedAt: new Date().toISOString()
    });
    return { binding, event, entry };
  }

  const initiative = initiatives.findById(input.localEntityId);
  if (!initiative || initiative.type !== "project") {
    throw new Error(`Project initiative not found: ${input.localEntityId}`);
  }
  if (!initiative.startDate || !initiative.endDate) {
    throw new Error("Project span Google events require project startDate and endDate.");
  }
  const event = await provider.createEvent(source, {
    title: initiative.name,
    startAt: initiative.startDate,
    endAt: initiative.endDate,
    allDay: true,
    description: googleMarkerDescription("initiative_project_span", initiative.id)
  });
  const binding = calendarBindings.create({
    localEntityType: "initiative_project_span",
    localEntityId: initiative.id,
    calendarSourceId: source.id,
    externalCalendarId: event.externalCalendarId,
    externalEventId: event.externalEventId,
    externalEtag: event.etag,
    externalUpdatedAt: event.updatedAt,
    lastSyncedAt: new Date().toISOString()
  });
  return { binding, event, initiative };
}

async function linkGoogleEventToDmax(input: z.infer<typeof linkGoogleEventBody>) {
  const source = calendarSources.findById(input.calendarSourceId);
  if (!source) {
    throw new Error(`Calendar source not found: ${input.calendarSourceId}`);
  }
  if (calendarBindings.findActiveByExternal({ externalCalendarId: input.externalCalendarId, externalEventId: input.externalEventId })) {
    throw new Error("This Google event is already linked to DMAX.");
  }

  if (input.target.type === "existing_project_span" || input.target.type === "new_project") {
    if (!isProjectSpanCompatibleGoogleEvent(input)) {
      throw new Error("Only all-day or multi-day Google events can be linked to project spans.");
    }
    const projectStartDate = datePart(input.startAt);
    const projectEndDate = datePart(input.endAt);
    const initialDirection = input.initialDirection ?? "google_to_dmax";
    const provider = new GoogleCalendarProvider();
    let initiative;
    if (input.target.type === "new_project") {
      initiative = initiatives.create({
        categoryId: input.target.categoryId,
        type: "project",
        name: input.target.name ?? input.title,
        startDate: projectStartDate,
        endDate: projectEndDate
      });
    } else {
      const existing = initiatives.findById(input.target.initiativeId);
      const project = assertCanLinkExistingProjectSpan({
        initiative: existing,
        initiativeId: input.target.initiativeId,
        hasActiveBinding: existing ? Boolean(calendarBindings.findActiveByLocal({ localEntityType: "initiative_project_span", localEntityId: existing.id })) : false,
        initialDirection
      });
      initiative = initialDirection === "google_to_dmax"
        ? initiatives.update({ id: project.id, name: input.title, startDate: projectStartDate, endDate: projectEndDate })
        : project;
    }

    let externalEtag = input.externalEtag ?? null;
    let externalUpdatedAt = input.externalUpdatedAt ?? null;
    if (initialDirection === "dmax_to_google") {
      const updatedEvent = await provider.updateEvent(requireWritableCalendarSource(input.calendarSourceId), input.externalEventId, {
        title: initiative.name,
        startAt: initiative.startDate ?? input.startAt,
        endAt: initiative.endDate ?? input.endAt,
        allDay: true
      });
      externalEtag = updatedEvent.etag;
      externalUpdatedAt = updatedEvent.updatedAt;
    }

    const binding = calendarBindings.create({
      localEntityType: "initiative_project_span",
      localEntityId: initiative.id,
      calendarSourceId: source.id,
      externalCalendarId: input.externalCalendarId,
      externalEventId: input.externalEventId,
      externalEtag,
      externalUpdatedAt,
      lastSyncedAt: new Date().toISOString()
    });
    return { binding, initiative };
  }

  if (input.allDay) {
    throw new Error("All-day Google events cannot be linked as calendar entries in this flow.");
  }

  let taskId: number | null = null;
  let initiativeId: number | null = null;
  if (input.target.type === "existing_project_entry") {
    const initiative = initiatives.findById(input.target.initiativeId);
    if (!initiative || initiative.type !== "project") {
      throw new Error(`Project initiative not found: ${input.target.initiativeId}`);
    }
    initiativeId = initiative.id;
  } else if (input.target.type === "existing_task_entry") {
    const task = tasks.findById(input.target.taskId);
    if (!task) {
      throw new Error(`Task not found: ${input.target.taskId}`);
    }
    taskId = task.id;
  } else {
    const initiative = initiatives.findById(input.target.initiativeId);
    if (!initiative || initiative.type !== "project") {
      throw new Error(`Project initiative not found: ${input.target.initiativeId}`);
    }
    const task = tasks.create({ initiativeId: initiative.id, title: input.target.title ?? input.title });
    taskId = task.id;
  }

  const entry = calendarEntries.create({
    type: taskId ? "task_work" : "initiative_focus",
    title: input.title,
    startAt: input.startAt,
    endAt: input.endAt,
    initiativeId,
    taskId
  });
  const binding = calendarBindings.create({
    localEntityType: "calendar_entry",
    localEntityId: entry.id,
    calendarSourceId: source.id,
    externalCalendarId: input.externalCalendarId,
    externalEventId: input.externalEventId,
    externalEtag: input.externalEtag ?? null,
    externalUpdatedAt: input.externalUpdatedAt ?? null,
    lastSyncedAt: new Date().toISOString()
  });
  return { binding, entry };
}

function requireWritableCalendarSource(id: number): NonNullable<ReturnType<CalendarSourceRepository["findById"]>> {
  const source = calendarSources.findById(id);
  if (!source) {
    throw new Error(`Calendar source not found: ${id}`);
  }
  if (source.readOnly) {
    throw new Error("Calendar source is read-only.");
  }
  return source;
}

function isProjectSpanCompatibleGoogleEvent(input: { allDay: boolean; startAt: string; endAt: string }): boolean {
  return input.allDay || datePart(input.startAt) !== datePart(input.endAt);
}

function datePart(value: string): string {
  return value.slice(0, 10);
}

function googleMarkerDescription(localEntityType: "calendar_entry" | "initiative_project_span", localEntityId: number): string {
  return `Created by DMAX\nLinked DMAX object: ${localEntityType}:${localEntityId}`;
}

function projectCalendarBindingForApi(initiativeId: number) {
  const binding = calendarBindings.findActiveByLocal({
    localEntityType: "initiative_project_span",
    localEntityId: initiativeId
  });
  if (!binding) {
    return null;
  }

  return {
    id: binding.id,
    localEntityType: binding.localEntityType,
    localEntityId: binding.localEntityId,
    calendarSourceId: binding.calendarSourceId,
    externalCalendarId: binding.externalCalendarId,
    externalEventId: binding.externalEventId,
    syncStatus: binding.syncStatus,
    syncMessage: binding.syncMessage,
    lastSyncedAt: binding.lastSyncedAt,
    calendarSource: binding.calendarSourceId ? calendarSources.findById(binding.calendarSourceId) : null
  };
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

function parseMediaEntityTarget(url: URL): { entityType: MediaEntityType; entityId: number; caption?: string | null } {
  const entityType = mediaEntityTypeBody.parse(url.searchParams.get("entityType"));
  const entityId = parseOptionalPositiveInt(url.searchParams.get("entityId"));
  if (!entityId) {
    throw new Error("entityId is required for media attachments");
  }
  return {
    entityType,
    entityId,
    caption: url.searchParams.get("caption")
  };
}

function ensureMediaEntityExists(entityType: MediaEntityType, entityId: number): void {
  if (entityType === "category") {
    if (!categories.findById(entityId)) throw new Error(`Category not found: ${entityId}`);
    return;
  }
  if (entityType === "initiative") {
    if (!initiatives.findById(entityId)) throw new Error(`Initiative not found: ${entityId}`);
    return;
  }
  if (entityType === "task") {
    if (!tasks.findById(entityId)) throw new Error(`Task not found: ${entityId}`);
    return;
  }
  if (entityType === "app_chat_message") {
    if (!chatMessages.findById(entityId)) throw new Error(`Chat message not found: ${entityId}`);
    return;
  }

  throw new Error(`Media attachments for ${entityType} are not supported yet`);
}

function mediaAssetForApi(asset: MediaAsset): Omit<MediaAsset, "storagePath"> & { fileUrl: string } {
  const { storagePath: _storagePath, ...safeAsset } = asset;
  return {
    ...safeAsset,
    fileUrl: `/api/media/assets/${asset.id}/file`
  };
}

function mediaAttachmentForApi(attachment: MediaAttachment): Omit<MediaAttachment, "asset"> & { asset: ReturnType<typeof mediaAssetForApi> } {
  return {
    ...attachment,
    asset: mediaAssetForApi(attachment.asset)
  };
}

function assistantAudioAttachment(messageId: number): MediaAttachment | null {
  return mediaLinks.listForEntity("app_chat_message", messageId).find((attachment) => attachment.role === "assistant_audio") ?? null;
}

function chatMessageForApi(message: AppChatMessage): AppChatMessage & {
  audioAttachment: ReturnType<typeof mediaAttachmentForApi> | null;
} {
  const attachment = assistantAudioAttachment(message.id);
  return {
    ...message,
    audioAttachment: attachment ? mediaAttachmentForApi(attachment) : null
  };
}

function appChatResultForApi(result: AppChatMessageResult): Omit<AppChatMessageResult, "messages"> & {
  messages: ReturnType<typeof chatMessageForApi>[];
} {
  return {
    ...result,
    messages: result.messages.map(chatMessageForApi)
  };
}

function stateEventForMediaLink(operation: string, link: MediaLink | MediaAttachment): Omit<CreateStateEventInput, "source"> {
  return {
    operation,
    entityType: "media_link",
    entityId: link.id,
    ...stateScopeForMediaEntity(link.entityType, link.entityId)
  };
}

function stateEventForEntityParticipant(
  operation: string,
  participant: { id: number; entityType: "initiative" | "task" | "calendar_entry"; entityId: number }
): Omit<CreateStateEventInput, "source"> {
  const scope: Pick<CreateStateEventInput, "initiativeId" | "taskId"> = {};
  if (participant.entityType === "initiative") {
    scope.initiativeId = participant.entityId;
  }
  if (participant.entityType === "task") {
    const task = tasks.findById(participant.entityId);
    scope.taskId = participant.entityId;
    scope.initiativeId = task?.initiativeId ?? null;
  }
  return {
    operation,
    entityType: "entity_participant",
    entityId: participant.id,
    ...scope
  };
}

function stateScopeForMediaEntity(entityType: MediaEntityType, entityId: number): Pick<CreateStateEventInput, "categoryId" | "initiativeId" | "taskId"> {
  if (entityType === "category") {
    return { categoryId: entityId };
  }
  if (entityType === "initiative") {
    const initiative = initiatives.findById(entityId);
    return { initiativeId: entityId, categoryId: initiative?.categoryId ?? null };
  }
  if (entityType === "task") {
    const task = tasks.findById(entityId);
    return { taskId: entityId, initiativeId: task?.initiativeId ?? null };
  }
  return {};
}

function decodeHeaderValue(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
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

function authorizeInternalToolRequest(req: http.IncomingMessage): boolean {
  const token = env.dmaxInternalToolToken?.trim();
  if (!token) {
    return false;
  }

  const authorization = req.headers.authorization;
  const value = Array.isArray(authorization) ? authorization[0] : authorization;
  return value === `Bearer ${token}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    "access-control-allow-methods": "GET,POST,PATCH,DELETE,OPTIONS",
    "access-control-allow-headers": "authorization,content-type,x-dmax-trace-id,x-file-name",
    "access-control-expose-headers": "x-dmax-trace-id"
  });
  res.end(JSON.stringify(body));
}

function sendMediaFile(res: http.ServerResponse, mimeType: string, filePath: string): void {
  const stat = statSync(filePath);
  res.writeHead(200, {
    "content-type": mimeType,
    "content-length": stat.size,
    "cache-control": "private, max-age=3600",
    "access-control-allow-origin": "http://localhost:5173"
  });
  createReadStream(filePath).pipe(res);
}
