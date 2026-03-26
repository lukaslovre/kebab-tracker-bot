import { it, expect } from "bun:test";
import { loadConfig } from "./config";

it("loadConfig validates required env vars", () => {
  const incompleteEnv = {
    REDDIT_CLIENT_ID: "cid",
    REDDIT_CLIENT_SECRET: "secret",
    REDDIT_USERNAME: "user",
    REDDIT_PASSWORD: "pass",
    USER_AGENT: "ua",
    // SUBREDDIT_NAME is intentionally missing
  };

  expect(() => loadConfig(incompleteEnv as any)).toThrow();
});

it("loadConfig normalizes subreddit name and applies defaults", () => {
  const env = {
    NODE_ENV: "production",
    SUBREDDIT_NAME: "/r/KebabLog/",
    REDDIT_CLIENT_ID: "cid",
    REDDIT_CLIENT_SECRET: "secret",
    REDDIT_USERNAME: "botuser",
    REDDIT_PASSWORD: "botpass",
    USER_AGENT: "test-agent",
    DB_PATH: "", // empty should be treated as undefined -> default
    LOG_LEVEL: "", // empty -> default
    POLL_INTERVAL_MS: "", // empty -> default
    REQUEST_TIMEOUT_MS: "", // empty -> default
  };

  const cfg = loadConfig(env as any);

  expect(cfg.subredditName).toBe("KebabLog");
  expect(cfg.dbPath).toBe("./data/kebab.db");
  expect(cfg.logLevel).toBe("info");
  expect(cfg.polling.pollIntervalMs).toBe(15000);
  expect(cfg.http.requestTimeoutMs).toBe(10000);
  expect(cfg.reddit.clientId).toBe("cid");
  expect(cfg.reddit.userAgent).toBe("test-agent");
  expect(cfg.nodeEnv).toBe("production");
});
