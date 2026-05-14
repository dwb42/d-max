import { useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { CalendarDays, Lock, LockOpen, Plus, Trash2, X } from "lucide-react";
import { ConfirmModal, DescriptionBlock, EditModal, EmptyState, EntityDetailPage, MetadataGrid, RelationList, SectionBlock, handleModalEscape, useModalEscape } from "../../components/ui/index.js";
import { createGoogleEventFromDmax, fetchCalendarSources, unlinkCalendarBinding } from "../../api.js";
import type { AppOverview, CalendarSource, Initiative, InitiativeDetail, InitiativeRelationWithInitiatives, InitiativeType, Organization, ParticipantRoleType, Person, ProjectPhase, Task } from "../../types.js";
import { MediaAttachmentsPanel, ParticipantsPanel, TaskCreateInlineForm, TasksView } from "./SharedDetailPanels.js";
import { type CreateInitiativeInput, type RelationshipCreateDraft, type RelationshipCreateSlot, type UpdateInitiativeInput, InitiativeTypeBadge, InitiativeTypeInitial, defaultInitiativeMarkdown, displayInitiativeName, formatDateTimeForUi, formatInitiativeDateRangeForUi, initiativeAncestorIds, initiativeCandidateOptionGroups, initiativeDescendantIds, initiativeDateRangeInvalid, initiativeStatusLabel, initiativeStatusOptions, initiativeTypeLabel, initiativeTypeOptions, primeEmptyDatePickerMonth, projectPhaseLabel, projectPhaseOptions, restorePrimedEmptyDateInput } from "./detailUtils.js";

export function InitiativeDetailView(props: {
  detail: InitiativeDetail | null;
  allInitiatives: Initiative[];
  categories: AppOverview["categories"];
  people: Person[];
  organizations: Organization[];
  participantRoleTypes: ParticipantRoleType[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleTypeId?: number | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onDeleteParticipant: (participantId: number) => Promise<void>;
  onToggleTaskStatus: (task: Task) => Promise<void>;
  onDeleteTask: (task: Task) => Promise<void>;
  onReorderTasks?: (initiativeId: number, taskIds: number[]) => Promise<void>;
  onCreateTask: (initiativeId: number, title: string) => Promise<void>;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<Initiative>;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
  onCreateRelation: (predecessorInitiativeId: number, successorInitiativeId: number) => Promise<void>;
  onDeleteRelation: (relationId: number) => Promise<void>;
  onUploadMedia: (initiativeId: number, file: File) => Promise<void>;
  onUpdateMedia: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDeleteMedia: (linkId: number) => Promise<void>;
  onReorderMedia: (initiativeId: number, linkIds: number[]) => Promise<void>;
}) {
  if (!props.detail) {
    return <EmptyState title="Initiative wird geladen" description="Die Detaildaten werden aus DMAX geladen." />;
  }

  const initiativeId = props.detail.initiative.id;
  const initiative = props.detail.initiative;
  const predecessors = props.detail.predecessors ?? [];
  const successors = props.detail.successors ?? [];
  const participants = props.detail.participants ?? [];
  const mediaAttachments = props.detail.mediaAttachments ?? [];
  const category = props.categories.find((candidate) => candidate.id === initiative.categoryId) ?? null;
  const openTasks = props.detail.tasks.filter((task) => task.status !== "done").length;
  const doneTasks = props.detail.tasks.length - openTasks;
  const relationCount =
    participants.length
    + predecessors.length
    + successors.length
    + props.allInitiatives.filter((candidate) => candidate.parentId === initiative.id).length
    + (initiative.parentId ? 1 : 0);
  return (
    <EntityDetailPage
      className="initiative-reference-detail"
      aside={(
        <MetadataGrid
          items={[
            { label: "Typ", value: initiativeTypeLabel(initiative.type) },
            { label: "Lebensbereich", value: category?.name ?? null },
            { label: "Status", value: initiativeStatusLabel(initiative.status) },
            { label: "Phase", value: initiative.type === "project" ? projectPhaseLabel(initiative.projectPhase) : null },
            { label: "Zeitraum", value: initiative.type === "project" ? formatInitiativeDateRangeForUi(initiative) : null },
            { label: "Zeitraum fixiert", value: initiative.type === "project" ? (initiative.isLocked ? "Ja" : "Nein") : null },
            { label: "Maßnahmen", value: `${openTasks} offen · ${doneTasks} erledigt` },
            { label: "Beteiligte", value: String(participants.length) },
            { label: "Beziehungen", value: String(relationCount) },
            { label: "Medien", value: String(mediaAttachments.length) },
            { label: "Aktualisiert", value: formatDateTimeForUi(initiative.updatedAt) }
          ]}
        />
      )}
    >
      <InitiativeMarkdownPanel initiative={initiative} onUpdateInitiative={props.onUpdateInitiative} />
      <SectionBlock
        title="Maßnahmen"
        description={`${openTasks} offen · ${doneTasks} erledigt`}
        actions={<TaskCreateInlineForm label="Maßnahme hinzufügen" onCreateTask={(title) => props.onCreateTask(initiativeId, title)} />}
        className="initiative-tasks-section"
      >
        {props.detail.tasks.length === 0 ? (
          <EmptyState title="Noch keine Maßnahmen" description="Lege die nächste konkrete Aktion direkt hier an." />
        ) : (
          <TasksView
            tasks={props.detail.tasks}
            initiatives={[props.detail.initiative]}
            onToggleTaskStatus={props.onToggleTaskStatus}
            onDeleteTask={props.onDeleteTask}
            onOpenTask={props.onOpenTask}
            showInitiativeName={false}
            groupByCompletionStatus
            onReorderTasks={(taskIds) => void props.onReorderTasks?.(initiativeId, taskIds)}
          />
        )}
      </SectionBlock>
      <ParticipantsPanel
        entityType="initiative"
        entityId={initiative.id}
        participants={participants}
        people={props.people}
        organizations={props.organizations}
        roleTypes={props.participantRoleTypes}
        surface="section"
        onCreateParticipant={props.onCreateParticipant}
        onDeleteParticipant={props.onDeleteParticipant}
      />
      <InitiativeRelationsPanel
        initiative={initiative}
        allInitiatives={props.allInitiatives}
        categories={props.categories}
        predecessors={predecessors}
        successors={successors}
        onOpenInitiative={props.onOpenInitiative}
        onCreateInitiative={props.onCreateInitiative}
        onUpdateInitiative={props.onUpdateInitiative}
        onCreateRelation={props.onCreateRelation}
        onDeleteRelation={props.onDeleteRelation}
      />
      <MediaAttachmentsPanel
        entityType="initiative"
        entityId={initiative.id}
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

function InitiativeRelationsPanel(props: {
  initiative: Initiative;
  allInitiatives: Initiative[];
  categories: AppOverview["categories"];
  predecessors: InitiativeRelationWithInitiatives[];
  successors: InitiativeRelationWithInitiatives[];
  onOpenInitiative: (initiativeId: number) => void;
  onCreateInitiative: (input: CreateInitiativeInput) => Promise<Initiative>;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
  onCreateRelation: (predecessorInitiativeId: number, successorInitiativeId: number) => Promise<void>;
  onDeleteRelation: (relationId: number) => Promise<void>;
}) {
  const [predecessorDraft, setPredecessorDraft] = useState("");
  const [successorDraft, setSuccessorDraft] = useState("");
  const [parentDraft, setParentDraft] = useState("");
  const [childDraft, setChildDraft] = useState("");
  const [busyRelationId, setBusyRelationId] = useState<number | "predecessor" | "successor" | "parent" | "child" | null>(null);
  const emptyCreateDraft = (): RelationshipCreateDraft => ({
    name: "",
    type: props.initiative.type === "idea" ? "idea" : "project",
    categoryId: String(props.initiative.categoryId || props.categories[0]?.id || "")
  });
  const [createDrafts, setCreateDrafts] = useState<Record<RelationshipCreateSlot, RelationshipCreateDraft>>(() => ({
    parent: emptyCreateDraft(),
    child: emptyCreateDraft(),
    predecessor: emptyCreateDraft(),
    successor: emptyCreateDraft()
  }));
  const predecessorIds = useMemo(() => new Set(props.predecessors.map((relation) => relation.predecessorInitiativeId)), [props.predecessors]);
  const successorIds = useMemo(() => new Set(props.successors.map((relation) => relation.successorInitiativeId)), [props.successors]);
  const childInitiatives = useMemo(
    () => props.allInitiatives.filter((initiative) => initiative.parentId === props.initiative.id),
    [props.allInitiatives, props.initiative.id]
  );
  const parentInitiative = props.initiative.parentId ? props.allInitiatives.find((initiative) => initiative.id === props.initiative.parentId) ?? null : null;
  const descendantIds = useMemo(() => initiativeDescendantIds(props.allInitiatives, props.initiative.id), [props.allInitiatives, props.initiative.id]);
  const ancestorIds = useMemo(() => initiativeAncestorIds(props.allInitiatives, props.initiative.id), [props.allInitiatives, props.initiative.id]);
  const hasRelations = props.predecessors.length > 0 || props.successors.length > 0 || Boolean(parentInitiative) || childInitiatives.length > 0;
  const [expanded, setExpanded] = useState(hasRelations);
  const selectableInitiatives = props.allInitiatives.filter((initiative) => initiative.type !== "habit");
  const predecessorCandidates = selectableInitiatives.filter((initiative) => initiative.id !== props.initiative.id && !predecessorIds.has(initiative.id));
  const successorCandidates = selectableInitiatives.filter((initiative) => initiative.id !== props.initiative.id && !successorIds.has(initiative.id));
  const parentCandidates = selectableInitiatives.filter(
    (initiative) => initiative.id !== props.initiative.id && initiative.id !== props.initiative.parentId && !descendantIds.has(initiative.id)
  );
  const childCandidates = selectableInitiatives.filter((initiative) => initiative.id !== props.initiative.id && initiative.parentId !== props.initiative.id && !ancestorIds.has(initiative.id));

  useEffect(() => {
    setPredecessorDraft("");
    setSuccessorDraft("");
    setParentDraft("");
    setChildDraft("");
    setCreateDrafts({
      parent: emptyCreateDraft(),
      child: emptyCreateDraft(),
      predecessor: emptyCreateDraft(),
      successor: emptyCreateDraft()
    });
    setBusyRelationId(null);
    setExpanded(hasRelations);
  }, [props.initiative.id, props.predecessors, props.successors, hasRelations]);

  const updateCreateDraft = (slot: RelationshipCreateSlot, input: Partial<RelationshipCreateDraft>) => {
    setCreateDrafts((current) => ({ ...current, [slot]: { ...current[slot], ...input } }));
  };
  const resetCreateDraft = (slot: RelationshipCreateSlot) => {
    setCreateDrafts((current) => ({ ...current, [slot]: emptyCreateDraft() }));
  };
  const createRelatedInitiative = async (slot: RelationshipCreateSlot) => {
    if (busyRelationId) return;
    const draft = createDrafts[slot];
    const name = draft.name.trim();
    const categoryId = Number(draft.categoryId);
    if (!name || !categoryId) return;
    setBusyRelationId(slot);
    try {
      const created = await props.onCreateInitiative({
        categoryId,
        parentId: slot === "child" ? props.initiative.id : null,
        type: draft.type,
        projectPhase: draft.type === "project" ? "planning" : undefined,
        name
      });
      if (slot === "parent") {
        await props.onUpdateInitiative(props.initiative.id, { parentId: created.id });
      } else if (slot === "predecessor") {
        await props.onCreateRelation(created.id, props.initiative.id);
      } else if (slot === "successor") {
        await props.onCreateRelation(props.initiative.id, created.id);
      }
      resetCreateDraft(slot);
    } finally {
      setBusyRelationId(null);
    }
  };

  const addPredecessor = async () => {
    const predecessorId = Number(predecessorDraft);
    if (!predecessorId || busyRelationId) return;
    setBusyRelationId("predecessor");
    try {
      await props.onCreateRelation(predecessorId, props.initiative.id);
      setPredecessorDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const addSuccessor = async () => {
    const successorId = Number(successorDraft);
    if (!successorId || busyRelationId) return;
    setBusyRelationId("successor");
    try {
      await props.onCreateRelation(props.initiative.id, successorId);
      setSuccessorDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const removeParent = async () => {
    if (busyRelationId) return;
    setBusyRelationId("parent");
    try {
      await props.onUpdateInitiative(props.initiative.id, { parentId: null });
    } finally {
      setBusyRelationId(null);
    }
  };
  const removeRelation = async (relationId: number) => {
    if (busyRelationId) return;
    setBusyRelationId(relationId);
    try {
      await props.onDeleteRelation(relationId);
    } finally {
      setBusyRelationId(null);
    }
  };
  const setParent = async () => {
    const parentId = Number(parentDraft);
    if (busyRelationId) return;
    if (!parentId) return;
    if (parentId === props.initiative.parentId) {
      setParentDraft("");
      return;
    }
    setBusyRelationId("parent");
    try {
      await props.onUpdateInitiative(props.initiative.id, { parentId });
      setParentDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const addChild = async () => {
    const childId = Number(childDraft);
    if (!childId || busyRelationId) return;
    setBusyRelationId("child");
    try {
      await props.onUpdateInitiative(childId, { parentId: props.initiative.id });
      setChildDraft("");
    } finally {
      setBusyRelationId(null);
    }
  };
  const removeChild = async (childId: number) => {
    if (busyRelationId) return;
    setBusyRelationId(childId);
    try {
      await props.onUpdateInitiative(childId, { parentId: null });
    } finally {
      setBusyRelationId(null);
    }
  };

  return (
    <SectionBlock
      title="Beziehungen"
      description={hasRelations ? "Struktur, Abhängigkeiten und Initiative-Verbindungen." : "Noch keine strukturellen Beziehungen."}
      className="initiative-relations-panel"
      actions={(
        <button type="button" className="small-button" onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Weniger" : "Bearbeiten"}
        </button>
      )}
    >
      {expanded ? (
      <div className="initiative-relations-grid">
        <div className="initiative-relation-group">
          <InitiativeParentChildColumn
            title="Übergeordnet"
            emptyLabel="Keine übergeordnete Initiative"
            initiatives={parentInitiative ? [parentInitiative] : []}
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onRemove={() => void removeParent()}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void setParent();
            }}
          >
            <select
              value={parentDraft}
              disabled={busyRelationId !== null || parentCandidates.length === 0}
              aria-label="Parent auswählen"
              onChange={(event) => setParentDraft(event.target.value)}
            >
              <option value="">{parentInitiative ? "Übergeordnete Initiative ändern" : "Übergeordnete Initiative verknüpfen"}</option>
              {initiativeCandidateOptionGroups(parentCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!parentDraft || busyRelationId !== null} title="Parent verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Übergeordnete Initiative anlegen"
            namePlaceholder="Neue übergeordnete Initiative"
            categories={props.categories}
            draft={createDrafts.parent}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("parent", input)}
            onSubmit={() => void createRelatedInitiative("parent")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeParentChildColumn
            title="Untergeordnet"
            emptyLabel="Keine untergeordneten Initiativen"
            initiatives={childInitiatives}
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onRemove={(initiativeId) => void removeChild(initiativeId)}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void addChild();
            }}
          >
            <select
              value={childDraft}
              disabled={busyRelationId !== null || childCandidates.length === 0}
              aria-label="Child auswählen"
              onChange={(event) => setChildDraft(event.target.value)}
            >
              <option value="">Untergeordnete Initiative verknüpfen</option>
              {initiativeCandidateOptionGroups(childCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!childDraft || busyRelationId !== null} title="Child verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Untergeordnete Initiative anlegen"
            namePlaceholder="Neue untergeordnete Initiative"
            categories={props.categories}
            draft={createDrafts.child}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("child", input)}
            onSubmit={() => void createRelatedInitiative("child")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeRelationColumn
            title="Vorgänger"
            emptyLabel="Keine Vorgänger"
            relations={props.predecessors}
            direction="predecessor"
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onDeleteRelation={removeRelation}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void addPredecessor();
            }}
          >
            <select
              value={predecessorDraft}
              disabled={busyRelationId !== null || predecessorCandidates.length === 0}
              aria-label="Vorgänger auswählen"
              onChange={(event) => setPredecessorDraft(event.target.value)}
            >
              <option value="">Vorgänger verknüpfen</option>
              {initiativeCandidateOptionGroups(predecessorCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!predecessorDraft || busyRelationId !== null} title="Vorgänger verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Vorgänger anlegen"
            namePlaceholder="Neuer Vorgänger"
            categories={props.categories}
            draft={createDrafts.predecessor}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("predecessor", input)}
            onSubmit={() => void createRelatedInitiative("predecessor")}
          />
        </div>
        <div className="initiative-relation-group">
          <InitiativeRelationColumn
            title="Nachfolger"
            emptyLabel="Keine Nachfolger"
            relations={props.successors}
            direction="successor"
            busyRelationId={busyRelationId}
            onOpenInitiative={props.onOpenInitiative}
            onDeleteRelation={removeRelation}
          />
          <form
            className="initiative-relation-control"
            onSubmit={(event) => {
              event.preventDefault();
              void addSuccessor();
            }}
          >
            <select
              value={successorDraft}
              disabled={busyRelationId !== null || successorCandidates.length === 0}
              aria-label="Nachfolger auswählen"
              onChange={(event) => setSuccessorDraft(event.target.value)}
            >
              <option value="">Nachfolger verknüpfen</option>
              {initiativeCandidateOptionGroups(successorCandidates, props.categories, props.initiative.categoryId)}
            </select>
            <button type="submit" className="icon-button compact" disabled={!successorDraft || busyRelationId !== null} title="Nachfolger verknüpfen">
              <Plus size={15} />
            </button>
          </form>
          <InitiativeRelationCreateForm
            label="Nachfolger anlegen"
            namePlaceholder="Neuer Nachfolger"
            categories={props.categories}
            draft={createDrafts.successor}
            disabled={busyRelationId !== null}
            onDraftChange={(input) => updateCreateDraft("successor", input)}
            onSubmit={() => void createRelatedInitiative("successor")}
          />
        </div>
      </div>
      ) : (
        <RelationList emptyTitle="Beziehungen eingeklappt" emptyDescription="Öffne den Bereich, um Parent/Child- und Vorgänger/Nachfolger-Beziehungen zu bearbeiten.">
          {null}
        </RelationList>
      )}
    </SectionBlock>
  );
}

function InitiativeRelationCreateForm(props: {
  label: string;
  namePlaceholder: string;
  categories: AppOverview["categories"];
  draft: RelationshipCreateDraft;
  disabled: boolean;
  onDraftChange: (input: Partial<RelationshipCreateDraft>) => void;
  onSubmit: () => void;
}) {
  const canSubmit = props.draft.name.trim().length > 0 && Boolean(props.draft.categoryId) && !props.disabled;
  return (
    <form
      className="initiative-relation-create-control"
      aria-label={props.label}
      onSubmit={(event) => {
        event.preventDefault();
        props.onSubmit();
      }}
    >
      <input
        value={props.draft.name}
        disabled={props.disabled}
        placeholder={props.namePlaceholder}
        aria-label={`${props.label} name`}
        onChange={(event) => props.onDraftChange({ name: event.target.value })}
      />
      <select
        value={props.draft.type}
        disabled={props.disabled}
        aria-label={`${props.label} type`}
        onChange={(event) => props.onDraftChange({ type: event.target.value === "idea" ? "idea" : "project" })}
      >
        <option value="project">Project</option>
        <option value="idea">Idea</option>
      </select>
      <select
        value={props.draft.categoryId}
        disabled={props.disabled || props.categories.length === 0}
        aria-label={`${props.label} category`}
        onChange={(event) => props.onDraftChange({ categoryId: event.target.value })}
      >
        {props.categories.map((category) => (
          <option key={category.id} value={category.id}>
            {category.name}
          </option>
        ))}
      </select>
      <button type="submit" className="icon-button compact" disabled={!canSubmit} title={props.label}>
        <Plus size={15} />
      </button>
    </form>
  );
}

function InitiativeParentChildColumn(props: {
  title: string;
  emptyLabel: string;
  initiatives: Initiative[];
  busyRelationId: number | string | null;
  onOpenInitiative: (initiativeId: number) => void;
  onRemove: (initiativeId: number) => void;
}) {
  return (
    <div className="initiative-relation-column">
      <h4>{props.title}</h4>
      {props.initiatives.length === 0 ? (
        <p>{props.emptyLabel}</p>
      ) : (
        <div className="initiative-relation-list">
          {props.initiatives.map((initiative) => (
            <div className="initiative-relation-row" key={initiative.id}>
              <button type="button" className="initiative-relation-link" onClick={() => props.onOpenInitiative(initiative.id)}>
                <InitiativeTypeInitial type={initiative.type} />
                <span>{displayInitiativeName(initiative)}</span>
                <small>{initiativeStatusLabel(initiative.status)}</small>
              </button>
              <button
                type="button"
                className="icon-button compact"
                disabled={props.busyRelationId !== null}
                onClick={() => props.onRemove(initiative.id)}
                title="Parent/Child-Verknüpfung entfernen"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function InitiativeRelationColumn(props: {
  title: string;
  emptyLabel: string;
  relations: InitiativeRelationWithInitiatives[];
  direction: "predecessor" | "successor";
  busyRelationId: number | string | null;
  onOpenInitiative: (initiativeId: number) => void;
  onDeleteRelation: (relationId: number) => Promise<void>;
}) {
  return (
    <div className="initiative-relation-column">
      <h4>{props.title}</h4>
      {props.relations.length === 0 ? (
        <p>{props.emptyLabel}</p>
      ) : (
        <div className="initiative-relation-list">
          {props.relations.map((relation) => {
            const linkedInitiative = props.direction === "predecessor" ? relation.predecessor : relation.successor;
            return (
              <div className="initiative-relation-row" key={relation.id}>
                <button type="button" className="initiative-relation-link" onClick={() => props.onOpenInitiative(linkedInitiative.id)}>
                  <InitiativeTypeInitial type={linkedInitiative.type} />
                  <span>{displayInitiativeName(linkedInitiative)}</span>
                  <small>{initiativeStatusLabel(linkedInitiative.status)}</small>
                </button>
                <button
                  type="button"
                  className="icon-button compact"
                  disabled={props.busyRelationId !== null}
                  onClick={() => void props.onDeleteRelation(relation.id)}
                  title="Verknüpfung entfernen"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function InitiativeDetailHeader(props: {
  initiative: Initiative | null;
  category: AppOverview["categories"][number] | null;
  projectCalendarBinding: InitiativeDetail["projectCalendarBinding"] | null;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
  onCalendarBindingChange: () => Promise<void>;
}) {
  const [editingName, setEditingName] = useState(false);
  const [dateModalOpen, setDateModalOpen] = useState(false);
  const [name, setName] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [isLocked, setIsLocked] = useState(false);
  const [dateRangeError, setDateRangeError] = useState<string | null>(null);
  const [headerError, setHeaderError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setName(props.initiative?.name ?? "");
    setStartDate(props.initiative?.startDate ?? "");
    setEndDate(props.initiative?.endDate ?? "");
    setIsLocked(props.initiative?.isLocked ?? false);
    setEditingName(false);
    setDateModalOpen(false);
    setDateRangeError(null);
    setHeaderError(null);
    setBusy(false);
  }, [props.initiative?.id, props.initiative?.name, props.initiative?.startDate, props.initiative?.endDate, props.initiative?.isLocked]);

  if (!props.initiative) {
    return (
      <div className="section-heading">
        <div className="initiative-title-line">
          <h1>Eintrag</h1>
        </div>
      </div>
    );
  }

  const initiative = props.initiative;
  const dateRange = initiative.type === "project" ? formatInitiativeDateRangeForUi(initiative) : null;
  const resetDateRangeDraft = () => {
    setStartDate(initiative.startDate ?? "");
    setEndDate(initiative.endDate ?? "");
    setIsLocked(initiative.isLocked);
    setDateRangeError(null);
    setDateModalOpen(false);
  };
  const saveName = async () => {
    const trimmedName = name.trim();
    if (!trimmedName || busy) return;
    if (trimmedName === initiative.name) {
      setEditingName(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdateInitiative(initiative.id, { name: trimmedName });
      setEditingName(false);
      setHeaderError(null);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };
  const saveHeaderPatch = async (input: UpdateInitiativeInput) => {
    if (busy) return;
    setBusy(true);
    setHeaderError(null);
    try {
      await props.onUpdateInitiative(initiative.id, input);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Eintrag konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };
  const saveDateRange = async () => {
    if (busy) return;
    if (initiativeDateRangeInvalid(startDate, endDate)) {
      setDateRangeError("Start darf nicht nach Ende liegen.");
      return;
    }
    const nextStartDate = startDate || null;
    const nextEndDate = endDate || null;
    if (nextStartDate === initiative.startDate && nextEndDate === initiative.endDate && isLocked === initiative.isLocked) {
      setDateModalOpen(false);
      return;
    }
    setBusy(true);
    setDateRangeError(null);
    try {
      await props.onUpdateInitiative(initiative.id, { startDate: nextStartDate, endDate: nextEndDate, isLocked });
      setDateModalOpen(false);
      setHeaderError(null);
    } catch (err) {
      setHeaderError(err instanceof Error ? err.message : "Zeitraum konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="section-heading initiative-header-inline">
      <div className="initiative-title-line">
        {editingName ? (
          <form
            className="initiative-title-form"
            onSubmit={(event) => {
              event.preventDefault();
              void saveName();
            }}
          >
            <input
              autoFocus
              value={name}
              disabled={busy}
              onChange={(event) => setName(event.target.value)}
              onBlur={() => void saveName()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setName(initiative.name);
                  setEditingName(false);
                }
              }}
            />
          </form>
        ) : (
          <button type="button" className="initiative-title-edit" onClick={() => setEditingName(true)} title="Titel bearbeiten">
            <h1>{displayInitiativeName(initiative)}</h1>
          </button>
        )}
        {!editingName ? (
          <>
            <label className={`detail-pill-select type ${initiative.type}`} title="Typ ändern">
              <select
                value={initiative.type}
                disabled={busy}
                aria-label="Initiative-Typ"
                onChange={(event) => void saveHeaderPatch({ type: event.target.value as InitiativeType })}
              >
                {initiativeTypeOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className={`detail-pill-select status ${initiative.status}`} title="Status ändern">
              <select
                value={initiative.status}
                disabled={busy}
                aria-label="Initiative-Status"
                onChange={(event) => void saveHeaderPatch({ status: event.target.value as Initiative["status"] })}
              >
                {initiativeStatusOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            {initiative.type === "project" ? (
              <label className={`detail-pill-select phase ${initiative.projectPhase}`} title="Projektphase ändern">
                <select
                  value={initiative.projectPhase}
                  disabled={busy}
                  aria-label="Projektphase"
                  onChange={(event) => void saveHeaderPatch({ projectPhase: event.target.value as ProjectPhase })}
                >
                  {projectPhaseOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {initiative.type === "project" ? (
              <button
                type="button"
                className="initiative-date-pill"
                onClick={() => setDateModalOpen(true)}
                title={initiative.isLocked ? "Zeitraum ist gesperrt und kann nicht verschoben werden" : "Projektzeitraum und Google-Verknüpfung bearbeiten"}
              >
                <CalendarDays size={14} />
                <span>{dateRange ?? "Zeitraum setzen"}</span>
                {initiative.isLocked ? <Lock size={13} aria-hidden="true" /> : null}
                {props.projectCalendarBinding ? <span className="calendar-google-badge" title="Mit Google Calendar verknüpft">G</span> : null}
              </button>
            ) : null}
            {props.category ? <span className="detail-pill-static">{props.category.name}</span> : null}
            {initiative.isSystem ? <span className="system-badge">System</span> : null}
            {headerError ? <span className="initiative-date-error">{headerError}</span> : null}
          </>
        ) : null}
      </div>
      {dateModalOpen && initiative.type === "project" ? (
        <ProjectDateCalendarModal
          initiative={initiative}
          binding={props.projectCalendarBinding ?? null}
          startDate={startDate}
          endDate={endDate}
          isLocked={isLocked}
          busy={busy}
          error={dateRangeError}
          onStartDateChange={setStartDate}
          onEndDateChange={setEndDate}
          onLockedChange={setIsLocked}
          onSaveDateRange={saveDateRange}
          onCancel={resetDateRangeDraft}
          onCalendarBindingChange={props.onCalendarBindingChange}
        />
      ) : null}
    </div>
  );
}

function ProjectDateCalendarModal(props: {
  initiative: Initiative;
  binding: InitiativeDetail["projectCalendarBinding"] | null;
  startDate: string;
  endDate: string;
  isLocked: boolean;
  busy: boolean;
  error: string | null;
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onLockedChange: (value: boolean) => void;
  onSaveDateRange: () => Promise<void>;
  onCancel: () => void;
  onCalendarBindingChange: () => Promise<void>;
}) {
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [calendarSourceId, setCalendarSourceId] = useState<number | null>(null);
  const [calendarBusy, setCalendarBusy] = useState(false);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [unlinkConfirmOpen, setUnlinkConfirmOpen] = useState(false);
  const writableSources = sources.filter((source) => source.enabled && !source.readOnly);
  const hasCompleteDateRange = Boolean(props.startDate && props.endDate);
  const dateRangeChanged = props.startDate !== (props.initiative.startDate ?? "") || props.endDate !== (props.initiative.endDate ?? "") || props.isLocked !== props.initiative.isLocked;
  const lockTitle = props.isLocked
    ? "Start- und Endzeitpunkt sind gesperrt und sollen nicht verschoben werden"
    : "Zeitraum ist flexibel und kann verschoben werden";
  const bindingCalendarLabel = props.binding?.calendarSource
    ? props.binding.calendarSource.accountLabel
    : props.binding?.externalCalendarId ?? "nicht verknüpft";

  useModalEscape(props.onCancel, !unlinkConfirmOpen);

  useEffect(() => {
    fetchCalendarSources()
      .then((nextSources) => {
        setSources(nextSources);
        const firstWritable = nextSources.find((source) => source.enabled && !source.readOnly) ?? null;
        setCalendarSourceId(firstWritable?.id ?? null);
      })
      .catch((err: unknown) => setCalendarError(err instanceof Error ? err.message : "Kalenderquellen konnten nicht geladen werden."));
  }, []);

  async function createGoogleEvent() {
    if (!calendarSourceId || calendarBusy || !hasCompleteDateRange || dateRangeChanged) return;
    setCalendarBusy(true);
    setCalendarError(null);
    try {
      await createGoogleEventFromDmax({
        localEntityType: "initiative_project_span",
        localEntityId: props.initiative.id,
        calendarSourceId
      });
      await props.onCalendarBindingChange();
      props.onCancel();
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : "Google Event konnte nicht erstellt werden.");
    } finally {
      setCalendarBusy(false);
    }
  }

  async function unlinkGoogleEvent(deleteGoogleEvent: boolean) {
    if (!props.binding || calendarBusy) return;
    setCalendarBusy(true);
    setCalendarError(null);
    try {
      await unlinkCalendarBinding(props.binding.id, { deleteGoogleEvent });
      await props.onCalendarBindingChange();
      props.onCancel();
    } catch (err) {
      setCalendarError(err instanceof Error ? err.message : "Google-Verknüpfung konnte nicht gelöst werden.");
    } finally {
      setCalendarBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={props.onCancel}>
      <section
        className="compact-modal project-date-calendar-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Projektzeitraum und Google Calendar"
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDown={(event) => handleModalEscape(event, props.onCancel)}
      >
        <header className="google-event-modal-header">
          <div>
            <span>Projektzeitraum</span>
            <strong>{displayInitiativeName(props.initiative)}</strong>
          </div>
          <button className="icon-button" type="button" title="Schließen" onClick={props.onCancel}>
            <X size={16} />
          </button>
        </header>

        <form
          className="project-date-modal-section"
          onSubmit={(event) => {
            event.preventDefault();
            void props.onSaveDateRange();
          }}
        >
          <label className="google-event-field">
            <span>Start</span>
            <input type="date" value={props.startDate} disabled={props.busy} onChange={(event) => props.onStartDateChange(event.target.value)} />
          </label>
          <label className="google-event-field">
            <span>Ende</span>
            <input
              type="date"
              value={props.endDate}
              min={props.startDate || undefined}
              disabled={props.busy}
              onPointerDown={(event) => primeEmptyDatePickerMonth(event, props.startDate, props.endDate)}
              onFocus={(event) => primeEmptyDatePickerMonth(event, props.startDate, props.endDate)}
              onBlur={(event) => restorePrimedEmptyDateInput(event, props.endDate)}
              onChange={(event) => props.onEndDateChange(event.target.value)}
            />
          </label>
          {props.error ? <div className="error-banner project-date-modal-full">{props.error}</div> : null}
          <div className="project-date-lock-row project-date-modal-full">
            <span>{props.isLocked ? "Fixierter Zeitraum" : "Flexibler Zeitraum"}</span>
            <button
              type="button"
              className={`project-timeframe-lock-toggle ${props.isLocked ? "locked" : "unlocked"}`}
              disabled={props.busy}
              title={lockTitle}
              aria-label={lockTitle}
              aria-pressed={props.isLocked}
              onClick={() => props.onLockedChange(!props.isLocked)}
            >
              {props.isLocked ? <Lock size={17} aria-hidden="true" /> : <LockOpen size={17} aria-hidden="true" />}
            </button>
          </div>
        </form>

        <section className="project-date-modal-section project-google-section">
          <div className="project-google-summary project-date-modal-full">
            <span>Google Kalender</span>
            {props.binding ? (
              <strong>{bindingCalendarLabel}</strong>
            ) : writableSources.length > 0 ? (
              <select value={calendarSourceId ?? ""} onChange={(event) => setCalendarSourceId(Number(event.target.value))}>
                {writableSources.map((source) => (
                  <option key={source.id} value={source.id}>{source.accountLabel}</option>
                ))}
              </select>
            ) : (
              <strong>nicht verknüpft</strong>
            )}
          </div>
          {props.binding ? (
            <button type="button" className="project-date-text-link project-date-modal-full" disabled={calendarBusy} onClick={() => setUnlinkConfirmOpen(true)}>
              Verknüpfung lösen
            </button>
          ) : (
            <>
              {writableSources.length === 0 ? <div className="config-hint project-date-modal-full">Keine schreibbare Google-Kalenderquelle konfiguriert.</div> : null}
              <button
                type="button"
                className="project-date-text-link project-date-modal-full"
                disabled={calendarBusy || !calendarSourceId || !hasCompleteDateRange || dateRangeChanged}
                onClick={() => void createGoogleEvent()}
              >
                Google Event erstellen
              </button>
              {!hasCompleteDateRange ? <div className="config-hint project-date-modal-full">Start und Ende sind nötig, bevor ein Google-Ganztags-Event erstellt werden kann.</div> : null}
              {dateRangeChanged ? <div className="config-hint project-date-modal-full">OK speichert den Zeitraum. Danach kann ein Google Event erstellt werden.</div> : null}
            </>
          )}
          {calendarError ? <div className="error-banner project-date-modal-full">{calendarError}</div> : null}
        </section>

        <div className="modal-actions">
          <button type="button" className="primary-action compact" disabled={props.busy || calendarBusy} onClick={() => void props.onSaveDateRange()}>OK</button>
        </div>
        {unlinkConfirmOpen ? (
          <ConfirmModal
            title="Google Event ebenfalls löschen?"
            description={<p>Die Verknüpfung zum Projektzeitraum wird gelöst. Entscheide, ob das verknüpfte Google Event im Kalender ebenfalls gelöscht werden soll.</p>}
            confirmLabel="Event löschen"
            busy={calendarBusy}
            onCancel={() => setUnlinkConfirmOpen(false)}
            extraActions={(
              <button
                type="button"
                className="small-button"
                disabled={calendarBusy}
                onClick={() => {
                  void unlinkGoogleEvent(false);
                }}
              >
                Nur Verknüpfung lösen
              </button>
            )}
            onConfirm={() => unlinkGoogleEvent(true)}
          />
        ) : null}
      </section>
    </div>
  );
}

function InitiativeMarkdownPanel(props: {
  initiative: Initiative;
  onUpdateInitiative: (initiativeId: number, input: UpdateInitiativeInput) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState(props.initiative.markdown);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setMarkdown(props.initiative.markdown);
    setEditing(false);
    setBusy(false);
  }, [props.initiative.id, props.initiative.markdown]);

  const saveMarkdown = async () => {
    if (busy) return;
    if (markdown === props.initiative.markdown) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdateInitiative(props.initiative.id, { markdown });
      setEditing(false);
    } finally {
      setBusy(false);
    }
  };

  if (editing) {
    return (
      <EditModal
        title="Beschreibung bearbeiten"
        label="Initiative-Beschreibung bearbeiten"
        className="markdown-modal"
        onCancel={() => {
          setMarkdown(props.initiative.markdown);
          setEditing(false);
        }}
        onSubmit={(event) => {
          event.preventDefault();
          void saveMarkdown();
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
                setMarkdown(props.initiative.markdown);
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
          value={markdown}
          disabled={busy}
          rows={18}
          onChange={(event) => setMarkdown(event.target.value)}
          onKeyDown={(event) => {
            if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
              event.preventDefault();
              void saveMarkdown();
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setMarkdown(props.initiative.markdown);
              setEditing(false);
            }
          }}
        />
      </EditModal>
    );
  }

  return (
    <DescriptionBlock
      text={props.initiative.markdown}
      emptyTitle="Noch keine Beschreibung vorhanden."
      emptyDescription="Klicke in diese Fläche, um Kontext zu ergänzen."
      onEdit={() => setEditing(true)}
    />
  );
}
