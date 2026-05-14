import { useState } from "react";
import { Plus } from "lucide-react";
import { EditModal, EmptyState, EntityList, EntityListItem, EntityListPage, ErrorState } from "../../components/ui/index.js";
import type { AppOverview, Category, Initiative, ProjectPhase, Task } from "../../types.js";
import { type CreateInitiativeInput, defaultInitiativeMarkdown, displayInitiativeName, formatInitiativeDateRangeForUi, initiativeDateRangeInvalid, initiativeStatusLabel, preferredCategoryId, primeEmptyDatePickerMonth, projectPhaseLabel, projectPhaseOptions, restorePrimedEmptyDateInput, sortInitiativesForDisplay } from "./listUtils.js";

export { ProjectsView as ProjectListPage };

function ProjectsView(props: {
  categories: AppOverview["categories"];
  initiatives: Initiative[];
  tasks: Task[];
  categoryFilterName: string | null;
  onOpenProject: (initiativeId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const categoryById = new Map(props.categories.map((category) => [category.id, category]));
  const categoryFilter = props.categoryFilterName
    ? props.categories.find((category) => category.name.toLowerCase() === props.categoryFilterName?.toLowerCase()) ?? null
    : null;
  const projects = sortInitiativesForDisplay(
    props.initiatives.filter((initiative) => initiative.type === "project" && (!props.categoryFilterName || initiative.categoryId === categoryFilter?.id))
  );
  const trimmedSearch = search.trim().toLowerCase();
  const filteredProjects = projects.filter((project) => {
    if (!trimmedSearch) return true;
    const category = categoryById.get(project.categoryId);
    return [
      displayInitiativeName(project),
      project.summary,
      project.markdown,
      initiativeStatusLabel(project.status),
      projectPhaseLabel(project.projectPhase),
      category?.name
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(trimmedSearch);
  });

  return (
    <EntityListPage className="project-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Projekt suchen" aria-label="Projekt suchen" />
      </div>

      {props.categoryFilterName && !categoryFilter ? (
        <ErrorState
          title="Lebensbereich nicht gefunden"
          description="Der gefilterte Projektbereich existiert nicht oder konnte nicht geladen werden."
        />
      ) : null}
      {!props.categoryFilterName && props.initiatives.filter((initiative) => initiative.type === "project").length === 0 ? (
        <EmptyState
          title="Noch keine Projekte"
          description="Lege das erste Projekt an, um konkrete Planung und Maßnahmen zu bündeln."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Projekt hinzufügen
            </button>
          )}
        />
      ) : null}
      {projects.length > 0 && filteredProjects.length === 0 ? (
        <EmptyState
          title="Keine Projekte gefunden"
          description="Passe die Suche an, um die Projektliste wieder zu erweitern."
        />
      ) : null}
      {props.categoryFilterName && categoryFilter && projects.length === 0 ? (
        <EmptyState
          title="Keine Projekte in diesem Lebensbereich"
          description="Dieser Lebensbereich enthält noch keine Projekte."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Projekt hinzufügen
            </button>
          )}
        />
      ) : null}
      {filteredProjects.length > 0 ? (
        <EntityList>
          {filteredProjects.map((project) => {
            const category = categoryById.get(project.categoryId) ?? null;
            const counts = projectTaskCounts(project, props.tasks);
            return (
              <EntityListItem
                key={project.id}
                marker={(
                  <span className="project-list-avatar">
                    <span>{projectInitials(project)}</span>
                    {category ? <span className="project-list-swatch" style={{ background: category.color }} /> : null}
                  </span>
                )}
                title={displayInitiativeName(project)}
                meta={projectListMeta(project, category)}
                description={projectDescriptionPreview(project)}
                stats={[
                  { label: "Offen", value: counts.open },
                  { label: "Erledigt", value: counts.done },
                  { label: "Maßnahmen", value: counts.total }
                ]}
                onOpen={() => props.onOpenProject(project.id)}
              />
            );
          })}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

export function ProjectCreateModal(props: {
  categories: AppOverview["categories"];
  categoryFilterName: string | null;
  onCancel: () => void;
  onCreate: (input: CreateInitiativeInput) => Promise<void>;
}) {
  const preferred = preferredCategoryId(props.categories, props.categoryFilterName);
  const [categoryId, setCategoryId] = useState<number>(preferred);
  const [name, setName] = useState("");
  const [projectPhase, setProjectPhase] = useState<ProjectPhase>("planning");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedCategoryId = props.categories.some((category) => category.id === categoryId) ? categoryId : preferred;
  const dateRangeInvalid = initiativeDateRangeInvalid(startDate, endDate);
  const canCreate = Boolean(name.trim() && selectedCategoryId && !dateRangeInvalid);

  return (
    <EditModal
      title="Projekt hinzufügen"
      label="Projekt hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || !selectedCategoryId || creating || dateRangeInvalid) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            categoryId: selectedCategoryId,
            type: "project",
            projectPhase,
            name: trimmedName,
            markdown: defaultInitiativeMarkdown("project", trimmedName),
            startDate: startDate || null,
            endDate: endDate || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Projekt konnte nicht angelegt werden.");
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
        <ErrorState title="Kein Lebensbereich vorhanden" description="Lege zuerst einen Lebensbereich an, bevor du ein Projekt erstellst." />
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
            <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Projekt benennen" autoFocus disabled={creating} />
          </label>
          <label>
            Phase
            <select value={projectPhase} onChange={(event) => setProjectPhase(event.target.value as ProjectPhase)} disabled={creating}>
              {projectPhaseOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <div className="modal-two-column">
            <label>
              Start
              <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={creating} />
            </label>
            <label>
              Ende
              <input
                type="date"
                value={endDate}
                min={startDate || undefined}
                onPointerDown={(event) => primeEmptyDatePickerMonth(event, startDate, endDate)}
                onFocus={(event) => primeEmptyDatePickerMonth(event, startDate, endDate)}
                onBlur={(event) => restorePrimedEmptyDateInput(event, endDate)}
                onChange={(event) => setEndDate(event.target.value)}
                disabled={creating}
              />
            </label>
          </div>
          {dateRangeInvalid ? <p className="field-error">Das Enddatum darf nicht vor dem Startdatum liegen.</p> : null}
        </>
      )}
      {error ? <ErrorState title="Projekt konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function projectTaskCounts(project: Initiative, tasks: Task[]): { total: number; open: number; done: number } {
  const projectTasks = tasks.filter((task) => task.initiativeId === project.id);
  return {
    total: projectTasks.length,
    open: projectTasks.filter((task) => task.status !== "done").length,
    done: projectTasks.filter((task) => task.status === "done").length
  };
}

function projectListMeta(project: Initiative, category: Category | null): string {
  return [
    initiativeStatusLabel(project.status),
    projectPhaseLabel(project.projectPhase),
    category?.name ?? null,
    formatInitiativeDateRangeForUi(project)
  ].filter(Boolean).join(" · ");
}

function projectDescriptionPreview(project: Initiative): string | null {
  const summary = project.summary?.trim();
  if (summary) return summary;

  const ignoredLines = new Set(["ziel", "kontext", "naechste massnahmen", "nächste maßnahmen", "noch offen.", "-", ""]);
  const line = project.markdown
    .split("\n")
    .map((entry) => entry.replace(/^#+\s*/, "").trim())
    .find((entry) => entry && !ignoredLines.has(entry.toLowerCase()));
  return line ?? null;
}

function projectInitials(project: Initiative): string {
  const initials = displayInitiativeName(project)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "P";
}
