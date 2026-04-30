export type Category = {
  id: number;
  name: string;
  description: string | null;
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
  createdAt?: string;
  updatedAt?: string;
  completedAt?: string | null;
};

export type ProjectDetail = {
  project: Project;
  tasks: Task[];
  thoughtLinks: Array<{
    id: number;
    thoughtId: number;
    toEntityType: string;
    toEntityId: number;
    relation: string;
    createdAt: string;
  }>;
};

export type TaskDetail = {
  task: Task;
  project: Project | null;
  category: Category | null;
};

export type ThinkingSpace = {
  id: number;
  title: string;
  summary: string | null;
  status: "active" | "paused" | "archived";
  updatedAt: string;
};

export type Thought = {
  id: number;
  type: string;
  content: string;
  status: string;
  maturity: string;
  confidence: number;
  heat: number;
};

export type Tension = {
  id: number;
  want: string;
  but: string;
  pressure: "low" | "medium" | "high";
  status: string;
};

export type ThinkingContext = {
  space: ThinkingSpace;
  recentSessions: Array<{ id: number; summary: string | null; createdAt: string }>;
  activeThoughts: Thought[];
  unresolvedTensions: Tension[];
  projectCandidates: Thought[];
  taskCandidates: Thought[];
  openLoops: {
    recommendation: string;
    hotThoughts: Thought[];
    taskCandidates: Thought[];
    projectCandidates: Thought[];
    unresolvedTensions: Tension[];
  };
};

export type AppOverview = {
  categories: Category[];
  projects: Project[];
  tasks: Task[];
  thinkingSpaces: ThinkingSpace[];
};

export type LiveKitVoiceSession = {
  livekitUrl: string;
  token: string;
  roomName: string;
  participantName: string;
};

export type AppChatResult = {
  reply: string;
  thinkingSpaceId: number | null;
  captured: boolean;
  savedThoughts: number;
  messages: PersistedChatMessage[];
};

export type PersistedChatMessage = {
  id: number;
  role: "user" | "assistant";
  content: string;
  source: "app_text" | "app_voice_message" | "system";
  thinkingSpaceId: number | null;
  createdAt: string;
};
