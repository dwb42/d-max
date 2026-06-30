import { z } from "zod";
import { conversationContextSchema } from "../chat/conversation-context.js";

export const taskDueAtBody = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{3})?)?(?:Z|[+-]\d{2}:\d{2})?)?$/, "Expected YYYY-MM-DD or ISO datetime")
  .nullable();

export const updateTaskBody = z.object({
  initiativeId: z.number().int().positive().nullable().optional(),
  primaryPartyId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1).optional(),
  status: z.enum(["open", "done"]).optional(),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: taskDueAtBody.optional()
});

export const calendarDateQuery = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD");
export const calendarDateTime = z.string().trim().min(1);
export const calendarEntryType = z.enum(["initiative_focus", "task_work", "standalone"]);
export const calendarEventVisibilitySurface = z.enum(["planning_canvas", "calendar", "global"]);
export const calendarHiddenSurfaceQuery = calendarEventVisibilitySurface.nullish().transform((value) => value ?? null);
export const calendarEventVisibilityHiddenScope = z.enum(["event", "recurring_instance", "recurring_series"]);

export const createCalendarEntryBody = z.object({
  type: calendarEntryType,
  title: z.string().trim().min(1),
  startAt: calendarDateTime,
  endAt: calendarDateTime,
  initiativeId: z.number().int().positive().nullable().optional(),
  taskId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const updateCalendarEntryBody = z.object({
  type: calendarEntryType.optional(),
  title: z.string().trim().min(1).optional(),
  startAt: calendarDateTime.optional(),
  endAt: calendarDateTime.optional(),
  status: z.enum(["open", "done"]).optional(),
  initiativeId: z.number().int().positive().nullable().optional(),
  taskId: z.number().int().positive().nullable().optional(),
  notes: z.string().nullable().optional()
});

export const calendarBindingLocalEntityType = z.enum(["calendar_entry", "initiative_project_span"]);

export const createGoogleEventFromDmaxBody = z.object({
  localEntityType: calendarBindingLocalEntityType,
  localEntityId: z.number().int().positive(),
  calendarSourceId: z.number().int().positive()
});

export const createGoogleEventBody = z.union([
  createGoogleEventFromDmaxBody,
  z.object({
    calendarSourceId: z.number().int().positive(),
    title: z.string().trim().min(1),
    startAt: z.string().trim().min(1),
    endAt: z.string().trim().min(1),
    allDay: z.boolean()
  })
]);

export const updateGoogleOnlyEventBody = z.object({
  calendarSourceId: z.number().int().positive(),
  externalEventId: z.string().trim().min(1),
  title: z.string().trim().min(1),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1),
  allDay: z.boolean()
});

export const createGoogleOnlyEventBody = z.object({
  calendarSourceId: z.number().int().positive(),
  title: z.string().trim().min(1),
  startAt: z.string().trim().min(1),
  endAt: z.string().trim().min(1),
  allDay: z.boolean()
});

export const createCalendarEventVisibilityBody = z.object({
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

export const linkGoogleEventBody = z.object({
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

export const unlinkCalendarBindingBody = z.object({
  deleteGoogleEvent: z.boolean().optional()
});

export const createCalendarSourceBody = z.object({
  provider: z.literal("google").optional(),
  accountLabel: z.string().trim().min(1),
  calendarId: z.string().trim().min(1),
  displayName: z.string().trim().min(1),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  enabled: z.boolean().optional(),
  readOnly: z.boolean().optional()
});

export const updateCalendarSourceBody = z.object({
  accountLabel: z.string().trim().min(1).optional(),
  calendarId: z.string().trim().min(1).optional(),
  displayName: z.string().trim().min(1).optional(),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional(),
  enabled: z.boolean().optional(),
  readOnly: z.boolean().optional()
});

export const googleCalendarAuthUrlBody = z.object({
  loginHint: z.string().trim().min(1).nullable().optional()
});

export const googleCalendarDisconnectBody = z.object({
  accountLabel: z.string().trim().min(1).nullable().optional()
});

export const upsertGmailMailboxBody = z.object({
  accountLabel: z.string().trim().min(1),
  displayName: z.string().trim().min(1).nullable().optional(),
  emailAddress: z.string().trim().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  sendEnabled: z.boolean().optional(),
  signature: z.string().nullable().optional()
});

export const updateGmailMailboxBody = z.object({
  displayName: z.string().trim().min(1).nullable().optional(),
  emailAddress: z.string().trim().min(1).nullable().optional(),
  enabled: z.boolean().optional(),
  syncEnabled: z.boolean().optional(),
  sendEnabled: z.boolean().optional(),
  signature: z.string().nullable().optional()
});

export const gmailAddressList = z.array(z.string().trim().email()).min(1);
export const optionalGmailAddressList = z.array(z.string().trim().email()).optional();

export const createGmailDraftBody = z.object({
  mailboxId: z.number().int().positive(),
  to: gmailAddressList,
  cc: optionalGmailAddressList,
  bcc: optionalGmailAddressList,
  subject: z.string().trim().min(1),
  body: z.string().trim().min(1)
});

export const sendGmailDraftBody = z.object({
  mailboxId: z.number().int().positive(),
  draftId: z.string().trim().min(1),
  confirmed: z.boolean()
});

export const gmailLimitQuery = z.coerce.number().int().positive().max(200).optional().transform((value) => value ?? 50);

export const createCategoryBody = z.object({
  name: z.string().trim().min(1),
  description: z.string().nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

export const updateCategoryBody = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  color: z.string().trim().regex(/^#[0-9a-f]{6}$/i).nullable().optional()
});

export const partySalutationBody = z.enum(["mr", "mrs", "unknown"]);
export const participantEntityTypeBody = z.enum(["initiative", "task", "calendar_entry"]);
export const contactPointTypeBody = z.enum(["email", "phone", "whatsapp", "signal", "telegram", "linkedin", "website", "other"]);
export const relationshipStatusBody = z.enum(["active", "inactive"]);
export const partyDateBody = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").nullable();

export const createPersonBody = z.object({
  firstName: z.string().trim().min(1).nullable().optional(),
  lastName: z.string().trim().min(1).nullable().optional(),
  salutation: partySalutationBody.optional(),
  academicTitle: z.string().trim().min(1).nullable().optional(),
  nameSuffix: z.string().trim().min(1).nullable().optional(),
  description: z.string().nullable().optional()
});

export const updatePersonBody = createPersonBody.partial();

export const createOrganizationBody = z.object({
  name: z.string().trim().min(1),
  displayName: z.string().trim().min(1).optional(),
  legalName: z.string().trim().min(1).nullable().optional(),
  organizationType: z.string().trim().min(1).nullable().optional(),
  markdown: z.string().nullable().optional()
});

export const updateOrganizationBody = createOrganizationBody.partial();

export const createPartyRelationshipBody = z.object({
  fromPartyId: z.number().int().positive(),
  toPartyId: z.number().int().positive(),
  relationshipTypeId: z.number().int().positive(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  startedOn: partyDateBody.optional(),
  endedOn: partyDateBody.optional(),
  status: relationshipStatusBody.optional()
});

export const createEntityParticipantBody = z.object({
  partyId: z.number().int().positive(),
  entityType: participantEntityTypeBody,
  entityId: z.number().int().positive(),
  roleTypeId: z.number().int().positive().nullable().optional(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional()
});

export const updateEntityParticipantBody = z.object({
  roleTypeId: z.number().int().positive().nullable().optional(),
  roleLabel: z.string().trim().min(1).nullable().optional(),
  isPrimary: z.boolean().optional()
});

export const createPartyContactPointBody = z.object({
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

export const updatePartyContactPointBody = createPartyContactPointBody.omit({ partyId: true }).partial();

export const createPartyAddressBody = z.object({
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

export const updatePartyAddressBody = createPartyAddressBody.omit({ partyId: true }).partial();

export const partyTimelineEntryKindBody = z.enum(["conversation", "letter_received", "letter_sent", "visit", "note"]);
export const partyTimelineEntryChannelBody = z.enum(["phone", "meeting", "visit", "letter", "note", "other"]);
export const partyTimelineEntryDirectionBody = z.enum(["inbound", "outbound", "bidirectional", "none"]);
export const partyTimelineEntryPartyRoleBody = z.enum(["primary", "participant", "related", "organization_context"]);
export const partyTimelineRelatedPartiesBody = z.array(z.object({
  partyId: z.number().int().positive(),
  role: partyTimelineEntryPartyRoleBody.optional()
})).optional();

export const createPartyTimelineEntryBody = z.object({
  kind: partyTimelineEntryKindBody,
  channel: partyTimelineEntryChannelBody.nullable().optional(),
  direction: partyTimelineEntryDirectionBody.optional(),
  occurredAt: z.string().trim().min(1).nullable().optional(),
  title: z.string().trim().min(1),
  body: z.string().nullable().optional(),
  relatedTaskId: z.number().int().positive().nullable().optional(),
  parties: partyTimelineRelatedPartiesBody
});

export const updatePartyTimelineEntryBody = z.object({
  kind: partyTimelineEntryKindBody.optional(),
  channel: partyTimelineEntryChannelBody.nullable().optional(),
  direction: partyTimelineEntryDirectionBody.optional(),
  occurredAt: z.string().trim().min(1).optional(),
  title: z.string().trim().min(1).optional(),
  body: z.string().nullable().optional(),
  relatedTaskId: z.number().int().positive().nullable().optional()
});

export const partyActivitySummariesBody = z.object({
  partyIds: z.array(z.number().int().positive()).max(200),
  includeOrganizationPeople: z.boolean().optional()
});

export const initiativeDateBody = z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, "Expected YYYY-MM-DD").nullable();
export const projectPhaseBody = z.enum(["planning", "doing"]);

export const createInitiativeBody = z.object({
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

export const updateInitiativeBody = z.object({
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

export const reorderCategoriesBody = z.object({
  categoryIds: z.array(z.number().int().positive()).min(1)
});

export const reorderInitiativesBody = z.union([
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

export const createInitiativeRelationBody = z.object({
  predecessorInitiativeId: z.number().int().positive(),
  successorInitiativeId: z.number().int().positive(),
  relationType: z.literal("precedes").optional()
});

export const planningCanvasCoordinate = z.number().finite().min(0).max(100000);
export const mindmapCoordinate = z.number().finite().min(-100000).max(100000);

export const createPlanningCanvasNodeBody = z.object({
  canvasId: z.number().int().positive().optional(),
  initiativeId: z.number().int().positive(),
  x: planningCanvasCoordinate,
  y: planningCanvasCoordinate,
  width: planningCanvasCoordinate.nullable().optional(),
  height: planningCanvasCoordinate.nullable().optional(),
  collapsed: z.boolean().optional()
});

export const updatePlanningCanvasNodeBody = z.object({
  x: planningCanvasCoordinate.optional(),
  y: planningCanvasCoordinate.optional(),
  width: planningCanvasCoordinate.nullable().optional(),
  height: planningCanvasCoordinate.nullable().optional(),
  collapsed: z.boolean().optional()
});

export const createMindmapFreestyleNodeBody = z.object({
  parentNodeKey: z.string().trim().min(1).nullable().optional(),
  label: z.string().trim().nullable().optional(),
  x: mindmapCoordinate.optional(),
  y: mindmapCoordinate.optional()
});

export const updateMindmapNodeBody = z.object({
  label: z.string().trim().min(1).optional(),
  x: mindmapCoordinate.optional(),
  y: mindmapCoordinate.optional(),
  width: mindmapCoordinate.nonnegative().nullable().optional(),
  height: mindmapCoordinate.nonnegative().nullable().optional(),
  collapsed: z.boolean().optional(),
  parentNodeKey: z.string().trim().min(1).nullable().optional()
});

export const replaceMindmapFreestyleNodesBody = z.object({
  nodes: z.array(z.object({
    nodeKey: z.string().trim().min(1),
    parentNodeKey: z.string().trim().min(1).nullable(),
    label: z.string().trim(),
    x: mindmapCoordinate,
    y: mindmapCoordinate,
    width: mindmapCoordinate.nonnegative().nullable().optional(),
    height: mindmapCoordinate.nonnegative().nullable().optional(),
    collapsed: z.boolean().optional()
  }))
});

export const reorderTasksBody = z.union([
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

export const createTaskBody = z.object({
  initiativeId: z.number().int().positive().nullable().optional(),
  primaryPartyId: z.number().int().positive().nullable().optional(),
  title: z.string().trim().min(1),
  priority: z.enum(["low", "normal", "high", "urgent"]).optional(),
  notes: z.string().trim().min(1).nullable().optional(),
  dueAt: taskDueAtBody.optional()
}).refine((body) => body.initiativeId || body.primaryPartyId, {
  message: "initiativeId or primaryPartyId is required"
});

export const createTaskChecklistItemBody = z.object({
  name: z.string().trim().min(1)
});

export const updateTaskChecklistItemBody = z.object({
  name: z.string().trim().min(1).optional(),
  status: z.enum(["todo", "done"]).optional()
});

export const reorderTaskChecklistItemsBody = z.object({
  itemIds: z.array(z.number().int().positive()).min(1)
});

export const mediaEntityTypeBody = z.enum(["category", "initiative", "task", "calendar_entry", "app_chat_message"]);

export const createMediaLinkBody = z.object({
  assetId: z.number().int().positive(),
  entityType: mediaEntityTypeBody,
  entityId: z.number().int().positive(),
  caption: z.string().nullable().optional(),
  role: z.string().trim().min(1).nullable().optional()
});

export const updateMediaLinkBody = z.object({
  caption: z.string().nullable().optional(),
  role: z.string().trim().min(1).nullable().optional()
});

export const updateMediaAssetBody = z.object({
  summary: z.string().nullable().optional(),
  textExcerpt: z.string().nullable().optional(),
  transcript: z.string().nullable().optional()
});

export const reanalyzeMediaAssetBody = z.object({
  prompt: z.string().nullable().optional()
});

export const reorderMediaLinksBody = z.object({
  entityType: mediaEntityTypeBody,
  entityId: z.number().int().positive(),
  linkIds: z.array(z.number().int().positive()).min(1)
});

export const voiceSessionBody = z.object({
  mode: z.literal("drive")
});

export const chatMessageBody = z.object({
  message: z.string().trim().min(1),
  conversationId: z.number().int().positive().nullable().optional(),
  context: conversationContextSchema.nullable().optional(),
  source: z.enum(["app_text", "app_voice_message"]).optional()
});

export const prewarmOpenClawBody = z.object({
  context: conversationContextSchema.nullable().optional()
});

export const internalToolBody = z.object({
  input: z.unknown().optional(),
  traceId: z.string().trim().min(1).max(160).optional()
});

export const browserDiagnosticBody = z.object({
  traceId: z.string().trim().min(1).max(120),
  event: z.string().trim().min(1).max(120),
  ts: z.string().trim().min(1),
  msFromTraceStart: z.number().finite().nonnegative().optional(),
  detail: z.record(z.unknown()).optional()
});

export const createConversationBody = z.object({
  context: conversationContextSchema
});
