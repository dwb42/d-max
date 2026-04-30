import type { AppChatResult, AppOverview, Category, LiveKitVoiceSession, PersistedChatMessage, ProjectDetail, TaskDetail, ThinkingContext } from "./types.js";

export async function fetchOverview(): Promise<AppOverview> {
  return request<AppOverview>("/api/app/overview");
}

export async function createCategory(input: { name: string; description?: string | null }): Promise<Category> {
  const response = await request<{ category: Category }>("/api/categories", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.category;
}

export async function fetchProjectDetail(projectId: number): Promise<ProjectDetail> {
  return request<ProjectDetail>(`/api/projects/${projectId}`);
}

export async function fetchTaskDetail(taskId: number): Promise<TaskDetail> {
  return request<TaskDetail>(`/api/tasks/${taskId}`);
}

export async function fetchThinkingContext(spaceId: number): Promise<ThinkingContext> {
  const response = await request<{ context: ThinkingContext }>(`/api/thinking/spaces/${spaceId}/context`);
  return response.context;
}

export async function completeTask(id: number) {
  return request(`/api/tasks/${id}/complete`, { method: "POST" });
}

export async function updateTaskStatus(id: number, status: string) {
  return request(`/api/tasks/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ status })
  });
}

export async function updateThought(id: number, patch: { status?: string; maturity?: string; heat?: number }) {
  return request(`/api/thinking/thoughts/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
}

export async function updateTension(id: number, patch: { status?: string; pressure?: string }) {
  return request(`/api/thinking/tensions/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch)
  });
}

export async function createVoiceSession(input: { mode: "drive"; thinkingSpaceId?: number | null }): Promise<LiveKitVoiceSession> {
  const response = await request<{ session: LiveKitVoiceSession }>("/api/voice/session", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.session;
}

export async function sendChatMessage(input: {
  message: string;
  thinkingSpaceId?: number | null;
  source?: "app_text" | "app_voice_message";
}): Promise<AppChatResult> {
  return request<AppChatResult>("/api/chat/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
}

export async function fetchChatMessages(): Promise<PersistedChatMessage[]> {
  const response = await request<{ messages: PersistedChatMessage[] }>("/api/chat/messages");
  return response.messages;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const json = await response.json();

  if (!response.ok) {
    throw new Error(json.error ?? `Request failed: ${response.status}`);
  }

  return json as T;
}
