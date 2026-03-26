import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { type Logger } from "../logger";
import { initSchema } from "./schema";

export type RecordKebabLogResult =
  | { status: "inserted"; logId: number }
  | { status: "duplicate" }
  | { status: "cooldown"; nextAllowedAtIso: string }
  | { status: "rejected_future" };

export type KebabLogByCommentId = {
  logId: number;
  repliedAtIso: string | null;
};

export type KebabDashboardData = {
  logId: number;
  username: string;
  commentId: string;
  eatenAtIso: string;
  loggedAtIso: string;
  rating: number | null;
  userTotalKebabs: number;
  userAvgRating: number | null;
  prevGlobalEatenAtIso: string | null;
  prevUserEatenAtIso: string | null;
};

const BOT_STATE_COMMENTS_CURSOR = "comments.cursor.fullname";

function toIsoUtc(d: Date): string {
  return d.toISOString();
}

function isSpecialSqlitePath(path: string): boolean {
  return path === ":memory:" || path.startsWith("file:");
}

export class KebabDb {
  private constructor(
    private readonly db: Database,
    private readonly logger: Logger,
    private readonly cooldownMs: number,
  ) {}

  static open(options: {
    dbPath: string;
    logger: Logger;
    cooldownMs: number;
  }): KebabDb {
    const { dbPath, logger, cooldownMs } = options;

    if (!isSpecialSqlitePath(dbPath)) {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    const db = new Database(dbPath);
    initSchema(db);

    return new KebabDb(db, logger, cooldownMs);
  }

  close(): void {
    this.db.close();
  }

  getCommentsCursorFullname(): string | undefined {
    const row = this.db
      .query("SELECT value FROM bot_state WHERE key = ? LIMIT 1")
      .get(BOT_STATE_COMMENTS_CURSOR) as { value: string } | null;
    return row?.value;
  }

  setCommentsCursorFullname(fullname: string): void {
    const nowIso = toIsoUtc(new Date());
    this.db
      .query(
        "INSERT INTO bot_state(key, value, updated_at) VALUES(?, ?, ?) " +
          "ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
      )
      .run(BOT_STATE_COMMENTS_CURSOR, fullname, nowIso);
  }

  /**
   * Records a basic `!kebab` log for a comment.
   *
   * Phase 2 behavior: assumes no rating and no backdate -> eatenAt == loggedAt.
   * Phase 3 will reuse the lower-level `recordKebabLog` with parsed args.
   */
  recordBasicKebabLogFromComment(input: {
    username: string;
    commentId: string;
    createdUtcSeconds: number;
  }): RecordKebabLogResult {
    const loggedAt = new Date(input.createdUtcSeconds * 1000);
    const eatenAt = loggedAt;
    return this.recordKebabLog({
      username: input.username,
      commentId: input.commentId,
      eatenAtUtc: eatenAt,
      loggedAtUtc: loggedAt,
      rating: null,
      isBackdated: false,
    });
  }

  /**
   * Idempotently records a kebab log (at-most-once per Reddit comment).
   *
   * Rules implemented (Phase 2):
   * - timestamps are stored as UTC ISO strings
   * - reject future-dated `eatenAtUtc`
   * - enforce a sliding-window cooldown on non-backdated logs
   */
  recordKebabLog(input: {
    username: string;
    commentId: string;
    eatenAtUtc: Date;
    loggedAtUtc: Date;
    rating: number | null;
    isBackdated: boolean;
  }): RecordKebabLogResult {
    const now = new Date();

    // Guard future dates (allow tiny clock skew).
    if (input.eatenAtUtc.getTime() > now.getTime() + 60_000) {
      return { status: "rejected_future" };
    }

    const tx = this.db.transaction((): RecordKebabLogResult => {
      // Idempotency first: if we've already processed this Reddit comment, do nothing.
      const existing = this.db
        .query(
          "SELECT log_id as logId FROM kebab_logs WHERE comment_id = ? LIMIT 1",
        )
        .get(input.commentId) as { logId: number } | null;
      if (existing) {
        return { status: "duplicate" };
      }

      const username = input.username;
      const loggedAtIso = toIsoUtc(input.loggedAtUtc);
      const eatenAtIso = toIsoUtc(input.eatenAtUtc);

      // Ensure the user exists.
      this.db
        .query(
          "INSERT INTO users(username, total_kebabs, created_at) VALUES(?, 0, ?) " +
            "ON CONFLICT(username) DO NOTHING",
        )
        .run(username, loggedAtIso);

      // Cooldown (only for non-backdated logs).
      if (!input.isBackdated) {
        const last = this.db
          .query(
            "SELECT logged_at as loggedAtIso FROM kebab_logs WHERE username = ? ORDER BY logged_at DESC LIMIT 1",
          )
          .get(username) as { loggedAtIso: string } | null;

        if (last?.loggedAtIso) {
          const lastLoggedAt = new Date(last.loggedAtIso).getTime();
          const delta = input.loggedAtUtc.getTime() - lastLoggedAt;
          if (delta >= 0 && delta < this.cooldownMs) {
            const nextAllowed = new Date(lastLoggedAt + this.cooldownMs);
            return {
              status: "cooldown",
              nextAllowedAtIso: toIsoUtc(nextAllowed),
            };
          }
        }
      }

      const insertRes = this.db
        .query(
          "INSERT OR IGNORE INTO kebab_logs(username, timestamp, logged_at, rating, comment_id, replied_at) " +
            "VALUES(?, ?, ?, ?, ?, NULL)",
        )
        .run(
          username,
          eatenAtIso,
          loggedAtIso,
          input.rating,
          input.commentId,
        ) as {
        changes: number;
        lastInsertRowid: number;
      };

      if (insertRes.changes !== 1) {
        return { status: "duplicate" };
      }

      this.db
        .query(
          "UPDATE users SET total_kebabs = total_kebabs + 1 WHERE username = ?",
        )
        .run(username);

      return { status: "inserted", logId: Number(insertRes.lastInsertRowid) };
    });

    try {
      return tx();
    } catch (error) {
      this.logger.exception("DB transaction failed", error, {
        commentId: input.commentId,
        username: input.username,
      });
      throw error;
    }
  }

  getKebabLogByCommentId(commentId: string): KebabLogByCommentId | null {
    const row = this.db
      .query(
        "SELECT log_id as logId, replied_at as repliedAtIso FROM kebab_logs WHERE comment_id = ? LIMIT 1",
      )
      .get(commentId) as { logId: number; repliedAtIso: string | null } | null;

    if (!row) return null;
    return { logId: Number(row.logId), repliedAtIso: row.repliedAtIso };
  }

  markKebabLogRepliedAt(logId: number, repliedAtUtc: Date = new Date()): void {
    const repliedAtIso = toIsoUtc(repliedAtUtc);
    this.db
      .query("UPDATE kebab_logs SET replied_at = ? WHERE log_id = ?")
      .run(repliedAtIso, logId);
  }

  /**
   * Load everything needed to render a dashboard reply for a specific log.
   *
   * Notes:
   * - For streak deltas we look at the previous log by `timestamp` (the eaten time),
   *   not `logged_at` (comment time). This keeps backdated history consistent.
   */
  getDashboardDataForLogId(logId: number): KebabDashboardData | null {
    const row = this.db
      .query(
        "SELECT l.log_id as logId, l.username as username, l.comment_id as commentId, l.timestamp as eatenAtIso, l.logged_at as loggedAtIso, l.rating as rating, u.total_kebabs as userTotalKebabs " +
          "FROM kebab_logs l JOIN users u ON u.username = l.username WHERE l.log_id = ? LIMIT 1",
      )
      .get(logId) as {
      logId: number;
      username: string;
      commentId: string;
      eatenAtIso: string;
      loggedAtIso: string;
      rating: number | null;
      userTotalKebabs: number;
    } | null;

    if (!row) return null;

    const avgRow = this.db
      .query(
        "SELECT AVG(rating) as avgRating FROM kebab_logs WHERE username = ? AND rating IS NOT NULL",
      )
      .get(row.username) as { avgRating: number | null } | null;

    const prevGlobal = this.db
      .query(
        "SELECT timestamp as eatenAtIso FROM kebab_logs " +
          "WHERE (timestamp < ? OR (timestamp = ? AND log_id < ?)) " +
          "ORDER BY timestamp DESC, log_id DESC LIMIT 1",
      )
      .get(row.eatenAtIso, row.eatenAtIso, row.logId) as {
      eatenAtIso: string;
    } | null;

    const prevUser = this.db
      .query(
        "SELECT timestamp as eatenAtIso FROM kebab_logs " +
          "WHERE username = ? AND (timestamp < ? OR (timestamp = ? AND log_id < ?)) " +
          "ORDER BY timestamp DESC, log_id DESC LIMIT 1",
      )
      .get(row.username, row.eatenAtIso, row.eatenAtIso, row.logId) as {
      eatenAtIso: string;
    } | null;

    return {
      logId: Number(row.logId),
      username: row.username,
      commentId: row.commentId,
      eatenAtIso: row.eatenAtIso,
      loggedAtIso: row.loggedAtIso,
      rating: row.rating === null ? null : Number(row.rating),
      userTotalKebabs: Number(row.userTotalKebabs),
      userAvgRating:
        avgRow?.avgRating === null || avgRow?.avgRating === undefined
          ? null
          : Number(avgRow.avgRating),
      prevGlobalEatenAtIso: prevGlobal?.eatenAtIso ?? null,
      prevUserEatenAtIso: prevUser?.eatenAtIso ?? null,
    };
  }
}
