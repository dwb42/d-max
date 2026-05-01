import type { ToolName, ToolResult } from "./tool-definitions.js";
import type { CreateStateEventInput } from "../repositories/state-events.js";

const STATE_MUTATING_TOOLS = new Set<ToolName>([
  "createCategory",
  "updateCategory",
  "createProject",
  "updateProject",
  "archiveProject",
  "updateProjectMarkdown",
  "createTask",
  "updateTask",
  "completeTask",
  "deleteTask"
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

  if (name === "createProject" || name === "updateProject" || name === "archiveProject" || name === "updateProjectMarkdown") {
    const projectId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return {
      ...base,
      entityType: "project",
      entityId: projectId,
      projectId,
      categoryId: numberValue(dataRecord?.categoryId) ?? numberValue(inputRecord?.categoryId)
    };
  }

  if (name === "createTask" || name === "updateTask" || name === "completeTask" || name === "deleteTask") {
    const taskId = numberValue(dataRecord?.id) ?? numberValue(inputRecord?.id);
    return {
      ...base,
      entityType: "task",
      entityId: taskId,
      taskId,
      projectId: numberValue(dataRecord?.projectId) ?? numberValue(inputRecord?.projectId)
    };
  }

  return null;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>) : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}
