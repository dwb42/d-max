import { useState } from "react";
import type { ReactNode } from "react";
import { Check, Copy, Globe, Link2, Mail, Pencil, Phone, Plus, Send, Trash2 } from "lucide-react";
import type { PartyContactPoint } from "../../types.js";
import { ConfirmModal, EditModal, ErrorState, RelationItem, RelationList, SectionBlock } from "../ui/index.js";
import { writeTextToClipboard } from "../ui/clipboard.js";

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
  const normalizedUrl = contactPointUrl(contactPoint);
  const normalizedPhone = contactPointPhone(contactPoint);
  return (
    <RelationItem
      icon={contactPointIcon(contactPoint)}
      title={normalizedUrl?.displayValue ?? normalizedPhone?.displayValue ?? contactPoint.value}
      meta={contactPointMeta(contactPoint)}
      onOpen={props.onOpen}
      href={normalizedUrl?.href ?? normalizedPhone?.href}
      target={normalizedUrl ? "_blank" : undefined}
      rel={normalizedUrl ? "noopener noreferrer" : undefined}
      openLabel={normalizedUrl ? `${normalizedUrl.displayValue} öffnen` : normalizedPhone ? `${normalizedPhone.displayValue} anrufen` : undefined}
      actions={(
        <>
          {normalizedPhone ? (
            <ContactCopyButton
              value={normalizedPhone.displayValue}
              label="Telefonnummer kopieren"
              disabled={props.disabled}
            />
          ) : null}
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

function ContactCopyButton(props: { value: string; label: string; disabled?: boolean }) {
  const [status, setStatus] = useState<"idle" | "copied" | "error">("idle");

  const copy = async () => {
    if (props.disabled) return;
    try {
      const copied = await writeTextToClipboard(props.value);
      setStatus(copied ? "copied" : "error");
    } catch {
      setStatus("error");
    }
    window.setTimeout(() => setStatus("idle"), 1400);
  };

  const title = status === "copied" ? "Kopiert" : status === "error" ? "Kopieren fehlgeschlagen" : props.label;
  return (
    <button
      type="button"
      className={`icon-button compact copy-feedback-${status}`}
      disabled={props.disabled}
      title={title}
      aria-label={title}
      onClick={() => void copy()}
    >
      {status === "copied" ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function contactPointIcon(contactPoint: PartyContactPoint): ReactNode {
  if (contactPointUrl(contactPoint)) {
    return contactPoint.type === "website" ? <Globe size={15} /> : <Link2 size={15} />;
  }
  if (contactPoint.type === "email") return <Mail size={15} />;
  if (contactPoint.type === "phone" || contactPoint.type === "whatsapp" || contactPoint.type === "signal") return <Phone size={15} />;
  return <Send size={15} />;
}

function contactPointMeta(contactPoint: PartyContactPoint): string | null {
  const typeLabel = contactPointTypeLabel(contactPoint.type);
  const label = contactPoint.label?.trim();
  const meta = [
    label && !isRedundantContactLabel(label, typeLabel) ? label : null,
    contactPoint.isPreferred ? "bevorzugt" : null,
    contactPoint.isPrimary ? "primär" : null
  ].filter(Boolean).join(" · ");
  return meta || null;
}

function isRedundantContactLabel(label: string, typeLabel: string): boolean {
  const normalizedLabel = normalizeContactLabel(label);
  const normalizedType = normalizeContactLabel(typeLabel);
  return normalizedLabel === normalizedType || (normalizedLabel === "website" && normalizedType === "webseite");
}

function normalizeContactLabel(value: string): string {
  return value.trim().toLowerCase().replace(/[\s._-]+/g, "");
}

function contactPointUrl(contactPoint: PartyContactPoint): { href: string; displayValue: string } | null {
  const value = contactPoint.value.trim();
  if (!isUrlContactPoint(contactPoint, value)) return null;
  const href = value.match(/^https?:\/\//i) ? value : `https://${value}`;
  try {
    const url = new URL(href);
    if (!url.hostname.includes(".")) return null;
    const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    const displayHost = `www.${hostname}`;
    const displayPath = contactPoint.type === "website" ? "" : url.pathname.replace(/\/+$/, "");
    return {
      href: url.toString(),
      displayValue: `${displayHost}${displayPath && displayPath !== "/" ? displayPath : ""}`
    };
  } catch {
    return null;
  }
}

function isUrlContactPoint(contactPoint: PartyContactPoint, value: string): boolean {
  if (contactPoint.type === "website" || contactPoint.type === "linkedin") return true;
  if (!value || value.includes("@") || /\s/.test(value)) return false;
  return /^https?:\/\//i.test(value) || /^www\./i.test(value) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(?:[/?#].*)?$/i.test(value);
}

function contactPointPhone(contactPoint: PartyContactPoint): { href: string; displayValue: string } | null {
  if (contactPoint.type !== "phone" && contactPoint.type !== "whatsapp" && contactPoint.type !== "signal") return null;
  const displayValue = normalizeGermanPhoneNumber(contactPoint.value);
  const hrefValue = displayValue.replace(/[^\d+]/g, "");
  if (!hrefValue) return null;
  return { href: `tel:${hrefValue}`, displayValue };
}

function normalizeGermanPhoneNumber(value: string): string {
  const trimmed = value.trim();
  const compact = trimmed.replace(/[^\d+]/g, "");
  let national: string | null = null;
  if (compact.startsWith("+49")) {
    national = `0${trimmed.replace(/^\+49[\s-]*/, "")}`;
  } else if (compact.startsWith("0049")) {
    national = `0${trimmed.replace(/^0049[\s-]*/, "")}`;
  } else if (compact.startsWith("49") && compact.length > 5) {
    national = `0${trimmed.replace(/^49[\s-]*/, "")}`;
  }
  return national?.replace(/\s+/g, " ").trim() ?? trimmed;
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
