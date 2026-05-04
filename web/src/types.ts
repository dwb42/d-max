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

export type Initiative = {
  id: number;
  categoryId: number;
  parentId: number | null;
  type: InitiativeType;
  name: string;
  status: "active" | "paused" | "completed" | "archived";
  summary: string | null;
  markdown: string;
  startDate: string | null;
  endDate: string | null;
  sortOrder: number;
  isSystem: boolean;
  createdAt?: string;
  updatedAt: string;
};

export type Task = {
  id: number;
  initiativeId: number;
  title: string;
  status: "open" | "in_progress" | "blocked" | "done" | "cancelled";
  priority: "low" | "normal" | "high" | "urgent";
  notes: string | null;
  dueAt: string | null;
  sortOrder: number;
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
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

export type GoogleCalendarAuthStatus = {
  configured: boolean;
  connected: boolean;
  tokenPath: string;
  redirectUri: string;
  scope: string;
  detail: string | null;
};

export type GoogleCalendarListItem = {
  id: string;
  summary: string;
  backgroundColor: string | null;
  primary: boolean;
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
    }
  | {
      id: string;
      source: "google";
      readOnly: true;
      allDay: boolean;
      sourceId: number;
      title: string;
      startAt: string;
      endAt: string;
      color: string | null;
      sourceDisplayName: string;
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
    };

export type CalendarViewData = {
  events: CalendarViewEvent[];
};

export type InitiativeDetail = {
  initiative: Initiative;
  tasks: Task[];
};

export type TaskDetail = {
  task: Task;
  initiative: Initiative | null;
  category: Category | null;
};

export type ConversationContext =
  | { type: "global" }
  | { type: "categories" }
  | { type: "ideas" }
  | { type: "projects" }
  | { type: "habits" }
  | { type: "tasks" }
  | { type: "initiatives" }
  | { type: "category"; categoryId: number }
  | { type: "idea"; initiativeId: number }
  | { type: "project"; initiativeId: number }
  | { type: "habit"; initiativeId: number }
  | { type: "initiative"; initiativeId: number }
  | { type: "task"; taskId: number };

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
  turnTrace: AppChatTurnTrace | null;
  createdAt: string;
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
  entityType: "overview" | "category" | "initiative" | "task" | "calendar_entry" | "calendar_source";
  entityId: number | null;
  categoryId: number | null;
  initiativeId: number | null;
  taskId: number | null;
  createdAt: string;
};

export type ChatActivity = {
  id: string;
  kind: "tool_call" | "tool_result" | "plan" | "reasoning";
  status: "running" | "completed" | "failed";
  title: string;
  detail?: string;
  timestamp?: string;
};

export type PersistedChatMessage = {
  id: number;
  conversationId: number | null;
  role: "user" | "assistant";
  content: string;
  source: "app_text" | "app_voice_message" | "system";
  createdAt: string;
};
