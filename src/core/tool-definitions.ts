import { z } from "zod";
import type Database from "better-sqlite3";

export type ToolName =
  | "listCategories"
  | "createCategory"
  | "updateCategory"
  | "listProjects"
  | "getProject"
  | "createProject"
  | "updateProject"
  | "archiveProject"
  | "updateProjectMarkdown"
  | "listTasks"
  | "createTask"
  | "updateTask"
  | "completeTask"
  | "deleteTask"
  | "listThinkingSpaces"
  | "getThinkingSpace"
  | "getThinkingContext"
  | "createThinkingSpace"
  | "updateThinkingSpace"
  | "createThinkingSession"
  | "captureThoughts"
  | "listThoughts"
  | "updateThought"
  | "linkThought"
  | "listThoughtLinks"
  | "createTension"
  | "updateTension"
  | "renderOpenLoops"
  | "renderProjectGate"
  | "renderTaskGate";

export type ToolContext = {
  db?: Database.Database;
  now?: Date;
};

export type ConfirmationRequest = {
  ok: false;
  requiresConfirmation: true;
  confirmationKind: string;
  summary: string;
  proposedAction: {
    tool: ToolName;
    input: unknown;
  };
};

export type ToolSuccess<T = unknown> = {
  ok: true;
  data: T;
};

export type ToolFailure = {
  ok: false;
  error: string;
};

export type ToolResult<T = unknown> = ToolSuccess<T> | ToolFailure | ConfirmationRequest;

export type ToolDefinition<Input, Output = unknown> = {
  name: ToolName;
  description: string;
  inputSchema: z.ZodType<Input>;
  run: (input: Input, context: ToolContext) => ToolResult<Output> | Promise<ToolResult<Output>>;
};

export function defineTool<Input, Output = unknown>(tool: ToolDefinition<Input, Output>): ToolDefinition<Input, Output> {
  return tool;
}
