import { useState } from "react";
import type { ReactNode } from "react";
import { Pencil, Plus, Send, Trash2 } from "lucide-react";
import type { PartyContactPoint } from "../../types.js";
import { ConfirmModal, EditModal, ErrorState, RelationItem, RelationList, SectionBlock } from "../ui/index.js";

export type ContactPointInput = {
  type: PartyContactPoint["type"];
  label?: string | null;
  value: string;
  isPrimary?: boolean;
  isPreferred?: boolean;
  canSend?: boolean;
  canReceive?: boolean;
  provider?: string | null;
};

const contactPointTypeOptions: Array<{
  value: PartyContactPoint["type"];
  label: string;
  inputType: "email" | "tel" | "url" | "text";
  placeholder: string;
}> = [
  { value: "email", label: "E-Mail", inputType: "email", placeholder: "name@example.com" },
  { value: "phone", label: "Telefon", inputType: "tel", placeholder: "+49 ..." },
  { value: "whatsapp", label: "WhatsApp", inputType: "tel", placeholder: "+49 ..." },
  { value: "signal", label: "Signal", inputType: "tel", placeholder: "+49 ..." },
  { value: "telegram", label: "Telegram", inputType: "text", placeholder: "@username" },
  { value: "linkedin", label: "LinkedIn", inputType: "url", placeholder: "https://linkedin.com/in/..." },
  { value: "website", label: "Webseite", inputType: "url", placeholder: "https://..." },
  { value: "other", label: "Sonstiges", inputType: "text", placeholder: "Kontaktwert" }
];

function contactPointTypeOption(type: PartyContactPoint["type"]) {
  return contactPointTypeOptions.find((option) => option.value === type) ?? contactPointTypeOptions[0];
}

export function contactPointTypeLabel(type: PartyContactPoint["type"]): string {
  return contactPointTypeOption(type).label;
}

function contactPointCapabilities(type: PartyContactPoint["type"]): { canSend: boolean; canReceive: boolean } {
  if (type === "website") return { canSend: false, canReceive: false };
  return { canSend: true, canReceive: true };
}

export function ContactPointList(props: {
  partyId: number;
  contactPoints: PartyContactPoint[];
  title?: string;
  description?: string | null;
  emptyTitle?: string;
  emptyDescription?: string;
  addLabel?: string;
  addIconOnly?: boolean;
  deleteDescription?: (contactPoint: PartyContactPoint) => ReactNode;
  onActivateContactPoint?: (contactPoint: PartyContactPoint) => void;
  onCreate: (partyId: number, input: ContactPointInput) => Promise<void>;
  onUpdate: (contactPointId: number, input: Partial<ContactPointInput>) => Promise<void>;
  onDelete: (contactPointId: number) => Promise<void>;
}) {
  const [editingContactPoint, setEditingContactPoint] = useState<PartyContactPoint | "new" | null>(null);
  const [deletingContactPoint, setDeletingContactPoint] = useState<PartyContactPoint | null>(null);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  return (
    <SectionBlock
      title={props.title ?? "Kontaktwege"}
      description={props.description === undefined ? "Direkte Wege zur Organisation." : props.description}
      actions={(
        <button
          type="button"
          className={props.addIconOnly ? "icon-button compact" : "section-primary-action"}
          onClick={() => setEditingContactPoint("new")}
          disabled={busyAction !== null}
          title={props.addLabel ?? "Kontaktweg hinzufügen"}
          aria-label={props.addLabel ?? "Kontaktweg hinzufügen"}
        >
          <Plus size={15} />
          {props.addIconOnly ? null : props.addLabel ?? "Kontaktweg hinzufügen"}
        </button>
      )}
    >
      <RelationList emptyTitle={props.emptyTitle ?? "Keine Kontaktwege"} emptyDescription={props.emptyDescription ?? "E-Mail, Telefon oder Website können ergänzt werden."}>
        {props.contactPoints.map((contactPoint) => (
          <ContactPointItem
            key={contactPoint.id}
            contactPoint={contactPoint}
            disabled={busyAction !== null}
            onEdit={() => setEditingContactPoint(contactPoint)}
            onOpen={props.onActivateContactPoint && contactPoint.type === "email" ? () => props.onActivateContactPoint?.(contactPoint) : undefined}
            onDelete={() => {
              if (busyAction) return;
              setDeletingContactPoint(contactPoint);
            }}
          />
        ))}
      </RelationList>
      {error ? <ErrorState title="Kontaktweg konnte nicht gespeichert werden" description={error} /> : null}
      {editingContactPoint ? (
        <ContactPointEditor
          contactPoint={editingContactPoint === "new" ? null : editingContactPoint}
          onCancel={() => setEditingContactPoint(null)}
          onSave={async (input) => {
            if (busyAction) return;
            setBusyAction(editingContactPoint === "new" ? "create" : `update:${editingContactPoint.id}`);
            setError(null);
            try {
              if (editingContactPoint === "new") {
                await props.onCreate(props.partyId, input);
              } else {
                await props.onUpdate(editingContactPoint.id, input);
              }
              setEditingContactPoint(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Kontaktweg konnte nicht gespeichert werden.");
              throw err;
            } finally {
              setBusyAction(null);
            }
          }}
        />
      ) : null}
      {deletingContactPoint ? (
        <ConfirmModal
          title="Kontaktweg löschen?"
          description={props.deleteDescription ? props.deleteDescription(deletingContactPoint) : <p>„{deletingContactPoint.value}“ wird entfernt.</p>}
          confirmLabel="Kontaktweg löschen"
          busy={busyAction !== null}
          onCancel={() => setDeletingContactPoint(null)}
          onConfirm={async () => {
            if (busyAction) return;
            setBusyAction(`delete:${deletingContactPoint.id}`);
            setError(null);
            try {
              await props.onDelete(deletingContactPoint.id);
              setDeletingContactPoint(null);
            } catch (err) {
              setError(err instanceof Error ? err.message : "Kontaktweg konnte nicht gelöscht werden.");
            } finally {
              setBusyAction(null);
            }
          }}
        />
      ) : null}
    </SectionBlock>
  );
}

export function ContactPointItem(props: {
  contactPoint: PartyContactPoint;
  disabled?: boolean;
  onOpen?: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  const contactPoint = props.contactPoint;
  return (
    <RelationItem
      icon={<Send size={15} />}
      title={contactPoint.value}
      meta={[contactPointTypeLabel(contactPoint.type), contactPoint.label, contactPoint.isPreferred ? "bevorzugt" : null, contactPoint.isPrimary ? "primär" : null]
        .filter(Boolean)
        .join(" · ")}
      onOpen={props.onOpen}
      actions={(
        <>
          {props.onEdit ? (
            <button
              type="button"
              className="icon-button compact"
              disabled={props.disabled}
              title="Kontaktweg bearbeiten"
              onClick={props.onEdit}
            >
              <Pencil size={14} />
            </button>
          ) : null}
          {props.onDelete ? (
            <button
              type="button"
              className="icon-button compact"
              disabled={props.disabled}
              title="Kontaktweg löschen"
              onClick={props.onDelete}
            >
              <Trash2 size={14} />
            </button>
          ) : null}
        </>
      )}
    />
  );
}

export function ContactPointEditor(props: {
  contactPoint: PartyContactPoint | null;
  onCancel: () => void;
  onSave: (input: ContactPointInput) => Promise<void>;
}) {
  const [type, setType] = useState<PartyContactPoint["type"]>(props.contactPoint?.type ?? "email");
  const [label, setLabel] = useState(props.contactPoint?.label ?? "");
  const [value, setValue] = useState(props.contactPoint?.value ?? "");
  const [isPrimary, setIsPrimary] = useState(props.contactPoint?.isPrimary ?? false);
  const [isPreferred, setIsPreferred] = useState(props.contactPoint?.isPreferred ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedType = contactPointTypeOption(type);

  return (
    <EditModal
      title={props.contactPoint ? "Kontaktweg bearbeiten" : "Kontaktweg hinzufügen"}
      label="Kontaktweg bearbeiten"
      className="party-edit-modal"
      onCancel={props.onCancel}
      onSubmit={async (event) => {
        event.preventDefault();
        if (!value.trim() || busy) return;
        setBusy(true);
        setError(null);
        try {
          await props.onSave({
            type,
            label: label.trim() || null,
            value: value.trim(),
            isPrimary,
            isPreferred,
            ...contactPointCapabilities(type)
          });
        } catch (err) {
          setError(err instanceof Error ? err.message : "Kontaktweg konnte nicht gespeichert werden.");
        } finally {
          setBusy(false);
        }
      }}
      footer={(
        <>
          <button type="submit" className="primary-button" disabled={!value.trim() || busy}>Speichern</button>
          <button type="button" className="small-button" onClick={props.onCancel} disabled={busy}>Abbrechen</button>
        </>
      )}
    >
      <label>
        Typ
        <select value={type} onChange={(event) => setType(event.target.value as PartyContactPoint["type"])}>
          {contactPointTypeOptions.map((entry) => (
            <option key={entry.value} value={entry.value}>{entry.label}</option>
          ))}
        </select>
      </label>
      <label>
        Label
        <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder="z.B. Zentrale, Vertrieb" />
      </label>
      <label>
        Wert
        <input autoFocus type={selectedType.inputType} value={value} onChange={(event) => setValue(event.target.value)} placeholder={selectedType.placeholder} />
      </label>
      <label className="inline-checkbox">
        <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
        Primär
      </label>
      <label className="inline-checkbox">
        <input type="checkbox" checked={isPreferred} onChange={(event) => setIsPreferred(event.target.checked)} />
        Bevorzugt
      </label>
      {error ? <p className="inline-error">{error}</p> : null}
    </EditModal>
  );
}
