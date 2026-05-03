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
  | { type: "initiatives" }
  | { type: "category"; categoryId: number }
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
  entityType: "overview" | "category" | "initiative" | "task";
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
