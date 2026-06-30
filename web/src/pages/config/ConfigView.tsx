import { useEffect, useMemo, useState } from "react";
import { Clock, Plus, Send } from "lucide-react";
import {
  createCalendarSource,
  createGmailAuthUrl,
  createGoogleCalendarAuthUrl,
  createGoogleWorkspaceAuthUrl,
  disconnectGoogleCalendar,
  disconnectGoogleWorkspace,
  fetchCalendarSources,
  fetchGmailMailboxes,
  fetchGoogleCalendarAccounts,
  fetchGoogleCalendarAuthStatus,
  fetchGoogleCalendars,
  fetchGoogleWorkspaceAuthStatus,
  syncGmailMailbox,
  updateCalendarSource,
  updateGmailMailbox,
  upsertGmailMailbox
} from "../../api.js";
import { EmptyState, handleModalEscape } from "../../components/ui/index.js";
import type {
  CalendarSource,
  GmailMailboxWithStatus,
  GoogleCalendarAccountStatus,
  GoogleCalendarAuthStatus,
  GoogleCalendarListItem,
  GoogleWorkspaceAuthStatus
} from "../../types.js";

export function ConfigView() {
  const configUrlParams = new URLSearchParams(window.location.search);
  const initialGoogleAccountFromUrl = configUrlParams.get("account");
  const initialOAuthError = configUrlParams.get("google") === "error" || configUrlParams.get("workspace") === "error"
    ? configUrlParams.get("detail") || "Google OAuth konnte nicht abgeschlossen werden."
    : null;
  const initialGoogleAccount = initialGoogleAccountFromUrl || "dw@b42.io";
  const [sources, setSources] = useState<CalendarSource[]>([]);
  const [accounts, setAccounts] = useState<GoogleCalendarAccountStatus[]>([]);
  const [globalStatus, setGlobalStatus] = useState<GoogleCalendarAuthStatus | null>(null);
  const [workspaceStatus, setWorkspaceStatus] = useState<GoogleWorkspaceAuthStatus | null>(null);
  const [gmailMailboxes, setGmailMailboxes] = useState<GmailMailboxWithStatus[]>([]);
  const [accountCalendars, setAccountCalendars] = useState<Record<string, { loading: boolean; calendars: GoogleCalendarListItem[]; error: string | null }>>({});
  const [newAccountLabel, setNewAccountLabel] = useState(initialGoogleAccount);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const [manualSourceDraft, setManualSourceDraft] = useState({ calendarId: "", displayName: "", color: "#27806f" });
  const [error, setError] = useState<string | null>(initialOAuthError);
  const activeSources = sources.filter((source) => source.enabled);
  const knownAccountLabels = useMemo(() => {
    const labels = new Set(accounts.map((account) => account.accountLabel));
    for (const source of sources) {
      labels.add(source.accountLabel);
    }
    if (newAccountLabel.trim()) {
      labels.add(newAccountLabel.trim());
    }
    return [...labels].sort((left, right) => left.localeCompare(right));
  }, [accounts, newAccountLabel, sources]);

  async function loadConfig() {
    const [nextSources, nextAccounts, nextGlobalStatus, nextWorkspaceStatus, nextGmailMailboxes] = await Promise.all([
      fetchCalendarSources(),
      fetchGoogleCalendarAccounts(),
      fetchGoogleCalendarAuthStatus(),
      fetchGoogleWorkspaceAuthStatus(),
      fetchGmailMailboxes()
    ]);
    setSources(nextSources);
    setAccounts(nextAccounts);
    setGlobalStatus(nextGlobalStatus);
    setWorkspaceStatus(nextWorkspaceStatus);
    setGmailMailboxes(nextGmailMailboxes);
    await Promise.all(nextAccounts.filter((account) => account.status.connected).map((account) => loadAccountCalendars(account.accountLabel)));
  }

  async function loadAccountCalendars(accountLabel: string) {
    setAccountCalendars((current) => ({
      ...current,
      [accountLabel]: { loading: true, calendars: current[accountLabel]?.calendars ?? [], error: null }
    }));
    try {
      const calendars = await fetchGoogleCalendars(accountLabel);
      setAccountCalendars((current) => ({
        ...current,
        [accountLabel]: { loading: false, calendars, error: null }
      }));
    } catch (err) {
      setAccountCalendars((current) => ({
        ...current,
        [accountLabel]: {
          loading: false,
          calendars: current[accountLabel]?.calendars ?? [],
          error: err instanceof Error ? err.message : "Google Kalender konnten nicht geladen werden."
        }
      }));
    }
  }

  async function connectAccount(accountLabel: string) {
    try {
      setError(null);
      const authUrl = await createGoogleCalendarAuthUrl({ loginHint: accountLabel.trim() });
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google OAuth konnte nicht gestartet werden.");
    }
  }

  async function connectWorkspaceAccount(accountLabel: string) {
    try {
      setError(null);
      const authUrl = await createGoogleWorkspaceAuthUrl({ loginHint: accountLabel.trim() });
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google Workspace OAuth konnte nicht gestartet werden.");
    }
  }

  async function connectGmailAccount(accountLabel: string) {
    try {
      setError(null);
      await upsertGmailMailbox({ accountLabel: accountLabel.trim(), displayName: accountLabel.trim(), emailAddress: accountLabel.trim(), enabled: true, syncEnabled: true });
      const authUrl = await createGmailAuthUrl({ loginHint: accountLabel.trim() });
      window.location.href = authUrl;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Gmail OAuth konnte nicht gestartet werden.");
    }
  }

  async function toggleCalendarSource(accountLabel: string, calendar: GoogleCalendarListItem, enabled: boolean) {
    const existing = sources.find((source) => source.provider === "google" && source.accountLabel === accountLabel && source.calendarId === calendar.id);
    if (existing) {
      await updateCalendarSource(existing.id, {
        enabled,
        displayName: calendar.summary,
        color: normalizeGoogleColor(calendar.backgroundColor),
        readOnly: calendar.readOnly
      });
    } else if (enabled) {
      const reusableSource = sources.find((source) => source.provider === "google" && source.calendarId === calendar.id && !source.enabled);
      const sourceInput = {
        accountLabel,
        calendarId: calendar.id,
        displayName: calendar.summary,
        color: normalizeGoogleColor(calendar.backgroundColor),
        enabled: true,
        readOnly: calendar.readOnly
      };
      if (reusableSource) {
        await updateCalendarSource(reusableSource.id, sourceInput);
      } else {
        await createCalendarSource(sourceInput);
      }
    }
    await loadConfig();
  }

  useEffect(() => {
    loadConfig().catch((err: unknown) => setError(err instanceof Error ? err.message : "Calendar sources konnten nicht geladen werden."));
  }, []);

  return (
    <section className="config-layout">
      {error ? <div className="error-banner">{error}</div> : null}
      <div className="config-section">
        <div className="config-section-header">
          <div>
            <h2>Google Kalenderquellen</h2>
            <p>Verbinde Google-Konten und waehle pro Konto aus, welche Kalender DMAX lesen und schreiben darf.</p>
          </div>
        </div>
        {globalStatus && !globalStatus.configured ? (
          <div className="config-hint">
            Setze `GOOGLE_OAUTH_CLIENT_ID` und `GOOGLE_OAUTH_CLIENT_SECRET`. Authorized redirect URI in Google:
            <code>{globalStatus.redirectUri}</code>
          </div>
        ) : null}

        <div className="google-connect-action">
          <button className="primary-action compact" type="button" disabled={!globalStatus?.configured} onClick={() => setAddAccountOpen(true)}>
            <Clock size={16} />
            Google-Konto hinzufuegen
          </button>
        </div>

        {addAccountOpen ? (
          <div className="modal-backdrop" role="presentation" onMouseDown={() => setAddAccountOpen(false)}>
            <form
              className="compact-modal"
              onMouseDown={(mouseEvent) => mouseEvent.stopPropagation()}
              onKeyDown={(event) => handleModalEscape(event, () => setAddAccountOpen(false))}
              onSubmit={(event) => {
                event.preventDefault();
                if (newAccountLabel.trim()) {
                  void connectAccount(newAccountLabel);
                }
              }}
            >
              <h3>Google-Konto hinzufuegen</h3>
              <label className="config-field">
                <span>Google-Konto</span>
                <input
                  list="google-account-options"
                  value={newAccountLabel}
                  onChange={(event) => setNewAccountLabel(event.target.value)}
                  placeholder="name@gmail.com"
                  autoFocus
                />
                <datalist id="google-account-options">
                  {knownAccountLabels.map((accountLabel) => <option key={accountLabel} value={accountLabel} />)}
                </datalist>
              </label>
              <div className="modal-actions">
                <button className="primary-action compact" type="submit" disabled={!globalStatus?.configured || !newAccountLabel.trim()}>
                  <Clock size={16} />
                  OAuth starten
                </button>
                <button className="secondary-action compact" type="button" onClick={() => setAddAccountOpen(false)}>Abbrechen</button>
              </div>
            </form>
          </div>
        ) : null}

        <section className="config-subsection">
          <div className="config-subsection-title">
            <strong>Verbundene Google-Konten</strong>
            <span>{accounts.length} Konten</span>
          </div>
          {accounts.length === 0 ? <EmptyState title="Noch kein Google-Konto verbunden" /> : null}
          <div className="google-account-card-list">
            {accounts.map((account) => {
              const calendarsState = accountCalendars[account.accountLabel] ?? { loading: false, calendars: [], error: null };
              const accountSources = sources.filter((source) => source.accountLabel === account.accountLabel);
              return (
                <article className="google-account-card" key={account.accountLabel}>
                  <header className="google-account-card-header">
                    <div>
                      <strong>
                        {account.accountLabel}{" "}
                        <span className={`google-account-heading-status ${account.status.connected ? "connected" : "disconnected"}`}>
                          ({account.status.connected ? "verbunden" : "getrennt"})
                        </span>
                      </strong>
                      <span>{accountSources.filter((source) => source.enabled).length} aktive Kalenderquellen</span>
                    </div>
                    <div className="google-auth-actions">
                      {account.status.connected ? (
                        <>
                          <button className="secondary-action compact" type="button" onClick={() => void loadAccountCalendars(account.accountLabel)}>
                            Kalender neu laden
                          </button>
                          <button
                            className="secondary-action compact"
                            type="button"
                            onClick={async () => {
                              await disconnectGoogleCalendar(account.accountLabel);
                              await loadConfig();
                            }}
                          >
                            Konto trennen
                          </button>
                        </>
                      ) : (
                        <button className="primary-action compact" type="button" onClick={() => void connectAccount(account.accountLabel)}>
                          Erneut verbinden
                        </button>
                      )}
                    </div>
                  </header>
                  {account.status.connected && !account.status.hasRequiredScope ? (
                    <div className="config-hint warning">
                      Dieses Konto nutzt noch einen alten read-only Token. Trenne es und verbinde es erneut, um Schreibzugriff zu aktivieren.
                    </div>
                  ) : null}
                  {!account.status.connected ? (
                    <div className="config-hint">
                      Dieses Konto ist in DMAX bekannt, aber aktuell nicht per OAuth verbunden. Bestehende Quellen bleiben sichtbar, koennen aber erst nach dem erneuten Verbinden live geladen werden.
                    </div>
                  ) : null}
                  {calendarsState.error ? <div className="error-banner">{calendarsState.error}</div> : null}
                  {account.status.connected ? (
                    <div className="google-calendar-picker">
                      {calendarsState.loading ? <span className="muted-inline">Kalender werden geladen...</span> : null}
                      {!calendarsState.loading && calendarsState.calendars.length === 0 ? <span className="muted-inline">Keine Kalender geladen.</span> : null}
                      {calendarsState.calendars.map((calendar) => {
                        const source = accountSources.find((candidate) => candidate.calendarId === calendar.id) ?? null;
                        const active = Boolean(source?.enabled);
                        return (
                          <article key={calendar.id} className="google-calendar-choice">
                            <span className="calendar-category-dot" style={{ background: calendar.backgroundColor ?? "#5167b8" }} />
                            <div>
                              <strong>{calendar.summary}</strong>
                              <span>{calendar.primary ? "primary · " : ""}{calendar.accessRole ?? "unknown"} · {calendar.id}</span>
                            </div>
                            <button
                              className={active ? "secondary-action compact" : "primary-action compact"}
                              type="button"
                              onClick={() => void toggleCalendarSource(account.accountLabel, calendar, !active)}
                            >
                              {active ? "Aus DMAX entfernen" : "In DMAX hinzufuegen"}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>

        <section className="config-subsection">
          <div className="config-subsection-title">
            <strong>DMAX-Kalenderquellen</strong>
            <span>{activeSources.length} aktive Quellen</span>
          </div>
          <div className="config-hint">
            DMAX-Kalenderquellen sind die gespeicherte Auswahl, welche Google-Kalender DMAX im Kalender anzeigen und fuer Sync/Schreiben verwenden soll. Ein verbundenes Google-Konto kann viele Kalender haben; erst eine aktive DMAX-Quelle macht einen Kalender in DMAX sichtbar.
          </div>
        <form
          className="config-source-form"
          onSubmit={async (event) => {
            event.preventDefault();
            try {
              setError(null);
              await createCalendarSource({
                accountLabel: newAccountLabel.trim(),
                calendarId: manualSourceDraft.calendarId,
                displayName: manualSourceDraft.displayName || manualSourceDraft.calendarId,
                color: manualSourceDraft.color || null,
                enabled: true,
                readOnly: true
              });
              setManualSourceDraft({ calendarId: "", displayName: "", color: "#27806f" });
              await loadConfig();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Calendar source konnte nicht gespeichert werden.");
            }
          }}
        >
          <div className="config-subsection-title config-source-form-title">
            <strong>Manuelle Quelle</strong>
            <span>{newAccountLabel.trim()}</span>
          </div>
          <input value={manualSourceDraft.calendarId} onChange={(event) => setManualSourceDraft((current) => ({ ...current, calendarId: event.target.value }))} placeholder="Google Calendar ID" />
          <input value={manualSourceDraft.displayName} onChange={(event) => setManualSourceDraft((current) => ({ ...current, displayName: event.target.value }))} placeholder="Anzeigename" />
          <input className="color-input" value={manualSourceDraft.color} onChange={(event) => setManualSourceDraft((current) => ({ ...current, color: event.target.value }))} placeholder="#27806f" />
          <button className="primary-action compact" type="submit" disabled={!newAccountLabel.trim() || !manualSourceDraft.calendarId.trim()}>
            <Plus size={16} />
            Quelle
          </button>
        </form>

        <div className="config-source-list">
          {activeSources.length === 0 ? <EmptyState title="Noch keine aktiven Kalenderquellen" /> : null}
          {activeSources.map((source) => (
            <article className="config-source-row" key={source.id}>
              <span className="calendar-category-dot" style={{ background: source.color ?? "#27806f" }} />
              <div>
                <strong>{source.displayName}</strong>
                <span>{source.accountLabel} · {source.calendarId}</span>
              </div>
              <label>
                <input
                  type="checkbox"
                  checked={source.enabled}
                  onChange={async (event) => {
                    await updateCalendarSource(source.id, { enabled: event.target.checked });
                    await loadConfig();
                  }}
                />
                Aktiv
              </label>
              <label>
                <input
                  type="checkbox"
                  checked={!source.readOnly}
                  onChange={async (event) => {
                    await updateCalendarSource(source.id, { readOnly: !event.target.checked });
                    await loadConfig();
                  }}
                />
                Schreiben
              </label>
              <span className="readonly-pill">{source.readOnly ? "read-only" : "write"}</span>
            </article>
          ))}
        </div>
        </section>
      </div>

      <div className="config-section">
        <div className="config-section-header">
          <div>
            <h2>Gmail-Postfächer</h2>
            <p>Zentrale Postfächer fuer E-Mail-Verlauf, Plain-Text-Drafts und bestaetigten Versand.</p>
          </div>
        </div>
        {globalStatus && !globalStatus.configured ? (
          <div className="config-hint">
            Setze `GOOGLE_OAUTH_CLIENT_ID` und `GOOGLE_OAUTH_CLIENT_SECRET`. Authorized redirect URI in Google:
            <code>{globalStatus.redirectUri}</code>
          </div>
        ) : null}
        <label className="config-field">
          <span>Gmail-Konto</span>
          <input
            list="google-account-options"
            value={newAccountLabel}
            onChange={(event) => setNewAccountLabel(event.target.value)}
            placeholder="name@gmail.com"
          />
        </label>
        <div className="google-connect-action">
          <button className="primary-action compact" type="button" disabled={!globalStatus?.configured || !newAccountLabel.trim()} onClick={() => void connectGmailAccount(newAccountLabel)}>
            <Send size={16} />
            Gmail-Postfach verbinden
          </button>
        </div>
        <section className="config-subsection">
          <div className="config-subsection-title">
            <strong>Verbundene Gmail-Postfächer</strong>
            <span>{gmailMailboxes.length} Postfächer</span>
          </div>
          {gmailMailboxes.length === 0 ? <EmptyState title="Noch kein Gmail-Postfach verbunden" /> : null}
          <div className="config-source-list">
            {gmailMailboxes.map((mailbox) => (
              <article className="config-source-row gmail-mailbox-row" key={mailbox.id}>
                <span className="calendar-category-dot" style={{ background: mailbox.authStatus.connected ? "#27806f" : "#9b5d42" }} />
                <div>
                  <strong>{mailbox.displayName}</strong>
                  <span>{mailbox.accountLabel} · {mailbox.authStatus.connected ? "OAuth verbunden" : "OAuth fehlt"}</span>
                  {mailbox.lastSyncError ? <span className="inline-error">{mailbox.lastSyncError}</span> : null}
                </div>
                <label>
                  <input
                    type="checkbox"
                    checked={mailbox.syncEnabled}
                    onChange={async (event) => {
                      await updateGmailMailbox(mailbox.id, { syncEnabled: event.target.checked });
                      await loadConfig();
                    }}
                  />
                  Sync
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={mailbox.sendEnabled}
                    onChange={async (event) => {
                      await updateGmailMailbox(mailbox.id, { sendEnabled: event.target.checked });
                      await loadConfig();
                    }}
                  />
                  Senden
                </label>
                <button className="secondary-action compact" type="button" disabled={!mailbox.authStatus.connected || !mailbox.syncEnabled} onClick={async () => {
                  await syncGmailMailbox(mailbox.id);
                  await loadConfig();
                }}>
                  Sync
                </button>
                <button className="secondary-action compact" type="button" onClick={() => void connectGmailAccount(mailbox.accountLabel)}>
                  OAuth
                </button>
                {!mailbox.authStatus.hasRequiredScope && mailbox.authStatus.connected ? (
                  <span className="readonly-pill">Scopes fehlen</span>
                ) : null}
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className="config-section">
        <div className="config-section-header">
          <div>
            <h2>Google Workspace fuer DMAX Agent</h2>
            <p>Verbindet Google Drive, Docs, Tabellen, Praesentationen, Formulare und Sites fuer den OpenClaw-Subagenten. Die Anmeldung importiert den OAuth-Refresh-Token in gogcli.</p>
          </div>
        </div>
        {workspaceStatus && !workspaceStatus.gogInstalled ? (
          <div className="config-hint warning">gogcli ist lokal nicht installiert. Installiere `gogcli`, bevor der Agent Google Sheets nutzen kann.</div>
        ) : null}
        {workspaceStatus && !workspaceStatus.configured ? (
          <div className="config-hint">
            Setze `GOOGLE_OAUTH_CLIENT_ID` und `GOOGLE_OAUTH_CLIENT_SECRET`. Authorized redirect URI in Google:
            <code>{globalStatus?.redirectUri ?? `http://localhost:3088/api/config/google-calendar/oauth/callback`}</code>
          </div>
        ) : null}
        <div className="google-connect-action">
          <button className="primary-action compact" type="button" disabled={!workspaceStatus?.gogInstalled || !globalStatus?.configured || !newAccountLabel.trim()} onClick={() => void connectWorkspaceAccount(newAccountLabel)}>
            <Clock size={16} />
            Google Workspace verbinden
          </button>
        </div>
        <section className="config-subsection">
          <div className="config-subsection-title">
            <strong>gogcli Status</strong>
            <span>{workspaceStatus?.connected ? "verbunden" : "nicht verbunden"}</span>
          </div>
          {workspaceStatus?.detail ? <div className="config-hint">{workspaceStatus.detail}</div> : null}
          <div className="config-source-list">
            {!workspaceStatus?.accounts.length ? <EmptyState title="Noch kein Workspace-Konto verbunden" /> : null}
            {workspaceStatus?.accounts.map((accountLabel) => (
              <article className="config-source-row" key={accountLabel}>
                <span className="calendar-category-dot" style={{ background: "#5167b8" }} />
                <div>
                  <strong>{accountLabel}</strong>
                  <span>Google Workspace Dateien via gogcli</span>
                </div>
                <span className="readonly-pill">drive + docs + sheets + slides + forms + sites</span>
                <button
                  className="secondary-action compact"
                  type="button"
                  onClick={async () => {
                    await disconnectGoogleWorkspace(accountLabel);
                    await loadConfig();
                  }}
                >
                  Trennen
                </button>
              </article>
            ))}
          </div>
        </section>
      </div>
    </section>
  );
}

function normalizeGoogleColor(color: string | null): string | null {
  if (!color) return null;
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}
