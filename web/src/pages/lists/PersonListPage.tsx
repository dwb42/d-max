import { useState } from "react";
import { Plus } from "lucide-react";
import { EditModal, EmptyState, EntityList, EntityListItem, EntityListPage, ErrorState } from "../../components/ui/index.js";
import type { Person } from "../../types.js";
import { salutationLabel } from "./listUtils.js";

export { PeopleView as PersonListPage };

function PeopleView(props: {
  people: Person[];
  onOpenPerson: (partyId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const filteredPeople = props.people.filter((person) => {
    const needle = trimmedSearch;
    if (!needle) return true;
    return [person.displayName, person.firstName, person.lastName, person.academicTitle, salutationLabel(person.salutation)]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <EntityListPage className="person-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Person suchen" aria-label="Person suchen" />
      </div>

      {props.people.length === 0 ? (
        <EmptyState
          title="Noch keine Personen"
          description="Lege die erste Person an, um Kontakte, Beziehungen und Beteiligungen sichtbar zu machen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Person hinzufügen
            </button>
          )}
        />
      ) : null}
      {props.people.length > 0 && filteredPeople.length === 0 ? (
        <EmptyState
          title="Keine Personen gefunden"
          description="Passe die Suche an, um die Personenliste wieder zu erweitern."
        />
      ) : null}
      {filteredPeople.length > 0 ? (
        <EntityList>
          {filteredPeople.map((person) => (
            <EntityListItem
              key={person.id}
              marker={<span className="person-list-avatar">{personInitials(person)}</span>}
              title={person.displayName}
              meta={personListMeta(person)}
              onOpen={() => props.onOpenPerson(person.id)}
            />
          ))}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

export function PersonCreateModal(props: {
  onCancel: () => void;
  onCreate: (input: {
    displayName?: string;
    firstName?: string | null;
    lastName?: string | null;
    salutation?: Person["salutation"];
    academicTitle?: string | null;
    nameSuffix?: string | null;
  }) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [salutation, setSalutation] = useState<Person["salutation"]>("unknown");
  const [academicTitle, setAcademicTitle] = useState("");
  const [nameSuffix, setNameSuffix] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = Boolean(firstName.trim() || lastName.trim());

  return (
    <EditModal
      title="Person hinzufügen"
      label="Person hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!canCreate || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            firstName: firstName.trim() || null,
            lastName: lastName.trim() || null,
            salutation,
            academicTitle: academicTitle.trim() || null,
            nameSuffix: nameSuffix.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Person konnte nicht angelegt werden.");
        } finally {
          setCreating(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!canCreate || creating}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={creating}>Abbrechen</button>
        </>
      )}
    >
      <div className="person-create-fields">
        <label>
          Anrede
          <select value={salutation} onChange={(event) => setSalutation(event.target.value as Person["salutation"])} disabled={creating}>
            <option value="unknown">Unbekannt</option>
            <option value="mr">Herr</option>
            <option value="mrs">Frau</option>
          </select>
        </label>
        <label>
          Titel
          <input value={academicTitle} onChange={(event) => setAcademicTitle(event.target.value)} placeholder="Dr., Prof. Dr." disabled={creating} />
        </label>
        <label>
          Vorname
          <input value={firstName} onChange={(event) => setFirstName(event.target.value)} placeholder="Vorname" disabled={creating} />
        </label>
        <label>
          Nachname
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} placeholder="Nachname" disabled={creating} />
        </label>
        <label>
          Zusatz
          <input value={nameSuffix} onChange={(event) => setNameSuffix(event.target.value)} placeholder="Suffix" disabled={creating} />
        </label>
      </div>
      {error ? <ErrorState title="Person konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function personListMeta(person: Person): string | null {
  const nameParts = [person.firstName, person.lastName].filter(Boolean).join(" ");
  const parts = [
    person.salutation !== "unknown" ? salutationLabel(person.salutation) : null,
    person.academicTitle,
    nameParts && nameParts !== person.displayName ? nameParts : null,
    person.nameSuffix
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function personInitials(person: Person): string {
  const sourceParts = [person.firstName, person.lastName].filter((part): part is string => Boolean(part));
  const fallbackParts = person.displayName.split(/\s+/).filter(Boolean);
  const initials = (sourceParts.length > 0 ? sourceParts : fallbackParts)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "P";
}
