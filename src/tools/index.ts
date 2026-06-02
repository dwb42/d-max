import type { ToolDefinition } from "../core/tool-definitions.js";
import { categoryTools } from "./categories.js";
import { initiativeMindmapTools } from "./initiative-mindmap.js";
import { initiativeRelationTools } from "./initiative-relations.js";
import { initiativeTools } from "./initiatives.js";
import { mediaTools } from "./media.js";
import { partyTools } from "./parties.js";
import { taskTools } from "./tasks.js";

export const tools: ToolDefinition<any>[] = [
  ...categoryTools,
  ...initiativeTools,
  ...initiativeRelationTools,
  ...initiativeMindmapTools,
  ...taskTools,
  ...mediaTools,
  ...partyTools
];
