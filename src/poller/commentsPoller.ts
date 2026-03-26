import { type Logger } from "../logger";
import { FixedSizeSet } from "../utils/fixedSizeSet";
import { sleep } from "../utils/sleep";
import { RedditApiError, RedditRateLimitError } from "../reddit/errors";
import { type RedditClient } from "../reddit/client";
import { type RedditComment } from "../reddit/types";

/**
 * Poll `/r/<subreddit>/comments` and call `onNewComment` for newly observed comments.
 *
 * Notes:
 * - If `cursorStore` is provided, the cursor can be persisted (restart-safe).
 * - On the very first boot (no cursor), we set the cursor to the newest comment
 *   so we avoid processing a backlog.
 * - `onNewComment` should be safe to call more than once for the same comment
 *   (the DB layer enforces idempotency for tracker logs via a UNIQUE constraint).
 */
export async function runCommentsPoller(options: {
  reddit: RedditClient;
  subredditName: string;
  pollIntervalMs: number;
  logger: Logger;
  signal: AbortSignal;
  cursorStore?: {
    get: () => Promise<string | undefined> | string | undefined;
    set: (fullname: string) => Promise<void> | void;
  };
  onNewComment: (comment: RedditComment) => Promise<void> | void;
}): Promise<void> {
  const {
    reddit,
    subredditName,
    pollIntervalMs,
    logger,
    signal,
    cursorStore,
    onNewComment,
  } = options;

  const seen = new FixedSizeSet<string>(2_000);
  let lastSeenFullname: string | undefined = await cursorStore?.get();
  if (lastSeenFullname) {
    logger.info("Loaded persisted cursor", { lastSeenFullname });
  }

  // Simple exponential backoff for repeated failures.
  let consecutiveErrors = 0;

  const computeBackoffMs = (attempt: number): number => {
    const maxMs = 5 * 60_000;
    const exp = Math.min(8, Math.max(0, attempt - 1));
    const raw = pollIntervalMs * 2 ** exp;
    const capped = Math.min(maxMs, raw);

    // Small jitter so multiple instances don't synchronize.
    const jitter = 0.2;
    const factor = 1 - jitter + Math.random() * (2 * jitter);
    return Math.max(1_000, Math.round(capped * factor));
  };

  while (!signal.aborted) {
    try {
      const comments = await reddit.fetchSubredditComments(
        lastSeenFullname
          ? {
              subredditName,
              // Reddit listing max is 100. Using a cursor avoids the classic
              // "restart gap" where the last-seen item falls out of a small
              // fixed window.
              limit: 100,
              before: lastSeenFullname,
              signal,
            }
          : {
              subredditName,
              // On first boot (no cursor) we only need "latest" to seed the
              // cursor; we intentionally do not process a backlog.
              limit: 50,
              signal,
            },
      );

      consecutiveErrors = 0;

      const newest = comments[0]?.fullname;
      if (!newest) {
        await sleep(pollIntervalMs, signal);
        continue;
      }

      if (!lastSeenFullname) {
        lastSeenFullname = newest;
        seen.add(newest);
        logger.info("Initial cursor set", { lastSeenFullname });
        await cursorStore?.set(lastSeenFullname);
        await sleep(pollIntervalMs, signal);
        continue;
      }

      if (comments.length > 0) {
        if (comments.length >= 100) {
          logger.warn("Fetched max new-comment batch; may still be behind", {
            lastSeenFullname,
            fetched: comments.length,
            limit: 100,
          });
        }

        // With a `before` cursor, Reddit returns comments that are newer than
        // the cursor. Process oldest -> newest to keep output deterministic.
        const inOrder = comments.slice().reverse();
        logger.info("New comments observed", {
          count: inOrder.length,
          lastSeenFullname,
          newestFullname: inOrder[inOrder.length - 1]?.fullname,
        });

        let processed = 0;
        for (const comment of inOrder) {
          if (seen.has(comment.fullname)) continue;
          try {
            await onNewComment(comment);
          } catch (error) {
            logger.exception("onNewComment failed", error, {
              commentFullname: comment.fullname,
            });

            // Do not advance the cursor past a failed comment.
            // The next poll iteration will retry (and future phases can make
            // `onNewComment` fully idempotent with DB constraints).
            break;
          }

          seen.add(comment.fullname);
          lastSeenFullname = comment.fullname;
          await cursorStore?.set(lastSeenFullname);
          processed += 1;
        }

        if (processed > 0) {
          logger.info("Processed new comments", {
            processed,
            lastSeenFullname,
          });
        }
      }

      await sleep(pollIntervalMs, signal);
    } catch (error) {
      if (signal.aborted) break;

      if (error instanceof RedditRateLimitError) {
        logger.warn("Rate limited; backing off", {
          retryAfterMs: error.retryAfterMs,
          url: error.url,
        });
        consecutiveErrors += 1;
        const delay = Math.max(
          error.retryAfterMs,
          computeBackoffMs(consecutiveErrors),
        );
        await sleep(delay, signal);
        continue;
      }

      consecutiveErrors += 1;

      const backoffMs = computeBackoffMs(consecutiveErrors);

      if (error instanceof RedditApiError) {
        logger.exception("Poll loop error", error, {
          status: error.status,
          url: error.url,
          consecutiveErrors,
          backoffMs,
        });
      } else {
        logger.exception("Poll loop error", error, {
          consecutiveErrors,
          backoffMs,
        });
      }

      await sleep(backoffMs, signal);
    }
  }
}
