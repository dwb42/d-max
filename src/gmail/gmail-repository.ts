import type Database from "better-sqlite3";
import { nowIso } from "../db/time.js";

export type GmailMailbox = {
  id: number;
  accountLabel: string;
  displayName: string;
  emailAddress: string | null;
  enabled: boolean;
  syncEnabled: boolean;
  sendEnabled: boolean;
  signature: string | null;
  lastSyncAt: string | null;
  lastSyncError: string | null;
  createdAt: string;
  updatedAt: string;
};

export type GmailAddress = {
  name: string | null;
  email: string;
};

export type GmailMessageDirection = "inbound" | "outbound" | "internal" | "unknown";
export type GmailMessageSyncStatus = "synced" | "external_deleted";
export type GmailParticipantRole = "from" | "to" | "cc" | "bcc";

export type GmailAttachmentMetadata = {
  gmailAttachmentId: string | null;
  filename: string | null;
  mimeType: string | null;
  byteSize: number | null;
  partId: string | null;
};

export type GmailMessageInput = {
  mailboxId: number;
  gmailMessageId: string;
  gmailThreadId: string | null;
  historyId: string | null;
  labelIds: string[];
  direction: GmailMessageDirection;
  messageDate: string;
  subject: string | null;
  from: GmailAddress[];
  to: GmailAddress[];
  cc: GmailAddress[];
  bcc: GmailAddress[];
  plainBody: string | null;
  htmlBody: string | null;
  snippet: string | null;
  attachments: GmailAttachmentMetadata[];
};

export type GmailMessage = Omit<GmailMessageInput, "attachments"> & {
  id: number;
  syncStatus: GmailMessageSyncStatus;
  lastSyncedAt: string;
  createdAt: string;
  updatedAt: string;
  attachments: GmailAttachmentMetadata[];
  partyLinks: GmailMessagePartyLink[];
};

export type GmailMessagePartyLink = {
  id: number;
  messageId: number;
  partyId: number;
  partyType: "person" | "organization";
  partyDisplayName: string;
  contactPointId: number | null;
  matchedEmail: string;
  createdAt: string;
  updatedAt: string;
};

export type GmailPartyEmailMatch = {
  partyId: number;
  partyType: "person" | "organization";
  partyDisplayName: string;
  contactPointId: number;
  email: string;
  normalizedEmail: string;
};

type GmailMailboxRow = {
  id: number;
  account_label: string;
  display_name: string;
  email_address: string | null;
  enabled: number;
  sync_enabled: number;
  send_enabled: number;
  signature: string | null;
  last_sync_at: string | null;
  last_sync_error: string | null;
  created_at: string;
  updated_at: string;
};

type GmailMessageRow = {
  id: number;
  mailbox_id: number;
  gmail_message_id: string;
  gmail_thread_id: string | null;
  history_id: string | null;
  label_ids_json: string;
  direction: GmailMessageDirection;
  message_date: string;
  subject: string | null;
  from_json: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  plain_body: string | null;
  html_body: string | null;
  snippet: string | null;
  sync_status: GmailMessageSyncStatus;
  last_synced_at: string;
  created_at: string;
  updated_at: string;
};

type GmailMessagePartyLinkRow = {
  id: number;
  message_id: number;
  party_id: number;
  party_type: "person" | "organization";
  party_display_name: string;
  contact_point_id: number | null;
  matched_email: string;
  created_at: string;
  updated_at: string;
};

type GmailAttachmentRow = {
  gmail_attachment_id: string | null;
  filename: string | null;
  mime_type: string | null;
  byte_size: number | null;
  part_id: string | null;
};

export class GmailRepository {
  constructor(private readonly db: Database.Database) {}

  listMailboxes(): GmailMailbox[] {
    return (this.db.prepare("select * from gmail_mailboxes order by lower(display_name) asc, id asc").all() as GmailMailboxRow[]).map(toMailbox);
  }

  listSyncEnabledMailboxes(): GmailMailbox[] {
    return (this.db.prepare("select * from gmail_mailboxes where enabled = 1 and sync_enabled = 1 order by id asc").all() as GmailMailboxRow[]).map(toMailbox);
  }

  findMailboxById(id: number): GmailMailbox | null {
    const row = this.db.prepare("select * from gmail_mailboxes where id = ?").get(id) as GmailMailboxRow | undefined;
    return row ? toMailbox(row) : null;
  }

  findMailboxByAccountLabel(accountLabel: string): GmailMailbox | null {
    const row = this.db.prepare("select * from gmail_mailboxes where lower(account_label) = lower(?)").get(accountLabel.trim()) as GmailMailboxRow | undefined;
    return row ? toMailbox(row) : null;
  }

  upsertMailbox(input: {
    accountLabel: string;
    displayName?: string | null;
    emailAddress?: string | null;
    enabled?: boolean;
    syncEnabled?: boolean;
    sendEnabled?: boolean;
    signature?: string | null;
  }, now = nowIso()): GmailMailbox {
    const accountLabel = input.accountLabel.trim();
    if (!accountLabel) {
      throw new Error("Gmail mailbox accountLabel is required.");
    }
    const existing = this.findMailboxByAccountLabel(accountLabel);
    if (existing) {
      this.db
        .prepare(
          `update gmail_mailboxes
           set display_name = ?, email_address = ?, enabled = ?, sync_enabled = ?, send_enabled = ?, signature = ?, updated_at = ?
           where id = ?`
        )
        .run(
          clean(input.displayName) ?? existing.displayName,
          clean(input.emailAddress) ?? existing.emailAddress,
          input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
          input.syncEnabled === undefined ? (existing.syncEnabled ? 1 : 0) : input.syncEnabled ? 1 : 0,
          input.sendEnabled === undefined ? (existing.sendEnabled ? 1 : 0) : input.sendEnabled ? 1 : 0,
          input.signature === undefined ? existing.signature : clean(input.signature),
          now,
          existing.id
        );
      return this.findMailboxById(existing.id)!;
    }

    const result = this.db
      .prepare(
        `insert into gmail_mailboxes
          (account_label, display_name, email_address, enabled, sync_enabled, send_enabled, signature, created_at, updated_at)
         values (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        accountLabel,
        clean(input.displayName) ?? accountLabel,
        clean(input.emailAddress) ?? accountLabel,
        input.enabled === false ? 0 : 1,
        input.syncEnabled === false ? 0 : 1,
        input.sendEnabled ? 1 : 0,
        clean(input.signature),
        now,
        now
      );
    return this.findMailboxById(Number(result.lastInsertRowid))!;
  }

  updateMailbox(id: number, input: Partial<Omit<Parameters<GmailRepository["upsertMailbox"]>[0], "accountLabel">>, now = nowIso()): GmailMailbox {
    const existing = this.findMailboxById(id);
    if (!existing) {
      throw new Error(`Gmail mailbox not found: ${id}`);
    }
    this.db
      .prepare(
        `update gmail_mailboxes
         set display_name = ?, email_address = ?, enabled = ?, sync_enabled = ?, send_enabled = ?, signature = ?, updated_at = ?
         where id = ?`
      )
      .run(
        input.displayName === undefined ? existing.displayName : clean(input.displayName) ?? existing.accountLabel,
        input.emailAddress === undefined ? existing.emailAddress : clean(input.emailAddress),
        input.enabled === undefined ? (existing.enabled ? 1 : 0) : input.enabled ? 1 : 0,
        input.syncEnabled === undefined ? (existing.syncEnabled ? 1 : 0) : input.syncEnabled ? 1 : 0,
        input.sendEnabled === undefined ? (existing.sendEnabled ? 1 : 0) : input.sendEnabled ? 1 : 0,
        input.signature === undefined ? existing.signature : clean(input.signature),
        now,
        id
      );
    return this.findMailboxById(id)!;
  }

  updateMailboxSyncState(id: number, input: { lastSyncAt?: string | null; lastSyncError?: string | null }, now = nowIso()): GmailMailbox {
    const existing = this.findMailboxById(id);
    if (!existing) {
      throw new Error(`Gmail mailbox not found: ${id}`);
    }
    this.db
      .prepare("update gmail_mailboxes set last_sync_at = ?, last_sync_error = ?, updated_at = ? where id = ?")
      .run(
        input.lastSyncAt === undefined ? existing.lastSyncAt : input.lastSyncAt,
        input.lastSyncError === undefined ? existing.lastSyncError : input.lastSyncError,
        now,
        id
      );
    return this.findMailboxById(id)!;
  }

  listKnownEmailMatches(): GmailPartyEmailMatch[] {
    return (this.db
      .prepare(
        `select cp.id as contact_point_id,
                cp.party_id,
                cp.value as email,
                cp.normalized_value as normalized_email,
                p.type as party_type,
                p.display_name as party_display_name
         from party_contact_points cp
         join parties p on p.id = cp.party_id
         where cp.type = 'email' and cp.normalized_value is not null and trim(cp.normalized_value) <> ''
         order by lower(cp.normalized_value) asc, cp.id asc`
      )
      .all() as Array<{
      contact_point_id: number;
      party_id: number;
      email: string;
      normalized_email: string;
      party_type: "person" | "organization";
      party_display_name: string;
    }>).map((row) => ({
      contactPointId: row.contact_point_id,
      partyId: row.party_id,
      partyType: row.party_type,
      partyDisplayName: row.party_display_name,
      email: row.email,
      normalizedEmail: row.normalized_email
    }));
  }

  matchesForEmails(emails: string[]): GmailPartyEmailMatch[] {
    const normalizedEmails = [...new Set(emails.map(normalizeEmail).filter(Boolean))];
    if (normalizedEmails.length === 0) {
      return [];
    }
    const placeholders = normalizedEmails.map(() => "?").join(", ");
    return (this.db
      .prepare(
        `select cp.id as contact_point_id,
                cp.party_id,
                cp.value as email,
                cp.normalized_value as normalized_email,
                p.type as party_type,
                p.display_name as party_display_name
         from party_contact_points cp
         join parties p on p.id = cp.party_id
         where cp.type = 'email' and lower(cp.normalized_value) in (${placeholders})
         order by cp.id asc`
      )
      .all(...normalizedEmails) as Array<{
      contact_point_id: number;
      party_id: number;
      email: string;
      normalized_email: string;
      party_type: "person" | "organization";
      party_display_name: string;
    }>).map((row) => ({
      contactPointId: row.contact_point_id,
      partyId: row.party_id,
      partyType: row.party_type,
      partyDisplayName: row.party_display_name,
      email: row.email,
      normalizedEmail: row.normalized_email
    }));
  }

  upsertMessage(input: GmailMessageInput, matches: GmailPartyEmailMatch[], now = nowIso()): GmailMessage {
    return this.db.transaction(() => {
      const existing = this.findMessageByExternalId(input.mailboxId, input.gmailMessageId);
      if (existing) {
        this.db
          .prepare(
            `update gmail_messages
             set gmail_thread_id = ?, history_id = ?, label_ids_json = ?, direction = ?, message_date = ?, subject = ?,
                 from_json = ?, to_json = ?, cc_json = ?, bcc_json = ?, plain_body = ?, html_body = ?, snippet = ?,
                 sync_status = 'synced', last_synced_at = ?, updated_at = ?
             where id = ?`
          )
          .run(
            input.gmailThreadId,
            input.historyId,
            JSON.stringify(input.labelIds),
            input.direction,
            input.messageDate,
            input.subject,
            JSON.stringify(input.from),
            JSON.stringify(input.to),
            JSON.stringify(input.cc),
            JSON.stringify(input.bcc),
            input.plainBody,
            input.htmlBody,
            input.snippet,
            now,
            now,
            existing.id
          );
        this.replaceMessageChildren(existing.id, input, matches, now);
        return this.findMessageById(existing.id)!;
      }

      const result = this.db
        .prepare(
          `insert into gmail_messages
            (mailbox_id, gmail_message_id, gmail_thread_id, history_id, label_ids_json, direction, message_date, subject,
             from_json, to_json, cc_json, bcc_json, plain_body, html_body, snippet, last_synced_at, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          input.mailboxId,
          input.gmailMessageId,
          input.gmailThreadId,
          input.historyId,
          JSON.stringify(input.labelIds),
          input.direction,
          input.messageDate,
          input.subject,
          JSON.stringify(input.from),
          JSON.stringify(input.to),
          JSON.stringify(input.cc),
          JSON.stringify(input.bcc),
          input.plainBody,
          input.htmlBody,
          input.snippet,
          now,
          now,
          now
        );
      const messageId = Number(result.lastInsertRowid);
      this.replaceMessageChildren(messageId, input, matches, now);
      return this.findMessageById(messageId)!;
    })();
  }

  findMessageByExternalId(mailboxId: number, gmailMessageId: string): GmailMessage | null {
    const row = this.db.prepare("select * from gmail_messages where mailbox_id = ? and gmail_message_id = ?").get(mailboxId, gmailMessageId) as GmailMessageRow | undefined;
    return row ? this.hydrateMessage(row) : null;
  }

  findMessageById(id: number): GmailMessage | null {
    const row = this.db.prepare("select * from gmail_messages where id = ?").get(id) as GmailMessageRow | undefined;
    return row ? this.hydrateMessage(row) : null;
  }

  listMessagesForParty(partyId: number, limit = 50): GmailMessage[] {
    const rows = this.db
      .prepare(
        `select gm.*
         from gmail_messages gm
         join gmail_message_party_links link on link.message_id = gm.id
         left join gmail_message_party_visibility visibility
           on visibility.message_id = gm.id and visibility.party_id = link.party_id
         where link.party_id = ?
           and visibility.id is null
         group by gm.id
         order by gm.message_date desc, gm.id desc
         limit ?`
      )
      .all(partyId, limit) as GmailMessageRow[];
    return rows.map((row) => this.hydrateMessage(row)).reverse();
  }

  isMessageLinkedToParty(messageId: number, partyId: number): boolean {
    const row = this.db
      .prepare("select id from gmail_message_party_links where message_id = ? and party_id = ? limit 1")
      .get(messageId, partyId) as { id: number } | undefined;
    return Boolean(row);
  }

  hideMessageForParty(messageId: number, partyId: number, status: "archived" | "trashed", now = nowIso()): void {
    this.db
      .prepare(
        `insert into gmail_message_party_visibility (message_id, party_id, status, created_at, updated_at)
         values (?, ?, ?, ?, ?)
         on conflict(message_id, party_id) do update set status = excluded.status, updated_at = excluded.updated_at`
      )
      .run(messageId, partyId, status, now, now);
    this.db.prepare("delete from gmail_message_party_links where message_id = ? and party_id = ?").run(messageId, partyId);
  }

  updateMessageLabels(messageId: number, labelIds: string[], now = nowIso()): void {
    this.db
      .prepare("update gmail_messages set label_ids_json = ?, updated_at = ? where id = ?")
      .run(JSON.stringify(labelIds), now, messageId);
  }

  unlinkMessagePartiesByExternalId(mailboxId: number, gmailMessageId: string): void {
    const row = this.db.prepare("select id from gmail_messages where mailbox_id = ? and gmail_message_id = ?").get(mailboxId, gmailMessageId) as
      | { id: number }
      | undefined;
    if (!row) {
      return;
    }
    this.db.prepare("delete from gmail_message_party_links where message_id = ?").run(row.id);
  }

  listStoredSyncedMessageRefs(mailboxId: number, limit = 100): Array<{ id: number; gmailMessageId: string }> {
    return (this.db
      .prepare("select id, gmail_message_id as gmailMessageId from gmail_messages where mailbox_id = ? and sync_status = 'synced' order by last_synced_at asc, id asc limit ?")
      .all(mailboxId, limit) as Array<{ id: number; gmailMessageId: string }>);
  }

  markExternalDeleted(id: number, now = nowIso()): void {
    this.db.prepare("update gmail_messages set sync_status = 'external_deleted', updated_at = ? where id = ?").run(now, id);
  }

  private replaceMessageChildren(messageId: number, input: GmailMessageInput, matches: GmailPartyEmailMatch[], now: string): void {
    this.db.prepare("delete from gmail_message_participants where message_id = ?").run(messageId);
    this.db.prepare("delete from gmail_message_party_links where message_id = ?").run(messageId);
    this.db.prepare("delete from gmail_message_attachments where message_id = ?").run(messageId);

    for (const [role, addresses] of Object.entries({ from: input.from, to: input.to, cc: input.cc, bcc: input.bcc }) as Array<[GmailParticipantRole, GmailAddress[]]>) {
      for (const address of addresses) {
        const normalizedEmail = normalizeEmail(address.email);
        if (!normalizedEmail) continue;
        this.db
          .prepare(
            "insert into gmail_message_participants (message_id, role, email, normalized_email, name, created_at, updated_at) values (?, ?, ?, ?, ?, ?, ?)"
          )
          .run(messageId, role, address.email, normalizedEmail, address.name, now, now);
      }
    }

    for (const match of matches) {
      const hidden = this.db
        .prepare("select id from gmail_message_party_visibility where message_id = ? and party_id = ?")
        .get(messageId, match.partyId) as { id: number } | undefined;
      if (hidden) {
        continue;
      }
      this.db
        .prepare(
          `insert or ignore into gmail_message_party_links
            (message_id, party_id, contact_point_id, matched_email, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?)`
        )
        .run(messageId, match.partyId, match.contactPointId, match.normalizedEmail, now, now);
    }

    for (const attachment of input.attachments) {
      this.db
        .prepare(
          `insert into gmail_message_attachments
            (message_id, gmail_attachment_id, filename, mime_type, byte_size, part_id, created_at, updated_at)
           values (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(messageId, attachment.gmailAttachmentId, attachment.filename, attachment.mimeType, attachment.byteSize, attachment.partId, now, now);
    }
  }

  private hydrateMessage(row: GmailMessageRow): GmailMessage {
    const attachments = this.db
      .prepare("select gmail_attachment_id, filename, mime_type, byte_size, part_id from gmail_message_attachments where message_id = ? order by id asc")
      .all(row.id) as GmailAttachmentRow[];
    const partyLinks = this.db
      .prepare(
        `select link.*, p.type as party_type, p.display_name as party_display_name
         from gmail_message_party_links link
         join parties p on p.id = link.party_id
         where link.message_id = ?
         order by lower(p.display_name) asc, link.id asc`
      )
      .all(row.id) as GmailMessagePartyLinkRow[];
    return {
      id: row.id,
      mailboxId: row.mailbox_id,
      gmailMessageId: row.gmail_message_id,
      gmailThreadId: row.gmail_thread_id,
      historyId: row.history_id,
      labelIds: parseJson<string[]>(row.label_ids_json, []),
      direction: row.direction,
      messageDate: row.message_date,
      subject: row.subject,
      from: parseJson<GmailAddress[]>(row.from_json, []),
      to: parseJson<GmailAddress[]>(row.to_json, []),
      cc: parseJson<GmailAddress[]>(row.cc_json, []),
      bcc: parseJson<GmailAddress[]>(row.bcc_json, []),
      plainBody: row.plain_body,
      htmlBody: row.html_body,
      snippet: row.snippet,
      syncStatus: row.sync_status,
      lastSyncedAt: row.last_synced_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      attachments: attachments.map((attachment) => ({
        gmailAttachmentId: attachment.gmail_attachment_id,
        filename: attachment.filename,
        mimeType: attachment.mime_type,
        byteSize: attachment.byte_size,
        partId: attachment.part_id
      })),
      partyLinks: partyLinks.map((link) => ({
        id: link.id,
        messageId: link.message_id,
        partyId: link.party_id,
        partyType: link.party_type,
        partyDisplayName: link.party_display_name,
        contactPointId: link.contact_point_id,
        matchedEmail: link.matched_email,
        createdAt: link.created_at,
        updatedAt: link.updated_at
      }))
    };
  }
}

export function normalizeEmail(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function toMailbox(row: GmailMailboxRow): GmailMailbox {
  return {
    id: row.id,
    accountLabel: row.account_label,
    displayName: row.display_name,
    emailAddress: row.email_address,
    enabled: row.enabled === 1,
    syncEnabled: row.sync_enabled === 1,
    sendEnabled: row.send_enabled === 1,
    signature: row.signature,
    lastSyncAt: row.last_sync_at,
    lastSyncError: row.last_sync_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function clean(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}
