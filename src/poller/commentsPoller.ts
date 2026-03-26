import { type Logger } from "../logger";
import { FixedSizeSet } from "../utils/fixedSizeSet";
import { sleep } from "../utils/sleep";
import { RedditRateLimitError } from "../reddit/errors";
import { type RedditClient } from "../reddit/client";
import { type RedditComment } from "../reddit/types";

/**
 * Poll `/r/<subreddit>/comments` and call `onNewComment` for newly observed comments.
 *
 * Notes (Phase 1):
 * - Cursor is in-memory, so restarts can miss a window; Phase 2 will add DB-backed idempotency.
 * - We seed the cursor to "now" on boot to avoid processing historical backlog.
 */
export async function runCommentsPoller(options: {
  reddit: RedditClient;
  subredditName: string;
  pollIntervalMs: number;
  logger: Logger;
  signal: AbortSignal;
  onNewComment: (comment: RedditComment) => Promise<void> | void;
}): Promise<void> {
  const {
    reddit,
    subredditName,
    pollIntervalMs,
    logger,
    signal,
    onNewComment,
  } = options;

  const seen = new FixedSizeSet<string>(2_000);
  let lastSeenFullname: string | undefined;

  // Seed cursor to “now” so we don't process a backlog on first boot.
  {
    const initial = await reddit.fetchSubredditComments({
      subredditName,
      limit: 25,
      signal,
    });
    lastSeenFullname = initial[0]?.fullname;
    if (lastSeenFullname) {
      seen.add(lastSeenFullname);
      logger.info("Initial cursor set", { lastSeenFullname });
    } else {
      logger.warn("No comments returned while initializing cursor");
    }
  }

  while (!signal.aborted) {
    try {
      const comments = await reddit.fetchSubredditComments({
        subredditName,
        limit: 50,
        signal,
      });
      const newest = comments[0]?.fullname;
      if (!newest) {
        await sleep(pollIntervalMs, signal);
        continue;
      }

      if (!lastSeenFullname) {
        lastSeenFullname = newest;
        seen.add(newest);
        await sleep(pollIntervalMs, signal);
        continue;
      }

      const index = comments.findIndex((c) => c.fullname === lastSeenFullname);
      const sliceEnd = index >= 0 ? index : comments.length;
      const newer = comments.slice(0, sliceEnd);

      if (index < 0 && newer.length > 0) {
        logger.warn("Cursor not found in listing; possible restart gap", {
          lastSeenFullname,
          fetched: comments.length,
        });
      }

      if (newer.length > 0) {
        // Process oldest -> newest to keep output deterministic.
        const inOrder = newer.slice().reverse();
        for (const comment of inOrder) {
          if (seen.has(comment.fullname)) continue;
          seen.add(comment.fullname);
          try {
            await onNewComment(comment);
          } catch (error) {
            logger.exception("onNewComment failed", error, {
              commentFullname: comment.fullname,
            });
          }
        }
      }

      lastSeenFullname = newest;
      seen.add(lastSeenFullname);
      await sleep(pollIntervalMs, signal);
    } catch (error) {
      if (signal.aborted) break;

      if (error instanceof RedditRateLimitError) {
        logger.warn("Rate limited; backing off", {
          retryAfterMs: error.retryAfterMs,
          url: error.url,
        });
        await sleep(error.retryAfterMs, signal);
        continue;
      }

      logger.exception("Poll loop error", error);
      await sleep(Math.min(60_000, pollIntervalMs * 2), signal);
    }
  }
}
