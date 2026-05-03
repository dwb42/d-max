import { z } from "zod";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../repositories/categories.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import type { Initiative } from "../repositories/initiatives.js";
import { TaskRepository } from "../repositories/tasks.js";
import type { Task } from "../repositories/tasks.js";
import type { ConversationContextType } from "../repositories/app-conversations.js";

export const conversationContextSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("global") }),
  z.object({ type: z.literal("initiatives") }),
  z.object({ type: z.literal("category"), categoryId: z.number().int().positive() }),
  z.object({ type: z.literal("initiative"), initiativeId: z.number().int().positive() }),
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
      "Use the tools to inspect initiatives or tasks when the user asks for specific state.",
      "Do not assume an initiative or task target unless the user names one clearly."
    ]
  },
  {
    id: "categories-list",
    name: "Categories List View",
    route: "/lebensbereiche",
    type: "initiatives",
    meaning: "Focused on the overall initiatives and life-areas overview.",
    contextDataLines: [
      "Life areas / categories ({{category_count}}):",
      "- #{{category_id}} {{category_name}} ({{category_color}})",
      "  Description markdown: {{category_description_markdown}}",
      "  Initiatives ({{initiative_count}}):",
      "  - #{{initiative_id}} [{{initiative_type}}] {{initiative_name}}; status: {{initiative_status}}: {{initiative_summary_or_memory}}",
      "Active initiatives ({{active_initiative_count}}):",
      "- #{{initiative_id}} [{{initiative_type}}] {{initiative_name}} ({{date_range}}): {{initiative_summary_or_memory}}",
      "Open execution surface ({{open_task_count}} tasks, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}; initiative: #{{initiative_id}}"
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
      "- #{{initiative_id}} [{{initiative_type}}] {{initiative_name}}; status: {{initiative_status}}: {{initiative_summary_or_memory}}",
      "Open tasks in category ({{open_task_count}}, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "ideas-list",
    name: "Ideen List View",
    route: "/ideas",
    type: "initiatives",
    meaning: "Focused on the overall initiatives and life-areas overview.",
    contextDataLines: [
      "Same effective prompt template as Categories List View.",
      "The UI route is type-focused, but OpenClaw receives the broad initiatives/life-areas context."
    ]
  },
  {
    id: "ideas-detail",
    name: "Ideen Detail View",
    route: "/initiatives/:id where type=idea",
    type: "initiative",
    meaning: "Focused on one initiative. Use the initiative markdown as durable initiative memory.",
    contextDataLines: [
      "Initiative: #{{initiative_id}} {{initiative_name}}; type: idea (Idea); status: {{initiative_status}}; time span: none; summary: {{initiative_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Initiative memory markdown:",
      "{{initiative_markdown}}",
      "Tasks ({{task_count}}, open/high-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "projects-list",
    name: "Projekte List View",
    route: "/projects",
    type: "initiatives",
    meaning: "Focused on the overall initiatives and life-areas overview.",
    contextDataLines: [
      "Same effective prompt template as Categories List View.",
      "The UI route is type-focused, but OpenClaw receives the broad initiatives/life-areas context."
    ]
  },
  {
    id: "projects-detail",
    name: "Projekte Detail View",
    route: "/initiatives/:id where type=project",
    type: "initiative",
    meaning: "Focused on one initiative. Use the initiative markdown as durable initiative memory.",
    contextDataLines: [
      "Initiative: #{{initiative_id}} {{initiative_name}}; type: project (Project); status: {{initiative_status}}; time span: {{startDate}} to {{endDate}}; summary: {{initiative_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Initiative memory markdown:",
      "{{initiative_markdown}}",
      "Tasks ({{task_count}}, open/high-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "habits-list",
    name: "Gewohnheiten List View",
    route: "/habits",
    type: "initiatives",
    meaning: "Focused on the overall initiatives and life-areas overview.",
    contextDataLines: [
      "Same effective prompt template as Categories List View.",
      "The UI route is type-focused, but OpenClaw receives the broad initiatives/life-areas context."
    ]
  },
  {
    id: "habits-detail",
    name: "Gewohnheiten Detail View",
    route: "/initiatives/:id where type=habit",
    type: "initiative",
    meaning: "Focused on one initiative. Use the initiative markdown as durable initiative memory.",
    contextDataLines: [
      "Initiative: #{{initiative_id}} {{initiative_name}}; type: habit (Habit); status: {{initiative_status}}; time span: none; summary: {{initiative_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Initiative memory markdown:",
      "{{initiative_markdown}}",
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
      "DMAX falls back to Global Chat and can use tools to inspect tasks/initiatives when asked."
    ]
  },
  {
    id: "tasks-detail",
    name: "Tasks Detail View",
    route: "/tasks/:id",
    type: "task",
    meaning: "Focused on one task and its surrounding initiative context.",
    contextDataLines: [
      "Task: #{{task_id}} {{task_title}}",
      "Status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}; completed: {{task_completed_at}}",
      "Notes: {{task_notes}}",
      "Initiative: #{{initiative_id}} {{initiative_name}}; type: {{initiative_type}}; status: {{initiative_status}}; time span: {{initiative_time_span}}; summary: {{initiative_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Initiative memory excerpt:",
      "{{initiative_markdown_excerpt}}",
      "Sibling tasks in same initiative ({{sibling_task_count}}, showing highest-signal first):",
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
  if (contextType === "global" || contextType === "initiatives") {
    return { type: contextType };
  }

  if (!contextEntityId) {
    throw new Error(`Stored ${contextType} conversation is missing context_entity_id`);
  }

  if (contextType === "category") return { type: "category", categoryId: contextEntityId };
  if (contextType === "initiative") return { type: "initiative", initiativeId: contextEntityId };
  return { type: "task", taskId: contextEntityId };
}

export function storageForConversationContext(context: ConversationContext): {
  contextType: ConversationContextType;
  contextEntityId: number | null;
} {
  if (context.type === "global" || context.type === "initiatives") {
    return { contextType: context.type, contextEntityId: null };
  }

  if (context.type === "category") return { contextType: "category", contextEntityId: context.categoryId };
  if (context.type === "initiative") return { contextType: "initiative", contextEntityId: context.initiativeId };
  return { contextType: "task", contextEntityId: context.taskId };
}

export function resolveConversationContext(db: Database.Database, input?: ConversationContext | null): ResolvedConversationContext {
  const context = input ?? { type: "global" };
  const storage = storageForConversationContext(context);
  const categories = new CategoryRepository(db);
  const initiatives = new InitiativeRepository(db);
  const tasks = new TaskRepository(db);

  if (context.type === "global") {
    return {
      context,
      ...storage,
      title: "Global Chat",
      ...buildPromptSections("global", "Global d-max chat without a focused UI entity.", [
        "Use the tools to inspect initiatives or tasks when the user asks for specific state.",
        "Do not assume an initiative or task target unless the user names one clearly."
      ])
    };
  }

  if (context.type === "initiatives") {
    const categoryList = categories.list();
    const allInitiatives = initiatives.list();
    const activeInitiatives = allInitiatives.filter((initiative) => initiative.status === "active");
    const activeTasks = tasks.list().filter((task) => task.status !== "done" && task.status !== "cancelled");
    const lines = [
      `Life areas / categories (${categoryList.length}):`,
      ...categoryList.flatMap((category) => {
        const categoryInitiatives = allInitiatives.filter((initiative) => initiative.categoryId === category.id);
        return [
          `- #${category.id} ${category.name} (${category.color})`,
          `  Description markdown: ${truncate(category.description || "none", 1200)}`,
          `  Initiatives (${categoryInitiatives.length}):`,
          ...categoryInitiatives
            .slice(0, 20)
            .map(
              (initiative) =>
                `  - #${initiative.id} [${formatInitiativeType(initiative.type)}] ${initiative.name}; status: ${initiative.status}${formatInitiativeDateRange(initiative)}: ${initiative.summary ?? firstMarkdownLine(initiative.markdown)}`
            )
        ];
      }),
      `Active initiatives (${activeInitiatives.length}):`,
      ...activeInitiatives
        .slice(0, 30)
        .map(
          (initiative) =>
            `- #${initiative.id} [${formatInitiativeType(initiative.type)}] ${initiative.name}${formatInitiativeDateRange(initiative)}: ${initiative.summary ?? firstMarkdownLine(initiative.markdown)}`
        ),
      `Open execution surface (${activeTasks.length} tasks, showing highest-signal first):`,
      ...rankTasks(activeTasks).slice(0, 25).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: "Initiatives",
      ...buildPromptSections("initiatives", "Focused on the overall initiatives and life-areas overview.", lines)
    };
  }

  if (context.type === "category") {
    const category = categories.findById(context.categoryId);
    if (!category) {
      throw new Error(`Category not found: ${context.categoryId}`);
    }

    const categoryInitiatives = initiatives.list({ categoryId: category.id });
    const initiativeIds = new Set(categoryInitiatives.map((initiative) => initiative.id));
    const categoryTasks = tasks.list().filter((task) => initiativeIds.has(task.initiativeId) && task.status !== "done" && task.status !== "cancelled");
    const lines = [
      `Category: #${category.id} ${category.name}`,
      `Color: ${category.color}`,
      `Description markdown:\n${truncate(category.description || "No life-area description yet.", 7000)}`,
      `Initiatives in this life area (${categoryInitiatives.length}):`,
      ...categoryInitiatives.map(
        (initiative) =>
          `- #${initiative.id} [${formatInitiativeType(initiative.type)}] ${initiative.name}; status: ${initiative.status}${formatInitiativeDateRange(initiative)}: ${initiative.summary ?? firstMarkdownLine(initiative.markdown)}`
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

  if (context.type === "initiative") {
    const initiative = initiatives.findById(context.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative not found: ${context.initiativeId}`);
    }

    const category = categories.findById(initiative.categoryId);
    const initiativeTasks = tasks.list({ initiativeId: initiative.id });
    const lines = [
      formatInitiativeHeader(initiative),
      `Category: ${category ? `#${category.id} ${category.name} (${category.color})` : "unknown"}`,
      `Initiative memory markdown:\n${truncate(initiative.markdown || "No initiative markdown yet.", 7000)}`,
      `Tasks (${initiativeTasks.length}, open/high-signal first):`,
      ...rankTasks(initiativeTasks).slice(0, 30).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: initiative.name,
      ...buildPromptSections("initiative", "Focused on one initiative. Use the initiative markdown as durable initiative memory.", lines)
    };
  }

  const task = tasks.findById(context.taskId);
  if (!task) {
    throw new Error(`Task not found: ${context.taskId}`);
  }

  const initiative = initiatives.findById(task.initiativeId);
  const category = initiative ? categories.findById(initiative.categoryId) : null;
  const siblingTasks = initiative ? tasks.list({ initiativeId: initiative.id }).filter((candidate) => candidate.id !== task.id) : [];
  const lines = [
    `Task: #${task.id} ${task.title}`,
    `Status: ${task.status}; priority: ${task.priority}; due: ${task.dueAt ?? "none"}; completed: ${task.completedAt ?? "no"}`,
    `Notes: ${task.notes ?? "none"}`,
    initiative ? formatInitiativeHeader(initiative) : `Initiative: #${task.initiativeId} not found`,
    category ? `Category: #${category.id} ${category.name} (${category.color})` : "Category: unknown",
    initiative ? `Initiative memory excerpt:\n${truncate(initiative.markdown || "No initiative markdown yet.", 3500)}` : "",
    `Sibling tasks in same initiative (${siblingTasks.length}, showing highest-signal first):`,
    ...rankTasks(siblingTasks).slice(0, 18).map(formatTask)
  ];

  return {
    context,
    ...storage,
    title: task.title,
    ...buildPromptSections("task", "Focused on one task and its surrounding initiative context.", lines)
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
    "- If the requested mutation target is ambiguous, ask before creating or changing initiatives/tasks.",
    "- Use tools to fetch more detail when the current context is not enough.",
    "",
    "Initiative type guidance:",
    "- Initiatives have type: idea, project, or habit.",
    "- Use type=idea for loose thoughts, impulses, possibilities, and brainstorming; ideas are not time-bound.",
    "- Use type=project for concrete goal-oriented work with an outcome; initiatives of that type can have startDate and endDate as YYYY-MM-DD.",
    "- Use type=habit for ongoing practices and recurring life/business care; habits usually have no clear start/end date.",
    "- categoryId is required; use the system Inbox category when category placement is unclear.",
    "- Changing an existing initiative's type is a lifecycle decision and requires confirmation.",
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
    "- If the requested mutation target is ambiguous, ask before creating or changing initiatives/tasks.",
    "- Use tools to fetch more detail when the current context is not enough.",
    "",
    "Initiative type guidance:",
    "- Initiatives have type: idea, project, or habit.",
    "- Use type=idea for loose thoughts, impulses, possibilities, and brainstorming; ideas are not time-bound.",
    "- Use type=project for concrete goal-oriented work with an outcome; initiatives of that type can have startDate and endDate as YYYY-MM-DD.",
    "- Use type=habit for ongoing practices and recurring life/business care; habits usually have no clear start/end date.",
    "- categoryId is required; use the system Inbox category when category placement is unclear.",
    "- Changing an existing initiative's type is a lifecycle decision and requires confirmation.",
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

function formatInitiativeHeader(initiative: Initiative): string {
  return `Initiative: #${initiative.id} ${initiative.name}; type: ${initiative.type} (${formatInitiativeType(initiative.type)}); status: ${initiative.status}; time span: ${formatInitiativeDateRangeValue(initiative)}; summary: ${initiative.summary ?? "none"}`;
}

function formatInitiativeDateRange(initiative: Initiative): string {
  const value = formatInitiativeDateRangeValue(initiative);
  return value === "none" ? "" : ` (${value})`;
}

function formatInitiativeDateRangeValue(initiative: Initiative): string {
  if (initiative.startDate && initiative.endDate) {
    return `${initiative.startDate} to ${initiative.endDate}`;
  }
  if (initiative.startDate) {
    return `starts ${initiative.startDate}`;
  }
  if (initiative.endDate) {
    return `ends ${initiative.endDate}`;
  }
  return "none";
}

function formatInitiativeType(type: Initiative["type"]): string {
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
