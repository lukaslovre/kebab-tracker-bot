import { type Logger } from "../logger";
import { type RedditClient } from "../reddit/client";
import { RedditRateLimitError } from "../reddit/errors";
import { type RedditComment } from "../reddit/types";
import { type KebabDb } from "../db/db";
import { parseKebabCommand } from "./parser";
import { formatUtcInTimeZone, HR_TIME_ZONE } from "./time";
import { resolveEatenAtUtcFromCommand } from "./timeAdapter";
import {
  renderKebabCooldownReply,
  renderKebabFutureDateReply,
  renderKebabParseErrorReply,
} from "../templates/hr";

function sameUsername(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

async function replyBestEffort(options: {
  reddit: RedditClient;
  commentFullname: string;
  markdown: string;
  logger: Logger;
  signal: AbortSignal;
}): Promise<void> {
  try {
    await options.reddit.replyToComment({
      commentFullnameOrId: options.commentFullname,
      markdown: options.markdown,
      signal: options.signal,
    });
  } catch (error) {
    if (error instanceof RedditRateLimitError) {
      options.logger.warn("Rate limited while replying", {
        retryAfterMs: error.retryAfterMs,
        url: error.url,
      });
    }

    // Best-effort replies should never block the main poller loop.
    options.logger.exception("Failed to reply (best effort)", error, {
      commentFullname: options.commentFullname,
    });
  }
}

/**
 * Parse `!kebab` commands found in new comments and record them.
 *
 * This handler is intentionally "fast": it records accepted logs immediately.
 * The actual dashboard reply is sent by a separate pending-replies worker,
 * which can retry safely without stalling the main poller.
 *
 * Important safety behavior:
 * - Ignore the bot's own comments (our reply includes `!kebab` in examples).
 */
export async function handleKebabComment(options: {
  comment: RedditComment;
  botUsername: string;
  db: KebabDb;
  reddit: RedditClient;
  logger: Logger;
  signal: AbortSignal;
}): Promise<void> {
  const { comment, botUsername, db, reddit, logger, signal } = options;

  if (sameUsername(comment.author, botUsername)) return;

  const parsed = parseKebabCommand(comment.body);
  if (!parsed.found) return;

  if ("ok" in parsed && parsed.ok === false) {
    await replyBestEffort({
      reddit,
      commentFullname: comment.fullname,
      markdown: renderKebabParseErrorReply(parsed.message),
      logger,
      signal,
    });
    return;
  }

  const cmd = parsed;

  const loggedAtUtc = new Date(comment.createdUtcSeconds * 1000);
  const resolved = resolveEatenAtUtcFromCommand({
    backdate: cmd.backdate,
    loggedAtUtc,
  });

  if (!resolved.ok) {
    await replyBestEffort({
      reddit,
      commentFullname: comment.fullname,
      markdown: renderKebabParseErrorReply(resolved.message),
      logger,
      signal,
    });
    return;
  }

  const { eatenAtUtc, isBackdated } = resolved;

  const record = db.recordKebabLog({
    username: comment.author,
    commentId: comment.id,
    eatenAtUtc,
    loggedAtUtc,
    rating: cmd.rating,
    isBackdated,
  });

  if (record.status === "cooldown") {
    const nextAllowed = new Date(record.nextAllowedAtIso);
    await replyBestEffort({
      reddit,
      commentFullname: comment.fullname,
      markdown: renderKebabCooldownReply({
        nextAllowedAtLocal: formatUtcInTimeZone(nextAllowed, HR_TIME_ZONE),
      }),
      logger,
      signal,
    });
    return;
  }

  if (record.status === "rejected_future") {
    await replyBestEffort({
      reddit,
      commentFullname: comment.fullname,
      markdown: renderKebabFutureDateReply(),
      logger,
      signal,
    });
    return;
  }

  if (record.status === "inserted") {
    logger.info("Kebab log recorded (reply pending)", {
      username: comment.author,
      commentId: comment.id,
      logId: record.logId,
      isBackdated,
      rating: cmd.rating,
    });
    return;
  }

  if (record.status === "duplicate") {
    const existing = db.getKebabLogByCommentId(comment.id);
    if (!existing) return;
    if (existing.replyStatus !== "pending") return;

    logger.info("Existing kebab log still pending reply", {
      commentId: comment.id,
      logId: existing.logId,
    });
    return;
  }
}
