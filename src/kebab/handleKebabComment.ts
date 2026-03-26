import { type Logger } from "../logger";
import { type RedditClient } from "../reddit/client";
import { RedditRateLimitError } from "../reddit/errors";
import { type RedditComment } from "../reddit/types";
import { sleep } from "../utils/sleep";
import { type KebabDb } from "../db/db";
import { parseKebabCommand } from "./parser";
import {
  formatUtcInTimeZone,
  HR_TIME_ZONE,
  zonedLocalDateTimeToUtc,
} from "./time";
import { getKebabLevel } from "./levels";
import {
  renderKebabCooldownReply,
  renderKebabDashboardReply,
  renderKebabFutureDateReply,
  renderKebabParseErrorReply,
} from "../templates/hr";

function sameUsername(a: string, b: string): boolean {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

type ReplyMode = "must_succeed" | "best_effort";

async function replyWithPolicy(options: {
  reddit: RedditClient;
  commentFullname: string;
  markdown: string;
  logger: Logger;
  signal: AbortSignal;
  mode: ReplyMode;
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

      // If this reply is important (accepted log), we prefer to wait and retry
      // by rethrowing so the poller does not advance its cursor.
      if (options.mode === "must_succeed") {
        await sleep(error.retryAfterMs, options.signal);
        throw error;
      }
    }

    if (options.mode === "must_succeed") throw error;

    // For “best effort” replies (cooldown/parse errors), avoid getting stuck
    // retrying a non-critical response forever.
    options.logger.exception("Failed to reply (best effort)", error, {
      commentFullname: options.commentFullname,
    });
  }
}

function parseBackdateToUtc(options: {
  date: string;
  time?: string;
  loggedAtUtc: Date;
}): { ok: true; eatenAtUtc: Date } | { ok: false; message: string } {
  const [y, m, d] = options.date.split("-");
  const year = Number.parseInt(y ?? "", 10);
  const month = Number.parseInt(m ?? "", 10);
  const day = Number.parseInt(d ?? "", 10);

  let hour = 12;
  let minute = 0;
  let usedDefaultTime = true;

  if (options.time) {
    const [hh, mm] = options.time.split(":");
    hour = Number.parseInt(hh ?? "", 10);
    minute = Number.parseInt(mm ?? "", 10);
    usedDefaultTime = false;
  }

  const first = zonedLocalDateTimeToUtc(
    { year, month, day, hour, minute },
    HR_TIME_ZONE,
  );
  if (!first.ok) return { ok: false, message: first.message };

  // If the user only provided a date and it's “today”, defaulting to noon can
  // accidentally land in the future (early morning). To keep UX smooth, we
  // fall back to 00:00 local in that case.
  if (usedDefaultTime && first.utc.getTime() > options.loggedAtUtc.getTime()) {
    const fallback = zonedLocalDateTimeToUtc(
      { year, month, day, hour: 0, minute: 0 },
      HR_TIME_ZONE,
    );
    if (fallback.ok) return { ok: true, eatenAtUtc: fallback.utc };
  }

  return { ok: true, eatenAtUtc: first.utc };
}

/**
 * Phase 3: Parse `!kebab`, record it, compute streak/stats, and reply.
 *
 * Important safety behavior:
 * - Ignore the bot's own comments (our reply includes `!kebab` in examples).
 * - Reply attempts for accepted logs are retried via the poller loop until they succeed.
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
    await replyWithPolicy({
      reddit,
      commentFullname: comment.fullname,
      markdown: renderKebabParseErrorReply(parsed.message),
      logger,
      signal,
      mode: "best_effort",
    });
    return;
  }

  const cmd = parsed;

  const loggedAtUtc = new Date(comment.createdUtcSeconds * 1000);
  let eatenAtUtc = loggedAtUtc;

  if (cmd.backdate) {
    const converted = parseBackdateToUtc({
      date: cmd.backdate.date,
      time: cmd.backdate.time,
      loggedAtUtc,
    });

    if (!converted.ok) {
      await replyWithPolicy({
        reddit,
        commentFullname: comment.fullname,
        markdown: renderKebabParseErrorReply(converted.message),
        logger,
        signal,
        mode: "best_effort",
      });
      return;
    }

    eatenAtUtc = converted.eatenAtUtc;
  }

  const isBackdated =
    cmd.backdate !== null &&
    eatenAtUtc.getTime() < loggedAtUtc.getTime() - 60_000;

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
    await replyWithPolicy({
      reddit,
      commentFullname: comment.fullname,
      markdown: renderKebabCooldownReply({
        nextAllowedAtLocal: formatUtcInTimeZone(nextAllowed, HR_TIME_ZONE),
      }),
      logger,
      signal,
      mode: "best_effort",
    });
    return;
  }

  if (record.status === "rejected_future") {
    await replyWithPolicy({
      reddit,
      commentFullname: comment.fullname,
      markdown: renderKebabFutureDateReply(),
      logger,
      signal,
      mode: "best_effort",
    });
    return;
  }

  // If the log row already exists, only reply if we never marked `replied_at`.
  let logId: number | null = null;

  if (record.status === "inserted") {
    logId = record.logId;
  } else if (record.status === "duplicate") {
    const existing = db.getKebabLogByCommentId(comment.id);
    if (!existing) return;
    if (existing.repliedAtIso) return;
    logId = existing.logId;
  }

  if (logId === null) return;

  const dash = db.getDashboardDataForLogId(logId);
  if (!dash) {
    logger.error("Missing dashboard data for log", { logId });
    return;
  }

  const eaten = new Date(dash.eatenAtIso);
  const logged = new Date(dash.loggedAtIso);
  const dashIsBackdated = eaten.getTime() < logged.getTime() - 60_000;

  const prevGlobal = dash.prevGlobalEatenAtIso
    ? new Date(dash.prevGlobalEatenAtIso)
    : null;
  const prevUser = dash.prevUserEatenAtIso
    ? new Date(dash.prevUserEatenAtIso)
    : null;

  const globalDeltaMs =
    prevGlobal === null
      ? null
      : Math.max(0, eaten.getTime() - prevGlobal.getTime());
  const personalDeltaMs =
    prevUser === null
      ? null
      : Math.max(0, eaten.getTime() - prevUser.getTime());

  const reply = renderKebabDashboardReply({
    rating: dash.rating,
    isBackdated: dashIsBackdated,
    eatenAtLocal: formatUtcInTimeZone(eaten, HR_TIME_ZONE),
    globalDeltaMs,
    personalDeltaMs,
    totalKebabs: dash.userTotalKebabs,
    level: getKebabLevel(dash.userTotalKebabs),
    avgRating: dash.userAvgRating,
  });

  // Accepted log => reply must succeed (otherwise we retry via the poller).
  await replyWithPolicy({
    reddit,
    commentFullname: comment.fullname,
    markdown: reply,
    logger,
    signal,
    mode: "must_succeed",
  });

  db.markKebabLogRepliedAt(logId);
}
