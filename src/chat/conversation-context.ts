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

export type PromptTemplateDefinition = {
  id: string;
  name: string;
  route: string;
  effectiveContext: ConversationContext["type"];
  systemInstructions: string;
  contextDataTemplate: string;
  finalPromptTemplate: string;
};

const promptTemplateSpecs: Array<{
  id: string;
  name: string;
  route: string;
  type: ConversationContext["type"];
  meaning: string;
  contextDataLines: string[];
}> = [
  {
    id: "global",
    name: "Global",
    route: "Global Chat",
    type: "global",
    meaning: "Global d-max chat without a focused UI entity.",
    contextDataLines: [
      "Use the tools to inspect projects or tasks when the user asks for specific state.",
      "Do not assume a project or task target unless the user names one clearly."
    ]
  },
  {
    id: "categories-list",
    name: "Categories List View",
    route: "/lebensbereiche",
    type: "projects",
    meaning: "Focused on the overall projects and life-areas overview.",
    contextDataLines: [
      "Life areas / categories ({{category_count}}):",
      "- #{{category_id}} {{category_name}} ({{category_color}})",
      "  Description markdown: {{category_description_markdown}}",
      "  Initiatives ({{initiative_count}}):",
      "  - #{{project_id}} [{{initiative_type}}] {{initiative_name}}; status: {{initiative_status}}: {{initiative_summary_or_memory}}",
      "Active projects ({{active_project_count}}):",
      "- #{{project_id}} [Project] {{project_name}} ({{date_range}}): {{project_summary_or_memory}}",
      "Open execution surface ({{open_task_count}} tasks, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}; project: #{{project_id}}"
    ]
  },
  {
    id: "category-detail",
    name: "Category Detail View",
    route: "/lebensbereiche/:categoryName",
    type: "category",
    meaning: "Focused on one life area/category, its Markdown description, and its initiatives/tasks.",
    contextDataLines: [
      "Category: #{{category_id}} {{category_name}}",
      "Color: {{category_color}}",
      "Description markdown:",
      "{{category_description_markdown}}",
      "Initiatives in this life area ({{initiative_count}}):",
      "- #{{project_id}} [{{initiative_type}}] {{initiative_name}}; status: {{initiative_status}}: {{initiative_summary_or_memory}}",
      "Open tasks in category ({{open_task_count}}, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "ideas-list",
    name: "Ideen List View",
    route: "/ideas",
    type: "projects",
    meaning: "Focused on the overall projects and life-areas overview.",
    contextDataLines: [
      "Same effective prompt template as Categories List View.",
      "The UI route is type-focused, but OpenClaw receives the broad projects/life-areas context."
    ]
  },
  {
    id: "ideas-detail",
    name: "Ideen Detail View",
    route: "/projects/:id where type=idea",
    type: "project",
    meaning: "Focused on one project. Use the project markdown as durable project memory.",
    contextDataLines: [
      "Project: #{{project_id}} {{project_name}}; type: idea (Idea); status: {{project_status}}; time span: none; summary: {{project_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Project memory markdown:",
      "{{project_markdown}}",
      "Tasks ({{task_count}}, open/high-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "projects-list",
    name: "Projekte List View",
    route: "/projects",
    type: "projects",
    meaning: "Focused on the overall projects and life-areas overview.",
    contextDataLines: [
      "Same effective prompt template as Categories List View.",
      "The UI route is type-focused, but OpenClaw receives the broad projects/life-areas context."
    ]
  },
  {
    id: "projects-detail",
    name: "Projekte Detail View",
    route: "/projects/:id where type=project",
    type: "project",
    meaning: "Focused on one project. Use the project markdown as durable project memory.",
    contextDataLines: [
      "Project: #{{project_id}} {{project_name}}; type: project (Project); status: {{project_status}}; time span: {{startDate}} to {{endDate}}; summary: {{project_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Project memory markdown:",
      "{{project_markdown}}",
      "Tasks ({{task_count}}, open/high-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "habits-list",
    name: "Gewohnheiten List View",
    route: "/habits",
    type: "projects",
    meaning: "Focused on the overall projects and life-areas overview.",
    contextDataLines: [
      "Same effective prompt template as Categories List View.",
      "The UI route is type-focused, but OpenClaw receives the broad projects/life-areas context."
    ]
  },
  {
    id: "habits-detail",
    name: "Gewohnheiten Detail View",
    route: "/projects/:id where type=habit",
    type: "project",
    meaning: "Focused on one project. Use the project markdown as durable project memory.",
    contextDataLines: [
      "Project: #{{project_id}} {{project_name}}; type: habit (Habit); status: {{project_status}}; time span: none; summary: {{project_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Project memory markdown:",
      "{{habit_markdown}}",
      "Tasks ({{task_count}}, open/high-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "tasks-list",
    name: "Tasks List View",
    route: "/tasks",
    type: "global",
    meaning: "Global d-max chat without a focused UI entity.",
    contextDataLines: [
      "Currently the tasks list does not bind a route-specific conversation context.",
      "DMAX falls back to Global Chat and can use tools to inspect tasks/projects when asked."
    ]
  },
  {
    id: "tasks-detail",
    name: "Tasks Detail View",
    route: "/tasks/:id",
    type: "task",
    meaning: "Focused on one task and its surrounding project context.",
    contextDataLines: [
      "Task: #{{task_id}} {{task_title}}",
      "Status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}; completed: {{task_completed_at}}",
      "Notes: {{task_notes}}",
      "Project: #{{project_id}} {{project_name}}; type: {{project_type}}; status: {{project_status}}; time span: {{project_time_span}}; summary: {{project_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Project memory excerpt:",
      "{{project_markdown_excerpt}}",
      "Sibling tasks in same project ({{sibling_task_count}}, showing highest-signal first):",
      "- #{{sibling_task_id}} {{sibling_task_title}}; status: {{sibling_task_status}}; priority: {{sibling_task_priority}}"
    ]
  }
];

export function listPromptTemplates(): PromptTemplateDefinition[] {
  return promptTemplateSpecs.map((spec) => {
    const sections = buildPromptSections(spec.type, spec.meaning, spec.contextDataLines);
    return {
      id: spec.id,
      name: spec.name,
      route: spec.route,
      effectiveContext: spec.type,
      systemInstructions: sections.promptSections.systemInstructions,
      contextDataTemplate: sections.promptSections.contextData,
      finalPromptTemplate: `${sections.agentContextBlock}\n\nUser message:\n{{user_message}}`
    };
  });
}

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
    const allProjects = projects.list();
    const activeProjects = allProjects.filter((project) => project.status === "active");
    const activeTasks = tasks.list().filter((task) => task.status !== "done" && task.status !== "cancelled");
    const lines = [
      `Life areas / categories (${categoryList.length}):`,
      ...categoryList.flatMap((category) => {
        const categoryProjects = allProjects.filter((project) => project.categoryId === category.id);
        return [
          `- #${category.id} ${category.name} (${category.color})`,
          `  Description markdown: ${truncate(category.description || "none", 1200)}`,
          `  Initiatives (${categoryProjects.length}):`,
          ...categoryProjects
            .slice(0, 20)
            .map(
              (project) =>
                `  - #${project.id} [${formatProjectType(project.type)}] ${project.name}; status: ${project.status}${formatProjectDateRange(project)}: ${project.summary ?? firstMarkdownLine(project.markdown)}`
            )
        ];
      }),
      `Active projects (${activeProjects.length}):`,
      ...activeProjects
        .slice(0, 30)
        .map(
          (project) =>
            `- #${project.id} [${formatProjectType(project.type)}] ${project.name}${formatProjectDateRange(project)}: ${project.summary ?? firstMarkdownLine(project.markdown)}`
        ),
      `Open execution surface (${activeTasks.length} tasks, showing highest-signal first):`,
      ...rankTasks(activeTasks).slice(0, 25).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: "Projects",
      ...buildPromptSections("projects", "Focused on the overall projects and life-areas overview.", lines)
    };
  }

  if (context.type === "category") {
    const category = categories.findById(context.categoryId);
    if (!category) {
      throw new Error(`Category not found: ${context.categoryId}`);
    }

    const categoryProjects = projects.list({ categoryId: category.id });
    const projectIds = new Set(categoryProjects.map((project) => project.id));
    const categoryTasks = tasks.list().filter((task) => projectIds.has(task.projectId) && task.status !== "done" && task.status !== "cancelled");
    const lines = [
      `Category: #${category.id} ${category.name}`,
      `Color: ${category.color}`,
      `Description markdown:\n${truncate(category.description || "No life-area description yet.", 7000)}`,
      `Initiatives in this life area (${categoryProjects.length}):`,
      ...categoryProjects.map(
        (project) =>
          `- #${project.id} [${formatProjectType(project.type)}] ${project.name}; status: ${project.status}${formatProjectDateRange(project)}: ${project.summary ?? firstMarkdownLine(project.markdown)}`
      ),
      `Open tasks in category (${categoryTasks.length}, showing highest-signal first):`,
      ...rankTasks(categoryTasks).slice(0, 25).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: category.name,
      ...buildPromptSections("category", "Focused on one life area/category, its Markdown description, and its initiatives/tasks.", lines)
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
      `Category: ${category ? `#${category.id} ${category.name} (${category.color})` : "unknown"}`,
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
    category ? `Category: #${category.id} ${category.name} (${category.color})` : "Category: unknown",
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
    "- Use tools to fetch more detail when the current context is not enough.",
    "",
    "Initiative type guidance:",
    "- The technical object is still Project, but projects have type: idea, project, or habit.",
    "- Use type=idea for loose thoughts, impulses, possibilities, and brainstorming; ideas are not time-bound.",
    "- Use type=project for concrete goal-oriented work with an outcome; projects can have startDate and endDate as YYYY-MM-DD.",
    "- Use type=habit for ongoing practices and recurring life/business care; habits usually have no clear start/end date.",
    "- categoryId is required; use the system Inbox category when category placement is unclear.",
    "- Changing an existing project's type is a lifecycle decision and requires confirmation.",
    "- A repeated request is not explicit confirmation for a lifecycle change.",
    "- A requiresConfirmation tool result means the change was not applied.",
    "",
    "Life area/category description guidance:",
    "- Categories are life areas and have a Markdown description field named description.",
    "- Help Dietrich develop category descriptions iteratively through structured and open questions.",
    "- Useful category description sections: Scope, Aktuelle Situation, Zielbild / Zielzustand, Massnahmen auf hoher Ebene.",
    "- Use updateCategory to persist category description changes."
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
    "- Use tools to fetch more detail when the current context is not enough.",
    "",
    "Initiative type guidance:",
    "- The technical object is still Project, but projects have type: idea, project, or habit.",
    "- Use type=idea for loose thoughts, impulses, possibilities, and brainstorming; ideas are not time-bound.",
    "- Use type=project for concrete goal-oriented work with an outcome; projects can have startDate and endDate as YYYY-MM-DD.",
    "- Use type=habit for ongoing practices and recurring life/business care; habits usually have no clear start/end date.",
    "- categoryId is required; use the system Inbox category when category placement is unclear.",
    "- Changing an existing project's type is a lifecycle decision and requires confirmation.",
    "- A repeated request is not explicit confirmation for a lifecycle change.",
    "- A requiresConfirmation tool result means the change was not applied.",
    "",
    "Life area/category description guidance:",
    "- Categories are life areas and have a Markdown description field named description.",
    "- Help Dietrich develop category descriptions iteratively through structured and open questions.",
    "- Useful category description sections: Scope, Aktuelle Situation, Zielbild / Zielzustand, Massnahmen auf hoher Ebene.",
    "- Use updateCategory to persist category description changes."
  ].join("\n");
  return { agentContextBlock, promptSections: { systemInstructions, contextData } };
}

function formatProjectHeader(project: Project): string {
  return `Project: #${project.id} ${project.name}; type: ${project.type} (${formatProjectType(project.type)}); status: ${project.status}; time span: ${formatProjectDateRangeValue(project)}; summary: ${project.summary ?? "none"}`;
}

function formatProjectDateRange(project: Project): string {
  const value = formatProjectDateRangeValue(project);
  return value === "none" ? "" : ` (${value})`;
}

function formatProjectDateRangeValue(project: Project): string {
  if (project.startDate && project.endDate) {
    return `${project.startDate} to ${project.endDate}`;
  }
  if (project.startDate) {
    return `starts ${project.startDate}`;
  }
  if (project.endDate) {
    return `ends ${project.endDate}`;
  }
  return "none";
}

function formatProjectType(type: Project["type"]): string {
  if (type === "idea") return "Idea";
  if (type === "habit") return "Habit";
  return "Project";
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
