import { useState } from "react";
import { Blocks, Building2, ClipboardList, Users } from "lucide-react";
import { EditModal, EmptyState, EntityDetailPage, ErrorState, MetadataGrid, RelationGroup, RelationItem, RelationList, SectionBlock } from "../../components/ui/index.js";
import { AddressBlock, ContactPointList } from "../../components/party/index.js";
import type { AddressInput, ContactPointInput } from "../../components/party/index.js";
import type { EntityParticipant, Initiative, Person, PersonDetail, Task } from "../../types.js";
import { entityTypeLabel, formatDateTimeForUi, participantRoleSummary, partyRelationshipLabel, salutationLabel } from "./detailUtils.js";

export function PersonDetailView(props: {
  detail: PersonDetail | null;
  loadError: string | null;
  initiatives: Initiative[];
  tasks: Task[];
  coreModalOpen: boolean;
  onCloseCoreModal: () => void;
  onUpdatePerson: (partyId: number, input: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    salutation?: Person["salutation"];
    academicTitle?: string | null;
    nameSuffix?: string | null;
  }) => Promise<void>;
  onCreateContactPoint: (partyId: number, input: ContactPointInput) => Promise<void>;
  onUpdateContactPoint: (contactPointId: number, input: Partial<ContactPointInput>) => Promise<void>;
  onDeleteContactPoint: (contactPointId: number) => Promise<void>;
  onCreateAddress: (partyId: number, input: AddressInput) => Promise<void>;
  onUpdateAddress: (addressId: number, input: Partial<AddressInput>) => Promise<void>;
  onDeleteAddress: (addressId: number) => Promise<void>;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const person = props.detail?.person;

  if (props.loadError) {
    return (
      <ErrorState
        title="Person nicht gefunden"
        description="Diese Person existiert nicht oder konnte nicht geladen werden. Gehe zurück zur Personenliste und wähle einen vorhandenen Eintrag."
      />
    );
  }

  if (!props.detail || !person) return <EmptyState title="Person wird geladen" description="Die Detaildaten werden aus DMAX geladen." />;

  return (
    <EntityDetailPage
      className="person-reference-detail"
      aside={(
        <MetadataGrid
          items={[
            { label: "Anrede", value: salutationLabel(person.salutation) },
            { label: "Titel", value: person.academicTitle },
            { label: "Vorname", value: person.firstName },
            { label: "Nachname", value: person.lastName },
            { label: "Namenszusatz", value: person.nameSuffix },
            { label: "Kontaktwege", value: props.detail.contactPoints.length },
            { label: "Anschriften", value: props.detail.addresses.length },
            { label: "Beziehungen", value: props.detail.relationships.length },
            { label: "DMAX-Kontexte", value: props.detail.participants.length },
            { label: "Erstellt", value: formatDateTimeForUi(person.createdAt) },
            { label: "Aktualisiert", value: formatDateTimeForUi(person.updatedAt) }
          ]}
        />
      )}
    >
      {props.coreModalOpen ? (
        <PersonCoreModal
          person={person}
          onCancel={props.onCloseCoreModal}
          onSave={async (input) => {
            await props.onUpdatePerson(person.id, input);
            props.onCloseCoreModal();
          }}
        />
      ) : null}
      <div className="entity-detail-two-column">
        <ContactPointList
          partyId={person.id}
          contactPoints={props.detail.contactPoints}
          description="Direkte Wege zu dieser Person."
          emptyDescription="E-Mail, Telefon oder Messenger können ergänzt werden."
          deleteDescription={(contactPoint) => <p>„{contactPoint.value}“ wird aus dieser Person entfernt.</p>}
          onCreate={props.onCreateContactPoint}
          onUpdate={props.onUpdateContactPoint}
          onDelete={props.onDeleteContactPoint}
        />
        <AddressBlock
          partyId={person.id}
          addresses={props.detail.addresses}
          description="Postalische Orte und weitere Adressen."
          emptyDescription="Post- oder Besuchsadressen können ergänzt werden."
          deleteDescription={(address) => <p>„{address.line1}“ wird aus dieser Person entfernt.</p>}
          onCreate={props.onCreateAddress}
          onUpdate={props.onUpdateAddress}
          onDelete={props.onDeleteAddress}
        />
      </div>
      <PersonRelationsSection
        person={person}
        relationships={props.detail.relationships}
        onOpenPerson={props.onOpenPerson}
        onOpenOrganization={props.onOpenOrganization}
      />
      <PersonParticipationsSection
        participants={props.detail.participants}
        initiatives={props.initiatives}
        tasks={props.tasks}
        onOpenInitiative={props.onOpenInitiative}
        onOpenTask={props.onOpenTask}
      />
    </EntityDetailPage>
  );
}

function PersonCoreModal(props: {
  person: Person;
  onCancel: () => void;
  onSave: (input: {
    displayName?: string;
    firstName: string | null;
    lastName: string | null;
    salutation: Person["salutation"];
    academicTitle: string | null;
    nameSuffix: string | null;
  }) => Promise<void>;
}) {
  const [displayName, setDisplayName] = useState(props.person.displayName);
  const [firstName, setFirstName] = useState(props.person.firstName ?? "");
  const [lastName, setLastName] = useState(props.person.lastName ?? "");
  const [salutation, setSalutation] = useState<Person["salutation"]>(props.person.salutation);
  const [academicTitle, setAcademicTitle] = useState(props.person.academicTitle ?? "");
  const [nameSuffix, setNameSuffix] = useState(props.person.nameSuffix ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSave = Boolean(displayName.trim() || firstName.trim() || lastName.trim());

  return (
    <EditModal
      title="Person bearbeiten"
      label="Person bearbeiten"
      className="party-edit-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canSave || saving) return;
        setSaving(true);
        setError(null);
        try {
          await props.onSave({
            displayName: displayName.trim() || undefined,
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            salutation,
            academicTitle: academicTitle.trim() || null,
            nameSuffix: nameSuffix.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Person konnte nicht gespeichert werden.");
        } finally {
          setSaving(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canSave || saving}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={saving}>Abbrechen</button>
        </>
      )}
    >
      <label>
        Anzeigename
        <input autoFocus value={displayName} onChange={(event) => setDisplayName(event.target.value)} />
      </label>
      <label>
        Anrede
        <select value={salutation} onChange={(event) => setSalutation(event.target.value as Person["salutation"])}>
          <option value="unknown">Unbekannt</option>
          <option value="mr">Herr</option>
          <option value="mrs">Frau</option>
        </select>
      </label>
      <label>
        Titel
        <input value={academicTitle} onChange={(event) => setAcademicTitle(event.target.value)} />
      </label>
      <div className="modal-two-column">
        <label>
          Vorname
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          Nachname
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
      </div>
      <label>
        Zusatz
        <input value={nameSuffix} onChange={(event) => setNameSuffix(event.target.value)} />
      </label>
      {error ? <p className="inline-error">{error}</p> : null}
    </EditModal>
  );
}

function PersonRelationsSection(props: {
  person: Person;
  relationships: PersonDetail["relationships"];
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const organizationRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type === "organization";
  });
  const personRelationships = props.relationships.filter((relationship) => {
    const otherParty = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
    return otherParty.type === "person";
  });

  return (
    <SectionBlock title="Beziehungen" description="Organisationen und Personen, die mit dieser Person verbunden sind.">
      <div className="relation-section-stack">
        <RelationGroup
          title="Organisationen"
          description="Arbeit, Mitgliedschaften und andere Organisationsbeziehungen."
          emptyTitle="Keine Organisationsbeziehungen"
          emptyDescription="Diese Person ist noch mit keiner Organisation verbunden."
        >
          {organizationRelationships.map((relationship) => {
            const organization = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
            return (
              <RelationItem
                key={relationship.id}
                icon={<Building2 size={16} />}
                title={organization.displayName}
                meta={partyRelationshipLabel(relationship, props.person.id)}
                onOpen={() => props.onOpenOrganization(organization.id)}
              />
            );
          })}
        </RelationGroup>
        <RelationGroup
          title="Personen"
          description="Weitere direkte Personenbeziehungen."
          emptyTitle="Keine Personenbeziehungen"
          emptyDescription="Noch keine weitere Person ist verknüpft."
        >
          {personRelationships.map((relationship) => {
            const otherPerson = relationship.fromPartyId === props.person.id ? relationship.toParty : relationship.fromParty;
            return (
              <RelationItem
                key={relationship.id}
                icon={<Users size={16} />}
                title={otherPerson.displayName}
                meta={partyRelationshipLabel(relationship, props.person.id)}
                onOpen={() => props.onOpenPerson(otherPerson.id)}
              />
            );
          })}
        </RelationGroup>
      </div>
    </SectionBlock>
  );
}

function PersonParticipationsSection(props: {
  participants: EntityParticipant[];
  initiatives: Initiative[];
  tasks: Task[];
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
}) {
  const initiativeById = new Map(props.initiatives.map((initiative) => [initiative.id, initiative]));
  const taskById = new Map(props.tasks.map((task) => [task.id, task]));

  return (
    <SectionBlock title="DMAX-Kontexte" description="Initiativen und Maßnahmen, in denen diese Person vorkommt.">
      <RelationList emptyTitle="Keine DMAX-Kontexte" emptyDescription="Diese Person ist noch keiner Initiative oder Maßnahme zugeordnet.">
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
    </SectionBlock>
  );
}

export function personHeaderContext(person: Person): string {
  const nameParts = [person.firstName, person.lastName].filter(Boolean).join(" ");
  return [
    person.salutation !== "unknown" ? salutationLabel(person.salutation) : null,
    person.academicTitle,
    nameParts && nameParts !== person.displayName ? nameParts : null,
    person.nameSuffix
  ]
    .filter(Boolean)
    .join(" · ") || "Person";
}
