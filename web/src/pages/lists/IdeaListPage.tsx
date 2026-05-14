import { useState } from "react";
import { Plus } from "lucide-react";
import { EditModal, EmptyState, EntityList, EntityListItem, EntityListPage, ErrorState } from "../../components/ui/index.js";
import type { AppOverview, Category, Initiative, Task } from "../../types.js";
import { type CreateInitiativeInput, defaultInitiativeMarkdown, displayInitiativeName, initiativeStatusLabel, preferredCategoryId, sortInitiativesForDisplay } from "./listUtils.js";

export { IdeasView as IdeaListPage };

function IdeasView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenIdea: (initiativeId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const categoryFilter = props.categoryFilterName
    ? props.categories.find((category) => category.name.toLowerCase() === props.categoryFilterName?.toLowerCase()) ?? null
    : null;
  const ideas = sortInitiativesForDisplay(
    props.initiatives.filter((initiative) => initiative.type === "idea" && (!props.categoryFilterName || initiative.categoryId === categoryFilter?.id))
  );
  const trimmedSearch = search.trim().toLowerCase();
  const filteredIdeas = ideas.filter((idea) => {
    if (!trimmedSearch) return true;
    const category = categoryById.get(idea.categoryId);
    return [
      displayInitiativeName(idea),
      idea.summary,
      idea.markdown,
      initiativeStatusLabel(idea.status),
      category?.name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="idea-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Idee suchen" aria-label="Idee suchen" />
      </div>

      {props.categoryFilterName && !categoryFilter ? (
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der gefilterte Ideenbereich existiert nicht oder konnte nicht geladen werden."
        />
      ) : null}
      {!props.categoryFilterName && props.initiatives.filter((initiative) => initiative.type === "idea").length === 0 ? (
        <EmptyState
          title="Noch keine Ideen"
          description="Lege die erste Idee an, um mögliche Vorhaben und offene Gedanken festzuhalten."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Idee hinzufügen
            </button>
          )}
        />
      ) : null}
      {ideas.length > 0 && filteredIdeas.length === 0 ? (
        <EmptyState
          title="Keine Ideen gefunden"
          description="Passe die Suche an, um die Ideenliste wieder zu erweitern."
        />
      ) : null}
      {props.categoryFilterName && categoryFilter && ideas.length === 0 ? (
        <EmptyState
          title="Keine Ideen in diesem Lebensbereich"
          description="Dieser Lebensbereich enthält noch keine Ideen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Idee hinzufügen
            </button>
          )}
        />
      ) : null}
      {filteredIdeas.length > 0 ? (
        <EntityList>
          {filteredIdeas.map((idea) => {
            const category = categoryById.get(idea.categoryId) ?? null;
            const taskCount = props.tasks.filter((task) => task.initiativeId === idea.id).length;
            return (
              <EntityListItem
                key={idea.id}
                marker={(
                  <span className="idea-list-avatar">
                    <span>{ideaInitials(idea)}</span>
                    {category ? <span className="idea-list-swatch" style={{ background: category.color }} /> : null}
                  </span>
                )}
                title={displayInitiativeName(idea)}
                meta={ideaListMeta(idea, category)}
                description={ideaDescriptionPreview(idea)}
                stats={taskCount > 0 ? [{ label: "Maßnahmen", value: taskCount }] : undefined}
                onOpen={() => props.onOpenIdea(idea.id)}
              />
            );
          })}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

export function IdeaCreateModal(props: {
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
      title="Idee hinzufügen"
      label="Idee hinzufügen"
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
            type: "idea",
            name: trimmedName,
            markdown: defaultInitiativeMarkdown("idea", trimmedName)
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Idee konnte nicht angelegt werden.");
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
        <ErrorState title="Kein Lebensbereich vorhanden" description="Lege zuerst einen Lebensbereich an, bevor du eine Idee erstellst." />
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
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Idee benennen" autoFocus disabled={creating} />
          </label>
        </>
      )}
      {error ? <ErrorState title="Idee konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function ideaListMeta(idea: Initiative, category: Category | null): string {
  return [
    initiativeStatusLabel(idea.status),
    category?.name ?? null
  ].filter(Boolean).join(" · ");
}

function ideaDescriptionPreview(idea: Initiative): string | null {
  const summary = idea.summary?.trim();
  if (summary) return summary;

  const ignoredLines = new Set(["gedanke", "offene fragen", "noch offen.", "-", ""]);
  const line = idea.markdown
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => entry && !ignoredLines.has(entry.toLowerCase()));
  return line ?? null;
}

function ideaInitials(idea: Initiative): string {
  const initials = displayInitiativeName(idea)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "I";
}
