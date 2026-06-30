import { z } from "zod";
import type Database from "better-sqlite3";
import { GmailRepository } from "../gmail/gmail-repository.js";
import type { GmailAddress, GmailMessage } from "../gmail/gmail-repository.js";
import { CalendarEntryRepository } from "../repositories/calendar-entries.js";
import type { CalendarEntry } from "../repositories/calendar-entries.js";
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
import type { EntityParticipantWithParty, Organization, PartyAddress, PartyContactPoint, PartyRelationshipWithParties, Person } from "../repositories/parties.js";
import { PartyActivitySummaryRepository } from "../repositories/party-activity-summary.js";
import type { OrganizationPersonActivity, PartyActivitySummary } from "../repositories/party-activity-summary.js";
import { TaskChecklistItemRepository } from "../repositories/task-checklist-items.js";
import type { TaskChecklistItem } from "../repositories/task-checklist-items.js";
import { TaskRepository } from "../repositories/tasks.js";
import type { Task } from "../repositories/tasks.js";
import { PartyTimelineRepository } from "../repositories/party-timeline.js";
import type { PartyTimelineEntry } from "../repositories/party-timeline.js";
import type { ConversationContextType } from "../repositories/app-conversations.js";
import { buildPromptSections } from "./conversation-prompt-templates.js";
export { listPromptTemplates } from "./conversation-prompt-templates.js";
export type { PromptTemplateDefinition } from "./conversation-prompt-templates.js";

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
type ContextEntityType = "category" | "initiative" | "task" | "relation" | "media" | "participant" | "party" | "communication" | "unknown";
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
  const entityParticipants = new EntityParticipantRepository(db);
  const partyContactPoints = new PartyContactPointRepository(db);
  const tasks = new TaskRepository(db);
  const taskChecklistItems = new TaskChecklistItemRepository(db);

  if (context.type === "global") {
    return buildResolvedContext({
      context,
      storage,
      title: "Global Chat",
      promptType: "global",
      description: "Global DMAX chat without a focused UI entity.",
      lines: [
        "Use the tools to inspect initiatives or tasks when the user asks for specific state.",
        "Do not assume an initiative or task target unless the user names one clearly."
      ],
      payload: {
        dataSources: ["OpenClaw workspace", "DMAX MCP tools"],
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
        const categoryTasks = activeTasks.filter((task) => task.initiativeId !== null && categoryInitiatives.some((initiative) => initiative.id === task.initiativeId));
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
          .filter((task) => task.initiativeId !== null && categoryInitiatives.some((initiative) => initiative.id === task.initiativeId))
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
    const typedTasks = tasks.list().filter((task) => task.initiativeId !== null && initiativeIds.has(task.initiativeId) && task.status !== "done");
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
      `Open tasks across DMAX (${allTasks.length}, showing highest-signal first):`,
      ...rankTasks(allTasks)
        .slice(0, 40)
        .map((task) => {
          const initiative = task.initiativeId ? allInitiatives.find((candidate) => candidate.id === task.initiativeId) : null;
          const category = initiative ? allCategories.find((candidate) => candidate.id === initiative.categoryId) : null;
          return `${formatTask(task)}; initiative: ${
            initiative ? `#${initiative.id} ${initiative.name} [${formatInitiativeType(initiative.type)}]` : task.initiativeId ? `#${task.initiativeId} not found` : "none"
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
              return `- #${person.id} ${formatPersonName(person)}; salutation: ${person.salutation}; first: ${person.firstName ?? "none"}; last: ${person.lastName ?? "none"}; description: ${person.description?.trim() ? "described" : "missing"}${contacts}`;
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
      description: `Focused on DMAX ${context.type} and the Who dimension.`,
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
    const categoryTasks = tasks.list().filter((task) => task.initiativeId !== null && initiativeIds.has(task.initiativeId) && task.status !== "done");
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
    return buildPartyAgentResolvedContext(db, context, storage);
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
      formatMindmapContextSummary(db, initiative.id),
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
        dataSources: ["initiatives", "categories", "initiative_relations", "graph_layout_nodes", "graph_node_annotations", "mindmap_change_drafts", "media_links", "entity_participants", "tasks"],
        current: [`initiative #${initiative.id} ${initiative.name} (${initiative.type})`],
        parents: [
          category ? `category #${category.id} ${category.name}` : "category not found",
          parentInitiative ? `parent initiative #${parentInitiative.id} ${parentInitiative.name}` : "no parent initiative"
        ],
        children: [`${childInitiatives.length} child initiatives`, `${initiativeTasks.length} tasks`, `${initiativeMedia.length} media attachments`, `${initiativeParticipants.length} participants`, "mindmap summary counts"],
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

  const initiative = task.initiativeId ? initiatives.findById(task.initiativeId) : null;
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
    initiative ? formatInitiativeHeader(initiative) : task.initiativeId ? `Initiative: #${task.initiativeId} not found` : "Initiative: none",
    category ? `Category: #${category.id} ${category.name} (${category.color})` : "Category: none",
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
        initiative ? `initiative #${initiative.id} ${initiative.name}` : task.initiativeId ? `initiative #${task.initiativeId} not found` : "no initiative",
        category ? `category #${category.id} ${category.name}` : "no category",
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

const partyAgentSecondaryLimits = {
  contactPoints: 20,
  addresses: 20,
  otherRelationships: 30
};

type PartyAgentContextMode = Extract<ConversationContext, { type: "person" | "organization" }>;

function buildPartyAgentResolvedContext(
  db: Database.Database,
  context: PartyAgentContextMode,
  storage: { contextType: ConversationContextType; contextEntityId: number | null }
): ResolvedConversationContext {
  const people = new PersonRepository(db);
  const organizations = new OrganizationRepository(db);
  const partyRelationships = new PartyRelationshipRepository(db);
  const entityParticipants = new EntityParticipantRepository(db);
  const partyContactPoints = new PartyContactPointRepository(db);
  const partyAddresses = new PartyAddressRepository(db);
  const tasks = new TaskRepository(db);
  const initiatives = new InitiativeRepository(db);
  const categories = new CategoryRepository(db);
  const calendarEntries = new CalendarEntryRepository(db);
  const gmail = new GmailRepository(db);
  const partyTimeline = new PartyTimelineRepository(db);
  const partyActivitySummaries = new PartyActivitySummaryRepository(db);

  const person = context.type === "person" ? people.findById(context.partyId) : null;
  const organization = context.type === "organization" ? organizations.findById(context.partyId) : null;
  const focusParty = person ?? organization;
  if (!focusParty) {
    throw new Error(`${context.type === "person" ? "Person" : "Organization"} not found: ${context.partyId}`);
  }

  const relationships = partyRelationships.list({ partyId: focusParty.id });
  const organizationPeople = organization
    ? listActiveOrganizationPeopleForAgent(relationships, organization.id, people)
    : [];
  const criticalPartyIds = uniqueNumbers([focusParty.id, ...organizationPeople.map((entry) => entry.person.id)]);
  const participants = uniqueById(criticalPartyIds.flatMap((partyId) => entityParticipants.list({ partyId })));
  const contacts = partyContactPoints.list({ partyId: focusParty.id });
  const addresses = partyAddresses.list({ partyId: focusParty.id });
  const activityResponse = partyActivitySummaries.listSummaries([focusParty.id], { includeOrganizationPeople: context.type === "organization" });
  const activitySummary = activityResponse.summaries[0] ?? null;
  const organizationPeopleActivity = organization ? activityResponse.organizationPeople?.[organization.id] ?? [] : [];

  const primaryTasks = uniqueById(criticalPartyIds.flatMap((partyId) => tasks.list({ primaryPartyId: partyId })));
  const participantTasks = uniqueById(participants.flatMap((participant) => participant.entityType === "task" ? [tasks.findById(participant.entityId)].filter(isPresent) : []));
  const allRelevantTasks = sortPartyAgentTasks(uniqueById([...primaryTasks, ...participantTasks]));
  const openTasks = allRelevantTasks.filter((task) => task.status !== "done");
  const doneTasks = allRelevantTasks.filter((task) => task.status === "done");

  const gmailMessages = uniqueById(criticalPartyIds.flatMap((partyId) => gmail.listAllMessagesForParty(partyId)));
  const manualEntries = uniqueById(criticalPartyIds.flatMap((partyId) => partyTimeline.listAllForParty(partyId)));
  const communicationItems = [
    ...gmailMessages.map((message) => ({
      occurredAt: message.messageDate,
      line: formatPartyAgentGmailMessage(message, focusParty.id)
    })),
    ...manualEntries.map((entry) => ({
      occurredAt: entry.occurredAt,
      line: formatPartyAgentTimelineEntry(entry)
    }))
  ].sort((left, right) => compareIsoDesc(left.occurredAt, right.occurredAt));

  const relatedCalendarEntries = uniqueById(participants.flatMap((participant) => participant.entityType === "calendar_entry" ? [calendarEntries.findById(participant.entityId)].filter(isPresent) : []));
  const relatedTaskIds = new Set<number>([
    ...allRelevantTasks.map((task) => task.id),
    ...relatedCalendarEntries.flatMap((entry) => entry.taskId ? [entry.taskId] : [])
  ]);
  const relatedTasks = uniqueById([...allRelevantTasks, ...[...relatedTaskIds].map((taskId) => tasks.findById(taskId)).filter(isPresent)]);
  const relatedInitiativeIds = new Set<number>([
    ...participants.flatMap((participant) => participant.entityType === "initiative" ? [participant.entityId] : []),
    ...relatedTasks.flatMap((task) => task.initiativeId ? [task.initiativeId] : []),
    ...relatedCalendarEntries.flatMap((entry) => entry.initiativeId ? [entry.initiativeId] : [])
  ]);
  const relatedInitiatives = [...relatedInitiativeIds].map((initiativeId) => initiatives.findById(initiativeId)).filter(isPresent);

  const focusOtherRelationships = relationships.filter((relationship) => !organizationPeople.some((entry) => entry.relationship.id === relationship.id));
  const shownOtherRelationships = focusOtherRelationships.slice(0, partyAgentSecondaryLimits.otherRelationships);
  const omittedOtherRelationships = focusOtherRelationships.slice(partyAgentSecondaryLimits.otherRelationships);
  const shownContacts = prioritizeContactPoints(contacts).slice(0, partyAgentSecondaryLimits.contactPoints);
  const shownAddresses = prioritizeAddresses(addresses).slice(0, partyAgentSecondaryLimits.addresses);

  const loadedEntities: ContextDebugEntity[] = [
    debugEntity({
      role: "current",
      entityType: "party",
      id: String(focusParty.id),
      title: context.type === "person" ? formatPersonName(person!) : organization!.displayName,
      kind: context.type,
      includedFields: context.type === "person"
        ? ["id", "name", "salutation", "description"]
        : ["id", "name", "legalName", "organizationType", "markdown"]
    }),
    ...organizationPeople.map((entry) => debugEntity({
      role: "child" as const,
      entityType: "party" as const,
      id: String(entry.person.id),
      title: formatPersonName(entry.person),
      kind: "organization_person",
      includedFields: ["id", "name", "salutation", "description", "relationshipRoleLabel"]
    })),
    ...allRelevantTasks.map((task) => debugEntity({ role: "child" as const, entityType: "task" as const, id: String(task.id), title: task.title, kind: task.status })),
    ...gmailMessages.map((message) => debugEntity({ role: "child" as const, entityType: "communication" as const, id: `gmail:${message.id}`, title: message.subject ?? "(no subject)", kind: message.direction })),
    ...manualEntries.map((entry) => debugEntity({ role: "child" as const, entityType: "communication" as const, id: `manual:${entry.id}`, title: entry.title, kind: entry.kind })),
    ...relatedInitiatives.map((initiative) => debugEntity({ role: "related" as const, entityType: "initiative" as const, id: String(initiative.id), title: initiative.name, kind: initiative.type })),
    ...relatedCalendarEntries.map((entry) => debugEntity({ role: "related" as const, entityType: "unknown" as const, id: String(entry.id), title: entry.title, kind: "calendar_entry" }))
  ];
  const omittedEntities: ContextOmittedEntity[] = [
    ...contacts.slice(partyAgentSecondaryLimits.contactPoints).map((contact) => omittedEntity({ role: "related", entityType: "party", id: `contact:${contact.id}`, title: contact.value, reason: "cap" as const })),
    ...addresses.slice(partyAgentSecondaryLimits.addresses).map((address) => omittedEntity({ role: "related", entityType: "party", id: `address:${address.id}`, title: address.line1, reason: "cap" as const })),
    ...omittedOtherRelationships.map((relationship) => omittedEntity({ role: "neighbor", entityType: "relation", id: String(relationship.id), title: formatPartyRelationshipTitle(relationship, focusParty.id), reason: "cap" as const }))
  ];

  const communicationText = communicationItems.map((item) => item.line).join("\n");
  const taskText = allRelevantTasks.map((task) => formatPartyAgentTask(task, focusParty.id, initiatives, categories)).join("\n");
  const relatedContextText = [
    ...relatedInitiatives.map((initiative) => formatPartyAgentInitiativeContext(initiative, categories)),
    ...relatedTasks.filter((task) => !allRelevantTasks.some((candidate) => candidate.id === task.id)).map((task) => formatPartyAgentTask(task, focusParty.id, initiatives, categories)),
    ...relatedCalendarEntries.map((entry) => formatPartyAgentCalendarContext(entry, tasks, initiatives))
  ].join("\n");
  const blocks = [
    createDebugBlock(
      `party:${focusParty.id}:critical-communication`,
      "contextData",
      "Critical complete local communication history",
      communicationText.length,
      communicationText.length,
      { entityType: "party", entityId: String(focusParty.id), source: "gmail_messages + party_timeline_entries" }
    ),
    createDebugBlock(
      `party:${focusParty.id}:critical-tasks`,
      "contextData",
      "Critical complete relevant tasks",
      taskText.length,
      taskText.length,
      { entityType: "party", entityId: String(focusParty.id), source: "tasks" }
    ),
    createDebugBlock(
      `party:${focusParty.id}:critical-dmax-context`,
      "contextData",
      "Critical DMAX initiative/task/calendar context",
      relatedContextText.length,
      relatedContextText.length,
      { entityType: "party", entityId: String(focusParty.id), source: "entity_participants + tasks + initiatives + calendar_entries" }
    )
  ];

  const title = context.type === "person" ? formatPersonName(person!) : organization!.displayName;
  const lines = [
    "Party agent context priority policy:",
    "- Critical context is complete from local SQLite and is not capped by fixed count/character budgets: identity/description, organization people, local communication history, relevant tasks, and DMAX project/task/calendar context.",
    "- Lower-priority orientation data may be capped: contact points, postal addresses, extra relationships, and technical metadata.",
    "- Gmail context is read-only local database context from synchronized gmail_messages. Do not live-read Gmail, send Gmail, edit Gmail, archive Gmail, trash Gmail, or claim a Gmail action happened.",
    "",
    context.type === "person" ? formatPartyAgentPersonHeader(person!) : formatPartyAgentOrganizationHeader(organization!),
    context.type === "person"
      ? `Person description:\n${person!.description || "No person description yet."}`
      : `Organization description markdown:\n${organization!.markdown || "No organization description yet."}`,
    ...(organization
      ? [
          `Organization people (${organizationPeople.length}, complete active related people):`,
          ...(organizationPeople.length ? organizationPeople.map(formatOrganizationPersonForAgent) : ["none"]),
          `Organization people activity summary (${organizationPeopleActivity.length}):`,
          ...(organizationPeopleActivity.length ? organizationPeopleActivity.map(formatOrganizationPersonActivityForAgent) : ["none"])
        ]
      : []),
    `Activity summary: ${activitySummary ? formatPartyActivitySummaryForAgent(activitySummary) : "none"}`,
    `Contact points (${contacts.length}): lower-priority; shown ${shownContacts.length}`,
    ...(shownContacts.length ? shownContacts.map(formatContactPoint) : ["none"]),
    `Postal addresses (${addresses.length}): lower-priority; shown ${shownAddresses.length}`,
    ...(shownAddresses.length ? shownAddresses.map(formatPartyAddress) : ["none"]),
    `Other party relationships (${focusOtherRelationships.length}, lower-priority; shown ${shownOtherRelationships.length}):`,
    ...(shownOtherRelationships.length ? shownOtherRelationships.map((relationship) => formatPartyRelationship(relationship, focusParty.id)) : ["none"]),
    `Relevant tasks/measures (${allRelevantTasks.length}, complete; open ${openTasks.length}, done ${doneTasks.length}):`,
    ...(allRelevantTasks.length ? allRelevantTasks.map((task) => formatPartyAgentTask(task, focusParty.id, initiatives, categories)) : ["none"]),
    `DMAX participations (${participants.length}):`,
    ...(participants.length ? participants.map(formatEntityParticipant) : ["none"]),
    `DMAX project/task/calendar context (${relatedInitiatives.length} initiatives/projects, ${relatedCalendarEntries.length} calendar entries; complete for related entities):`,
    ...(relatedContextText ? relatedContextText.split("\n") : ["none"]),
    `Complete local communication history (${communicationItems.length}, newest first; Gmail ${gmailMessages.length}, manual ${manualEntries.length}):`,
    ...(communicationItems.length ? communicationItems.map((item) => item.line) : ["none"])
  ];

  return buildResolvedContext({
    context,
    storage,
    title,
    promptType: context.type,
    description: `Focused on one ${context.type} in the Who dimension with complete local communication, measures, and DMAX relationship context.`,
    lines,
    payload: {
      dataSources: [
        "people",
        "organizations",
        "party_relationships",
        "entity_participants",
        "party_contact_points",
        "party_addresses",
        "tasks",
        "initiatives",
        "categories",
        "calendar_entries",
        "party_timeline_entries",
        "gmail_messages",
        "gmail_message_party_links"
      ],
      current: [`${context.type} #${focusParty.id} ${title}`],
      children: [
        `${organizationPeople.length} active organization people`,
        `${allRelevantTasks.length} complete relevant tasks`,
        `${gmailMessages.length} complete local Gmail messages`,
        `${manualEntries.length} complete manual communication entries`,
        `${participants.length} DMAX participations`
      ],
      related: [`${relatedInitiatives.length} related initiatives/projects`, `${relatedCalendarEntries.length} related calendar entries`],
      neighbors: [`${relationships.length} party relationships`],
      limits: [
        "Critical party context is not count-capped: identity/description, organization people, complete local communication history, complete relevant tasks, and related DMAX context are emitted in full.",
        `Lower-priority contact points shown up to ${partyAgentSecondaryLimits.contactPoints}.`,
        `Lower-priority postal addresses shown up to ${partyAgentSecondaryLimits.addresses}.`,
        `Lower-priority other relationships shown up to ${partyAgentSecondaryLimits.otherRelationships}.`,
        "Gmail context is read-only and sourced only from local SQLite; no Gmail live-read or Gmail mutation tools are exposed."
      ],
      notes: [
        "Use communication/task contradictions prompt-contextually; do not implement deterministic rule-engine behavior.",
        "Suggest task changes with evidence first. Mutate durable DMAX state only when Dietrich explicitly asks and existing tool rules allow it."
      ],
      loadedEntities,
      omittedEntities,
      blocks,
      budgets: [
        budgetSummary(context.type, "Critical local communication history", { emittedChars: communicationText.length }),
        budgetSummary(context.type, "Critical relevant task context", { emittedChars: taskText.length }),
        budgetSummary(context.type, "Critical DMAX context", { emittedChars: relatedContextText.length }),
        budgetSummary(context.type, "Lower-priority contact points", { cap: partyAgentSecondaryLimits.contactPoints, used: shownContacts.length }),
        budgetSummary(context.type, "Lower-priority addresses", { cap: partyAgentSecondaryLimits.addresses, used: shownAddresses.length }),
        budgetSummary(context.type, "Lower-priority relationships", { cap: partyAgentSecondaryLimits.otherRelationships, used: shownOtherRelationships.length })
      ]
    }
  });
}

export function buildContextualAgentMessage(userMessage: string, resolved: ResolvedConversationContext): string {
  return `${resolved.agentContextBlock}

User message:
${userMessage}`;
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
    if (!task.initiativeId) return;
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

function listActiveOrganizationPeopleForAgent(
  relationships: PartyRelationshipWithParties[],
  organizationId: number,
  people: PersonRepository
): Array<{ person: Person; relationship: PartyRelationshipWithParties }> {
  return relationships
    .filter((relationship) => relationship.status === "active")
    .flatMap((relationship) => {
      const otherParty = relationship.fromPartyId === organizationId ? relationship.toParty : relationship.toPartyId === organizationId ? relationship.fromParty : null;
      if (!otherParty || otherParty.type !== "person") return [];
      const person = people.findById(otherParty.id);
      return person ? [{ person, relationship }] : [];
    })
    .sort((left, right) => formatPersonName(left.person).localeCompare(formatPersonName(right.person), "de"));
}

function formatPartyAgentPersonHeader(person: Person): string {
  return `Person: #${person.id} ${formatPersonName(person)}; salutation/gender signal: ${person.salutation}; first: ${person.firstName ?? "none"}; last: ${person.lastName ?? "none"}; title: ${person.academicTitle ?? "none"}; suffix: ${person.nameSuffix ?? "none"}; gender field: not modeled`;
}

function formatPartyAgentOrganizationHeader(organization: Organization): string {
  return `Organization: #${organization.id} ${organization.displayName}; name: ${organization.name}; legal name: ${organization.legalName ?? "none"}; type: ${organization.organizationType ?? "none"}`;
}

function formatOrganizationPersonForAgent(entry: { person: Person; relationship: PartyRelationshipWithParties }): string {
  const relationship = formatPartyRelationshipTitle(entry.relationship, entry.relationship.fromParty.type === "organization" ? entry.relationship.fromPartyId : entry.relationship.toPartyId);
  return [
    `- person #${entry.person.id} ${formatPersonName(entry.person)}`,
    `  Relationship/role label: ${relationship}; roleLabel: ${entry.relationship.roleLabel ?? "none"}`,
    `  salutation/gender signal: ${entry.person.salutation}; gender field: not modeled`,
    `  Academic title: ${entry.person.academicTitle ?? "none"}; suffix: ${entry.person.nameSuffix ?? "none"}`,
    `  Description: ${entry.person.description || "No person description yet."}`
  ].join("\n");
}

function formatOrganizationPersonActivityForAgent(activity: OrganizationPersonActivity): string {
  return `- person #${activity.partyId} ${activity.displayName}; relationship: ${activity.relationshipLabel}; role: ${activity.roleLabel ?? "none"}; started: ${activity.startedOn ?? "unknown"}; summary: ${formatPartyActivitySummaryForAgent(activity.summary)}`;
}

function formatPartyActivitySummaryForAgent(summary: PartyActivitySummary): string {
  const stats = summary.stats;
  const nextAction = summary.nextAction ? `next action #${summary.nextAction.taskId} ${summary.nextAction.title}; due: ${summary.nextAction.dueAt ?? "none"}; priority: ${summary.nextAction.priority}` : "next action: none";
  const rollup = summary.rollupIncludesPeople ? `; rollup party ids: ${(summary.rollupPartyIds ?? []).join(", ") || "none"}` : "";
  return `contact since: ${summary.contactSince ?? "unknown"}; last contact: ${summary.lastContactAt ?? "unknown"}; channels: ${summary.channelsUsed.join(", ") || "none"}; emails inbound/outbound: ${stats.emailInbound}/${stats.emailOutbound}; manual total: ${stats.manualTotal}; measures open/total: ${stats.openMeasureTotal}/${stats.measureTotal}; ${nextAction}${rollup}`;
}

function formatPartyAgentGmailMessage(message: GmailMessage, focusPartyId: number): string {
  const content = message.plainBody ?? message.htmlBody ?? message.snippet ?? "";
  const links = message.partyLinks.map((link) => `#${link.partyId} ${link.partyDisplayName} [${link.partyType}] via ${link.matchedEmail}`).join(", ") || "none";
  return [
    `- Gmail #${message.id}; gmailMessageId: ${message.gmailMessageId}; date: ${message.messageDate}; source: gmail_messages; direction: ${message.direction}; mailbox #${message.mailboxId}; thread: ${message.gmailThreadId ?? "none"}; focus party linked: ${message.partyLinks.some((link) => link.partyId === focusPartyId) ? "yes" : "no"}`,
    `  Subject: ${message.subject || "(no subject)"}`,
    `  From: ${formatGmailAddressList(message.from)}`,
    `  To: ${formatGmailAddressList(message.to)}`,
    `  Cc: ${formatGmailAddressList(message.cc)}`,
    `  Bcc: ${formatGmailAddressList(message.bcc)}`,
    `  Linked parties: ${links}`,
    `  Attachments: ${message.attachments.length}`,
    `  Full content:\n${indentMultiline(content || "(no stored message body)", "    ")}`
  ].join("\n");
}

function formatPartyAgentTimelineEntry(entry: PartyTimelineEntry): string {
  return [
    `- Manual communication #${entry.id}; date: ${entry.occurredAt}; source: party_timeline_entries; kind: ${entry.kind}; channel: ${entry.channel}; direction: ${entry.direction}; related task: ${entry.relatedTaskId ?? "none"}`,
    `  Title: ${entry.title}`,
    `  Parties: ${entry.parties.map((party) => `#${party.partyId} ${party.partyDisplayName} [${party.partyType}/${party.role}]`).join(", ") || "none"}`,
    `  Full content:\n${indentMultiline(entry.body || "(no body)", "    ")}`
  ].join("\n");
}

function formatPartyAgentTask(task: Task, focusPartyId: number, initiatives: InitiativeRepository, categories: CategoryRepository): string {
  const initiative = task.initiativeId ? initiatives.findById(task.initiativeId) : null;
  const category = initiative ? categories.findById(initiative.categoryId) : null;
  return [
    `- Task #${task.id}; title: ${task.title}; status: ${task.status}; priority: ${task.priority}; primaryPartyId: ${task.primaryPartyId ?? "none"}${task.primaryPartyId === focusPartyId ? " (focus)" : ""}; initiative: ${initiative ? `#${initiative.id} ${initiative.name} [${initiative.type}]` : task.initiativeId ? `#${task.initiativeId} not found` : "none"}; category: ${category ? `#${category.id} ${category.name}` : "none"}`,
    `  Due: ${task.dueAt ?? "none"}; completed: ${task.completedAt ?? "none"}; created: ${task.createdAt}; updated: ${task.updatedAt}`,
    `  Notes:\n${indentMultiline(task.notes || "(no notes)", "    ")}`
  ].join("\n");
}

function formatPartyAgentInitiativeContext(initiative: Initiative, categories: CategoryRepository): string {
  const category = categories.findById(initiative.categoryId);
  return [
    `- Initiative/Project #${initiative.id}; name: ${initiative.name}; type: ${initiative.type}; status: ${initiative.status}; project phase: ${initiative.type === "project" ? initiative.projectPhase : "n/a"}; category: ${category ? `#${category.id} ${category.name}` : `#${initiative.categoryId} not found`}`,
    `  Summary: ${initiative.summary ?? "none"}`,
    `  Time span: ${formatInitiativeDateRangeValue(initiative)}; locked: ${formatInitiativeLockedValue(initiative)}; parent: ${initiative.parentId ?? "none"}`,
    `  Markdown:\n${indentMultiline(initiative.markdown || "(no initiative markdown)", "    ")}`
  ].join("\n");
}

function formatPartyAgentCalendarContext(entry: CalendarEntry, tasks: TaskRepository, initiatives: InitiativeRepository): string {
  const task = entry.taskId ? tasks.findById(entry.taskId) : null;
  const initiative = entry.initiativeId ? initiatives.findById(entry.initiativeId) : task?.initiativeId ? initiatives.findById(task.initiativeId) : null;
  return [
    `- Calendar entry #${entry.id}; title: ${entry.title}; type: ${entry.type}; status: ${entry.status}; start: ${entry.startAt}; end: ${entry.endAt}`,
    `  Linked task: ${task ? `#${task.id} ${task.title}` : entry.taskId ? `#${entry.taskId} not found` : "none"}`,
    `  Linked initiative/project: ${initiative ? `#${initiative.id} ${initiative.name} [${initiative.type}]` : entry.initiativeId ? `#${entry.initiativeId} not found` : "none"}`,
    `  Notes:\n${indentMultiline(entry.notes || "(no notes)", "    ")}`
  ].join("\n");
}

function formatGmailAddressList(addresses: GmailAddress[]): string {
  return addresses.length
    ? addresses.map((address) => `${address.name ? `${address.name} ` : ""}<${address.email}>`).join(", ")
    : "none";
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

function formatPersonName(person: Pick<Person, "firstName" | "lastName">): string {
  return [person.firstName, person.lastName].filter(Boolean).join(" ").trim() || "Unnamed person";
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

function formatPartyRelationshipTitle(relationship: PartyRelationshipWithParties, focusPartyId: number): string {
  const otherParty = relationship.fromPartyId === focusPartyId ? relationship.toParty : relationship.fromParty;
  const direction =
    relationship.relationshipType.directionality === "symmetric"
      ? relationship.relationshipType.label
      : relationship.fromPartyId === focusPartyId
        ? relationship.relationshipType.label
        : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
  return `${direction} #${otherParty.id} ${otherParty.displayName}`;
}

function formatEntityParticipant(participant: EntityParticipantWithParty): string {
  return `- #${participant.id} ${participant.party.type} #${participant.partyId} ${participant.party.displayName}; entity: ${participant.entityType} #${participant.entityId}; role: ${participant.roleType?.label ?? participant.roleLabel ?? "none"}; primary: ${participant.isPrimary ? "yes" : "no"}`;
}

function formatPartyTask(task: Task): string {
  return `- #${task.id} ${task.title}; status: ${task.status}; priority: ${task.priority}; due: ${task.dueAt ?? "none"}; initiative: ${task.initiativeId ?? "none"}; notes: ${task.notes ?? "none"}`;
}

function formatPartyTimelineEntry(entry: PartyTimelineEntry): string {
  return `- #${entry.id} ${entry.kind}; channel: ${entry.channel}; direction: ${entry.direction}; occurred: ${entry.occurredAt}; title: ${entry.title}; related task: ${entry.relatedTaskId ?? "none"}; note: ${entry.body ?? "none"}`;
}

function formatInitiativeRelation(relation: InitiativeRelationWithInitiatives): string {
  return `- #${relation.predecessorInitiativeId} ${relation.predecessor.name} -> #${relation.successorInitiativeId} ${relation.successor.name}`;
}

function formatInitiativeRelationEndpoint(relation: InitiativeRelationWithInitiatives, endpoint: "predecessor" | "successor"): string {
  const initiative = endpoint === "predecessor" ? relation.predecessor : relation.successor;
  return `- #${initiative.id} [${formatInitiativeType(initiative.type)}] ${initiative.name}; status: ${initiative.status}${formatInitiativeProjectPhase(initiative)}${formatInitiativeDateRange(initiative)}`;
}

function formatMindmapContextSummary(db: Database.Database, initiativeId: number): string {
  const scopeKey = `initiative:${initiativeId}`;
  const counts = db
    .prepare(
      `select
        count(*) as node_count,
        sum(case when node_kind = 'freestyle' then 1 else 0 end) as freestyle_count,
        sum(case when collapsed = 1 then 1 else 0 end) as collapsed_count
       from graph_layout_nodes
       where scope_key = ?`
    )
    .get(scopeKey) as { node_count: number; freestyle_count: number | null; collapsed_count: number | null } | undefined;
  const annotationCounts = db
    .prepare(
      `select annotation_type as annotationType, count(*) as count
       from graph_node_annotations
       where scope_key = ?
       group by annotation_type
       order by annotation_type asc`
    )
    .all(scopeKey) as Array<{ annotationType: string; count: number }>;
  const pendingDrafts = db
    .prepare("select count(*) as count from mindmap_change_drafts where initiative_id = ? and status = 'draft'")
    .get(initiativeId) as { count: number } | undefined;
  const annotationSummary = annotationCounts.length > 0
    ? annotationCounts.map((entry) => `${entry.annotationType}: ${entry.count}`).join(", ")
    : "none";
  return `Mindmap summary: ${counts?.node_count ?? 0} nodes, ${counts?.freestyle_count ?? 0} freestyle, ${counts?.collapsed_count ?? 0} collapsed; annotations: ${annotationSummary}; pending drafts: ${pendingDrafts?.count ?? 0}. Use summarizeInitiativeMindmap/getInitiativeMindmap for detailed mindmap questions.`;
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

function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

function uniqueById<T extends { id: number }>(values: T[]): T[] {
  const seen = new Set<number>();
  return values.filter((value) => {
    if (seen.has(value.id)) return false;
    seen.add(value.id);
    return true;
  });
}

function uniqueNumbers(values: number[]): number[] {
  return [...new Set(values)];
}

function compareIsoDesc(left: string | null | undefined, right: string | null | undefined): number {
  return (Date.parse(right ?? "") || 0) - (Date.parse(left ?? "") || 0);
}

function sortPartyAgentTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((left, right) => {
    if (left.status !== right.status) return left.status === "open" ? -1 : 1;
    const dueCompare = (left.dueAt ?? "9999-12-31T23:59:59.999Z").localeCompare(right.dueAt ?? "9999-12-31T23:59:59.999Z");
    if (dueCompare !== 0) return dueCompare;
    const updatedCompare = compareIsoDesc(left.updatedAt, right.updatedAt);
    return updatedCompare || left.id - right.id;
  });
}

function prioritizeContactPoints(contactPoints: PartyContactPoint[]): PartyContactPoint[] {
  return [...contactPoints].sort((left, right) => {
    const leftScore = (left.isPreferred ? 4 : 0) + (left.isPrimary ? 2 : 0) + (left.type === "email" ? 1 : 0);
    const rightScore = (right.isPreferred ? 4 : 0) + (right.isPrimary ? 2 : 0) + (right.type === "email" ? 1 : 0);
    return rightScore - leftScore || left.id - right.id;
  });
}

function prioritizeAddresses(addresses: PartyAddress[]): PartyAddress[] {
  return [...addresses].sort((left, right) => Number(right.isPrimary) - Number(left.isPrimary) || left.id - right.id);
}

function indentMultiline(value: string, prefix: string): string {
  return value
    .split("\n")
    .map((line) => `${prefix}${line}`)
    .join("\n");
}
