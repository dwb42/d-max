import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { migrate } from "../db/migrate.js";
import { openDatabase } from "../db/connection.js";
import { createToolRunner } from "./tool-registry.js";

const mcpServer = new McpServer({
  name: "d-max",
  version: "0.1.0"
});
const runner = createToolRunner();

for (const tool of runner.list()) {
  mcpServer.registerTool(
    tool.name,
    {
      description: tool.description,
      inputSchema: tool.inputSchema as any
    },
    (async (input: unknown) => {
      const result = await runner.run(tool.name, input, { db });

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

migrate();
const db = openDatabase();

const transport = new StdioServerTransport();
await mcpServer.connect(transport);
console.error(`d-max MCP server started with ${runner.list().length} tools.`);
