import { useEffect, useMemo, useState } from "react";
import type {
  CSSProperties,
  DragEvent,
  FocusEvent as ReactFocusEvent,
  PointerEvent as ReactPointerEvent,
  ReactNode
} from "react";
import { GripVertical, Mic, Plus } from "lucide-react";

import { fetchInitiativeGraph } from "../../api.js";
import { EmptyState } from "../../components/ui/index.js";
import type {
  AppOverview,
  Initiative,
  InitiativeRelationWithInitiatives,
  InitiativeType,
  ProjectPhase,
  Task
} from "../../types.js";

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

const initiativeTypeOptions: Array<{ value: InitiativeType; label: string }> = [
  { value: "idea", label: "Idee" },
  { value: "project", label: "Projekt" },
  { value: "habit", label: "Gewohnheit" }
];

const timelineMonthOptions = [3, 6, 12, 18];

function initiativeTypeLabel(type: InitiativeType): string {
  return initiativeTypeOptions.find((option) => option.value === type)?.label ?? "Eintrag";
}

function pluralLabelForInitiativeType(type: InitiativeType): string {
  if (type === "idea") return "Ideen";
  if (type === "habit") return "Gewohnheiten";
  return "Projekte";
}

function preferredCategoryId(categories: AppOverview["categories"], categoryFilterName: string | null): number {
  const categoryFromRoute = categoryFilterName
    ? categories.find((category) => category.name.toLowerCase() === categoryFilterName.toLowerCase())
    : null;
  return categoryFromRoute?.id ?? categories.find((category) => category.name === "Inbox")?.id ?? categories[0]?.id ?? 0;
}

function defaultInitiativeMarkdown(type: InitiativeType, name: string): string {
  if (type === "idea") {
    return `# Gedanke\n\n${name}\n\n# Offene Fragen\n\n- \n`;
  }

  if (type === "habit") {
    return `# Praxis\n\n${name}\n\n# Rhythmus\n\nNoch offen.\n\n# Reflexion\n\nNoch keine Reflexion.\n`;
  }

  return `# Ziel\n\n${name}\n\n# Kontext\n\nNoch offen.\n\n# Naechste Massnahmen\n\n- \n`;
}

function InitiativeTypeBadge({ type }: { type: InitiativeType }) {
  return <span className={`type-badge ${type}`}>{initiativeTypeLabel(type)}</span>;
}

export function displayInitiativeName(project: Pick<Initiative, "name" | "isSystem">): string {
  return project.isSystem && project.name === "Inbox" ? "Task Inbox" : project.name;
}

function propsCountLabel(count: number, singularLabel: string, pluralLabel: string): string {
  return count === 1 ? singularLabel : pluralLabel;
}

function moveIdToDropPosition(ids: number[], draggedId: number, targetId: number, placeAfter: boolean): number[] {
  if (draggedId === targetId) {
    return ids;
  }

  const withoutDragged = ids.filter((id) => id !== draggedId);
  const targetIndex = withoutDragged.indexOf(targetId);
  if (targetIndex === -1) {
    return ids;
  }

  const insertIndex = placeAfter ? targetIndex + 1 : targetIndex;
  return [...withoutDragged.slice(0, insertIndex), draggedId, ...withoutDragged.slice(insertIndex)];
}

function dropAfter(event: DragEvent<HTMLElement>): boolean {
  const rect = event.currentTarget.getBoundingClientRect();
  return event.clientY > rect.top + rect.height / 2;
}

function firstMarkdownLine(markdown: string): string {
  return markdown
    .split("\n")
    .map((line) => line.replace(/^#+\s*/, "").trim())
    .find(Boolean) ?? "No initiative memory yet";
}

function initiativeDateRangeInvalid(startDate: string, endDate: string): boolean {
  return Boolean(startDate && endDate && startDate > endDate);
}

function primeEmptyDatePickerMonth(
  event: ReactPointerEvent<HTMLInputElement> | ReactFocusEvent<HTMLInputElement>,
  preferredDate: string,
  committedValue: string
): void {
  if (!preferredDate || committedValue) return;
  const input = event.currentTarget;
  input.dataset.primedEmptyDate = "true";
  input.dataset.primedDateValue = preferredDate;
  input.value = preferredDate;
}

function restorePrimedEmptyDateInput(event: ReactFocusEvent<HTMLInputElement>, committedValue: string): void {
  const input = event.currentTarget;
  const primedDate = input.dataset.primedDateValue;
  const shouldRestoreEmpty = input.dataset.primedEmptyDate === "true" && !committedValue && primedDate && input.value === primedDate;
  delete input.dataset.primedEmptyDate;
  delete input.dataset.primedDateValue;
  if (shouldRestoreEmpty) {
    input.value = "";
  }
}

function formatInitiativeDateRangeForUi(project: Pick<Initiative, "startDate" | "endDate">): string | null {
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

function formatDateOnly(value: string): string {
  const [year, month, day] = value.split("-");
  return day && month && year ? `${day}.${month}.${year}` : value;
}

function parseDateOnlyUtc(value: string): Date | null {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) {
    return null;
  }

  return new Date(Date.UTC(year, month - 1, day));
}

function startOfUtcDay(date: Date): Date {
  return new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
}

function daysBetween(start: Date, end: Date): number {
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function visibleTimelineRange(today: Date, monthsAhead: number): { start: Date; end: Date } {
  const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + monthsAhead + 1, 0));
  return { start, end };
}

function buildTimelineMonths(start: Date, end: Date): Array<{ key: string; left: number; width: number; label: string }> {
  const totalDays = daysBetween(start, end) + 1;
  const months: Array<{ key: string; left: number; width: number; label: string }> = [];
  let cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth(), 1));

  while (cursor <= end) {
    const monthStart = cursor < start ? start : cursor;
    const monthEndCandidate = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 0));
    const monthEnd = monthEndCandidate > end ? end : monthEndCandidate;
    months.push({
      key: `${cursor.getUTCFullYear()}-${cursor.getUTCMonth()}`,
      left: dateOffsetPercent(monthStart, start, totalDays) ?? 0,
      width: ((daysBetween(monthStart, monthEnd) + 1) / totalDays) * 100,
      label: cursor.toLocaleDateString("de-DE", { month: "short", year: "numeric", timeZone: "UTC" })
    });
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }

  return months;
}

function buildTimelineWeeks(start: Date, end: Date): Array<{ key: string; left: number; label: string }> {
  const totalDays = daysBetween(start, end) + 1;
  const firstMonday = new Date(start);
  const day = firstMonday.getUTCDay();
  const daysUntilMonday = (8 - day) % 7;
  firstMonday.setUTCDate(firstMonday.getUTCDate() + daysUntilMonday);

  const weeks: Array<{ key: string; left: number; label: string }> = [];
  for (let cursor = firstMonday; cursor <= end; cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth(), cursor.getUTCDate() + 7))) {
    weeks.push({
      key: cursor.toISOString().slice(0, 10),
      left: dateOffsetPercent(cursor, start, totalDays) ?? 0,
      label: String(cursor.getUTCDate())
    });
  }

  return weeks;
}

function dateOffsetPercent(date: Date, start: Date, totalDays: number): number | null {
  if (date < start || totalDays <= 0) {
    return null;
  }

  return (daysBetween(start, date) / totalDays) * 100;
}

function formatTimelineRange(start: Date, end: Date): string {
  return `${start.toLocaleDateString("de-DE", { month: "short", year: "numeric", timeZone: "UTC" })} - ${end.toLocaleDateString("de-DE", {
    month: "short",
    year: "numeric",
    timeZone: "UTC"
  })}`;
}

export function LifeAreaInitiativeGroups(props: {
  groups: Array<{ value: InitiativeType; label: string; categoryId: number; initiatives: Initiative[] }>;
  onOpenInitiative: (initiativeId: number) => void;
  onReorderInitiatives?: (categoryId: number, initiativeIds: number[]) => Promise<void>;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const [openCreateKey, setOpenCreateKey] = useState<string | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creatingKey, setCreatingKey] = useState<string | null>(null);
  const [draggedInitiative, setDraggedInitiative] = useState<{ categoryId: number; type: InitiativeType; initiativeId: number } | null>(null);
  const [initiativeDropId, setInitiativeDropId] = useState<number | null>(null);

  return (
    <div className="life-area-type-grid">
      {props.groups.map((typeGroup) => {
        const createKey = `${typeGroup.categoryId}:${typeGroup.value}`;
        const createOpen = openCreateKey === createKey;
        const creating = creatingKey === createKey;
        const pluralLabel = pluralLabelForInitiativeType(typeGroup.value);
        const canReorder = Boolean(props.onReorderInitiatives) && typeGroup.initiatives.length > 1;
        return (
        <section className="life-area-type-section" key={createKey}>
          <div className="life-area-type-heading">
            <div className="life-area-type-title">
              <span className={`type-heading-label ${typeGroup.value}`}>{pluralLabel}</span>
              <button
                type="button"
                className="icon-button add-inline"
                title={`${typeGroup.label} hinzufügen`}
                aria-label={`${typeGroup.label} hinzufügen`}
                onClick={() => {
                  setOpenCreateKey((current) => current === createKey ? null : createKey);
                  setDraftName("");
                }}
              >
                <Plus size={17} />
              </button>
            </div>
            <span>{typeGroup.initiatives.length}</span>
          </div>
          {createOpen ? (
            <form
              className="life-area-create-form"
              onSubmit={async (event) => {
                event.preventDefault();
                const name = draftName.trim();
                if (!name || creating) {
                  return;
                }
                setCreatingKey(createKey);
                try {
                  await props.onCreateInitiative({
                    categoryId: typeGroup.categoryId,
                    type: typeGroup.value,
                    name,
                    markdown: defaultInitiativeMarkdown(typeGroup.value, name)
                  });
                  setDraftName("");
                  setOpenCreateKey(null);
                } finally {
                  setCreatingKey(null);
                }
              }}
            >
              <input
                autoFocus
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Name"
                aria-label="Name"
              />
              <button type="submit" className="icon-button confirm" disabled={!draftName.trim() || creating} title="Anlegen" aria-label="Anlegen">
                <Plus size={17} />
              </button>
            </form>
          ) : null}
          {typeGroup.initiatives.length === 0 ? (
            <div className="life-area-empty">Keine {typeGroup.label.toLowerCase()}.</div>
          ) : (
            <div className="life-area-initiative-list">
              {typeGroup.initiatives.map((initiative) => (
                <button
                  className={`life-area-initiative-row ${canReorder ? "draggable-row" : ""} ${draggedInitiative?.initiativeId === initiative.id ? "dragging" : ""} ${initiativeDropId === initiative.id ? "drag-over" : ""}`}
                  key={initiative.id}
                  draggable={canReorder}
                  onClick={() => props.onOpenInitiative(initiative.id)}
                  onDragStart={(event) => {
                    if (!canReorder) return;
                    event.dataTransfer.effectAllowed = "move";
                    setDraggedInitiative({ categoryId: typeGroup.categoryId, type: typeGroup.value, initiativeId: initiative.id });
                  }}
                  onDragOver={(event) => {
                    if (!draggedInitiative || draggedInitiative.categoryId !== typeGroup.categoryId || draggedInitiative.type !== typeGroup.value) return;
                    event.preventDefault();
                    setInitiativeDropId(initiative.id);
                  }}
                  onDrop={(event) => {
                    event.preventDefault();
                    if (!draggedInitiative || draggedInitiative.categoryId !== typeGroup.categoryId || draggedInitiative.type !== typeGroup.value) return;
                    const initiativeIds = typeGroup.initiatives.map((candidate) => candidate.id);
                    const nextIds = moveIdToDropPosition(initiativeIds, draggedInitiative.initiativeId, initiative.id, dropAfter(event));
                    setDraggedInitiative(null);
                    setInitiativeDropId(null);
                    void props.onReorderInitiatives?.(typeGroup.categoryId, nextIds);
                  }}
                  onDragEnd={() => {
                    setDraggedInitiative(null);
                    setInitiativeDropId(null);
                  }}
                >
                  <span>{displayInitiativeName(initiative)}</span>
                  <small>
                    {initiative.type === "project" && formatInitiativeDateRangeForUi(initiative) ? `${formatInitiativeDateRangeForUi(initiative)} · ` : ""}
                    {initiative.status}
                  </small>
                </button>
              ))}
            </div>
          )}
        </section>
      );
      })}
    </div>
  );
}

export function InitiativesView({
  categories,
  initiatives,
  tasks,
  initiativeType,
  singularLabel,
  pluralLabel,
  categoryFilterName,
  onOpenInitiative,
  onOpenCategory,
  onReorderCategories,
  onReorderInitiatives,
  onCreateInitiative
}: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  initiativeType: InitiativeType;
  singularLabel: string;
  pluralLabel: string;
  categoryFilterName: string | null;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenCategory: (categoryName: string) => void;
  onReorderCategories: (categoryIds: number[]) => Promise<void>;
  onReorderInitiatives: (categoryId: number, initiativeIds: number[]) => Promise<void>;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const [draggedCategoryId, setDraggedCategoryId] = useState<number | null>(null);
  const [categoryDropId, setCategoryDropId] = useState<number | null>(null);
  const [draggedInitiative, setDraggedProject] = useState<{ categoryId: number; initiativeId: number } | null>(null);
  const [initiativeDropId, setProjectDropId] = useState<number | null>(null);
  const [newInitiativeCategoryId, setNewProjectCategoryId] = useState<number>(() => preferredCategoryId(categories, categoryFilterName));
  const [newInitiativeName, setNewProjectName] = useState("");
  const [newInitiativeStartDate, setNewProjectStartDate] = useState("");
  const [newInitiativeEndDate, setNewProjectEndDate] = useState("");
  const [creatingInitiative, setCreatingProject] = useState(false);
  const [projectRelations, setProjectRelations] = useState<InitiativeRelationWithInitiatives[]>([]);
  const visibleCategories = categoryFilterName
    ? categories.filter((category) => category.name.toLowerCase() === categoryFilterName.toLowerCase())
    : categories;
  const visibleInitiatives = initiatives.filter((project) => project.type === initiativeType);
  const groupedInitiatives = visibleCategories
    .map((category) => ({
      category,
      initiatives: visibleInitiatives.filter((initiative) => initiative.categoryId === category.id)
    }))
    .filter((group) => group.initiatives.length > 0);
  const uncategorizedInitiatives = categoryFilterName ? [] : visibleInitiatives.filter((initiative) => !categories.some((category) => category.id === initiative.categoryId));
  const groups = uncategorizedInitiatives.length > 0
    ? [...groupedInitiatives, { category: { id: 0, name: "Uncategorized", description: null, isSystem: false }, initiatives: uncategorizedInitiatives }]
    : groupedInitiatives;
  const reorderableCategoryIds = groups.map((group) => group.category.id).filter((id) => id > 0);
  const canReorderVisibleInitiatives = initiativeType !== "project";
  const selectedCategoryId = categories.some((category) => category.id === newInitiativeCategoryId)
    ? newInitiativeCategoryId
    : preferredCategoryId(categories, categoryFilterName);
  const hasDateFields = initiativeType === "project";
  const hasInvalidNewProjectDateRange = hasDateFields && initiativeDateRangeInvalid(newInitiativeStartDate, newInitiativeEndDate);

  useEffect(() => {
    const preferred = preferredCategoryId(categories, categoryFilterName);
    if (categoryFilterName || !categories.some((category) => category.id === newInitiativeCategoryId)) {
      setNewProjectCategoryId(preferred);
    }
  }, [categories, categoryFilterName, newInitiativeCategoryId]);

  useEffect(() => {
    if (initiativeType !== "project") {
      setProjectRelations([]);
      return;
    }
    let cancelled = false;
    fetchInitiativeGraph()
      .then((graph) => {
        if (!cancelled) setProjectRelations(graph.relations);
      })
      .catch(() => {
        if (!cancelled) setProjectRelations([]);
      });
    return () => {
      cancelled = true;
    };
  }, [initiativeType, initiatives]);

  return (
    <section className="initiative-grid">
      <form
        className={`entry-create ${hasDateFields ? "with-dates" : ""}`}
        onSubmit={async (event) => {
          event.preventDefault();
          const name = newInitiativeName.trim();
          if (!name || !selectedCategoryId || creatingInitiative || hasInvalidNewProjectDateRange) {
            return;
          }
          setCreatingProject(true);
          try {
            await onCreateInitiative({
              categoryId: selectedCategoryId,
              type: initiativeType,
              name,
              markdown: defaultInitiativeMarkdown(initiativeType, name),
              startDate: hasDateFields ? newInitiativeStartDate || null : undefined,
              endDate: hasDateFields ? newInitiativeEndDate || null : undefined
            });
            setNewProjectName("");
            setNewProjectStartDate("");
            setNewProjectEndDate("");
          } finally {
            setCreatingProject(false);
          }
        }}
      >
        <select value={selectedCategoryId || ""} onChange={(event) => setNewProjectCategoryId(Number(event.target.value))} aria-label="Kategorie">
          {categories.map((category) => (
            <option key={category.id} value={category.id}>
              {category.name}
            </option>
          ))}
        </select>
        <input
          value={newInitiativeName}
          onChange={(event) => setNewProjectName(event.target.value)}
          placeholder={`${singularLabel} benennen`}
        />
        {hasDateFields ? (
          <div className="entry-date-fields">
            <label>
              Start
              <input
                type="date"
                value={newInitiativeStartDate}
                onChange={(event) => setNewProjectStartDate(event.target.value)}
                aria-label="Startdatum"
              />
            </label>
            <label>
              Ende
              <input
                type="date"
                value={newInitiativeEndDate}
                min={newInitiativeStartDate || undefined}
                onPointerDown={(event) => primeEmptyDatePickerMonth(event, newInitiativeStartDate, newInitiativeEndDate)}
                onFocus={(event) => primeEmptyDatePickerMonth(event, newInitiativeStartDate, newInitiativeEndDate)}
                onBlur={(event) => restorePrimedEmptyDateInput(event, newInitiativeEndDate)}
                onChange={(event) => setNewProjectEndDate(event.target.value)}
                aria-label="Enddatum"
              />
            </label>
          </div>
        ) : null}
        <button
          className="primary-action compact"
          type="submit"
          disabled={!newInitiativeName.trim() || !selectedCategoryId || creatingInitiative || hasInvalidNewProjectDateRange}
        >
          <Plus size={17} />
          {creatingInitiative ? "Anlegen" : "Anlegen"}
        </button>
      </form>

      {groups.map((group) => (
        <section
          className={`initiative-category ${draggedCategoryId === group.category.id ? "dragging" : ""} ${categoryDropId === group.category.id ? "drag-over" : ""}`}
          key={group.category.id}
          onDragOver={(event) => {
            if (!draggedCategoryId || group.category.id === 0) return;
            event.preventDefault();
            setCategoryDropId(group.category.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!draggedCategoryId || group.category.id === 0) return;
            const nextIds = moveIdToDropPosition(reorderableCategoryIds, draggedCategoryId, group.category.id, dropAfter(event));
            setDraggedCategoryId(null);
            setCategoryDropId(null);
            void onReorderCategories(nextIds);
          }}
        >
          <div className="initiative-category-heading">
            <div>
              {group.category.id === 0 ? (
                <h2>{group.category.name}</h2>
              ) : (
                <button className="category-link" onClick={() => onOpenCategory(group.category.name)}>
                  {group.category.name}
                </button>
              )}
            </div>
            {group.category.id !== 0 && !categoryFilterName && canReorderVisibleInitiatives ? (
              <button
                className="drag-handle"
                draggable
                onDragStart={(event) => {
                  event.stopPropagation();
                  event.dataTransfer.effectAllowed = "move";
                  setDraggedCategoryId(group.category.id);
                }}
                onDragEnd={() => {
                  setDraggedCategoryId(null);
                  setCategoryDropId(null);
                }}
                title="Kategorie ziehen"
              >
                <GripVertical size={17} />
              </button>
            ) : null}
            <span>{group.initiatives.length} {propsCountLabel(group.initiatives.length, singularLabel, pluralLabel)}</span>
          </div>
          {initiativeType === "project" ? (
            <ProjectStructureList
              projects={group.initiatives}
              tasks={tasks}
              relations={projectRelations}
              onOpenInitiative={onOpenInitiative}
            />
          ) : (
            <div className="initiative-category-list">
              {group.initiatives.map((project) => {
                const initiativeTasks = tasks.filter((task) => task.initiativeId === project.id);
                return (
                  <article
                    className={`initiative-row clickable ${canReorderVisibleInitiatives ? "draggable-row" : ""} ${draggedInitiative?.initiativeId === project.id ? "dragging" : ""} ${initiativeDropId === project.id ? "drag-over" : ""}`}
                    key={project.id}
                    draggable={canReorderVisibleInitiatives}
                    onClick={() => onOpenInitiative(project.id)}
                    onDragStart={(event) => {
                      if (!canReorderVisibleInitiatives) return;
                      event.dataTransfer.effectAllowed = "move";
                      setDraggedProject({ categoryId: group.category.id, initiativeId: project.id });
                    }}
                    onDragOver={(event) => {
                      if (!draggedInitiative || draggedInitiative.categoryId !== group.category.id) return;
                      event.preventDefault();
                      setProjectDropId(project.id);
                    }}
                    onDrop={(event) => {
                      event.preventDefault();
                      if (!draggedInitiative || draggedInitiative.categoryId !== group.category.id) return;
                      const initiativeIds = group.initiatives.map((candidate) => candidate.id);
                      const nextIds = moveIdToDropPosition(initiativeIds, draggedInitiative.initiativeId, project.id, dropAfter(event));
                      setDraggedProject(null);
                      setProjectDropId(null);
                      void onReorderInitiatives(group.category.id, nextIds);
                    }}
                    onDragEnd={() => {
                      setDraggedProject(null);
                      setProjectDropId(null);
                    }}
                  >
                    <div>
                      <div className="initiative-title-line">
                        <h3>{displayInitiativeName(project)}</h3>
                        <InitiativeTypeBadge type={project.type} />
                        {project.isSystem ? <span className="system-badge">System</span> : null}
                      </div>
                      <p>{project.summary ?? firstMarkdownLine(project.markdown)}</p>
                    </div>
                    <div className="row-meta">
                      {project.type === "project" && formatInitiativeDateRangeForUi(project) ? <span>{formatInitiativeDateRangeForUi(project)}</span> : null}
                      <span>{project.status}</span>
                      <span>{initiativeTasks.length} Massnahmen</span>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      ))}
      {groups.length === 0 ? <EmptyState title={`Keine ${pluralLabel.toLowerCase()} in dieser Ansicht`} /> : null}
    </section>
  );
}

function ProjectStructureList(props: {
  projects: Initiative[];
  tasks: Task[];
  relations: InitiativeRelationWithInitiatives[];
  onOpenInitiative: (initiativeId: number) => void;
}) {
  const projectIds = new Set(props.projects.map((project) => project.id));
  const childrenByParent = new Map<number, Initiative[]>();
  for (const project of props.projects) {
    if (!project.parentId || !projectIds.has(project.parentId)) continue;
    const children = childrenByParent.get(project.parentId) ?? [];
    children.push(project);
    childrenByParent.set(project.parentId, sortInitiativesForDisplay(children));
  }
  const roots = sortInitiativesForDisplay(props.projects.filter((project) => !project.parentId || !projectIds.has(project.parentId)));
  const relations = props.relations.filter((relation) => projectIds.has(relation.predecessorInitiativeId) && projectIds.has(relation.successorInitiativeId));

  const renderProject = (project: Initiative, depth: number): ReactNode => {
    const children = childrenByParent.get(project.id) ?? [];
    return (
      <div className="project-structure-node" key={project.id}>
        <ProjectStructureCard
          project={project}
          tasks={props.tasks.filter((task) => task.initiativeId === project.id)}
          onOpenInitiative={props.onOpenInitiative}
        />
        {children.length > 0 ? (
          <div className="project-children" style={{ marginLeft: Math.min(depth + 1, 4) * 18 }}>
            {renderRows(children, depth + 1)}
          </div>
        ) : null}
      </div>
    );
  };

  const renderRows = (projects: Initiative[], depth: number): ReactNode => (
    <div className="project-structure-rows">
      {buildProjectRelationRows(projects, relations).map((row, index) => (
        <div className="project-relation-row" key={`${depth}-${index}-${row.map((project) => project.id).join("-")}`}>
          {row.map((project) => renderProject(project, depth))}
        </div>
      ))}
    </div>
  );

  return <div className="project-structure-list">{renderRows(roots, 0)}</div>;
}

function ProjectStructureCard(props: {
  project: Initiative;
  tasks: Task[];
  onOpenInitiative: (initiativeId: number) => void;
}) {
  return (
    <article className="initiative-row clickable project-structure-card" onClick={() => props.onOpenInitiative(props.project.id)}>
      <div>
        <div className="initiative-title-line">
          <h3>{displayInitiativeName(props.project)}</h3>
          <InitiativeTypeBadge type={props.project.type} />
          {props.project.isSystem ? <span className="system-badge">System</span> : null}
        </div>
        <p>{props.project.summary ?? firstMarkdownLine(props.project.markdown)}</p>
      </div>
      <div className="row-meta">
        {formatInitiativeDateRangeForUi(props.project) ? <span>{formatInitiativeDateRangeForUi(props.project)}</span> : null}
        <span>{props.project.status}</span>
        <span>{props.tasks.length} Massnahmen</span>
      </div>
    </article>
  );
}

function buildProjectRelationRows(projects: Initiative[], relations: InitiativeRelationWithInitiatives[]): Initiative[][] {
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectIds = new Set(projectById.keys());
  const successorsByProject = new Map<number, number[]>();
  const predecessors = new Set<number>();
  for (const relation of relations) {
    if (!projectIds.has(relation.predecessorInitiativeId) || !projectIds.has(relation.successorInitiativeId)) continue;
    const successors = successorsByProject.get(relation.predecessorInitiativeId) ?? [];
    successors.push(relation.successorInitiativeId);
    successorsByProject.set(relation.predecessorInitiativeId, successors);
    predecessors.add(relation.successorInitiativeId);
  }
  for (const [projectId, successors] of successorsByProject) {
    successorsByProject.set(projectId, sortInitiativesForDisplay(successors.map((id) => projectById.get(id)).filter(isInitiative)).map((project) => project.id));
  }

  const visited = new Set<number>();
  const starts = sortInitiativesForDisplay(projects.filter((project) => !predecessors.has(project.id)));
  const orderedStarts = [...starts, ...sortInitiativesForDisplay(projects.filter((project) => predecessors.has(project.id)))];
  const rows: Initiative[][] = [];

  for (const start of orderedStarts) {
    if (visited.has(start.id)) continue;
    const row: Initiative[] = [];
    let current: Initiative | undefined = start;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      row.push(current);
      const nextId: number | undefined = (successorsByProject.get(current.id) ?? []).find((id) => !visited.has(id));
      current = nextId ? projectById.get(nextId) : undefined;
    }
    if (row.length > 0) rows.push(row);
  }

  return rows;
}

function sortInitiativesForDisplay(initiatives: Initiative[]): Initiative[] {
  return [...initiatives].sort((left, right) => left.sortOrder - right.sortOrder || left.name.localeCompare(right.name) || left.id - right.id);
}

function isInitiative(value: Initiative | undefined): value is Initiative {
  return value !== undefined;
}

export function TimelineView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  onOpenInitiative: (initiativeId: number) => void;
}) {
  const [monthsAhead, setMonthsAhead] = useState(6);
  const today = useMemo(() => startOfUtcDay(new Date()), []);
  const range = useMemo(() => visibleTimelineRange(today, monthsAhead), [today, monthsAhead]);
  const totalDays = daysBetween(range.start, range.end) + 1;
  const monthLabels = useMemo(() => buildTimelineMonths(range.start, range.end), [range]);
  const weekLabels = useMemo(() => buildTimelineWeeks(range.start, range.end), [range]);
  const todayOffset = dateOffsetPercent(today, range.start, totalDays);
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const entries = props.initiatives
    .filter((initiative) => initiative.type === "project" && initiative.status === "active" && initiative.startDate && initiative.endDate)
    .map((initiative) => {
      const category = categoryById.get(initiative.categoryId);
      const start = initiative.startDate ? parseDateOnlyUtc(initiative.startDate) : null;
      const end = initiative.endDate ? parseDateOnlyUtc(initiative.endDate) : null;
      if (!category || !start || !end || end < range.start || start > range.end) {
        return null;
      }

      const clippedStart = start < range.start ? range.start : start;
      const clippedEnd = end > range.end ? range.end : end;
      return {
        initiative,
        category,
        left: dateOffsetPercent(clippedStart, range.start, totalDays),
        width: Math.max(((daysBetween(clippedStart, clippedEnd) + 1) / totalDays) * 100, 0.7)
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry))
    .sort((a, b) => {
      const dateCompare = (a.initiative.startDate ?? "").localeCompare(b.initiative.startDate ?? "");
      return dateCompare || a.initiative.sortOrder - b.initiative.sortOrder || a.initiative.name.localeCompare(b.initiative.name);
    });
  const groups = props.categories
    .map((category) => ({
      category,
      entries: entries.filter((entry) => entry.category.id === category.id)
    }))
    .filter((group) => group.entries.length > 0);
  const chartMinWidth = Math.max(980, totalDays * 7);

  return (
    <section className="timeline-panel">
      <div className="timeline-toolbar">
        <div>
          <h2>Projekt-Timeline</h2>
          <p>
            {formatTimelineRange(range.start, range.end)} · aktive Projekte mit Start und Ende
          </p>
        </div>
        <label>
          Zeitraum
          <select value={monthsAhead} onChange={(event) => setMonthsAhead(Number(event.target.value))}>
            {timelineMonthOptions.map((option) => (
              <option key={option} value={option}>
                +{option} Monate
              </option>
            ))}
          </select>
        </label>
      </div>

      {groups.length === 0 ? (
        <EmptyState title="Keine aktiven datierten Projekte in diesem Zeitraum" />
      ) : (
        <div className="timeline-scroll">
          <div className="timeline-frame" style={{ minWidth: chartMinWidth }}>
            <div className="timeline-header-row">
              <div className="timeline-corner">Kategorien</div>
              <div className="timeline-axis">
                <div className="timeline-months">
                  {monthLabels.map((month) => (
                    <div
                      className="timeline-month"
                      key={month.key}
                      style={{ left: `${month.left}%`, width: `${month.width}%` }}
                    >
                      {month.label}
                    </div>
                  ))}
                </div>
                <div className="timeline-weeks">
                  {weekLabels.map((week) => (
                    <div className="timeline-week" key={week.key} style={{ left: `${week.left}%` }}>
                      {week.label}
                    </div>
                  ))}
                </div>
                {todayOffset !== null ? (
                  <div className="timeline-today-label" style={{ left: `${todayOffset}%` }}>
                    Heute
                  </div>
                ) : null}
              </div>
            </div>

            <div className="timeline-body">
              {groups.map((group) => (
                <div
                  className="timeline-row"
                  key={group.category.id}
                  style={{ "--timeline-row-height": `${Math.max(78, 28 + group.entries.length * 38)}px` } as CSSProperties}
                >
                  <div className="timeline-row-label">
                    <span className="timeline-category-swatch" style={{ background: group.category.color }} />
                    <span>{group.category.name}</span>
                    <strong>{group.entries.length}</strong>
                  </div>
                  <div className="timeline-chart">
                    <TimelineGrid monthLabels={monthLabels} weekLabels={weekLabels} todayOffset={todayOffset} />
                    {group.entries.map((entry, index) => (
                      <button
                        className="timeline-bar"
                        key={entry.initiative.id}
                        onClick={() => props.onOpenInitiative(entry.initiative.id)}
                        style={
                          {
                            left: `${entry.left}%`,
                            width: `${entry.width}%`,
                            top: `${14 + index * 38}px`,
                            "--category-color": entry.category.color
                          } as CSSProperties
                        }
                        title={`${displayInitiativeName(entry.initiative)} · ${formatInitiativeDateRangeForUi(entry.initiative) ?? ""}`}
                      >
                        <span>{displayInitiativeName(entry.initiative)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function TimelineGrid(props: {
  monthLabels: Array<{ key: string; left: number; width: number; label: string }>;
  weekLabels: Array<{ key: string; left: number; label: string }>;
  todayOffset: number | null;
}) {
  return (
    <div className="timeline-grid-lines" aria-hidden="true">
      {props.monthLabels.map((month) => (
        <span className="timeline-month-line" key={month.key} style={{ left: `${month.left}%` }} />
      ))}
      {props.weekLabels.map((week) => (
        <span className="timeline-week-line" key={week.key} style={{ left: `${week.left}%` }} />
      ))}
      {props.todayOffset !== null ? <span className="timeline-today-line" style={{ left: `${props.todayOffset}%` }} /> : null}
    </div>
  );
}

export function OnboardingView({ onCreateCategory, onNavigate }: { onCreateCategory: (name: string) => Promise<void>; onNavigate: (path: string) => void }) {
  const [busyCategory, setBusyCategory] = useState<string | null>(null);
  const starterCategories = ["Business", "Reisen", "Health & Fitness", "Family", "Learning", "Soul"];

  return (
    <section className="onboarding">
      <div>
        <span className="eyebrow">Fresh start</span>
        <h2>Baue dein DMAX-Memory von null auf.</h2>
        <p>Starte mit Kategorien oder Drive Mode. Projekte und Tasks entstehen weiter ueber DMAX im passenden Kontext.</p>
      </div>
      <div className="quick-actions">
        <button className="secondary-action" onClick={() => onNavigate("/drive")}>
          <Mic size={18} />
          Drive Mode
        </button>
      </div>
      <div className="category-chips">
        {starterCategories.map((name) => (
          <button
            key={name}
            className="chip-button"
            disabled={busyCategory === name}
            onClick={async () => {
              setBusyCategory(name);
              try {
                await onCreateCategory(name);
              } finally {
                setBusyCategory(null);
              }
            }}
          >
            {busyCategory === name ? "Adding..." : name}
          </button>
        ))}
      </div>
    </section>
  );
}
