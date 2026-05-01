export type Category = {
  id: number;
  name: string;
  description: string | null;
  sortOrder: number;
  isSystem: boolean;
  createdAt?: string;
  updatedAt?: string;
};

export type Project = {
  id: number;
  categoryId: number;
  parentId: number | null;
  name: string;
  status: "active" | "paused" | "completed" | "archived";
  summary: string | null;
  markdown: string;
  sortOrder: number;
  isSystem: boolean;
  createdAt?: string;
  updatedAt: string;
};

export type Task = {
  id: number;
  projectId: number;
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

export type ProjectDetail = {
  project: Project;
  tasks: Task[];
};

export type TaskDetail = {
  task: Task;
  project: Project | null;
  category: Category | null;
};

export type ConversationContext =
  | { type: "global" }
  | { type: "projects" }
  | { type: "category"; categoryId: number }
  | { type: "project"; projectId: number }
  | { type: "task"; taskId: number };

export type AppOverview = {
  categories: Category[];
  projects: Project[];
  tasks: Task[];
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
  createdAt: string;
};

export type StateEvent = {
  id: number;
  source: "api" | "tool";
  operation: string;
  entityType: "overview" | "category" | "project" | "task";
  entityId: number | null;
  categoryId: number | null;
  projectId: number | null;
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
