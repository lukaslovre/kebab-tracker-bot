/** Generic non-2xx error from the Reddit API. */
export class RedditApiError extends Error {
  public readonly status: number;
  public readonly url: string;
  public readonly responseBody?: unknown;

  constructor(
    message: string,
    options: { status: number; url: string; responseBody?: unknown },
  ) {
    super(message);
    this.name = "RedditApiError";
    this.status = options.status;
    this.url = options.url;
    this.responseBody = options.responseBody;
  }
}

/**
 * Indicates a 429 rate-limit response.
 *
 * The poller can catch this and back off for `retryAfterMs`.
 */
export class RedditRateLimitError extends Error {
  public readonly retryAfterMs: number;
  public readonly url: string;

  constructor(message: string, options: { retryAfterMs: number; url: string }) {
    super(message);
    this.name = "RedditRateLimitError";
    this.retryAfterMs = options.retryAfterMs;
    this.url = options.url;
  }
}
