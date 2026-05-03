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
  z.object({ type: z.literal("categories") }),
  z.object({ type: z.literal("ideas") }),
  z.object({ type: z.literal("projects") }),
  z.object({ type: z.literal("habits") }),
  z.object({ type: z.literal("tasks") }),
  z.object({ type: z.literal("initiatives") }),
  z.object({ type: z.literal("category"), categoryId: z.number().int().positive() }),
  z.object({ type: z.literal("idea"), initiativeId: z.number().int().positive() }),
  z.object({ type: z.literal("project"), initiativeId: z.number().int().positive() }),
  z.object({ type: z.literal("habit"), initiativeId: z.number().int().positive() }),
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
  displayContext: string;
  systemInstructions: string;
  contextDataTemplate: string;
  finalPromptTemplate: string;
};

const promptTemplateSpecs: Array<{
  id: string;
  name: string;
  route: string;
  type: ConversationContext["type"];
  displayContext?: string;
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
    route: "/categories",
    type: "categories",
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
    route: "/categories/:categoryName",
    type: "category",
    meaning: "Fokussiert auf einen Lebensbereich, seine Markdown-Beschreibung und zugehoerigen Ideen, Projekten und Gewohnheiten (Initiativen).",
    contextDataLines: [
      "Lebensbereich: #{{category_id}} {{category_name}}",
      "Markdown-Beschreibung:",
      "{{category_description_markdown}}",
      "Ideen in diesem Lebensbereich ({{idea_count}}):",
      "- #{{idea_id}} {{idea_name}}; status: {{idea_status}}",
      "  Markdown:",
      "  {{idea_markdown}}",
      "Projekte in diesem Lebensbereich ({{project_count}}):",
      "- #{{project_id}} {{project_name}}; status: {{project_status}}; Zeitraum: {{project_date_range}}",
      "  Markdown:",
      "  {{project_markdown}}",
      "Gewohnheiten in diesem Lebensbereich ({{habit_count}}):",
      "- #{{habit_id}} {{habit_name}}; status: {{habit_status}}",
      "  Markdown:",
      "  {{habit_markdown}}",
      "Offene Aufgaben in diesem Lebensbereich ({{open_task_count}}, wichtigste zuerst):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "ideas-list",
    name: "Ideen List View",
    route: "/ideas",
    type: "ideas",
    meaning: "Focused on ideas across life areas.",
    contextDataLines: [
      "Ideas grouped by life area ({{idea_count}}):",
      "- #{{initiative_id}} {{initiative_name}}; status: {{initiative_status}}: {{initiative_summary_or_memory}}",
      "Open tasks connected to ideas ({{open_task_count}}, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "ideas-detail",
    name: "Ideen Detail View",
    route: "/initiatives/:id where type=idea",
    type: "idea",
    meaning: "Focused on one idea. Use the initiative markdown as durable idea memory.",
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
    type: "projects",
    meaning: "Focused on projects across life areas.",
    contextDataLines: [
      "Projects grouped by life area ({{project_count}}):",
      "- #{{initiative_id}} {{initiative_name}}; status: {{initiative_status}}; time span: {{date_range}}: {{initiative_summary_or_memory}}",
      "Open tasks connected to projects ({{open_task_count}}, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "projects-detail",
    name: "Projekte Detail View",
    route: "/initiatives/:id where type=project",
    type: "project",
    meaning: "Focused on one project. Use the initiative markdown as durable project memory.",
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
    type: "habits",
    meaning: "Focused on habits across life areas.",
    contextDataLines: [
      "Habits grouped by life area ({{habit_count}}):",
      "- #{{initiative_id}} {{initiative_name}}; status: {{initiative_status}}: {{initiative_summary_or_memory}}",
      "Open tasks connected to habits ({{open_task_count}}, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "habits-detail",
    name: "Gewohnheiten Detail View",
    route: "/initiatives/:id where type=habit",
    type: "habit",
    meaning: "Focused on one habit. Use the initiative markdown as durable habit memory.",
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
    type: "tasks",
    meaning: "Focused on the cross-initiative task execution surface.",
    contextDataLines: [
      "Open tasks across d-max ({{open_task_count}}, showing highest-signal first):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}; initiative: #{{initiative_id}} {{initiative_name}}; category: #{{category_id}} {{category_name}}"
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
      displayContext: spec.displayContext ?? spec.type,
      systemInstructions: sections.promptSections.systemInstructions,
      contextDataTemplate: sections.promptSections.contextData,
      finalPromptTemplate: `${sections.agentContextBlock}\n\nUser message:\n{{user_message}}`
    };
  });
}

export function conversationContextFromStorage(contextType: ConversationContextType, contextEntityId: number | null): ConversationContext {
  switch (contextType) {
    case "global":
    case "categories":
    case "ideas":
    case "projects":
    case "habits":
    case "tasks":
    case "initiatives":
      return { type: contextType };
  }

  if (!contextEntityId) throw new Error(`Stored ${contextType} conversation is missing context_entity_id`);
  if (contextType === "category") return { type: "category", categoryId: contextEntityId };
  if (contextType === "idea" || contextType === "project" || contextType === "habit") {
    return { type: contextType, initiativeId: contextEntityId };
  }
  if (contextType === "initiative") return { type: "initiative", initiativeId: contextEntityId };
  return { type: "task", taskId: contextEntityId };
}

export function storageForConversationContext(context: ConversationContext): {
  contextType: ConversationContextType;
  contextEntityId: number | null;
} {
  switch (context.type) {
    case "global":
    case "categories":
    case "ideas":
    case "projects":
    case "habits":
    case "tasks":
    case "initiatives":
      return { contextType: context.type, contextEntityId: null };
    case "category":
      return { contextType: "category", contextEntityId: context.categoryId };
    case "idea":
    case "project":
    case "habit":
      return { contextType: context.type, contextEntityId: context.initiativeId };
    case "initiative":
      return { contextType: "initiative", contextEntityId: context.initiativeId };
    case "task":
      return { contextType: "task", contextEntityId: context.taskId };
  }
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

  if (context.type === "categories" || context.type === "initiatives") {
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
      title: context.type === "categories" ? "Categories" : "Initiatives",
      ...buildPromptSections(context.type, "Focused on the overall initiatives and life-areas overview.", lines)
    };
  }

  if (context.type === "ideas" || context.type === "projects" || context.type === "habits") {
    const initiativeType = singularCollectionContextType(context.type);
    const categoryList = categories.list();
    const typedInitiatives = initiatives.list().filter((initiative) => initiative.type === initiativeType);
    const initiativeIds = new Set(typedInitiatives.map((initiative) => initiative.id));
    const typedTasks = tasks.list().filter((task) => initiativeIds.has(task.initiativeId) && task.status !== "done" && task.status !== "cancelled");
    const lines = [
      `${formatInitiativeType(initiativeType)}s grouped by life area (${typedInitiatives.length}):`,
      ...categoryList.flatMap((category) => {
        const categoryInitiatives = typedInitiatives.filter((initiative) => initiative.categoryId === category.id);
        if (categoryInitiatives.length === 0) {
          return [];
        }
        return [
          `- #${category.id} ${category.name} (${category.color})`,
          ...categoryInitiatives.map(
            (initiative) =>
              `  - #${initiative.id} ${initiative.name}; status: ${initiative.status}${formatInitiativeDateRange(initiative)}: ${initiative.summary ?? firstMarkdownLine(initiative.markdown)}`
          )
        ];
      }),
      `Open tasks connected to ${context.type} (${typedTasks.length}, showing highest-signal first):`,
      ...rankTasks(typedTasks).slice(0, 25).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: formatCollectionTitle(context.type),
      ...buildPromptSections(context.type, `Focused on ${context.type} across life areas.`, lines)
    };
  }

  if (context.type === "tasks") {
    const allTasks = tasks.list().filter((task) => task.status !== "done" && task.status !== "cancelled");
    const allInitiatives = initiatives.list();
    const allCategories = categories.list();
    const lines = [
      `Open tasks across d-max (${allTasks.length}, showing highest-signal first):`,
      ...rankTasks(allTasks)
        .slice(0, 40)
        .map((task) => {
          const initiative = allInitiatives.find((candidate) => candidate.id === task.initiativeId);
          const category = initiative ? allCategories.find((candidate) => candidate.id === initiative.categoryId) : null;
          return `${formatTask(task)}; initiative: ${
            initiative ? `#${initiative.id} ${initiative.name} [${formatInitiativeType(initiative.type)}]` : `#${task.initiativeId} not found`
          }; category: ${category ? `#${category.id} ${category.name}` : "unknown"}`;
        })
    ];

    return {
      context,
      ...storage,
      title: "Tasks",
      ...buildPromptSections("tasks", "Focused on the cross-initiative task execution surface.", lines)
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
    const categoryIdeas = categoryInitiatives.filter((initiative) => initiative.type === "idea");
    const categoryProjects = categoryInitiatives.filter((initiative) => initiative.type === "project");
    const categoryHabits = categoryInitiatives.filter((initiative) => initiative.type === "habit");
    const lines = [
      `Lebensbereich: #${category.id} ${category.name}`,
      `Markdown-Beschreibung:\n${truncate(category.description || "Noch keine Lebensbereich-Beschreibung vorhanden.", 7000)}`,
      `Ideen in diesem Lebensbereich (${categoryIdeas.length}):`,
      ...categoryIdeas.flatMap(formatInitiativeMarkdownContext),
      `Projekte in diesem Lebensbereich (${categoryProjects.length}):`,
      ...categoryProjects.flatMap(formatInitiativeMarkdownContext),
      `Gewohnheiten in diesem Lebensbereich (${categoryHabits.length}):`,
      ...categoryHabits.flatMap(formatInitiativeMarkdownContext),
      `Offene Aufgaben in diesem Lebensbereich (${categoryTasks.length}, wichtigste zuerst):`,
      ...rankTasks(categoryTasks).slice(0, 25).map(formatTask)
    ];

    return {
      context,
      ...storage,
      title: category.name,
      ...buildPromptSections(
        "category",
        "Fokussiert auf einen Lebensbereich, seine Markdown-Beschreibung und zugehoerigen Ideen, Projekten und Gewohnheiten (Initiativen).",
        lines
      )
    };
  }

  if (context.type === "idea" || context.type === "project" || context.type === "habit" || context.type === "initiative") {
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
      ...buildPromptSections(
        context.type,
        `Focused on one ${formatContextEntityName(context.type)}. Use the initiative markdown as durable ${formatContextEntityName(context.type)} memory.`,
        lines
      )
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
  if (type === "category") {
    return buildGermanCategoryPromptSections(type, description, lines);
  }

  const contextData = ["Context data:", ...lines.filter(Boolean)].join("\n");
  const contextSpecificInstructions = instructionsForContextType(type);
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
    "- Use updateCategory to persist category description changes.",
    ...contextSpecificInstructions
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
    "- Use updateCategory to persist category description changes.",
    ...contextSpecificInstructions
  ].join("\n");
  return { agentContextBlock, promptSections: { systemInstructions, contextData } };
}

function buildGermanCategoryPromptSections(type: string, description: string, lines: string[]): {
  agentContextBlock: string;
  promptSections: ConversationPromptSections;
} {
  const contextData = ["Kontextdaten:", ...lines.filter(Boolean)].join("\n");
  const contextSpecificInstructions = instructionsForContextType(type);
  const sharedInstructions = [
    "Aktueller d-max Conversation Context:",
    `Typ: ${type}`,
    `Bedeutung: ${description}`,
    "",
    "Kontextvertrag:",
    "- Aktiver Fokus fuer diesen Turn; kein automatischer Auftrag zu dauerhaften Aenderungen.",
    "- Dauerhafte Aenderungen nur ueber d-max Tools und bestehende Bestaetigungsregeln.",
    "- Bei mehrdeutigem Aenderungsziel nachfragen, bevor du Initiativen/Aufgaben erstellst oder aenderst.",
    "- Fehlende Details per Tools abrufen.",
    "",
    "Initiative-Typen:",
    "- Typen: idea, project, habit; categoryId ist Pflicht, bei unklarer Zuordnung Inbox nutzen.",
    "- idea = lose Gedanken, Impulse, Moeglichkeiten, Brainstorming; nicht zeitgebunden.",
    "- project = konkrete zielorientierte Arbeit mit Ergebnis; kann startDate/endDate (YYYY-MM-DD) haben.",
    "- habit = laufende Praktik/wiederkehrende Lebens- oder Business-Pflege; meist ohne klares Start-/Enddatum.",
    "- Typwechsel bestehender Initiativen ist eine Lifecycle-Entscheidung: Bestaetigung erforderlich; Wiederholung reicht nicht.",
    "- requiresConfirmation bedeutet: Aenderung wurde nicht angewendet.",
    "",
    "Regeln fuer Lebensbereich-/Category-Beschreibungen:",
    "- Categories sind Lebensbereiche; ihr Markdown-Beschreibungsfeld heisst description.",
    "- Entwickle Category-Beschreibungen iterativ mit strukturierten offenen Fragen.",
    "- Pflichtstruktur: Scope, Aktuelle Situation, Bewertung, Zielbild, Ideen, Gewohnheiten, Projekte, Verbindung zwischen Ist-Zustand und Zielbild.",
    "- updateCategory speichert Aenderungen an der Category-Beschreibung.",
    ...contextSpecificInstructions
  ];
  const systemInstructions = sharedInstructions.join("\n");
  const agentContextBlock = [
    "Aktueller d-max Conversation Context:",
    `Typ: ${type}`,
    `Bedeutung: ${description}`,
    "",
    contextData,
    "",
    ...sharedInstructions.slice(4)
  ].join("\n");
  return { agentContextBlock, promptSections: { systemInstructions, contextData } };
}

function instructionsForContextType(type: string): string[] {
  if (type !== "category") {
    return [];
  }

  return [
    "",
    "Category-Detail-Facilitation-Modus:",
    "- Ziel: Dietrich schrittweise zu einer vollstaendigen, hochwertigen, strukturierten Markdown-Beschreibung fuehren.",
    "- Proaktiv fuehren: offene Fragen, Zusammenfassungen, gezielte Nachfragen; nicht nur reagieren.",
    "- Abschnittsweise arbeiten: Fragengruppe stellen, Antwort spiegeln, Luecken erkennen, naechster Abschnitt.",
    "- Bestehende Beschreibung, Ideen, Projekte, Gewohnheiten und offene Tasks als pruef-/erweiterbares Material nutzen.",
    "- Ideen als Bruecke vom Zielzustand zur Umsetzung durch Gewohnheiten und Projekte nutzen.",
    "",
    "Arbeite auf diese Markdown-Struktur hin:",
    "1. Scope / Abgrenzung: Was gehoert dazu/nicht dazu? Grenzen zu anderen Lebensbereichen?",
    "2. Aktuelle Situation: aktueller Zustand, Erleben, was funktioniert/unklar/vernachlaessigt/ueberladen/energievoll/wichtig ist.",
    "3. Bewertung: Zufriedenheit, optional 1-10; warum nicht niedriger, was wuerde sie erhoehen?",
    "4. Gewuenschter Zielzustand: Idealbild mit Anzeichen, Rhythmen, Standards, Ergebnissen, gefuehlten Qualitaeten.",
    "5. Ideen: vorhandene und moegliche Ideen zum Zielzustand; lose/explorativ/nicht terminiert erlaubt.",
    "6. Gewohnheiten: bestehende und sinnvolle moegliche Gewohnheiten zur Unterstuetzung des Zielzustands.",
    "7. Projekte: laufende, geplante und denkbare Projekte zur Weiterentwicklung des Lebensbereichs.",
    "8. Verbindung zwischen Ist-Zustand und Zielbild: Welche Ideen, Gewohnheiten und Projekte verbinden Ist-Zustand und Zielbild plausibel?",
    "",
    "Arbeitsweise:",
    "- Zuerst pruefen, welche der acht Abschnitte bereits abgedeckt sind; bei duennen Beschreibungen mit Scope/Ist beginnen.",
    "- Verbesserungen bei Bedarf als Idee, Gewohnheit oder Projekt einordnen.",
    "- Genug Material zu kohaerenter Beschreibung verdichten, nicht als lose Notizliste belassen.",
    "",
    "Persistenzverhalten:",
    "- Bei genug Material kompakten, strukturierten Markdown-Entwurf vorschlagen; vor Speicherung zeigen und Bestaetigung einholen.",
    "- Nutze updateCategory erst, nachdem Dietrich der Formulierung zugestimmt hat."
  ];
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

function singularCollectionContextType(type: "ideas" | "projects" | "habits"): Initiative["type"] {
  if (type === "ideas") return "idea";
  if (type === "habits") return "habit";
  return "project";
}

function formatCollectionTitle(type: "ideas" | "projects" | "habits"): string {
  if (type === "ideas") return "Ideas";
  if (type === "habits") return "Habits";
  return "Projects";
}

function formatContextEntityName(type: "idea" | "project" | "habit" | "initiative"): string {
  if (type === "idea") return "idea";
  if (type === "project") return "project";
  if (type === "habit") return "habit";
  return "initiative";
}

function formatInitiativeMarkdownContext(initiative: Initiative): string[] {
  return [
    `- #${initiative.id} ${initiative.name}; status: ${initiative.status}${formatInitiativeDateRange(initiative)}`,
    `  Markdown:\n${indentMultiline(truncate(initiative.markdown || "Noch kein Markdown vorhanden.", 3000), "  ")}`
  ];
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

function indentMultiline(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
