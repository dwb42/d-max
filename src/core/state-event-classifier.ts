import type { ToolName, ToolResult } from "./tool-definitions.js";
import type { CreateStateEventInput } from "../repositories/state-events.js";

const STATE_MUTATING_TOOLS = new Set<ToolName>([
  "createCategory",
  "updateCategory",
  "createInitiative",
  "updateInitiative",
  "archiveInitiative",
  "updateInitiativeMarkdown",
  "createInitiativeRelation",
  "deleteInitiativeRelation",
  "createMindmapFreestyleNode",
  "updateMindmapFreestyleNode",
  "deleteMindmapFreestyleNode",
  "createTask",
  "updateTask",
  "completeTask",
  "deleteTask",
  "createTaskChecklistItem",
  "updateTaskChecklistItem",
  "deleteTaskChecklistItem",
  "reorderTaskChecklistItems",
  "attachMediaToEntity",
  "updateMediaAttachment",
  "deleteMediaAttachment",
  "reorderMediaAttachments",
  "createPerson",
  "updatePerson",
  "createOrganization",
  "updateOrganization",
  "createPartyRelationship",
  "deletePartyRelationship",
  "createEntityParticipant",
  "deleteEntityParticipant",
  "createPartyContactPoint",
  "updatePartyContactPoint"
]);

export function isStateMutatingTool(name: ToolName): boolean {
  return STATE_MUTATING_TOOLS.has(name);
}

export function stateEventFromToolResult(name: ToolName, input: unknown, result: ToolResult): CreateStateEventInput | null {
  if (!isStateMutatingTool(name) || result.ok !== true) {
    return null;
  }

  const inputRecord = asRecord(input);
  const dataRecord = asRecord(result.data);
  const base = {
    source: "tool" as const,
    operation: name
  };

  if (name === "createCategory" || name === "updateCategory") {
    const categoryId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return { ...base, entityType: "category", entityId: categoryId, categoryId };
  }

  if (name === "createInitiative" || name === "updateInitiative" || name === "archiveInitiative" || name === "updateInitiativeMarkdown") {
    const initiativeId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return {
      ...base,
      entityType: "initiative",
      entityId: initiativeId,
      initiativeId,
      categoryId: numberValue(dataRecord?.categoryId) ?? numberValue(inputRecord?.categoryId)
    };
  }

  if (name === "createInitiativeRelation" || name === "deleteInitiativeRelation") {
    const relationId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return {
      ...base,
      entityType: "initiative_relation",
      entityId: relationId,
      initiativeId: numberValue(dataRecord?.successorInitiativeId) ?? numberValue(inputRecord?.successorInitiativeId)
    };
  }

  if (name === "createMindmapFreestyleNode" || name === "updateMindmapFreestyleNode" || name === "deleteMindmapFreestyleNode") {
    return {
      ...base,
      entityType: "planning_canvas_node",
      entityId: numberValue(dataRecord?.id),
      initiativeId: numberValue(dataRecord?.initiativeId) ?? numberValue(inputRecord?.initiativeId)
    };
  }

  if (name === "createTask" || name === "updateTask" || name === "completeTask" || name === "deleteTask") {
    const taskId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return {
      ...base,
      entityType: "task",
      entityId: taskId,
      taskId,
      initiativeId: numberValue(dataRecord?.initiativeId) ?? numberValue(inputRecord?.initiativeId)
    };
  }

  if (
    name === "createTaskChecklistItem" ||
    name === "updateTaskChecklistItem" ||
    name === "deleteTaskChecklistItem" ||
    name === "reorderTaskChecklistItems"
  ) {
    const taskId = numberValue(dataRecord?.taskId) ?? numberValue(inputRecord?.taskId);
    return {
      ...base,
      entityType: "task",
      entityId: taskId,
      taskId
    };
  }

  if (name === "attachMediaToEntity" || name === "updateMediaAttachment" || name === "deleteMediaAttachment" || name === "reorderMediaAttachments") {
    const linkId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    const entityType = stringValue(dataRecord?.entityType) ?? stringValue(inputRecord?.entityType);
    const entityId = numberValue(dataRecord?.entityId) ?? numberValue(inputRecord?.entityId);
    return {
      ...base,
      entityType: "media_link",
      entityId: linkId,
      categoryId: entityType === "category" ? entityId : undefined,
      initiativeId: entityType === "initiative" ? entityId : undefined,
      taskId: entityType === "task" ? entityId : undefined
    };
  }

  if (name === "createPerson" || name === "updatePerson") {
    const partyId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return { ...base, entityType: "person", entityId: partyId };
  }

  if (name === "createOrganization" || name === "updateOrganization") {
    const partyId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return { ...base, entityType: "organization", entityId: partyId };
  }

  if (name === "createPartyRelationship" || name === "deletePartyRelationship") {
    const relationshipId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return { ...base, entityType: "party_relationship", entityId: relationshipId };
  }

  if (name === "createEntityParticipant" || name === "deleteEntityParticipant") {
    const participantId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    const entityType = stringValue(dataRecord?.entityType) ?? stringValue(inputRecord?.entityType);
    const entityId = numberValue(dataRecord?.entityId) ?? numberValue(inputRecord?.entityId);
    return {
      ...base,
      entityType: "entity_participant",
      entityId: participantId,
      initiativeId: entityType === "initiative" ? entityId : undefined,
      taskId: entityType === "task" ? entityId : undefined
    };
  }

  if (name === "createPartyContactPoint" || name === "updatePartyContactPoint") {
    const contactPointId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return { ...base, entityType: "party_contact_point", entityId: contactPointId };
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}
