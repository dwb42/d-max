import { z } from "zod";
import type Database from "better-sqlite3";

export type ToolName =
  | "listCategories"
  | "createCategory"
  | "updateCategory"
  | "listInitiatives"
  | "getInitiative"
  | "createInitiative"
  | "updateInitiative"
  | "archiveInitiative"
  | "updateInitiativeMarkdown"
  | "listTasks"
  | "createTask"
  | "updateTask"
  | "completeTask"
  | "deleteTask";

export type ToolContext = {
  db?: Database.Database;
  now?: Date;
  allowConfirmedActions?: boolean;
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
