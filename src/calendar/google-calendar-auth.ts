import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { randomBytes } from "node:crypto";
import { env } from "../config/env.js";

const googleCalendarScope = "https://www.googleapis.com/auth/calendar.readonly";
const authorizationEndpoint = "https://accounts.google.com/o/oauth2/v2/auth";
const tokenEndpoint = "https://oauth2.googleapis.com/token";

type StoredGoogleCalendarToken = {
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

const pendingStates = new Map<string, number>();

export type GoogleCalendarAuthStatus = {
  configured: boolean;
  connected: boolean;
  tokenPath: string;
  redirectUri: string;
  scope: string;
  detail: string | null;
};

export class GoogleCalendarAuth {
  status(): GoogleCalendarAuthStatus {
    const configured = Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret);
    const token = this.readToken();
    return {
      configured,
      connected: Boolean(token?.refreshToken || token?.accessToken),
      tokenPath: env.googleCalendarTokenPath,
      redirectUri: this.redirectUri(),
      scope: googleCalendarScope,
      detail: configured ? null : "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required."
    };
  }

  createAuthorizationUrl(loginHint?: string | null): string {
    this.assertConfigured();
    const state = randomBytes(20).toString("hex");
    pendingStates.set(state, Date.now() + 10 * 60_000);
    const url = new URL(authorizationEndpoint);
    url.searchParams.set("client_id", env.googleOAuthClientId!);
    url.searchParams.set("redirect_uri", this.redirectUri());
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", googleCalendarScope);
    url.searchParams.set("access_type", "offline");
    url.searchParams.set("include_granted_scopes", "true");
    url.searchParams.set("prompt", "consent");
    url.searchParams.set("state", state);
    if (loginHint?.trim()) {
      url.searchParams.set("login_hint", loginHint.trim());
    }
    return url.toString();
  }

  async handleCallback(input: { code: string; state: string }): Promise<void> {
    this.assertConfigured();
    const expiresAt = pendingStates.get(input.state);
    pendingStates.delete(input.state);
    if (!expiresAt || expiresAt < Date.now()) {
      throw new Error("Invalid or expired Google OAuth state.");
    }

    const existing = this.readToken();
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
    this.writeToken({
      accessToken: token.access_token,
      refreshToken: token.refresh_token ?? existing?.refreshToken ?? null,
      expiresAt: Date.now() + Math.max(0, token.expires_in ?? 3600) * 1000,
      scope: token.scope ?? null,
      tokenType: token.token_type ?? null,
      updatedAt: new Date().toISOString()
    });
  }

  async getAccessToken(): Promise<string | null> {
    this.assertConfigured();
    const token = this.readToken();
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
    this.writeToken(next);
    return next.accessToken;
  }

  disconnect(): void {
    rmSync(env.googleCalendarTokenPath, { force: true });
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

  private writeToken(token: StoredGoogleCalendarToken): void {
    mkdirSync(path.dirname(env.googleCalendarTokenPath), { recursive: true });
    writeFileSync(env.googleCalendarTokenPath, `${JSON.stringify(token, null, 2)}\n`, { mode: 0o600 });
  }

  private assertConfigured(): void {
    if (!env.googleOAuthClientId || !env.googleOAuthClientSecret) {
      throw new Error("Google Calendar OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.");
    }
  }
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
