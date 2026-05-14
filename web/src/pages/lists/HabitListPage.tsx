import { useState } from "react";
import { Plus } from "lucide-react";
import { EditModal, EmptyState, EntityList, EntityListItem, EntityListPage, ErrorState } from "../../components/ui/index.js";
import type { AppOverview, Category, Initiative, Task } from "../../types.js";
import { type CreateInitiativeInput, defaultInitiativeMarkdown, displayInitiativeName, initiativeStatusLabel, preferredCategoryId, sortInitiativesForDisplay } from "./listUtils.js";

export { HabitsView as HabitListPage };

function HabitsView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenHabit: (initiativeId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const categoryFilter = props.categoryFilterName
    ? props.categories.find((category) => category.name.toLowerCase() === props.categoryFilterName?.toLowerCase()) ?? null
    : null;
  const habits = sortInitiativesForDisplay(
    props.initiatives.filter((initiative) => initiative.type === "habit" && (!props.categoryFilterName || initiative.categoryId === categoryFilter?.id))
  );
  const trimmedSearch = search.trim().toLowerCase();
  const filteredHabits = habits.filter((habit) => {
    if (!trimmedSearch) return true;
    const category = categoryById.get(habit.categoryId);
    return [
      displayInitiativeName(habit),
      habit.summary,
      habit.markdown,
      initiativeStatusLabel(habit.status),
      category?.name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="habit-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Gewohnheit suchen" aria-label="Gewohnheit suchen" />
      </div>

      {props.categoryFilterName && !categoryFilter ? (
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der gefilterte Gewohnheitsbereich existiert nicht oder konnte nicht geladen werden."
        />
      ) : null}
      {!props.categoryFilterName && props.initiatives.filter((initiative) => initiative.type === "habit").length === 0 ? (
        <EmptyState
          title="Noch keine Gewohnheiten"
          description="Lege die erste Gewohnheit an, um wiederkehrende Praxis im System sichtbar zu machen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Gewohnheit hinzufügen
            </button>
          )}
        />
      ) : null}
      {habits.length > 0 && filteredHabits.length === 0 ? (
        <EmptyState
          title="Keine Gewohnheiten gefunden"
          description="Passe die Suche an, um die Gewohnheitenliste wieder zu erweitern."
        />
      ) : null}
      {props.categoryFilterName && categoryFilter && habits.length === 0 ? (
        <EmptyState
          title="Keine Gewohnheiten in diesem Lebensbereich"
          description="Dieser Lebensbereich enthält noch keine Gewohnheiten."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Gewohnheit hinzufügen
            </button>
          )}
        />
      ) : null}
      {filteredHabits.length > 0 ? (
        <EntityList>
          {filteredHabits.map((habit) => {
            const category = categoryById.get(habit.categoryId) ?? null;
            const taskCount = props.tasks.filter((task) => task.initiativeId === habit.id).length;
            return (
              <EntityListItem
                key={habit.id}
                marker={(
                  <span className="habit-list-avatar">
                    <span>{habitInitials(habit)}</span>
                    {category ? <span className="habit-list-swatch" style={{ background: category.color }} /> : null}
                  </span>
                )}
                title={displayInitiativeName(habit)}
                meta={habitListMeta(habit, category)}
                description={habitDescriptionPreview(habit)}
                stats={taskCount > 0 ? [{ label: "Maßnahmen", value: taskCount }] : undefined}
                onOpen={() => props.onOpenHabit(habit.id)}
              />
            );
          })}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

export function HabitCreateModal(props: {
  categories: AppOverview["categories"];
  categoryFilterName: string | null;
  onCancel: () => void;
  onCreate: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const preferred = preferredCategoryId(props.categories, props.categoryFilterName);
  const [categoryId, setCategoryId] = useState<number>(preferred);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCategoryId = props.categories.some((category) => category.id === categoryId) ? categoryId : preferred;
  const canCreate = Boolean(name.trim() && selectedCategoryId);

  return (
    <EditModal
      title="Gewohnheit hinzufügen"
      label="Gewohnheit hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || !selectedCategoryId || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            categoryId: selectedCategoryId,
            type: "habit",
            name: trimmedName,
            markdown: defaultInitiativeMarkdown("habit", trimmedName)
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Gewohnheit konnte nicht angelegt werden.");
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
      {props.categories.length === 0 ? (
        <ErrorState title="Kein Lebensbereich vorhanden" description="Lege zuerst einen Lebensbereich an, bevor du eine Gewohnheit erstellst." />
      ) : (
        <>
          <label>
            Lebensbereich
            <select value={selectedCategoryId || ""} onChange={(event) => setCategoryId(Number(event.target.value))} disabled={creating}>
              {props.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Name
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Gewohnheit benennen" autoFocus disabled={creating} />
          </label>
        </>
      )}
      {error ? <ErrorState title="Gewohnheit konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function habitListMeta(habit: Initiative, category: Category | null): string {
  return [
    initiativeStatusLabel(habit.status),
    category?.name ?? null
  ].filter(Boolean).join(" · ");
}

function habitDescriptionPreview(habit: Initiative): string | null {
  const normalize = (value: string) => value.toLowerCase().replace(/ß/g, "ss");
  const title = normalize(displayInitiativeName(habit));
  const summary = habit.summary?.trim();
  if (summary && normalize(summary) !== title) return summary;

  const ignoredLines = new Set(["praxis", "rhythmus", "reflexion", "noch offen.", "noch keine reflexion.", "-", ""]);
  const line = habit.markdown
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => {
      const normalized = entry.toLowerCase();
      return entry && normalize(entry) !== title && !ignoredLines.has(normalized);
    });
  return line ?? null;
}

function habitInitials(habit: Initiative): string {
  const initials = displayInitiativeName(habit)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "G";
}
