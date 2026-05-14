import { useState } from "react";
import type { ReactNode } from "react";
import { Building2, Pencil, Plus, Trash2 } from "lucide-react";
import type { PartyAddress } from "../../types.js";
import { ConfirmModal, EditModal, ErrorState, RelationItem, RelationList, SectionBlock } from "../ui/index.js";

export type AddressInput = {
  label?: string | null;
  line1: string;
  line2?: string | null;
  postalCode?: string | null;
  city?: string | null;
  region?: string | null;
  country?: string | null;
  isPrimary?: boolean;
};

export function AddressBlock(props: {
  partyId: number;
  addresses: PartyAddress[];
  description?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  addLabel?: string;
  deleteDescription?: (address: PartyAddress) => ReactNode;
  onCreate: (partyId: number, input: AddressInput) => Promise<void>;
  onUpdate: (addressId: number, input: Partial<AddressInput>) => Promise<void>;
  onDelete: (addressId: number) => Promise<void>;
}) {
  const [editingAddress, setEditingAddress] = useState<PartyAddress | "new" | null>(null);
  const [deletingAddress, setDeletingAddress] = useState<PartyAddress | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <SectionBlock
      title="Anschriften"
      description={props.description === undefined ? "Postalische Orte und Rechnungsadressen." : props.description}
      actions={(
        <button type="button" className="section-primary-action" onClick={() => setEditingAddress("new")} disabled={busyAction !== null}>
          <Plus size={15} />
          {props.addLabel ?? "Anschrift hinzufügen"}
        </button>
      )}
    >
      <AddressList
        addresses={props.addresses}
        emptyTitle={props.emptyTitle ?? "Keine Anschriften"}
        emptyDescription={props.emptyDescription ?? "Post- oder Rechnungsadressen können ergänzt werden."}
        disabled={busyAction !== null}
        onEdit={(address) => setEditingAddress(address)}
        onDelete={(address) => {
          if (busyAction) return;
          setDeletingAddress(address);
        }}
      />
      {error ? <ErrorState title="Anschrift konnte nicht gespeichert werden" description={error} /> : null}
      {editingAddress ? (
        <AddressEditor
          address={editingAddress === "new" ? null : editingAddress}
          onCancel={() => setEditingAddress(null)}
          onSave={async (input) => {
            if (busyAction) return;
            setBusyAction(editingAddress === "new" ? "create" : `update:${editingAddress.id}`);
            setError(null);
            try {
              if (editingAddress === "new") {
                await props.onCreate(props.partyId, input);
              } else {
                await props.onUpdate(editingAddress.id, input);
              }
              setEditingAddress(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Anschrift konnte nicht gespeichert werden.");
              throw err;
            } finally {
              setBusyAction(null);
            }
          }}
        />
      ) : null}
      {deletingAddress ? (
        <ConfirmModal
          title="Anschrift löschen?"
          description={props.deleteDescription ? props.deleteDescription(deletingAddress) : <p>„{deletingAddress.line1}“ wird entfernt.</p>}
          confirmLabel="Anschrift löschen"
          busy={busyAction !== null}
          onCancel={() => setDeletingAddress(null)}
          onConfirm={async () => {
            if (busyAction) return;
            setBusyAction(`delete:${deletingAddress.id}`);
            setError(null);
            try {
              await props.onDelete(deletingAddress.id);
              setDeletingAddress(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Anschrift konnte nicht gelöscht werden.");
            } finally {
              setBusyAction(null);
            }
          }}
        />
      ) : null}
    </SectionBlock>
  );
}

export function AddressList(props: {
  addresses: PartyAddress[];
  emptyTitle: string;
  emptyDescription?: string;
  disabled?: boolean;
  onEdit?: (address: PartyAddress) => void;
  onDelete?: (address: PartyAddress) => void;
}) {
  return (
    <RelationList emptyTitle={props.emptyTitle} emptyDescription={props.emptyDescription}>
      {props.addresses.map((address) => (
        <AddressItem
          key={address.id}
          address={address}
          disabled={props.disabled}
          onEdit={props.onEdit}
          onDelete={props.onDelete}
        />
      ))}
    </RelationList>
  );
}

function AddressItem(props: {
  address: PartyAddress;
  disabled?: boolean;
  onEdit?: (address: PartyAddress) => void;
  onDelete?: (address: PartyAddress) => void;
}) {
  const address = props.address;
  return (
    <RelationItem
      icon={<Building2 size={15} />}
      title={address.line1}
      meta={[formatAddressLine(address), address.label, address.isPrimary ? "primär" : null].filter(Boolean).join(" · ")}
      actions={(
        <>
          {props.onEdit ? (
            <button
              type="button"
              className="icon-button compact"
              disabled={props.disabled}
              title="Anschrift bearbeiten"
              onClick={() => props.onEdit?.(address)}
            >
              <Pencil size={14} />
            </button>
          ) : null}
          {props.onDelete ? (
            <button
              type="button"
              className="icon-button compact"
              disabled={props.disabled}
              title="Anschrift löschen"
              onClick={() => props.onDelete?.(address)}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </>
      )}
    />
  );
}

export function AddressEditor(props: {
  address: PartyAddress | null;
  onCancel: () => void;
  onSave: (input: AddressInput) => Promise<void>;
}) {
  const [label, setLabel] = useState(props.address?.label ?? "");
  const [line1, setLine1] = useState(props.address?.line1 ?? "");
  const [line2, setLine2] = useState(props.address?.line2 ?? "");
  const [postalCode, setPostalCode] = useState(props.address?.postalCode ?? "");
  const [city, setCity] = useState(props.address?.city ?? "");
  const [region, setRegion] = useState(props.address?.region ?? "");
  const [country, setCountry] = useState(props.address?.country ?? "");
  const [isPrimary, setIsPrimary] = useState(props.address?.isPrimary ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <EditModal
      title={props.address ? "Postanschrift bearbeiten" : "Postanschrift hinzufügen"}
      label="Postanschrift bearbeiten"
      className="party-edit-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!line1.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
          await props.onSave({
            label: label.trim() || null,
            line1: line1.trim(),
            line2: line2.trim() || null,
            postalCode: postalCode.trim() || null,
            city: city.trim() || null,
            region: region.trim() || null,
            country: country.trim() || null,
            isPrimary
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Anschrift konnte nicht gespeichert werden.");
        } finally {
          setBusy(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!line1.trim() || busy}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={busy}>Abbrechen</button>
        </>
      )}
    >
      <label>
        Label
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="z.B. Büro, Rechnung" />
      </label>
      <label>
        Adresse 1
        <input autoFocus value={line1} onChange={(event) => setLine1(event.target.value)} />
      </label>
      <label>
        Adresse 2
        <input value={line2} onChange={(event) => setLine2(event.target.value)} />
      </label>
      <div className="modal-two-column">
        <label>
          PLZ
          <input value={postalCode} onChange={(event) => setPostalCode(event.target.value)} />
        </label>
        <label>
          Ort
          <input value={city} onChange={(event) => setCity(event.target.value)} />
        </label>
      </div>
      <div className="modal-two-column">
        <label>
          Region
          <input value={region} onChange={(event) => setRegion(event.target.value)} />
        </label>
        <label>
          Land
          <input value={country} onChange={(event) => setCountry(event.target.value)} />
        </label>
      </div>
      <label className="inline-checkbox">
        <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
        Primär
      </label>
      {error ? <p className="inline-error">{error}</p> : null}
    </EditModal>
  );
}

export function formatAddressLine(address: PartyAddress): string {
  return [address.line2, [address.postalCode, address.city].filter(Boolean).join(" "), address.region, address.country]
    .filter(Boolean)
    .join(" · ");
}
