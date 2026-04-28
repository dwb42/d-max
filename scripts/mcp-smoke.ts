import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

function parseToolResult(result: Awaited<ReturnType<Client["callTool"]>>): unknown {
  const content = (result as { content?: Array<{ type: string; text?: string }> }).content;
  const first = content?.[0];

  if (!first || first.type !== "text" || first.text === undefined) {
    throw new Error("Expected text content from d-max MCP tool");
  }

  return JSON.parse(first.text);
}

async function callTool(client: Client, name: string, args: Record<string, unknown>): Promise<unknown> {
  const result = await client.callTool({
    name,
    arguments: args
  });

  return parseToolResult(result);
}

const client = new Client(
  {
    name: "d-max-smoke-client",
    version: "0.1.0"
  },
  {
    capabilities: {}
  }
);

const transport = new StdioClientTransport({
  command: "npm",
  args: ["run", "mcp"],
  cwd: process.cwd(),
  stderr: "pipe"
});

transport.stderr?.on("data", (chunk) => {
  process.stderr.write(chunk);
});

try {
  await client.connect(transport);

  const tools = await client.listTools();
  const toolNames = tools.tools.map((tool) => tool.name).sort();

  console.log(`Tools: ${toolNames.join(", ")}`);

  for (const requiredTool of ["createCategory", "createProject", "createTask", "listTasks"]) {
    if (!toolNames.includes(requiredTool)) {
      throw new Error(`Missing required tool: ${requiredTool}`);
    }
  }

  const category = await callTool(client, "createCategory", {
    name: `Smoke ${Date.now()}`,
    description: "MCP smoke test category"
  });
  console.log(`createCategory: ${JSON.stringify(category)}`);

  const categoryId = (category as { ok: true; data: { id: number } }).data.id;
  const project = await callTool(client, "createProject", {
    categoryId,
    name: "MCP Smoke Project",
    markdown: "# Overview\n\nCreated by the MCP smoke test.\n"
  });
  console.log(`createProject: ${JSON.stringify(project)}`);

  const projectId = (project as { ok: true; data: { id: number } }).data.id;
  const task = await callTool(client, "createTask", {
    projectId,
    title: "Verify MCP transport",
    priority: "high"
  });
  console.log(`createTask: ${JSON.stringify(task)}`);

  const inboxTask = await callTool(client, "createTask", {
    title: "Smoke test Inbox capture",
    priority: "urgent",
    useInboxIfProjectMissing: true
  });
  console.log(`createTask Inbox: ${JSON.stringify(inboxTask)}`);

  const tasks = await callTool(client, "listTasks", {});
  console.log(`listTasks: ${JSON.stringify(tasks)}`);
} finally {
  await transport.close();
}
