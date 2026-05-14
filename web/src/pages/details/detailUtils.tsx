import type { DragEvent, FocusEvent, PointerEvent, ReactNode } from "react";
import type { AppOverview, Category, EntityParticipant, Initiative, InitiativeType, PartyRelationshipWithParties, ProjectPhase, Task } from "../../types.js";

export type CreateInitiativeInput = {
  categoryId: number;
  parentId?: number | null;
  type: InitiativeType;
  projectPhase?: ProjectPhase;
  name: string;
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
  isLocked?: boolean;
};

export type UpdateInitiativeInput = {
  categoryId?: number;
  parentId?: number | null;
  type?: InitiativeType;
  projectPhase?: ProjectPhase;
  name?: string;
  status?: Initiative["status"];
  summary?: string | null;
  markdown?: string;
  startDate?: string | null;
  endDate?: string | null;
  isLocked?: boolean;
};

export type UpdateTaskInput = {
  title?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  notes?: string | null;
  dueAt?: string | null;
};

export type RelationshipCreateSlot = "parent" | "child" | "predecessor" | "successor";
export type RelationshipCreateDraft = {
  name: string;
  type: Exclude<InitiativeType, "habit">;
  categoryId: string;
};

export const initiativeTypeOptions: Array<{ value: InitiativeType; label: string }> = [
  { value: "idea", label: "Idee" },
  { value: "project", label: "Projekt" },
  { value: "habit", label: "Gewohnheit" }
];

export const initiativeStatusOptions: Array<{ value: Initiative["status"]; label: string }> = [
  { value: "active", label: "Aktiv" },
  { value: "paused", label: "Pausiert" },
  { value: "completed", label: "Abgeschlossen" },
  { value: "archived", label: "Archiviert" }
];

export const projectPhaseOptions: Array<{ value: ProjectPhase; label: string }> = [
  { value: "planning", label: "Planning" },
  { value: "doing", label: "Doing" }
];

export const taskPriorityOptions: Array<{ value: Task["priority"]; label: string }> = [
  { value: "low", label: "Niedrig" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "Hoch" },
  { value: "urgent", label: "Dringend" }
];

export function taskPriorityLabel(priority: Task["priority"]): string {
  return taskPriorityOptions.find((option) => option.value === priority)?.label ?? priority;
}

export function taskStatusLabel(status: Task["status"]): string {
  return status === "done" ? "Erledigt" : "Offen";
}

export function initiativeTypeLabel(type: InitiativeType): string {
  return initiativeTypeOptions.find((option) => option.value === type)?.label ?? "Eintrag";
}

export function initiativeStatusLabel(status: Initiative["status"]): string {
  return initiativeStatusOptions.find((option) => option.value === status)?.label ?? status;
}

export function projectPhaseLabel(phase: ProjectPhase): string {
  return projectPhaseOptions.find((option) => option.value === phase)?.label ?? phase;
}

export function pluralLabelForInitiativeType(type: InitiativeType): string {
  if (type === "idea") return "Ideen";
  if (type === "habit") return "Gewohnheiten";
  return "Projekte";
}

export function defaultInitiativeMarkdown(type: InitiativeType, name: string): string {
  if (type === "idea") {
    return `# Gedanke\n\n${name}\n\n# Offene Fragen\n\n- \n`;
  }

  if (type === "habit") {
    return `# Praxis\n\n${name}\n\n# Rhythmus\n\nNoch offen.\n\n# Reflexion\n\nNoch keine Reflexion.\n`;
  }

  return `# Ziel\n\n${name}\n\n# Kontext\n\nNoch offen.\n\n# Naechste Massnahmen\n\n- \n`;
}

export function InitiativeTypeBadge({ type }: { type: InitiativeType }) {
  return <span className={`type-badge ${type}`}>{initiativeTypeLabel(type)}</span>;
}

export function InitiativeTypeInitial({ type }: { type: InitiativeType }) {
  const label = initiativeTypeLabel(type);
  return (
    <span className={`type-initial ${type}`} title={label} aria-label={label}>
      {type === "idea" ? "I" : type === "project" ? "P" : "H"}
    </span>
  );
}

export function displayInitiativeName(project: Pick<Initiative, "name" | "isSystem">): string {
  return project.isSystem && project.name === "Inbox" ? "Task Inbox" : project.name;
}

export function initiativeDescendantIds(initiatives: Initiative[], initiativeId: number): Set<number> {
  const descendants = new Set<number>();
  const childrenByParent = new Map<number, Initiative[]>();
  for (const initiative of initiatives) {
    if (!initiative.parentId) continue;
    const children = childrenByParent.get(initiative.parentId) ?? [];
    children.push(initiative);
    childrenByParent.set(initiative.parentId, children);
  }

  const stack = [...(childrenByParent.get(initiativeId) ?? [])];
  while (stack.length > 0) {
    const child = stack.pop()!;
    if (descendants.has(child.id)) continue;
    descendants.add(child.id);
    stack.push(...(childrenByParent.get(child.id) ?? []));
  }
  return descendants;
}

export function initiativeAncestorIds(initiatives: Initiative[], initiativeId: number): Set<number> {
  const byId = new Map(initiatives.map((initiative) => [initiative.id, initiative]));
  const ancestors = new Set<number>();
  let current = byId.get(initiativeId);
  while (current?.parentId && !ancestors.has(current.parentId)) {
    ancestors.add(current.parentId);
    current = byId.get(current.parentId);
  }
  return ancestors;
}

export function initiativeCandidateOptionGroups(
  initiatives: Initiative[],
  categories: AppOverview["categories"],
  currentCategoryId: number
): ReactNode[] {
  const categoryById = new Map(categories.map((category) => [category.id, category]));
  const categoryIds = [...new Set(initiatives.map((initiative) => initiative.categoryId))].sort((leftId, rightId) => {
    if (leftId === currentCategoryId) return -1;
    if (rightId === currentCategoryId) return 1;
    const leftName = categoryById.get(leftId)?.name ?? "Uncategorized";
    const rightName = categoryById.get(rightId)?.name ?? "Uncategorized";
    return leftName.localeCompare(rightName) || leftId - rightId;
  });

  return categoryIds.map((categoryId) => {
    const category = categoryById.get(categoryId);
    const categoryInitiatives = initiatives
      .filter((initiative) => initiative.categoryId === categoryId && initiative.type !== "habit")
      .sort(compareInitiativeCandidates);
    return (
      <optgroup key={categoryId} label={category?.name ?? "Uncategorized"}>
        {categoryInitiatives.map((initiative) => (
          <option key={initiative.id} value={initiative.id}>
            {initiativeCandidateOptionLabel(initiative)}
          </option>
        ))}
      </optgroup>
    );
  });
}

export function compareInitiativeCandidates(left: Initiative, right: Initiative): number {
  const typeRank = { idea: 0, project: 1, habit: 2 };
  return typeRank[left.type] - typeRank[right.type] || displayInitiativeName(left).localeCompare(displayInitiativeName(right)) || left.id - right.id;
}

export function initiativeCandidateOptionLabel(initiative: Initiative): string {
  const typeLabel = initiative.type === "idea" ? "Idea" : "Project";
  return `[${typeLabel}] ${displayInitiativeName(initiative)}`;
}

export function propsCountLabel(count: number, singularLabel: string, pluralLabel: string): string {
  return count === 1 ? singularLabel : pluralLabel;
}

export function sortInitiativesForDisplay(initiatives: Initiative[]): Initiative[] {
  return [...initiatives].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id - right.id);
}

export function firstMarkdownLine(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean) ?? "No initiative memory yet";
}

export function initiativeDateRangeInvalid(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate > endDate);
}

export function primeEmptyDatePickerMonth(
  event: PointerEvent<HTMLInputElement> | FocusEvent<HTMLInputElement>,
  preferredDate: string,
  committedValue: string
): void {
  if (!preferredDate || committedValue) return;
  const input = event.currentTarget;
  input.dataset.primedEmptyDate = "true";
  input.dataset.primedDateValue = preferredDate;
  input.value = preferredDate;
}

export function restorePrimedEmptyDateInput(event: FocusEvent<HTMLInputElement>, committedValue: string): void {
  const input = event.currentTarget;
  const primedDate = input.dataset.primedDateValue;
  const shouldRestoreEmpty = input.dataset.primedEmptyDate === "true" && !committedValue && primedDate && input.value === primedDate;
  delete input.dataset.primedEmptyDate;
  delete input.dataset.primedDateValue;
  if (shouldRestoreEmpty) {
    input.value = "";
  }
}

export function formatInitiativeDateRangeForUi(project: Pick<Initiative, "startDate" | "endDate">): string | null {
  if (project.startDate && project.endDate) {
    return `${formatDateOnly(project.startDate)} - ${formatDateOnly(project.endDate)}`;
  }
  if (project.startDate) {
    return `ab ${formatDateOnly(project.startDate)}`;
  }
  if (project.endDate) {
    return `bis ${formatDateOnly(project.endDate)}`;
  }
  return null;
}

export function formatDateTimeForUi(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function formatTaskDueDate(value: string): string {
  return formatDateOnly(datePart(value));
}

export function datePart(value: string): string {
  return value.slice(0, 10);
}

export function moveIdToDropPosition(ids: number[], draggedId: number, targetId: number, placeAfter: boolean): number[] {
  const nextIds = ids.filter((id) => id !== draggedId);
  const targetIndex = nextIds.indexOf(targetId);
  if (targetIndex === -1) {
    return ids;
  }
  nextIds.splice(targetIndex + (placeAfter ? 1 : 0), 0, draggedId);
  return nextIds;
}

export function dropAfter(event: DragEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

export function nullableText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kilobytes = bytes / 1024;
  if (kilobytes < 1024) return `${kilobytes.toFixed(kilobytes >= 100 ? 0 : 1)} KB`;
  const megabytes = kilobytes / 1024;
  return `${megabytes.toFixed(megabytes >= 100 ? 0 : 1)} MB`;
}

export function formatMediaTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

export function documentExtension(name: string): string {
  const match = name.toLowerCase().match(/\.([a-z0-9]+)$/);
  return match?.[1] ?? "";
}

export function entityTypeLabel(entityType: EntityParticipant["entityType"]): string {
  if (entityType === "task") return "Massnahme";
  if (entityType === "calendar_entry") return "Kalendereintrag";
  return "Initiative";
}

export function participantRoleSummary(participant: EntityParticipant): string {
  const parts = [participant.roleType?.label, participant.roleLabel].filter((part): part is string => Boolean(part));
  const uniqueParts = [...new Set(parts)];
  if (participant.isPrimary) {
    uniqueParts.push("primär");
  }
  return uniqueParts.length > 0 ? uniqueParts.join(" · ") : "Rolle offen";
}

export function partyRelationshipLabel(relationship: PartyRelationshipWithParties, perspectivePartyId: number): string {
  const label =
    relationship.relationshipType.directionality === "symmetric"
      ? relationship.relationshipType.label
      : relationship.fromPartyId === perspectivePartyId
        ? relationship.relationshipType.label
        : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
  return [label, relationship.roleLabel].filter(Boolean).join(" · ");
}

export function salutationLabel(salutation: "mr" | "mrs" | "unknown"): string {
  if (salutation === "mr") return "Herr";
  if (salutation === "mrs") return "Frau";
  return "Anrede unbekannt";
}

export function taskCompletionRank(status: Task["status"]): number {
  return status === "done" ? 1 : 0;
}

export function sortTasksByCompletionAndRank(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const statusCompare = taskCompletionRank(a.status) - taskCompletionRank(b.status);
    return statusCompare || a.sortOrder - b.sortOrder || a.id - b.id;
  });
}

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}
