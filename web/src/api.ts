import type {
  AppChatResult,
  AppConversation,
  AppOverview,
  AppPromptLog,
  CalendarEntry,
  CalendarEventVisibility,
  CalendarEventVisibilityHiddenScope,
  CalendarEventVisibilitySurface,
  CalendarEntryType,
  CalendarSource,
  CalendarViewData,
  Category,
  ChatActivity,
  ConversationContext,
  GoogleCalendarAccountStatus,
  GoogleCalendarAuthStatus,
  GoogleCalendarListItem,
  GmailMailboxWithStatus,
  GmailMessage,
  GoogleWorkspaceAuthStatus,
  GraphLayoutNode,
  LiveKitVoiceSession,
  MediaAttachment,
  MediaAsset,
  MediaEntityType,
  OpenClawStatus,
  PersistedChatMessage,
  Organization,
  OrganizationDetail,
  ParticipantRoleType,
  Lead,
  LeadStatus,
  LeadStatusGroup,
  PartyRelationship,
  RelationshipType,
  Person,
  PersonDetail,
  EntityParticipant,
  Initiative,
  InitiativeDetail,
  InitiativeGraph,
  InitiativeMindmap,
  InitiativeRelationWithInitiatives,
  InitiativeType,
  ProjectPhase,
  PlanningCanvasNode,
  PlanningCanvasViewData,
  PromptTemplateDefinition,
  StateEvent,
  Task,
  TaskChecklistItem,
  TaskDetail,
  ContactPointType,
  CreatePartyAddressInput,
  PartyAddress,
  PartyActivitySummary,
  PartyContactPoint,
  PartyTimelineEntry,
  PartyTimelineEntryChannel,
  PartyTimelineEntryDirection,
  PartyTimelineEntryKind,
  OrganizationPersonActivity
} from "./types.js";

export async function fetchOverview(): Promise<AppOverview> {
  return request<AppOverview>("/api/app/overview");
}

export async function fetchPeople(): Promise<Person[]> {
  const response = await request<{ people: Person[] }>("/api/people");
  return response.people;
}

export async function fetchPersonDetail(id: number): Promise<PersonDetail> {
  return request<PersonDetail>(`/api/people/${id}`);
}

export async function createPerson(input: {
  firstName?: string | null;
  lastName?: string | null;
  salutation?: Person["salutation"];
  academicTitle?: string | null;
  nameSuffix?: string | null;
  description?: string | null;
}): Promise<Person> {
  const response = await request<{ person: Person }>("/api/people", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.person;
}

export async function updatePerson(
  id: number,
  input: {
    firstName?: string | null;
    lastName?: string | null;
    salutation?: Person["salutation"];
    academicTitle?: string | null;
    nameSuffix?: string | null;
    description?: string | null;
  }
): Promise<Person> {
  const response = await request<{ person: Person }>(`/api/people/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.person;
}

export async function fetchOrganizations(): Promise<Organization[]> {
  const response = await request<{ organizations: Organization[] }>("/api/organizations");
  return response.organizations;
}

export async function fetchOrganizationDetail(id: number): Promise<OrganizationDetail> {
  return request<OrganizationDetail>(`/api/organizations/${id}`);
}

export async function createOrganization(input: {
  name: string;
  displayName?: string;
  legalName?: string | null;
  organizationType?: string | null;
}): Promise<Organization> {
  const response = await request<{ organization: Organization }>("/api/organizations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.organization;
}

export async function updateOrganization(
  id: number,
  input: {
    name?: string;
    displayName?: string;
    legalName?: string | null;
    organizationType?: string | null;
    markdown?: string | null;
  }
): Promise<Organization> {
  const response = await request<{ organization: Organization }>(`/api/organizations/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.organization;
}

export async function fetchParticipantRoleTypes(appliesToEntityType?: "initiative" | "task" | "calendar_entry"): Promise<ParticipantRoleType[]> {
  const query = appliesToEntityType ? `?appliesToEntityType=${encodeURIComponent(appliesToEntityType)}` : "";
  const response = await request<{ participantRoleTypes: ParticipantRoleType[] }>(`/api/config/participant-role-types${query}`);
  return response.participantRoleTypes;
}

export async function fetchLeadStatusGroups(): Promise<LeadStatusGroup[]> {
  const response = await request<{ leadStatusGroups: LeadStatusGroup[] }>("/api/config/lead-status-groups");
  return response.leadStatusGroups;
}

export async function fetchLeadStatuses(groupId?: number): Promise<LeadStatus[]> {
  const query = groupId ? `?groupId=${encodeURIComponent(String(groupId))}` : "";
  const response = await request<{ leadStatuses: LeadStatus[] }>(`/api/config/lead-statuses${query}`);
  return response.leadStatuses;
}

export async function fetchRelationshipTypes(): Promise<RelationshipType[]> {
  const response = await request<{ relationshipTypes: RelationshipType[] }>("/api/config/relationship-types");
  return response.relationshipTypes;
}

export async function createPartyRelationship(input: {
  fromPartyId: number;
  toPartyId: number;
  relationshipTypeId: number;
  roleLabel?: string | null;
  startedOn?: string | null;
  endedOn?: string | null;
  status?: "active" | "inactive";
}): Promise<PartyRelationship> {
  const response = await request<{ relationship: PartyRelationship }>("/api/party-relationships", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.relationship;
}

export async function deletePartyRelationship(id: number): Promise<void> {
  await request(`/api/party-relationships/${id}`, { method: "DELETE" });
}

export async function createEntityParticipant(input: {
  partyId: number;
  entityType: "initiative" | "task" | "calendar_entry";
  entityId: number;
  roleTypeId?: number | null;
  roleLabel?: string | null;
  isPrimary?: boolean;
}): Promise<EntityParticipant> {
  const response = await request<{ participant: EntityParticipant }>("/api/entity-participants", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.participant;
}

export async function deleteEntityParticipant(id: number): Promise<void> {
  await request(`/api/entity-participants/${id}`, { method: "DELETE" });
}

export async function createLead(input: {
  partyId: number;
  initiativeId?: number | null;
  taskId?: number | null;
  statusId?: number | null;
}): Promise<Lead> {
  const response = await request<{ lead: Lead }>("/api/leads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.lead;
}

export async function updateLeadStatus(id: number, statusId: number): Promise<Lead> {
  const response = await request<{ lead: Lead }>(`/api/leads/${id}/status`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ statusId })
  });
  return response.lead;
}

export async function deleteLead(id: number): Promise<void> {
  await request(`/api/leads/${id}`, { method: "DELETE" });
}

export async function createPartyContactPoint(input: {
  partyId: number;
  type: ContactPointType;
  label?: string | null;
  value: string;
  isPrimary?: boolean;
  isPreferred?: boolean;
  canSend?: boolean;
  canReceive?: boolean;
  provider?: string | null;
}): Promise<PartyContactPoint> {
  const response = await request<{ contactPoint: PartyContactPoint }>("/api/party-contact-points", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.contactPoint;
}

export async function updatePartyContactPoint(
  id: number,
  input: {
    type?: ContactPointType;
    label?: string | null;
    value?: string;
    isPrimary?: boolean;
    isPreferred?: boolean;
    canSend?: boolean;
    canReceive?: boolean;
    provider?: string | null;
  }
): Promise<PartyContactPoint> {
  const response = await request<{ contactPoint: PartyContactPoint }>(`/api/party-contact-points/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.contactPoint;
}

export async function deletePartyContactPoint(id: number): Promise<void> {
  await request(`/api/party-contact-points/${id}`, { method: "DELETE" });
}

export async function createPartyAddress(input: CreatePartyAddressInput): Promise<PartyAddress> {
  const response = await request<{ address: PartyAddress }>("/api/party-addresses", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.address;
}

export async function updatePartyAddress(id: number, input: Partial<Omit<CreatePartyAddressInput, "partyId">>): Promise<PartyAddress> {
  const response = await request<{ address: PartyAddress }>(`/api/party-addresses/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.address;
}

export async function deletePartyAddress(id: number): Promise<void> {
  await request(`/api/party-addresses/${id}`, { method: "DELETE" });
}

export async function fetchOpenClawStatus(): Promise<OpenClawStatus> {
  const response = await request<{ openClaw: OpenClawStatus }>("/api/openclaw/status");
  return response.openClaw;
}

export async function fetchCalendarView(start: string, end: string, input: { surface?: CalendarEventVisibilitySurface } = {}): Promise<CalendarViewData> {
  const params = new URLSearchParams({ start, end });
  if (input.surface) {
    params.set("surface", input.surface);
  }
  return request<CalendarViewData>(`/api/calendar?${params.toString()}`);
}

export async function fetchHiddenCalendarEvents(surface: CalendarEventVisibilitySurface): Promise<CalendarEventVisibility[]> {
  const response = await request<{ hiddenEvents: CalendarEventVisibility[] }>(`/api/calendar/hidden-events?surface=${encodeURIComponent(surface)}`);
  return response.hiddenEvents;
}

export async function hideCalendarEvent(input: {
  surface: CalendarEventVisibilitySurface;
  hiddenScope: CalendarEventVisibilityHiddenScope;
  calendarSourceId?: number | null;
  externalCalendarId: string;
  externalEventId?: string | null;
  recurringEventId?: string | null;
  originalStartAt?: string | null;
  iCalUID?: string | null;
  titleSnapshot: string;
  startAtSnapshot?: string | null;
  endAtSnapshot?: string | null;
}): Promise<CalendarEventVisibility> {
  const response = await request<{ hiddenEvent: CalendarEventVisibility }>("/api/calendar/hidden-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.hiddenEvent;
}

export async function unhideCalendarEvent(id: number): Promise<void> {
  await request(`/api/calendar/hidden-events/${id}`, { method: "DELETE" });
}

export async function createCalendarEntry(input: {
  type: CalendarEntryType;
  title: string;
  startAt: string;
  endAt: string;
  initiativeId?: number | null;
  taskId?: number | null;
  notes?: string | null;
}): Promise<CalendarEntry> {
  const response = await request<{ entry: CalendarEntry }>("/api/calendar/entries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.entry;
}

export async function updateCalendarEntry(
  id: number,
  input: {
    type?: CalendarEntryType;
    title?: string;
    startAt?: string;
    endAt?: string;
    status?: CalendarEntry["status"];
    initiativeId?: number | null;
    taskId?: number | null;
    notes?: string | null;
  }
): Promise<CalendarEntry> {
  const response = await request<{ entry: CalendarEntry }>(`/api/calendar/entries/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.entry;
}

export async function completeCalendarEntry(id: number): Promise<CalendarEntry> {
  const response = await request<{ entry: CalendarEntry }>(`/api/calendar/entries/${id}/complete`, { method: "POST" });
  return response.entry;
}

export async function deleteCalendarEntry(id: number): Promise<void> {
  await request(`/api/calendar/entries/${id}`, { method: "DELETE" });
}

export async function createGoogleEventFromDmax(input: {
  localEntityType: "calendar_entry" | "initiative_project_span";
  localEntityId: number;
  calendarSourceId: number;
}): Promise<void> {
  await request("/api/calendar/google-events", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function updateGoogleOnlyEvent(input: {
  calendarSourceId: number;
  externalEventId: string;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
}): Promise<void> {
  await request("/api/calendar/google-events", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function createGoogleOnlyEvent(input: {
  calendarSourceId: number;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
}): Promise<void> {
  const init = {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  };
  try {
    await request("/api/calendar/google-only-events", init);
  } catch (error) {
    if (!(error instanceof Error) || error.message !== "Not found") {
      throw error;
    }
    await request("/api/calendar/google-events", init);
  }
}

export async function linkGoogleEventFromGoogle(input: {
  calendarSourceId: number;
  externalCalendarId: string;
  externalEventId: string;
  externalEtag?: string | null;
  externalUpdatedAt?: string | null;
  title: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  initialDirection?: "google_to_dmax" | "dmax_to_google";
  target:
    | { type: "existing_project_span"; initiativeId: number }
    | { type: "new_project"; categoryId: number; name?: string }
    | { type: "existing_project_entry"; initiativeId: number }
    | { type: "existing_task_entry"; taskId: number }
    | { type: "new_task_entry"; initiativeId: number; title?: string };
}): Promise<void> {
  await request("/api/calendar/bindings/from-google", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function unlinkCalendarBinding(id: number, input: { deleteGoogleEvent?: boolean } = {}): Promise<void> {
  await request(`/api/calendar/bindings/${id}`, {
    method: "DELETE",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function fetchCalendarSources(): Promise<CalendarSource[]> {
  const response = await request<{ sources: CalendarSource[] }>("/api/config/calendar-sources");
  return response.sources;
}

export async function fetchGoogleCalendarAuthStatus(accountLabel?: string | null): Promise<GoogleCalendarAuthStatus> {
  const query = accountLabel?.trim() ? `?accountLabel=${encodeURIComponent(accountLabel.trim())}` : "";
  const response = await request<{ googleCalendar: GoogleCalendarAuthStatus }>(`/api/config/google-calendar/status${query}`);
  return response.googleCalendar;
}

export async function fetchGoogleCalendarAccounts(): Promise<GoogleCalendarAccountStatus[]> {
  const response = await request<{ accounts: GoogleCalendarAccountStatus[] }>("/api/config/google-calendar/accounts");
  return response.accounts;
}

export async function fetchGoogleWorkspaceAuthStatus(): Promise<GoogleWorkspaceAuthStatus> {
  const response = await request<{ googleWorkspace: GoogleWorkspaceAuthStatus }>("/api/config/google-workspace/status");
  return response.googleWorkspace;
}

export async function fetchGmailMailboxes(): Promise<GmailMailboxWithStatus[]> {
  const response = await request<{ mailboxes: GmailMailboxWithStatus[] }>("/api/config/gmail/mailboxes");
  return response.mailboxes;
}

export async function createGmailAuthUrl(input: { loginHint?: string | null } = {}): Promise<string> {
  const response = await request<{ authUrl: string }>("/api/config/gmail/auth-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.authUrl;
}

export async function upsertGmailMailbox(input: {
  accountLabel: string;
  displayName?: string | null;
  emailAddress?: string | null;
  enabled?: boolean;
  syncEnabled?: boolean;
  sendEnabled?: boolean;
  signature?: string | null;
}): Promise<GmailMailboxWithStatus> {
  const response = await request<{ mailbox: GmailMailboxWithStatus }>("/api/config/gmail/mailboxes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.mailbox;
}

export async function updateGmailMailbox(
  id: number,
  input: {
    displayName?: string | null;
    emailAddress?: string | null;
    enabled?: boolean;
    syncEnabled?: boolean;
    sendEnabled?: boolean;
    signature?: string | null;
  }
): Promise<GmailMailboxWithStatus> {
  const response = await request<{ mailbox: GmailMailboxWithStatus }>(`/api/config/gmail/mailboxes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.mailbox;
}

export async function syncGmailMailbox(id: number): Promise<void> {
  await request(`/api/config/gmail/mailboxes/${id}/sync`, { method: "POST" });
}

export async function fetchPartyGmailMessages(partyId: number, input: { sync?: boolean } = {}): Promise<GmailMessage[]> {
  const query = input.sync ? "?sync=1" : "";
  const response = await request<{ messages: GmailMessage[] }>(`/api/parties/${partyId}/gmail/messages${query}`);
  return response.messages;
}

export async function createGmailDraft(input: {
  mailboxId: number;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  body: string;
}): Promise<{ id: string; messageId: string | null }> {
  const response = await request<{ draft: { id: string; messageId: string | null } }>("/api/gmail/drafts", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.draft;
}

export async function sendGmailDraft(input: { mailboxId: number; draftId: string; confirmed: boolean }): Promise<void> {
  await request("/api/gmail/drafts/send", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function archivePartyGmailMessage(partyId: number, messageId: number): Promise<void> {
  await request(`/api/parties/${partyId}/gmail/messages/${messageId}/archive`, { method: "POST" });
}

export async function trashPartyGmailMessage(partyId: number, messageId: number): Promise<void> {
  await request(`/api/parties/${partyId}/gmail/messages/${messageId}/trash`, { method: "POST" });
}

export async function createGoogleCalendarAuthUrl(input: { loginHint?: string | null } = {}): Promise<string> {
  const response = await request<{ authUrl: string }>("/api/config/google-calendar/auth-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.authUrl;
}

export async function createGoogleWorkspaceAuthUrl(input: { loginHint?: string | null } = {}): Promise<string> {
  const response = await request<{ authUrl: string }>("/api/config/google-workspace/auth-url", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.authUrl;
}

export async function disconnectGoogleCalendar(accountLabel?: string | null): Promise<void> {
  await request("/api/config/google-calendar/disconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountLabel: accountLabel?.trim() || null })
  });
}

export async function disconnectGoogleWorkspace(accountLabel: string): Promise<void> {
  await request("/api/config/google-workspace/disconnect", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ accountLabel })
  });
}

export async function fetchGoogleCalendars(accountLabel?: string | null): Promise<GoogleCalendarListItem[]> {
  const query = accountLabel?.trim() ? `?accountLabel=${encodeURIComponent(accountLabel.trim())}` : "";
  const response = await request<{ calendars: GoogleCalendarListItem[] }>(`/api/config/google-calendar/calendars${query}`);
  return response.calendars;
}

export async function createCalendarSource(input: {
  accountLabel: string;
  calendarId: string;
  displayName: string;
  color?: string | null;
  enabled?: boolean;
  readOnly?: boolean;
}): Promise<CalendarSource> {
  const response = await request<{ source: CalendarSource }>("/api/config/calendar-sources", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.source;
}

export async function updateCalendarSource(
  id: number,
  input: {
    accountLabel?: string;
    calendarId?: string;
    displayName?: string;
    color?: string | null;
    enabled?: boolean;
    readOnly?: boolean;
  }
): Promise<CalendarSource> {
  const response = await request<{ source: CalendarSource }>(`/api/config/calendar-sources/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.source;
}

export async function prewarmOpenClaw(context?: ConversationContext | null): Promise<void> {
  await request("/api/openclaw/prewarm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context: context ?? null })
  });
}

export async function createCategory(input: { name: string; description?: string | null; color?: string | null }): Promise<Category> {
  const response = await request<{ category: Category }>("/api/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.category;
}

export async function updateCategory(categoryId: number, input: { name?: string; description?: string | null; color?: string | null }): Promise<Category> {
  const response = await request<{ category: Category }>(`/api/categories/${categoryId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.category;
}

export async function reorderCategories(categoryIds: number[]): Promise<Category[]> {
  const response = await request<{ categories: Category[] }>("/api/categories/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryIds })
  });
  return response.categories;
}

export async function reorderInitiatives(categoryId: number, initiativeIds: number[]): Promise<void> {
  await request("/api/initiatives/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryId, initiativeIds })
  });
}

export async function fetchInitiatives(): Promise<Initiative[]> {
  const response = await request<{ initiatives: Initiative[] }>("/api/initiatives");
  return response.initiatives;
}

export async function createInitiative(input: {
  categoryId: number;
  parentId?: number | null;
  type: InitiativeType;
  projectPhase?: ProjectPhase;
  name: string;
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
  isLocked?: boolean;
}): Promise<Initiative> {
  const response = await request<{ initiative: Initiative }>("/api/initiatives", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.initiative;
}

export async function updateInitiative(
  initiativeId: number,
  input: {
    categoryId?: number;
    parentId?: number | null;
    type?: InitiativeType;
    projectPhase?: ProjectPhase;
    name?: string;
    status?: Initiative["status"];
    summary?: string | null;
    markdown?: string;
    startDate?: string | null;
    endDate?: string | null;
    isLocked?: boolean;
  }
): Promise<Initiative> {
  const response = await request<{ initiative: Initiative }>(`/api/initiatives/${initiativeId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.initiative;
}

export async function reorderTasks(initiativeId: number, taskIds: number[]): Promise<void> {
  await request("/api/tasks/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ initiativeId, taskIds })
  });
}

export async function createTask(input: { initiativeId?: number | null; primaryPartyId?: number | null; title: string; priority?: Task["priority"]; notes?: string | null; dueAt?: string | null }): Promise<Task> {
  const response = await request<{ task: Task }>("/api/tasks", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.task;
}

export async function fetchInitiativeDetail(initiativeId: number): Promise<InitiativeDetail> {
  return request<InitiativeDetail>(`/api/initiatives/${initiativeId}`);
}

export async function createInitiativeRelation(input: {
  predecessorInitiativeId: number;
  successorInitiativeId: number;
  relationType?: "precedes";
}): Promise<InitiativeRelationWithInitiatives> {
  const response = await request<{ relation: InitiativeRelationWithInitiatives }>("/api/initiative-relations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.relation;
}

export async function deleteInitiativeRelation(id: number): Promise<void> {
  await request(`/api/initiative-relations/${id}`, { method: "DELETE" });
}

export async function fetchInitiativeGraph(input: { initiativeId?: number; maxDepth?: number } = {}): Promise<InitiativeGraph> {
  const params = new URLSearchParams();
  if (input.initiativeId !== undefined) params.set("initiativeId", String(input.initiativeId));
  if (input.maxDepth !== undefined) params.set("maxDepth", String(input.maxDepth));
  const query = params.toString();
  const response = await request<{ graph: InitiativeGraph }>(`/api/initiative-graph${query ? `?${query}` : ""}`);
  return response.graph;
}

export async function fetchInitiativeMindmap(initiativeId: number): Promise<InitiativeMindmap> {
  const response = await request<{ mindmap: InitiativeMindmap }>(`/api/graph/initiative/${initiativeId}`);
  return response.mindmap;
}

export async function createInitiativeMindmapFreestyleNode(
  initiativeId: number,
  input: {
    parentNodeKey?: string | null;
    label?: string | null;
    x?: number;
    y?: number;
  }
): Promise<{ node: GraphLayoutNode; mindmap: InitiativeMindmap }> {
  return request<{ node: GraphLayoutNode; mindmap: InitiativeMindmap }>(`/api/graph/initiative/${initiativeId}/freestyle-nodes`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function updateInitiativeMindmapNode(
  initiativeId: number,
  nodeKey: string,
  input: {
    label?: string;
    x?: number;
    y?: number;
    width?: number | null;
    height?: number | null;
    collapsed?: boolean;
    parentNodeKey?: string | null;
  }
): Promise<{ node: GraphLayoutNode; mindmap: InitiativeMindmap }> {
  return request<{ node: GraphLayoutNode; mindmap: InitiativeMindmap }>(`/api/graph/initiative/${initiativeId}/nodes/${encodeURIComponent(nodeKey)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function deleteInitiativeMindmapNode(
  initiativeId: number,
  nodeKey: string
): Promise<{ deleted: boolean; deletedNodeKeys: string[]; mindmap: InitiativeMindmap }> {
  return request<{ deleted: boolean; deletedNodeKeys: string[]; mindmap: InitiativeMindmap }>(`/api/graph/initiative/${initiativeId}/nodes/${encodeURIComponent(nodeKey)}`, {
    method: "DELETE"
  });
}

export async function replaceInitiativeMindmapFreestyleNodes(
  initiativeId: number,
  nodes: Array<Pick<GraphLayoutNode, "nodeKey" | "parentNodeKey" | "label" | "x" | "y" | "width" | "height" | "collapsed">>
): Promise<InitiativeMindmap> {
  const response = await request<{ mindmap: InitiativeMindmap }>(`/api/graph/initiative/${initiativeId}/freestyle-nodes`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ nodes })
  });
  return response.mindmap;
}

export async function fetchPlanningCanvas(input: {
  canvasId?: number;
  search?: string;
  categoryId?: number;
  type?: InitiativeType;
  status?: Initiative["status"];
  includeArchived?: boolean;
} = {}): Promise<PlanningCanvasViewData> {
  const params = new URLSearchParams();
  if (input.canvasId !== undefined) params.set("canvasId", String(input.canvasId));
  if (input.search?.trim()) params.set("search", input.search.trim());
  if (input.categoryId !== undefined) params.set("categoryId", String(input.categoryId));
  if (input.type !== undefined) params.set("type", input.type);
  if (input.status !== undefined) params.set("status", input.status);
  if (input.includeArchived) params.set("includeArchived", "true");
  const query = params.toString();
  const response = await request<{ view: PlanningCanvasViewData }>(`/api/planning-canvas${query ? `?${query}` : ""}`);
  return response.view;
}

export async function createPlanningCanvasNode(input: {
  canvasId?: number;
  initiativeId: number;
  x: number;
  y: number;
  width?: number | null;
  height?: number | null;
  collapsed?: boolean;
}): Promise<PlanningCanvasNode> {
  const response = await request<{ node: PlanningCanvasNode }>("/api/planning-canvas/nodes", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.node;
}

export async function updatePlanningCanvasNode(
  id: number,
  input: {
    x?: number;
    y?: number;
    width?: number | null;
    height?: number | null;
    collapsed?: boolean;
  }
): Promise<PlanningCanvasNode> {
  const response = await request<{ node: PlanningCanvasNode }>(`/api/planning-canvas/nodes/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.node;
}

export async function deletePlanningCanvasNode(id: number): Promise<void> {
  await request(`/api/planning-canvas/nodes/${id}`, { method: "DELETE" });
}

export async function fetchTaskDetail(taskId: number): Promise<TaskDetail> {
  return request<TaskDetail>(`/api/tasks/${taskId}`);
}

export async function completeTask(id: number) {
  return request(`/api/tasks/${id}/complete`, { method: "POST" });
}

export async function deleteTask(id: number): Promise<void> {
  await request(`/api/tasks/${id}`, { method: "DELETE" });
}

export async function updateTaskStatus(id: number, status: Task["status"]) {
  return request(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status })
  });
}

export async function updateTask(
  id: number,
  input: {
    initiativeId?: number | null;
    primaryPartyId?: number | null;
    title?: string;
    status?: Task["status"];
    priority?: Task["priority"];
    notes?: string | null;
    dueAt?: string | null;
  }
): Promise<Task> {
  const response = await request<{ task: Task }>(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.task;
}

export async function fetchPartyTasks(partyId: number): Promise<Task[]> {
  const response = await request<{ tasks: Task[] }>(`/api/tasks?primaryPartyId=${encodeURIComponent(String(partyId))}`);
  return response.tasks;
}

export async function fetchPartyTimelineEntries(partyId: number): Promise<PartyTimelineEntry[]> {
  const response = await request<{ entries: PartyTimelineEntry[] }>(`/api/parties/${partyId}/timeline-entries`);
  return response.entries;
}

export async function fetchPartyActivitySummaries(
  partyIds: number[],
  options: { includeOrganizationPeople?: boolean } = {}
): Promise<{ summaries: PartyActivitySummary[]; organizationPeople?: Record<number, OrganizationPersonActivity[]> }> {
  return request<{ summaries: PartyActivitySummary[]; organizationPeople?: Record<number, OrganizationPersonActivity[]> }>("/api/parties/activity-summaries", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ partyIds, includeOrganizationPeople: options.includeOrganizationPeople })
  });
}

export async function createPartyTimelineEntry(
  partyId: number,
  input: {
    kind: PartyTimelineEntryKind;
    channel?: PartyTimelineEntryChannel | null;
    direction?: PartyTimelineEntryDirection;
    occurredAt?: string | null;
    title: string;
    body?: string | null;
    relatedTaskId?: number | null;
  }
): Promise<PartyTimelineEntry> {
  const response = await request<{ entry: PartyTimelineEntry }>(`/api/parties/${partyId}/timeline-entries`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.entry;
}

export async function updatePartyTimelineEntry(
  partyId: number,
  entryId: number,
  input: {
    kind?: PartyTimelineEntryKind;
    channel?: PartyTimelineEntryChannel | null;
    direction?: PartyTimelineEntryDirection;
    occurredAt?: string | null;
    title?: string;
    body?: string | null;
    relatedTaskId?: number | null;
  }
): Promise<PartyTimelineEntry> {
  const response = await request<{ entry: PartyTimelineEntry }>(`/api/parties/${partyId}/timeline-entries/${entryId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.entry;
}

export async function deletePartyTimelineEntry(partyId: number, entryId: number): Promise<void> {
  await request<{ deleted: true; id: number }>(`/api/parties/${partyId}/timeline-entries/${entryId}`, {
    method: "DELETE"
  });
}

export async function createTaskChecklistItem(taskId: number, input: { name: string }): Promise<TaskChecklistItem> {
  const response = await request<{ item: TaskChecklistItem }>(`/api/tasks/${taskId}/checklist-items`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.item;
}

export async function updateTaskChecklistItem(
  taskId: number,
  itemId: number,
  input: { name?: string; status?: TaskChecklistItem["status"] }
): Promise<TaskChecklistItem> {
  const response = await request<{ item: TaskChecklistItem }>(`/api/tasks/${taskId}/checklist-items/${itemId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.item;
}

export async function deleteTaskChecklistItem(taskId: number, itemId: number): Promise<void> {
  await request(`/api/tasks/${taskId}/checklist-items/${itemId}`, { method: "DELETE" });
}

export async function reorderTaskChecklistItems(taskId: number, itemIds: number[]): Promise<TaskChecklistItem[]> {
  const response = await request<{ items: TaskChecklistItem[] }>(`/api/tasks/${taskId}/checklist-items/order`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ itemIds })
  });
  return response.items;
}

export async function uploadMediaAttachment(entityType: MediaEntityType, entityId: number, file: File): Promise<MediaAttachment> {
  const response = await request<{ attachment: MediaAttachment }>(
    `/api/media/attachments?entityType=${encodeURIComponent(entityType)}&entityId=${entityId}`,
    {
      method: "POST",
      headers: {
        "content-type": file.type || "application/octet-stream",
        "x-file-name": encodeURIComponent(file.name)
      },
      body: file
    }
  );
  return response.attachment;
}

export async function updateMediaAttachment(linkId: number, input: { caption?: string | null; role?: string | null }): Promise<MediaAttachment> {
  const response = await request<{ attachment: MediaAttachment }>(`/api/media/links/${linkId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.attachment;
}

export async function updateMediaAssetAnalysis(
  assetId: number,
  input: { summary?: string | null; textExcerpt?: string | null; transcript?: string | null }
): Promise<MediaAsset> {
  const response = await request<{ asset: MediaAsset }>(`/api/media/assets/${assetId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.asset;
}

export async function reanalyzeMediaAsset(assetId: number, input: { prompt?: string | null }): Promise<MediaAsset> {
  const response = await request<{ asset: MediaAsset }>(`/api/media/assets/${assetId}/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.asset;
}

export async function deleteMediaAttachment(linkId: number): Promise<void> {
  await request(`/api/media/links/${linkId}`, { method: "DELETE" });
}

export async function reorderMediaAttachments(entityType: MediaEntityType, entityId: number, linkIds: number[]): Promise<MediaAttachment[]> {
  const response = await request<{ attachments: MediaAttachment[] }>("/api/media/links/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ entityType, entityId, linkIds })
  });
  return response.attachments;
}

export async function createVoiceSession(input: { mode: "drive" }): Promise<LiveKitVoiceSession> {
  const response = await request<{ session: LiveKitVoiceSession }>("/api/voice/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.session;
}

export async function transcribeVoiceMessage(audio: Blob): Promise<string> {
  const response = await request<{ text: string }>("/api/chat/voice/transcribe", {
    method: "POST",
    headers: {
      "content-type": audio.type || "audio/webm",
      "x-audio-filename": audioFilename(audio.type)
    },
    body: audio
  });
  return response.text;
}

export async function sendChatMessage(input: {
  message: string;
  conversationId?: number | null;
  context?: ConversationContext | null;
  source?: "app_text" | "app_voice_message";
}): Promise<AppChatResult> {
  const trace = createBrowserChatTrace();
  recordBrowserChatTraceEvent(trace, "browser_json_request_started", {
    conversationId: input.conversationId ?? null,
    contextType: input.context?.type ?? null,
    messageChars: input.message.length
  });
  const result = await request<AppChatResult>("/api/chat/message", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dmax-trace-id": trace.traceId },
    body: JSON.stringify(input)
  });
  recordBrowserChatTraceEvent(trace, "browser_json_response_received", {
    conversationId: result.conversationId,
    replyChars: result.reply.length
  });
  return result;
}

function audioFilename(mimeType: string): string {
  if (mimeType.includes("wav")) return "voice-message.wav";
  if (mimeType.includes("mp4")) return "voice-message.mp4";
  if (mimeType.includes("mpeg")) return "voice-message.mp3";
  if (mimeType.includes("ogg")) return "voice-message.ogg";
  return "voice-message.webm";
}

export async function streamChatMessage(
  input: {
    message: string;
    conversationId?: number | null;
    context?: ConversationContext | null;
    source?: "app_text" | "app_voice_message";
  },
  handlers: {
    onConversation?: (payload: { conversationId: number | null; context: ConversationContext }) => void;
    onActivity?: (activities: ChatActivity[]) => void;
    onAnswerDelta?: (delta: string) => void;
  } = {},
  options: { signal?: AbortSignal } = {}
): Promise<AppChatResult> {
  const trace = createBrowserChatTrace();
  recordBrowserChatTraceEvent(trace, "browser_stream_request_started", {
    conversationId: input.conversationId ?? null,
    contextType: input.context?.type ?? null,
    messageChars: input.message.length
  });
  const response = await fetch("/api/chat/message/stream", {
    method: "POST",
    headers: { "content-type": "application/json", "x-dmax-trace-id": trace.traceId },
    body: JSON.stringify(input),
    signal: options.signal
  });
  recordBrowserChatTraceEvent(trace, "browser_stream_response_headers_received", {
    ok: response.ok,
    status: response.status
  });

  if (!response.ok || !response.body) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error ?? `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AppChatResult | null = null;
  let lastConversationPayload: { conversationId: number | null; context: ConversationContext } | null = null;
  let lastActivities: ChatActivity[] = [];
  let sawFirstChunk = false;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    if (!sawFirstChunk) {
      sawFirstChunk = true;
      recordBrowserChatTraceEvent(trace, "browser_stream_first_chunk_received", { bytes: value.byteLength });
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const parsed = parseSseEvent(rawEvent);
      if (parsed?.event === "done") {
        recordBrowserChatTraceEvent(trace, "browser_stream_done_event_received");
      }
      const next = handleChatStreamEvent(parsed, handlers);
      if (next.conversation) lastConversationPayload = next.conversation;
      if (next.activities) lastActivities = next.activities;
      if (next.finalResult) finalResult = next.finalResult;
    }
  }

  const finalBuffer = buffer.trim();
  if (finalBuffer) {
    const parsed = parseSseEvent(finalBuffer);
    if (parsed?.event === "done") {
      recordBrowserChatTraceEvent(trace, "browser_stream_done_event_received");
    }
    const next = handleChatStreamEvent(parsed, handlers);
    if (next.conversation) lastConversationPayload = next.conversation;
    if (next.activities) lastActivities = next.activities;
    if (next.finalResult) finalResult = next.finalResult;
  }

  if (!finalResult && lastConversationPayload?.conversationId) {
    recordBrowserChatTraceEvent(trace, "browser_stream_fallback_messages_fetch_started", {
      conversationId: lastConversationPayload.conversationId
    });
    const messages = await fetchChatMessages(lastConversationPayload.conversationId);
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (assistant) {
      finalResult = {
        reply: assistant.content,
        conversationId: lastConversationPayload.conversationId,
        context: lastConversationPayload.context,
        messages,
        activities: lastActivities
      };
    }
  }

  if (!finalResult) {
    recordBrowserChatTraceEvent(trace, "browser_stream_finished_without_final_result");
    throw new Error("Chat stream ended before DMAX returned a final answer.");
  }

  recordBrowserChatTraceEvent(trace, "browser_stream_result_ready", {
    conversationId: finalResult.conversationId,
    replyChars: finalResult.reply.length,
    activityCount: finalResult.activities?.length ?? 0
  });
  return finalResult;
}

export async function fetchChatMessages(conversationId?: number | null): Promise<PersistedChatMessage[]> {
  const query = conversationId ? `?conversationId=${conversationId}` : "";
  const response = await request<{ messages: PersistedChatMessage[] }>(`/api/chat/messages${query}`);
  return response.messages;
}

export async function generateChatMessageAudio(messageId: number): Promise<PersistedChatMessage> {
  const response = await request<{ message: PersistedChatMessage }>(`/api/chat/messages/${messageId}/audio`, {
    method: "POST"
  });
  return response.message;
}

export async function fetchChatConversations(context: ConversationContext): Promise<AppConversation[]> {
  const params = conversationContextSearchParams(context);
  const response = await request<{ conversations: AppConversation[] }>(`/api/chat/conversations?${params.toString()}`);
  return response.conversations;
}

export async function createChatConversation(context: ConversationContext): Promise<AppConversation> {
  const response = await request<{ conversation: AppConversation }>("/api/chat/conversations", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ context })
  });
  return response.conversation;
}

export async function fetchChatActivity(conversationId: number): Promise<ChatActivity[]> {
  const response = await request<{ activities: ChatActivity[] }>(`/api/chat/activity?conversationId=${conversationId}`);
  return response.activities;
}

export async function fetchPromptLogs(): Promise<AppPromptLog[]> {
  const response = await request<{ prompts: AppPromptLog[] }>("/api/debug/prompts");
  return response.prompts;
}

export async function fetchPromptTemplates(): Promise<PromptTemplateDefinition[]> {
  const response = await request<{ templates: PromptTemplateDefinition[] }>("/api/debug/prompt-templates");
  return response.templates;
}

export function subscribeStateEvents(handlers: { onStateChange: (event: StateEvent) => void; onError?: () => void }): () => void {
  const events = new EventSource("/api/state/events");
  events.addEventListener("state_change", (event) => {
    handlers.onStateChange(JSON.parse((event as MessageEvent).data) as StateEvent);
  });
  events.addEventListener("error", () => {
    handlers.onError?.();
  });
  return () => events.close();
}

function conversationContextSearchParams(context: ConversationContext): URLSearchParams {
  const params = new URLSearchParams({ contextType: context.type });
  if (context.type === "category") {
    params.set("contextEntityId", String(context.categoryId));
  } else if (context.type === "idea" || context.type === "project" || context.type === "habit" || context.type === "initiative") {
    params.set("contextEntityId", String(context.initiativeId));
  } else if (context.type === "task") {
    params.set("contextEntityId", String(context.taskId));
  } else if (context.type === "person" || context.type === "organization") {
    params.set("contextEntityId", String(context.partyId));
  }
  return params;
}

type BrowserChatTrace = {
  traceId: string;
  startedAtMs: number;
};

function createBrowserChatTrace(): BrowserChatTrace {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(16).slice(2, 10);
  return {
    traceId: `browser-chat-${new Date().toISOString().replace(/[-:.TZ]/g, "").slice(0, 14)}-${suffix}`,
    startedAtMs: performance.now()
  };
}

function recordBrowserChatTraceEvent(trace: BrowserChatTrace, event: string, detail?: Record<string, unknown>): void {
  const payload = JSON.stringify({
    traceId: trace.traceId,
    event,
    ts: new Date().toISOString(),
    msFromTraceStart: Math.max(0, performance.now() - trace.startedAtMs),
    ...(detail ? { detail } : {})
  });

  if (typeof navigator !== "undefined" && "sendBeacon" in navigator) {
    const sent = navigator.sendBeacon("/api/diagnostics/chat-event", new Blob([payload], { type: "application/json" }));
    if (sent) {
      return;
    }
  }

  void fetch("/api/diagnostics/chat-event", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: payload,
    keepalive: true
  }).catch(() => undefined);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error ?? `Request failed: ${response.status}`);
  }

  return json as T;
}

function parseSseEvent(raw: string): { event: string; data: unknown } | null {
  const eventLine = raw.split("\n").find((line) => line.startsWith("event:"));
  const dataLines = raw.split("\n").filter((line) => line.startsWith("data:"));
  if (!eventLine || dataLines.length === 0) {
    return null;
  }

  const event = eventLine.slice("event:".length).trim();
  const dataText = dataLines.map((line) => line.slice("data:".length).trimStart()).join("\n");
  try {
    return { event, data: JSON.parse(dataText) };
  } catch {
    return null;
  }
}

function handleChatStreamEvent(
  parsed: { event: string; data: unknown } | null,
  handlers: {
    onConversation?: (payload: { conversationId: number | null; context: ConversationContext }) => void;
    onActivity?: (activities: ChatActivity[]) => void;
    onAnswerDelta?: (delta: string) => void;
  }
): {
  conversation?: { conversationId: number | null; context: ConversationContext };
  activities?: ChatActivity[];
  finalResult?: AppChatResult;
} {
  if (!parsed) {
    return {};
  }

  if (parsed.event === "conversation") {
    const payload = parsed.data as { conversationId: number | null; context: ConversationContext };
    handlers.onConversation?.(payload);
    return { conversation: payload };
  }

  if (parsed.event === "activity") {
    const payload = parsed.data as { activities?: ChatActivity[] };
    const activities = payload.activities ?? [];
    handlers.onActivity?.(activities);
    return { activities };
  }

  if (parsed.event === "answer_delta") {
    const payload = parsed.data as { delta?: string };
    handlers.onAnswerDelta?.(payload.delta ?? "");
    return {};
  }

  if (parsed.event === "done") {
    return { finalResult: parsed.data as AppChatResult };
  }

  return {};
}
