import { type Logger } from "../logger";
import { fetchWithTimeout } from "../utils/fetchWithTimeout";
import { RedditApiError, RedditRateLimitError } from "./errors";
import { RedditAuth } from "./auth";
import { type RedditComment } from "./types";
import * as z from "zod";

const SubredditCommentsResponseSchema = z.object({
  data: z.object({
    children: z.array(
      z.object({
        data: z.unknown(),
      }),
    ),
  }),
});

const RedditCommentDataSchema = z.object({
  id: z.string(),
  name: z.string().optional(),
  author: z.string().optional(),
  body: z.string().optional(),
  created_utc: z.number(),
  permalink: z.string().optional(),
  subreddit: z.string().optional(),
});

type RedditCommentData = z.infer<typeof RedditCommentDataSchema>;

function toRedditComment(data: RedditCommentData): RedditComment {
  const fullname = data.name ?? `t1_${data.id}`;
  return {
    id: data.id,
    fullname,
    author: data.author ?? "[unknown]",
    body: data.body ?? "",
    createdUtcSeconds: data.created_utc,
    permalink: data.permalink,
    subreddit: data.subreddit,
  };
}

export type RedditClientConfig = {
  auth: RedditAuth;
  userAgent: string;
  requestTimeoutMs: number;
};

/**
 * Thin wrapper around the Reddit OAuth API.
 *
 * Keeps HTTP logic in one place (headers, timeouts, 429 handling) so the rest
 * of the bot can stay domain-focused.
 */
export class RedditClient {
  private readonly baseUrl = "https://oauth.reddit.com";

  constructor(
    private readonly config: RedditClientConfig,
    private readonly logger: Logger,
  ) {}

  public async fetchSubredditComments(options: {
    subredditName: string;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<RedditComment[]> {
    // Listing endpoint used by the poller.
    const limit = options.limit ?? 50;
    const url = new URL(
      `/r/${options.subredditName}/comments.json`,
      this.baseUrl,
    );
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("raw_json", "1");

    const res = await this.request(url.toString(), {
      method: "GET",
      signal: options.signal,
    });
    const payload = await this.readJsonSafe(res);

    if (!res.ok) {
      throw new RedditApiError(
        `Failed to fetch comments (HTTP ${res.status})`,
        {
          status: res.status,
          url: url.toString(),
          responseBody: payload,
        },
      );
    }

    const parsedListing = SubredditCommentsResponseSchema.safeParse(payload);
    if (!parsedListing.success) return [];

    const comments: RedditComment[] = [];
    for (const child of parsedListing.data.data.children) {
      const parsed = RedditCommentDataSchema.safeParse(child.data);
      if (!parsed.success) continue;
      comments.push(toRedditComment(parsed.data));
    }
    return comments;
  }

  public async replyToComment(options: {
    commentFullnameOrId: string;
    markdown: string;
    signal?: AbortSignal;
  }): Promise<void> {
    // POST /api/comment expects the "thing" fullname (t1_xxx). We'll accept either.
    const thingId = normalizeCommentThingId(options.commentFullnameOrId);
    const url = new URL("/api/comment", this.baseUrl);

    const body = new URLSearchParams({
      api_type: "json",
      thing_id: thingId,
      text: options.markdown,
      raw_json: "1",
    });

    const res = await this.request(url.toString(), {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body,
      signal: options.signal,
    });

    const payload = await this.readJsonSafe(res);
    if (!res.ok) {
      throw new RedditApiError(`Failed to reply (HTTP ${res.status})`, {
        status: res.status,
        url: url.toString(),
        responseBody: payload,
      });
    }

    const errors = (payload as any)?.json?.errors;
    if (Array.isArray(errors) && errors.length > 0) {
      throw new RedditApiError("Reddit returned errors while replying", {
        status: res.status,
        url: url.toString(),
        responseBody: payload,
      });
    }

    this.logger.info("Replied to comment", { thingId });
  }

  private async request(url: string, init: RequestInit): Promise<Response> {
    // Always call via oauth.reddit.com with an Authorization bearer token.
    const token = await this.config.auth.getAccessToken(
      init.signal ?? undefined,
    );

    const headers = new Headers(init.headers);
    headers.set("Authorization", `bearer ${token}`);
    headers.set("User-Agent", this.config.userAgent);

    const res = await fetchWithTimeout(
      url,
      {
        ...init,
        headers,
      },
      this.config.requestTimeoutMs,
    );

    if (res.status === 429) {
      const retryAfterSeconds = Number.parseInt(
        res.headers.get("retry-after") ?? "1",
        10,
      );
      const retryAfterMs =
        Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
          ? retryAfterSeconds * 1000
          : 1_000;
      throw new RedditRateLimitError("Rate limited by Reddit", {
        retryAfterMs,
        url,
      });
    }

    return res;
  }

  private async readJsonSafe(res: Response): Promise<unknown> {
    try {
      return await res.json();
    } catch {
      return undefined;
    }
  }
}

function normalizeCommentThingId(value: string): string {
  const trimmed = value.trim();
  if (/^t1_[a-z0-9]+$/i.test(trimmed)) return trimmed;
  if (/^[a-z0-9]+$/i.test(trimmed)) return `t1_${trimmed}`;
  return trimmed;
}
