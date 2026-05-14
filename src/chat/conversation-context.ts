import { z } from "zod";
import type Database from "better-sqlite3";
import { CategoryRepository } from "../repositories/categories.js";
import { InitiativeRelationRepository } from "../repositories/initiative-relations.js";
import type { InitiativeRelationWithInitiatives } from "../repositories/initiative-relations.js";
import { InitiativeRepository } from "../repositories/initiatives.js";
import type { Initiative } from "../repositories/initiatives.js";
import { MediaLinkRepository } from "../repositories/media-links.js";
import type { MediaAttachment } from "../repositories/media-links.js";
import {
  EntityParticipantRepository,
  OrganizationRepository,
  PartyAddressRepository,
  PartyContactPointRepository,
  PartyRelationshipRepository,
  PersonRepository
} from "../repositories/parties.js";
import type { EntityParticipantWithParty, PartyAddress, PartyContactPoint, PartyRelationshipWithParties } from "../repositories/parties.js";
import { TaskChecklistItemRepository } from "../repositories/task-checklist-items.js";
import type { TaskChecklistItem } from "../repositories/task-checklist-items.js";
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
  z.object({ type: z.literal("people") }),
  z.object({ type: z.literal("organizations") }),
  z.object({ type: z.literal("category"), categoryId: z.number().int().positive() }),
  z.object({ type: z.literal("idea"), initiativeId: z.number().int().positive() }),
  z.object({ type: z.literal("project"), initiativeId: z.number().int().positive() }),
  z.object({ type: z.literal("habit"), initiativeId: z.number().int().positive() }),
  z.object({ type: z.literal("initiative"), initiativeId: z.number().int().positive() }),
  z.object({ type: z.literal("task"), taskId: z.number().int().positive() }),
  z.object({ type: z.literal("person"), partyId: z.number().int().positive() }),
  z.object({ type: z.literal("organization"), partyId: z.number().int().positive() })
]);

export type ConversationContext = z.infer<typeof conversationContextSchema>;

export type ResolvedConversationContext = {
  context: ConversationContext;
  contextType: ConversationContextType;
  contextEntityId: number | null;
  title: string;
  agentContextBlock: string;
  promptSections: ConversationPromptSections;
  contextPayload: ConversationContextDebugPayload;
};

export type ConversationPromptSections = {
  systemInstructions: string;
  contextData: string;
};

export type ConversationContextDebugPayload = {
  version: 1;
  context: ConversationContext;
  title: string;
  dataSources: string[];
  current: string[];
  parents: string[];
  children: string[];
  siblings: string[];
  neighbors: string[];
  related: string[];
  limits: string[];
  notes: string[];
  loadedEntities: ContextDebugEntity[];
  omittedEntities: ContextOmittedEntity[];
  blocks: ContextDebugBlock[];
  deduplications: ContextDeduplication[];
  budgets: ContextBudgetSummary[];
};

type ContextEntityRole = "current" | "parent" | "child" | "sibling" | "neighbor" | "related";
type ContextEntityType = "category" | "initiative" | "task" | "relation" | "media" | "participant" | "party" | "unknown";
type ContextOmissionReason = "budget" | "cap" | "duplicate" | "not_relevant" | "missing_data";
type ContextBlockKind =
  | "instructions"
  | "current"
  | "categoryBackground"
  | "initiativeMarkdown"
  | "taskList"
  | "sameCategoryNeighbors"
  | "crossTypeContext"
  | "relations"
  | "planningCanvas"
  | "openExecutionSurface"
  | "media"
  | "participants"
  | "debug"
  | "contextData";

export type ContextDebugEntity = {
  role: ContextEntityRole;
  entityType: ContextEntityType;
  id: string;
  title?: string;
  kind?: string;
  includedFields?: string[];
  emittedChars?: number;
  truncated?: boolean;
};

export type ContextOmittedEntity = {
  role: Exclude<ContextEntityRole, "current" | "parent"> | ContextEntityRole;
  entityType: ContextEntityType;
  id: string;
  title?: string;
  reason: ContextOmissionReason;
  originalChars?: number;
};

export type ContextDebugBlock = {
  id: string;
  kind: ContextBlockKind;
  label: string;
  entityType?: ContextEntityType;
  entityId?: string;
  source?: string;
  originalChars: number;
  emittedChars: number;
  truncated: boolean;
  omitted: boolean;
  reason?: ContextOmissionReason | string;
};

export type ContextDeduplication = {
  sourceBlock: string;
  duplicateOf: string;
  reason: string;
};

export type ContextBudgetSummary = {
  mode: ConversationContext["type"];
  label: string;
  maxChars?: number;
  emittedChars?: number;
  cap?: number;
  used?: number;
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
      "Initiative precedence relations ({{initiative_relation_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}} -> #{{successor_initiative_id}} {{successor_initiative_name}}",
      "Planning canvas: {{placed_initiative_count}} placed initiatives; {{unplaced_initiative_count}} unplaced non-archived initiatives.",
      "Open execution surface summary: {{open_task_count}} open tasks are already represented in per-category task lists; global duplicate task lines omitted."
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
      "- #{{project_id}} {{project_name}}; status: {{project_status}}; Zeitraum: {{project_date_range}}; locked: {{project_timeframe_locked}}",
      "  Markdown:",
      "  {{project_markdown}}",
      "Initiative-Reihenfolge in/mit diesem Lebensbereich ({{initiative_relation_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}} -> #{{successor_initiative_id}} {{successor_initiative_name}}",
      "Gewohnheiten in diesem Lebensbereich ({{habit_count}}):",
      "- #{{habit_id}} {{habit_name}}; status: {{habit_status}}",
      "  Markdown:",
      "  {{habit_markdown}}",
      "Offene Aufgaben in diesem Lebensbereich ({{open_task_count}}, wichtigste zuerst):",
      "- #{{task_id}} {{task_title}}; status: {{task_status}}; priority: {{task_priority}}; due: {{task_due_at}}"
    ]
  },
  {
    id: "initiatives-overview",
    name: "Initiatives Overview",
    route: "/calendar/timeline, /planning-canvas",
    type: "initiatives",
    meaning: "Initiativen-Overview = globaler Alignment-Agent.",
    contextDataLines: [
      "Initiatives overview ({{initiative_count}}):",
      "Life area backgrounds ({{category_count}} categories, shown once):",
      "- #{{category_id}} {{category_name}}: {{category_description_excerpt}}",
      "Initiatives grouped by type and life area:",
      "Ideas:",
      "  #{{category_id}} {{category_name}}:",
      "    - #{{idea_id}} [Idea] {{idea_name}}; status: {{idea_status}}; summary: {{idea_summary_or_memory}}",
      "Projects:",
      "  #{{category_id}} {{category_name}}:",
      "    - #{{project_id}} [Project] {{project_name}}; status: {{project_status}}; time span: {{date_range}}; locked: {{timeframe_locked}}",
      "Habits:",
      "  #{{category_id}} {{category_name}}:",
      "    - #{{habit_id}} [Habit] {{habit_name}}; status: {{habit_status}}; summary: {{habit_summary_or_memory}}",
      "Initiative precedence relations ({{initiative_relation_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}} -> #{{successor_initiative_id}} {{successor_initiative_name}}",
      "Open tasks across initiatives ({{open_task_count}}, showing highest-signal first):",
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
      "Idea precedence relations ({{initiative_relation_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}} -> #{{successor_initiative_id}} {{successor_initiative_name}}",
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
      "Predecessors ({{predecessor_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}}",
      "Successors ({{successor_count}}):",
      "- #{{successor_initiative_id}} {{successor_initiative_name}}",
      "Media attachments ({{media_attachment_count}}):",
      "- #{{media_asset_id}} [{{media_kind}}/{{media_mime_type}}, {{media_byte_size}}] {{media_original_name}}; caption: {{media_caption}}; summary/excerpt: {{media_summary_or_excerpt}}",
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
      "- #{{initiative_id}} {{initiative_name}}; status: {{initiative_status}}; time span: {{date_range}}; locked: {{timeframe_locked}}: {{initiative_summary_or_memory}}",
      "Project precedence relations ({{initiative_relation_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}} -> #{{successor_initiative_id}} {{successor_initiative_name}}",
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
      "Initiative: #{{initiative_id}} {{initiative_name}}; type: project (Project); status: {{initiative_status}}; time span: {{startDate}} to {{endDate}}; locked: {{timeframe_locked}}; summary: {{initiative_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Initiative memory markdown:",
      "{{initiative_markdown}}",
      "Predecessors ({{predecessor_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}}",
      "Successors ({{successor_count}}):",
      "- #{{successor_initiative_id}} {{successor_initiative_name}}",
      "Media attachments ({{media_attachment_count}}):",
      "- #{{media_asset_id}} [{{media_kind}}/{{media_mime_type}}, {{media_byte_size}}] {{media_original_name}}; caption: {{media_caption}}; summary/excerpt: {{media_summary_or_excerpt}}",
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
      "Habit precedence relations ({{initiative_relation_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}} -> #{{successor_initiative_id}} {{successor_initiative_name}}",
      "Life areas without habits ({{category_without_habit_count}}, compact):",
      "- #{{category_id}} {{category_name}}: {{category_description_excerpt}}",
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
      "Predecessors ({{predecessor_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}}",
      "Successors ({{successor_count}}):",
      "- #{{successor_initiative_id}} {{successor_initiative_name}}",
      "Media attachments ({{media_attachment_count}}):",
      "- #{{media_asset_id}} [{{media_kind}}/{{media_mime_type}}, {{media_byte_size}}] {{media_original_name}}; caption: {{media_caption}}; summary/excerpt: {{media_summary_or_excerpt}}",
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
      "Checklist ({{checklist_item_count}}):",
      "- #{{checklist_item_id}} [{{checklist_item_status}}] {{checklist_item_name}}",
      "Notes: {{task_notes}}",
      "Media attachments ({{media_attachment_count}}):",
      "- #{{media_asset_id}} [{{media_kind}}/{{media_mime_type}}, {{media_byte_size}}] {{media_original_name}}; caption: {{media_caption}}; summary/excerpt: {{media_summary_or_excerpt}}",
      "Initiative: #{{initiative_id}} {{initiative_name}}; type: {{initiative_type}}; status: {{initiative_status}}; time span: {{initiative_time_span}}; locked: {{initiative_timeframe_locked}}; summary: {{initiative_summary}}",
      "Category: #{{category_id}} {{category_name}} ({{category_color}})",
      "Initiative memory excerpt:",
      "{{initiative_markdown_excerpt}}",
      "Initiative predecessors ({{predecessor_count}}):",
      "- #{{predecessor_initiative_id}} {{predecessor_initiative_name}}",
      "Initiative successors ({{successor_count}}):",
      "- #{{successor_initiative_id}} {{successor_initiative_name}}",
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
    case "people":
    case "organizations":
      return { type: contextType };
  }

  if (!contextEntityId) throw new Error(`Stored ${contextType} conversation is missing context_entity_id`);
  if (contextType === "category") return { type: "category", categoryId: contextEntityId };
  if (contextType === "idea" || contextType === "project" || contextType === "habit") {
    return { type: contextType, initiativeId: contextEntityId };
  }
  if (contextType === "initiative") return { type: "initiative", initiativeId: contextEntityId };
  if (contextType === "task") return { type: "task", taskId: contextEntityId };
  return { type: contextType, partyId: contextEntityId } as { type: "person"; partyId: number } | { type: "organization"; partyId: number };
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
    case "people":
    case "organizations":
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
    case "person":
    case "organization":
      return { contextType: context.type, contextEntityId: context.partyId };
  }
}

const contextDataBudgets: Partial<Record<ConversationContext["type"], number>> = {
  categories: 15000,
  category: 14000,
  initiatives: 15000,
  ideas: 12000,
  projects: 12000,
  habits: 12000,
  tasks: 10000,
  idea: 10000,
  project: 11000,
  habit: 10000,
  task: 9000
};

const categoryOverviewLimits = {
  categoryMarkdownChars: 1200,
  initiativesPerType: 6,
  tasksPerCategory: 4,
  categoriesWithoutDescription: 20,
  categoriesWithoutInitiatives: 20,
  relationCap: 25
};

const initiativesOverviewLimits = {
  categoryBackgroundChars: 900,
  initiativesPerCategoryType: 14,
  relationCap: 40,
  taskCap: 30
};

const collectionContextLimits = {
  categoryBackgroundChars: 1200,
  crossTypePerType: 5,
  relationCap: 35,
  taskCap: 25,
  lifeAreasWithoutHabits: 12,
  lifeAreaWithoutHabitChars: 500
};

const categoryDetailLimits = {
  categoryMarkdownChars: 6500,
  initiativeContextChars: 8500,
  initiativesPerType: 8,
  initiativeMarkdownChars: 1800,
  relationCap: 30,
  taskCap: 25
};

const detailContextLimits = {
  categoryBackgroundChars: 3000,
  initiativeMarkdownChars: 7000,
  childInitiatives: 12,
  sameCategoryPerType: 8,
  tasks: 30,
  media: 20,
  participants: 20
};

const taskContextLimits = {
  categoryBackgroundChars: 2500,
  initiativeMarkdownChars: 3500,
  childInitiatives: 8,
  sameCategoryPerType: 5,
  siblingTasks: 18,
  siblingChecklistTasks: 8,
  siblingChecklistItems: 5,
  media: 20,
  participants: 20
};

function applyContextDataBudget(
  mode: ConversationContext["type"],
  lines: string[],
  blocks: ContextDebugBlock[],
  budgets: ContextBudgetSummary[]
): string[] {
  const maxChars = contextDataBudgets[mode];
  const nonEmptyLines = lines.filter(Boolean);
  const originalChars = nonEmptyLines.join("\n").length;
  if (!maxChars) {
    blocks.push(createDebugBlock("context-data-total", "contextData", "Context data total", originalChars, originalChars));
    return lines;
  }

  const emitted: string[] = [];
  let emittedChars = 0;
  let truncated = false;
  for (const line of nonEmptyLines) {
    const nextChars = emittedChars + line.length + (emitted.length > 0 ? 1 : 0);
    if (nextChars <= maxChars) {
      emitted.push(line);
      emittedChars = nextChars;
      continue;
    }

    const remaining = maxChars - emittedChars - (emitted.length > 0 ? 1 : 0);
    if (remaining > 160) {
      emitted.push(truncate(line, remaining));
    }
    truncated = true;
    break;
  }

  const finalChars = emitted.join("\n").length;
  blocks.push(createDebugBlock("context-data-total", "contextData", "Context data total", originalChars, finalChars, {
    truncated,
    reason: truncated ? "budget" : undefined
  }));
  budgets.push({ mode, label: "Context data total", maxChars, emittedChars: finalChars });
  return emitted;
}

function createDebugBlock(
  id: string,
  kind: ContextBlockKind,
  label: string,
  originalChars: number,
  emittedChars: number,
  options: {
    entityType?: ContextEntityType;
    entityId?: string;
    source?: string;
    truncated?: boolean;
    omitted?: boolean;
    reason?: ContextOmissionReason | string;
  } = {}
): ContextDebugBlock {
  return {
    id,
    kind,
    label,
    entityType: options.entityType,
    entityId: options.entityId,
    source: options.source,
    originalChars,
    emittedChars,
    truncated: options.truncated ?? originalChars > emittedChars,
    omitted: options.omitted ?? false,
    reason: options.reason
  };
}

function truncateTracked(
  value: string,
  maxLength: number,
  block: {
    id: string;
    kind: ContextBlockKind;
    label: string;
    entityType?: ContextEntityType;
    entityId?: string;
    source?: string;
  },
  blocks: ContextDebugBlock[]
): { text: string; truncated: boolean; originalChars: number; emittedChars: number } {
  const text = truncate(value, maxLength);
  const debugBlock = createDebugBlock(block.id, block.kind, block.label, value.length, text.length, {
    entityType: block.entityType,
    entityId: block.entityId,
    source: block.source,
    truncated: value.length > text.length
  });
  blocks.push(debugBlock);
  return { text, truncated: debugBlock.truncated, originalChars: value.length, emittedChars: text.length };
}

function debugEntity(input: ContextDebugEntity): ContextDebugEntity {
  return input;
}

function omittedEntity(input: ContextOmittedEntity): ContextOmittedEntity {
  return input;
}

function budgetSummary(mode: ConversationContext["type"], label: string, input: { maxChars?: number; emittedChars?: number; cap?: number; used?: number }): ContextBudgetSummary {
  return { mode, label, ...input };
}

function buildResolvedContext(input: {
  context: ConversationContext;
  storage: { contextType: ConversationContextType; contextEntityId: number | null };
  title: string;
  promptType: ConversationContext["type"];
  description: string;
  lines: string[];
  payload: Partial<Omit<ConversationContextDebugPayload, "version" | "context" | "title">>;
}): ResolvedConversationContext {
  const payloadBlocks = [...(input.payload.blocks ?? [])];
  const budgets = [...(input.payload.budgets ?? [])];
  const budgetedLines = applyContextDataBudget(input.promptType, input.lines, payloadBlocks, budgets);
  const sections = buildPromptSections(input.promptType, input.description, budgetedLines);
  return {
    context: input.context,
    ...input.storage,
    title: input.title,
    ...sections,
    contextPayload: {
      version: 1,
      context: input.context,
      title: input.title,
      dataSources: input.payload.dataSources ?? [],
      current: input.payload.current ?? [],
      parents: input.payload.parents ?? [],
      children: input.payload.children ?? [],
      siblings: input.payload.siblings ?? [],
      neighbors: input.payload.neighbors ?? [],
      related: input.payload.related ?? [],
      limits: input.payload.limits ?? [],
      notes: input.payload.notes ?? [],
      loadedEntities: input.payload.loadedEntities ?? [],
      omittedEntities: input.payload.omittedEntities ?? [],
      blocks: payloadBlocks,
      deduplications: input.payload.deduplications ?? [],
      budgets
    }
  };
}

export function resolveConversationContext(db: Database.Database, input?: ConversationContext | null): ResolvedConversationContext {
  const context = input ?? { type: "global" };
  const storage = storageForConversationContext(context);
  const categories = new CategoryRepository(db);
  const initiatives = new InitiativeRepository(db);
  const initiativeRelations = new InitiativeRelationRepository(db);
  const mediaLinks = new MediaLinkRepository(db);
  const people = new PersonRepository(db);
  const organizations = new OrganizationRepository(db);
  const partyRelationships = new PartyRelationshipRepository(db);
  const entityParticipants = new EntityParticipantRepository(db);
  const partyContactPoints = new PartyContactPointRepository(db);
  const partyAddresses = new PartyAddressRepository(db);
  const tasks = new TaskRepository(db);
  const taskChecklistItems = new TaskChecklistItemRepository(db);

  if (context.type === "global") {
    return buildResolvedContext({
      context,
      storage,
      title: "Global Chat",
      promptType: "global",
      description: "Global d-max chat without a focused UI entity.",
      lines: [
        "Use the tools to inspect initiatives or tasks when the user asks for specific state.",
        "Do not assume an initiative or task target unless the user names one clearly."
      ],
      payload: {
        dataSources: ["OpenClaw workspace", "d-max MCP tools"],
        current: ["global app chat"],
        notes: ["No focused UI entity was provided."]
      }
    });
  }

  if (context.type === "categories") {
    const categoryList = categories.list();
    const allInitiatives = initiatives.list();
    const allRelations = initiativeRelations.list({ relationType: "precedes" });
    const activeTasks = tasks.list().filter((task) => task.status !== "done");
    const blocks: ContextDebugBlock[] = [];
    const loadedEntities: ContextDebugEntity[] = [];
    const omittedEntities: ContextOmittedEntity[] = [];
    const deduplications: ContextDeduplication[] = [];
    const budgets: ContextBudgetSummary[] = [
      budgetSummary("categories", "Category markdown per life area", { maxChars: categoryOverviewLimits.categoryMarkdownChars }),
      budgetSummary("categories", "Initiatives per type per category", { cap: categoryOverviewLimits.initiativesPerType }),
      budgetSummary("categories", "Open tasks per category", { cap: categoryOverviewLimits.tasksPerCategory })
    ];
    const lines = [
      `Life areas overview (${categoryList.length} categories):`,
      ...categoryList.flatMap((category) => {
        const categoryInitiatives = allInitiatives.filter((initiative) => initiative.categoryId === category.id);
        const categoryTasks = activeTasks.filter((task) => categoryInitiatives.some((initiative) => initiative.id === task.initiativeId));
        const categoryDescription = truncateTracked(category.description || "none", categoryOverviewLimits.categoryMarkdownChars, {
          id: `category:${category.id}:overview-markdown`,
          kind: "categoryBackground",
          label: `Category overview markdown for ${category.name}`,
          entityType: "category",
          entityId: String(category.id),
          source: "categories.description"
        }, blocks);
        loadedEntities.push(debugEntity({
          role: "current",
          entityType: "category",
          id: String(category.id),
          title: category.name,
          includedFields: ["id", "name", "color", "description"],
          emittedChars: categoryDescription.emittedChars,
          truncated: categoryDescription.truncated
        }));
        const rankedCategoryTasks = rankTasks(categoryTasks);
        rankedCategoryTasks.slice(0, categoryOverviewLimits.tasksPerCategory).forEach((task) => {
          loadedEntities.push(debugEntity({
            role: "child",
            entityType: "task",
            id: String(task.id),
            title: task.title,
            kind: "open",
            includedFields: ["id", "title", "status", "priority", "dueAt", "notes"]
          }));
        });
        rankedCategoryTasks.slice(categoryOverviewLimits.tasksPerCategory).forEach((task) => {
          omittedEntities.push(omittedEntity({
            role: "child",
            entityType: "task",
            id: String(task.id),
            title: task.title,
            reason: "cap"
          }));
        });
        activeTasks
          .filter((task) => categoryInitiatives.some((initiative) => initiative.id === task.initiativeId))
          .forEach((task) => {
            deduplications.push({
              sourceBlock: `categories:global-open-task:${task.id}`,
              duplicateOf: `categories:category-open-task:${category.id}:${task.id}`,
              reason: "Category Overview uses per-category task lists; global execution surface is summarized to avoid duplicate task lines."
            });
          });
        return [
          `- #${category.id} ${category.name} (${category.color})`,
          `  Category markdown excerpt: ${categoryDescription.text}`,
          `  Description status: ${category.description?.trim() ? "described" : "missing description"}`,
          `  Initiative mix: ideas ${countInitiativesByType(categoryInitiatives, "idea")}; projects ${countInitiativesByType(categoryInitiatives, "project")}; habits ${countInitiativesByType(categoryInitiatives, "habit")}`,
          `  Initiatives (${categoryInitiatives.length}, compact by type):`,
          ...formatInitiativesByType(categoryInitiatives, "    ", categoryOverviewLimits.initiativesPerType, {
            role: "child",
            loadedEntities,
            omittedEntities,
            blocks,
            blockPrefix: `category:${category.id}:initiatives`
          }),
          `  Open tasks (${categoryTasks.length}, compact):`,
          ...rankedCategoryTasks.slice(0, categoryOverviewLimits.tasksPerCategory).map((task) => `    ${formatTask(task)}`)
        ];
      }),
      `Categories without description (${categoryList.filter((category) => !category.description?.trim()).length}):`,
      ...categoryList.filter((category) => !category.description?.trim()).slice(0, categoryOverviewLimits.categoriesWithoutDescription).map((category) => `- #${category.id} ${category.name}`),
      `Categories without initiatives (${categoryList.filter((category) => !allInitiatives.some((initiative) => initiative.categoryId === category.id)).length}):`,
      ...categoryList
        .filter((category) => !allInitiatives.some((initiative) => initiative.categoryId === category.id))
        .slice(0, categoryOverviewLimits.categoriesWithoutInitiatives)
        .map((category) => `- #${category.id} ${category.name}`),
      `Initiative precedence relations (${allRelations.length}):`,
      ...allRelations.slice(0, categoryOverviewLimits.relationCap).map(formatInitiativeRelation),
      formatPlanningCanvasSummary(db),
      `Open execution surface summary: ${activeTasks.length} open tasks are already represented in per-category task lists; global duplicate task lines omitted.`
    ];
    allRelations.slice(0, categoryOverviewLimits.relationCap).forEach((relation) => {
      loadedEntities.push(debugEntity({
        role: "neighbor",
        entityType: "relation",
        id: String(relation.id),
        title: `${relation.predecessor.name} -> ${relation.successor.name}`,
        kind: relation.relationType
      }));
    });
    allRelations.slice(categoryOverviewLimits.relationCap).forEach((relation) => {
      omittedEntities.push(omittedEntity({
        role: "neighbor",
        entityType: "relation",
        id: String(relation.id),
        title: `${relation.predecessor.name} -> ${relation.successor.name}`,
        reason: "cap"
      }));
    });
    blocks.push(createDebugBlock(
      "categories:open-execution-surface-summary",
      "openExecutionSurface",
      "Category Overview global open execution surface summary",
      rankTasks(activeTasks).map(formatTask).join("\n").length,
      `Open execution surface summary: ${activeTasks.length} open tasks are already represented in per-category task lists; global duplicate task lines omitted.`.length,
      { truncated: true, reason: "duplicate" }
    ));

    return buildResolvedContext({
      context,
      storage,
      title: "Categories",
      promptType: "categories",
      description: "Category Overview = thematischer globaler Lebensmodell-Agent.",
      lines,
      payload: {
        dataSources: ["categories", "initiatives", "initiative_relations", "planning_canvas_nodes", "tasks"],
        current: [`${categoryList.length} categories`],
        children: [`${allInitiatives.length} initiatives grouped by category`, `${activeTasks.length} open tasks grouped by category`],
        neighbors: [`${allRelations.length} initiative precedence relations`],
        limits: [
          `Category markdown excerpts capped at ${categoryOverviewLimits.categoryMarkdownChars} chars.`,
          `Initiatives per type capped at ${categoryOverviewLimits.initiativesPerType} per category.`,
          `Open tasks per category capped at ${categoryOverviewLimits.tasksPerCategory}; global open task list summarized to avoid duplicates.`
        ],
        loadedEntities,
        omittedEntities,
        blocks,
        deduplications,
        budgets
      }
    });
  }

  if (context.type === "initiatives") {
    const categoryList = categories.list();
    const allInitiatives = initiatives.list();
    const allRelations = initiativeRelations.list({ relationType: "precedes" });
    const activeTasks = tasks.list().filter((task) => task.status !== "done");
    const blocks: ContextDebugBlock[] = [];
    const loadedEntities: ContextDebugEntity[] = [];
    const omittedEntities: ContextOmittedEntity[] = [];
    const deduplications: ContextDeduplication[] = [];
    const budgets: ContextBudgetSummary[] = [
      budgetSummary("initiatives", "Life area background per category", { maxChars: initiativesOverviewLimits.categoryBackgroundChars }),
      budgetSummary("initiatives", "Initiatives per category/type", { cap: initiativesOverviewLimits.initiativesPerCategoryType }),
      budgetSummary("initiatives", "Open tasks", { cap: initiativesOverviewLimits.taskCap })
    ];
    const lifeAreaBackgroundLines = categoryList.map((category) => {
      const background = truncateTracked(category.description || "none", initiativesOverviewLimits.categoryBackgroundChars, {
        id: `initiatives:category:${category.id}:background`,
        kind: "categoryBackground",
        label: `Initiatives overview background for ${category.name}`,
        entityType: "category",
        entityId: String(category.id),
        source: "categories.description"
      }, blocks);
      loadedEntities.push(debugEntity({
        role: "parent",
        entityType: "category",
        id: String(category.id),
        title: category.name,
        includedFields: ["id", "name", "description"],
        emittedChars: background.emittedChars,
        truncated: background.truncated
      }));
      return `- #${category.id} ${category.name}: ${background.text}`;
    });
    const lines = [
      `Initiatives overview (${allInitiatives.length} initiatives):`,
      `Life area backgrounds (${categoryList.length} categories, shown once):`,
      ...lifeAreaBackgroundLines,
      "Initiatives grouped by type and life area:",
      ...(["idea", "project", "habit"] as const).flatMap((type) => {
        const typed = allInitiatives.filter((initiative) => initiative.type === type);
        return [
          `${formatInitiativeType(type)}s (${typed.length}):`,
          ...categoryList.flatMap((category) => {
            const categoryTyped = typed.filter((initiative) => initiative.categoryId === category.id);
            if (categoryTyped.length === 0) return [];
            const shown = categoryTyped.slice(0, initiativesOverviewLimits.initiativesPerCategoryType);
            const omitted = categoryTyped.slice(initiativesOverviewLimits.initiativesPerCategoryType);
            shown.forEach((initiative) => {
              loadedEntities.push(debugEntity({
                role: "current",
                entityType: "initiative",
                id: String(initiative.id),
                title: initiative.name,
                kind: initiative.type,
                includedFields: ["id", "name", "type", "status", "summary", "projectPhase", "dateRange", "parentId"]
              }));
              deduplications.push({
                sourceBlock: `initiatives:${type}:category:${category.id}:background`,
                duplicateOf: `initiatives:category:${category.id}:background`,
                reason: "Typed initiative sections reference the category by id/name only; category markdown is emitted once in Life area backgrounds."
              });
            });
            omitted.forEach((initiative) => {
              omittedEntities.push(omittedEntity({
                role: "current",
                entityType: "initiative",
                id: String(initiative.id),
                title: initiative.name,
                reason: "cap"
              }));
            });
            return [
              `  #${category.id} ${category.name}:`,
              ...shown.map((initiative) => `    ${formatCompactInitiative(initiative)}`),
              ...(omitted.length > 0 ? [`    [${omitted.length} more omitted by cap]`] : [])
            ];
          })
        ];
      }),
      `Initiative precedence relations (${allRelations.length}):`,
      ...allRelations.slice(0, initiativesOverviewLimits.relationCap).map(formatInitiativeRelation),
      formatPlanningCanvasSummary(db),
      `Open tasks across initiatives (${activeTasks.length}, showing highest-signal first):`,
      ...rankTasks(activeTasks).slice(0, initiativesOverviewLimits.taskCap).map(formatTask)
    ];
    allRelations.slice(0, initiativesOverviewLimits.relationCap).forEach((relation) => {
      loadedEntities.push(debugEntity({
        role: "neighbor",
        entityType: "relation",
        id: String(relation.id),
        title: `${relation.predecessor.name} -> ${relation.successor.name}`,
        kind: relation.relationType
      }));
    });
    allRelations.slice(initiativesOverviewLimits.relationCap).forEach((relation) => {
      omittedEntities.push(omittedEntity({
        role: "neighbor",
        entityType: "relation",
        id: String(relation.id),
        title: `${relation.predecessor.name} -> ${relation.successor.name}`,
        reason: "cap"
      }));
    });
    rankTasks(activeTasks).slice(0, initiativesOverviewLimits.taskCap).forEach((task) => {
      loadedEntities.push(debugEntity({
        role: "child",
        entityType: "task",
        id: String(task.id),
        title: task.title,
        kind: "open"
      }));
    });
    rankTasks(activeTasks).slice(initiativesOverviewLimits.taskCap).forEach((task) => {
      omittedEntities.push(omittedEntity({
        role: "child",
        entityType: "task",
        id: String(task.id),
        title: task.title,
        reason: "cap"
      }));
    });

    return buildResolvedContext({
      context,
      storage,
      title: "Initiatives",
      promptType: "initiatives",
      description: "Initiativen-Overview = globaler Alignment-Agent.",
      lines,
      payload: {
        dataSources: ["categories", "initiatives", "initiative_relations", "planning_canvas_nodes", "tasks"],
        current: [`${allInitiatives.length} initiatives`],
        parents: [`${categoryList.length} category backgrounds`],
        children: [`${activeTasks.length} open tasks`],
        neighbors: [`${allRelations.length} initiative precedence relations`],
        limits: [
          `Category background emitted once and capped at ${initiativesOverviewLimits.categoryBackgroundChars} chars per category.`,
          `Typed initiatives per category capped at ${initiativesOverviewLimits.initiativesPerCategoryType}.`,
          `Open tasks capped at ${initiativesOverviewLimits.taskCap}.`
        ],
        loadedEntities,
        omittedEntities,
        blocks,
        deduplications,
        budgets
      }
    });
  }

  if (context.type === "ideas" || context.type === "projects" || context.type === "habits") {
    const initiativeType = singularCollectionContextType(context.type);
    const categoryList = categories.list();
    const allInitiatives = initiatives.list();
    const typedInitiatives = allInitiatives.filter((initiative) => initiative.type === initiativeType);
    const initiativeIds = new Set(typedInitiatives.map((initiative) => initiative.id));
    const typedRelations = initiativeRelations
      .list({ relationType: "precedes" })
      .filter((relation) => initiativeIds.has(relation.predecessorInitiativeId) || initiativeIds.has(relation.successorInitiativeId));
    const typedTasks = tasks.list().filter((task) => initiativeIds.has(task.initiativeId) && task.status !== "done");
    const blocks: ContextDebugBlock[] = [];
    const loadedEntities: ContextDebugEntity[] = [];
    const omittedEntities: ContextOmittedEntity[] = [];
    const budgets: ContextBudgetSummary[] = [
      budgetSummary(context.type, "Category background per listed life area", { maxChars: collectionContextLimits.categoryBackgroundChars }),
      budgetSummary(context.type, "Cross-type initiatives per type/category", { cap: collectionContextLimits.crossTypePerType }),
      budgetSummary(context.type, "Open tasks", { cap: collectionContextLimits.taskCap })
    ];
    const lines = [
      `${formatInitiativeType(initiativeType)}s grouped by life area (${typedInitiatives.length}):`,
      ...categoryList.flatMap((category) => {
        const categoryInitiatives = typedInitiatives.filter((initiative) => initiative.categoryId === category.id);
        const categoryCrossType = allInitiatives.filter((initiative) => initiative.categoryId === category.id && initiative.type !== initiativeType);
        if (categoryInitiatives.length === 0) {
          return [];
        }
        const background = truncateTracked(category.description || "none", collectionContextLimits.categoryBackgroundChars, {
          id: `${context.type}:category:${category.id}:background`,
          kind: "categoryBackground",
          label: `${context.type} list category background for ${category.name}`,
          entityType: "category",
          entityId: String(category.id),
          source: "categories.description"
        }, blocks);
        loadedEntities.push(debugEntity({
          role: "parent",
          entityType: "category",
          id: String(category.id),
          title: category.name,
          includedFields: ["id", "name", "description"],
          emittedChars: background.emittedChars,
          truncated: background.truncated
        }));
        categoryInitiatives.forEach((initiative) => {
          loadedEntities.push(debugEntity({
            role: "current",
            entityType: "initiative",
            id: String(initiative.id),
            title: initiative.name,
            kind: initiative.type,
            includedFields: ["id", "name", "type", "status", "summary", "parentId"]
          }));
        });
        return [
          `- #${category.id} ${category.name} (${category.color})`,
          `  Category background: ${background.text}`,
          ...categoryInitiatives.map(
            (initiative) =>
              `  ${formatCompactInitiative(initiative)}${formatParentSuffix(initiative, allInitiatives)}`
          ),
          `  Cross-type context in this life area (${categoryCrossType.length}):`,
          ...formatInitiativesByType(categoryCrossType, "    ", collectionContextLimits.crossTypePerType, {
            role: "sibling",
            loadedEntities,
            omittedEntities,
            blocks,
            blockPrefix: `${context.type}:category:${category.id}:cross-type`
          })
        ];
      }),
      ...(context.type === "habits"
        ? formatLifeAreasWithoutHabits(categoryList, allInitiatives, blocks, loadedEntities, omittedEntities)
        : []),
      `Initiative precedence relations touching these ${context.type} (${typedRelations.length}):`,
      ...typedRelations.slice(0, collectionContextLimits.relationCap).map(formatInitiativeRelation),
      `Open tasks connected to ${context.type} (${typedTasks.length}, showing highest-signal first):`,
      ...rankTasks(typedTasks).slice(0, collectionContextLimits.taskCap).map(formatTask)
    ];
    typedRelations.slice(0, collectionContextLimits.relationCap).forEach((relation) => {
      loadedEntities.push(debugEntity({ role: "neighbor", entityType: "relation", id: String(relation.id), title: `${relation.predecessor.name} -> ${relation.successor.name}`, kind: relation.relationType }));
    });
    typedRelations.slice(collectionContextLimits.relationCap).forEach((relation) => {
      omittedEntities.push(omittedEntity({ role: "neighbor", entityType: "relation", id: String(relation.id), title: `${relation.predecessor.name} -> ${relation.successor.name}`, reason: "cap" }));
    });
    rankTasks(typedTasks).slice(0, collectionContextLimits.taskCap).forEach((task) => {
      loadedEntities.push(debugEntity({ role: "child", entityType: "task", id: String(task.id), title: task.title, kind: "open" }));
    });
    rankTasks(typedTasks).slice(collectionContextLimits.taskCap).forEach((task) => {
      omittedEntities.push(omittedEntity({ role: "child", entityType: "task", id: String(task.id), title: task.title, reason: "cap" }));
    });

    return buildResolvedContext({
      context,
      storage,
      title: formatCollectionTitle(context.type),
      promptType: context.type,
      description: collectionDescriptionForContext(context.type),
      lines,
      payload: {
        dataSources: ["categories", "initiatives", "initiative_relations", "tasks"],
        current: [`${typedInitiatives.length} ${context.type}`],
        parents: [`${categoryList.length} category backgrounds`],
        children: [`${typedTasks.length} open tasks connected to ${context.type}`],
        siblings: ["Cross-type initiatives in the same categories are included compactly."],
        neighbors: [`${typedRelations.length} precedence relations touching ${context.type}`],
        limits: [
          `Category background capped at ${collectionContextLimits.categoryBackgroundChars} chars.`,
          `Cross-type initiatives capped at ${collectionContextLimits.crossTypePerType} per type per category.`,
          `Open tasks capped at ${collectionContextLimits.taskCap}.`,
          ...(context.type === "habits" ? [`Life areas without habits capped at ${collectionContextLimits.lifeAreasWithoutHabits}.`] : [])
        ],
        loadedEntities,
        omittedEntities,
        blocks,
        budgets
      }
    });
  }

  if (context.type === "tasks") {
    const allTasks = tasks.list().filter((task) => task.status !== "done");
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

    return buildResolvedContext({
      context,
      storage,
      title: "Tasks",
      promptType: "tasks",
      description: "Focused on the cross-initiative task execution surface.",
      lines,
      payload: {
        dataSources: ["tasks", "initiatives", "categories"],
        current: [`${allTasks.length} open tasks`],
        parents: ["Each listed task includes initiative and category references."],
        limits: ["Open tasks capped at 40."]
      }
    });
  }

  if (context.type === "people" || context.type === "organizations") {
    const personList = people.list();
    const organizationList = organizations.list();
    const lines =
      context.type === "people"
        ? [
            `People (${personList.length}):`,
            ...personList.slice(0, 60).map((person) => {
              const contacts = formatContactSummary(partyContactPoints.list({ partyId: person.id }));
              return `- #${person.id} ${person.displayName}; salutation: ${person.salutation}; first: ${person.firstName ?? "none"}; last: ${person.lastName ?? "none"}${contacts}`;
            })
          ]
        : [
            `Organizations (${organizationList.length}):`,
            ...organizationList.slice(0, 60).map((organization) => {
              const contacts = formatContactSummary(partyContactPoints.list({ partyId: organization.id }));
              return `- #${organization.id} ${organization.displayName}; type: ${organization.organizationType ?? "none"}${contacts}`;
            })
          ];

    return buildResolvedContext({
      context,
      storage,
      title: context.type === "people" ? "People" : "Organizations",
      promptType: context.type,
      description: `Focused on d-max ${context.type} and the Who dimension.`,
      lines,
      payload: {
        dataSources: context.type === "people" ? ["people", "party_contact_points"] : ["organizations", "party_contact_points"],
        current: context.type === "people" ? [`${personList.length} people`] : [`${organizationList.length} organizations`],
        limits: ["List capped at 60 parties."]
      }
    });
  }

  if (context.type === "category") {
    const category = categories.findById(context.categoryId);
    if (!category) {
      throw new Error(`Category not found: ${context.categoryId}`);
    }

    const categoryInitiatives = initiatives.list({ categoryId: category.id });
    const initiativeIds = new Set(categoryInitiatives.map((initiative) => initiative.id));
    const categoryTasks = tasks.list().filter((task) => initiativeIds.has(task.initiativeId) && task.status !== "done");
    const categoryRelations = initiativeRelations
      .list({ relationType: "precedes" })
      .filter((relation) => initiativeIds.has(relation.predecessorInitiativeId) || initiativeIds.has(relation.successorInitiativeId));
    const categoryIdeas = categoryInitiatives.filter((initiative) => initiative.type === "idea");
    const categoryProjects = categoryInitiatives.filter((initiative) => initiative.type === "project");
    const categoryHabits = categoryInitiatives.filter((initiative) => initiative.type === "habit");
    const blocks: ContextDebugBlock[] = [];
    const loadedEntities: ContextDebugEntity[] = [];
    const omittedEntities: ContextOmittedEntity[] = [];
    const budgets: ContextBudgetSummary[] = [
      budgetSummary("category", "Category markdown", { maxChars: categoryDetailLimits.categoryMarkdownChars }),
      budgetSummary("category", "Initiative context total", { maxChars: categoryDetailLimits.initiativeContextChars }),
      budgetSummary("category", "Initiatives per type", { cap: categoryDetailLimits.initiativesPerType })
    ];
    const categoryDescription = truncateTracked(category.description || "Noch keine Lebensbereich-Beschreibung vorhanden.", categoryDetailLimits.categoryMarkdownChars, {
      id: `category:${category.id}:detail-markdown`,
      kind: "categoryBackground",
      label: `Category detail markdown for ${category.name}`,
      entityType: "category",
      entityId: String(category.id),
      source: "categories.description"
    }, blocks);
    loadedEntities.push(debugEntity({
      role: "current",
      entityType: "category",
      id: String(category.id),
      title: category.name,
      includedFields: ["id", "name", "description"],
      emittedChars: categoryDescription.emittedChars,
      truncated: categoryDescription.truncated
    }));
    const initiativeSections = formatCategoryDetailInitiativeSections({
      ideas: categoryIdeas,
      projects: categoryProjects,
      habits: categoryHabits,
      tasks: categoryTasks,
      relations: categoryRelations,
      blocks,
      loadedEntities,
      omittedEntities
    });
    const lines = [
      `Lebensbereich: #${category.id} ${category.name}`,
      `Markdown-Beschreibung:\n${categoryDescription.text}`,
      ...initiativeSections.lines,
      `Initiative-Reihenfolge in/mit diesem Lebensbereich (${categoryRelations.length}):`,
      ...categoryRelations.slice(0, categoryDetailLimits.relationCap).map(formatInitiativeRelation),
      `Offene Aufgaben in diesem Lebensbereich (${categoryTasks.length}, wichtigste zuerst):`,
      ...rankTasks(categoryTasks).slice(0, categoryDetailLimits.taskCap).map(formatTask)
    ];
    categoryRelations.slice(0, categoryDetailLimits.relationCap).forEach((relation) => {
      loadedEntities.push(debugEntity({
        role: "neighbor",
        entityType: "relation",
        id: String(relation.id),
        title: `${relation.predecessor.name} -> ${relation.successor.name}`,
        kind: relation.relationType
      }));
    });
    categoryRelations.slice(categoryDetailLimits.relationCap).forEach((relation) => {
      omittedEntities.push(omittedEntity({
        role: "neighbor",
        entityType: "relation",
        id: String(relation.id),
        title: `${relation.predecessor.name} -> ${relation.successor.name}`,
        reason: "cap"
      }));
    });
    rankTasks(categoryTasks).slice(0, categoryDetailLimits.taskCap).forEach((task) => {
      loadedEntities.push(debugEntity({ role: "child", entityType: "task", id: String(task.id), title: task.title, kind: "open" }));
    });
    rankTasks(categoryTasks).slice(categoryDetailLimits.taskCap).forEach((task) => {
      omittedEntities.push(omittedEntity({ role: "child", entityType: "task", id: String(task.id), title: task.title, reason: "cap" }));
    });
    budgets.push(budgetSummary("category", "Initiative context emitted", { maxChars: categoryDetailLimits.initiativeContextChars, emittedChars: initiativeSections.emittedChars }));

    return buildResolvedContext({
      context,
      storage,
      title: category.name,
      promptType: "category",
      description: "Kategorie-Agent = Lebensbereichs-Coach + Alignment-Pruefer.",
      lines,
      payload: {
        dataSources: ["categories", "initiatives", "initiative_relations", "tasks"],
        current: [`category #${category.id} ${category.name}`],
        children: [`${categoryIdeas.length} ideas`, `${categoryProjects.length} projects`, `${categoryHabits.length} habits`, `${categoryTasks.length} open tasks`],
        neighbors: [`${categoryRelations.length} precedence relations touching category initiatives`],
        limits: [
          `Category markdown capped at ${categoryDetailLimits.categoryMarkdownChars} chars.`,
          `Initiative context total capped at ${categoryDetailLimits.initiativeContextChars} chars.`,
          `Initiatives per type capped at ${categoryDetailLimits.initiativesPerType}.`,
          `Initiative markdown capped at ${categoryDetailLimits.initiativeMarkdownChars} chars before total budget.`,
          `Open tasks capped at ${categoryDetailLimits.taskCap}.`,
          `Relations capped at ${categoryDetailLimits.relationCap}.`
        ],
        loadedEntities,
        omittedEntities,
        blocks,
        budgets
      }
    });
  }

  if (context.type === "person" || context.type === "organization") {
    const person = context.type === "person" ? people.findById(context.partyId) : null;
    const organization = context.type === "organization" ? organizations.findById(context.partyId) : null;
    const party = person ?? organization;
    if (!party) {
      throw new Error(`${context.type === "person" ? "Person" : "Organization"} not found: ${context.partyId}`);
    }

    const relationships = partyRelationships.list({ partyId: party.id });
    const participants = entityParticipants.list({ partyId: party.id });
    const contacts = partyContactPoints.list({ partyId: party.id });
    const addresses = partyAddresses.list({ partyId: party.id });
    const header =
      person !== null
        ? `Person: #${person.id} ${person.displayName}; salutation: ${person.salutation}; first: ${person.firstName ?? "none"}; last: ${person.lastName ?? "none"}; title: ${person.academicTitle ?? "none"}`
        : `Organization: #${organization!.id} ${organization!.displayName}; name: ${organization!.name}; legal name: ${organization!.legalName ?? "none"}; type: ${organization!.organizationType ?? "none"}`;
    const lines = [
      header,
      ...(organization ? [`Organization description markdown:\n${truncate(organization.markdown || "No organization description yet.", 3000)}`] : []),
      `Contact points (${contacts.length}):`,
      ...contacts.slice(0, 20).map(formatContactPoint),
      `Postal addresses (${addresses.length}):`,
      ...addresses.slice(0, 20).map(formatPartyAddress),
      `Relationships (${relationships.length}):`,
      ...relationships.slice(0, 30).map((relationship) => formatPartyRelationship(relationship, party.id)),
      `DMAX participations (${participants.length}):`,
      ...participants.slice(0, 30).map(formatEntityParticipant)
    ];

    return buildResolvedContext({
      context,
      storage,
      title: party.displayName,
      promptType: context.type,
      description: `Focused on one ${context.type} in the Who dimension.`,
      lines,
      payload: {
        dataSources: ["people", "organizations", "party_relationships", "entity_participants", "party_contact_points", "party_addresses"],
        current: [`${context.type} #${party.id} ${party.displayName}`],
        children: [`${contacts.length} contact points`, `${addresses.length} postal addresses`, `${participants.length} DMAX participations`],
        neighbors: [`${relationships.length} party relationships`],
        limits: ["Contacts capped at 20.", "Addresses capped at 20.", "Relationships capped at 30.", "Participations capped at 30."]
      }
    });
  }

  if (context.type === "idea" || context.type === "project" || context.type === "habit" || context.type === "initiative") {
    const initiative = initiatives.findById(context.initiativeId);
    if (!initiative) {
      throw new Error(`Initiative not found: ${context.initiativeId}`);
    }

    const category = categories.findById(initiative.categoryId);
    const allInitiatives = initiatives.list();
    const sameCategoryInitiatives = allInitiatives.filter((candidate) => candidate.categoryId === initiative.categoryId && candidate.id !== initiative.id);
    const parentInitiative = initiative.parentId ? allInitiatives.find((candidate) => candidate.id === initiative.parentId) ?? null : null;
    const childInitiatives = allInitiatives.filter((candidate) => candidate.parentId === initiative.id);
    const initiativeTasks = tasks.list({ initiativeId: initiative.id });
    const initiativeMedia = mediaLinks.listForEntity("initiative", initiative.id);
    const initiativeParticipants = entityParticipants.list({ entityType: "initiative", entityId: initiative.id });
    const predecessors = initiativeRelations.getInitiativePredecessors(initiative.id);
    const successors = initiativeRelations.getInitiativeSuccessors(initiative.id);
    const blocks: ContextDebugBlock[] = [];
    const loadedEntities: ContextDebugEntity[] = [
      debugEntity({
        role: "current",
        entityType: "initiative",
        id: String(initiative.id),
        title: initiative.name,
        kind: initiative.type,
        includedFields: ["id", "name", "type", "status", "summary", "markdown", "projectPhase", "dateRange", "parentId"]
      })
    ];
    const omittedEntities: ContextOmittedEntity[] = [];
    const budgets: ContextBudgetSummary[] = [
      budgetSummary(context.type === "initiative" ? initiative.type : context.type, "Category background", { maxChars: detailContextLimits.categoryBackgroundChars }),
      budgetSummary(context.type === "initiative" ? initiative.type : context.type, "Initiative markdown", { maxChars: detailContextLimits.initiativeMarkdownChars }),
      budgetSummary(context.type === "initiative" ? initiative.type : context.type, "Same-category initiatives per type", { cap: detailContextLimits.sameCategoryPerType })
    ];
    const categoryBackground = category
      ? truncateTracked(category.description || "No category description yet.", detailContextLimits.categoryBackgroundChars, {
          id: `initiative:${initiative.id}:category:${category.id}:background`,
          kind: "categoryBackground",
          label: `Category background for ${initiative.name}`,
          entityType: "category",
          entityId: String(category.id),
          source: "categories.description"
        }, blocks)
      : null;
    if (category) {
      loadedEntities.push(debugEntity({
        role: "parent",
        entityType: "category",
        id: String(category.id),
        title: category.name,
        includedFields: ["id", "name", "description"],
        emittedChars: categoryBackground?.emittedChars,
        truncated: categoryBackground?.truncated
      }));
    }
    if (parentInitiative) {
      loadedEntities.push(debugEntity({ role: "parent", entityType: "initiative", id: String(parentInitiative.id), title: parentInitiative.name, kind: parentInitiative.type }));
    }
    const initiativeMarkdown = truncateTracked(initiative.markdown || "No initiative markdown yet.", detailContextLimits.initiativeMarkdownChars, {
      id: `initiative:${initiative.id}:markdown`,
      kind: "initiativeMarkdown",
      label: `Initiative markdown for ${initiative.name}`,
      entityType: "initiative",
      entityId: String(initiative.id),
      source: "initiatives.markdown"
    }, blocks);
    childInitiatives.slice(0, detailContextLimits.childInitiatives).forEach((child) => loadedEntities.push(debugEntity({ role: "child", entityType: "initiative", id: String(child.id), title: child.name, kind: child.type })));
    childInitiatives.slice(detailContextLimits.childInitiatives).forEach((child) => omittedEntities.push(omittedEntity({ role: "child", entityType: "initiative", id: String(child.id), title: child.name, reason: "cap" })));
    initiativeTasks.slice(0, detailContextLimits.tasks).forEach((task) => loadedEntities.push(debugEntity({ role: "child", entityType: "task", id: String(task.id), title: task.title, kind: task.status })));
    initiativeTasks.slice(detailContextLimits.tasks).forEach((task) => omittedEntities.push(omittedEntity({ role: "child", entityType: "task", id: String(task.id), title: task.title, reason: "cap" })));
    initiativeMedia.slice(0, detailContextLimits.media).forEach((attachment) => loadedEntities.push(debugEntity({ role: "child", entityType: "media", id: String(attachment.asset.id), title: attachment.asset.originalName, kind: attachment.asset.kind })));
    initiativeMedia.slice(detailContextLimits.media).forEach((attachment) => omittedEntities.push(omittedEntity({ role: "child", entityType: "media", id: String(attachment.asset.id), title: attachment.asset.originalName, reason: "cap" })));
    initiativeParticipants.slice(0, detailContextLimits.participants).forEach((participant) => loadedEntities.push(debugEntity({ role: "child", entityType: "participant", id: String(participant.id), title: participant.party.displayName, kind: participant.party.type })));
    initiativeParticipants.slice(detailContextLimits.participants).forEach((participant) => omittedEntities.push(omittedEntity({ role: "child", entityType: "participant", id: String(participant.id), title: participant.party.displayName, reason: "cap" })));
    predecessors.forEach((relation) => loadedEntities.push(debugEntity({ role: "neighbor", entityType: "relation", id: String(relation.id), title: `${relation.predecessor.name} -> ${relation.successor.name}`, kind: "predecessor" })));
    successors.forEach((relation) => loadedEntities.push(debugEntity({ role: "neighbor", entityType: "relation", id: String(relation.id), title: `${relation.predecessor.name} -> ${relation.successor.name}`, kind: "successor" })));
    const lines = [
      formatInitiativeHeader(initiative),
      `Category: ${category ? `#${category.id} ${category.name} (${category.color})` : "unknown"}`,
      categoryBackground ? `Category background:\n${categoryBackground.text}` : "",
      `Initiative memory markdown:\n${initiativeMarkdown.text}`,
      `Parent initiative: ${parentInitiative ? formatCompactInitiative(parentInitiative) : "none"}`,
      `Child initiatives (${childInitiatives.length}):`,
      ...childInitiatives.slice(0, detailContextLimits.childInitiatives).map(formatCompactInitiative),
      `Predecessors (${predecessors.length}):`,
      ...predecessors.map((relation) => formatInitiativeRelationEndpoint(relation, "predecessor")),
      `Successors (${successors.length}):`,
      ...successors.map((relation) => formatInitiativeRelationEndpoint(relation, "successor")),
      `Same-category neighborhood (${sameCategoryInitiatives.length} other initiatives):`,
      ...formatInitiativesByType(sameCategoryInitiatives, "", detailContextLimits.sameCategoryPerType, {
        role: "sibling",
        loadedEntities,
        omittedEntities,
        blocks,
        blockPrefix: `initiative:${initiative.id}:same-category`
      }),
      `Media attachments (${initiativeMedia.length}):`,
      ...initiativeMedia.slice(0, detailContextLimits.media).map(formatMediaAttachment),
      `People and organizations (${initiativeParticipants.length}):`,
      ...initiativeParticipants.slice(0, detailContextLimits.participants).map(formatEntityParticipant),
      `Tasks (${initiativeTasks.length}, open/high-signal first):`,
      ...rankTasks(initiativeTasks).slice(0, detailContextLimits.tasks).map(formatTask)
    ];

    return buildResolvedContext({
      context,
      storage,
      title: initiative.name,
      promptType: context.type === "initiative" ? initiative.type : context.type,
      description: detailDescriptionForContext(context.type, initiative.type),
      lines,
      payload: {
        dataSources: ["initiatives", "categories", "initiative_relations", "media_links", "entity_participants", "tasks"],
        current: [`initiative #${initiative.id} ${initiative.name} (${initiative.type})`],
        parents: [
          category ? `category #${category.id} ${category.name}` : "category not found",
          parentInitiative ? `parent initiative #${parentInitiative.id} ${parentInitiative.name}` : "no parent initiative"
        ],
        children: [`${childInitiatives.length} child initiatives`, `${initiativeTasks.length} tasks`, `${initiativeMedia.length} media attachments`, `${initiativeParticipants.length} participants`],
        siblings: [`${sameCategoryInitiatives.length} other initiatives in the same category`],
        neighbors: [`${predecessors.length} predecessors`, `${successors.length} successors`],
        limits: [
          `Category background capped at ${detailContextLimits.categoryBackgroundChars} chars.`,
          `Initiative markdown capped at ${detailContextLimits.initiativeMarkdownChars} chars.`,
          `Child initiatives capped at ${detailContextLimits.childInitiatives}.`,
          `Same-category initiatives capped at ${detailContextLimits.sameCategoryPerType} per type.`,
          `Tasks capped at ${detailContextLimits.tasks}.`,
          `Media and participants capped at ${detailContextLimits.media}/${detailContextLimits.participants}.`
        ],
        loadedEntities,
        omittedEntities,
        blocks,
        budgets
      }
    });
  }

  const task = tasks.findById(context.taskId);
  if (!task) {
    throw new Error(`Task not found: ${context.taskId}`);
  }

  const initiative = initiatives.findById(task.initiativeId);
  const category = initiative ? categories.findById(initiative.categoryId) : null;
  const allInitiatives = initiatives.list();
  const siblingTasks = initiative ? tasks.list({ initiativeId: initiative.id }).filter((candidate) => candidate.id !== task.id) : [];
  const parentInitiative = initiative?.parentId ? allInitiatives.find((candidate) => candidate.id === initiative.parentId) ?? null : null;
  const childInitiatives = initiative ? allInitiatives.filter((candidate) => candidate.parentId === initiative.id) : [];
  const sameCategoryInitiatives = initiative ? allInitiatives.filter((candidate) => candidate.categoryId === initiative.categoryId && candidate.id !== initiative.id) : [];
  const predecessors = initiative ? initiativeRelations.getInitiativePredecessors(initiative.id) : [];
  const successors = initiative ? initiativeRelations.getInitiativeSuccessors(initiative.id) : [];
  const checklistItems = taskChecklistItems.listByTask(task.id);
  const siblingChecklistByTaskId = new Map(
    siblingTasks.slice(0, taskContextLimits.siblingChecklistTasks).map((siblingTask) => [siblingTask.id, taskChecklistItems.listByTask(siblingTask.id).slice(0, taskContextLimits.siblingChecklistItems)])
  );
  const taskMedia = mediaLinks.listForEntity("task", task.id);
  const taskParticipants = entityParticipants.list({ entityType: "task", entityId: task.id });
  const blocks: ContextDebugBlock[] = [];
  const loadedEntities: ContextDebugEntity[] = [
    debugEntity({
      role: "current",
      entityType: "task",
      id: String(task.id),
      title: task.title,
      kind: task.status,
      includedFields: ["id", "title", "status", "priority", "dueAt", "notes", "checklist"]
    })
  ];
  const omittedEntities: ContextOmittedEntity[] = [];
  const budgets: ContextBudgetSummary[] = [
    budgetSummary("task", "Category background", { maxChars: taskContextLimits.categoryBackgroundChars }),
    budgetSummary("task", "Initiative markdown excerpt", { maxChars: taskContextLimits.initiativeMarkdownChars }),
    budgetSummary("task", "Sibling tasks", { cap: taskContextLimits.siblingTasks }),
    budgetSummary("task", "Same-category initiatives per type", { cap: taskContextLimits.sameCategoryPerType })
  ];
  if (initiative) {
    loadedEntities.push(debugEntity({ role: "parent", entityType: "initiative", id: String(initiative.id), title: initiative.name, kind: initiative.type, includedFields: ["id", "name", "type", "status", "summary", "markdown"] }));
  }
  if (category) {
    loadedEntities.push(debugEntity({ role: "parent", entityType: "category", id: String(category.id), title: category.name, includedFields: ["id", "name", "description"] }));
  }
  if (parentInitiative) {
    loadedEntities.push(debugEntity({ role: "parent", entityType: "initiative", id: String(parentInitiative.id), title: parentInitiative.name, kind: parentInitiative.type }));
  }
  const categoryBackground = category
    ? truncateTracked(category.description || "No category description yet.", taskContextLimits.categoryBackgroundChars, {
        id: `task:${task.id}:category:${category.id}:background`,
        kind: "categoryBackground",
        label: `Task category background for ${task.title}`,
        entityType: "category",
        entityId: String(category.id),
        source: "categories.description"
      }, blocks)
    : null;
  const initiativeMarkdown = initiative
    ? truncateTracked(initiative.markdown || "No initiative markdown yet.", taskContextLimits.initiativeMarkdownChars, {
        id: `task:${task.id}:initiative:${initiative.id}:markdown`,
        kind: "initiativeMarkdown",
        label: `Task parent initiative markdown for ${initiative.name}`,
        entityType: "initiative",
        entityId: String(initiative.id),
        source: "initiatives.markdown"
      }, blocks)
    : null;
  checklistItems.forEach((item) => loadedEntities.push(debugEntity({ role: "child", entityType: "unknown", id: String(item.id), title: item.name, kind: "checklist_item" })));
  taskMedia.slice(0, taskContextLimits.media).forEach((attachment) => loadedEntities.push(debugEntity({ role: "child", entityType: "media", id: String(attachment.asset.id), title: attachment.asset.originalName, kind: attachment.asset.kind })));
  taskMedia.slice(taskContextLimits.media).forEach((attachment) => omittedEntities.push(omittedEntity({ role: "child", entityType: "media", id: String(attachment.asset.id), title: attachment.asset.originalName, reason: "cap" })));
  taskParticipants.slice(0, taskContextLimits.participants).forEach((participant) => loadedEntities.push(debugEntity({ role: "child", entityType: "participant", id: String(participant.id), title: participant.party.displayName, kind: participant.party.type })));
  taskParticipants.slice(taskContextLimits.participants).forEach((participant) => omittedEntities.push(omittedEntity({ role: "child", entityType: "participant", id: String(participant.id), title: participant.party.displayName, reason: "cap" })));
  childInitiatives.slice(0, taskContextLimits.childInitiatives).forEach((child) => loadedEntities.push(debugEntity({ role: "sibling", entityType: "initiative", id: String(child.id), title: child.name, kind: child.type })));
  childInitiatives.slice(taskContextLimits.childInitiatives).forEach((child) => omittedEntities.push(omittedEntity({ role: "sibling", entityType: "initiative", id: String(child.id), title: child.name, reason: "cap" })));
  rankTasks(siblingTasks).slice(0, taskContextLimits.siblingTasks).forEach((siblingTask) => loadedEntities.push(debugEntity({ role: "sibling", entityType: "task", id: String(siblingTask.id), title: siblingTask.title, kind: siblingTask.status })));
  rankTasks(siblingTasks).slice(taskContextLimits.siblingTasks).forEach((siblingTask) => omittedEntities.push(omittedEntity({ role: "sibling", entityType: "task", id: String(siblingTask.id), title: siblingTask.title, reason: "cap" })));
  predecessors.forEach((relation) => loadedEntities.push(debugEntity({ role: "neighbor", entityType: "relation", id: String(relation.id), title: `${relation.predecessor.name} -> ${relation.successor.name}`, kind: "predecessor" })));
  successors.forEach((relation) => loadedEntities.push(debugEntity({ role: "neighbor", entityType: "relation", id: String(relation.id), title: `${relation.predecessor.name} -> ${relation.successor.name}`, kind: "successor" })));
  const lines = [
    `Task: #${task.id} ${task.title}`,
    `Status: ${task.status}; priority: ${task.priority}; due: ${task.dueAt ?? "none"}; completed: ${task.completedAt ?? "no"}`,
    `Checklist (${checklistItems.length}):`,
    ...checklistItems.map(formatChecklistItem),
    `Notes: ${task.notes ?? "none"}`,
    `Media attachments (${taskMedia.length}):`,
    ...taskMedia.slice(0, taskContextLimits.media).map(formatMediaAttachment),
    `People and organizations (${taskParticipants.length}):`,
    ...taskParticipants.slice(0, taskContextLimits.participants).map(formatEntityParticipant),
    initiative ? formatInitiativeHeader(initiative) : `Initiative: #${task.initiativeId} not found`,
    category ? `Category: #${category.id} ${category.name} (${category.color})` : "Category: unknown",
    categoryBackground ? `Category background:\n${categoryBackground.text}` : "",
    initiativeMarkdown ? `Initiative memory excerpt:\n${initiativeMarkdown.text}` : "",
    `Parent initiative: ${parentInitiative ? formatCompactInitiative(parentInitiative) : "none"}`,
    `Child initiatives of parent initiative (${childInitiatives.length}):`,
    ...childInitiatives.slice(0, taskContextLimits.childInitiatives).map(formatCompactInitiative),
    `Initiative predecessors (${predecessors.length}):`,
    ...predecessors.map((relation) => formatInitiativeRelationEndpoint(relation, "predecessor")),
    `Initiative successors (${successors.length}):`,
    ...successors.map((relation) => formatInitiativeRelationEndpoint(relation, "successor")),
    `Other initiatives in same category (${sameCategoryInitiatives.length}, compact):`,
    ...formatInitiativesByType(sameCategoryInitiatives, "", taskContextLimits.sameCategoryPerType, {
      role: "sibling",
      loadedEntities,
      omittedEntities,
      blocks,
      blockPrefix: `task:${task.id}:same-category`
    }),
    `Sibling tasks in same initiative (${siblingTasks.length}, showing highest-signal first):`,
    ...rankTasks(siblingTasks).slice(0, taskContextLimits.siblingTasks).flatMap((siblingTask) => formatTaskWithChecklist(siblingTask, siblingChecklistByTaskId.get(siblingTask.id) ?? []))
  ];

  return buildResolvedContext({
    context,
    storage,
    title: task.title,
    promptType: "task",
    description: "Task-Agent = operativer Umsetzer + Taskstruktur-Pruefer.",
    lines,
    payload: {
      dataSources: ["tasks", "task_checklist_items", "initiatives", "categories", "initiative_relations", "media_links", "entity_participants"],
      current: [`task #${task.id} ${task.title}`],
      parents: [
        initiative ? `initiative #${initiative.id} ${initiative.name}` : `initiative #${task.initiativeId} not found`,
        category ? `category #${category.id} ${category.name}` : "category not found",
        parentInitiative ? `parent initiative #${parentInitiative.id} ${parentInitiative.name}` : "no parent initiative"
      ],
      children: [`${checklistItems.length} checklist items`, `${taskMedia.length} media attachments`, `${taskParticipants.length} participants`],
      siblings: [`${siblingTasks.length} sibling tasks`, `${childInitiatives.length} child initiatives of parent initiative`, `${sameCategoryInitiatives.length} other initiatives in same category`],
      neighbors: [`${predecessors.length} initiative predecessors`, `${successors.length} initiative successors`],
      limits: [
        `Category background capped at ${taskContextLimits.categoryBackgroundChars} chars.`,
        `Initiative markdown excerpt capped at ${taskContextLimits.initiativeMarkdownChars} chars.`,
        `Sibling tasks capped at ${taskContextLimits.siblingTasks}.`,
        `Sibling checklist details capped at ${taskContextLimits.siblingChecklistTasks} tasks and ${taskContextLimits.siblingChecklistItems} items each.`,
        `Same-category initiatives capped at ${taskContextLimits.sameCategoryPerType} per type.`
      ],
      loadedEntities,
      omittedEntities,
      blocks,
      budgets
    }
  });
}

export function buildContextualAgentMessage(userMessage: string, resolved: ResolvedConversationContext): string {
  return `${resolved.agentContextBlock}

User message:
${userMessage}`;
}

function buildPromptSections(type: ConversationContext["type"], description: string, lines: string[]): {
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
    ...responsePolicyLines(),
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
    ...responsePolicyLines(),
    ...contextSpecificInstructions
  ].join("\n");
  return { agentContextBlock, promptSections: { systemInstructions, contextData } };
}

function buildGermanCategoryPromptSections(type: ConversationContext["type"], description: string, lines: string[]): {
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
    ...responsePolicyLines(),
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

function responsePolicyLines(): string[] {
  return [
    "",
    "Response policy:",
    "- Beantworte zuerst die konkrete Nutzerfrage; nutze den Kontext aktiv, aber wiederhole ihn nicht unnoetig.",
    "- Benenne relevante Luecken, Unsicherheiten und Annahmen klar; bewerte nicht moralisch.",
    "- Erstelle oder aendere keine Objekte automatisch, ausser Dietrich fordert das ausdruecklich.",
    "- Markiere Vorschlaege als Vorschlaege und unterscheide sie von beobachteten Fakten aus dem Kontext.",
    "- Wenn Klaerung noetig ist, stelle maximal eine gute Frage auf einmal.",
    "- Stelle nicht automatisch am Ende jeder Antwort eine Frage.",
    "- Wenn ein klarer naechster Schritt ausreicht, formuliere diesen als Vorschlag.",
    "- Stelle nur dann eine Rueckfrage, wenn sie fuer den naechsten sinnvollen Schritt wirklich notwendig ist.",
    "- Antworte moeglichst in der Sprache des Nutzers; bei deutscher Nutzerfrage auf Deutsch.",
    "- Gib nicht jedes Mal eine vollstaendige Vollanalyse aus; lieber fokussiert hilfreich antworten.",
    "- Nutze Response-Strukturen als Orientierung, nicht als starres Formular; waehle nur Abschnitte, die zur konkreten Nutzerfrage passen.",
    "- Bei explizitem Ausfuehrungswunsch handle oder unterstuetze konkret, statt nur zu analysieren."
  ];
}

const contextInstructionBuilders: Partial<Record<ConversationContext["type"], () => string[]>> = {
  categories: () => [
    "",
    "Category-Overview-Modus:",
    "- Leitformel: Category Overview = thematischer globaler Lebensmodell-Agent.",
    "- Leitfrage: Sind meine Lebensbereiche gut beschrieben und durch passende Initiativen unterlegt?",
    "- Pruefe, welche Lebensbereiche gut beschrieben sind und welche unscharf bleiben.",
    "- Suche fehlende Bausteine: Scope, Bewertung, Schmerz/Stoerung, Zielbild, gewuenschte Qualitaet und Spannungen.",
    "- Pruefe, ob Lebensbereiche durch passende Ideen, Projekte, Gewohnheiten und Tasks unterlegt sind.",
    "- Erkenne Lebensbereiche mit vielen Initiativen ohne klares Zielbild sowie wichtige Bereiche mit wenig Aufmerksamkeit.",
    "- Benenne moegliche Konflikte oder Spannungen zwischen Lebensbereichen.",
    "",
    "Response Guidance:",
    "- Gehe vom Gesamtbild der Lebensbereiche aus und springe nicht sofort in Taskplanung.",
    "- Geeignete Abschnitte bei Analysefragen: Auffaellige Lebensbereiche, gut beschriebene Bereiche, unklare oder unterdefinierte Bereiche.",
    "- Benenne Spannungen und Konflikte zwischen Lebensbereichen, wenn sie aus dem Kontext erkennbar sind.",
    "- Zeige Luecken zwischen Lebensbereich und Initiativen: Zielbilder oder Schmerzen ohne passende Ideen, Projekte oder Gewohnheiten.",
    "- Schliesse mit einem sinnvollen naechsten Klaerungsschritt, nicht mit einer kompletten Umsetzungsplanung."
  ],
  category: () => [
    "",
    "Category-Detail-Facilitation-Modus:",
    "- Leitformel: Kategorie-Agent = Lebensbereichs-Coach + Alignment-Pruefer.",
    "- Ziel: Dietrich schrittweise zu einer vollstaendigen, hochwertigen, strukturierten Markdown-Beschreibung fuehren.",
    "- Proaktiv fuehren: offene Fragen, Zusammenfassungen, gezielte Nachfragen; nicht nur reagieren.",
    "- Erst den Lebensbereich klaeren, danach Ideen, Projekte, Gewohnheiten und Tasks am Zielbild messen.",
    "- Bestehende Beschreibung, Ideen, Projekte, Gewohnheiten und offene Tasks als pruef-/erweiterbares Material nutzen.",
    "- Pruefe, ob Projekte eigentlich Gewohnheiten sein sollten, ob Ideen reif fuer Projekt/Experiment sind und ob Tasks auf die gewuenschte Qualitaet einzahlen.",
    "",
    "Arbeite auf diese Markdown-Struktur hin:",
    "1. Scope / Abgrenzung: Was gehoert dazu/nicht dazu? Grenzen zu anderen Lebensbereichen?",
    "2. Aktuelle Situation: aktueller Zustand, Erleben, was funktioniert/unklar/vernachlaessigt/ueberladen/energievoll/wichtig ist.",
    "3. Bewertung: Zufriedenheit, optional 1-10; warum nicht niedriger, was wuerde sie erhoehen?",
    "4. Gewuenschter Zielzustand: Idealbild mit Anzeichen, Rhythmen, Standards, Ergebnissen, gefuehlten Qualitaeten.",
    "5. Spannungen, Hindernisse und offene Fragen.",
    "6. Ideen: vorhandene und moegliche Ideen zum Zielzustand; lose/explorativ/nicht terminiert erlaubt.",
    "7. Gewohnheiten: bestehende und sinnvolle moegliche Gewohnheiten zur Unterstuetzung des Zielzustands.",
    "8. Projekte: laufende, geplante und denkbare Projekte zur Weiterentwicklung des Lebensbereichs.",
    "9. Verbindung zwischen Ist-Zustand und Zielbild: Welche Ideen, Gewohnheiten und Projekte verbinden Ist-Zustand und Zielbild plausibel?",
    "",
    "Persistenzverhalten:",
    "- Bei genug Material kompakten, strukturierten Markdown-Entwurf vorschlagen; vor Speicherung zeigen und Bestaetigung einholen.",
    "- Nutze updateCategory erst, nachdem Dietrich der Formulierung zugestimmt hat.",
    "",
    "Response Guidance:",
    "- Klaere zuerst den Lebensbereich selbst, danach die Passung der Initiativen.",
    "- Geeignete Abschnitte bei Analysefragen: Scope, aktueller Zustand, Schmerz/Spannung, Zielbild/gewuenschte Qualitaet.",
    "- Wenn Dietrich den Lebensbereich klaeren, beschreiben oder strukturieren moechte, verwende nach Moeglichkeit explizite Labels: Scope, Aktueller Zustand, Schmerz / Spannung, Zielbild / gewuenschte Qualitaet, Passung der Initiativen, Luecken, naechste gute Frage oder naechster Klaerungsschritt.",
    "- Bei Lebensbereichsklaerungen verwende Schmerz / Spannung moeglichst als eigenes Label, wenn dazu Inhalt vorhanden ist oder eine Luecke sichtbar wird.",
    "- Diese Labels sind Orientierung, kein starres Formular; irrelevante Abschnitte weglassen und die konkrete Frage zuerst beantworten.",
    "- Danach Initiativen-Passung pruefen: Ideen, Projekte, Gewohnheiten und Tasks am Zielbild messen.",
    "- Benenne Luecken, aber schlage bei unscharfer Kategorie nicht vorschnell Projekte vor.",
    "- Schliesse bei Bedarf mit genau einer naechsten guten Frage."
  ],
  initiatives: () => [
    "",
    "Initiativen-Overview-Modus:",
    "- Leitformel: Initiativen-Overview = globaler Alignment-Agent.",
    "- Leitfrage: Passen meine Initiativen zu meinen Lebensbereichen?",
    "- Pruefe von den Initiativen aus, ob Ideen, Projekte und Gewohnheiten zu den Lebensbereichsbeschreibungen passen.",
    "- Suche Diskrepanzen zwischen deklarierter Bedeutung, Kategorie-Schmerz/Zielbild und tatsaechlicher Initiative-/Task-Aufmerksamkeit.",
    "- Erkenne Lebensbereiche mit Schmerz, aber ohne passende Initiative.",
    "- Benenne Initiativen, die nicht auf das Zielbild einzahlen, sowie Uebergewichtungen, Ablenkungen oder alte Muster.",
    "- Pruefe, wo Ideen, Projekte oder Gewohnheiten fehlen.",
    "",
    "Response Guidance:",
    "- Gleiche Initiativen gegen Lebensbereichsbeschreibungen ab; urteile immer relativ zu beschriebenen Prioritaeten.",
    "- Geeignete Abschnitte bei Analysefragen: stimmige Initiativen, Diskrepanzen, unterversorgte Lebensbereiche.",
    "- Benenne Uebergewichtungen oder moegliche Ausweichbewegungen nur mit Kontextbezug, nicht pauschal.",
    "- Schlage moegliche neue Ideen, Projekte oder Gewohnheiten vor, wenn sie erkennbare Luecken schliessen.",
    "- Schliesse mit einem empfohlenen Fokusbereich oder einer klaren Fokusfrage."
  ],
  ideas: () => [
    "",
    "Ideenlisten-Modus:",
    "- Leitformel: Ideenliste = kreativer Portfolio-Sparringraum.",
    "- Erst oeffnen, dann verdichten: Ideen nicht zu frueh nach Umsetzbarkeit bewerten.",
    "- Erkenne Muster, Cluster, Motive, Hypothesen und angrenzende Moeglichkeitsraeume zwischen Ideen.",
    "- Verbinde Ideen mit bestehenden Projekten, Gewohnheiten und Lebensbereichs-Zielbildern.",
    "- Markiere Ideen, die reif fuer Projekt, Gewohnheit, Experiment oder Recherche-Task sein koennten.",
    "- Schlage komplementaere, nachfolgende oder angrenzende Ideen und Recherchefelder vor.",
    "",
    "Response Guidance:",
    "- Leiste kreative Mustererkennung, bevor du operativ bewertest.",
    "- Geeignete Abschnitte bei Analysefragen: Ideencluster, wiederkehrende Motive, Verbindungen zu Projekten und Gewohnheiten.",
    "- Beschreibe Reifegrade: offen, reif fuer Experiment, reif fuer Projekt oder reif fuer Gewohnheit.",
    "- Benenne angrenzende Ideen und gute naechste Explorationen.",
    "- Nicht zu frueh operationalisieren; keine Taskliste ausgeben, wenn Dietrich nur Muster oder Exploration fragt."
  ],
  projects: () => [
    "",
    "Projektlisten-Modus:",
    "- Leitformel: Projektliste = Projektportfolio- und Aufmerksamkeits-Agent.",
    "- Erkenne Projekte mit Aufmerksamkeitsbedarf, unklarem Scope, fehlender Definition of Done oder schwacher Taskstruktur.",
    "- Pruefe Blocker, Abhaengigkeiten, Reihenfolgen, Zeitraeume, Projektphase und Lock-Status.",
    "- Bewerte Projekte im Verhaeltnis zu Lebensbereichen, Ideen, Gewohnheiten und offenen Tasks.",
    "- Benenne Projekte, die zu gross sind, zerlegt werden sollten oder nicht klar auf ein Ergebnis einzahlen.",
    "",
    "Response Guidance:",
    "- Pruefe Projektportfolio und Aufmerksamkeit; priorisiere nicht nur, sondern begruende warum.",
    "- Geeignete Abschnitte bei Analysefragen: Projekte mit akutem Aufmerksamkeitsbedarf, Scope- oder Ziel-Unklarheiten, Task-Luecken.",
    "- Benenne Blocker, Abhaengigkeiten und zeitliche Relevanz, wenn sie aus Kontextdaten ableitbar sind.",
    "- Schliesse mit einer naechsten Projektentscheidung, die am meisten Klarheit schafft."
  ],
  habits: () => [
    "",
    "Gewohnheitenlisten-Modus:",
    "- Leitformel: Gewohnheitenliste = Qualitaets- und Pflege-Portfolio-Agent.",
    "- Erkenne gepflegte und ungepflegte Qualitaeten ueber Lebensbereiche hinweg.",
    "- Suche Gewohnheiten ohne klare Pflegehandlungen, fehlende Frequenzen oder zu grosse/unrealistische Zuschnitte.",
    "- Pruefe Lebensbereiche mit gewuenschter Qualitaet, aber ohne passende Gewohnheit.",
    "- Erkenne Ideen oder Projekte, die eigentlich als Gewohnheit gepflegt werden sollten.",
    "- Arbeite nur mit vorhandenem Markdown und Tasks; setze kein eigenes Habit-Frequency-Datenmodell voraus.",
    "",
    "Response Guidance:",
    "- Betrachte Gewohnheiten als Pflege gewuenschter Qualitaeten, nicht als Projekte mit Enddatum.",
    "- Geeignete Abschnitte bei Analysefragen: gepflegte Qualitaeten, ungepflegte Qualitaeten, unscharfe Gewohnheiten.",
    "- Benenne zu grosse oder unrealistische Gewohnheiten und schlage kleinere Minimalversionen vor.",
    "- Zeige fehlende Pflegehandlungen und naechste Pflegeimpulse auf."
  ],
  idea: () => [
    "",
    "Ideen-Detail-Modus:",
    "- Leitformel: Ideen-Agent = kreativer Sparringspartner fuer Moeglichkeitsraeume.",
    "- Eine Idee ist noch kein Projekt und keine Aufgabe; behandle sie zuerst als offenen Moeglichkeitsraum.",
    "- Oeffne Motivation, Hypothesen, Varianten, Analogien, Vergleichsbeispiele und angrenzende Moeglichkeiten.",
    "- Nutze Kategorie-Hintergrund, Nachbarschaft und Relations, um verwandte Projekte/Gewohnheiten/Ideen zu erkennen.",
    "- Verdichte erst spaeter zu moeglichen Projekten, Gewohnheiten, Experimenten oder Recherche-Tasks.",
    "- Nicht zu frueh operationalisieren; keine Projektmanager-Sprache verwenden, solange der Moeglichkeitsraum noch unklar ist.",
    "",
    "Response Guidance:",
    "- Behandle die Idee als Moeglichkeitsraum und oeffne zuerst Motivation, Sehnsucht, Beobachtung oder Hypothese.",
    "- Geeignete Abschnitte bei Explorationsfragen: was an der Idee zieht, moegliche Richtungen, Analogien und Vergleichsfelder.",
    "- Benenne Hypothesen, Recherche- und Inputfelder sowie externe Perspektiven.",
    "- Verdichte auf zwei bis drei starke Richtungen, wenn genug Material vorhanden ist.",
    "- Bei normalen Explorationsfragen antworte konzentriert: insgesamt etwa 5-7 priorisierte Punkte ueber Varianten, Hypothesen, Recherchefelder und moegliche Verdichtungen hinweg.",
    "- Nicht 3-5 Punkte pro Untergruppe ausgeben; waehle die staerksten Punkte aus, statt alle Kategorien vollstaendig zu fuellen.",
    "- Nutze maximal 3-4 kurze Abschnitte fuer eine normale freie Exploration.",
    "- Weitere Breite, lange Listen und vollstaendige Variantenraeume nur anbieten, wenn Dietrich ausdruecklich nach maximaler Breite, vollstaendiger Analyse oder vielen Optionen fragt.",
    "- Wenn die Nutzerfrage nach freier Exploration klingt, liefere eine gute erste Verdichtung, nicht die vollstaendige Landkarte.",
    "- Kleine Experimente duerfen Erkenntnis bringen; Tasks nur vorschlagen, wenn Dietrich das fordert oder die Idee bereits klar genug verdichtet ist."
  ],
  project: () => [
    "",
    "Projekt-Detail-Modus:",
    "- Leitformel: Projekt-Agent = Scope-Klaerer + Umsetzungsarchitekt.",
    "- Ein Projekt soll ein konkretes Ergebnis herbeifuehren; klaere zuerst Motivation, Lebensbereich, Ziel und gewuenschtes Ergebnis.",
    "- Pruefe Definition of Done, Scope, Nicht-Scope, Zeitraum, Meilensteine, Abhaengigkeiten, Risiken, Blocker und offene Fragen.",
    "- Beruecksichtige relevante Personen/Organisationen, Parent-/Child-Initiativen, Predecessors/Successors und Same-Category-Nachbarschaft.",
    "- Wenn Scope ausreichend klar ist, pruefe Tasks: Zuschnitt, Zielbezug, Luecken, Dopplungen, Reihenfolge, Blocker und Entscheidungstasks.",
    "- Erkenne, ob einzelne Tasks eigentlich Teilprojekte sind.",
    "",
    "Response Guidance:",
    "- Klaere zuerst Motivation, Ziel und gewuenschtes Ergebnis.",
    "- Geeignete Abschnitte bei Analysefragen: Motivation, Ziel/gewuenchtes Ergebnis, Scope/Nicht-Scope, Definition of Done.",
    "- Pruefe Zeitraum, Meilensteine, Risiken, Blocker und Abhaengigkeiten, wenn entsprechende Daten vorhanden sind.",
    "- Erst danach Taskstruktur pruefen: Vollstaendigkeit, Zuschnitt, Sequenz, Dopplungen und fehlende Entscheidungstasks.",
    "- Wenn Ziel, Scope oder Definition of Done noch unscharf sind, klaere zuerst diese Projektdefinition.",
    "- Schlage in diesem Fall hoechstens die 3 wichtigsten Taskstruktur-Luecken oder naechsten Klaerungsschritte vor.",
    "- Erzeuge keine umfangreichen Tasklisten, solange Definition of Done, Scope oder zentrale Abhaengigkeiten unklar sind.",
    "- Umfangreiche Tasklisten, Arbeitsbloecke oder detaillierte Sequenzierungen nur ausgeben, wenn Dietrich ausdruecklich danach fragt oder das Projekt bereits klar definiert ist."
  ],
  habit: () => [
    "",
    "Gewohnheiten-Detail-Modus:",
    "- Leitformel: Gewohnheiten-Agent = Qualitaetscoach + Pflegehandlungs-Strukturierer.",
    "- Eine Gewohnheit fuehrt kein einmaliges Ergebnis herbei, sondern pflegt langfristig eine gewuenschte Qualitaet.",
    "- Klaere gewuenschte Qualitaet, Lebensbereich, Motivation, aktuelles Niveau und Zielniveau.",
    "- Leite Pflegehandlungen, Minimalversionen, Hindernisse und moegliche wiederkehrende Tasks/Erinnerungen aus Markdown und Tasks ab.",
    "- Reflektiere Frequenzen als Text-/Task-Logik, ohne ein neues Frequency-Datenmodell vorauszusetzen.",
    "- Behandle Habits nicht wie Projekte mit Definition of Done oder echtem Enddatum.",
    "",
    "Response Guidance:",
    "- Strukturiere die gewuenschte Qualitaet, nicht ein einmaliges Projektergebnis.",
    "- Geeignete Abschnitte bei Analysefragen: gewuenschte Qualitaet, Bedeutung, aktueller Zustand, Zielniveau.",
    "- Leite Pflegehandlungen und Frequenzen aus vorhandenem Markdown und Tasks ab, ohne ein neues Schema zu behaupten.",
    "- Benenne Minimalversionen fuer wenig Energie/Zeit und typische Hindernisse.",
    "- Schliesse mit einem naechsten Pflegeimpuls."
  ],
  task: () => [
    "",
    "Task-Detail-Modus:",
    "- Leitformel: Task-Agent = operativer Umsetzer + Taskstruktur-Pruefer.",
    "- Pruefe, ob die Aufgabe klar formuliert ist und ein eindeutiges Outcome hat.",
    "- Erkenne, ob sie zu gross ist, mehrere Aufgaben enthaelt oder besser gesplittet werden sollte.",
    "- Pruefe, ob sie sinnvoll zur uebergeordneten Initiative und zum Lebensbereich passt.",
    "- Beruecksichtige sibling tasks, Parent-/Child-Initiativen, Same-Category-Nachbarschaft und Relations.",
    "- Suche Ueberschneidungen, Dopplungen, Konflikte und bessere Reihenfolgen.",
    "- Pruefe, ob du die Aufgabe mit vorhandenen Tools selbst unterstuetzen oder ausfuehren kannst; sonst bessere Formulierungen oder Splits vorschlagen.",
    "",
    "Response Guidance:",
    "- Antworte operativ und knapp; keine grosse Lebensanalyse, ausser sie ist fuer die Aufgabe noetig.",
    "- Geeignete Abschnitte bei Analysefragen: Task-Klarheit, gewuenschtes Outcome, Schnitt/Splitting, Kontextpassung.",
    "- Nutze sibling tasks fuer Nachbarschaft: Ueberschneidungen, Dopplungen, Konflikte und bessere Reihenfolgen.",
    "- Benenne den einfachsten sinnvollen Loesungsweg und ob du selbst mit Tools unterstuetzen kannst.",
    "- Schlage Folgeaufgaben nur vor, wenn sie aus Klarheit, Splitting oder Ausfuehrung wirklich folgen."
  ]
};

function instructionsForContextType(type: ConversationContext["type"]): string[] {
  return contextInstructionBuilders[type]?.() ?? [];
}

function formatInitiativeHeader(initiative: Initiative): string {
  return `Initiative: #${initiative.id} ${initiative.name}; type: ${initiative.type} (${formatInitiativeType(initiative.type)}); status: ${initiative.status}; project phase: ${initiative.type === "project" ? initiative.projectPhase : "n/a"}; time span: ${formatInitiativeDateRangeValue(initiative)}; timeframe locked: ${formatInitiativeLockedValue(initiative)}; summary: ${initiative.summary ?? "none"}`;
}

function formatInitiativeProjectPhase(initiative: Initiative): string {
  return initiative.type === "project" ? `; phase: ${initiative.projectPhase}; timeframe locked: ${formatInitiativeLockedValue(initiative)}` : "";
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

function formatInitiativeLockedValue(initiative: Initiative): string {
  return initiative.type === "project" ? (initiative.isLocked ? "yes" : "no") : "n/a";
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

function collectionDescriptionForContext(type: "ideas" | "projects" | "habits"): string {
  if (type === "ideas") return "Ideenliste = kreativer Portfolio-Sparringraum.";
  if (type === "habits") return "Gewohnheitenliste = Qualitaets- und Pflege-Portfolio-Agent.";
  return "Projektliste = Projektportfolio- und Aufmerksamkeits-Agent.";
}

function detailDescriptionForContext(contextType: "idea" | "project" | "habit" | "initiative", initiativeType: Initiative["type"]): string {
  const type = contextType === "initiative" ? initiativeType : contextType;
  if (type === "idea") return "Ideen-Agent = kreativer Sparringspartner fuer Moeglichkeitsraeume.";
  if (type === "habit") return "Gewohnheiten-Agent = Qualitaetscoach + Pflegehandlungs-Strukturierer.";
  return "Projekt-Agent = Scope-Klaerer + Umsetzungsarchitekt.";
}

function countInitiativesByType(initiatives: Initiative[], type: Initiative["type"]): number {
  return initiatives.filter((initiative) => initiative.type === type).length;
}

function formatCompactInitiative(initiative: Initiative): string {
  return `- #${initiative.id} [${formatInitiativeType(initiative.type)}] ${initiative.name}; status: ${initiative.status}${formatInitiativeProjectPhase(initiative)}${formatInitiativeDateRange(initiative)}; summary: ${truncate(firstMarkdownLine(initiative.summary ?? initiative.markdown ?? ""), 180)}`;
}

function formatParentSuffix(initiative: Initiative, allInitiatives: Initiative[]): string {
  if (!initiative.parentId) {
    return "";
  }
  const parent = allInitiatives.find((candidate) => candidate.id === initiative.parentId);
  return parent ? `; parent: #${parent.id} ${parent.name}` : `; parent: #${initiative.parentId} not found`;
}

function formatInitiativesByType(
  initiatives: Initiative[],
  indent: string,
  limitPerType: number,
  debug?: {
    role: ContextEntityRole;
    loadedEntities: ContextDebugEntity[];
    omittedEntities: ContextOmittedEntity[];
    blocks: ContextDebugBlock[];
    blockPrefix: string;
  }
): string[] {
  if (initiatives.length === 0) {
    return [`${indent}none`];
  }

  return (["idea", "project", "habit"] as const).flatMap((type) => {
    const typed = initiatives.filter((initiative) => initiative.type === type);
    if (typed.length === 0) {
      return [];
    }
    const shown = typed.slice(0, limitPerType);
    const omitted = typed.slice(limitPerType);
    debug?.blocks.push(createDebugBlock(
      `${debug.blockPrefix}:${type}`,
      debug.role === "sibling" ? "sameCategoryNeighbors" : "crossTypeContext",
      `${formatInitiativeType(type)} compact initiatives`,
      typed.map(formatCompactInitiative).join("\n").length,
      shown.map(formatCompactInitiative).join("\n").length,
      { truncated: omitted.length > 0, reason: omitted.length > 0 ? "cap" : undefined }
    ));
    shown.forEach((initiative) => {
      debug?.loadedEntities.push(debugEntity({
        role: debug.role,
        entityType: "initiative",
        id: String(initiative.id),
        title: initiative.name,
        kind: initiative.type,
        includedFields: ["id", "name", "type", "status", "summary", "projectPhase", "dateRange"]
      }));
    });
    omitted.forEach((initiative) => {
      debug?.omittedEntities.push(omittedEntity({
        role: debug.role,
        entityType: "initiative",
        id: String(initiative.id),
        title: initiative.name,
        reason: "cap"
      }));
    });
    return [
      `${indent}${formatInitiativeType(type)}s (${typed.length}):`,
      ...shown.map((initiative) => `${indent}  ${formatCompactInitiative(initiative)}`),
      ...(omitted.length > 0 ? [`${indent}  [${omitted.length} more omitted by cap]`] : [])
    ];
  });
}

function formatCategoryDetailInitiativeSections(input: {
  ideas: Initiative[];
  projects: Initiative[];
  habits: Initiative[];
  tasks: Task[];
  relations: InitiativeRelationWithInitiatives[];
  blocks: ContextDebugBlock[];
  loadedEntities: ContextDebugEntity[];
  omittedEntities: ContextOmittedEntity[];
}): { lines: string[]; emittedChars: number } {
  const relationInitiativeIds = new Set(
    input.relations.flatMap((relation) => [relation.predecessorInitiativeId, relation.successorInitiativeId])
  );
  const openTaskCountByInitiative = new Map<number, number>();
  input.tasks.forEach((task) => {
    openTaskCountByInitiative.set(task.initiativeId, (openTaskCountByInitiative.get(task.initiativeId) ?? 0) + 1);
  });

  let remainingChars = categoryDetailLimits.initiativeContextChars;
  let emittedChars = 0;
  const lines: string[] = [];

  const appendType = (label: string, initiatives: Initiative[]) => {
    lines.push(`${label} in diesem Lebensbereich (${initiatives.length}):`);
    const ranked = rankCategoryInitiatives(initiatives, openTaskCountByInitiative, relationInitiativeIds);
    const capped = ranked.slice(0, categoryDetailLimits.initiativesPerType);
    ranked.slice(categoryDetailLimits.initiativesPerType).forEach((initiative) => {
      input.omittedEntities.push(omittedEntity({
        role: "child",
        entityType: "initiative",
        id: String(initiative.id),
        title: initiative.name,
        reason: "cap",
        originalChars: initiative.markdown.length
      }));
    });

    capped.forEach((initiative) => {
      const header = `- #${initiative.id} ${initiative.name}; status: ${initiative.status}${formatInitiativeProjectPhase(initiative)}${formatInitiativeDateRange(initiative)}`;
      const availableForMarkdown = Math.min(categoryDetailLimits.initiativeMarkdownChars, Math.max(0, remainingChars - header.length - 16));
      if (availableForMarkdown < 220) {
        input.omittedEntities.push(omittedEntity({
          role: "child",
          entityType: "initiative",
          id: String(initiative.id),
          title: initiative.name,
          reason: "budget",
          originalChars: initiative.markdown.length
        }));
        input.blocks.push(createDebugBlock(
          `category-detail:initiative:${initiative.id}:markdown`,
          "initiativeMarkdown",
          `Category detail initiative markdown for ${initiative.name}`,
          initiative.markdown.length,
          0,
          { entityType: "initiative", entityId: String(initiative.id), omitted: true, reason: "budget", source: "initiatives.markdown" }
        ));
        return;
      }

      const markdown = truncateTracked(initiative.markdown || "Noch kein Markdown vorhanden.", availableForMarkdown, {
        id: `category-detail:initiative:${initiative.id}:markdown`,
        kind: "initiativeMarkdown",
        label: `Category detail initiative markdown for ${initiative.name}`,
        entityType: "initiative",
        entityId: String(initiative.id),
        source: "initiatives.markdown"
      }, input.blocks);
      const initiativeLines = [
        header,
        `  Markdown:\n${indentMultiline(markdown.text, "  ")}`
      ];
      const chars = initiativeLines.join("\n").length;
      remainingChars -= chars;
      emittedChars += chars;
      lines.push(...initiativeLines);
      input.loadedEntities.push(debugEntity({
        role: "child",
        entityType: "initiative",
        id: String(initiative.id),
        title: initiative.name,
        kind: initiative.type,
        includedFields: ["id", "name", "type", "status", "projectPhase", "dateRange", "markdown"],
        emittedChars: markdown.emittedChars,
        truncated: markdown.truncated
      }));
    });
  };

  appendType("Ideen", input.ideas);
  appendType("Projekte", input.projects);
  appendType("Gewohnheiten", input.habits);
  return { lines, emittedChars };
}

function rankCategoryInitiatives(
  initiatives: Initiative[],
  openTaskCountByInitiative: Map<number, number>,
  relationInitiativeIds: Set<number>
): Initiative[] {
  const statusRank = { active: 0, paused: 1, completed: 2, archived: 3 };
  return [...initiatives].sort((left, right) => {
    const statusDelta = statusRank[left.status] - statusRank[right.status];
    if (statusDelta !== 0) return statusDelta;
    const taskDelta = (openTaskCountByInitiative.get(right.id) ?? 0) - (openTaskCountByInitiative.get(left.id) ?? 0);
    if (taskDelta !== 0) return taskDelta;
    const dueDelta = (left.endDate ?? "9999").localeCompare(right.endDate ?? "9999");
    if (dueDelta !== 0) return dueDelta;
    const markdownDelta = Number(Boolean(right.markdown.trim())) - Number(Boolean(left.markdown.trim()));
    if (markdownDelta !== 0) return markdownDelta;
    const relationDelta = Number(relationInitiativeIds.has(right.id)) - Number(relationInitiativeIds.has(left.id));
    if (relationDelta !== 0) return relationDelta;
    return right.updatedAt.localeCompare(left.updatedAt);
  });
}

function formatLifeAreasWithoutHabits(
  categories: ReturnType<CategoryRepository["list"]>,
  initiatives: Initiative[],
  blocks: ContextDebugBlock[],
  loadedEntities: ContextDebugEntity[],
  omittedEntities: ContextOmittedEntity[]
): string[] {
  const categoriesWithoutHabits = categories.filter((category) => {
    const categoryInitiatives = initiatives.filter((initiative) => initiative.categoryId === category.id);
    return !categoryInitiatives.some((initiative) => initiative.type === "habit") && (Boolean(category.description?.trim()) || categoryInitiatives.length > 0);
  });
  const shown = categoriesWithoutHabits.slice(0, collectionContextLimits.lifeAreasWithoutHabits);
  const omitted = categoriesWithoutHabits.slice(collectionContextLimits.lifeAreasWithoutHabits);
  omitted.forEach((category) => {
    omittedEntities.push(omittedEntity({
      role: "related",
      entityType: "category",
      id: String(category.id),
      title: category.name,
      reason: "cap",
      originalChars: category.description?.length
    }));
  });

  return [
    `Life areas without habits (${categoriesWithoutHabits.length}, compact):`,
    ...shown.map((category) => {
      const excerpt = truncateTracked(category.description || "no description", collectionContextLimits.lifeAreaWithoutHabitChars, {
        id: `habits:category:${category.id}:without-habit`,
        kind: "categoryBackground",
        label: `Life area without habit: ${category.name}`,
        entityType: "category",
        entityId: String(category.id),
        source: "categories.description"
      }, blocks);
      loadedEntities.push(debugEntity({
        role: "related",
        entityType: "category",
        id: String(category.id),
        title: category.name,
        kind: "without_habit",
        includedFields: ["id", "name", "description"],
        emittedChars: excerpt.emittedChars,
        truncated: excerpt.truncated
      }));
      return `- #${category.id} ${category.name}: ${excerpt.text}`;
    })
  ];
}

function formatInitiativeMarkdownContext(initiative: Initiative): string[] {
  return [
    `- #${initiative.id} ${initiative.name}; status: ${initiative.status}${formatInitiativeProjectPhase(initiative)}${formatInitiativeDateRange(initiative)}`,
    `  Markdown:\n${indentMultiline(truncate(initiative.markdown || "Noch kein Markdown vorhanden.", 3000), "  ")}`
  ];
}

function formatTask(task: Task): string {
  return `- #${task.id} [${task.status}, ${task.priority}${task.dueAt ? `, due ${task.dueAt}` : ""}] ${task.title}${task.notes ? ` — ${truncate(task.notes, 180)}` : ""}`;
}

function formatChecklistItem(item: TaskChecklistItem): string {
  return `- #${item.id} [${item.status}] ${item.name}`;
}

function formatTaskWithChecklist(task: Task, items: TaskChecklistItem[]): string[] {
  return [
    formatTask(task),
    ...(items.length > 0 ? [`  Checklist excerpt (${items.length}):`, ...items.map((item) => `  ${formatChecklistItem(item)}`)] : [])
  ];
}

function formatMediaAttachment(attachment: MediaAttachment): string {
  const derivedText = attachment.asset.summary ?? attachment.asset.textExcerpt ?? attachment.asset.transcript ?? "none";
  return `- #${attachment.asset.id} [${attachment.asset.kind}/${attachment.asset.mimeType}, ${formatBytes(attachment.asset.byteSize)}] ${attachment.asset.originalName}; caption: ${attachment.caption ?? "none"}; summary/excerpt: ${truncate(derivedText, 240)}`;
}

function formatContactPoint(contactPoint: PartyContactPoint): string {
  const flags = [contactPoint.isPreferred ? "preferred" : null, contactPoint.isPrimary ? "primary" : null, contactPoint.canSend ? "send" : null, contactPoint.canReceive ? "receive" : null]
    .filter(Boolean)
    .join(", ");
  return `- #${contactPoint.id} ${contactPoint.type}: ${contactPoint.value}; label: ${contactPoint.label ?? "none"}${flags ? `; ${flags}` : ""}`;
}

function formatPartyAddress(address: PartyAddress): string {
  const parts = [address.line1, address.line2, [address.postalCode, address.city].filter(Boolean).join(" "), address.region, address.country].filter(Boolean);
  return `- #${address.id} ${parts.join(", ")}; label: ${address.label ?? "none"}; primary: ${address.isPrimary ? "yes" : "no"}`;
}

function formatContactSummary(contactPoints: PartyContactPoint[]): string {
  const preferred = contactPoints.find((contactPoint) => contactPoint.isPreferred) ?? contactPoints.find((contactPoint) => contactPoint.isPrimary);
  return preferred ? `; preferred contact: ${preferred.type} ${preferred.value}` : "";
}

function formatPartyRelationship(relationship: PartyRelationshipWithParties, focusPartyId: number): string {
  const otherParty = relationship.fromPartyId === focusPartyId ? relationship.toParty : relationship.fromParty;
  const direction =
    relationship.relationshipType.directionality === "symmetric"
      ? relationship.relationshipType.label
      : relationship.fromPartyId === focusPartyId
        ? relationship.relationshipType.label
        : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
  const dateRange =
    relationship.startedOn || relationship.endedOn ? `; time: ${relationship.startedOn ?? "unknown"} to ${relationship.endedOn ?? "open"}` : "";
  return `- #${relationship.id} ${direction} #${otherParty.id} ${otherParty.displayName} [${otherParty.type}]; status: ${relationship.status}; role: ${relationship.roleLabel ?? "none"}${dateRange}`;
}

function formatEntityParticipant(participant: EntityParticipantWithParty): string {
  return `- #${participant.id} ${participant.party.type} #${participant.partyId} ${participant.party.displayName}; entity: ${participant.entityType} #${participant.entityId}; role: ${participant.roleType?.label ?? participant.roleLabel ?? "none"}; primary: ${participant.isPrimary ? "yes" : "no"}`;
}

function formatInitiativeRelation(relation: InitiativeRelationWithInitiatives): string {
  return `- #${relation.predecessorInitiativeId} ${relation.predecessor.name} -> #${relation.successorInitiativeId} ${relation.successor.name}`;
}

function formatInitiativeRelationEndpoint(relation: InitiativeRelationWithInitiatives, endpoint: "predecessor" | "successor"): string {
  const initiative = endpoint === "predecessor" ? relation.predecessor : relation.successor;
  return `- #${initiative.id} [${formatInitiativeType(initiative.type)}] ${initiative.name}; status: ${initiative.status}${formatInitiativeProjectPhase(initiative)}${formatInitiativeDateRange(initiative)}`;
}

function formatPlanningCanvasSummary(db: Database.Database): string {
  const row = db
    .prepare(
      `select
        count(distinct n.initiative_id) as placed,
        (
          select count(*)
          from initiatives i
          where i.status != 'archived'
            and not exists (select 1 from planning_canvas_nodes pn where pn.initiative_id = i.id)
        ) as unplaced
       from planning_canvas_nodes n`
    )
    .get() as { placed: number; unplaced: number } | undefined;
  return `Planning canvas: ${row?.placed ?? 0} placed initiatives; ${row?.unplaced ?? 0} unplaced non-archived initiatives.`;
}

function rankTasks(tasks: Task[]): Task[] {
  const priorityRank = { urgent: 0, high: 1, normal: 2, low: 3 };
  const statusRank = { open: 0, done: 1 };
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

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 100 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

function indentMultiline(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
