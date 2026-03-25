import { type Logger } from "../logger";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { RedditApiError, RedditRateLimitError } from "./errors";

/**
 * Reddit OAuth helper for "script" apps.
 *
 * Uses the password grant to obtain a bearer token, caches it in memory, and
 * refreshes it when it's close to expiry.
 */

export type RedditAuthConfig = {
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
  userAgent: string;
  requestTimeoutMs: number;
};

type TokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
};

export class RedditAuth {
  private accessToken?: string;
  private expiresAtMs = 0;
  private inFlight?: Promise<string>;

  constructor(
    private readonly config: RedditAuthConfig,
    private readonly logger: Logger,
  ) {}

  public async getAccessToken(signal?: AbortSignal): Promise<string> {
    // Reuse token until 60s before expiry to avoid edge-of-expiration failures.
    const now = Date.now();
    if (this.accessToken && now < this.expiresAtMs - 60_000) {
      return this.accessToken;
    }

    if (!this.inFlight) {
      this.inFlight = this.refresh(signal).finally(() => {
        this.inFlight = undefined;
      });
    }

    return await this.inFlight;
  }

  private async refresh(signal?: AbortSignal): Promise<string> {
    const url = "https://www.reddit.com/api/v1/access_token";

    const auth = Buffer.from(`${this.config.clientId}:${this.config.clientSecret}`).toString(
      "base64",
    );

    const body = new URLSearchParams({
      grant_type: "password",
      username: this.config.username,
      password: this.config.password,
    });

    const res = await fetchWithTimeout(
      url,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "User-Agent": this.config.userAgent,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body,
        signal,
      },
      this.config.requestTimeoutMs,
    );

    if (res.status === 429) {
      const retryAfterSeconds = Number.parseInt(res.headers.get("retry-after") ?? "1", 10);
      const retryAfterMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 1_000;
      throw new RedditRateLimitError("Rate limited while requesting token", {
        retryAfterMs,
        url,
      });
    }

    let payload: TokenResponse | undefined;
    try {
      payload = (await res.json()) as TokenResponse;
    } catch {
      payload = undefined;
    }

    if (!res.ok) {
      throw new RedditApiError(`Token request failed with HTTP ${res.status}`, {
        status: res.status,
        url,
        responseBody: payload,
      });
    }

    if (!payload?.access_token || typeof payload.access_token !== "string") {
      throw new RedditApiError("Token response missing access_token", {
        status: res.status,
        url,
        responseBody: payload,
      });
    }

    const expiresInSeconds =
      typeof payload.expires_in === "number" && Number.isFinite(payload.expires_in)
        ? payload.expires_in
        : 3600;

    this.accessToken = payload.access_token;
    this.expiresAtMs = Date.now() + expiresInSeconds * 1000;

    this.logger.info("Obtained Reddit access token", {
      expiresInSeconds,
      scope: payload.scope,
    });

    return this.accessToken;
  }
}
