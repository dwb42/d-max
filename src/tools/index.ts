import type { ToolDefinition } from "../core/tool-definitions.js";
import { categoryTools } from "./categories.js";
import { projectTools } from "./projects.js";
import { taskTools } from "./tasks.js";
import { thinkingTools } from "./thinking.js";

export const tools: ToolDefinition<any>[] = [...categoryTools, ...projectTools, ...taskTools, ...thinkingTools];
