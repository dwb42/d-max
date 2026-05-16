import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import { executeDmaxTool } from "./http-adapter.mjs";

const pluginDir = dirname(fileURLToPath(import.meta.url));
const manifest = JSON.parse(readFileSync(join(pluginDir, "openclaw.plugin.json"), "utf8"));
const toolNames = Array.isArray(manifest?.contracts?.tools) ? manifest.contracts.tools : [];
const emptyObjectParameters = {
  type: "object",
  properties: {},
  additionalProperties: true
};

export default definePluginEntry({
  id: "dmax-dynamic-tools",
  name: "DMAX Dynamic Tools",
  description: "Expose DMAX deterministic tools as OpenClaw dynamic tools through the dmax-api internal tool endpoint.",
  register(api) {
    for (const toolName of toolNames) {
      api.registerTool({
        name: toolName,
        description: `Execute the DMAX tool ${toolName}.`,
        parameters: emptyObjectParameters,
        async execute(toolCallId, params) {
          return executeDmaxTool(toolName, params, {
            traceId: typeof toolCallId === "string" ? `dmax-dynamic-tools-${toolCallId}` : undefined
          });
        }
      });
    }
  }
});
