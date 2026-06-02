import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const googleCalendarScope = "https://www.googleapis.com/auth/calendar";
const googleWorkspaceScopes = [
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/presentations",
  "https://www.googleapis.com/auth/forms.body",
  "https://www.googleapis.com/auth/forms.responses.readonly"
];
const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

export type StoredGoogleCalendarToken = {
  accessToken: string;
  refreshToken: string | null;
  expiresAt: number;
  scope: string | null;
  tokenType: string | null;
  updatedAt: string;
};

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

const pendingStates = new Map<string, { expiresAt: number; accountLabel: string | null; purpose: "calendar" | "workspace" }>();

export type GoogleCalendarAuthStatus = {
  configured: boolean;
  connected: boolean;
  tokenPath: string;
  redirectUri: string;
  scope: string;
  tokenScope: string | null;
  hasRequiredScope: boolean;
  detail: string | null;
};

export type GoogleCalendarAccountStatus = {
  accountLabel: string;
  status: GoogleCalendarAuthStatus;
};

export class GoogleCalendarAuth {
  status(accountLabel?: string | null): GoogleCalendarAuthStatus {
    const configured = Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret);
    const account = accountLabel?.trim() || null;
    const token = account ? this.readAccountToken(account) : this.readAnyToken();
    return {
      configured,
      connected: Boolean(token?.refreshToken || token?.accessToken),
      tokenPath: account ? accountTokenPath(account) : env.googleCalendarTokenPath,
      redirectUri: this.redirectUri(),
      scope: googleCalendarScope,
      tokenScope: token?.scope ?? null,
      hasRequiredScope: Boolean(token && tokenHasRequiredScope(token.scope)),
      detail: configured ? null : "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required."
    };
  }

  listAccountStatuses(accountLabels: string[] = []): GoogleCalendarAccountStatus[] {
    const accounts = new Set(accountLabels.map((accountLabel) => accountLabel.trim()).filter(Boolean));
    for (const accountLabel of this.listTokenAccountLabels()) {
      accounts.add(accountLabel);
    }
    return [...accounts]
      .sort((left, right) => left.localeCompare(right))
      .map((accountLabel) => ({ accountLabel, status: this.status(accountLabel) }));
  }

  createAuthorizationUrl(loginHint?: string | null): string {
    return this.createAuthorizationUrlForPurpose("calendar", loginHint);
  }

  createWorkspaceAuthorizationUrl(loginHint?: string | null): string {
    return this.createAuthorizationUrlForPurpose("workspace", loginHint);
  }

  private createAuthorizationUrlForPurpose(purpose: "calendar" | "workspace", loginHint?: string | null): string {
    this.assertConfigured();
    const state = randomBytes(20).toString("hex");
    const accountLabel = loginHint?.trim() || null;
    pendingStates.set(state, { expiresAt: Date.now() + 10 * 60_000, accountLabel, purpose });
    const url = new URL(authorizationEndpoint);
    url.searchParams.set("client_id", env.googleOAuthClientId!);
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", purpose === "workspace" ? googleWorkspaceScopes.join(" ") : googleCalendarScope);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    if (loginHint?.trim()) {
      url.searchParams.set("login_hint", loginHint.trim());
    }
    return url.toString();
  }

  async handleCallback(input: { code: string; state: string }): Promise<{ accountLabel: string | null; purpose: "calendar" | "workspace"; token: StoredGoogleCalendarToken }> {
    this.assertConfigured();
    const pendingState = pendingStates.get(input.state);
    pendingStates.delete(input.state);
    if (!pendingState || pendingState.expiresAt < Date.now()) {
      throw new Error("Invalid or expired Google OAuth state.");
    }

    const existing = pendingState.accountLabel ? this.readAccountToken(pendingState.accountLabel) : this.readToken();
    const token = await postToken({
      code: input.code,
      client_id: env.googleOAuthClientId!,
      client_secret: env.googleOAuthClientSecret!,
      redirect_uri: this.redirectUri(),
      grant_type: "authorization_code"
    });
    if (!token.access_token) {
      throw new Error(formatTokenError(token, "Google OAuth token exchange failed"));
    }
    const storedToken = {
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? existing?.refreshToken ?? null,
      expiresAt: Date.now() + Math.max(0, token.expires_in ?? 3600) * 1000,
      scope: token.scope ?? null,
      tokenType: token.token_type ?? null,
      updatedAt: new Date().toISOString()
    };
    if (pendingState.accountLabel) {
      this.writeAccountToken(pendingState.accountLabel, storedToken);
    } else {
      this.writeToken(storedToken);
    }
    return { accountLabel: pendingState.accountLabel, purpose: pendingState.purpose, token: storedToken };
  }

  async getAccessToken(accountLabel?: string | null, options: { allowLegacyFallback?: boolean } = {}): Promise<string | null> {
    this.assertConfigured();
    const account = accountLabel?.trim() || null;
    const allowLegacyFallback = options.allowLegacyFallback ?? true;
    const token = account ? this.readAccountToken(account) ?? (allowLegacyFallback ? this.readToken() : null) : this.readToken();
    if (!token) {
      return null;
    }
    if (token.accessToken && token.expiresAt > Date.now() + 60_000) {
      return token.accessToken;
    }
    if (!token.refreshToken) {
      return token.accessToken || null;
    }

    const refreshed = await postToken({
      client_id: env.googleOAuthClientId!,
      client_secret: env.googleOAuthClientSecret!,
      refresh_token: token.refreshToken,
      grant_type: "refresh_token"
    });
    if (!refreshed.access_token) {
      throw new Error(formatTokenError(refreshed, "Google OAuth token refresh failed"));
    }
    const next = {
      ...token,
      accessToken: refreshed.access_token,
      expiresAt: Date.now() + Math.max(0, refreshed.expires_in ?? 3600) * 1000,
      scope: refreshed.scope ?? token.scope,
      tokenType: refreshed.token_type ?? token.tokenType,
      updatedAt: new Date().toISOString()
    };
    if (account && this.readAccountToken(account)) {
      this.writeAccountToken(account, next);
    } else {
      this.writeToken(next);
    }
    return next.accessToken;
  }

  disconnect(accountLabel?: string | null): void {
    const account = accountLabel?.trim() || null;
    rmSync(account ? accountTokenPath(account) : env.googleCalendarTokenPath, { force: true });
  }

  redirectUri(): string {
    return env.googleOAuthRedirectUri?.trim() || `http://localhost:${env.dmaxApiPort}/api/config/google-calendar/oauth/callback`;
  }

  private readToken(): StoredGoogleCalendarToken | null {
    try {
      return JSON.parse(readFileSync(env.googleCalendarTokenPath, "utf8")) as StoredGoogleCalendarToken;
    } catch {
      return null;
    }
  }

  private readAccountToken(accountLabel: string): StoredGoogleCalendarToken | null {
    try {
      return JSON.parse(readFileSync(accountTokenPath(accountLabel), "utf8")) as StoredGoogleCalendarToken;
    } catch {
      return null;
    }
  }

  private readAnyToken(): StoredGoogleCalendarToken | null {
    const legacy = this.readToken();
    if (legacy) {
      return legacy;
    }
    try {
      const firstAccountToken = readdirSync(accountTokenDir())
        .filter((fileName) => fileName.endsWith(".json"))
        .sort()[0];
      return firstAccountToken
        ? JSON.parse(readFileSync(path.join(accountTokenDir(), firstAccountToken), "utf8")) as StoredGoogleCalendarToken
        : null;
    } catch {
      return null;
    }
  }

  private listTokenAccountLabels(): string[] {
    try {
      return readdirSync(accountTokenDir())
        .filter((fileName) => fileName.endsWith(".json"))
        .flatMap((fileName) => {
          try {
            return [Buffer.from(fileName.slice(0, -5), "base64url").toString("utf8")];
          } catch {
            return [];
          }
        })
        .filter(Boolean);
    } catch {
      return [];
    }
  }

  private writeToken(token: StoredGoogleCalendarToken): void {
    mkdirSync(path.dirname(env.googleCalendarTokenPath), { recursive: true });
    writeFileSync(env.googleCalendarTokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
  }

  private writeAccountToken(accountLabel: string, token: StoredGoogleCalendarToken): void {
    mkdirSync(accountTokenDir(), { recursive: true });
    writeFileSync(accountTokenPath(accountLabel), `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
  }

  private assertConfigured(): void {
    if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
      throw new Error("Google Calendar OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.");
    }
  }
}

function tokenHasRequiredScope(scope: string | null): boolean {
  return Boolean(scope?.split(/\s+/).includes(googleCalendarScope));
}

function accountTokenDir(): string {
  return `${env.googleCalendarTokenPath}.accounts`;
}

function accountTokenPath(accountLabel: string): string {
  return path.join(accountTokenDir(), `${Buffer.from(accountLabel.trim().toLowerCase()).toString("base64url")}.json`);
}

async function postToken(params: Record<string, string>): Promise<GoogleTokenResponse> {
  const response = await fetch(tokenEndpoint, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params)
  });
  const json = await response.json().catch(() => ({})) as GoogleTokenResponse;
  if (!response.ok) {
    return {
      ...json,
      error: json.error ?? `HTTP ${response.status}`
    };
  }
  return json;
}

function formatTokenError(response: GoogleTokenResponse, fallback: string): string {
  return response.error_description || response.error || fallback;
}
