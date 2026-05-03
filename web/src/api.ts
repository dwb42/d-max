import type {
  AppChatResult,
  AppConversation,
  AppOverview,
  AppPromptLog,
  Category,
  ChatActivity,
  ConversationContext,
  LiveKitVoiceSession,
  OpenClawStatus,
  PersistedChatMessage,
  Project,
  ProjectDetail,
  ProjectType,
  PromptTemplateDefinition,
  StateEvent,
  TaskDetail
} from "./types.js";

export async function fetchOverview(): Promise<AppOverview> {
  return request<AppOverview>("/api/app/overview");
}

export async function fetchOpenClawStatus(): Promise<OpenClawStatus> {
  const response = await request<{ openClaw: OpenClawStatus }>("/api/openclaw/status");
  return response.openClaw;
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

export async function reorderProjects(categoryId: number, projectIds: number[]): Promise<void> {
  await request("/api/projects/order", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ categoryId, projectIds })
  });
}

export async function fetchProjects(): Promise<Project[]> {
  const response = await request<{ projects: Project[] }>("/api/projects");
  return response.projects;
}

export async function createProject(input: {
  categoryId: number;
  type: ProjectType;
  name: string;
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
}): Promise<Project> {
  const response = await request<{ project: Project }>("/api/projects", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.project;
}

export async function updateProject(
  projectId: number,
  input: {
    categoryId?: number;
    parentId?: number | null;
    name?: string;
    status?: Project["status"];
    summary?: string | null;
    startDate?: string | null;
    endDate?: string | null;
  }
): Promise<Project> {
  const response = await request<{ project: Project }>(`/api/projects/${projectId}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(input)
  });
  return response.project;
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
  } = {}
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
    body: JSON.stringify(input)
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
    throw new Error("Chat stream ended before d-max returned a final answer.");
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
  } else if (context.type === "project") {
    params.set("contextEntityId", String(context.projectId));
  } else if (context.type === "task") {
    params.set("contextEntityId", String(context.taskId));
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
