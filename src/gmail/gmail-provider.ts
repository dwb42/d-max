import { GmailRepository, normalizeEmail, type GmailAddress, type GmailAttachmentMetadata, type GmailMessageDirection, type GmailMessageInput, type GmailMailbox } from "./gmail-repository.js";
import { GoogleCalendarAuth, googleGmailScopes } from "../calendar/google-calendar-auth.js";

const gmailReadonlyScope = "https://www.googleapis.com/auth/gmail.readonly";
const gmailComposeScope = "https://www.googleapis.com/auth/gmail.compose";
const gmailModifyScope = "https://www.googleapis.com/auth/gmail.modify";

export type GmailSyncResult = {
  mailboxId: number;
  accountLabel: string;
  fetched: number;
  stored: number;
  skippedUnmatched: number;
  markedExternalDeleted: number;
};

export type GmailDraftResult = {
  id: string;
  messageId: string | null;
};

type GmailListResponse = {
  messages?: Array<{ id: string; threadId?: string }>;
  nextPageToken?: string;
  error?: { message?: string };
};

type GmailApiMessage = {
  id?: string;
  threadId?: string;
  historyId?: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
  error?: { message?: string; code?: number };
};

type GmailMessagePart = {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: Array<{ name?: string; value?: string }>;
  body?: {
    data?: string;
    size?: number;
    attachmentId?: string;
  };
  parts?: GmailMessagePart[];
};

const gmailFetchTimeoutMs = 15_000;
const gmailSearchPageSize = 100;
const deletedStatuses = new Set([404, 410]);

export class GmailProvider {
  constructor(
    private readonly auth = new GoogleCalendarAuth(),
    private readonly repository?: GmailRepository
  ) {}

  async syncMailbox(mailbox: GmailMailbox, options: { maxMessages?: number } = {}): Promise<GmailSyncResult> {
    if (!this.repository) {
      throw new Error("Gmail repository is required for mailbox sync.");
    }
    const accessToken = await this.requireAccessToken(mailbox.accountLabel, [gmailReadonlyScope]);
    const knownMatches = this.repository.listKnownEmailMatches();
    const knownEmails = [...new Set(knownMatches.map((match) => match.normalizedEmail).filter(Boolean))];
    const mailboxEmails = connectedMailboxEmails(this.repository.listMailboxes(), mailbox);
    if (knownEmails.length === 0) {
      this.repository.updateMailboxSyncState(mailbox.id, { lastSyncAt: new Date().toISOString(), lastSyncError: null });
      return { mailboxId: mailbox.id, accountLabel: mailbox.accountLabel, fetched: 0, stored: 0, skippedUnmatched: 0, markedExternalDeleted: 0 };
    }

    const query = buildGmailContactQuery(knownEmails);
    const messageIds = await this.listMessageIds(accessToken, query, options.maxMessages ?? gmailSearchPageSize);
    let stored = 0;
    let skippedUnmatched = 0;
    for (const gmailMessageId of messageIds) {
      const apiMessage = await this.getMessage(accessToken, gmailMessageId);
      const parsed = parseGmailMessage(mailbox, apiMessage);
      const directContactEmails = eligibleDirectMailboxContactEmails(parsed, mailboxEmails);
      const matches = this.repository.matchesForEmails(directContactEmails);
      if (matches.length === 0) {
        this.repository.unlinkMessagePartiesByExternalId(mailbox.id, gmailMessageId);
        skippedUnmatched += 1;
        continue;
      }
      this.repository.upsertMessage(parsed, matches);
      stored += 1;
    }

    const markedExternalDeleted = await this.verifyStoredMessages(mailbox, accessToken);
    this.repository.updateMailboxSyncState(mailbox.id, { lastSyncAt: new Date().toISOString(), lastSyncError: null });
    return { mailboxId: mailbox.id, accountLabel: mailbox.accountLabel, fetched: messageIds.length, stored, skippedUnmatched, markedExternalDeleted };
  }

  async createDraft(mailbox: GmailMailbox, input: { to: string[]; cc?: string[]; bcc?: string[]; subject: string; body: string }): Promise<GmailDraftResult> {
    if (!mailbox.sendEnabled) {
      throw new Error("This Gmail mailbox is not enabled for sending.");
    }
    const accessToken = await this.requireAccessToken(mailbox.accountLabel, [gmailComposeScope]);
    const bodyWithSignature = appendSignature(input.body, mailbox.signature);
    const raw = encodeRfc2822Message({
      from: mailbox.emailAddress || mailbox.accountLabel,
      to: input.to,
      cc: input.cc ?? [],
      bcc: input.bcc ?? [],
      subject: input.subject,
      body: bodyWithSignature
    });
    const response = await gmailFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ message: { raw } })
    });
    const json = await response.json().catch(() => ({})) as { id?: string; message?: { id?: string }; error?: { message?: string } };
    if (!response.ok || !json.id) {
      throw new Error(json.error?.message ?? `Gmail drafts.create failed with ${response.status}`);
    }
    return { id: json.id, messageId: json.message?.id ?? null };
  }

  async sendDraft(mailbox: GmailMailbox, draftId: string): Promise<{ id: string; threadId: string | null }> {
    if (!mailbox.sendEnabled) {
      throw new Error("This Gmail mailbox is not enabled for sending.");
    }
    const accessToken = await this.requireAccessToken(mailbox.accountLabel, [gmailComposeScope, gmailReadonlyScope]);
    const response = await gmailFetch("https://gmail.googleapis.com/gmail/v1/users/me/drafts/send", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ id: draftId })
    });
    const json = await response.json().catch(() => ({})) as { id?: string; threadId?: string; error?: { message?: string } };
    if (!response.ok || !json.id) {
      throw new Error(json.error?.message ?? `Gmail drafts.send failed with ${response.status}`);
    }
    if (this.repository) {
      await this.storeMessageById(mailbox, accessToken, json.id);
    }
    return { id: json.id, threadId: json.threadId ?? null };
  }

  async archiveMessage(mailbox: GmailMailbox, gmailMessageId: string): Promise<{ id: string; labelIds: string[] }> {
    const accessToken = await this.requireAccessToken(mailbox.accountLabel, [gmailModifyScope]);
    const response = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}/modify`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({ removeLabelIds: ["INBOX"] })
    });
    const json = await response.json().catch(() => ({})) as { id?: string; labelIds?: string[]; error?: { message?: string } };
    if (!response.ok || !json.id) {
      throw new Error(json.error?.message ?? `Gmail messages.modify failed with ${response.status}`);
    }
    return { id: json.id, labelIds: json.labelIds ?? [] };
  }

  async trashMessage(mailbox: GmailMailbox, gmailMessageId: string): Promise<{ id: string; labelIds: string[] }> {
    const accessToken = await this.requireAccessToken(mailbox.accountLabel, [gmailModifyScope]);
    const response = await gmailFetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}/trash`, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}` }
    });
    const json = await response.json().catch(() => ({})) as { id?: string; labelIds?: string[]; error?: { message?: string } };
    if (!response.ok || !json.id) {
      throw new Error(json.error?.message ?? `Gmail messages.trash failed with ${response.status}`);
    }
    return { id: json.id, labelIds: json.labelIds ?? [] };
  }

  private async requireAccessToken(accountLabel: string, requiredScopes = googleGmailScopes): Promise<string> {
    const authStatus = this.auth.gmailStatus(accountLabel);
    if (!authStatus.configured) {
      throw new Error("Google OAuth is not configured.");
    }
    if (!authStatus.connected) {
      throw new Error(`Gmail account is not connected: ${accountLabel}`);
    }
    const missingScopes = requiredScopes.filter((scope) => !authStatus.tokenScope?.split(/\s+/).includes(scope));
    if (missingScopes.length > 0) {
      throw new Error(`Gmail account is missing required scopes: ${missingScopes.join(", ")}`);
    }
    const accessToken = await this.auth.getAccessToken(accountLabel, { allowLegacyFallback: false });
    if (!accessToken) {
      throw new Error(`Gmail access token is unavailable for ${accountLabel}`);
    }
    return accessToken;
  }

  private async listMessageIds(accessToken: string, query: string, maxMessages: number): Promise<string[]> {
    const ids: string[] = [];
    let pageToken: string | undefined;
    do {
      const url = new URL("https://gmail.googleapis.com/gmail/v1/users/me/messages");
      url.searchParams.set("q", query);
      url.searchParams.set("maxResults", String(Math.min(gmailSearchPageSize, Math.max(1, maxMessages - ids.length))));
      if (pageToken) {
        url.searchParams.set("pageToken", pageToken);
      }
      const response = await gmailFetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
      const json = await response.json().catch(() => ({})) as GmailListResponse;
      if (!response.ok) {
        throw new Error(json.error?.message ?? `Gmail messages.list failed with ${response.status}`);
      }
      ids.push(...(json.messages ?? []).flatMap((message) => message.id ? [message.id] : []));
      pageToken = json.nextPageToken;
    } while (pageToken && ids.length < maxMessages);
    return [...new Set(ids)].slice(0, maxMessages);
  }

  private async getMessage(accessToken: string, gmailMessageId: string): Promise<GmailApiMessage> {
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(gmailMessageId)}`);
    url.searchParams.set("format", "full");
    const response = await gmailFetch(url, { headers: { authorization: `Bearer ${accessToken}` } });
    const json = await response.json().catch(() => ({})) as GmailApiMessage;
    if (!response.ok) {
      throw new GmailMessageFetchError(json.error?.message ?? `Gmail messages.get failed with ${response.status}`, response.status);
    }
    return json;
  }

  private async verifyStoredMessages(mailbox: GmailMailbox, accessToken: string): Promise<number> {
    if (!this.repository) {
      return 0;
    }
    let marked = 0;
    for (const stored of this.repository.listStoredSyncedMessageRefs(mailbox.id, 100)) {
      try {
        await this.getMessage(accessToken, stored.gmailMessageId);
      } catch (error) {
        if (error instanceof GmailMessageFetchError && deletedStatuses.has(error.status)) {
          this.repository.markExternalDeleted(stored.id);
          marked += 1;
        } else {
          throw error;
        }
      }
    }
    return marked;
  }

  private async storeMessageById(mailbox: GmailMailbox, accessToken: string, gmailMessageId: string): Promise<void> {
    if (!this.repository) {
      return;
    }
    const apiMessage = await this.getMessage(accessToken, gmailMessageId);
    const parsed = parseGmailMessage(mailbox, apiMessage);
    const mailboxEmails = connectedMailboxEmails(this.repository.listMailboxes(), mailbox);
    const directContactEmails = eligibleDirectMailboxContactEmails(parsed, mailboxEmails);
    const matches = this.repository.matchesForEmails(directContactEmails);
    if (matches.length > 0) {
      this.repository.upsertMessage(parsed, matches);
    }
  }
}

class GmailMessageFetchError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

function parseGmailMessage(mailbox: GmailMailbox, message: GmailApiMessage): GmailMessageInput {
  if (!message.id) {
    throw new Error("Gmail message did not include an id.");
  }
  const headers = headersMap(message.payload);
  const from = parseAddressHeader(headers.get("from"));
  const to = parseAddressHeader(headers.get("to"));
  const cc = parseAddressHeader(headers.get("cc"));
  const bcc = parseAddressHeader(headers.get("bcc"));
  const body = extractBody(message.payload);
  const messageDate = normalizeMessageDate(headers.get("date"), message.internalDate);
  return {
    mailboxId: mailbox.id,
    gmailMessageId: message.id,
    gmailThreadId: message.threadId ?? null,
    historyId: message.historyId ?? null,
    labelIds: message.labelIds ?? [],
    direction: inferDirection(mailbox, from, [...to, ...cc, ...bcc]),
    messageDate,
    subject: headers.get("subject") ?? null,
    from,
    to,
    cc,
    bcc,
    plainBody: body.plainText,
    htmlBody: body.html,
    snippet: message.snippet ?? null,
    attachments: body.attachments
  };
}

function headersMap(part: GmailMessagePart | undefined): Map<string, string> {
  const headers = new Map<string, string>();
  for (const header of part?.headers ?? []) {
    if (header.name && header.value) {
      headers.set(header.name.toLowerCase(), header.value);
    }
  }
  return headers;
}

function parseAddressHeader(value: string | null | undefined): GmailAddress[] {
  if (!value) {
    return [];
  }
  return splitAddressHeader(value).flatMap((entry) => {
    const angleMatch = entry.match(/^(.*?)<([^>]+)>$/);
    const rawName = angleMatch ? angleMatch[1]?.trim().replace(/^"|"$/g, "") : null;
    const email = (angleMatch ? angleMatch[2] : entry).trim();
    const normalized = normalizeEmail(email);
    return normalized ? [{ name: rawName || null, email: normalized }] : [];
  });
}

function splitAddressHeader(value: string): string[] {
  const result: string[] = [];
  let current = "";
  let quoted = false;
  for (const char of value) {
    if (char === '"') quoted = !quoted;
    if (char === "," && !quoted) {
      if (current.trim()) result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  if (current.trim()) result.push(current.trim());
  return result;
}

function extractBody(part: GmailMessagePart | undefined): { plainText: string | null; html: string | null; attachments: GmailAttachmentMetadata[] } {
  let plainText: string | null = null;
  let html: string | null = null;
  const attachments: GmailAttachmentMetadata[] = [];
  const visit = (current: GmailMessagePart | undefined) => {
    if (!current) return;
    if (current.filename || current.body?.attachmentId) {
      attachments.push({
        gmailAttachmentId: current.body?.attachmentId ?? null,
        filename: current.filename || null,
        mimeType: current.mimeType ?? null,
        byteSize: current.body?.size ?? null,
        partId: current.partId ?? null
      });
    }
    if (current.body?.data && current.mimeType === "text/plain" && plainText === null) {
      plainText = decodeBase64Url(current.body.data);
    }
    if (current.body?.data && current.mimeType === "text/html" && html === null) {
      html = decodeBase64Url(current.body.data);
    }
    for (const child of current.parts ?? []) {
      visit(child);
    }
  };
  visit(part);
  return { plainText, html, attachments };
}

function decodeBase64Url(value: string): string {
  return Buffer.from(value.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

function normalizeMessageDate(dateHeader: string | null | undefined, internalDate: string | undefined): string {
  const headerDate = dateHeader ? new Date(dateHeader) : null;
  if (headerDate && !Number.isNaN(headerDate.getTime())) {
    return headerDate.toISOString();
  }
  const internalTimestamp = internalDate ? Number(internalDate) : NaN;
  if (!Number.isNaN(internalTimestamp)) {
    return new Date(internalTimestamp).toISOString();
  }
  return new Date().toISOString();
}

function inferDirection(mailbox: GmailMailbox, from: GmailAddress[], recipients: GmailAddress[]): GmailMessageDirection {
  const mailboxEmail = normalizeEmail(mailbox.emailAddress || mailbox.accountLabel);
  const fromSelf = from.some((address) => address.email === mailboxEmail);
  const toSelf = recipients.some((address) => address.email === mailboxEmail);
  if (fromSelf && toSelf) return "internal";
  if (fromSelf) return "outbound";
  if (toSelf) return "inbound";
  return "unknown";
}

export function eligibleDirectMailboxContactEmails(message: Pick<GmailMessageInput, "from" | "to" | "cc" | "bcc">, mailboxEmails: Set<string>): string[] {
  const fromEmails = message.from.map((address) => normalizeEmail(address.email)).filter(Boolean);
  const recipientEmails = [...message.to, ...message.cc, ...message.bcc].map((address) => normalizeEmail(address.email)).filter(Boolean);
  const fromMailbox = fromEmails.some((email) => mailboxEmails.has(email));
  const recipientHasMailbox = recipientEmails.some((email) => mailboxEmails.has(email));
  const directEmails = new Set<string>();
  if (recipientHasMailbox) {
    for (const email of fromEmails) {
      if (!mailboxEmails.has(email)) {
        directEmails.add(email);
      }
    }
  }
  if (fromMailbox) {
    for (const email of recipientEmails) {
      if (!mailboxEmails.has(email)) {
        directEmails.add(email);
      }
    }
  }
  return [...directEmails];
}

function connectedMailboxEmails(mailboxes: GmailMailbox[], currentMailbox: GmailMailbox): Set<string> {
  return new Set(
    [...mailboxes, currentMailbox]
      .flatMap((mailbox) => [mailbox.emailAddress, mailbox.accountLabel])
      .map(normalizeEmail)
      .filter(Boolean)
  );
}

function buildGmailContactQuery(emails: string[]): string {
  const terms = emails.slice(0, 80).map((email) => `{from:${email} to:${email} cc:${email} bcc:${email}}`);
  return terms.length === 1 ? terms[0] : `{${terms.join(" ")}}`;
}

function appendSignature(body: string, signature: string | null): string {
  return signature?.trim() ? `${body.trimEnd()}\n\n${signature.trim()}` : body;
}

function encodeRfc2822Message(input: { from: string; to: string[]; cc: string[]; bcc: string[]; subject: string; body: string }): string {
  const lines = [
    `From: ${input.from}`,
    `To: ${input.to.join(", ")}`,
    ...(input.cc.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    ...(input.bcc.length ? [`Bcc: ${input.bcc.join(", ")}`] : []),
    `Subject: ${encodeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: 8bit",
    "",
    input.body
  ];
  return Buffer.from(lines.join("\r\n"), "utf8").toString("base64url");
}

function encodeHeader(value: string): string {
  return /^[\x00-\x7F]*$/.test(value) ? value : `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

async function gmailFetch(input: string | URL, init?: RequestInit): Promise<Response> {
  return fetch(input, {
    ...init,
    signal: init?.signal ?? AbortSignal.timeout(gmailFetchTimeoutMs)
  });
}
