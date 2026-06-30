import { z } from "zod";

import { mediaEntityTypeBody } from "./request-schemas.js";
import type { InitiativeStatus, InitiativeType } from "../repositories/initiatives.js";
import type { MediaEntityType } from "../repositories/media-links.js";

export function parseConversationContextQuery(url: URL) {
  const contextType = z
    .enum([
      "global",
      "categories",
      "ideas",
      "projects",
      "habits",
      "tasks",
      "initiatives",
      "people",
      "organizations",
      "category",
      "idea",
      "project",
      "habit",
      "initiative",
      "task",
      "person",
      "organization"
    ])
    .parse(url.searchParams.get("contextType"));
  const entityId = parseOptionalPositiveInt(url.searchParams.get("contextEntityId"));

  if (contextType === "global") {
    return { type: "global" as const };
  }

  if (["categories", "ideas", "projects", "habits", "tasks", "initiatives", "people", "organizations"].includes(contextType)) {
    return { type: contextType } as
      | { type: "categories" }
      | { type: "ideas" }
      | { type: "projects" }
      | { type: "habits" }
      | { type: "tasks" }
      | { type: "initiatives" }
      | { type: "people" }
      | { type: "organizations" };
  }

  if (!entityId) {
    throw new Error(`contextEntityId is required for ${contextType} conversations`);
  }

  if (contextType === "category") return { type: "category" as const, categoryId: entityId };
  if (contextType === "idea" || contextType === "project" || contextType === "habit" || contextType === "initiative") {
    return { type: contextType, initiativeId: entityId } as
      | { type: "idea"; initiativeId: number }
      | { type: "project"; initiativeId: number }
      | { type: "habit"; initiativeId: number }
      | { type: "initiative"; initiativeId: number };
  }
  if (contextType === "task") return { type: "task" as const, taskId: entityId };
  return { type: contextType, partyId: entityId } as { type: "person"; partyId: number } | { type: "organization"; partyId: number };
}

export function parseOptionalStatus(status: string | null): InitiativeStatus | undefined {
  if (status === "active" || status === "paused" || status === "completed" || status === "archived") {
    return status;
  }

  return undefined;
}

export function parseOptionalInitiativeType(type: string | null): InitiativeType | undefined {
  if (type === "idea" || type === "project" || type === "habit") {
    return type;
  }

  return undefined;
}

export function parseOptionalInitiativeRelationType(type: string | null): "precedes" | undefined {
  return type === "precedes" ? "precedes" : undefined;
}

export function parseOptionalParticipantEntityType(type: string | null): "initiative" | "task" | "calendar_entry" | undefined {
  return type === "initiative" || type === "task" || type === "calendar_entry" ? type : undefined;
}

export function parseOptionalContactPointType(type: string | null): "email" | "phone" | "whatsapp" | "signal" | "telegram" | "linkedin" | "website" | "other" | undefined {
  if (
    type === "email" ||
    type === "phone" ||
    type === "whatsapp" ||
    type === "signal" ||
    type === "telegram" ||
    type === "linkedin" ||
    type === "website" ||
    type === "other"
  ) {
    return type;
  }
  return undefined;
}

export function parseOptionalRelationshipStatus(status: string | null): "active" | "inactive" | undefined {
  return status === "active" || status === "inactive" ? status : undefined;
}

export function parsePlanningCanvasFilters(url: URL) {
  return {
    search: url.searchParams.get("search")?.trim() || undefined,
    categoryId: parseOptionalPositiveInt(url.searchParams.get("categoryId")) ?? undefined,
    type: parseOptionalInitiativeType(url.searchParams.get("type")),
    status: parseOptionalStatus(url.searchParams.get("status")),
    includeArchived: url.searchParams.get("includeArchived") === "true"
  };
}

export function parseOptionalGraphDepth(value: string | null): number | undefined {
  const parsed = parseOptionalNonNegativeInt(value);
  return parsed === null ? undefined : Math.min(parsed, 20);
}

export function parseOptionalPositiveInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}

export function parseOptionalNonNegativeInt(value: string | null): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function parseMediaEntityTarget(url: URL): { entityType: MediaEntityType; entityId: number; caption?: string | null } {
  const entityType = mediaEntityTypeBody.parse(url.searchParams.get("entityType"));
  const entityId = parseOptionalPositiveInt(url.searchParams.get("entityId"));
  if (!entityId) {
    throw new Error("entityId is required for media attachments");
  }
  return {
    entityType,
    entityId,
    caption: url.searchParams.get("caption")
  };
}
