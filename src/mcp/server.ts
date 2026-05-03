import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { migrate } from "../db/migrate.js";
import { openDatabase } from "../db/connection.js";
import { createToolRunner } from "./tool-registry.js";
import { createChatTurnTraceId, recordChatTurnDiagnosticEvent } from "../diagnostics/chat-turns.js";

const mcpTraceId = createChatTurnTraceId(`mcp-${process.pid}`);

function recordMcp(event: string, detail?: Record<string, unknown>): void {
  recordChatTurnDiagnosticEvent({
    traceId: mcpTraceId,
    source: "mcp",
    event,
    detail
  });
}

recordMcp("mcp_process_started", {
  argv: process.argv.slice(2),
  cwd: process.cwd()
});

const mcpServer = new McpServer({
  name: "d-max",
  version: "0.1.0"
});
const runner = createToolRunner();
recordMcp("mcp_tools_registered", {
  toolCount: runner.list().length,
  tools: runner.list().map((tool) => tool.name)
});

for (const tool of runner.list()) {
  mcpServer.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema as any
    },
    (async (input: unknown) => {
      const startedAt = Date.now();
      recordMcp("mcp_tool_call_started", {
        toolName: tool.name,
        inputKeys: isRecord(input) ? Object.keys(input) : []
      });
      let result;
      try {
        result = await runner.run(tool.name, input, { db });
        recordMcp("mcp_tool_call_finished", {
          toolName: tool.name,
          ok: result.ok,
          durationMs: Date.now() - startedAt
        });
      } catch (error) {
        recordMcp("mcp_tool_call_failed", {
          toolName: tool.name,
          durationMs: Date.now() - startedAt,
          error: error instanceof Error ? error.message : String(error)
        });
        throw error;
      }

      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify(result, null, 2)
          }
        ],
        isError: result.ok === false && !("requiresConfirmation" in result)
      };
    }) as any
  );
}

recordMcp("mcp_migration_started");
migrate();
recordMcp("mcp_migration_finished");
const db = openDatabase();
recordMcp("mcp_database_opened");

const transport = new StdioServerTransport();
recordMcp("mcp_transport_connect_started");
await mcpServer.connect(transport);
recordMcp("mcp_transport_connected");
console.error(`d-max MCP server started with ${runner.list().length} tools.`);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
