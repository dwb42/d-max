import { useState } from "react";
import { Plus } from "lucide-react";
import { EditModal, EmptyState, EntityList, EntityListItem, EntityListPage, ErrorState } from "../../components/ui/index.js";
import type { Organization } from "../../types.js";

export { OrganizationsView as OrganizationListPage };

function OrganizationsView(props: {
  organizations: Organization[];
  onOpenOrganization: (partyId: number) => void;
  onCreateClick: () => void;
}) {
  const [search, setSearch] = useState("");
  const trimmedSearch = search.trim().toLowerCase();
  const filteredOrganizations = props.organizations.filter((organization) => {
    const needle = trimmedSearch;
    if (!needle) return true;
    return [organization.displayName, organization.name, organization.legalName, organization.organizationType]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(needle);
  });

  return (
    <EntityListPage className="organization-list-page">
      <div className="entity-list-toolbar">
        <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Organisation suchen" aria-label="Organisation suchen" />
      </div>

      {props.organizations.length === 0 ? (
        <EmptyState
          title="Noch keine Organisationen"
          description="Lege die erste Organisation an, um Kontakte, Beziehungen und DMAX-Kontexte sichtbar zu machen."
          action={(
            <button type="button" className="section-primary-action" onClick={props.onCreateClick}>
              <Plus size={15} />
              Organisation hinzufügen
            </button>
          )}
        />
      ) : null}
      {props.organizations.length > 0 && filteredOrganizations.length === 0 ? (
        <EmptyState
          title="Keine Organisationen gefunden"
          description="Passe die Suche an, um die Organisationsliste wieder zu erweitern."
        />
      ) : null}
      {filteredOrganizations.length > 0 ? (
        <EntityList>
          {filteredOrganizations.map((organization) => (
            <EntityListItem
              key={organization.id}
              marker={<span className="organization-list-avatar">{organizationInitials(organization)}</span>}
              title={organization.displayName}
              meta={organizationListMeta(organization)}
              onOpen={() => props.onOpenOrganization(organization.id)}
            />
          ))}
        </EntityList>
      ) : null}
    </EntityListPage>
  );
}

export function OrganizationCreateModal(props: {
  onCancel: () => void;
  onCreate: (input: { name: string; legalName?: string | null; organizationType?: string | null }) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [legalName, setLegalName] = useState("");
  const [organizationType, setOrganizationType] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canCreate = Boolean(name.trim());

  return (
    <EditModal
      title="Organisation hinzufügen"
      label="Organisation hinzufügen"
      className="compact-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedName = name.trim();
        if (!trimmedName || creating) return;
        setCreating(true);
        setError(null);
        try {
          await props.onCreate({
            name: trimmedName,
            legalName: legalName.trim() || null,
            organizationType: organizationType.trim() || null
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Organisation konnte nicht angelegt werden.");
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
      <div className="organization-create-fields">
        <label>
          Name
          <input value={name} onChange={(event) => setName(event.target.value)} placeholder="Organisation" disabled={creating} />
        </label>
        <label>
          Rechtlicher Name
          <input value={legalName} onChange={(event) => setLegalName(event.target.value)} placeholder="Legal Name" disabled={creating} />
        </label>
        <label>
          Typ
          <input value={organizationType} onChange={(event) => setOrganizationType(event.target.value)} placeholder="Firma, Verein, Club" disabled={creating} />
        </label>
      </div>
      {error ? <ErrorState title="Organisation konnte nicht angelegt werden" description={error} /> : null}
    </EditModal>
  );
}

function organizationListMeta(organization: Organization): string | null {
  const parts = [
    organization.organizationType,
    organization.legalName && organization.legalName !== organization.displayName ? organization.legalName : null
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : null;
}

function organizationInitials(organization: Organization): string {
  const parts = organization.displayName.split(/\s+/).filter(Boolean);
  const initials = parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
  return initials || "O";
}
