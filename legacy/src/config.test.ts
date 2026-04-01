import { it, expect } from "bun:test";
import { loadConfig } from "./config";

const requiredEnv = {
  REDDIT_CLIENT_ID: "cid",
  REDDIT_CLIENT_SECRET: "secret",
  REDDIT_USERNAME: "user",
  REDDIT_PASSWORD: "pass",
  USER_AGENT: "ua",
};

it("loadConfig validates required env vars", () => {
  const incompleteEnv = {
    ...requiredEnv,
    // SUBREDDIT_NAME is intentionally missing
  };

  expect(() => loadConfig(incompleteEnv as any)).toThrow();
});

it("loadConfig normalizes subreddit name and applies defaults", () => {
  const env = {
    NODE_ENV: "production",
    SUBREDDIT_NAME: "/r/KebabLog/",
    ...requiredEnv,
    REDDIT_USERNAME: "botuser",
    REDDIT_PASSWORD: "botpass",
    USER_AGENT: "test-agent",
    DB_PATH: "", // empty should be treated as undefined -> default
    DEFAULT_TIMEZONE: "", // empty -> default
    ITEMS_PER_LEVEL: "", // empty -> default
    TRACKER_COMMAND: "", // empty -> default
    LOG_LEVEL: "", // empty -> default
    POLL_INTERVAL_MS: "", // empty -> default
    REQUEST_TIMEOUT_MS: "", // empty -> default
  };

  const cfg = loadConfig(env as any);

  expect(cfg.subredditName).toBe("KebabLog");
  expect(cfg.dbPath).toBe("./data/kebab.db");
  expect(cfg.defaultTimezone).toBe("Europe/Zagreb");
  expect(cfg.itemsPerLevel).toBe(5);
  expect(cfg.trackerCommand).toBe("!kebab");
  expect(cfg.logLevel).toBe("info");
  expect(cfg.polling.pollIntervalMs).toBe(15000);
  expect(cfg.http.requestTimeoutMs).toBe(10000);
  expect(cfg.reddit.clientId).toBe("cid");
  expect(cfg.reddit.userAgent).toBe("test-agent");
  expect(cfg.nodeEnv).toBe("production");
});

it("loadConfig parses custom kebab settings", () => {
  const env = {
    SUBREDDIT_NAME: "KebabLog",
    ...requiredEnv,
    DEFAULT_TIMEZONE: "Europe/Prague",
    ITEMS_PER_LEVEL: "3",
    TRACKER_COMMAND: "!burger",
  };

  const cfg = loadConfig(env as any);

  expect(cfg.defaultTimezone).toBe("Europe/Prague");
  expect(cfg.itemsPerLevel).toBe(3);
  expect(cfg.trackerCommand).toBe("!burger");
});
