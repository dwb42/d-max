import type {
  AppChatResult,
  AppConversation,
  AppOverview,
  AppPromptLog,
  Category,
  ChatActivity,
  ConversationContext,
  LiveKitVoiceSession,
  PersistedChatMessage,
  ProjectDetail,
  StateEvent,
  TaskDetail,
  ThinkingContext
} from "./types.js";

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

export async function reorderCategories(categoryIds: number[]): Promise<Category[]> {
  const response = await request<{ categories: Category[] }>("/api/categories/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryIds })
  });
  return response.categories;
}

export async function reorderProjects(categoryId: number, projectIds: number[]): Promise<void> {
  await request("/api/projects/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryId, projectIds })
  });
}

export async function reorderTasks(projectId: number, taskIds: number[]): Promise<void> {
  await request("/api/tasks/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ projectId, taskIds })
  });
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
  thinkingSpaceId?: number | null;
  source?: "app_text" | "app_voice_message";
}): Promise<AppChatResult> {
  return request<AppChatResult>("/api/chat/message", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
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
    thinkingSpaceId?: number | null;
    source?: "app_text" | "app_voice_message";
  },
  handlers: {
    onConversation?: (payload: { conversationId: number | null; context: ConversationContext; thinkingSpaceId: number | null }) => void;
    onActivity?: (activities: ChatActivity[]) => void;
    onAnswerDelta?: (delta: string) => void;
  } = {}
): Promise<AppChatResult> {
  const response = await fetch("/api/chat/message/stream", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });

  if (!response.ok || !response.body) {
    const json = await response.json().catch(() => null);
    throw new Error(json?.error ?? `Request failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let finalResult: AppChatResult | null = null;
  let lastConversationPayload: { conversationId: number | null; context: ConversationContext; thinkingSpaceId: number | null } | null = null;
  let lastActivities: ChatActivity[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const rawEvent of events) {
      const parsed = parseSseEvent(rawEvent);
      const next = handleChatStreamEvent(parsed, handlers);
      if (next.conversation) lastConversationPayload = next.conversation;
      if (next.activities) lastActivities = next.activities;
      if (next.finalResult) finalResult = next.finalResult;
    }
  }

  const finalBuffer = buffer.trim();
  if (finalBuffer) {
    const parsed = parseSseEvent(finalBuffer);
    const next = handleChatStreamEvent(parsed, handlers);
    if (next.conversation) lastConversationPayload = next.conversation;
    if (next.activities) lastActivities = next.activities;
    if (next.finalResult) finalResult = next.finalResult;
  }

  if (!finalResult && lastConversationPayload?.conversationId) {
    const messages = await fetchChatMessages(lastConversationPayload.conversationId);
    const assistant = [...messages].reverse().find((message) => message.role === "assistant");
    if (assistant) {
      finalResult = {
        reply: assistant.content,
        conversationId: lastConversationPayload.conversationId,
        context: lastConversationPayload.context,
        thinkingSpaceId: lastConversationPayload.thinkingSpaceId,
        captured: false,
        savedThoughts: 0,
        messages,
        activities: lastActivities
      };
    }
  }

  if (!finalResult) {
    throw new Error("Chat stream ended before d-max returned a final answer.");
  }

  return finalResult;
}

export async function fetchChatMessages(conversationId?: number | null): Promise<PersistedChatMessage[]> {
  const query = conversationId ? `?conversationId=${conversationId}` : "";
  const response = await request<{ messages: PersistedChatMessage[] }>(`/api/chat/messages${query}`);
  return response.messages;
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
  } else if (context.type === "project") {
    params.set("contextEntityId", String(context.projectId));
  } else if (context.type === "task") {
    params.set("contextEntityId", String(context.taskId));
  }
  return params;
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
    onConversation?: (payload: { conversationId: number | null; context: ConversationContext; thinkingSpaceId: number | null }) => void;
    onActivity?: (activities: ChatActivity[]) => void;
    onAnswerDelta?: (delta: string) => void;
  }
): {
  conversation?: { conversationId: number | null; context: ConversationContext; thinkingSpaceId: number | null };
  activities?: ChatActivity[];
  finalResult?: AppChatResult;
} {
  if (!parsed) {
    return {};
  }

  if (parsed.event === "conversation") {
    const payload = parsed.data as { conversationId: number | null; context: ConversationContext; thinkingSpaceId: number | null };
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
