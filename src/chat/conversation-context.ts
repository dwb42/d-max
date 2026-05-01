import { z } from "zod";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../repositories/categories.js";
import { ProjectRepository } from "../repositories/projects.js";
import type { Project } from "../repositories/projects.js";
import { TaskRepository } from "../repositories/tasks.js";
import type { Task } from "../repositories/tasks.js";
import type { ConversationContextType } from "../repositories/app-conversations.js";

export const conversationContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }),
  z.object({ type: z.literal("projects") }),
  z.object({ type: z.literal("category"), categoryId: z.number().int().positive() }),
  z.object({ type: z.literal("project"), projectId: z.number().int().positive() }),
  z.object({ type: z.literal("task"), taskId: z.number().int().positive() })
]);

export type ConversationContext = z.infer<typeof conversationContextSchema>;

export type ResolvedConversationContext = {
  context: ConversationContext;
  contextType: ConversationContextType;
  contextEntityId: number | null;
  title: string;
  agentContextBlock: string;
  promptSections: ConversationPromptSections;
};

export type ConversationPromptSections = {
  systemInstructions: string;
  contextData: string;
};

export function conversationContextFromStorage(contextType: ConversationContextType, contextEntityId: number | null): ConversationContext {
  if (contextType === "global" || contextType === "projects") {
    return { type: contextType };
  }

  if (!contextEntityId) {
    throw new Error(`Stored ${contextType} conversation is missing context_entity_id`);
  }

  if (contextType === "category") return { type: "category", categoryId: contextEntityId };
  if (contextType === "project") return { type: "project", projectId: contextEntityId };
  return { type: "task", taskId: contextEntityId };
}

export function storageForConversationContext(context: ConversationContext): {
  contextType: ConversationContextType;
  contextEntityId: number | null;
} {
  if (context.type === "global" || context.type === "projects") {
    return { contextType: context.type, contextEntityId: null };
  }

  if (context.type === "category") return { contextType: "category", contextEntityId: context.categoryId };
  if (context.type === "project") return { contextType: "project", contextEntityId: context.projectId };
  return { contextType: "task", contextEntityId: context.taskId };
}

export function resolveConversationContext(db: Database.Database, input?: ConversationContext | null): ResolvedConversationContext {
  const context = input ?? { type: "global" };
  const storage = storageForConversationContext(context);
  const categories = new CategoryRepository(db);
  const projects = new ProjectRepository(db);
  const tasks = new TaskRepository(db);

  if (context.type === "global") {
    return {
      context,
      ...storage,
      title: "Global Chat",
      ...buildPromptSections("global", "Global d-max chat without a focused UI entity.", [
        "Use the tools to inspect projects or tasks when the user asks for specific state.",
        "Do not assume a project or task target unless the user names one clearly."
      ])
    };
  }

  if (context.type === "projects") {
    const categoryList = categories.list();
    const activeProjects = projects.list({ status: "active" });
    const activeTasks = tasks.list().filter((task) => task.status !== "done" && task.status !== "cancelled");
    const lines = [
      `Categories: ${categoryList.map((category) => category.name).join(", ") || "none"}`,
      `Active projects (${activeProjects.length}):`,
      ...activeProjects.slice(0, 30).map((project) => `- #${project.id} ${project.name}: ${project.summary ?? firstMarkdownLine(project.markdown)}`),
      `Open execution surface (${activeTasks.length} tasks, showing highest-signal first):`,
      ...rankTasks(activeTasks).slice(0, 25).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: "Projects",
      ...buildPromptSections("projects", "Focused on the overall projects overview.", lines)
    };
  }

  if (context.type === "category") {
    const category = categories.findById(context.categoryId);
    if (!category) {
      throw new Error(`Category not found: ${context.categoryId}`);
    }

    const categoryProjects = projects.list({ categoryId: category.id, status: "active" });
    const projectIds = new Set(categoryProjects.map((project) => project.id));
    const categoryTasks = tasks.list().filter((task) => projectIds.has(task.projectId) && task.status !== "done" && task.status !== "cancelled");
    const lines = [
      `Category: #${category.id} ${category.name}`,
      category.description ? `Description: ${category.description}` : "Description: none",
      `Active projects (${categoryProjects.length}):`,
      ...categoryProjects.map((project) => `- #${project.id} ${project.name}: ${project.summary ?? firstMarkdownLine(project.markdown)}`),
      `Open tasks in category (${categoryTasks.length}, showing highest-signal first):`,
      ...rankTasks(categoryTasks).slice(0, 25).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: category.name,
      ...buildPromptSections("category", "Focused on one category and its active projects/tasks.", lines)
    };
  }

  if (context.type === "project") {
    const project = projects.findById(context.projectId);
    if (!project) {
      throw new Error(`Project not found: ${context.projectId}`);
    }

    const category = categories.findById(project.categoryId);
    const projectTasks = tasks.list({ projectId: project.id });
    const lines = [
      formatProjectHeader(project),
      `Category: ${category ? `#${category.id} ${category.name}` : "unknown"}`,
      `Project memory markdown:\n${truncate(project.markdown || "No project markdown yet.", 7000)}`,
      `Tasks (${projectTasks.length}, open/high-signal first):`,
      ...rankTasks(projectTasks).slice(0, 30).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: project.name,
      ...buildPromptSections("project", "Focused on one project. Use the project markdown as durable project memory.", lines)
    };
  }

  const task = tasks.findById(context.taskId);
  if (!task) {
    throw new Error(`Task not found: ${context.taskId}`);
  }

  const project = projects.findById(task.projectId);
  const category = project ? categories.findById(project.categoryId) : null;
  const siblingTasks = project ? tasks.list({ projectId: project.id }).filter((candidate) => candidate.id !== task.id) : [];
  const lines = [
    `Task: #${task.id} ${task.title}`,
    `Status: ${task.status}; priority: ${task.priority}; due: ${task.dueAt ?? "none"}; completed: ${task.completedAt ?? "no"}`,
    `Notes: ${task.notes ?? "none"}`,
    project ? formatProjectHeader(project) : `Project: #${task.projectId} not found`,
    category ? `Category: #${category.id} ${category.name}` : "Category: unknown",
    project ? `Project memory excerpt:\n${truncate(project.markdown || "No project markdown yet.", 3500)}` : "",
    `Sibling tasks in same project (${siblingTasks.length}, showing highest-signal first):`,
    ...rankTasks(siblingTasks).slice(0, 18).map(formatTask)
  ];

  return {
    context,
    ...storage,
    title: task.title,
    ...buildPromptSections("task", "Focused on one task and its surrounding project context.", lines)
  };
}

export function buildContextualAgentMessage(userMessage: string, resolved: ResolvedConversationContext): string {
  return `${resolved.agentContextBlock}

User message:
${userMessage}`;
}

function buildPromptSections(type: string, description: string, lines: string[]): {
  agentContextBlock: string;
  promptSections: ConversationPromptSections;
} {
  const contextData = ["Context data:", ...lines.filter(Boolean)].join("\n");
  const systemInstructions = [
    "Current d-max conversation context:",
    `Type: ${type}`,
    `Meaning: ${description}`,
    "",
    "Context contract:",
    "- Treat this as the active focus for this turn.",
    "- Context is not an automatic instruction to mutate durable state.",
    "- Durable changes must go through d-max tools and existing confirmation rules.",
    "- If the requested mutation target is ambiguous, ask before creating or changing projects/tasks.",
    "- Use tools to fetch more detail when the current context is not enough."
  ].join("\n");
  const agentContextBlock = [
    "Current d-max conversation context:",
    `Type: ${type}`,
    `Meaning: ${description}`,
    "",
    contextData,
    "",
    "Context contract:",
    "- Treat this as the active focus for this turn.",
    "- Context is not an automatic instruction to mutate durable state.",
    "- Durable changes must go through d-max tools and existing confirmation rules.",
    "- If the requested mutation target is ambiguous, ask before creating or changing projects/tasks.",
    "- Use tools to fetch more detail when the current context is not enough."
  ].join("\n");
  return { agentContextBlock, promptSections: { systemInstructions, contextData } };
}

function formatProjectHeader(project: Project): string {
  return `Project: #${project.id} ${project.name}; status: ${project.status}; summary: ${project.summary ?? "none"}`;
}

function formatTask(task: Task): string {
  return `- #${task.id} [${task.status}, ${task.priority}${task.dueAt ? `, due ${task.dueAt}` : ""}] ${task.title}${task.notes ? ` — ${truncate(task.notes, 180)}` : ""}`;
}

function rankTasks(tasks: Task[]): Task[] {
  const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const statusRank = { blocked: 0, in_progress: 1, open: 2, done: 3, cancelled: 4 };
  return [...tasks].sort((left, right) => {
    const statusDelta = statusRank[left.status] - statusRank[right.status];
    if (statusDelta !== 0) return statusDelta;
    const priorityDelta = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityDelta !== 0) return priorityDelta;
    return (left.dueAt ?? "9999").localeCompare(right.dueAt ?? "9999") || right.updatedAt.localeCompare(left.updatedAt);
  });
}

function firstMarkdownLine(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean) ?? "No summary";
}

function truncate(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength - 15).trimEnd()}\n[truncated]`;
}
