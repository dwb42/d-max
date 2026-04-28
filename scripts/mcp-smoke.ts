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

  for (const requiredTool of [
    "createCategory",
    "createProject",
    "createTask",
    "listTasks",
    "createThinkingSpace",
    "getThinkingContext",
    "createThinkingSession",
    "captureThoughts",
    "createTension",
    "renderOpenLoops",
    "renderProjectGate",
    "renderTaskGate"
  ]) {
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

  const thinkingSpace = await callTool(client, "createThinkingSpace", {
    title: `Smoke Thinking ${Date.now()}`,
    summary: "MCP smoke test thinking space"
  });
  console.log(`createThinkingSpace: ${JSON.stringify(thinkingSpace)}`);

  const spaceId = (thinkingSpace as { ok: true; data: { id: number } }).data.id;
  const thinkingSession = await callTool(client, "createThinkingSession", {
    spaceId,
    source: "mcp_smoke",
    rawInput: "I want stronger thinking memory, but I need the deterministic core to stay controllable.",
    summary: "Testing whether exploratory thinking can be captured without creating projects or tasks."
  });
  console.log(`createThinkingSession: ${JSON.stringify(thinkingSession)}`);

  const sessionId = (thinkingSession as { ok: true; data: { id: number } }).data.id;
  const capturedThoughts = await callTool(client, "captureThoughts", {
    thoughts: [
      {
        spaceId,
        sessionId,
        type: "desire",
        content: "Dietrich wants a stronger thinking memory.",
        maturity: "named",
        confidence: 0.86,
        heat: 0.78
      },
      {
        spaceId,
        sessionId,
        type: "constraint",
        content: "The deterministic core must stay controllable.",
        maturity: "named",
        confidence: 0.9,
        heat: 0.82
      },
      {
        spaceId,
        sessionId,
        type: "possible_project",
        content: "Build the Thinking System as the post-MVP Brainstorm Mode foundation.",
        maturity: "connected",
        confidence: 0.8,
        heat: 0.75
      },
      {
        spaceId,
        sessionId,
        type: "possible_task",
        content: "Test the Thinking System manual flow.",
        maturity: "committed",
        confidence: 0.9,
        heat: 0.7
      }
    ]
  });
  console.log(`captureThoughts: ${JSON.stringify(capturedThoughts)}`);

  const captured = (capturedThoughts as { ok: true; data: Array<{ id: number; type: string }> }).data;
  const projectCandidateId = captured.find((thought) => thought.type === "possible_project")?.id;
  const taskCandidateId = captured.find((thought) => thought.type === "possible_task")?.id;

  if (!projectCandidateId || !taskCandidateId) {
    throw new Error("Expected project and task candidates in smoke thoughts");
  }

  const tension = await callTool(client, "createTension", {
    spaceId,
    sessionId,
    want: "A powerful thinking partner",
    but: "A deterministic core that remains inspectable and controlled",
    pressure: "high"
  });
  console.log(`createTension: ${JSON.stringify(tension)}`);

  const openLoops = await callTool(client, "renderOpenLoops", {
    spaceId
  });
  console.log(`renderOpenLoops: ${JSON.stringify(openLoops)}`);

  const thinkingContext = await callTool(client, "getThinkingContext", {
    spaceId
  });
  console.log(`getThinkingContext: ${JSON.stringify(thinkingContext)}`);

  const projectGate = await callTool(client, "renderProjectGate", {
    thoughtId: projectCandidateId
  });
  console.log(`renderProjectGate: ${JSON.stringify(projectGate)}`);

  const taskGate = await callTool(client, "renderTaskGate", {
    thoughtId: taskCandidateId,
    allowInbox: true
  });
  console.log(`renderTaskGate: ${JSON.stringify(taskGate)}`);
} finally {
  await transport.close();
}
