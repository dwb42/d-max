import type { Initiative } from "../repositories/initiatives.js";

export function assertCanLinkExistingProjectSpan(input: {
  initiative: Initiative | null;
  initiativeId: number;
  hasActiveBinding: boolean;
  initialDirection: "google_to_dmax" | "dmax_to_google";
}): Initiative {
  if (!input.initiative || input.initiative.type !== "project") {
    throw new Error(`Project initiative not found: ${input.initiativeId}`);
  }
  if (input.hasActiveBinding) {
    throw new Error("This project span is already linked to a Google event.");
  }
  if (input.initialDirection === "dmax_to_google" && (!input.initiative.startDate || !input.initiative.endDate)) {
    throw new Error("DMAX-to-Google project span links require the project to have both startDate and endDate.");
  }
  return input.initiative;
}
