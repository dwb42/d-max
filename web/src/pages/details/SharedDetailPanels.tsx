import { useEffect, useRef, useState } from "react";
import type { ClipboardEvent, DragEvent, FormEvent, ReactNode } from "react";
import { Building2, CalendarDays, CheckCircle2, Circle, ClipboardPaste, ExternalLink, FileText, Image, Mic2, Paperclip, Pencil, Plus, RefreshCw, Trash2, Upload, Users, X } from "lucide-react";
import { ConfirmModal, EditModal, RelationItem, RelationList, SectionBlock } from "../../components/ui/index.js";
import { reanalyzeMediaAsset, updateMediaAssetAnalysis } from "../../api.js";
import type { EntityParticipant, Initiative, MediaAttachment, MediaAsset, MediaEntityType, Organization, ParticipantRoleType, Person, Task } from "../../types.js";
import { displayInitiativeName, documentExtension, dropAfter, entityTypeLabel, formatBytes, formatMediaTimestamp, formatTaskDueDate, moveIdToDropPosition, nullableText, participantRoleSummary, personName, sortTasksByCompletionAndRank } from "./detailUtils.js";

export { MediaAttachmentsPanel, ParticipantsPanel, TaskCreateInlineForm, TasksView };

function Panel(props: { title: string; children: ReactNode }) {
  return (
    <section className="panel">
      <h2>{props.title}</h2>
      {props.children}
    </section>
  );
}

function participantContactDetail(participant: EntityParticipant): string | null {
  const primaryEmail = participant.contactPoints?.find((contactPoint) => contactPoint.type === "email") ?? null;
  const worksFor = participant.party.type === "person"
    ? participant.relationships?.find(
        (relationship) =>
          relationship.relationshipType.key === "works_for"
          && relationship.status === "active"
          && relationship.fromPartyId === participant.partyId
          && relationship.toParty.type === "organization"
      ) ?? null
    : null;
  const parts = [
    primaryEmail?.value,
    worksFor ? `bei ${worksFor.toParty.displayName}` : null
  ].filter((part): part is string => Boolean(part));
  return parts.length > 0 ? parts.join(" · ") : null;
}

function ParticipantsPanel(props: {
  entityType: "initiative" | "task";
  entityId: number;
  participants: EntityParticipant[];
  people: Person[];
  organizations: Organization[];
  roleTypes: ParticipantRoleType[];
  surface?: "panel" | "section";
  createMode?: "inline" | "modal";
  onCreateParticipant: (input: {
    partyId: number;
    entityType: "initiative" | "task";
    entityId: number;
    roleTypeId?: number | null;
    roleLabel?: string | null;
    isPrimary?: boolean;
  }) => Promise<void>;
  onDeleteParticipant: (participantId: number) => Promise<void>;
  onOpenPerson?: (partyId: number) => void;
  onOpenOrganization?: (partyId: number) => void;
}) {
  const parties = [
    ...props.people.map((person) => ({ id: person.id, type: "person" as const, displayName: personName(person) })),
    ...props.organizations.map((organization) => ({ id: organization.id, type: "organization" as const, displayName: organization.displayName }))
  ].sort((left, right) => left.displayName.localeCompare(right.displayName));
  const roleTypes = props.roleTypes.filter((roleType) => !roleType.appliesToEntityType || roleType.appliesToEntityType === props.entityType);
  const [partyId, setPartyId] = useState("");
  const [roleTypeId, setRoleTypeId] = useState("");
  const [roleLabel, setRoleLabel] = useState("");
  const [isPrimary, setIsPrimary] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const createMode = props.createMode ?? "inline";
  const resetCreateDraft = () => {
    setPartyId("");
    setRoleTypeId("");
    setRoleLabel("");
    setIsPrimary(false);
  };
  const submitParticipant = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const parsedPartyId = Number(partyId);
    if (!parsedPartyId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onCreateParticipant({
        partyId: parsedPartyId,
        entityType: props.entityType,
        entityId: props.entityId,
        roleTypeId: roleTypeId ? Number(roleTypeId) : null,
        roleLabel: roleLabel.trim() || null,
        isPrimary
      });
      resetCreateDraft();
      setIsCreateModalOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Beteiligung konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };
  const participantFields = (
    <>
      <select value={partyId} onChange={(event) => setPartyId(event.target.value)} aria-label="Person oder Organisation">
        <option value="">Person oder Organisation</option>
        {parties.map((party) => (
          <option key={party.id} value={party.id}>{party.displayName}</option>
        ))}
      </select>
      <select value={roleTypeId} onChange={(event) => setRoleTypeId(event.target.value)} aria-label="Rolle">
        <option value="">Rolle</option>
        {roleTypes.map((roleType) => (
          <option key={roleType.id} value={roleType.id}>{roleType.label}</option>
        ))}
      </select>
      <input value={roleLabel} onChange={(event) => setRoleLabel(event.target.value)} placeholder="Freie Rolle" aria-label="Freie Rolle" />
      <label className="inline-checkbox">
        <input type="checkbox" checked={isPrimary} onChange={(event) => setIsPrimary(event.target.checked)} />
        Primär
      </label>
    </>
  );
  const relationList = props.surface === "section" ? (
    <RelationList emptyMode={createMode === "modal" ? "none" : "inline"} emptyTitle="Noch keine Beteiligten.">
      {props.participants.map((participant) => {
        const detail = participantContactDetail(participant);
        const openParticipant =
          participant.party.type === "person"
            ? props.onOpenPerson
            : props.onOpenOrganization;
        return (
          <RelationItem
            key={participant.id}
            icon={participant.party.type === "person" ? <Users size={16} /> : <Building2 size={16} />}
            title={participant.party.displayName}
            meta={participantRoleSummary(participant)}
            detail={detail}
            onOpen={openParticipant ? () => openParticipant(participant.partyId) : undefined}
            actions={(
              <button
                type="button"
                className="icon-button compact"
                disabled={busy}
                title="Beteiligung entfernen"
                onClick={async () => {
                  if (busy) return;
                  setBusy(true);
                  setError(null);
                  try {
                    await props.onDeleteParticipant(participant.id);
                  } catch (err) {
                    setError(err instanceof Error ? err.message : "Beteiligung konnte nicht entfernt werden.");
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                <Trash2 size={14} />
              </button>
            )}
          />
        );
      })}
    </RelationList>
  ) : (
    <div className="relationship-list">
      {props.participants.length === 0 ? <p className="muted-text">Noch keine Beteiligten.</p> : null}
      {props.participants.map((participant) => {
        const detail = participantContactDetail(participant);
        return (
          <div className="relationship-row" key={participant.id}>
            <div className="entity-icon">{participant.party.type === "person" ? <Users size={16} /> : <Building2 size={16} />}</div>
            <div>
              <strong>{participant.party.displayName}</strong>
              <p>{participantRoleSummary(participant)}</p>
              {detail ? <p>{detail}</p> : null}
            </div>
            <button
              type="button"
              className="icon-button compact"
              disabled={busy}
              title="Beteiligung entfernen"
              onClick={async () => {
                if (busy) return;
                setBusy(true);
                setError(null);
                try {
                  await props.onDeleteParticipant(participant.id);
                } catch (err) {
                  setError(err instanceof Error ? err.message : "Beteiligung konnte nicht entfernt werden.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <Trash2 size={14} />
            </button>
          </div>
        );
      })}
    </div>
  );
  const content = (
    <>
      {relationList}
      {createMode === "inline" ? (
        <form className="contact-point-create-form participant-create-form" onSubmit={submitParticipant}>
          {participantFields}
          <button type="submit" className={props.surface === "section" ? "section-primary-action" : "primary-button"} disabled={!partyId || busy}>
            <Plus size={15} />
            Verknüpfen
          </button>
        </form>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {isCreateModalOpen ? (
        <EditModal
          title="Beteiligte hinzufügen"
          label="Beteiligte hinzufügen"
          onCancel={() => {
            resetCreateDraft();
            setError(null);
            setIsCreateModalOpen(false);
          }}
          onSubmit={submitParticipant}
          footer={(
            <>
              <button className="primary-action compact" type="submit" disabled={!partyId || busy}>
                Verknüpfen
              </button>
              <button
                type="button"
                className="small-button"
                disabled={busy}
                onClick={() => {
                  resetCreateDraft();
                  setError(null);
                  setIsCreateModalOpen(false);
                }}
              >
                Abbrechen
              </button>
            </>
          )}
        >
          <div className="participant-modal-fields">
            {participantFields}
          </div>
          {error ? <p className="inline-error">{error}</p> : null}
        </EditModal>
      ) : null}
    </>
  );

  if (props.surface === "section") {
    return (
      <SectionBlock
        title="Beteiligte"
        actions={createMode === "modal" ? (
          <button type="button" className="section-primary-action" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={15} />
            Beteiligte hinzufügen
          </button>
        ) : null}
      >
        {content}
      </SectionBlock>
    );
  }

  return (
    <Panel title="Beteiligte">
      {content}
    </Panel>
  );
}

function MediaAttachmentsPanel(props: {
  entityType: Extract<MediaEntityType, "initiative" | "task">;
  entityId: number;
  attachments: MediaAttachment[];
  surface?: "panel" | "section";
  onUpload: (entityId: number, file: File) => Promise<void>;
  onUpdate: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDelete: (linkId: number) => Promise<void>;
  onReorder: (entityId: number, linkIds: number[]) => Promise<void>;
}) {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draggedLinkId, setDraggedLinkId] = useState<number | null>(null);
  const [dropLinkId, setDropLinkId] = useState<number | null>(null);
  const [modalMedia, setModalMedia] = useState<MediaAttachment | null>(null);
  const linkIds = props.attachments.map((attachment) => attachment.id);

  useEffect(() => {
    setBusy(false);
    setError(null);
    setDragActive(false);
    setDraggedLinkId(null);
    setDropLinkId(null);
    setModalMedia(null);
  }, [props.entityType, props.entityId]);

  useEffect(() => {
    setModalMedia((current) => {
      if (!current) return current;
      return props.attachments.find((attachment) => attachment.id === current.id) ?? current;
    });
  }, [props.attachments]);

  const uploadFiles = async (files: FileList | File[]) => {
    const selected = Array.from(files);
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const file of selected) {
        await props.onUpload(props.entityId, file);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload fehlgeschlagen.");
    } finally {
      setBusy(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const uploadClipboardFiles = async (files: File[]) => {
    if (files.length === 0 || busy) {
      setError(files.length === 0 ? "Die Zwischenablage enthält keine unterstützte Datei." : null);
      return;
    }
    await uploadFiles(files);
  };

  const pasteFromClipboard = async () => {
    if (busy) return;
    if (!navigator.clipboard?.read) {
      setError("Direktes Lesen der Zwischenablage wird hier nicht unterstützt. Klicke in die Medienfläche und füge mit Cmd/Ctrl+V ein.");
      return;
    }
    setError(null);
    try {
      const files = await clipboardItemsToFiles(await navigator.clipboard.read());
      await uploadClipboardFiles(files);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Zwischenablage konnte nicht gelesen werden.");
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLElement>) => {
    if (isEditablePasteTarget(event.target)) return;
    const files = filesFromClipboardData(event.clipboardData);
    if (files.length === 0) return;
    event.preventDefault();
    void uploadClipboardFiles(files);
  };

  const reorderAttachments = async (targetId: number, placeAfter: boolean) => {
    if (!draggedLinkId || draggedLinkId === targetId || busy) return;
    setBusy(true);
    setError(null);
    try {
      await props.onReorder(props.entityId, moveIdToDropPosition(linkIds, draggedLinkId, targetId, placeAfter));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Reihenfolge konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
      setDraggedLinkId(null);
      setDropLinkId(null);
    }
  };

  return (
    <section
      className={`${props.surface === "section" ? "section-block" : "panel"} media-panel ${dragActive ? "drag-active" : ""}`}
      tabIndex={0}
      aria-label="Medienbereich"
      onPaste={handlePaste}
      onDragOver={(event) => {
        if (draggedLinkId || event.dataTransfer.types.includes("application/x-dmax-media-link")) {
          return;
        }
        event.preventDefault();
        setDragActive(true);
      }}
      onDragLeave={() => setDragActive(false)}
      onDrop={(event) => {
        if (draggedLinkId || event.dataTransfer.types.includes("application/x-dmax-media-link")) {
          return;
        }
        event.preventDefault();
        setDragActive(false);
        void uploadFiles(event.dataTransfer.files);
      }}
    >
      <div className="media-panel-header">
        <div>
          <h2>Medien</h2>
          <span>{props.attachments.length} Dateien</span>
        </div>
        <button type="button" className="icon-button" disabled={busy} onClick={() => void pasteFromClipboard()} title="Aus Zwischenablage einfügen">
          <ClipboardPaste size={17} />
        </button>
        <button type="button" className="icon-button" disabled={busy} onClick={() => fileInputRef.current?.click()} title="Dateien hinzufügen">
          <Upload size={17} />
        </button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden-file-input"
          onChange={(event) => {
            if (event.target.files) {
              void uploadFiles(event.target.files);
            }
          }}
        />
      </div>

      <button type="button" className="media-drop-empty" disabled={busy} onClick={() => fileInputRef.current?.click()}>
        <Paperclip size={18} />
        <span>{busy ? "Upload und Analyse laufen..." : "Dateien hier ablegen, auswählen oder einfügen"}</span>
      </button>

      {props.attachments.length > 0 ? (
        <div className="media-grid">
          {props.attachments.map((attachment) => (
            <MediaAttachmentCard
              key={attachment.id}
              attachment={attachment}
              busy={busy}
              dragging={draggedLinkId === attachment.id}
              dragOver={dropLinkId === attachment.id}
              onUpdate={props.onUpdate}
              onDelete={props.onDelete}
              onOpen={setModalMedia}
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move";
                event.dataTransfer.setData("application/x-dmax-media-link", String(attachment.id));
                setDraggedLinkId(attachment.id);
              }}
              onDragOver={(event) => {
                if (!draggedLinkId || draggedLinkId === attachment.id) return;
                event.preventDefault();
                event.stopPropagation();
                setDropLinkId(attachment.id);
              }}
              onDrop={(event) => {
                if (!draggedLinkId) return;
                event.preventDefault();
                event.stopPropagation();
                void reorderAttachments(attachment.id, dropAfter(event));
              }}
              onDragEnd={() => {
                setDraggedLinkId(null);
                setDropLinkId(null);
              }}
            />
          ))}
        </div>
      ) : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {modalMedia ? (
        <MediaModal
          attachment={modalMedia}
          onClose={() => setModalMedia(null)}
          onUpdateLink={async (linkId, input) => {
            await props.onUpdate(linkId, input);
            setModalMedia((current) => (current && current.id === modalMedia.id ? { ...current, ...input } : current));
          }}
          onUpdateAsset={async (assetId, input) => {
            const updated = await updateMediaAssetAnalysis(assetId, input);
            setModalMedia((current) => (current && current.asset.id === assetId ? { ...current, asset: updated } : current));
            return updated;
          }}
          onReanalyzeAsset={async (assetId, input) => {
            const updated = await reanalyzeMediaAsset(assetId, input);
            setModalMedia((current) => (current && current.asset.id === assetId ? { ...current, asset: updated } : current));
            return updated;
          }}
        />
      ) : null}
    </section>
  );
}

function filesFromClipboardData(data: DataTransfer): File[] {
  const files = Array.from(data.items)
    .filter((item) => item.kind === "file" && isSupportedClipboardMimeType(item.type))
    .map((item, index) => {
      const file = item.getAsFile();
      return file ? normalizeClipboardFile(file, item.type, index) : null;
    })
    .filter((file): file is File => Boolean(file));

  if (files.length > 0) {
    return files;
  }

  return Array.from(data.files)
    .filter((file) => isSupportedClipboardMimeType(file.type))
    .map((file, index) => normalizeClipboardFile(file, file.type, index));
}

async function clipboardItemsToFiles(items: ClipboardItem[]): Promise<File[]> {
  const files: File[] = [];
  for (const item of items) {
    const mimeType = item.types.find(isSupportedClipboardMimeType);
    if (!mimeType) continue;
    const blob = await item.getType(mimeType);
    files.push(new File([blob], clipboardFileName(mimeType, files.length), {
      type: blob.type || mimeType,
      lastModified: Date.now()
    }));
  }
  return files;
}

function normalizeClipboardFile(file: File, fallbackMimeType: string, index: number): File {
  if (file.name.trim()) {
    return file;
  }
  return new File([file], clipboardFileName(file.type || fallbackMimeType, index), {
    type: file.type || fallbackMimeType || "application/octet-stream",
    lastModified: file.lastModified || Date.now()
  });
}

function clipboardFileName(mimeType: string, index: number): string {
  const suffix = index > 0 ? `-${index + 1}` : "";
  return `clipboard-${timestampForFileName()}${suffix}.${extensionForMimeType(mimeType)}`;
}

function timestampForFileName(): string {
  return new Date().toISOString().replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
}

function extensionForMimeType(mimeType: string): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/svg+xml") return "svg";
  if (mimeType === "application/pdf") return "pdf";
  if (mimeType === "text/markdown") return "md";
  if (mimeType === "text/plain") return "txt";
  const subtype = mimeType.split("/")[1]?.split("+")[0]?.trim();
  return subtype || "bin";
}

function isSupportedClipboardMimeType(mimeType: string): boolean {
  return mimeType.startsWith("image/")
    || mimeType.startsWith("audio/")
    || mimeType.startsWith("video/")
    || mimeType === "application/pdf"
    || mimeType === "text/plain"
    || mimeType === "text/markdown";
}

function isEditablePasteTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return Boolean(target.closest("input, textarea, select, [contenteditable='true']"));
}

function MediaAttachmentCard(props: {
  attachment: MediaAttachment;
  busy: boolean;
  dragging: boolean;
  dragOver: boolean;
  onUpdate: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onDelete: (linkId: number) => Promise<void>;
  onDragStart: (event: DragEvent<HTMLElement>) => void;
  onDragOver: (event: DragEvent<HTMLElement>) => void;
  onDrop: (event: DragEvent<HTMLElement>) => void;
  onDragEnd: () => void;
  onOpen: (attachment: MediaAttachment) => void;
}) {
  const { attachment } = props;
  const [caption, setCaption] = useState(attachment.caption ?? "");
  const [editingCaption, setEditingCaption] = useState(false);
  const [busy, setBusy] = useState(false);
  const suppressClickRef = useRef(false);

  useEffect(() => {
    setCaption(attachment.caption ?? "");
    setEditingCaption(false);
    setBusy(false);
  }, [attachment.id, attachment.caption]);

  const saveCaption = async () => {
    if (busy) return;
    const nextCaption = caption.trim() ? caption : null;
    if (nextCaption === attachment.caption) {
      setEditingCaption(false);
      return;
    }
    setBusy(true);
    try {
      await props.onUpdate(attachment.id, { caption: nextCaption });
      setEditingCaption(false);
    } finally {
      setBusy(false);
    }
  };

  const deleteAttachment = async () => {
    if (busy || props.busy) return;
    setBusy(true);
    try {
      await props.onDelete(attachment.id);
    } finally {
      setBusy(false);
    }
  };

  return (
    <article
      className={`media-card ${attachment.asset.kind} ${props.dragging ? "dragging" : ""} ${props.dragOver ? "drag-over" : ""}`}
      draggable={!editingCaption && !busy && !props.busy}
      role="button"
      tabIndex={0}
      onClick={() => {
        if (suppressClickRef.current || editingCaption || busy || props.busy) return;
        props.onOpen(attachment);
      }}
      onKeyDown={(event) => {
        if ((event.key === "Enter" || event.key === " ") && !editingCaption && !busy && !props.busy) {
          event.preventDefault();
          props.onOpen(attachment);
        }
      }}
      onDragStart={(event) => {
        suppressClickRef.current = true;
        props.onDragStart(event);
      }}
      onDragOver={props.onDragOver}
      onDrop={props.onDrop}
      onDragEnd={() => {
        props.onDragEnd();
        window.setTimeout(() => {
          suppressClickRef.current = false;
        }, 0);
      }}
    >
      <div className="media-preview">
        <MediaPreview attachment={attachment} />
      </div>
      <div className="media-card-body">
        <div className="media-file-line">
          <strong title={attachment.asset.originalName}>{attachment.asset.originalName}</strong>
          <span>{formatBytes(attachment.asset.byteSize)}</span>
        </div>
        <span className="media-kind-line">{attachment.asset.mimeType}</span>
        {attachment.asset.summary ? <p className="media-analysis-text">{attachment.asset.summary}</p> : null}
        {!attachment.asset.summary && attachment.asset.textExcerpt ? <p className="media-analysis-text">{attachment.asset.textExcerpt}</p> : null}
        {editingCaption ? (
          <form
            className="media-caption-form"
            onClick={(event) => event.stopPropagation()}
            onSubmit={(event) => {
              event.preventDefault();
              void saveCaption();
            }}
          >
            <input
              autoFocus
              value={caption}
              disabled={busy}
              placeholder="Caption"
              onChange={(event) => setCaption(event.target.value)}
              onBlur={() => void saveCaption()}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setCaption(attachment.caption ?? "");
                  setEditingCaption(false);
                }
              }}
            />
          </form>
        ) : (
          <button
            type="button"
            className="media-caption-button"
            onClick={(event) => {
              event.stopPropagation();
              setEditingCaption(true);
            }}
            title="Caption bearbeiten"
          >
            {attachment.caption || "Caption hinzufügen"}
          </button>
        )}
      </div>
      <button
        type="button"
        className="icon-button danger media-delete"
        disabled={busy || props.busy}
        onClick={(event) => {
          event.stopPropagation();
          void deleteAttachment();
        }}
        title="Anhang entfernen"
      >
        <Trash2 size={16} />
      </button>
    </article>
  );
}

function MediaPreview(props: { attachment: MediaAttachment }) {
  const { asset } = props.attachment;
  if (asset.kind === "image") {
    return (
      <div className="media-image-button" title="Medium öffnen">
        <img src={asset.fileUrl} alt={props.attachment.caption ?? asset.originalName} loading="lazy" draggable={false} />
      </div>
    );
  }
  if (asset.kind === "audio") {
    return (
      <div className="media-document-link">
        <Mic2 size={30} />
        <strong>AUDIO</strong>
        <span>{asset.summary || "Audio öffnen"}</span>
      </div>
    );
  }
  if (asset.kind === "video") {
    return <video src={asset.fileUrl} muted playsInline preload="metadata" />;
  }
  if (asset.kind === "document") {
    if (asset.mimeType === "application/pdf") {
      return (
        <div className="media-pdf-preview" title="PDF öffnen">
          <iframe src={`${asset.fileUrl}#toolbar=0&navpanes=0&scrollbar=0`} title={asset.originalName} />
        </div>
      );
    }
    if (asset.mimeType === "text/plain" || asset.mimeType === "text/markdown") {
      return (
        <div className="media-text-preview" title="Dokument öffnen">
          <FileText size={24} />
          <span>{asset.textExcerpt || asset.summary || asset.originalName}</span>
        </div>
      );
    }
    return (
      <div className="media-document-link" title="Dokument öffnen">
        <FileText size={30} />
        <strong>{documentExtension(asset.originalName).toUpperCase() || "DOC"}</strong>
        <span>{asset.summary || "Dokument öffnen"}</span>
      </div>
    );
  }
  return (
    <div className="media-document-link">
      <Image size={30} />
      <span>Öffnen</span>
    </div>
  );
}

function MediaModal(props: {
  attachment: MediaAttachment;
  onClose: () => void;
  onUpdateLink: (linkId: number, input: { caption?: string | null; role?: string | null }) => Promise<void>;
  onUpdateAsset: (assetId: number, input: { summary?: string | null; textExcerpt?: string | null; transcript?: string | null }) => Promise<MediaAsset>;
  onReanalyzeAsset: (assetId: number, input: { prompt?: string | null }) => Promise<MediaAsset>;
}) {
  const { attachment } = props;
  const { asset } = attachment;
  const [caption, setCaption] = useState(attachment.caption ?? "");
  const [summary, setSummary] = useState(asset.summary ?? "");
  const [textExcerpt, setTextExcerpt] = useState(asset.textExcerpt ?? "");
  const [transcript, setTranscript] = useState(asset.transcript ?? "");
  const [editingAnalysis, setEditingAnalysis] = useState(false);
  const [reanalyzePrompt, setReanalyzePrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setCaption(attachment.caption ?? "");
    setSummary(asset.summary ?? "");
    setTextExcerpt(asset.textExcerpt ?? "");
    setTranscript(asset.transcript ?? "");
    setEditingAnalysis(false);
    setReanalyzePrompt("");
    setBusy(false);
    setError(null);
  }, [attachment.id, attachment.caption, asset.id, asset.summary, asset.textExcerpt, asset.transcript]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        props.onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [props.onClose]);

  const saveCaption = async () => {
    if (busy) return;
    const nextCaption = nullableText(caption);
    if (nextCaption === attachment.caption) return;
    setBusy(true);
    setError(null);
    try {
      await props.onUpdateLink(attachment.id, { caption: nextCaption });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Caption konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const saveAnalysis = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await props.onUpdateAsset(asset.id, {
        summary: nullableText(summary),
        textExcerpt: nullableText(textExcerpt),
        transcript: nullableText(transcript)
      });
      setSummary(updated.summary ?? "");
      setTextExcerpt(updated.textExcerpt ?? "");
      setTranscript(updated.transcript ?? "");
      setEditingAnalysis(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse konnte nicht gespeichert werden.");
    } finally {
      setBusy(false);
    }
  };

  const runReanalysis = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const updated = await props.onReanalyzeAsset(asset.id, { prompt: nullableText(reanalyzePrompt) });
      setSummary(updated.summary ?? "");
      setTextExcerpt(updated.textExcerpt ?? "");
      setTranscript(updated.transcript ?? "");
      setEditingAnalysis(false);
      setReanalyzePrompt("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Analyse konnte nicht neu erstellt werden.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="media-modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={attachment.caption ?? asset.originalName}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          props.onClose();
        }
      }}
    >
      <div className="media-modal">
        <div className="media-modal-header">
          <div>
            <strong>{asset.originalName}</strong>
            <span>{asset.mimeType} · {formatBytes(asset.byteSize)}</span>
          </div>
          <button type="button" className="icon-button" onClick={props.onClose} title="Schließen">
            <X size={18} />
          </button>
        </div>
        <div className="media-modal-content">
          <div className="media-modal-viewer">
            <MediaModalViewer attachment={attachment} />
          </div>
          <aside className="media-modal-meta">
            <section className="media-meta-section">
              <h3>Metadaten</h3>
              <dl className="media-meta-list">
                <div>
                  <dt>Typ</dt>
                  <dd>{asset.kind}</dd>
                </div>
                <div>
                  <dt>MIME</dt>
                  <dd>{asset.mimeType}</dd>
                </div>
                <div>
                  <dt>Größe</dt>
                  <dd>{formatBytes(asset.byteSize)}</dd>
                </div>
                <div>
                  <dt>Hochgeladen</dt>
                  <dd>{formatMediaTimestamp(asset.createdAt)}</dd>
                </div>
              </dl>
            </section>

            <section className="media-meta-section">
              <h3>Caption</h3>
              <input
                value={caption}
                disabled={busy}
                placeholder="Warum ist dieses Medium hier relevant?"
                onChange={(event) => setCaption(event.target.value)}
                onBlur={() => void saveCaption()}
              />
            </section>

            <section className="media-meta-section">
              <div className="media-section-title-row">
                <h3>Analyse</h3>
                <button type="button" className="small-text-button" disabled={busy} onClick={() => setEditingAnalysis((value) => !value)}>
                  {editingAnalysis ? "Abbrechen" : "Bearbeiten"}
                </button>
              </div>

              {editingAnalysis ? (
                <div className="media-analysis-form">
                  <label>
                    Zusammenfassung
                    <textarea value={summary} disabled={busy} rows={4} onChange={(event) => setSummary(event.target.value)} />
                  </label>
                  <label>
                    Textauszug / Inhaltsnotiz
                    <textarea value={textExcerpt} disabled={busy} rows={7} onChange={(event) => setTextExcerpt(event.target.value)} />
                  </label>
                  {asset.kind === "audio" || asset.kind === "video" ? (
                    <label>
                      Transkript
                      <textarea value={transcript} disabled={busy} rows={7} onChange={(event) => setTranscript(event.target.value)} />
                    </label>
                  ) : null}
                  <button type="button" className="primary-action compact" disabled={busy} onClick={() => void saveAnalysis()}>
                    Speichern
                  </button>
                </div>
              ) : (
                <div className="media-analysis-read">
                  <ExpandableText title="Zusammenfassung" text={asset.summary} emptyLabel="Keine Zusammenfassung gespeichert." />
                  <ExpandableText title="Textauszug / Inhaltsnotiz" text={asset.textExcerpt} emptyLabel="Kein Textauszug gespeichert." />
                  {asset.transcript ? <ExpandableText title="Transkript" text={asset.transcript} emptyLabel="Kein Transkript gespeichert." /> : null}
                </div>
              )}
            </section>

            <section className="media-meta-section">
              <h3>Analyse neu erstellen</h3>
              <textarea
                value={reanalyzePrompt}
                disabled={busy}
                rows={3}
                placeholder="Optionaler Fokus, z.B. bitte ausführlicher, nur Reisedaten extrahieren, auf Kosten achten..."
                onChange={(event) => setReanalyzePrompt(event.target.value)}
              />
              <button type="button" className="secondary-action compact" disabled={busy} onClick={() => void runReanalysis()}>
                <RefreshCw size={15} />
                {busy ? "Analysiere..." : "Neu analysieren"}
              </button>
            </section>

            {error ? <p className="inline-error">{error}</p> : null}
          </aside>
        </div>
      </div>
    </div>
  );
}

function MediaModalViewer(props: { attachment: MediaAttachment }) {
  const { asset } = props.attachment;
  if (asset.kind === "image") {
    return <img src={asset.fileUrl} alt={props.attachment.caption ?? asset.originalName} />;
  }
  if (asset.kind === "audio") {
    return (
      <div className="media-player-shell">
        <Mic2 size={34} />
        <strong>{asset.originalName}</strong>
        <audio controls src={asset.fileUrl} />
      </div>
    );
  }
  if (asset.kind === "video") {
    return <video controls src={asset.fileUrl} />;
  }
  if (asset.mimeType === "application/pdf") {
    return <iframe className="media-document-frame" src={`${asset.fileUrl}#toolbar=1&navpanes=0`} title={asset.originalName} />;
  }
  if (asset.mimeType === "text/plain" || asset.mimeType === "text/markdown") {
    return <pre className="media-text-document">{asset.textExcerpt || asset.summary || "Kein Textauszug gespeichert."}</pre>;
  }
  return (
    <div className="media-player-shell">
      <FileText size={40} />
      <strong>{asset.originalName}</strong>
      <span>{asset.summary || "Für diesen Dokumenttyp gibt es aktuell keine eingebettete Seitenvorschau."}</span>
      <a className="secondary-action compact" href={asset.fileUrl} target="_blank" rel="noreferrer">
        <ExternalLink size={15} />
        Datei öffnen
      </a>
    </div>
  );
}

function ExpandableText(props: { title: string; text: string | null; emptyLabel: string }) {
  const [expanded, setExpanded] = useState(false);
  const text = props.text?.trim();
  const limit = 420;
  const canExpand = Boolean(text && text.length > limit);
  const visibleText = text && canExpand && !expanded ? `${text.slice(0, limit).trimEnd()}...` : text;

  return (
    <div className="media-expandable-text">
      <strong>{props.title}</strong>
      <p>{visibleText || props.emptyLabel}</p>
      {canExpand ? (
        <button type="button" className="small-text-button" onClick={() => setExpanded((value) => !value)}>
          {expanded ? "Weniger anzeigen" : "Mehr anzeigen"}
        </button>
      ) : null}
    </div>
  );
}

function TasksView(props: {
  tasks: Task[];
  initiatives: Initiative[];
  onToggleTaskStatus: (task: Task) => Promise<void>;
  onDeleteTask?: (task: Task) => Promise<void>;
  onOpenTask?: (taskId: number) => void;
  onReorderTasks?: (taskIds: number[]) => void;
  showInitiativeName?: boolean;
  groupByCompletionStatus?: boolean;
}) {
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [taskDropId, setTaskDropId] = useState<number | null>(null);
  const [taskToDelete, setTaskToDelete] = useState<Task | null>(null);
  const initiativeById = new Map(props.initiatives.map((project) => [project.id, project]));
  const visibleTasks = props.groupByCompletionStatus ? sortTasksByCompletionAndRank(props.tasks) : props.tasks;
  const taskIds = visibleTasks.map((task) => task.id);
  const showInitiativeName = props.showInitiativeName ?? true;
  return (
    <section className="task-list">
      {visibleTasks.map((task) => (
        <article
          className={`task-row ${task.status} ${props.onOpenTask ? "clickable" : ""} ${props.onReorderTasks ? "draggable-row" : ""} ${draggedTaskId === task.id ? "dragging" : ""} ${taskDropId === task.id ? "drag-over" : ""}`}
          key={task.id}
          draggable={Boolean(props.onReorderTasks)}
          onClick={() => props.onOpenTask?.(task.id)}
          onDragStart={(event) => {
            if (!props.onReorderTasks) return;
            event.dataTransfer.effectAllowed = "move";
            setDraggedTaskId(task.id);
          }}
          onDragOver={(event) => {
            if (!props.onReorderTasks || !draggedTaskId) return;
            event.preventDefault();
            setTaskDropId(task.id);
          }}
          onDrop={(event) => {
            event.preventDefault();
            if (!props.onReorderTasks || !draggedTaskId) return;
            props.onReorderTasks(moveIdToDropPosition(taskIds, draggedTaskId, task.id, dropAfter(event)));
            setDraggedTaskId(null);
            setTaskDropId(null);
          }}
          onDragEnd={() => {
            setDraggedTaskId(null);
            setTaskDropId(null);
          }}
        >
          <button
            className="icon-button"
            onClick={(event) => {
              event.stopPropagation();
              void props.onToggleTaskStatus(task);
            }}
            title={task.status === "done" ? "Wieder öffnen" : "Als erledigt markieren"}
          >
            {task.status === "done" ? <CheckCircle2 size={18} /> : <Circle size={18} />}
          </button>
          <div>
            <h2>{task.title}</h2>
            {showInitiativeName || task.dueAt ? (
              <p className="task-row-meta">
                {showInitiativeName ? (
                  <span>{initiativeById.get(task.initiativeId) ? displayInitiativeName(initiativeById.get(task.initiativeId)!) : `Initiative ${task.initiativeId}`}</span>
                ) : null}
                {task.dueAt ? (
                  <span className="task-due-pill" title="Due Date">
                    <CalendarDays size={13} />
                    Fällig {formatTaskDueDate(task.dueAt)}
                  </span>
                ) : null}
              </p>
            ) : null}
          </div>
          <span className={`priority ${task.priority}`}>{task.priority}</span>
          {props.onDeleteTask ? (
            <button
              type="button"
              className="icon-button subtle-danger task-delete-button"
              title="Aufgabe löschen"
              onClick={(event) => {
                event.stopPropagation();
                setTaskToDelete(task);
              }}
            >
              <Trash2 size={15} />
            </button>
          ) : null}
        </article>
      ))}
      {taskToDelete && props.onDeleteTask ? (
        <ConfirmModal
          title="Aufgabe löschen?"
          description={(
            <>
              <p>Die Aufgabe „{taskToDelete.title}“ wird gelöscht.</p>
              <p>Beim Löschen werden ebenfalls entfernt:</p>
              <ul>
                <li>Beschreibung</li>
                <li>Checkliste, falls vorhanden</li>
                <li>Angehängte Medien</li>
              </ul>
            </>
          )}
          confirmLabel="Aufgabe löschen"
          onCancel={() => setTaskToDelete(null)}
          onConfirm={async () => {
            await props.onDeleteTask?.(taskToDelete);
            setTaskToDelete(null);
          }}
        />
      ) : null}
    </section>
  );
}

function TaskCreateInlineForm(props: { label?: string; onCreateTask: (title: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [creating, setCreating] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        className={props.label ? "section-primary-action" : "task-create-inline-button"}
        onClick={() => {
          setOpen(true);
          setTitle("");
        }}
        title={props.label ?? "Massnahme hinzufuegen"}
        aria-label={props.label ?? "Massnahme hinzufuegen"}
      >
        <Plus size={17} />
        {props.label ? <span>{props.label}</span> : null}
      </button>
    );
  }

  return (
    <form
      className="task-create-inline-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const trimmedTitle = title.trim();
        if (!trimmedTitle || creating) return;
        setCreating(true);
        try {
          await props.onCreateTask(trimmedTitle);
          setTitle("");
          setOpen(false);
        } finally {
          setCreating(false);
        }
      }}
    >
      <input
        autoFocus
        value={title}
        disabled={creating}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setTitle("");
            setOpen(false);
          }
        }}
        placeholder="Neue Massnahme"
        aria-label="Neue Massnahme"
      />
      <button type="submit" className="icon-button confirm" disabled={!title.trim() || creating} title="Anlegen" aria-label="Anlegen">
        <Plus size={17} />
      </button>
      <button
        type="button"
        className="icon-button danger"
        disabled={creating}
        onClick={() => {
          setTitle("");
          setOpen(false);
        }}
        title="Abbrechen"
        aria-label="Abbrechen"
      >
        <X size={17} />
      </button>
    </form>
  );
}
