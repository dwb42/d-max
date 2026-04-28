import type { ToolDefinition } from "../core/tool-definitions.js";

export function toMcpToolMetadata(tool: ToolDefinition<unknown>): { name: string; description: string } {
  return {
    name: tool.name,
    description: tool.description
  };
}
