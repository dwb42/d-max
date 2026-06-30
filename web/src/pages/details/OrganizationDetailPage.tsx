import { useEffect, useState } from "react";
import { Blocks, Building2, ClipboardList, Plus, Users } from "lucide-react";
import { DescriptionBlock, EditModal, EmptyState, EntityDetailPage, ErrorState, MetadataGrid, RelationGroup, RelationItem, RelationList, SectionBlock } from "../../components/ui/index.js";
import { AddressBlock, ContactPointList, OrganizationPeopleActivityList, PartyActivitySummaryCard } from "../../components/party/index.js";
import type { AddressInput, ContactPointInput } from "../../components/party/index.js";
import { fetchPartyActivitySummaries } from "../../api.js";
import type { EntityParticipant, Initiative, Organization, OrganizationDetail, OrganizationPersonActivity, PartyActivitySummary, PartyRelationshipWithParties, Person, RelationshipType, Task } from "../../types.js";
import { entityTypeLabel, formatDateTimeForUi, participantRoleSummary, personName } from "./detailUtils.js";
import { PartyHistorySection, PartyTasksSection } from "./PartyDetailSections.js";
import type { EmailComposeDraft } from "./PartyDetailSections.js";

export function OrganizationDetailView(props: {
  detail: OrganizationDetail | null;
  loadError: string | null;
  initiatives: Initiative[];
  tasks: Task[];
  people: Person[];
  organizations: Organization[];
  relationshipTypes: RelationshipType[];
  coreModalOpen: boolean;
  onCloseCoreModal: () => void;
  onUpdateOrganization: (partyId: number, input: { name?: string; legalName?: string | null; organizationType?: string | null; markdown?: string | null }) => Promise<void>;
  onCreateContactPoint: (partyId: number, input: ContactPointInput) => Promise<void>;
  onUpdateContactPoint: (contactPointId: number, input: Partial<ContactPointInput>) => Promise<void>;
  onDeleteContactPoint: (contactPointId: number) => Promise<void>;
  onCreateAddress: (partyId: number, input: AddressInput) => Promise<void>;
  onUpdateAddress: (addressId: number, input: Partial<AddressInput>) => Promise<void>;
  onDeleteAddress: (addressId: number) => Promise<void>;
  onCreateRelationship: (input: {
    fromPartyId: number;
    toPartyId: number;
    relationshipTypeId: number;
    roleLabel?: string | null;
    status?: "active" | "inactive";
  }) => Promise<void>;
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const organization = props.detail?.organization;
  const [composeDraft, setComposeDraft] = useState<EmailComposeDraft | null>(null);
  const [partyTaskVersion, setPartyTaskVersion] = useState(0);
  const [activitySummary, setActivitySummary] = useState<PartyActivitySummary | null>(null);
  const [organizationPeopleActivity, setOrganizationPeopleActivity] = useState<OrganizationPersonActivity[]>([]);

  useEffect(() => {
    if (!organization?.id) {
      setActivitySummary(null);
      setOrganizationPeopleActivity([]);
      return;
    }
    let cancelled = false;
    fetchPartyActivitySummaries([organization.id], { includeOrganizationPeople: true })
      .then((response) => {
        if (cancelled) return;
        setActivitySummary(response.summaries[0] ?? null);
        setOrganizationPeopleActivity(response.organizationPeople?.[organization.id] ?? []);
      })
      .catch(() => {
        if (cancelled) return;
        setActivitySummary(null);
        setOrganizationPeopleActivity([]);
      });
    return () => {
      cancelled = true;
    };
  }, [organization?.id, partyTaskVersion]);

  if (props.loadError) {
    return (
      <ErrorState
        title="Organisation nicht gefunden"
        description="Diese Organisation existiert nicht oder konnte nicht geladen werden. Gehe zurück zur Organisationsliste und wähle einen vorhandenen Eintrag."
      />
    );
  }

  if (!props.detail || !organization) return <EmptyState title="Organisation wird geladen" description="Die Detaildaten werden aus DMAX geladen." />;

  const metadataItems = [
    { label: "Name", value: organization.name },
    { label: "Anzeigename", value: organization.displayName !== organization.name ? organization.displayName : null },
    { label: "Rechtlicher Name", value: organization.legalName },
    { label: "Organisationstyp", value: organization.organizationType },
    { label: "Erstellt", value: formatDateTimeForUi(organization.createdAt) },
    { label: "Aktualisiert", value: formatDateTimeForUi(organization.updatedAt) }
  ];

  return (
    <EntityDetailPage className="organization-reference-detail">
      {props.coreModalOpen ? (
        <OrganizationCoreModal
          organization={organization}
          onCancel={props.onCloseCoreModal}
          onSave={async (input) => {
            await props.onUpdateOrganization(organization.id, input);
            props.onCloseCoreModal();
          }}
        />
      ) : null}
      <div className="party-detail-communication-layout">
        <main className="party-detail-email-main">
          <PartyTasksSection
            partyId={organization.id}
            onOpenTask={props.onOpenTask}
            onTasksChanged={() => setPartyTaskVersion((version) => version + 1)}
          />
          <PartyHistorySection
            partyId={organization.id}
            contactEmails={props.detail.contactPoints.filter((contactPoint) => contactPoint.type === "email").map((contactPoint) => contactPoint.value)}
            composeDraft={composeDraft}
            onComposeDraftChange={setComposeDraft}
            taskRefreshKey={partyTaskVersion}
            onActivityChanged={() => setPartyTaskVersion((version) => version + 1)}
            onOpenTask={props.onOpenTask}
          />
        </main>
        <aside className="party-detail-sidebar">
          <PartyActivitySummaryCard summary={activitySummary} title="Aktivität" onOpenTask={props.onOpenTask} />
          <ContactPointList
            partyId={organization.id}
            contactPoints={props.detail.contactPoints}
            title="Kontakt"
            description={null}
            addIconOnly
            emptyDescription="E-Mail, Telefon oder Messenger können ergänzt werden."
            deleteDescription={(contactPoint) => <p>„{contactPoint.value}“ wird aus dieser Organisation entfernt.</p>}
            onActivateContactPoint={(contactPoint) => setComposeDraft({ to: contactPoint.value })}
            onCreate={props.onCreateContactPoint}
            onUpdate={props.onUpdateContactPoint}
            onDelete={props.onDeleteContactPoint}
          />
          <OrganizationDescriptionSection
            organization={organization}
            onUpdateOrganization={(input) => props.onUpdateOrganization(organization.id, input)}
          />
          <AddressBlock
            partyId={organization.id}
            copyName={organization.displayName}
            addresses={props.detail.addresses}
            description={null}
            emptyMode="none"
            addIconOnly
            deleteDescription={(address) => <p>„{address.line1}“ wird aus dieser Organisation entfernt.</p>}
            onCreate={props.onCreateAddress}
            onUpdate={props.onUpdateAddress}
            onDelete={props.onDeleteAddress}
          />
          <OrganizationRelationsSection
            organization={organization}
            people={props.people}
            organizations={props.organizations}
            relationshipTypes={props.relationshipTypes}
            relationships={props.detail.relationships}
            peopleActivity={organizationPeopleActivity}
            onCreateRelationship={props.onCreateRelationship}
            onOpenPerson={props.onOpenPerson}
            onOpenOrganization={props.onOpenOrganization}
            onOpenTask={props.onOpenTask}
          />
          <OrganizationParticipationsSection
            organization={organization}
            participants={props.detail.participants}
            initiatives={props.initiatives}
            tasks={props.tasks}
            onCreateParticipant={props.onCreateParticipant}
            onOpenInitiative={props.onOpenInitiative}
            onOpenTask={props.onOpenTask}
          />
          <MetadataGrid items={metadataItems} />
        </aside>
      </div>
    </EntityDetailPage>
  );
}

function OrganizationCoreModal(props: {
  organization: Organization;
  onCancel: () => void;
  onSave: (input: { name: string; legalName: string | null; organizationType: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState(props.organization.name);
  const [legalName, setLegalName] = useState(props.organization.legalName ?? "");
  const [organizationType, setOrganizationType] = useState(props.organization.organizationType ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <EditModal
      title="Organisation bearbeiten"
      label="Organisation bearbeiten"
      className="party-edit-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
          event.preventDefault();
          if (!name.trim() || saving) return;
          setSaving(true);
          setError(null);
          try {
            await props.onSave({
              name: name.trim(),
              legalName: legalName.trim() || null,
              organizationType: organizationType.trim() || null
            });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Organisation konnte nicht gespeichert werden.");
          } finally {
            setSaving(false);
          }
        }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!name.trim() || saving}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={saving}>Abbrechen</button>
        </>
      )}
    >
        <label>
          Name
          <input autoFocus value={name} onChange={(event) => setName(event.target.value)} />
        </label>
        <label>
          Rechtlicher Name
          <input value={legalName} onChange={(event) => setLegalName(event.target.value)} />
        </label>
        <label>
          Typ
          <input value={organizationType} onChange={(event) => setOrganizationType(event.target.value)} />
        </label>
        {error ? <p className="inline-error">{error}</p> : null}
    </EditModal>
  );
}

function OrganizationDescriptionSection(props: {
  organization: Organization;
  onUpdateOrganization: (input: { markdown: string }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [markdown, setMarkdown] = useState(props.organization.markdown);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setMarkdown(props.organization.markdown);
    setEditing(false);
    setSaving(false);
    setError(null);
  }, [props.organization.id, props.organization.markdown]);

  return (
    <>
      <DescriptionBlock
        title="Beschreibung"
        text={props.organization.markdown}
        emptyTitle="Noch keine Beschreibung vorhanden."
        onEdit={() => setEditing(true)}
      />
      {editing ? (
        <EditModal
          title="Beschreibung"
          label="Organisationsbeschreibung bearbeiten"
          className="markdown-modal"
          onCancel={() => setEditing(false)}
          onSubmit={async (event) => {
              event.preventDefault();
              if (saving) return;
              setSaving(true);
              setError(null);
              try {
                await props.onUpdateOrganization({ markdown });
                setEditing(false);
              } catch (err) {
                setError(err instanceof Error ? err.message : "Beschreibung konnte nicht gespeichert werden.");
              } finally {
                setSaving(false);
              }
            }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setEditing(false)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
            <textarea
              autoFocus
              className="initiative-markdown-editor"
              value={markdown}
              rows={18}
              disabled={saving}
              onChange={(event) => setMarkdown(event.target.value)}
            />
            {error ? <p className="inline-error">{error}</p> : null}
        </EditModal>
      ) : null}
    </>
  );
}

function OrganizationRelationsSection(props: {
  organization: Organization;
  people: Person[];
  organizations: Organization[];
  relationshipTypes: RelationshipType[];
  relationships: OrganizationDetail["relationships"];
  peopleActivity: OrganizationPersonActivity[];
  onCreateRelationship: (input: {
    fromPartyId: number;
    toPartyId: number;
    relationshipTypeId: number;
    roleLabel?: string | null;
    status?: "active" | "inactive";
  }) => Promise<void>;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
  onOpenTask: (taskId: number) => void;
}) {
  const [personManagerOpen, setPersonManagerOpen] = useState(false);
  const [organizationManagerOpen, setOrganizationManagerOpen] = useState(false);
  const [personId, setPersonId] = useState("");
  const [organizationId, setOrganizationId] = useState("");
  const [relationshipTypeId, setRelationshipTypeId] = useState("");
  const [organizationRelationshipTypeId, setOrganizationRelationshipTypeId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [organizationRoleLabel, setOrganizationRoleLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type === "person";
  });
  const existingPersonIds = new Set(memberRelationships.map((relationship) => (
    relationship.fromPartyId === props.organization.id ? relationship.toParty.id : relationship.fromParty.id
  )));
  const availablePeople = props.people.filter((person) => !existingPersonIds.has(person.id));
  const defaultRelationshipType =
    props.relationshipTypes.find((type) => type.key === "member_of")
    ?? props.relationshipTypes.find((type) => type.key === "works_for")
    ?? props.relationshipTypes[0];
  const selectedRelationshipTypeId = relationshipTypeId || (defaultRelationshipType ? String(defaultRelationshipType.id) : "");
  const otherRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type !== "person";
  });
  const existingOrganizationIds = new Set(otherRelationships.map((relationship) => (
    relationship.fromPartyId === props.organization.id ? relationship.toParty.id : relationship.fromParty.id
  )));
  const availableOrganizations = props.organizations.filter((organization) => organization.id !== props.organization.id && !existingOrganizationIds.has(organization.id));
  const defaultOrganizationRelationshipType =
    props.relationshipTypes.find((type) => type.key === "partner_of")
    ?? props.relationshipTypes.find((type) => type.key === "customer_of")
    ?? props.relationshipTypes[0];
  const selectedOrganizationRelationshipTypeId =
    organizationRelationshipTypeId || (defaultOrganizationRelationshipType ? String(defaultOrganizationRelationshipType.id) : "");

  return (
    <>
      <RelationGroup
        title="Personen"
        emptyMode="none"
        actions={(
          <button
            type="button"
            className="icon-button compact"
            onClick={() => setPersonManagerOpen(true)}
            disabled={saving || availablePeople.length === 0 || props.relationshipTypes.length === 0}
            title="Person verknüpfen"
            aria-label="Person verknüpfen"
          >
            <Plus size={15} />
          </button>
        )}
      >
        {props.peopleActivity.length > 0 ? (
          <OrganizationPeopleActivityList
            people={props.peopleActivity}
            initialVisible={8}
            onOpenPerson={props.onOpenPerson}
            onOpenTask={props.onOpenTask}
          />
        ) : (
          memberRelationships.map((relationship) => {
            const person = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
            const direction =
              relationship.relationshipType.directionality === "symmetric"
                ? relationship.relationshipType.label
                : relationship.fromPartyId === person.id
                  ? relationship.relationshipType.label
                  : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
            return (
              <RelationItem
                key={relationship.id}
                icon={<Users size={16} />}
                title={person.displayName}
                meta={[direction, relationship.roleLabel].filter(Boolean).join(" · ")}
                onOpen={() => props.onOpenPerson(person.id)}
              />
            );
          })
        )}
      </RelationGroup>
      <RelationGroup
        title="Organisationen"
        emptyMode="none"
        actions={(
          <button
            type="button"
            className="icon-button compact"
            onClick={() => setOrganizationManagerOpen(true)}
            disabled={saving || availableOrganizations.length === 0 || props.relationshipTypes.length === 0}
            title="Organisation verknüpfen"
            aria-label="Organisation verknüpfen"
          >
            <Plus size={15} />
          </button>
        )}
      >
        {otherRelationships.map((relationship) => {
          const otherParty = relationship.fromPartyId === props.organization.id ? relationship.toParty : relationship.fromParty;
          const label =
            relationship.relationshipType.directionality === "symmetric"
              ? relationship.relationshipType.label
              : relationship.fromPartyId === props.organization.id
                ? relationship.relationshipType.label
                : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
          return (
            <RelationItem
              key={relationship.id}
              icon={<Building2 size={16} />}
              title={otherParty.displayName}
              meta={[label, relationship.roleLabel].filter(Boolean).join(" · ")}
              onOpen={() => props.onOpenOrganization(otherParty.id)}
            />
          );
        })}
      </RelationGroup>
      {error ? <ErrorState title="Beziehung konnte nicht gespeichert werden" description={error} /> : null}
      {personManagerOpen ? (
        <EditModal
          title="Person verknüpfen"
          label="Person mit Organisation verknüpfen"
          className="party-edit-modal"
          onCancel={() => setPersonManagerOpen(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            const nextPersonId = Number(personId);
            const nextTypeId = Number(selectedRelationshipTypeId);
            if (!nextPersonId || !nextTypeId || saving) return;
            setSaving(true);
            setError(null);
            try {
              await props.onCreateRelationship({
                fromPartyId: nextPersonId,
                toPartyId: props.organization.id,
                relationshipTypeId: nextTypeId,
                roleLabel: roleLabel.trim() || null,
                status: "active"
              });
              setPersonId("");
              setRoleLabel("");
              setPersonManagerOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Beziehung konnte nicht hinzugefügt werden.");
            } finally {
              setSaving(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={!personId || !selectedRelationshipTypeId || saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setPersonManagerOpen(false)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
          <label>
            Person
            <select value={personId} onChange={(event) => setPersonId(event.target.value)} disabled={saving}>
              <option value="">Person auswählen</option>
              {availablePeople.map((person) => (
                <option key={person.id} value={person.id}>{personName(person)}</option>
              ))}
            </select>
          </label>
          <label>
            Beziehung
            <select value={selectedRelationshipTypeId} onChange={(event) => setRelationshipTypeId(event.target.value)} disabled={saving || props.relationshipTypes.length === 0}>
              {props.relationshipTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </label>
          <label>
            Rolle / Kontext
            <input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} disabled={saving} />
          </label>
        </EditModal>
      ) : null}
      {organizationManagerOpen ? (
        <EditModal
          title="Organisation verknüpfen"
          label="Organisation mit Organisation verknüpfen"
          className="party-edit-modal"
          onCancel={() => setOrganizationManagerOpen(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            const nextOrganizationId = Number(organizationId);
            const nextTypeId = Number(selectedOrganizationRelationshipTypeId);
            if (!nextOrganizationId || !nextTypeId || saving) return;
            setSaving(true);
            setError(null);
            try {
              await props.onCreateRelationship({
                fromPartyId: props.organization.id,
                toPartyId: nextOrganizationId,
                relationshipTypeId: nextTypeId,
                roleLabel: organizationRoleLabel.trim() || null,
                status: "active"
              });
              setOrganizationId("");
              setOrganizationRoleLabel("");
              setOrganizationManagerOpen(false);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Organisation konnte nicht verknüpft werden.");
            } finally {
              setSaving(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={!organizationId || !selectedOrganizationRelationshipTypeId || saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setOrganizationManagerOpen(false)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
          <label>
            Organisation
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={saving}>
              <option value="">Organisation auswählen</option>
              {availableOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.displayName}</option>
              ))}
            </select>
          </label>
          <label>
            Beziehung
            <select value={selectedOrganizationRelationshipTypeId} onChange={(event) => setOrganizationRelationshipTypeId(event.target.value)} disabled={saving || props.relationshipTypes.length === 0}>
              {props.relationshipTypes.map((type) => (
                <option key={type.id} value={type.id}>{type.label}</option>
              ))}
            </select>
          </label>
          <label>
            Rolle / Kontext
            <input value={organizationRoleLabel} onChange={(event) => setOrganizationRoleLabel(event.target.value)} disabled={saving} />
          </label>
        </EditModal>
      ) : null}
    </>
  );
}

export function partyRelationshipLabel(relationship: PartyRelationshipWithParties, perspectivePartyId: number): string {
  const label =
    relationship.relationshipType.directionality === "symmetric"
      ? relationship.relationshipType.label
      : relationship.fromPartyId === perspectivePartyId
        ? relationship.relationshipType.label
        : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
  return [label, relationship.roleLabel].filter(Boolean).join(" · ");
}

function OrganizationParticipationsSection(props: {
  organization: Organization;
  participants: EntityParticipant[];
  initiatives: Initiative[];
  tasks: Task[];
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
}) {
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const taskById = new Map(props.tasks.map((task) => [task.id, task]));
  const linkedInitiativeIds = new Set(props.participants.filter((participant) => participant.entityType === "initiative").map((participant) => participant.entityId));
  const linkedTaskIds = new Set(props.participants.filter((participant) => participant.entityType === "task").map((participant) => participant.entityId));
  const availableInitiatives = props.initiatives.filter((initiative) => !linkedInitiativeIds.has(initiative.id));
  const availableTasks = props.tasks.filter((task) => !linkedTaskIds.has(task.id));
  const [linkType, setLinkType] = useState<"initiative" | "task" | null>(null);
  const [entityId, setEntityId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const availableEntities = linkType === "task" ? availableTasks : availableInitiatives;

  return (
    <SectionBlock
      title="DMAX-Kontexte"
      actions={(
        <>
          <button
            type="button"
            className="icon-button compact"
            disabled={saving || availableInitiatives.length === 0}
            title="Initiative verknüpfen"
            aria-label="Initiative verknüpfen"
            onClick={() => {
              setLinkType("initiative");
              setEntityId("");
              setRoleLabel("");
            }}
          >
            <Plus size={15} />
          </button>
          <button
            type="button"
            className="icon-button compact"
            disabled={saving || availableTasks.length === 0}
            title="Maßnahme verknüpfen"
            aria-label="Maßnahme verknüpfen"
            onClick={() => {
              setLinkType("task");
              setEntityId("");
              setRoleLabel("");
            }}
          >
            <Plus size={15} />
          </button>
        </>
      )}
    >
      <RelationList emptyTitle="Keine DMAX-Kontexte" emptyDescription="Diese Organisation ist noch keiner Initiative oder Maßnahme zugeordnet.">
        {props.participants.map((participant) => {
          const title =
            participant.entityType === "initiative"
              ? initiativeById.get(participant.entityId)?.name
              : participant.entityType === "task"
                ? taskById.get(participant.entityId)?.title
                : null;
          return (
            <RelationItem
              key={participant.id}
              icon={participant.entityType === "task" ? <ClipboardList size={16} /> : <Blocks size={16} />}
              title={title ?? `${entityTypeLabel(participant.entityType)} #${participant.entityId}`}
              meta={`${entityTypeLabel(participant.entityType)} · ${participantRoleSummary(participant)}`}
              onOpen={() => {
                if (participant.entityType === "initiative") props.onOpenInitiative(participant.entityId);
                if (participant.entityType === "task") props.onOpenTask(participant.entityId);
              }}
            />
          );
        })}
      </RelationList>
      {error ? <ErrorState title="Verknüpfung konnte nicht gespeichert werden" description={error} /> : null}
      {linkType ? (
        <EditModal
          title={linkType === "task" ? "Maßnahme verknüpfen" : "Initiative verknüpfen"}
          label={linkType === "task" ? "Organisation mit Maßnahme verknüpfen" : "Organisation mit Initiative verknüpfen"}
          className="party-edit-modal"
          onCancel={() => setLinkType(null)}
          onSubmit={async (event) => {
            event.preventDefault();
            const nextEntityId = Number(entityId);
            if (!nextEntityId || saving) return;
            setSaving(true);
            setError(null);
            try {
              await props.onCreateParticipant({
                partyId: props.organization.id,
                entityType: linkType,
                entityId: nextEntityId,
                roleLabel: roleLabel.trim() || null,
                isPrimary: false
              });
              setEntityId("");
              setRoleLabel("");
              setLinkType(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Verknüpfung konnte nicht gespeichert werden.");
            } finally {
              setSaving(false);
            }
          }}
          footer={(
            <>
              <button type="submit" className="primary-button" disabled={!entityId || saving}>Speichern</button>
              <button type="button" className="small-button" onClick={() => setLinkType(null)} disabled={saving}>Abbrechen</button>
            </>
          )}
        >
          <label>
            {linkType === "task" ? "Maßnahme" : "Initiative"}
            <select value={entityId} onChange={(event) => setEntityId(event.target.value)} disabled={saving}>
              <option value="">{linkType === "task" ? "Maßnahme auswählen" : "Initiative auswählen"}</option>
              {availableEntities.map((entity) => (
                <option key={entity.id} value={entity.id}>{linkType === "task" ? (entity as Task).title : (entity as Initiative).name}</option>
              ))}
            </select>
          </label>
          <label>
            Rolle / Kontext
            <input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} disabled={saving} />
          </label>
        </EditModal>
      ) : null}
    </SectionBlock>
  );
}
