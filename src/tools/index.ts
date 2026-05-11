import type { ToolDefinition } from "../core/tool-definitions.js";
import { categoryTools } from "./categories.js";
import { initiativeRelationTools } from "./initiative-relations.js";
import { initiativeTools } from "./initiatives.js";
import { mediaTools } from "./media.js";
import { taskTools } from "./tasks.js";

export const tools: ToolDefinition<any>[] = [...categoryTools, ...initiativeTools, ...initiativeRelationTools, ...taskTools, ...mediaTools];
