import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, CheckCircle2, Circle, LayoutGrid, ListTree, Plus, Trash2, X } from "lucide-react";
import { DescriptionBlock, EditModal, EmptyState, EntityDetailPage, EntityHeader, ErrorState, InlineEditableText, MetadataGrid, RelationItem, RelationList, SectionBlock } from "../../components/ui/index.js";
import type { Category, Initiative, InitiativeType, Organization, ParticipantRoleType, Person, Task, TaskChecklistItem, TaskDetail } from "../../types.js";
import { MediaAttachmentsPanel, ParticipantsPanel } from "./SharedDetailPanels.js";
import { type UpdateTaskInput, datePart, displayInitiativeName, dropAfter, formatDateTimeForUi, formatTaskDueDate, initiativeTypeLabel, moveIdToDropPosition, taskPriorityLabel, taskPriorityOptions, taskStatusLabel } from "./detailUtils.js";

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
): Array<{ label: string; value: ReactNode }> {
  return [
    {
      label: "Status",
      value: <TaskStatusToggle task={task} onUpdateTask={onUpdateTask} />
    },
    {
      label: "Priorität",
      value: <TaskPrioritySelect task={task} onUpdateTask={onUpdateTask} />
    },
    {
      label: "Fällig",
      value: <TaskDueDateEditor task={task} onUpdateTask={onUpdateTask} />
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

function TaskPrioritySelect(props: {
  task: Task;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  async function updatePriority(priority: Task["priority"]) {
    if (busy || priority === props.task.priority) return;
    setBusy(true);
    try {
      await props.onUpdateTask(props.task.id, { priority });
    } finally {
      setBusy(false);
    }
  }

  return (
    <label className={`detail-pill-select task-header-control priority ${props.task.priority}`} title="Priorität ändern">
      <select
        value={props.task.priority}
        disabled={busy}
        aria-label="Priorität"
        onChange={(event) => void updatePriority(event.target.value as Task["priority"])}
      >
        {taskPriorityOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function TaskDetailView(props: {
  detail: TaskDetail | null;
  loadError: string | null;
  people: Person[];
  organizations: Organization[];
  participantRoleTypes: ParticipantRoleType[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenCategory: (categoryName: string, initiativeType: InitiativeType) => void;
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleTypeId?: number | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onDeleteParticipant: (participantId: number) => Promise<void>;
  onUpdateTask: (taskId: number, input: UpdateTaskInput) => Promise<void>;
  onCreateChecklistItem: (taskId: number, name: string) => Promise<void>;
  onUpdateChecklistItem: (taskId: number, itemId: number, input: { name?: string; status?: TaskChecklistItem["status"] }) => Promise<void>;
  onDeleteChecklistItem: (taskId: number, itemId: number) => Promise<void>;
  onReorderChecklistItems: (taskId: number, itemIds: number[]) => Promise<void>;
  onUploadMedia: (taskId: number, file: File) => Promise<void>;
  onUpdateMedia: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDeleteMedia: (linkId: number) => Promise<void>;
  onReorderMedia: (taskId: number, linkIds: number[]) => Promise<void>;
}) {
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
  const participants = props.detail.participants ?? [];
  const mediaAttachments = props.detail.mediaAttachments ?? [];
  const checklistDone = checklistItems.filter((item) => item.status === "done").length;
  const aside = (
    <MetadataGrid
      items={[
        { label: "Status", value: taskStatusLabel(task.status) },
        { label: "Priorität", value: taskPriorityLabel(task.priority) },
        { label: "Fällig", value: task.dueAt ? formatTaskDueDate(task.dueAt) : "Ohne Fälligkeitsdatum" },
        { label: "Projekt", value: initiative ? displayInitiativeName(initiative) : null },
        { label: "Lebensbereich", value: category?.name ?? null },
        { label: "Checkliste", value: checklistItems.length > 0 ? `${checklistDone}/${checklistItems.length}` : null },
        { label: "Beteiligte", value: participants.length > 0 ? String(participants.length) : null },
        { label: "Medien", value: mediaAttachments.length > 0 ? String(mediaAttachments.length) : null },
        { label: "Erstellt", value: task.createdAt ? formatDateTimeForUi(task.createdAt) : null },
        { label: "Aktualisiert", value: task.updatedAt ? formatDateTimeForUi(task.updatedAt) : null },
        { label: "Erledigt", value: task.completedAt ? formatDateTimeForUi(task.completedAt) : null }
      ]}
    />
  );

  return (
    <EntityDetailPage className="task-detail" aside={aside}>
      <TaskNotesPanel task={task} onUpdateTask={props.onUpdateTask} />
      <TaskChecklistPanel
        task={task}
        items={checklistItems}
        onCreateItem={props.onCreateChecklistItem}
        onUpdateItem={props.onUpdateChecklistItem}
        onDeleteItem={props.onDeleteChecklistItem}
        onReorderItems={props.onReorderChecklistItems}
      />
      <TaskContextSection
        initiative={initiative ?? null}
        category={category ?? null}
        onOpenInitiative={props.onOpenInitiative}
        onOpenCategory={props.onOpenCategory}
      />
      <ParticipantsPanel
        entityType="task"
        entityId={task.id}
        participants={participants}
        people={props.people}
        organizations={props.organizations}
        roleTypes={props.participantRoleTypes}
        surface="section"
        createMode="modal"
        onCreateParticipant={props.onCreateParticipant}
        onDeleteParticipant={props.onDeleteParticipant}
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
  );
}

function TaskContextSection(props: {
  initiative: Initiative | null;
  category: Category | null;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenCategory: (categoryName: string, initiativeType: InitiativeType) => void;
}) {
  if (!props.initiative && !props.category) {
    return (
      <SectionBlock title="Kontext">
        <RelationList emptyMode="inline" emptyTitle="Noch kein Projekt- oder Lebensbereichskontext.">
          {null}
        </RelationList>
      </SectionBlock>
    );
  }

  return (
    <SectionBlock title="Kontext">
      <RelationList emptyMode="none">
        {props.initiative ? (
          <RelationItem
            icon={<ListTree size={16} />}
            title={displayInitiativeName(props.initiative)}
            meta={initiativeTypeLabel(props.initiative.type)}
            onOpen={() => props.onOpenInitiative(props.initiative!.id)}
          />
        ) : null}
        {props.category ? (
          <RelationItem
            icon={<LayoutGrid size={16} />}
            title={props.category.name}
            meta="Lebensbereich"
            onOpen={() => props.category ? props.onOpenCategory(props.category.name, props.initiative?.type ?? "project") : undefined}
          />
        ) : null}
      </RelationList>
    </SectionBlock>
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
