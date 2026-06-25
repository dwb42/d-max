import { afterEach, describe, expect, it, vi } from "vitest";
import { GmailProvider, eligibleDirectMailboxContactEmails } from "../../src/gmail/gmail-provider.js";
import type { GoogleCalendarAuth } from "../../src/calendar/google-calendar-auth.js";
import { GmailRepository } from "../../src/gmail/gmail-repository.js";
import type { GmailMailbox } from "../../src/gmail/gmail-repository.js";
import { PartyContactPointRepository, PersonRepository } from "../../src/repositories/parties.js";
import { createTestDatabase } from "../helpers/test-db.js";

describe("GmailProvider", () => {
  const dbs: Array<{ close: () => void }> = [];

  afterEach(() => {
    vi.unstubAllGlobals();
    for (const db of dbs.splice(0)) {
      db.close();
    }
  });

  it("creates a plain-text Gmail draft and only sends an existing draft through drafts.send", async () => {
    const auth = {
      gmailStatus: () => ({
        configured: true,
        connected: true,
        tokenPath: "token.json",
        redirectUri: "http://localhost/callback",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
        tokenScope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
        hasRequiredScope: true,
        missingScopes: [],
        detail: null
      }),
      getAccessToken: vi.fn(async () => "access-token")
    } as unknown as GoogleCalendarAuth;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/drafts")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as { message?: { raw?: string } };
        expect(body.message?.raw).toBeTruthy();
        const decoded = Buffer.from(body.message!.raw!, "base64url").toString("utf8");
        expect(decoded).toContain("Content-Type: text/plain; charset=UTF-8");
        expect(decoded).toContain("Subject: Test");
        expect(decoded).toContain("Hello");
        expect(decoded).toContain("Signature");
        return jsonResponse({ id: "draft-1", message: { id: "msg-1" } });
      }
      if (url.endsWith("/drafts/send")) {
        expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({ id: "draft-1" });
        return jsonResponse({ id: "sent-1", threadId: "thread-1" });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GmailProvider(auth);
    const mailbox: GmailMailbox = {
      id: 1,
      accountLabel: "central@example.com",
      displayName: "Central",
      emailAddress: "central@example.com",
      enabled: true,
      syncEnabled: true,
      sendEnabled: true,
      signature: "Signature",
      lastSyncAt: null,
      lastSyncError: null,
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z"
    };

    const draft = await provider.createDraft(mailbox, { to: ["ada@example.com"], subject: "Test", body: "Hello" });
    const sent = await provider.sendDraft(mailbox, draft.id);

    expect(draft).toEqual({ id: "draft-1", messageId: "msg-1" });
    expect(sent).toEqual({ id: "sent-1", threadId: "thread-1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("stores and links a sent draft immediately so the party timeline updates without waiting for search sync", async () => {
    const db = createTestDatabase();
    dbs.push(db);
    const person = new PersonRepository(db).create({ firstName: "Ada", lastName: "Lovelace" });
    new PartyContactPointRepository(db).create({ partyId: person.id, type: "email", value: "ada@example.com" });
    const gmail = new GmailRepository(db);
    const mailbox = gmail.upsertMailbox({
      accountLabel: "central@example.com",
      emailAddress: "central@example.com",
      sendEnabled: true
    });
    const auth = {
      gmailStatus: () => ({
        configured: true,
        connected: true,
        tokenPath: "token.json",
        redirectUri: "http://localhost/callback",
        scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.compose"],
        tokenScope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose",
        hasRequiredScope: true,
        missingScopes: [],
        detail: null
      }),
      getAccessToken: vi.fn(async () => "access-token")
    } as unknown as GoogleCalendarAuth;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/drafts/send")) {
        expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({ id: "draft-1" });
        return jsonResponse({ id: "sent-1", threadId: "thread-1" });
      }
      if (url.includes("/messages/sent-1")) {
        return jsonResponse({
          id: "sent-1",
          threadId: "thread-1",
          historyId: "20",
          labelIds: ["SENT"],
          internalDate: "1782410400000",
          snippet: "Reply body",
          payload: {
            headers: [
              { name: "From", value: "Central <central@example.com>" },
              { name: "To", value: "Ada <ada@example.com>" },
              { name: "Subject", value: "Re: test von dmax" },
              { name: "Date", value: "Thu, 25 Jun 2026 23:20:00 +0200" }
            ],
            mimeType: "text/plain",
            body: { data: Buffer.from("Reply body", "utf8").toString("base64url"), size: 10 }
          }
        });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const sent = await new GmailProvider(auth, gmail).sendDraft(mailbox, "draft-1");
    const messages = gmail.listMessagesForParty(person.id);

    expect(sent).toEqual({ id: "sent-1", threadId: "thread-1" });
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      gmailMessageId: "sent-1",
      subject: "Re: test von dmax",
      direction: "outbound",
      plainBody: "Reply body"
    });
    expect(messages[0]?.partyLinks).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("only links party emails when the other side is a connected DMAX mailbox", () => {
    const mailboxes = new Set(["dw@b42.io", "wedegaertner@gmail.com"]);
    expect(eligibleDirectMailboxContactEmails({
      from: [{ name: "Hostinger", email: "team@info.hostinger.com" }],
      to: [{ name: null, email: "glueck.in.hamburg@gmail.com" }],
      cc: [],
      bcc: []
    }, mailboxes)).toEqual([]);
    expect(eligibleDirectMailboxContactEmails({
      from: [{ name: null, email: "glueck.in.hamburg@gmail.com" }],
      to: [{ name: null, email: "dw@b42.io" }],
      cc: [],
      bcc: []
    }, mailboxes)).toEqual(["glueck.in.hamburg@gmail.com"]);
    expect(eligibleDirectMailboxContactEmails({
      from: [{ name: null, email: "wedegaertner@gmail.com" }],
      to: [{ name: null, email: "glueck.in.hamburg@gmail.com" }],
      cc: [],
      bcc: []
    }, mailboxes)).toEqual(["glueck.in.hamburg@gmail.com"]);
  });

  it("archives and trashes messages through Gmail modify endpoints", async () => {
    const auth = {
      gmailStatus: () => ({
        configured: true,
        connected: true,
        tokenPath: "token.json",
        redirectUri: "http://localhost/callback",
        scopes: [
          "https://www.googleapis.com/auth/gmail.readonly",
          "https://www.googleapis.com/auth/gmail.compose",
          "https://www.googleapis.com/auth/gmail.modify"
        ],
        tokenScope: "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.compose https://www.googleapis.com/auth/gmail.modify",
        hasRequiredScope: true,
        missingScopes: [],
        detail: null
      }),
      getAccessToken: vi.fn(async () => "access-token")
    } as unknown as GoogleCalendarAuth;
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/messages/msg-1/modify")) {
        expect(init?.method).toBe("POST");
        expect(JSON.parse(String(init?.body ?? "{}"))).toEqual({ removeLabelIds: ["INBOX"] });
        return jsonResponse({ id: "msg-1", labelIds: ["CATEGORY_PERSONAL"] });
      }
      if (url.endsWith("/messages/msg-1/trash")) {
        expect(init?.method).toBe("POST");
        return jsonResponse({ id: "msg-1", labelIds: ["TRASH"] });
      }
      throw new Error(`Unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    const provider = new GmailProvider(auth);
    const mailbox: GmailMailbox = {
      id: 1,
      accountLabel: "central@example.com",
      displayName: "Central",
      emailAddress: "central@example.com",
      enabled: true,
      syncEnabled: true,
      sendEnabled: true,
      signature: null,
      lastSyncAt: null,
      lastSyncError: null,
      createdAt: "2026-06-25T00:00:00.000Z",
      updatedAt: "2026-06-25T00:00:00.000Z"
    };

    await expect(provider.archiveMessage(mailbox, "msg-1")).resolves.toEqual({ id: "msg-1", labelIds: ["CATEGORY_PERSONAL"] });
    await expect(provider.trashMessage(mailbox, "msg-1")).resolves.toEqual({ id: "msg-1", labelIds: ["TRASH"] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}
