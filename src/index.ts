import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { runCommentsPoller } from "./poller/commentsPoller";
import { KebabDb } from "./db/db";
import { RedditAuth } from "./reddit/auth";
import { RedditClient } from "./reddit/client";
import { handleKebabComment } from "./kebab/handleKebabComment";
import { runPendingRepliesWorker } from "./kebab/replyWorker";

/**
 * Process entrypoint.
 *
 * Boot the bot:
 * - load & validate config
 * - open the SQLite DB
 * - start the comments poller (ingestion)
 * - start the pending-replies worker (retry-safe replying)
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const logger = createLogger({
    level: config.logLevel,
    base: {
      app: "kebab-tracker-bot",
      env: config.nodeEnv,
    },
  });

  const db = KebabDb.open({
    dbPath: config.dbPath,
    cooldownMs: config.kebabCooldownMs,
    logger: logger.child({ component: "db" }),
  });

  const abortController = new AbortController();
  const signal = abortController.signal;

  const shutdown = (reason: string) => {
    if (signal.aborted) return;
    logger.info("Shutdown requested", { reason });
    abortController.abort();
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  process.on("unhandledRejection", (reason) => {
    logger.exception("Unhandled promise rejection", reason);
  });

  process.on("uncaughtException", (error) => {
    logger.exception("Uncaught exception", error);
    shutdown("uncaughtException");
  });

  const redditAuth = new RedditAuth(
    {
      clientId: config.reddit.clientId,
      clientSecret: config.reddit.clientSecret,
      username: config.reddit.username,
      password: config.reddit.password,
      userAgent: config.reddit.userAgent,
      requestTimeoutMs: config.http.requestTimeoutMs,
    },
    logger.child({ component: "reddit-auth" }),
  );

  const reddit = new RedditClient(
    {
      auth: redditAuth,
      userAgent: config.reddit.userAgent,
      requestTimeoutMs: config.http.requestTimeoutMs,
    },
    logger.child({ component: "reddit" }),
  );

  const kebabLogger = logger.child({ component: "kebab" });

  logger.info("Bot starting", {
    subreddit: config.subredditName,
    pollIntervalMs: config.polling.pollIntervalMs,
    dbPath: config.dbPath,
  });

  // Minimal metrics: a heartbeat log so we can see the bot is alive in Docker.
  const heartbeatIntervalMs = 5 * 60_000;
  const heartbeatTimer = setInterval(() => {
    if (signal.aborted) return;
    logger.info("Bot heartbeat", {
      uptimeSeconds: Math.round(process.uptime()),
      pendingReplies: db.countUnrepliedKebabLogs(),
      commentsCursor: db.getCommentsCursorFullname() ?? null,
    });
  }, heartbeatIntervalMs);

  // In Node/Bun, `unref()` prevents the interval from keeping the event loop
  // alive if all other work is done (useful during shutdown).
  heartbeatTimer.unref?.();

  const replyWorkerIntervalMs = 5_000;

  try {
    let fatal: unknown | undefined;

    const guard = async (name: string, p: Promise<void>): Promise<void> => {
      try {
        await p;
      } catch (error) {
        if (fatal === undefined) fatal = error;
        logger.exception(`${name} crashed`, error);
        shutdown(`${name}Crashed`);
      }
    };

    await Promise.all([
      guard(
        "comments-poller",
        runCommentsPoller({
          reddit,
          subredditName: config.subredditName,
          pollIntervalMs: config.polling.pollIntervalMs,
          logger: logger.child({ component: "comments-poller" }),
          signal,
          cursorStore: {
            get: () => db.getCommentsCursorFullname(),
            set: (fullname) => db.setCommentsCursorFullname(fullname),
          },
          onNewComment: async (comment) => {
            await handleKebabComment({
              comment,
              botUsername: config.reddit.username,
              db,
              reddit,
              logger: kebabLogger,
              signal,
            });
          },
        }),
      ),

      guard(
        "reply-worker",
        runPendingRepliesWorker({
          db,
          reddit,
          logger: logger.child({ component: "reply-worker" }),
          signal,
          pollIntervalMs: replyWorkerIntervalMs,
        }),
      ),
    ]);

    if (fatal !== undefined) {
      throw fatal;
    }
  } finally {
    clearInterval(heartbeatTimer);
    db.close();
    logger.info("Bot stopped");
  }
}

try {
  await main();
} catch (error) {
  // Fall back to console since logger/config may have failed.
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
}
