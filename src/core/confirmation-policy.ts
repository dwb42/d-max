import type { ConfirmationRequest, ToolName } from "./tool-definitions.js";

const CONFIRMATION_REQUIRED_TOOLS = new Set<ToolName>([
  "archiveInitiative",
  "updateInitiativeMarkdown",
  "deleteTask"
]);

type ConfirmationInput = {
  tool: ToolName;
  input: Record<string, unknown>;
  allowConfirmedActions?: boolean;
};

export function requiresConfirmation({ tool, input, allowConfirmedActions = false }: ConfirmationInput): boolean {
  if (input.confirmed === true && allowConfirmedActions) {
    return false;
  }

  if (tool === "updateInitiative" && typeof input.type === "string") {
    return true;
  }

  return CONFIRMATION_REQUIRED_TOOLS.has(tool);
}

export function buildConfirmationRequest({ tool, input }: ConfirmationInput): ConfirmationRequest {
  return {
    ok: false,
    requiresConfirmation: true,
    confirmationKind: tool,
    summary: `Confirmation required for ${tool}. This tool call was not applied.`,
    proposedAction: {
      tool,
      input: withoutConfirmedFlag(input)
    }
  };
}

function withoutConfirmedFlag(input: Record<string, unknown>): Record<string, unknown> {
  const { confirmed: _confirmed, ...rest } = input;
  return rest;
}
