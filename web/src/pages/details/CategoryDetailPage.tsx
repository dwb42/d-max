import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Plus } from "lucide-react";
import { DescriptionBlock, EditModal, EntityDetailPage, ErrorState, MetadataGrid, RelationGroup, RelationItem, SectionBlock } from "../../components/ui/index.js";
import type { AppOverview, Category, Initiative, InitiativeType, Task } from "../../types.js";
import { type CreateInitiativeInput, compareInitiativeCandidates, defaultInitiativeMarkdown, displayInitiativeName, formatDateTimeForUi, formatInitiativeDateRangeForUi, formatTaskDueDate, initiativeStatusLabel, initiativeTypeLabel, initiativeTypeOptions, pluralLabelForInitiativeType, propsCountLabel, taskPriorityLabel, taskStatusLabel } from "./detailUtils.js";

export { LifeAreaDetailView as CategoryDetailPage };

export function categoryHeaderFacts(category: Category, initiatives: Initiative[], tasks: Task[]): Array<{ label: string; value: ReactNode }> {
  const items: Array<{ label: string; value: ReactNode }> = [
    { label: "Symbol", value: <span className="category-symbol-fact">{category.emoji}</span> },
    { label: "Farbe", value: <span className="category-color-fact"><span style={{ background: category.color }} />{category.color}</span> },
    { label: "Arbeit", value: `${initiatives.length} ${propsCountLabel(initiatives.length, "Eintrag", "Einträge")} · ${tasks.length} ${propsCountLabel(tasks.length, "Maßnahme", "Maßnahmen")}` }
  ];
  if (category.isSystem) {
    items.push({ label: "Status", value: "Systembereich" });
  }
  return items;
}

function categoryMetadataItems(category: Category, initiatives: Initiative[], tasks: Task[]): Array<{ label: string; value: ReactNode | null | undefined }> {
  const projects = initiatives.filter((initiative) => initiative.type === "project");
  const ideas = initiatives.filter((initiative) => initiative.type === "idea");
  const habits = initiatives.filter((initiative) => initiative.type === "habit");
  return [
    { label: "Symbol", value: category.emoji },
    { label: "Farbe", value: <span className="category-color-fact"><span style={{ background: category.color }} />{category.color}</span> },
    { label: "Projekte", value: projects.length },
    { label: "Ideen", value: ideas.length },
    { label: "Gewohnheiten", value: habits.length },
    { label: "Maßnahmen", value: tasks.length },
    { label: "Systembereich", value: category.isSystem ? "Ja" : null },
    { label: "Erstellt", value: category.createdAt ? formatDateTimeForUi(category.createdAt) : null },
    { label: "Aktualisiert", value: category.updatedAt ? formatDateTimeForUi(category.updatedAt) : null }
  ];
}

function LifeAreaDetailView(props: {
  category: AppOverview["categories"][number] | null;
  initiatives: Initiative[];
  tasks: Task[];
  onBack: () => void;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
  onUpdateCategory: (categoryId: number, input: { name?: string; description?: string | null; color?: string | null }) => Promise<void>;
}) {
  const [descriptionModalOpen, setDescriptionModalOpen] = useState(false);
  const [descriptionDraft, setDescriptionDraft] = useState("");
  const [descriptionBusy, setDescriptionBusy] = useState(false);

  useEffect(() => {
    setDescriptionDraft(props.category?.description ?? "");
    setDescriptionModalOpen(false);
  }, [props.category]);

  if (!props.category) {
    return (
      <EntityDetailPage className="category-detail-page">
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der angeforderte Lebensbereich existiert nicht oder konnte nicht geladen werden."
        />
      </EntityDetailPage>
    );
  }

  const category = props.category;
  const initiatives = props.initiatives.filter((initiative) => initiative.categoryId === category.id);
  const initiativeIds = new Set(initiatives.map((initiative) => initiative.id));
  const tasks = props.tasks.filter((task) => task.initiativeId !== null && initiativeIds.has(task.initiativeId));

  return (
    <>
      <EntityDetailPage
        className="category-detail-page"
        aside={<MetadataGrid items={categoryMetadataItems(category, initiatives, tasks)} />}
      >
        <DescriptionBlock
          text={category.description}
          emptyTitle="Noch kein Kontext erfasst."
          emptyDescription="Klicken, um Zweck, Grenzen oder aktuelle Leitgedanken dieses Lebensbereichs zu ergänzen."
          onEdit={() => {
            setDescriptionDraft(category.description ?? "");
            setDescriptionModalOpen(true);
          }}
        />

        <CategoryRelatedWorkSection
          category={category}
          initiatives={initiatives}
          tasks={tasks}
          onOpenInitiative={props.onOpenInitiative}
          onOpenTask={props.onOpenTask}
          onCreateInitiative={props.onCreateInitiative}
        />
      </EntityDetailPage>

      {descriptionModalOpen ? (
        <EditModal
          title="Kontext bearbeiten"
          label="Lebensbereich-Kontext bearbeiten"
          className="markdown-modal"
          onCancel={() => setDescriptionModalOpen(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            if (descriptionBusy) return;
            setDescriptionBusy(true);
            try {
              await props.onUpdateCategory(category.id, { description: descriptionDraft });
              setDescriptionModalOpen(false);
            } finally {
              setDescriptionBusy(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={descriptionBusy}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setDescriptionModalOpen(false)} disabled={descriptionBusy}>Abbrechen</button>
            </>
          )}
        >
          <label>
            Beschreibung
            <textarea
              value={descriptionDraft}
              onChange={(event) => setDescriptionDraft(event.target.value)}
              rows={14}
              autoFocus
            />
          </label>
        </EditModal>
      ) : null}
    </>
  );
}

function CategoryRelatedWorkSection(props: {
  category: Category;
  initiatives: Initiative[];
  tasks: Task[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const [openCreateType, setOpenCreateType] = useState<InitiativeType | null>(null);
  const [draftName, setDraftName] = useState("");
  const [creatingType, setCreatingType] = useState<InitiativeType | null>(null);
  const initiativesByType = initiativeTypeOptions.map((option) => ({
    ...option,
    initiatives: props.initiatives
      .filter((initiative) => initiative.type === option.value)
      .sort(compareInitiativeCandidates)
  }));
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const tasks = [...props.tasks].sort(compareCategoryTasks);

  async function createForType(type: InitiativeType) {
    const name = draftName.trim();
    if (!name || creatingType) return;
    setCreatingType(type);
    try {
      await props.onCreateInitiative({
        categoryId: props.category.id,
        type,
        name,
        markdown: defaultInitiativeMarkdown(type, name)
      });
      setDraftName("");
      setOpenCreateType(null);
    } finally {
      setCreatingType(null);
    }
  }

  return (
    <SectionBlock title="Verknüpfte Arbeit" className="category-related-work">
      <div className="relation-section-stack">
        {initiativesByType.map((group) => {
          const createOpen = openCreateType === group.value;
          const creating = creatingType === group.value;
          return (
            <RelationGroup
              key={group.value}
              title={pluralLabelForInitiativeType(group.value)}
              actions={(
                <button
                  type="button"
                  className="section-primary-action"
                  onClick={() => {
                    setOpenCreateType((current) => current === group.value ? null : group.value);
                    setDraftName("");
                  }}
                >
                  <Plus size={15} />
                  {group.label} hinzufügen
                </button>
              )}
              emptyMode="none"
            >
              {createOpen ? (
                <form
                  className="category-create-inline-form"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void createForType(group.value);
                  }}
                >
                  <input
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    placeholder={`${group.label} benennen`}
                    aria-label={`${group.label} benennen`}
                    autoFocus
                  />
                  <button type="submit" className="primary-button" disabled={!draftName.trim() || creating}>
                    Anlegen
                  </button>
                  <button type="button" className="small-button" onClick={() => setOpenCreateType(null)} disabled={creating}>
                    Abbrechen
                  </button>
                </form>
              ) : null}
              {group.initiatives.map((initiative) => (
                <RelationItem
                  key={initiative.id}
                  icon={<span>{categoryInitiativeIconLabel(initiative.type)}</span>}
                  title={displayInitiativeName(initiative)}
                  meta={categoryInitiativeMeta(initiative)}
                  detail={initiative.summary}
                  onOpen={() => props.onOpenInitiative(initiative.id)}
                />
              ))}
            </RelationGroup>
          );
        })}

        <RelationGroup title="Maßnahmen" emptyMode="none">
          {tasks.map((task) => {
            const initiative = task.initiativeId ? initiativeById.get(task.initiativeId) ?? null : null;
            return (
              <RelationItem
                key={task.id}
                icon={<span>M</span>}
                title={task.title}
                meta={categoryTaskMeta(task)}
                detail={initiative ? displayInitiativeName(initiative) : null}
                onOpen={() => props.onOpenTask(task.id)}
              />
            );
          })}
        </RelationGroup>
      </div>
    </SectionBlock>
  );
}

function categoryInitiativeIconLabel(type: InitiativeType): string {
  if (type === "idea") return "I";
  if (type === "habit") return "G";
  return "P";
}

function categoryInitiativeMeta(initiative: Initiative): string {
  const parts = [initiativeTypeLabel(initiative.type), initiativeStatusLabel(initiative.status)];
  const dateRange = initiative.type === "project" ? formatInitiativeDateRangeForUi(initiative) : "";
  if (dateRange) parts.push(dateRange);
  return parts.join(" · ");
}

function categoryTaskMeta(task: Task): string {
  const parts = [taskStatusLabel(task.status), taskPriorityLabel(task.priority)];
  if (task.dueAt) parts.push(formatTaskDueDate(task.dueAt));
  return parts.join(" · ");
}

function compareCategoryTasks(left: Task, right: Task): number {
  const statusRank = { open: 0, done: 1 };
  return statusRank[left.status] - statusRank[right.status]
    || (left.dueAt ?? "9999-12-31").localeCompare(right.dueAt ?? "9999-12-31")
    || left.sortOrder - right.sortOrder
    || left.title.localeCompare(right.title)
    || left.id - right.id;
}
