import { useState } from "react";
import { EditModal, EmptyState, EntityList, EntityListItem, EntityListPage, ErrorState } from "../../components/ui/index.js";
import type { AppOverview, Category, Initiative, Task } from "../../types.js";
import { firstMarkdownLine, propsCountLabel } from "./listUtils.js";

export { LifeAreasView as CategoryListPage };

function LifeAreasView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  onOpenLifeArea: (categoryName: string) => void;
}) {
  const items = props.categories.map((category) => categoryListItemData(category, props.initiatives, props.tasks));

  return (
    <EntityListPage className="category-list-page">
      {items.length === 0 ? (
        <EmptyState
          title="Noch keine Lebensbereiche"
          description="Lege den ersten Lebensbereich an, um Projekte, Ideen, Gewohnheiten und Maßnahmen einzuordnen."
        />
      ) : (
        <EntityList>
          {items.map((item) => (
            <EntityListItem
              key={item.category.id}
              marker={(
                <span className="category-list-marker">
                  <span aria-hidden="true">{item.category.emoji}</span>
                  <span className="category-list-swatch" style={{ background: item.category.color }} />
                </span>
              )}
              title={item.category.name}
              meta={item.category.isSystem ? "Systembereich" : `${item.totalInitiatives} ${propsCountLabel(item.totalInitiatives, "Eintrag", "Einträge")}`}
              description={item.description}
              stats={[
                { label: "Projekte", value: item.projectCount },
                { label: "Ideen", value: item.ideaCount },
                { label: "Gewohnheiten", value: item.habitCount },
                { label: "Maßnahmen", value: item.taskCount }
              ]}
              onOpen={() => props.onOpenLifeArea(item.category.name)}
            />
          ))}
        </EntityList>
      )}
    </EntityListPage>
  );
}

function categoryListItemData(category: Category, initiatives: Initiative[], tasks: Task[]) {
  const categoryInitiatives = initiatives.filter((initiative) => initiative.categoryId === category.id);
  const initiativeIds = new Set(categoryInitiatives.map((initiative) => initiative.id));
  return {
    category,
    description: category.description ? firstMarkdownLine(category.description) : null,
    totalInitiatives: categoryInitiatives.length,
    projectCount: categoryInitiatives.filter((initiative) => initiative.type === "project").length,
    ideaCount: categoryInitiatives.filter((initiative) => initiative.type === "idea").length,
    habitCount: categoryInitiatives.filter((initiative) => initiative.type === "habit").length,
    taskCount: tasks.filter((task) => initiativeIds.has(task.initiativeId)).length
  };
}

export function CategoryCreateModal(props: {
  onCancel: () => void;
  onCreate: (input: { name: string; description?: string | null; color?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = Boolean(name.trim());

  return (
    <EditModal
      title="Lebensbereich hinzufügen"
      label="Lebensbereich hinzufügen"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canCreate || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            name: name.trim(),
            description: description.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Lebensbereich konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>
            Anlegen
          </button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>
            Abbrechen
          </button>
        </>
      )}
    >
      <label>
        Name
        <input value={name} onChange={(event) => setName(event.target.value)} autoFocus />
      </label>
      <label>
        Beschreibung
        <textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={5} />
      </label>
      {error ? <ErrorState title="Anlegen fehlgeschlagen" description={error} /> : null}
    </EditModal>
  );
}
