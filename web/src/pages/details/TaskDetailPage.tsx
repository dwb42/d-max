import { useEffect, useRef, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import { CalendarDays, CheckCircle2, Circle, Pencil, Plus, Trash2, X } from "lucide-react";
import { DescriptionBlock, EditModal, EmptyState, EntityDetailPage, EntityHeader, ErrorState, InlineEditableText, MetadataGrid, SectionBlock } from "../../components/ui/index.js";
import { fetchPartyActivitySummaries } from "../../api.js";
import type { Category, Initiative, Lead, LeadStatus, Organization, OrganizationPersonActivity, PartyActivitySummary, PartyRelationshipWithParties, Person, Task, TaskChecklistItem, TaskDetail } from "../../types.js";
import { LeadsPanel, MediaAttachmentsPanel } from "./SharedDetailPanels.js";
import { type UpdateTaskInput, datePart, displayInitiativeName, dropAfter, formatDateTimeForUi, formatTaskDueDate, initiativeTypeLabel, moveIdToDropPosition, taskStatusLabel } from "./detailUtils.js";

export function TaskHeaderTitle(props: {
  task: Task | null;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
}) {
  if (!props.task) return <>Maßnahme</>;
  return (
    <InlineEditableText
      value={props.task.title}
      label="Maßnahmentitel"
      required
      className="entity-title-edit"
      onSave={(value) => props.onUpdateTask(props.task!.id, { title: value })}
    />
  );
}

export function taskHeaderFacts(
  task: Task,
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>
): Array<{ label: string; value: ReactNode; hideLabel?: boolean }> {
  return [
    {
      label: "Status",
      value: <TaskStatusToggle task={task} onUpdateTask={onUpdateTask} />,
      hideLabel: true
    },
    {
      label: "Fällig",
      value: <TaskDueDateEditor task={task} onUpdateTask={onUpdateTask} />,
      hideLabel: true
    }
  ];
}

function TaskStatusToggle(props: {
  task: Task;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function toggleStatus() {
    if (busy) return;
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { status: props.task.status === "done" ? "open" : "done" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <button
      type="button"
      className={`task-status-toggle task-header-control ${props.task.status}`}
      disabled={busy}
      onClick={() => void toggleStatus()}
      title={props.task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
    >
      {props.task.status === "done" ? <CheckCircle2 size={16} /> : <Circle size={16} />}
      {taskStatusLabel(props.task.status)}
    </button>
  );
}

function taskActivityPartyIds(primaryPartyId: number | null, leads: Lead[]): number[] {
  const partyIds = new Set<number>();
  if (primaryPartyId) partyIds.add(primaryPartyId);
  for (const lead of leads) {
    partyIds.add(lead.partyId);
    if (lead.party.type !== "person") continue;
    for (const relationship of lead.relationships ?? []) {
      const organizationId = relatedOrganizationPartyId(relationship, lead.partyId);
      if (organizationId) partyIds.add(organizationId);
    }
  }
  return [...partyIds];
}

function relatedOrganizationPartyId(relationship: PartyRelationshipWithParties, personId: number): number | null {
  if (relationship.status !== "active") return null;
  if (!["works_for", "member_of", "founder_of"].includes(relationship.relationshipType.key)) return null;
  if (relationship.fromPartyId === personId && relationship.toParty.type === "organization") return relationship.toPartyId;
  if (relationship.toPartyId === personId && relationship.fromParty.type === "organization") return relationship.fromPartyId;
  return null;
}

export function TaskDetailView(props: {
  detail: TaskDetail | null;
  loadError: string | null;
  projects: Initiative[];
  categories: Category[];
  people: Person[];
  organizations: Organization[];
  leadStatuses: LeadStatus[];
  onCreateLead: (input: {
    partyId: number;
    initiativeId?: number | null;
    taskId?: number | null;
    statusId?: number | null;
  }) => Promise<void>;
  onUpdateLeadStatus: (leadId: number, statusId: number) => Promise<void>;
  onDeleteLead: (leadId: number) => Promise<void>;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
  onOpenTask?: (taskId: number) => void;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
  onMoveTask: (taskId: number, targetProjectId: number) => Promise<void>;
  onCreateChecklistItem: (taskId: number, name: string) => Promise<void>;
  onUpdateChecklistItem: (taskId: number, itemId: number, input: { name?: string; status?: TaskChecklistItem["status"] }) => Promise<void>;
  onDeleteChecklistItem: (taskId: number, itemId: number) => Promise<void>;
  onReorderChecklistItems: (taskId: number, itemIds: number[]) => Promise<void>;
  onUploadMedia: (taskId: number, file: File) => Promise<void>;
  onUpdateMedia: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDeleteMedia: (linkId: number) => Promise<void>;
  onReorderMedia: (taskId: number, linkIds: number[]) => Promise<void>;
}) {
  const [moveProjectModalOpen, setMoveProjectModalOpen] = useState(false);
  const [activitySummaries, setActivitySummaries] = useState<Record<number, PartyActivitySummary>>({});
  const [organizationPeopleActivity, setOrganizationPeopleActivity] = useState<Record<number, OrganizationPersonActivity[]>>({});
  const activityPartyIds = props.detail
    ? taskActivityPartyIds(props.detail.task.primaryPartyId, props.detail.leads ?? [])
    : [];

  const summaryPartyKey = activityPartyIds.join(":");

  useEffect(() => {
    if (activityPartyIds.length === 0) {
      setActivitySummaries({});
      setOrganizationPeopleActivity({});
      return;
    }
    let cancelled = false;
    fetchPartyActivitySummaries(activityPartyIds, { includeOrganizationPeople: true })
      .then((response) => {
        if (cancelled) return;
        setActivitySummaries(Object.fromEntries(response.summaries.map((summary) => [summary.partyId, summary])));
        setOrganizationPeopleActivity(response.organizationPeople ?? {});
      })
      .catch(() => {
        if (cancelled) return;
        setActivitySummaries({});
        setOrganizationPeopleActivity({});
      });
    return () => {
      cancelled = true;
    };
  }, [props.detail?.task.id, summaryPartyKey]);

  if (props.loadError) {
    return (
      <EntityDetailPage>
        <ErrorState
          title="Maßnahme nicht gefunden"
          description="Diese Maßnahme existiert nicht mehr oder konnte nicht geladen werden."
        />
      </EntityDetailPage>
    );
  }

  if (!props.detail) {
    return (
      <EntityDetailPage>
        <EmptyState title="Maßnahme wird geladen" />
      </EntityDetailPage>
    );
  }

  const { task, initiative, category } = props.detail;
  const checklistItems = props.detail.checklistItems ?? [];
  const leads = props.detail.leads ?? [];
  const mediaAttachments = props.detail.mediaAttachments ?? [];
  const currentCategoryId = category?.id ?? null;
  const moveProjectCandidates = props.projects
    .filter((project) => project.type === "project" && project.id !== task.initiativeId && project.status !== "archived")
    .sort((left, right) => {
      if (left.categoryId === currentCategoryId && right.categoryId !== currentCategoryId) return -1;
      if (right.categoryId === currentCategoryId && left.categoryId !== currentCategoryId) return 1;
      return displayInitiativeName(left).localeCompare(displayInitiativeName(right)) || left.id - right.id;
    });
  const aside = (
    <>
      <TaskChecklistPanel
        task={task}
        items={checklistItems}
        onCreateItem={props.onCreateChecklistItem}
        onUpdateItem={props.onUpdateChecklistItem}
        onDeleteItem={props.onDeleteChecklistItem}
        onReorderItems={props.onReorderChecklistItems}
      />
      <MetadataGrid
        items={[
          { label: "Erstellt am", value: task.createdAt ? formatDateTimeForUi(task.createdAt) : null },
          { label: "Aktualisiert am", value: task.updatedAt ? formatDateTimeForUi(task.updatedAt) : null },
          {
            label: "Projekt / Initiative",
            value: initiative ? (
              <span className="task-project-metadata">
                <span>{displayInitiativeName(initiative)}</span>
                <button
                  type="button"
                  className="metadata-edit-button"
                  disabled={moveProjectCandidates.length === 0}
                  title={moveProjectCandidates.length === 0 ? "Kein anderes Projekt verfügbar" : "Projekt / Initiative ändern"}
                  aria-label="Projekt oder Initiative dieser Maßnahme ändern"
                  onClick={() => setMoveProjectModalOpen(true)}
                >
                  <Pencil size={13} />
                </button>
              </span>
            ) : null
          }
        ]}
      />
    </>
  );

  return (
    <>
      <EntityDetailPage className="task-detail" aside={aside}>
        <TaskNotesPanel task={task} onUpdateTask={props.onUpdateTask} />
        <LeadsPanel
          entityType="task"
          entityId={task.id}
          leads={leads}
          leadStatuses={props.leadStatuses}
          people={props.people}
          organizations={props.organizations}
          activitySummaries={activitySummaries}
          organizationPeopleActivity={organizationPeopleActivity}
          onCreateLead={props.onCreateLead}
          onUpdateLeadStatus={props.onUpdateLeadStatus}
          onDeleteLead={props.onDeleteLead}
          onOpenPerson={props.onOpenPerson}
          onOpenOrganization={props.onOpenOrganization}
          onOpenTask={props.onOpenTask}
        />
        <MediaAttachmentsPanel
          entityType="task"
          entityId={task.id}
          attachments={mediaAttachments}
          surface="section"
          onUpload={props.onUploadMedia}
          onUpdate={props.onUpdateMedia}
          onDelete={props.onDeleteMedia}
          onReorder={props.onReorderMedia}
        />
      </EntityDetailPage>
      {moveProjectModalOpen && initiative ? (
        <TaskMoveProjectModal
          task={task}
          currentProject={initiative}
          projects={moveProjectCandidates}
          categories={props.categories}
          onCancel={() => setMoveProjectModalOpen(false)}
          onMove={async (targetProjectId) => {
            await props.onMoveTask(task.id, targetProjectId);
            setMoveProjectModalOpen(false);
          }}
        />
      ) : null}
    </>
  );
}

function TaskMoveProjectModal(props: {
  task: Task;
  currentProject: Initiative;
  projects: Initiative[];
  categories: Category[];
  onCancel: () => void;
  onMove: (targetProjectId: number) => Promise<void>;
}) {
  const [targetProjectId, setTargetProjectId] = useState(() => String(props.projects[0]?.id ?? ""));
  const [busy, setBusy] = useState(false);
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const categoryIds = [...new Set(props.projects.map((project) => project.categoryId))];

  useEffect(() => {
    setTargetProjectId(String(props.projects[0]?.id ?? ""));
    setBusy(false);
  }, [props.task.id, props.projects]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsedTargetId = Number(targetProjectId);
    if (!Number.isInteger(parsedTargetId) || parsedTargetId <= 0 || busy) return;
    setBusy(true);
    try {
      await props.onMove(parsedTargetId);
    } finally {
      setBusy(false);
    }
  }

  return (
    <EditModal
      title="Maßnahme verschieben"
      label="Projekt dieser Maßnahme ändern"
      description={`Aktuell: ${displayInitiativeName(props.currentProject)}`}
      onCancel={props.onCancel}
      onSubmit={(event) => void submit(event)}
      footer={(
        <>
          <button type="submit" className="primary-action compact" disabled={busy || !targetProjectId}>
            Verschieben
          </button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={busy}>
            Abbrechen
          </button>
        </>
      )}
    >
      {props.projects.length === 0 ? (
        <EmptyState title="Kein anderes Projekt verfügbar" />
      ) : (
        <label className="form-field">
          <span>Zielprojekt</span>
          <select value={targetProjectId} disabled={busy} onChange={(event) => setTargetProjectId(event.target.value)}>
            {categoryIds.map((categoryId) => (
              <optgroup key={categoryId} label={categoryById.get(categoryId)?.name ?? "Ohne Lebensbereich"}>
                {props.projects
                  .filter((project) => project.categoryId === categoryId)
                  .map((project) => (
                    <option key={project.id} value={project.id}>
                      {displayInitiativeName(project)}
                    </option>
                  ))}
              </optgroup>
            ))}
          </select>
        </label>
      )}
    </EditModal>
  );
}

function TaskChecklistPanel(props: {
  task: Task;
  items: TaskChecklistItem[];
  onCreateItem: (taskId: number, name: string) => Promise<void>;
  onUpdateItem: (taskId: number, itemId: number, input: { name?: string; status?: TaskChecklistItem["status"] }) => Promise<void>;
  onDeleteItem: (taskId: number, itemId: number) => Promise<void>;
  onReorderItems: (taskId: number, itemIds: number[]) => Promise<void>;
}) {
  const newItemInputRef = useRef<HTMLInputElement | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [draggedItemId, setDraggedItemId] = useState<number | null>(null);
  const [dropItemId, setDropItemId] = useState<number | null>(null);
  const itemIds = props.items.map((item) => item.id);

  useEffect(() => {
    setNewName("");
    setCreating(false);
    setBusyItemId(null);
    setEditingItemId(null);
    setEditingName("");
    setDraggedItemId(null);
    setDropItemId(null);
  }, [props.task.id]);

  const createItem = async () => {
    const trimmedName = newName.trim();
    if (!trimmedName || creating) return;
    setCreating(true);
    try {
      await props.onCreateItem(props.task.id, trimmedName);
      setNewName("");
    } finally {
      setCreating(false);
      requestAnimationFrame(() => newItemInputRef.current?.focus());
    }
  };

  const saveItemName = async (item: TaskChecklistItem) => {
    const trimmedName = editingName.trim();
    if (!trimmedName || busyItemId) return;
    if (trimmedName === item.name) {
      setEditingItemId(null);
      return;
    }
    setBusyItemId(item.id);
    try {
      await props.onUpdateItem(props.task.id, item.id, { name: trimmedName });
      setEditingItemId(null);
    } finally {
      setBusyItemId(null);
    }
  };

  const toggleItem = async (item: TaskChecklistItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    try {
      await props.onUpdateItem(props.task.id, item.id, { status: item.status === "done" ? "todo" : "done" });
    } finally {
      setBusyItemId(null);
    }
  };

  const deleteItem = async (item: TaskChecklistItem) => {
    if (busyItemId) return;
    setBusyItemId(item.id);
    try {
      await props.onDeleteItem(props.task.id, item.id);
    } finally {
      setBusyItemId(null);
    }
  };

  const completedCount = props.items.filter((item) => item.status === "done").length;

  return (
    <SectionBlock
      title="Checkliste"
      className="task-checklist-panel"
      actions={<span className="task-checklist-progress">{completedCount}/{props.items.length}</span>}
    >

      <div className="task-checklist-items">
        {props.items.map((item) => (
          <article
            key={item.id}
            className={`task-checklist-item ${item.status} ${draggedItemId === item.id ? "dragging" : ""} ${dropItemId === item.id ? "drag-over" : ""}`}
            draggable
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              setDraggedItemId(item.id);
            }}
            onDragOver={(event) => {
              if (!draggedItemId) return;
              event.preventDefault();
              setDropItemId(item.id);
            }}
            onDrop={(event) => {
              event.preventDefault();
              if (!draggedItemId) return;
              void props.onReorderItems(props.task.id, moveIdToDropPosition(itemIds, draggedItemId, item.id, dropAfter(event)));
              setDraggedItemId(null);
              setDropItemId(null);
            }}
            onDragEnd={() => {
              setDraggedItemId(null);
              setDropItemId(null);
            }}
          >
            <button
              type="button"
              className="icon-button"
              disabled={busyItemId === item.id}
              onClick={() => void toggleItem(item)}
              title={item.status === "done" ? "Wieder öffnen" : "Abhaken"}
            >
              {item.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
            </button>
            {editingItemId === item.id ? (
              <form
                className="task-checklist-name-form"
                onSubmit={(event) => {
                  event.preventDefault();
                  void saveItemName(item);
                }}
              >
                <input
                  autoFocus
                  value={editingName}
                  disabled={busyItemId === item.id}
                  onChange={(event) => setEditingName(event.target.value)}
                  onBlur={() => void saveItemName(item)}
                  onKeyDown={(event) => {
                    if (event.key === "Escape") {
                      event.preventDefault();
                      setEditingItemId(null);
                      setEditingName("");
                    }
                  }}
                />
              </form>
            ) : (
              <button
                type="button"
                className="task-checklist-name"
                onClick={() => {
                  setEditingItemId(item.id);
                  setEditingName(item.name);
                }}
                title="Name bearbeiten"
              >
                {item.name}
              </button>
            )}
            <button
              type="button"
              className="icon-button danger"
              disabled={busyItemId === item.id}
              onClick={() => void deleteItem(item)}
              title="Checklisteneintrag löschen"
            >
              <Trash2 size={16} />
            </button>
          </article>
        ))}
      </div>

      <form
        className="task-checklist-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          void createItem();
        }}
      >
        <input
          ref={newItemInputRef}
          value={newName}
          disabled={creating}
          placeholder="Neuer Eintrag"
          onChange={(event) => setNewName(event.target.value)}
        />
        <button type="submit" className="icon-button" disabled={creating || !newName.trim()} title="Checklisteneintrag hinzufügen">
          <Plus size={17} />
        </button>
      </form>
    </SectionBlock>
  );
}

function TaskDueDateEditor(props: { task: Task; onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void> }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const inputValue = props.task.dueAt ? datePart(props.task.dueAt) : "";

  useEffect(() => {
    setBusy(false);
  }, [props.task.id, props.task.dueAt]);

  const saveDueDate = async (nextDueAt: string | null) => {
    if (busy) return;
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { dueAt: nextDueAt });
    } finally {
      setBusy(false);
    }
  };

  const openDatePicker = () => {
    const input = inputRef.current;
    if (!input || busy) return;
    input.focus();
    const pickerInput = input as HTMLInputElement & { showPicker?: () => void };
    try {
      if (typeof pickerInput.showPicker === "function") {
        pickerInput.showPicker();
      } else {
        input.click();
      }
    } catch {
      input.click();
    }
  };

  return (
    <div className="task-date-editor">
      <label
        className="task-date-picker-control task-header-control"
        title="Fälligkeitsdatum bearbeiten"
        role="button"
        aria-label="Fälligkeitsdatum bearbeiten"
        tabIndex={0}
        onClick={(event) => {
          event.preventDefault();
          openDatePicker();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openDatePicker();
        }}
      >
        <CalendarDays size={14} aria-hidden="true" />
        <span>{props.task.dueAt ? formatTaskDueDate(props.task.dueAt) : "Ohne Datum"}</span>
        <input
          ref={inputRef}
          type="date"
          value={inputValue}
          disabled={busy}
          aria-label="Fälligkeitsdatum"
          tabIndex={-1}
          onChange={(event) => {
            const value = event.target.value;
            void saveDueDate(value || null);
          }}
        />
      </label>
      {props.task.dueAt ? (
        <button type="button" className="icon-button danger" disabled={busy} onClick={() => void saveDueDate(null)} title="Fälligkeitsdatum entfernen">
          <X size={16} />
        </button>
      ) : null}
    </div>
  );
}

function TaskNotesPanel(props: { task: Task; onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [notes, setNotes] = useState(props.task.notes ?? "");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setNotes(props.task.notes ?? "");
    setEditing(false);
    setBusy(false);
  }, [props.task.id, props.task.notes]);

  const saveNotes = async () => {
    if (busy) return;
    const nextNotes = notes.trim() ? notes : null;
    if (nextNotes === props.task.notes) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { notes: nextNotes });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <EditModal
        title="Notizen bearbeiten"
        label="Aufgaben-Notizen bearbeiten"
        onCancel={() => {
          setNotes(props.task.notes ?? "");
          setEditing(false);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void saveNotes();
        }}
        footer={(
          <>
            <button className="primary-action compact" type="submit" disabled={busy}>
              Speichern
            </button>
            <button
              type="button"
              className="small-button"
              onClick={() => {
                setNotes(props.task.notes ?? "");
                setEditing(false);
              }}
              disabled={busy}
            >
              Abbrechen
            </button>
          </>
        )}
      >
        <textarea
          autoFocus
          className="initiative-markdown-editor"
          value={notes}
          disabled={busy}
          rows={10}
          onChange={(event) => setNotes(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void saveNotes();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setNotes(props.task.notes ?? "");
              setEditing(false);
            }
          }}
        />
      </EditModal>
    );
  }

  return (
    <DescriptionBlock
      text={props.task.notes}
      emptyTitle="Noch keine Notizen vorhanden."
      emptyDescription="Klicke in diese Fläche, um Kontext zu ergänzen."
      onEdit={() => setEditing(true)}
    />
  );
}
