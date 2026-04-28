import { buildConfirmationRequest, requiresConfirmation } from "./confirmation-policy.js";
import type { ToolContext, ToolDefinition, ToolName, ToolResult } from "./tool-definitions.js";

export class ToolRunner {
  private readonly tools = new Map<ToolName, ToolDefinition<any>>();

  register(tool: ToolDefinition<any>): void {
    this.tools.set(tool.name, tool);
  }

  list(): ToolDefinition<any>[] {
    return Array.from(this.tools.values());
  }

  async run(name: ToolName, rawInput: unknown, context: ToolContext = {}): Promise<ToolResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        ok: false,
        error: `Unknown tool: ${name}`
      };
    }

    const parsed = tool.inputSchema.safeParse(rawInput);

    if (!parsed.success) {
      return {
        ok: false,
        error: parsed.error.message
      };
    }

    const input = parsed.data;

    if (typeof input === "object" && input !== null && requiresConfirmation({ tool: name, input: input as Record<string, unknown> })) {
      return buildConfirmationRequest({ tool: name, input: input as Record<string, unknown> });
    }

    return tool.run(input, context);
  }
}
