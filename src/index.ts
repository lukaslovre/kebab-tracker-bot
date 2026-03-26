import { loadConfig } from "./config";
import { createLogger } from "./logger";
import { runCommentsPoller } from "./poller/commentsPoller";
import { KebabDb } from "./db/db";
import { RedditAuth } from "./reddit/auth";
import { RedditClient } from "./reddit/client";
import { handleKebabComment } from "./kebab/handleKebabComment";

/**
 * Process entrypoint.
 *
 * Phase 1 behavior: authenticate with Reddit, poll new comments, and detect `!kebab`.
 * Later phases will add parsing, SQLite persistence, and replying.
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

  await runCommentsPoller({
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
  });

  db.close();
  logger.info("Bot stopped");
}

try {
  await main();
} catch (error) {
  // Fall back to console since logger/config may have failed.
  // eslint-disable-next-line no-console
  console.error(error);
  process.exitCode = 1;
}
