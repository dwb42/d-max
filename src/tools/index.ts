import type { ToolDefinition } from "../core/tool-definitions.js";
import { categoryTools } from "./categories.js";
import { initiativeTools } from "./initiatives.js";
import { taskTools } from "./tasks.js";

export const tools: ToolDefinition<any>[] = [...categoryTools, ...initiativeTools, ...taskTools];
