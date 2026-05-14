import { useState } from "react";
import { CheckCircle2, Circle, Plus, Trash2 } from "lucide-react";
import { ConfirmModal, EditModal, EmptyState, EntityList, EntityListItem, EntityListPage, ErrorState } from "../../components/ui/index.js";
import type { AppOverview, Category, Initiative, Task } from "../../types.js";
import { displayInitiativeName, formatTaskDueDate, initiativeTypeLabel, sortInitiativesForDisplay, taskCompletionRank, taskPriorityLabel, taskPriorityOptions, taskStatusLabel } from "./listUtils.js";

export { TasksListView as TaskListPage };

function TasksListView(props: {
  tasks: Task[];
  initiatives: Initiative[];
  categories: AppOverview["categories"];
  onToggleTaskStatus: (task: Task) => Promise<void>;
  onDeleteTask: (task: Task) => Promise<void>;
  onOpenTask: (taskId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const sortedTasks = sortTasksForList(props.tasks, initiativeById);
  const trimmedSearch = search.trim().toLowerCase();
  const filteredTasks = sortedTasks.filter((task) => {
    if (!trimmedSearch) return true;
    const initiative = initiativeById.get(task.initiativeId) ?? null;
    const category = initiative ? categoryById.get(initiative.categoryId) ?? null : null;
    return [
      task.title,
      task.notes,
      taskStatusLabel(task.status),
      taskPriorityLabel(task.priority),
      task.dueAt ? formatTaskDueDate(task.dueAt) : null,
      initiative ? displayInitiativeName(initiative) : null,
      initiative ? initiativeTypeLabel(initiative.type) : null,
      category?.name ?? null
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="task-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Maßnahme suchen" aria-label="Maßnahme suchen" />
      </div>

      {props.tasks.length === 0 ? (
        <EmptyState
          title="Keine offenen Maßnahmen"
          description="Lege eine Maßnahme an oder öffne ein Projekt, um die nächste konkrete Aktion festzuhalten."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Maßnahme hinzufügen
            </button>
          )}
        />
      ) : null}
      {props.tasks.length > 0 && filteredTasks.length === 0 ? (
        <EmptyState
          title="Keine Maßnahmen gefunden"
          description="Passe die Suche an, um die Maßnahmenliste wieder zu erweitern."
        />
      ) : null}
      {filteredTasks.length > 0 ? (
        <EntityList>
          {filteredTasks.map((task) => {
            const initiative = initiativeById.get(task.initiativeId) ?? null;
            const category = initiative ? categoryById.get(initiative.categoryId) ?? null : null;
            return (
              <EntityListItem
                key={task.id}
                title={task.title}
                meta={taskListMeta(task)}
                description={taskListContext(initiative, category)}
                onOpen={() => props.onOpenTask(task.id)}
                openLabel={`Maßnahme ${task.title} öffnen`}
                leadingAction={(
                    <button
                      type="button"
                      className="icon-button"
                      onClick={() => void props.onToggleTaskStatus(task)}
                      title={task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
                      aria-label={task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
                    >
                      {task.status === "done" ? <CheckCircle2 size={17} /> : <Circle size={17} />}
                    </button>
                )}
                actions={(
                  <span className="task-list-actions">
                    <button
                      type="button"
                      className="icon-button subtle-danger"
                      onClick={() => setTaskToDelete(task)}
                      title="Maßnahme löschen"
                      aria-label="Maßnahme löschen"
                    >
                      <Trash2 size={15} />
                    </button>
                  </span>
                )}
              />
            );
          })}
        </EntityList>
      ) : null}
      {taskToDelete ? (
        <ConfirmModal
          title="Maßnahme löschen?"
          description={(
            <>
              <p>Die Maßnahme „{taskToDelete.title}“ wird gelöscht.</p>
              <p>Beim Löschen werden ebenfalls entfernt:</p>
              <ul>
                <li>Beschreibung</li>
                <li>Checkliste, falls vorhanden</li>
                <li>Angehängte Medien</li>
              </ul>
            </>
          )}
          confirmLabel="Maßnahme löschen"
          onCancel={() => setTaskToDelete(null)}
          onConfirm={async () => {
            await props.onDeleteTask(taskToDelete);
            setTaskToDelete(null);
          }}
        />
      ) : null}
    </EntityListPage>
  );
}

export function TaskCreateModal(props: {
  initiatives: Initiative[];
  onCancel: () => void;
  onCreate: (input: { initiativeId: number; title: string; priority?: Task["priority"]; dueAt?: string | null }) => Promise<void>;
}) {
  const sortedInitiatives = sortInitiativesForDisplay(props.initiatives);
  const [initiativeId, setInitiativeId] = useState<number>(sortedInitiatives[0]?.id ?? 0);
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<Task["priority"]>("normal");
  const [dueAt, setDueAt] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedInitiativeId = sortedInitiatives.some((initiative) => initiative.id === initiativeId) ? initiativeId : sortedInitiatives[0]?.id ?? 0;
  const canCreate = Boolean(title.trim() && selectedInitiativeId);

  return (
    <EditModal
      title="Maßnahme hinzufügen"
      label="Maßnahme hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || !selectedInitiativeId || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            initiativeId: selectedInitiativeId,
            title: trimmedTitle,
            priority,
            dueAt: dueAt || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Maßnahme konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Anlegen</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      {sortedInitiatives.length === 0 ? (
        <ErrorState title="Kein Kontext vorhanden" description="Lege zuerst ein Projekt, eine Idee oder eine Gewohnheit an, bevor du eine Maßnahme erstellst." />
      ) : (
        <>
          <label>
            Kontext
            <select value={selectedInitiativeId || ""} onChange={(event) => setInitiativeId(Number(event.target.value))} disabled={creating}>
              {sortedInitiatives.map((initiative) => (
                <option key={initiative.id} value={initiative.id}>
                  {displayInitiativeName(initiative)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Titel
            <input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Maßnahme benennen" autoFocus disabled={creating} />
          </label>
          <div className="modal-two-column">
            <label>
              Priorität
              <select value={priority} onChange={(event) => setPriority(event.target.value as Task["priority"])} disabled={creating}>
                {taskPriorityOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Fällig
              <input type="date" value={dueAt} onChange={(event) => setDueAt(event.target.value)} disabled={creating} />
            </label>
          </div>
        </>
      )}
      {error ? <ErrorState title="Maßnahme konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function taskListMeta(task: Task): string {
  return [
    taskStatusLabel(task.status),
    taskPriorityLabel(task.priority),
    task.dueAt ? `Fällig ${formatTaskDueDate(task.dueAt)}` : null
  ].filter(Boolean).join(" · ");
}

function taskListContext(initiative: Initiative | null, category: Category | null): string | null {
  if (!initiative) return null;
  return [
    displayInitiativeName(initiative),
    category?.name ?? null
  ].filter(Boolean).join(" · ");
}

function sortTasksForList(tasks: Task[], initiativeById: Map<number, Initiative>): Task[] {
  const priorityRank: Record<Task["priority"], number> = { urgent: 0, high: 1, normal: 2, low: 3 };
  return [...tasks].sort((left, right) => {
    const statusCompare = taskCompletionRank(left.status) - taskCompletionRank(right.status);
    if (statusCompare) return statusCompare;
    const dueCompare = (left.dueAt ?? "9999-12-31").localeCompare(right.dueAt ?? "9999-12-31");
    if (dueCompare) return dueCompare;
    const priorityCompare = priorityRank[left.priority] - priorityRank[right.priority];
    if (priorityCompare) return priorityCompare;
    const leftInitiative = initiativeById.get(left.initiativeId);
    const rightInitiative = initiativeById.get(right.initiativeId);
    return (leftInitiative?.sortOrder ?? 0) - (rightInitiative?.sortOrder ?? 0)
      || left.sortOrder - right.sortOrder
      || left.title.localeCompare(right.title)
      || left.id - right.id;
  });
}
