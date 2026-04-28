import type { ConfirmationRequest, ToolName } from "./tool-definitions.js";

const CONFIRMATION_REQUIRED_TOOLS = new Set<ToolName>([
  "archiveProject",
  "updateProjectMarkdown",
  "deleteTask"
]);

type ConfirmationInput = {
  tool: ToolName;
  input: Record<string, unknown>;
};

export function requiresConfirmation({ tool, input }: ConfirmationInput): boolean {
  if (input.confirmed === true) {
    return false;
  }

  return CONFIRMATION_REQUIRED_TOOLS.has(tool);
}

export function buildConfirmationRequest({ tool, input }: ConfirmationInput): ConfirmationRequest {
  return {
    ok: false,
    requiresConfirmation: true,
    confirmationKind: tool,
    summary: `Confirm ${tool}?`,
    proposedAction: {
      tool,
      input
    }
  };
}
