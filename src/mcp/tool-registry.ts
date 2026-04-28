import { ToolRunner } from "../core/tool-runner.js";
import { tools } from "../tools/index.js";

export function createToolRunner(): ToolRunner {
  const runner = new ToolRunner();

  for (const tool of tools) {
    runner.register(tool);
  }

  return runner;
}
