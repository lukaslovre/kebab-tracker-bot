import { type Logger } from "../logger";
import { type RedditClient } from "../reddit/client";
import { RedditApiError, RedditRateLimitError } from "../reddit/errors";
import { sleep } from "../utils/sleep";
import { type KebabDb } from "../db/db";
import { buildKebabDashboardReplyFromLogData } from "./dashboardReply";

type ReplyRetryState = {
  attempts: number;
  nextAttemptAtMs: number;
};

function computeExponentialBackoffMs(options: {
  baseMs: number;
  maxMs: number;
  attempt: number;
}): number {
  // attempt=1 => baseMs
  const exp = Math.max(0, options.attempt - 1);
  const raw = options.baseMs * 2 ** Math.min(exp, 10);
  const capped = Math.min(options.maxMs, raw);

  // Add a small jitter so multiple containers don't accidentally synchronize. (lol)
  const jitter = 0.2;
  const factor = 1 - jitter + Math.random() * (2 * jitter);
  return Math.max(0, Math.round(capped * factor));
}

/**
 * Background worker that retries replies for logs that were recorded but not yet
 * marked as completed (`kebab_logs.reply_status = 'pending'`).
 *
 * Why this exists:
 * - If replying fails (rate-limit, transient network issues, Reddit hiccups), we
 *   don't want the comment poller to stall and stop processing new comments.
 * - We already track reply status on the log row, so this worker can resume
 *   after restarts without additional tables.
 */
export async function runPendingRepliesWorker(options: {
  db: KebabDb;
  reddit: RedditClient;
  logger: Logger;
  signal: AbortSignal;
  pollIntervalMs: number;
  timeZone: string;
  itemsPerLevel: number;
  trackerCommand: string;
  batchSize?: number;
  baseBackoffMs?: number;
  maxBackoffMs?: number;
  maxAttempts?: number;
}): Promise<void> {
  const {
    db,
    reddit,
    logger,
    signal,
    pollIntervalMs,
    timeZone,
    itemsPerLevel,
    trackerCommand,
    batchSize = 25,
    baseBackoffMs = 5_000,
    maxBackoffMs = 10 * 60_000,
    maxAttempts = 8,
  } = options;

  // Per-log retry state (in-memory). This keeps retry noise down during a single
  // process run. If the process restarts, we'll start fresh.
  const retry = new Map<number, ReplyRetryState>();

  logger.info("Pending reply worker starting", {
    pollIntervalMs,
    batchSize,
    baseBackoffMs,
    maxBackoffMs,
    maxAttempts,
  });

  while (!signal.aborted) {
    try {
      const pending = db.listUnrepliedKebabLogs({ limit: batchSize });

      for (const item of pending) {
        if (signal.aborted) break;

        const state = retry.get(item.logId);
        if (state && Date.now() < state.nextAttemptAtMs) continue;

        const previousAttempts = state?.attempts ?? 0;
        if (previousAttempts >= maxAttempts) {
          db.markKebabLogReplyFailedPermanently(item.logId);
          retry.delete(item.logId);
          logger.warn("Max reply attempts already reached; marking as failed", {
            logId: item.logId,
            commentId: item.commentId,
            attempts: previousAttempts,
          });
          continue;
        }

        const attempt = previousAttempts + 1;

        try {
          const dash = db.getDashboardDataForLogId(item.logId);
          if (!dash) {
            throw new Error(`Missing dashboard data for log_id=${item.logId}`);
          }

          const markdown = buildKebabDashboardReplyFromLogData(dash, {
            timeZone,
            itemsPerLevel,
            trackerCommand,
          });

          await reddit.replyToComment({
            commentFullnameOrId: item.commentId,
            markdown,
            signal,
          });

          db.markKebabLogReplySuccess(item.logId);
          retry.delete(item.logId);

          logger.info("Replied to pending log", {
            logId: item.logId,
            commentId: item.commentId,
            attempt,
          });
        } catch (error) {
          if (signal.aborted) break;

          if (
            error instanceof RedditApiError &&
            error.status >= 400 &&
            error.status < 500
          ) {
            db.markKebabLogReplyFailedPermanently(item.logId);
            retry.delete(item.logId);

            logger.exception(
              "Permanent reply failure; marking as failed",
              error,
              {
                logId: item.logId,
                commentId: item.commentId,
                attempt,
                status: error.status,
              },
            );
            continue;
          }

          if (attempt >= maxAttempts) {
            db.markKebabLogReplyFailedPermanently(item.logId);
            retry.delete(item.logId);

            logger.exception(
              "Max reply attempts reached; marking as failed",
              error,
              {
                logId: item.logId,
                commentId: item.commentId,
                attempts: attempt,
              },
            );
          } else {
            let backoffMs: number;

            if (error instanceof RedditRateLimitError) {
              // Respect Reddit's server-provided retry hint.
              backoffMs = Math.min(
                maxBackoffMs,
                Math.max(1_000, error.retryAfterMs),
              );
            } else {
              backoffMs = computeExponentialBackoffMs({
                baseMs: baseBackoffMs,
                maxMs: maxBackoffMs,
                attempt,
              });
            }

            retry.set(item.logId, {
              attempts: attempt,
              nextAttemptAtMs: Date.now() + backoffMs,
            });

            logger.exception("Failed to reply; will retry", error, {
              logId: item.logId,
              commentId: item.commentId,
              attempt,
              nextAttemptInMs: backoffMs,
            });
          }
        }
      }

      await sleep(pollIntervalMs, signal);
    } catch (error) {
      if (signal.aborted) break;
      logger.exception("Pending reply worker loop error", error);
      await sleep(Math.min(60_000, pollIntervalMs * 2), signal);
    }
  }

  logger.info("Pending reply worker stopped");
}
