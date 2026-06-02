export type Category = {
  id: number;
  name: string;
  description: string | null;
  color: string;
  emoji: string;
  sortOrder: number;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type InitiativeType = "idea" | "project" | "habit";
export type ProjectPhase = "planning" | "doing";

export type Initiative = {
  id: number;
  categoryId: number;
  parentId: number | null;
  type: InitiativeType;
  projectPhase: ProjectPhase;
  name: string;
  status: "active" | "paused" | "completed" | "archived";
  summary: string | null;
  markdown: string;
  startDate: string | null;
  endDate: string | null;
  isLocked: boolean;
  sortOrder: number;
  isSystem: boolean;
  createdAt?: string;
  updatedAt: string;
};

export type InitiativeRelationType = "precedes";

export type InitiativeRelation = {
  id: number;
  predecessorInitiativeId: number;
  successorInitiativeId: number;
  relationType: InitiativeRelationType;
  createdAt: string;
  updatedAt: string;
};

export type InitiativeRelationWithInitiatives = InitiativeRelation & {
  predecessor: Initiative;
  successor: Initiative;
};

export type InitiativeGraph = {
  initiatives: Initiative[];
  relations: InitiativeRelationWithInitiatives[];
};

export type GraphScope =
  | { type: "initiative"; initiativeId: number }
  | { type: "category"; categoryId: number }
  | { type: "all_categories" };

export type GraphLayoutNodeKind = "initiative_root" | "branch" | "freestyle" | "task" | "media";
export type GraphLayoutEntityType = "initiative" | "task" | "media_asset";

export type GraphLayoutNode = {
  id: number;
  scopeKey: string;
  scope: GraphScope;
  nodeKey: string;
  nodeKind: GraphLayoutNodeKind;
  entityType: GraphLayoutEntityType | null;
  entityId: number | null;
  parentNodeKey: string | null;
  label: string;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: boolean;
  moveSupport: {
    visual: boolean;
    semantic: boolean;
    freestyleParent: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type GraphLayoutEdge = {
  id: string;
  sourceNodeKey: string;
  targetNodeKey: string;
  kind: "parent_child";
};

export type InitiativeMindmap = {
  scope: GraphScope;
  nodes: GraphLayoutNode[];
  edges: GraphLayoutEdge[];
};

export type PlanningCanvas = {
  id: number;
  name: string;
  description: string | null;
  defaultStartDate: string | null;
  defaultZoom: "month" | "week";
  createdAt: string;
  updatedAt: string;
};

export type PlanningCanvasNode = {
  id: number;
  canvasId: number;
  initiativeId: number;
  x: number;
  y: number;
  width: number | null;
  height: number | null;
  collapsed: boolean;
  createdAt: string;
  updatedAt: string;
};

export type PlanningCanvasInitiativeNode = PlanningCanvasNode & {
  initiative: Initiative;
  category: Pick<Category, "id" | "name" | "color"> | null;
  tasks: Task[];
  taskCount: number;
  openTaskCount: number;
  doneTaskCount: number;
  hasGoogleCalendarBinding: boolean;
};

export type PlanningCanvasRelationEdge = {
  kind: "parent_child" | "precedes";
  fromInitiativeId: number;
  toInitiativeId: number;
  relationId: number | null;
};

export type PlanningCanvasViewData = {
  canvas: PlanningCanvas;
  nodes: PlanningCanvasInitiativeNode[];
  unmappedInitiatives: Array<{
    initiative: Initiative;
    category: Pick<Category, "id" | "name" | "color"> | null;
    taskCount: number;
    openTaskCount: number;
  }>;
  relationEdges: PlanningCanvasRelationEdge[];
};

export type Task = {
  id: number;
  initiativeId: number;
  title: string;
  status: "open" | "done";
  priority: "low" | "normal" | "high" | "urgent";
  notes: string | null;
  dueAt: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
};

export type TaskChecklistItem = {
  id: number;
  taskId: number;
  name: string;
  status: "todo" | "done";
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
};

export type MediaKind = "image" | "audio" | "video" | "document" | "other";

export type MediaAsset = {
  id: number;
  kind: MediaKind;
  mimeType: string;
  originalName: string;
  sha256: string;
  byteSize: number;
  width: number | null;
  height: number | null;
  durationMs: number | null;
  transcript: string | null;
  textExcerpt: string | null;
  summary: string | null;
  createdAt: string;
  updatedAt: string;
  fileUrl: string;
};

export type MediaEntityType = "category" | "initiative" | "task" | "calendar_entry" | "app_chat_message";

export type MediaAttachment = {
  id: number;
  assetId: number;
  entityType: MediaEntityType;
  entityId: number;
  caption: string | null;
  role: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  asset: MediaAsset;
};

export type PartyType = "person" | "organization";
export type PersonSalutation = "mr" | "mrs" | "unknown";
export type ContactPointType = "email" | "phone" | "whatsapp" | "signal" | "telegram" | "linkedin" | "website" | "other";
export type ParticipantEntityType = "initiative" | "task" | "calendar_entry";

export type Party = {
  id: number;
  type: PartyType;
  displayName: string;
  createdAt: string;
  updatedAt: string;
};

export type Person = Party & {
  type: "person";
  firstName: string | null;
  lastName: string | null;
  salutation: PersonSalutation;
  academicTitle: string | null;
  nameSuffix: string | null;
};

export type Organization = Party & {
  type: "organization";
  name: string;
  legalName: string | null;
  organizationType: string | null;
  markdown: string;
};

export type RelationshipType = {
  id: number;
  key: string;
  label: string;
  inverseLabel: string | null;
  directionality: "directed" | "symmetric";
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type ParticipantRoleType = {
  id: number;
  key: string;
  label: string;
  appliesToEntityType: ParticipantEntityType | null;
  isSystem: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type EntityParticipant = {
  id: number;
  partyId: number;
  entityType: ParticipantEntityType;
  entityId: number;
  roleTypeId: number | null;
  roleLabel: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
  party: Party;
  roleType: ParticipantRoleType | null;
};

export type PartyRelationship = {
  id: number;
  fromPartyId: number;
  toPartyId: number;
  relationshipTypeId: number;
  roleLabel: string | null;
  startedOn: string | null;
  endedOn: string | null;
  status: "active" | "inactive";
  createdAt: string;
  updatedAt: string;
};

export type PartyRelationshipWithParties = PartyRelationship & {
  fromParty: Party;
  toParty: Party;
  relationshipType: RelationshipType;
};

export type PartyContactPoint = {
  id: number;
  partyId: number;
  type: ContactPointType;
  label: string | null;
  value: string;
  normalizedValue: string | null;
  isPrimary: boolean;
  isPreferred: boolean;
  canSend: boolean;
  canReceive: boolean;
  provider: string | null;
  createdAt: string;
  updatedAt: string;
};

export type PartyAddress = {
  id: number;
  partyId: number;
  label: string | null;
  line1: string;
  line2: string | null;
  postalCode: string | null;
  city: string | null;
  region: string | null;
  country: string | null;
  isPrimary: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CreatePartyAddressInput = {
  partyId: number;
  label?: string | null;
  line1: string;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  isPrimary?: boolean;
};

export type PersonDetail = {
  person: Person;
  relationships: PartyRelationshipWithParties[];
  participants: EntityParticipant[];
  contactPoints: PartyContactPoint[];
  addresses: PartyAddress[];
};

export type OrganizationDetail = {
  organization: Organization;
  relationships: PartyRelationshipWithParties[];
  participants: EntityParticipant[];
  contactPoints: PartyContactPoint[];
  addresses: PartyAddress[];
};

export type CalendarEntryType = "initiative_focus" | "task_work" | "standalone";
export type CalendarEntryStatus = "open" | "done";

export type CalendarEntry = {
  id: number;
  type: CalendarEntryType;
  title: string;
  startAt: string;
  endAt: string;
  status: CalendarEntryStatus;
  initiativeId: number | null;
  taskId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CalendarSource = {
  id: number;
  provider: "google";
  accountLabel: string;
  calendarId: string;
  displayName: string;
  color: string | null;
  enabled: boolean;
  readOnly: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CalendarEventVisibilitySurface = "planning_canvas" | "calendar" | "global";
export type CalendarEventVisibilityHiddenScope = "event" | "recurring_instance" | "recurring_series";

export type CalendarEventVisibility = {
  id: number;
  provider: "google";
  surface: CalendarEventVisibilitySurface;
  hiddenScope: CalendarEventVisibilityHiddenScope;
  calendarSourceId: number | null;
  externalCalendarId: string;
  externalEventId: string | null;
  recurringEventId: string | null;
  originalStartAt: string | null;
  iCalUID: string | null;
  titleSnapshot: string;
  startAtSnapshot: string | null;
  endAtSnapshot: string | null;
  hiddenAt: string;
  createdAt: string;
  updatedAt: string;
};

export type GoogleCalendarAuthStatus = {
  configured: boolean;
  connected: boolean;
  tokenPath: string;
  redirectUri: string;
  scope: string;
  tokenScope: string | null;
  hasRequiredScope: boolean;
  detail: string | null;
};

export type GoogleCalendarAccountStatus = {
  accountLabel: string;
  status: GoogleCalendarAuthStatus;
};

export type GoogleWorkspaceAuthStatus = {
  gogInstalled: boolean;
  configured: boolean;
  connected: boolean;
  accounts: string[];
  detail: string | null;
};

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  backgroundColor: string | null;
  primary: boolean;
  accessRole: string | null;
  readOnly: boolean;
};

export type CalendarViewWarning = {
  scope: "auth" | "source" | "calendar_list" | "sync";
  sourceId: number | null;
  message: string;
};

export type CalendarEventBindingView = {
  id: number;
  localEntityType: "calendar_entry" | "initiative_project_span";
  localEntityId: number;
  calendarSourceId: number | null;
  externalCalendarId: string;
  externalEventId: string;
  syncStatus: "synced" | "pending_sync" | "sync_error" | "external_deleted" | "sync_blocked_readonly";
  syncMessage: string | null;
  lastSyncedAt: string | null;
};

export type CalendarViewEvent =
  | {
      id: string;
      source: "dmax";
      readOnly: false;
      allDay: false;
      entryId: number;
      entryType: CalendarEntryType;
      title: string;
      startAt: string;
      endAt: string;
      status: CalendarEntryStatus;
      initiativeId: number | null;
      taskId: number | null;
      categoryId: number | null;
      categoryName: string | null;
	      color: string | null;
	      notes: string | null;
	      binding: CalendarEventBindingView | null;
	    }
  | {
      id: string;
      source: "google";
      readOnly: true;
      allDay: boolean;
      sourceId: number;
      externalCalendarId: string;
      externalEventId: string;
      title: string;
      startAt: string;
      endAt: string;
      color: string | null;
      sourceDisplayName: string;
      htmlLink: string | null;
      etag: string | null;
      updatedAt: string | null;
      recurring: boolean;
      recurringEventId: string | null;
      originalStartAt: string | null;
      iCalUID: string | null;
      organizerSelf: boolean;
      organizer: {
        email: string | null;
        displayName: string | null;
        self: boolean;
      } | null;
      attendees: Array<{
        email: string | null;
        displayName: string | null;
        self: boolean;
        responseStatus: string | null;
        optional: boolean;
      }>;
      sourceReadOnly: boolean;
	      editable: boolean;
	      readOnlyReason: string | null;
	      binding: CalendarEventBindingView | null;
	    }
  | {
      id: string;
      source: "initiative_span";
      readOnly: true;
      allDay: true;
      initiativeId: number;
      title: string;
      startAt: string;
      endAt: string;
	      categoryId: number;
	      categoryName: string | null;
	      color: string | null;
	      isLocked: boolean;
	      binding: CalendarEventBindingView | null;
	    };

export type CalendarViewData = {
  events: CalendarViewEvent[];
  warnings: CalendarViewWarning[];
};

export type InitiativeDetail = {
  initiative: Initiative;
  predecessors?: InitiativeRelationWithInitiatives[];
  successors?: InitiativeRelationWithInitiatives[];
  tasks: Task[];
  participants?: EntityParticipant[];
  mediaAttachments?: MediaAttachment[];
  projectCalendarBinding?: (CalendarEventBindingView & {
    calendarSource: CalendarSource | null;
  }) | null;
};

export type TaskDetail = {
  task: Task;
  checklistItems?: TaskChecklistItem[];
  initiative: Initiative | null;
  category: Category | null;
  participants?: EntityParticipant[];
  mediaAttachments?: MediaAttachment[];
};

export type ConversationContext =
  | { type: "global" }
  | { type: "categories" }
  | { type: "ideas" }
  | { type: "projects" }
  | { type: "habits" }
  | { type: "tasks" }
  | { type: "initiatives" }
  | { type: "people" }
  | { type: "organizations" }
  | { type: "category"; categoryId: number }
  | { type: "idea"; initiativeId: number }
  | { type: "project"; initiativeId: number }
  | { type: "habit"; initiativeId: number }
  | { type: "initiative"; initiativeId: number }
  | { type: "task"; taskId: number }
  | { type: "person"; partyId: number }
  | { type: "organization"; partyId: number };

export type AppOverview = {
  categories: Category[];
  initiatives: Initiative[];
  tasks: Task[];
};

export type OpenClawStatus = {
  state: "ready" | "starting" | "unavailable";
  detail: string;
  checkedAt: string;
};

export type LiveKitVoiceSession = {
  livekitUrl: string;
  token: string;
  roomName: string;
  participantName: string;
};

export type AppChatResult = {
  reply: string;
  conversationId: number | null;
  context: ConversationContext;
  messages: PersistedChatMessage[];
  activities: ChatActivity[];
};

export type AppConversation = {
  id: number;
  title: string | null;
  contextType: ConversationContext["type"];
  contextEntityId: number | null;
  createdAt: string;
  updatedAt: string;
};

export type AppPromptLog = {
  id: number;
  conversationId: number | null;
  userMessageId: number | null;
  openClawSessionId: string;
  contextType: ConversationContext["type"];
  contextEntityId: number | null;
  userInput: string;
  systemInstructions: string;
  contextData: string;
  memoryHistory: string;
  tools: string;
  finalPrompt: string;
  contextPayload: ContextPayload | string | null;
  turnTrace: AppChatTurnTrace | null;
  createdAt: string;
};

export type ContextPayload = {
  version?: number | string;
  context?: unknown;
  title?: string;
  dataSources?: string[];
  current?: unknown[];
  parents?: unknown[];
  children?: unknown[];
  siblings?: unknown[];
  neighbors?: unknown[];
  related?: unknown[];
  limits?: unknown[];
  notes?: string[];
  loadedEntities?: ContextPayloadEntity[];
  omittedEntities?: ContextPayloadOmittedEntity[];
  blocks?: ContextPayloadBlock[];
  deduplications?: ContextPayloadDeduplication[];
  budgets?: unknown;
};

export type ContextPayloadEntity = {
  role?: string;
  entityType?: string;
  id?: string;
  title?: string;
  kind?: string;
  includedFields?: string[];
  emittedChars?: number;
  truncated?: boolean;
};

export type ContextPayloadOmittedEntity = {
  role?: string;
  entityType?: string;
  id?: string;
  title?: string;
  reason?: string;
  originalChars?: number;
};

export type ContextPayloadBlock = {
  id?: string;
  label?: string;
  kind?: string;
  originalChars?: number;
  emittedChars?: number;
  truncated?: boolean;
  omitted?: boolean;
  reason?: string;
};

export type ContextPayloadDeduplication = {
  sourceBlock?: string;
  duplicateOf?: string;
  reason?: string;
};

export type PromptTemplateDefinition = {
  id: string;
  name: string;
  route: string;
  effectiveContext: ConversationContext["type"];
  displayContext?: string;
  systemInstructions: string;
  contextDataTemplate: string;
  finalPromptTemplate: string;
};

export type AppChatTurnTraceEvent = {
  label: string;
  at: string;
  msFromStart: number;
  detail?: Record<string, unknown>;
};

export type OpenClawTrajectoryRunSummary = {
  runId: string;
  sessionStartedAt: string;
  modelCompletedAt: string | null;
  sessionEndedAt: string | null;
  preSessionDelayMs: number | null;
  sessionToModelCompletedMs: number | null;
  sessionToEndedMs: number | null;
  toolCount: number | null;
  usage: Record<string, unknown> | null;
};

export type OpenClawTrajectorySummary = {
  sessionId: string;
  trajectoryFile: string;
  runs: OpenClawTrajectoryRunSummary[];
};

export type AppChatTurnTrace = {
  version: 1;
  traceId: string;
  startedAt: string;
  completedAt: string | null;
  totalMs: number | null;
  events: AppChatTurnTraceEvent[];
  openClaw: OpenClawTrajectorySummary | null;
};

export type StateEvent = {
  id: number;
  source: "api" | "tool";
  operation: string;
  entityType:
    | "overview"
    | "category"
    | "initiative"
    | "initiative_relation"
    | "planning_canvas_node"
    | "task"
    | "calendar_entry"
    | "calendar_event_visibility"
    | "calendar_source"
    | "media_asset"
    | "media_link";
  entityId: number | null;
  categoryId: number | null;
  initiativeId: number | null;
  taskId: number | null;
  createdAt: string;
};

export type ChatActivity = {
  id: string;
  kind: "tool_call" | "tool_result" | "plan" | "reasoning" | "research" | "workspace";
  status: "running" | "completed" | "failed";
  title: string;
  detail?: string;
  timestamp?: string;
  agentId?: string;
  toolName?: string;
  query?: string;
  url?: string;
  command?: string;
  service?: string;
  operation?: string;
  fileId?: string;
  spreadsheetId?: string;
  range?: string;
};

export type ChatResearchSummary = {
  agentId: "dmax-research";
  status: "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  searchCount: number;
  pageCount: number;
  queries: string[];
  pages: Array<{ url: string; status?: string | null }>;
};

export type ChatWorkspaceSummary = {
  agentId: "dmax-google-workspace";
  status: "running" | "completed" | "failed";
  startedAt: string | null;
  completedAt: string | null;
  operationCount: number;
  readCount: number;
  writeCount: number;
  operations: {
    service?: string | null;
    operation: string;
    fileId?: string | null;
    spreadsheetId?: string | null;
    range?: string | null;
    status?: string | null;
  }[];
};

export type PersistedChatMessage = {
  id: number;
  conversationId: number | null;
  role: "user" | "assistant";
  content: string;
  source: "app_text" | "app_voice_message" | "system";
  audioGenerationStatus: "none" | "pending" | "ready" | "failed";
  audioProvider: string | null;
  audioError: string | null;
  audioGeneratedFromMessageId: number | null;
  audioGeneratedAt: string | null;
  researchSummary: ChatResearchSummary | null;
  audioAttachment: MediaAttachment | null;
  createdAt: string;
};
