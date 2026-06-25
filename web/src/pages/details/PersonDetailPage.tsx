import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { Archive, Blocks, Building2, ClipboardList, Forward, Inbox, Mail, Plus, Reply, ReplyAll, Send, Trash2, Users } from "lucide-react";
import { ConfirmModal, DescriptionBlock, EditModal, EmptyState, EntityDetailPage, ErrorState, MetadataGrid, RelationItem, RelationList, SectionBlock } from "../../components/ui/index.js";
import { AddressBlock, ContactPointList } from "../../components/party/index.js";
import type { AddressInput, ContactPointInput } from "../../components/party/index.js";
import { archivePartyGmailMessage, createGmailDraft, fetchGmailMailboxes, fetchPartyGmailMessages, sendGmailDraft, trashPartyGmailMessage } from "../../api.js";
import type { EntityParticipant, GmailAuthStatus, GmailMailboxWithStatus, GmailMessage, Initiative, Organization, Party, PartyRelationshipWithParties, Person, PersonDetail, RelationshipType, Task } from "../../types.js";
import { entityTypeLabel, formatDateTimeForUi, participantRoleSummary, partyRelationshipLabel, personName, salutationLabel } from "./detailUtils.js";

type EmailComposeDraft = {
  to: string;
  subject?: string;
  body?: string;
};

const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const gmailComposeScope = "https://www.googleapis.com/auth/gmail.compose";
const gmailModifyScope = "https://www.googleapis.com/auth/gmail.modify";

export function PersonDetailView(props: {
  detail: PersonDetail | null;
  loadError: string | null;
  initiatives: Initiative[];
  tasks: Task[];
  people: Person[];
  organizations: Organization[];
  relationshipTypes: RelationshipType[];
  coreModalOpen: boolean;
  onCloseCoreModal: () => void;
  onUpdatePerson: (partyId: number, input: {
    firstName?: string | null;
    lastName?: string | null;
    salutation?: Person["salutation"];
    academicTitle?: string | null;
    nameSuffix?: string | null;
    description?: string | null;
  }) => Promise<void>;
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
  onDeleteRelationship: (relationshipId: number) => Promise<void>;
  onOpenInitiative: (initiativeId: number) => void;
  onOpenTask: (taskId: number) => void;
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const person = props.detail?.person;
  const [composeDraft, setComposeDraft] = useState<EmailComposeDraft | null>(null);

  if (props.loadError) {
    return (
      <ErrorState
        title="Person nicht gefunden"
        description="Diese Person existiert nicht oder konnte nicht geladen werden. Gehe zurück zur Personenliste und wähle einen vorhandenen Eintrag."
      />
    );
  }

  if (!props.detail || !person) return <EmptyState title="Person wird geladen" description="Die Detaildaten werden aus DMAX geladen." />;

  const metadataItems = [
    { label: "Erstellt", value: formatDateTimeForUi(person.createdAt) },
    { label: "Aktualisiert", value: formatDateTimeForUi(person.updatedAt) }
  ];

  return (
    <EntityDetailPage className="person-reference-detail">
      {props.coreModalOpen ? (
        <PersonCoreModal
          person={person}
          people={props.people}
          organizations={props.organizations}
          relationshipTypes={props.relationshipTypes}
          relationships={props.detail.relationships}
          onCancel={props.onCloseCoreModal}
          onSave={async (input) => {
            await props.onUpdatePerson(person.id, input);
            props.onCloseCoreModal();
          }}
          onCreateRelationship={props.onCreateRelationship}
          onDeleteRelationship={props.onDeleteRelationship}
        />
      ) : null}
      <div className="person-detail-communication-layout">
        <main className="person-detail-email-main">
          <PartyEmailSection
            partyId={person.id}
            contactEmails={props.detail.contactPoints.filter((contactPoint) => contactPoint.type === "email").map((contactPoint) => contactPoint.value)}
            composeDraft={composeDraft}
            onComposeDraftChange={setComposeDraft}
          />
        </main>
        <aside className="person-detail-sidebar">
          <ContactPointList
            partyId={person.id}
            contactPoints={props.detail.contactPoints}
            title="Kontakt"
            description={null}
            addIconOnly
            emptyDescription="E-Mail, Telefon oder Messenger können ergänzt werden."
            deleteDescription={(contactPoint) => <p>„{contactPoint.value}“ wird aus dieser Person entfernt.</p>}
            onActivateContactPoint={(contactPoint) => setComposeDraft({ to: contactPoint.value })}
            onCreate={props.onCreateContactPoint}
            onUpdate={props.onUpdateContactPoint}
            onDelete={props.onDeleteContactPoint}
          />
          <PersonDescriptionSection
            person={person}
            onUpdatePerson={(input) => props.onUpdatePerson(person.id, input)}
          />
          <AddressBlock
            partyId={person.id}
            addresses={props.detail.addresses}
            description={null}
            emptyMode="none"
            addIconOnly
            deleteDescription={(address) => <p>„{address.line1}“ wird aus dieser Person entfernt.</p>}
            onCreate={props.onCreateAddress}
            onUpdate={props.onUpdateAddress}
            onDelete={props.onDeleteAddress}
          />
          <PersonParticipationsSection
            participants={props.detail.participants}
            initiatives={props.initiatives}
            tasks={props.tasks}
            onOpenInitiative={props.onOpenInitiative}
            onOpenTask={props.onOpenTask}
          />
          <MetadataGrid items={metadataItems} />
        </aside>
      </div>
    </EntityDetailPage>
  );
}

export function PartyEmailSection(props: {
  partyId: number;
  contactEmails: string[];
  composeDraft?: EmailComposeDraft | null;
  onComposeDraftChange?: (draft: EmailComposeDraft | null) => void;
}) {
  const [messages, setMessages] = useState<GmailMessage[]>([]);
  const [mailboxes, setMailboxes] = useState<GmailMailboxWithStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [internalComposeDraft, setInternalComposeDraft] = useState<EmailComposeDraft | null>(null);
  const [expandedMessageIds, setExpandedMessageIds] = useState<Set<number>>(new Set());
  const [busyMessageAction, setBusyMessageAction] = useState<string | null>(null);

  const load = async (sync = false) => {
    setError(null);
    if (sync) setSyncing(true);
    else setLoading(true);
    try {
      const [nextMessages, nextMailboxes] = await Promise.all([
        fetchPartyGmailMessages(props.partyId, { sync }),
        fetchGmailMailboxes()
      ]);
      setMessages(nextMessages);
      setMailboxes(nextMailboxes);
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-Mails konnten nicht geladen werden.");
    } finally {
      setLoading(false);
      setSyncing(false);
    }
  };

  useEffect(() => {
    void load(false).then(() => {
      void load(true);
    });
  }, [props.partyId]);

  const sendableMailboxes = mailboxes.filter((mailbox) => mailbox.enabled && mailbox.sendEnabled && hasGmailScopes(mailbox.authStatus, [gmailReadonlyScope, gmailComposeScope]));
  const primaryRecipient = props.contactEmails[0] ?? "";
  const composeDraft = props.composeDraft !== undefined ? props.composeDraft : internalComposeDraft;
  const setComposeDraft = props.onComposeDraftChange ?? setInternalComposeDraft;
  const mailboxEmails = new Set(mailboxes.flatMap((mailbox) => [mailbox.emailAddress, mailbox.accountLabel]).filter((email): email is string => Boolean(email)).map((email) => email.toLowerCase()));
  const sortedMessages = dedupeGmailMessages(messages).sort((left, right) => Date.parse(right.messageDate) - Date.parse(left.messageDate));
  const mailboxById = new Map(mailboxes.map((mailbox) => [mailbox.id, mailbox]));
  const toggleExpanded = (messageId: number) => {
    setExpandedMessageIds((current) => {
      const next = new Set(current);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  };
  const runMessageAction = async (message: GmailMessage, action: "archive" | "trash") => {
    if (busyMessageAction) return;
    setBusyMessageAction(`${action}:${message.id}`);
    setError(null);
    try {
      if (action === "archive") {
        await archivePartyGmailMessage(props.partyId, message.id);
      } else {
        await trashPartyGmailMessage(props.partyId, message.id);
      }
      const stableKey = gmailMessageStableKey(message);
      setMessages((current) => current.filter((entry) => gmailMessageStableKey(entry) !== stableKey));
      setExpandedMessageIds((current) => {
        const next = new Set(current);
        next.delete(message.id);
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "E-Mail-Aktion konnte nicht ausgeführt werden.");
    } finally {
      setBusyMessageAction(null);
    }
  };

  return (
    <SectionBlock
      title="E-Mails"
      className="party-email-section"
      actions={(
        <>
          <button type="button" className="section-primary-action" disabled={syncing} onClick={() => void load(true)}>
            <Mail size={15} />
            Sync
          </button>
          <button type="button" className="section-primary-action" disabled={!primaryRecipient || sendableMailboxes.length === 0} onClick={() => setComposeDraft({ to: primaryRecipient })}>
            <Send size={15} />
            E-Mail
          </button>
        </>
      )}
    >
      {loading ? <EmptyState title="E-Mails werden geladen" /> : null}
      {error ? <ErrorState title="E-Mails konnten nicht geladen werden" description={error} /> : null}
      {!loading && !error && sortedMessages.length === 0 ? <EmptyState title="Noch keine E-Mails" description="DMAX zeigt direkte E-Mails zwischen diesem Kontakt und verbundenen Gmail-Postfächern." /> : null}
      {!loading && !error && sortedMessages.length > 0 ? (
        <div className="party-email-timeline">
          {sortedMessages.map((message) => {
            const expanded = expandedMessageIds.has(message.id);
            const preview = messagePreview(message);
            const dateLabel = formatEmailTimelineDate(message, sortedMessages);
            const mailbox = mailboxById.get(message.mailboxId);
            const canModify = mailbox ? hasGmailScopes(mailbox.authStatus, [gmailModifyScope]) : false;
            const archiveBusy = busyMessageAction === `archive:${message.id}`;
            const trashBusy = busyMessageAction === `trash:${message.id}`;
            const actionBusy = Boolean(busyMessageAction);
            return (
              <article className={`party-email-item${expanded ? " expanded" : ""}`} key={message.id}>
                <button type="button" className="party-email-summary" onClick={() => toggleExpanded(message.id)} aria-expanded={expanded}>
                  <span className={`party-email-date-cluster ${emailDirectionClass(message.direction)}`}>
                    <span className="party-email-direction-icon" aria-hidden="true">{emailDirectionIcon(message.direction)}</span>
                    <span className="party-email-date-time">{dateLabel}</span>
                    <span className="party-email-direction-label">{emailDirectionLabel(message.direction)}</span>
                  </span>
                  <span className="party-email-subject">{message.subject || "(ohne Betreff)"}</span>
                  <span className="party-email-preview">{preview}</span>
                </button>
                {expanded ? (
                  <div className="party-email-expanded">
                    <div className="party-email-actions" aria-label="E-Mail-Aktionen">
                      <button type="button" className="secondary-action compact party-email-action-button" onClick={() => setComposeDraft(replyDraft(message, mailboxEmails))} disabled={actionBusy}>
                        <Reply size={14} />
                        Antworten
                      </button>
                      <button type="button" className="secondary-action compact party-email-action-button" onClick={() => setComposeDraft(replyAllDraft(message, mailboxEmails))} disabled={actionBusy}>
                        <ReplyAll size={14} />
                        Allen antworten
                      </button>
                      <button type="button" className="secondary-action compact party-email-action-button" onClick={() => setComposeDraft(forwardDraft(message))} disabled={actionBusy}>
                        <Forward size={14} />
                        Weiterleiten
                      </button>
                      <button
                        type="button"
                        className="secondary-action compact party-email-action-button"
                        disabled={!canModify || actionBusy}
                        title={canModify ? "Aus dieser Ansicht archivieren" : "Gmail-Postfach muss mit Scope gmail.modify neu verbunden werden"}
                        onClick={() => void runMessageAction(message, "archive")}
                      >
                        <Archive size={14} />
                        {archiveBusy ? "Archiviert..." : "Archivieren"}
                      </button>
                      <button
                        type="button"
                        className="secondary-action compact party-email-action-button"
                        disabled={!canModify || actionBusy}
                        title={canModify ? "In den Gmail-Papierkorb verschieben" : "Gmail-Postfach muss mit Scope gmail.modify neu verbunden werden"}
                        onClick={() => void runMessageAction(message, "trash")}
                      >
                        <Trash2 size={14} />
                        {trashBusy ? "Gelöscht..." : "Löschen"}
                      </button>
                    </div>
                    <div className="party-email-meta">
                      <span>Von: {formatGmailAddresses(message.from)}</span>
                      <span>An: {formatGmailAddresses(message.to)}</span>
                      {message.cc.length > 0 ? <span>Cc: {formatGmailAddresses(message.cc)}</span> : null}
                    </div>
                    <p>{message.plainBody || message.snippet || ""}</p>
                    {message.attachments.length > 0 ? <span className="muted-inline">{message.attachments.length} Anhänge</span> : null}
                    {message.partyLinks.length > 1 ? (
                      <span className="muted-inline">Mehrfach zugeordnet: {message.partyLinks.map((link) => link.partyDisplayName).join(", ")}</span>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}
      {composeDraft ? (
        <GmailComposeModal
          draft={composeDraft}
          mailboxes={sendableMailboxes}
          onCancel={() => setComposeDraft(null)}
          onSent={async () => {
            setComposeDraft(null);
            await load(true);
          }}
        />
      ) : null}
    </SectionBlock>
  );
}

function GmailComposeModal(props: {
  draft: EmailComposeDraft;
  mailboxes: GmailMailboxWithStatus[];
  onCancel: () => void;
  onSent: () => Promise<void>;
}) {
  const [mailboxId, setMailboxId] = useState(String(props.mailboxes[0]?.id ?? ""));
  const [to, setTo] = useState(props.draft.to);
  const [subject, setSubject] = useState(props.draft.subject ?? "");
  const [body, setBody] = useState(props.draft.body ?? "");
  const [draft, setDraft] = useState<{ id: string; mailboxId: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canDraft = Boolean(Number(mailboxId) && to.trim() && subject.trim() && body.trim());

  useEffect(() => {
    setTo(props.draft.to);
    setSubject(props.draft.subject ?? "");
    setBody(props.draft.body ?? "");
    setDraft(null);
    setError(null);
  }, [props.draft]);

  useEffect(() => {
    if (!mailboxId && props.mailboxes[0]) {
      setMailboxId(String(props.mailboxes[0].id));
    }
  }, [mailboxId, props.mailboxes]);

  return (
    <>
      <EditModal
        title="E-Mail schreiben"
        label="E-Mail schreiben"
        onCancel={props.onCancel}
        onSubmit={async (event) => {
          event.preventDefault();
          if (!canDraft || saving) return;
          setSaving(true);
          setError(null);
          try {
            const nextDraft = await createGmailDraft({
              mailboxId: Number(mailboxId),
              to: splitEmails(to),
              subject,
              body
            });
            setDraft({ id: nextDraft.id, mailboxId: Number(mailboxId) });
          } catch (err) {
            setError(err instanceof Error ? err.message : "Gmail-Draft konnte nicht erstellt werden.");
          } finally {
            setSaving(false);
          }
        }}
        footer={(
          <>
            <button type="submit" className="primary-button" disabled={!canDraft || saving}>Draft erstellen</button>
            <button type="button" className="small-button" onClick={props.onCancel} disabled={saving}>Abbrechen</button>
          </>
        )}
      >
        {props.mailboxes.length === 0 ? <ErrorState title="Kein sendefähiges Postfach" description="Aktiviere in der Config ein verbundenes Gmail-Postfach für den Versand." /> : null}
        <label>
          Absenderpostfach
          <select value={mailboxId} onChange={(event) => setMailboxId(event.target.value)}>
            {props.mailboxes.map((mailbox) => <option key={mailbox.id} value={mailbox.id}>{mailbox.displayName}</option>)}
          </select>
        </label>
        <label>
          Empfänger
          <input value={to} onChange={(event) => setTo(event.target.value)} />
        </label>
        <label>
          Betreff
          <input value={subject} onChange={(event) => setSubject(event.target.value)} />
        </label>
        <label>
          Nachricht
          <textarea rows={10} value={body} onChange={(event) => setBody(event.target.value)} />
        </label>
        {error ? <p className="inline-error">{error}</p> : null}
      </EditModal>
      {draft ? (
        <ConfirmModal
          title="Draft senden?"
          description="DMAX sendet diesen Gmail-Draft erst nach dieser Bestätigung."
          confirmLabel="Jetzt senden"
          cancelLabel="Nicht senden"
          busy={saving}
          onCancel={() => setDraft(null)}
          onConfirm={async () => {
            setSaving(true);
            setError(null);
            try {
              await sendGmailDraft({ mailboxId: draft.mailboxId, draftId: draft.id, confirmed: true });
              await props.onSent();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Gmail-Draft konnte nicht gesendet werden.");
              setDraft(null);
            } finally {
              setSaving(false);
            }
          }}
        />
      ) : null}
    </>
  );
}

function PersonDescriptionSection(props: {
  person: Person;
  onUpdatePerson: (input: { description: string | null }) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(props.person.description ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setDescription(props.person.description ?? "");
    setEditing(false);
    setSaving(false);
    setError(null);
  }, [props.person.id, props.person.description]);

  return (
    <>
      <DescriptionBlock
        title="Beschreibung"
        text={props.person.description}
        emptyTitle="-"
        onEdit={() => setEditing(true)}
      />
      {editing ? (
        <EditModal
          title="Beschreibung"
          label="Personenbeschreibung bearbeiten"
          className="markdown-modal"
          onCancel={() => setEditing(false)}
          onSubmit={async (event) => {
            event.preventDefault();
            if (saving) return;
            setSaving(true);
            setError(null);
            try {
              await props.onUpdatePerson({ description: description.trim() || null });
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
            value={description}
            rows={12}
            disabled={saving}
            onChange={(event) => setDescription(event.target.value)}
          />
          {error ? <p className="inline-error">{error}</p> : null}
        </EditModal>
      ) : null}
    </>
  );
}

function splitEmails(value: string): string[] {
  return value.split(",").map((email) => email.trim()).filter(Boolean);
}

function hasGmailScopes(authStatus: GmailAuthStatus, scopes: string[]): boolean {
  const grantedScopes = new Set(authStatus.tokenScope?.split(/\s+/).filter(Boolean) ?? []);
  return authStatus.connected && scopes.every((scope) => grantedScopes.has(scope));
}

function dedupeGmailMessages(messages: GmailMessage[]): GmailMessage[] {
  const seen = new Set<string>();
  const deduped: GmailMessage[] = [];
  for (const message of messages) {
    const key = gmailMessageStableKey(message);
    if (seen.has(key)) continue;
    seen.add(key);
    deduped.push(message);
  }
  return deduped;
}

function gmailMessageStableKey(message: GmailMessage): string {
  return `${message.mailboxId}:${message.gmailMessageId || message.id}`;
}

function formatEmailTimelineDate(message: GmailMessage, messages: GmailMessage[]): string {
  const date = new Date(message.messageDate);
  if (Number.isNaN(date.getTime())) return message.messageDate;
  const minuteKey = message.messageDate.slice(0, 16);
  const hasSameMinuteNeighbor = messages.some((entry) => entry.id !== message.id && entry.messageDate.slice(0, 16) === minuteKey);
  if (!hasSameMinuteNeighbor) return formatDateTimeForUi(message.messageDate);
  return date.toLocaleString("de-DE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
}

function messagePreview(message: GmailMessage): string {
  const text = stripQuotedEmailHistory(message.plainBody || message.snippet || "").replace(/\s+/g, " ").trim();
  return text.length > 180 ? `${text.slice(0, 177)}...` : text;
}

function stripQuotedEmailHistory(value: string): string {
  const normalized = value.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();
  if (!normalized) return "";
  const quotePatterns = [
    /\n\s*Am\s+.+?\s+schrieb\s+.+?:/is,
    /\n\s*Am\s+.+?\s+um\s+.+?\s+schrieb\s+.+?:/is,
    /\n\s*On\s+.+?\s+wrote:/is,
    /\n\s*.+?\s+wrote:/is,
    /\n\s*<[^>\n]+>\s+schrieb\s+am\s+.+?:/is,
    /\n\s*-{2,}\s*(Weitergeleitete Nachricht|Forwarded message)\s*-{2,}/is,
    /\n\s*Von:\s+.+\n\s*(Datum|Gesendet):/is,
    /\n\s*>/
  ];
  const cutIndex = quotePatterns.reduce((earliest, pattern) => {
    const match = pattern.exec(normalized);
    if (!match || match.index < 0) return earliest;
    return Math.min(earliest, match.index);
  }, normalized.length);
  const ownContent = normalized.slice(0, cutIndex)
    .split("\n")
    .filter((line) => !line.trim().startsWith(">"))
    .join("\n")
    .trim();
  return ownContent || normalized;
}

function formatGmailAddresses(addresses: Array<{ name: string | null; email: string }>): string {
  return addresses.map((address) => address.name ? `${address.name} <${address.email}>` : address.email).join(", ") || "-";
}

function replyDraft(message: GmailMessage, mailboxEmails: Set<string>): EmailComposeDraft {
  const senderRecipients = nonMailboxAddresses(message.from, mailboxEmails);
  const fallbackRecipients = nonMailboxAddresses([...message.to, ...message.cc], mailboxEmails);
  return {
    to: (senderRecipients.length > 0 ? senderRecipients : fallbackRecipients).join(", "),
    subject: replySubject(message.subject),
    body: quotedReplyBody(message)
  };
}

function replyAllDraft(message: GmailMessage, mailboxEmails: Set<string>): EmailComposeDraft {
  const recipients = dedupeEmails([
    ...nonMailboxAddresses(message.from, mailboxEmails),
    ...nonMailboxAddresses(message.to, mailboxEmails),
    ...nonMailboxAddresses(message.cc, mailboxEmails)
  ]);
  return {
    to: recipients.join(", "),
    subject: replySubject(message.subject),
    body: quotedReplyBody(message)
  };
}

function forwardDraft(message: GmailMessage): EmailComposeDraft {
  return {
    to: "",
    subject: forwardSubject(message.subject),
    body: [
      "",
      "",
      "---------- Weitergeleitete Nachricht ---------",
      `Von: ${formatGmailAddresses(message.from)}`,
      `Datum: ${formatDateTimeForUi(message.messageDate)}`,
      `Betreff: ${message.subject || "(ohne Betreff)"}`,
      `An: ${formatGmailAddresses(message.to)}`,
      "",
      message.plainBody || message.snippet || ""
    ].join("\n")
  };
}

function quotedReplyBody(message: GmailMessage): string {
  const original = (message.plainBody || message.snippet || "")
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
  return ["", "", `Am ${formatDateTimeForUi(message.messageDate)} schrieb ${formatGmailAddresses(message.from)}:`, original].join("\n");
}

function replySubject(subject: string | null): string {
  const value = subject?.trim() || "(ohne Betreff)";
  return /^re:/i.test(value) ? value : `Re: ${value}`;
}

function forwardSubject(subject: string | null): string {
  const value = subject?.trim() || "(ohne Betreff)";
  return /^fwd?:/i.test(value) ? value : `Fwd: ${value}`;
}

function nonMailboxAddresses(addresses: Array<{ email: string }>, mailboxEmails: Set<string>): string[] {
  return addresses.map((address) => address.email.toLowerCase()).filter((email) => email && !mailboxEmails.has(email));
}

function dedupeEmails(emails: string[]): string[] {
  return [...new Set(emails)];
}

function emailDirectionLabel(direction: GmailMessage["direction"]): string {
  if (direction === "inbound") return "Empfangen";
  if (direction === "outbound") return "Gesendet";
  if (direction === "internal") return "Intern";
  return "Unbekannt";
}

function emailDirectionClass(direction: GmailMessage["direction"]): string {
  if (direction === "inbound") return "inbound";
  if (direction === "outbound") return "outbound";
  if (direction === "internal") return "internal";
  return "unknown";
}

function emailDirectionIcon(direction: GmailMessage["direction"]): ReactNode {
  if (direction === "inbound") return <Inbox size={17} strokeWidth={2.2} />;
  if (direction === "outbound") return <Send size={17} strokeWidth={2.2} />;
  return <Mail size={17} strokeWidth={2.2} />;
}

function PersonCoreModal(props: {
  person: Person;
  people: Person[];
  organizations: Organization[];
  relationshipTypes: RelationshipType[];
  relationships: PersonDetail["relationships"];
  onCancel: () => void;
  onSave: (input: {
    firstName: string | null;
    lastName: string | null;
    salutation: Person["salutation"];
    academicTitle: string | null;
    nameSuffix: string | null;
  }) => Promise<void>;
  onCreateRelationship: (input: {
    fromPartyId: number;
    toPartyId: number;
    relationshipTypeId: number;
    roleLabel?: string | null;
    status?: "active" | "inactive";
  }) => Promise<void>;
  onDeleteRelationship: (relationshipId: number) => Promise<void>;
}) {
  const [firstName, setFirstName] = useState(props.person.firstName ?? "");
  const [lastName, setLastName] = useState(props.person.lastName ?? "");
  const [salutation, setSalutation] = useState<Person["salutation"]>(props.person.salutation);
  const [academicTitle, setAcademicTitle] = useState(props.person.academicTitle ?? "");
  const [nameSuffix, setNameSuffix] = useState(props.person.nameSuffix ?? "");
  const [organizationId, setOrganizationId] = useState("");
  const [organizationRelationshipTypeId, setOrganizationRelationshipTypeId] = useState("");
  const [organizationDirection, setOrganizationDirection] = useState<"outgoing" | "incoming">("outgoing");
  const [organizationRoleLabel, setOrganizationRoleLabel] = useState("");
  const [personId, setPersonId] = useState("");
  const [personRelationshipTypeId, setPersonRelationshipTypeId] = useState("");
  const [personDirection, setPersonDirection] = useState<"outgoing" | "incoming">("outgoing");
  const [personRoleLabel, setPersonRoleLabel] = useState("");
  const [saving, setSaving] = useState(false);
  const [relationshipBusy, setRelationshipBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [relationshipError, setRelationshipError] = useState<string | null>(null);
  const canSave = Boolean(firstName.trim() || lastName.trim());
  const organizationRelationships = props.relationships.filter((relationship) => relationshipOtherParty(relationship, props.person.id).type === "organization");
  const personRelationships = props.relationships.filter((relationship) => relationshipOtherParty(relationship, props.person.id).type === "person");
  const existingOrganizationIds = new Set(organizationRelationships.map((relationship) => relationshipOtherParty(relationship, props.person.id).id));
  const existingPersonIds = new Set(personRelationships.map((relationship) => relationshipOtherParty(relationship, props.person.id).id));
  const availableOrganizations = props.organizations.filter((organization) => !existingOrganizationIds.has(organization.id));
  const availablePeople = props.people.filter((person) => person.id !== props.person.id && !existingPersonIds.has(person.id));
  const defaultOrganizationRelationshipType =
    props.relationshipTypes.find((type) => type.key === "works_for")
    ?? props.relationshipTypes.find((type) => type.key === "member_of")
    ?? props.relationshipTypes[0];
  const selectedOrganizationRelationshipTypeId = organizationRelationshipTypeId || (defaultOrganizationRelationshipType ? String(defaultOrganizationRelationshipType.id) : "");
  const selectedOrganizationRelationshipType = props.relationshipTypes.find((type) => type.id === Number(selectedOrganizationRelationshipTypeId)) ?? null;
  const defaultPersonRelationshipType =
    props.relationshipTypes.find((type) => type.key === "knows")
    ?? props.relationshipTypes.find((type) => type.key === "family_related_to")
    ?? props.relationshipTypes[0];
  const selectedPersonRelationshipTypeId = personRelationshipTypeId || (defaultPersonRelationshipType ? String(defaultPersonRelationshipType.id) : "");
  const selectedPersonRelationshipType = props.relationshipTypes.find((type) => type.id === Number(selectedPersonRelationshipTypeId)) ?? null;
  const createOrganizationRelationship = async () => {
    const nextOrganizationId = Number(organizationId);
    const nextTypeId = Number(selectedOrganizationRelationshipTypeId);
    if (!nextOrganizationId || !nextTypeId || relationshipBusy) return;
    setRelationshipBusy(true);
    setRelationshipError(null);
    try {
      await props.onCreateRelationship({
        fromPartyId: organizationDirection === "incoming" ? nextOrganizationId : props.person.id,
        toPartyId: organizationDirection === "incoming" ? props.person.id : nextOrganizationId,
        relationshipTypeId: nextTypeId,
        roleLabel: organizationRoleLabel.trim() || null,
        status: "active"
      });
      setOrganizationId("");
      setOrganizationRoleLabel("");
    } catch (err) {
      setRelationshipError(err instanceof Error ? err.message : "Organisationsbeziehung konnte nicht hinzugefügt werden.");
    } finally {
      setRelationshipBusy(false);
    }
  };
  const createPersonRelationship = async () => {
    const nextPersonId = Number(personId);
    const nextTypeId = Number(selectedPersonRelationshipTypeId);
    if (!nextPersonId || !nextTypeId || relationshipBusy) return;
    setRelationshipBusy(true);
    setRelationshipError(null);
    try {
      await props.onCreateRelationship({
        fromPartyId: personDirection === "incoming" ? nextPersonId : props.person.id,
        toPartyId: personDirection === "incoming" ? props.person.id : nextPersonId,
        relationshipTypeId: nextTypeId,
        roleLabel: personRoleLabel.trim() || null,
        status: "active"
      });
      setPersonId("");
      setPersonRoleLabel("");
    } catch (err) {
      setRelationshipError(err instanceof Error ? err.message : "Personenbeziehung konnte nicht hinzugefügt werden.");
    } finally {
      setRelationshipBusy(false);
    }
  };
  const deleteRelationship = async (relationshipId: number) => {
    if (relationshipBusy) return;
    setRelationshipBusy(true);
    setRelationshipError(null);
    try {
      await props.onDeleteRelationship(relationshipId);
    } catch (err) {
      setRelationshipError(err instanceof Error ? err.message : "Beziehung konnte nicht entfernt werden.");
    } finally {
      setRelationshipBusy(false);
    }
  };

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
      <div className="modal-two-column">
        <label>
          Vorname
          <input autoFocus value={firstName} onChange={(event) => setFirstName(event.target.value)} />
        </label>
        <label>
          Nachname
          <input value={lastName} onChange={(event) => setLastName(event.target.value)} />
        </label>
      </div>
      <div className="modal-two-column">
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
      </div>
      <label>
        Zusatz
        <input value={nameSuffix} onChange={(event) => setNameSuffix(event.target.value)} />
      </label>
      {error ? <p className="inline-error">{error}</p> : null}
      <div className="party-modal-relationship-manager">
        <section className="party-modal-relationship-group">
          <h3>Organisationsverknüpfungen</h3>
          <RelationList emptyMode="inline" emptyTitle="Keine Organisationsverknüpfungen.">
            {organizationRelationships.map((relationship) => {
              const organization = relationshipOtherParty(relationship, props.person.id);
              return (
                <RelationItem
                  key={relationship.id}
                  icon={<Building2 size={16} />}
                  title={organization.displayName}
                  meta={partyRelationshipLabel(relationship, props.person.id)}
                  actions={(
                    <button type="button" className="icon-button compact" title="Verknüpfung entfernen" disabled={relationshipBusy} onClick={() => void deleteRelationship(relationship.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                />
              );
            })}
          </RelationList>
          <div className="party-modal-relationship-create">
            <select value={organizationId} onChange={(event) => setOrganizationId(event.target.value)} disabled={relationshipBusy || availableOrganizations.length === 0}>
              <option value="">Organisation auswählen</option>
              {availableOrganizations.map((organization) => (
                <option key={organization.id} value={organization.id}>{organization.displayName}</option>
              ))}
            </select>
            <select value={selectedOrganizationRelationshipTypeId} onChange={(event) => setOrganizationRelationshipTypeId(event.target.value)} disabled={relationshipBusy || props.relationshipTypes.length === 0}>
              {props.relationshipTypes.map((type) => (
                <option key={type.id} value={type.id}>{connectorLabel(type.label)}</option>
              ))}
            </select>
            <select
              value={organizationDirection}
              onChange={(event) => setOrganizationDirection(event.target.value as "outgoing" | "incoming")}
              disabled={relationshipBusy || !selectedOrganizationRelationshipType || selectedOrganizationRelationshipType.directionality === "symmetric"}
              aria-label="Richtung der Organisationsverknüpfung"
            >
              <option value="outgoing">{selectedOrganizationRelationshipType ? connectorLabel(selectedOrganizationRelationshipType.label) : "Ausgehend"}</option>
              <option value="incoming">{selectedOrganizationRelationshipType ? connectorLabel(selectedOrganizationRelationshipType.inverseLabel ?? selectedOrganizationRelationshipType.label) : "Eingehend"}</option>
            </select>
            <input value={organizationRoleLabel} onChange={(event) => setOrganizationRoleLabel(event.target.value)} placeholder="Rolle / Kontext" disabled={relationshipBusy} />
            <button type="button" className="section-primary-action" disabled={!organizationId || !selectedOrganizationRelationshipTypeId || relationshipBusy} onClick={() => void createOrganizationRelationship()}>
              <Plus size={15} />
              Hinzufügen
            </button>
          </div>
        </section>
        <section className="party-modal-relationship-group">
          <h3>Personenverknüpfungen</h3>
          <RelationList emptyMode="inline" emptyTitle="Keine Personenverknüpfungen.">
            {personRelationships.map((relationship) => {
              const otherPerson = relationshipOtherParty(relationship, props.person.id);
              return (
                <RelationItem
                  key={relationship.id}
                  icon={<Users size={16} />}
                  title={otherPerson.displayName}
                  meta={partyRelationshipLabel(relationship, props.person.id)}
                  actions={(
                    <button type="button" className="icon-button compact" title="Verknüpfung entfernen" disabled={relationshipBusy} onClick={() => void deleteRelationship(relationship.id)}>
                      <Trash2 size={14} />
                    </button>
                  )}
                />
              );
            })}
          </RelationList>
          <div className="party-modal-relationship-create">
            <select value={personId} onChange={(event) => setPersonId(event.target.value)} disabled={relationshipBusy || availablePeople.length === 0}>
              <option value="">Person auswählen</option>
              {availablePeople.map((person) => (
                <option key={person.id} value={person.id}>{personName(person)}</option>
              ))}
            </select>
            <select value={selectedPersonRelationshipTypeId} onChange={(event) => setPersonRelationshipTypeId(event.target.value)} disabled={relationshipBusy || props.relationshipTypes.length === 0}>
              {props.relationshipTypes.map((type) => (
                <option key={type.id} value={type.id}>{connectorLabel(type.label)}</option>
              ))}
            </select>
            <select
              value={personDirection}
              onChange={(event) => setPersonDirection(event.target.value as "outgoing" | "incoming")}
              disabled={relationshipBusy || !selectedPersonRelationshipType || selectedPersonRelationshipType.directionality === "symmetric"}
              aria-label="Richtung der Personenverknüpfung"
            >
              <option value="outgoing">{selectedPersonRelationshipType ? connectorLabel(selectedPersonRelationshipType.label) : "Ausgehend"}</option>
              <option value="incoming">{selectedPersonRelationshipType ? connectorLabel(selectedPersonRelationshipType.inverseLabel ?? selectedPersonRelationshipType.label) : "Eingehend"}</option>
            </select>
            <input value={personRoleLabel} onChange={(event) => setPersonRoleLabel(event.target.value)} placeholder="Rolle / Kontext" disabled={relationshipBusy} />
            <button type="button" className="section-primary-action" disabled={!personId || !selectedPersonRelationshipTypeId || relationshipBusy} onClick={() => void createPersonRelationship()}>
              <Plus size={15} />
              Hinzufügen
            </button>
          </div>
        </section>
        {relationshipError ? <p className="inline-error">{relationshipError}</p> : null}
      </div>
    </EditModal>
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
    <SectionBlock title="DMAX-Kontexte">
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
  return [
    person.academicTitle,
    person.nameSuffix
  ]
    .filter(Boolean)
    .join(" · ") || "Person";
}

export function personDisplayTitle(person: Person): string {
  const salutation = person.salutation !== "unknown" ? salutationLabel(person.salutation) : null;
  const name = personName(person) || "Person";
  if (!salutation || name.toLowerCase().startsWith(`${salutation.toLowerCase()} `)) {
    return name;
  }
  return `${salutation} ${name}`;
}

export function PersonHeaderRelations(props: {
  person: Person;
  relationships: PersonDetail["relationships"];
  onOpenPerson: (partyId: number) => void;
  onOpenOrganization: (partyId: number) => void;
}) {
  const organizationRelationships = props.relationships.filter((relationship) => relationshipOtherParty(relationship, props.person.id).type === "organization");
  const personRelationships = props.relationships.filter((relationship) => relationshipOtherParty(relationship, props.person.id).type === "person");
  const rows: ReactNode[] = [
    ...organizationRelationships.map((relationship) => {
      const organization = relationshipOtherParty(relationship, props.person.id);
      return (
        <HeaderRelationLine
          key={relationship.id}
          label={relationshipConnector(relationship, props.person.id)}
          name={organization.displayName}
          onOpen={() => props.onOpenOrganization(organization.id)}
        />
      );
    }),
    ...personRelationships.map((relationship) => {
      const otherPerson = relationshipOtherParty(relationship, props.person.id);
      return (
        <HeaderRelationLine
          key={relationship.id}
          label={relationshipConnector(relationship, props.person.id)}
          name={otherPerson.displayName}
          onOpen={() => props.onOpenPerson(otherPerson.id)}
        />
      );
    })
  ];

  if (rows.length === 0) return null;
  return <div className="person-header-relations">{rows}</div>;
}

function HeaderRelationLine(props: { label: string; name: string; onOpen: () => void }) {
  return (
    <span className="person-header-relation-line">
      <span>{connectorLabel(props.label)}</span>
      <button type="button" className="person-header-relation-link" onClick={props.onOpen}>
        {props.name}
      </button>
    </span>
  );
}

function relationshipOtherParty(relationship: PartyRelationshipWithParties, perspectivePartyId: number): Party {
  return relationship.fromPartyId === perspectivePartyId ? relationship.toParty : relationship.fromParty;
}

function relationshipConnector(relationship: PartyRelationshipWithParties, perspectivePartyId: number): string {
  if (relationship.relationshipType.directionality === "symmetric") return relationship.relationshipType.label;
  return relationship.fromPartyId === perspectivePartyId
    ? relationship.relationshipType.label
    : relationship.relationshipType.inverseLabel ?? relationship.relationshipType.label;
}

function connectorLabel(label: string): string {
  return label ? `${label.charAt(0).toUpperCase()}${label.slice(1)}` : label;
}
