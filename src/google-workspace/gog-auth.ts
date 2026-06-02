import { spawnSync } from "node:child_process";
import { env } from "../config/env.js";
import type { StoredGoogleCalendarToken } from "../calendar/google-calendar-auth.js";

const googleWorkspaceGogServices = "drive,docs,sheets,slides,forms,sites";

export type GoogleWorkspaceAuthStatus = {
  gogInstalled: boolean;
  configured: boolean;
  connected: boolean;
  accounts: string[];
  detail: string | null;
};

type GogCommandResult = {
  ok: boolean;
  stdout: string;
  stderr: string;
  error?: string;
};

export class GoogleWorkspaceGogAuth {
  status(): GoogleWorkspaceAuthStatus {
    if (!this.gogInstalled()) {
      return {
        gogInstalled: false,
        configured: this.oauthConfigured(),
        connected: false,
        accounts: [],
        detail: "gogcli is not installed."
      };
    }

    const accountsResult = this.runGog(["auth", "list", "--json"]);
    const accounts = accountsResult.ok ? parseGogAccounts(accountsResult.stdout) : [];
    const configured = this.oauthConfigured();
    const detail = !this.oauthConfigured()
      ? "GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET are required."
      : accountsResult.ok
        ? null
        : accountsResult.error ?? (accountsResult.stderr || "gog auth status failed.");

    return {
      gogInstalled: true,
      configured,
      connected: accounts.length > 0,
      accounts,
      detail
    };
  }

  importRefreshToken(input: { accountLabel: string; token: StoredGoogleCalendarToken }): void {
    if (!input.token.refreshToken) {
      throw new Error("Google OAuth did not return a refresh token. Retry with consent.");
    }
    this.assertReady();
    this.storeOAuthCredentials();
    const imported = this.runGog(
      ["auth", "import", "--email", input.accountLabel, "--refresh-token-stdin", "--services", googleWorkspaceGogServices, "--force", "--json"],
      { input: input.token.refreshToken }
    );
    if (!imported.ok) {
      throw new Error(imported.error ?? (imported.stderr || "gog auth import failed."));
    }
  }

  disconnect(accountLabel: string): void {
    if (!this.gogInstalled()) {
      return;
    }
    this.runGog(["auth", "remove", accountLabel, "--json", "--no-input"]);
  }

  private storeOAuthCredentials(): void {
    const credentials = {
      web: {
        client_id: env.googleOAuthClientId,
        client_secret: env.googleOAuthClientSecret,
        redirect_uris: [env.googleOAuthRedirectUri ?? `http://localhost:${env.dmaxApiPort}/api/config/google-calendar/oauth/callback`]
      }
    };
    const result = this.runGog(["auth", "credentials", "set", "-", "--json"], {
      input: `${JSON.stringify(credentials)}\n`
    });
    if (!result.ok) {
      throw new Error(result.error ?? (result.stderr || "gog auth credentials set failed."));
    }
  }

  private assertReady(): void {
    if (!this.gogInstalled()) {
      throw new Error("gogcli is not installed.");
    }
    if (!this.oauthConfigured()) {
      throw new Error("Google OAuth is not configured. Set GOOGLE_OAUTH_CLIENT_ID and GOOGLE_OAUTH_CLIENT_SECRET.");
    }
  }

  private oauthConfigured(): boolean {
    return Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret);
  }

  private gogInstalled(): boolean {
    const result = spawnSync("gog", ["--version"], { encoding: "utf8" });
    return result.status === 0;
  }

  private runGog(args: string[], options: { input?: string } = {}): GogCommandResult {
    const result = spawnSync("gog", args, {
      encoding: "utf8",
      input: options.input,
      maxBuffer: 2 * 1024 * 1024
    });
    return {
      ok: result.status === 0,
      stdout: result.stdout ?? "",
      stderr: result.stderr ?? "",
      error: result.error?.message
    };
  }
}

function parseGogAccounts(stdout: string): string[] {
  try {
    const parsed = JSON.parse(stdout) as { accounts?: unknown };
    if (!Array.isArray(parsed.accounts)) {
      return [];
    }
    return parsed.accounts
      .flatMap((account) => {
        if (typeof account === "string") {
          return [account];
        }
        if (account && typeof account === "object" && "email" in account && typeof account.email === "string") {
          return [account.email];
        }
        return [];
      })
      .filter(Boolean)
      .sort((left, right) => left.localeCompare(right));
  } catch {
    return [];
  }
}
