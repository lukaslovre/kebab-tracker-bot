import { type LogLevel } from "./logger";

/**
 * App configuration loader.
 *
 * This module reads from `process.env` and returns a typed config object.
 *
 * The goal is:
 * - fail fast on boot with clear errors
 * - centralize defaults and parsing in one place
 */

export type AppConfig = {
  nodeEnv: string;
  subredditName: string;
  dbPath: string;
  logLevel: LogLevel;
  polling: {
    pollIntervalMs: number;
  };
  http: {
    requestTimeoutMs: number;
  };
  reddit: {
    clientId: string;
    clientSecret: string;
    username: string;
    password: string;
    userAgent: string;
  };
};

/**
 * Load and validate configuration.
 *
 * @throws If required env vars are missing/blank or if any value is invalid.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const missing: string[] = [];
  // Collect missing keys so we can throw a single actionable error.
  const requireEnv = (key: string): string => {
    const value = env[key];
    if (value === undefined || value.trim() === "") {
      missing.push(key);
      return "";
    }
    return value;
  };

  const nodeEnv = env.NODE_ENV?.trim() || "development";

  // Accept SUBREDDIT_NAME as "KebabLog" or "r/KebabLog" and normalize to "KebabLog".
  const subredditNameRaw = requireEnv("SUBREDDIT_NAME");
  const subredditName = normalizeSubredditName(subredditNameRaw);

  const logLevelRaw = (env.LOG_LEVEL ?? "info").trim().toLowerCase();
  const logLevel = parseLogLevel(logLevelRaw);

  const dbPath = (env.DB_PATH?.trim() || "./data/kebab.db").trim();

  const pollIntervalMs = parsePositiveInt(env.POLL_INTERVAL_MS, 15_000);
  if (pollIntervalMs < 5_000) {
    throw new Error(
      `POLL_INTERVAL_MS is too low (${pollIntervalMs}). Use at least 5000ms to avoid API spam.`,
    );
  }

  const requestTimeoutMs = parsePositiveInt(env.REQUEST_TIMEOUT_MS, 10_000);

  const clientId = requireEnv("REDDIT_CLIENT_ID");
  const clientSecret = requireEnv("REDDIT_CLIENT_SECRET");
  const username = requireEnv("REDDIT_USERNAME");
  const password = requireEnv("REDDIT_PASSWORD");
  const userAgent = requireEnv("USER_AGENT");

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.sort().join(", ")}. ` +
        `See .env.example for a template.`,
    );
  }

  return {
    nodeEnv,
    subredditName,
    dbPath,
    logLevel,
    polling: { pollIntervalMs },
    http: { requestTimeoutMs },
    reddit: {
      clientId,
      clientSecret,
      username,
      password,
      userAgent,
    },
  };
}

/** Normalizes common subreddit inputs to a plain name (no leading `r/`). */
function normalizeSubredditName(raw: string): string {
  return raw
    .trim()
    .replace(/^\/?r\//i, "")
    .replace(/^r\//i, "")
    .replace(/^\//, "")
    .replace(/\/$/, "");
}

/** Parse an env var as a positive integer, falling back to the provided default. */
function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value.trim() === "") return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Invalid integer: ${value}`);
  }
  return parsed;
}

/** Restrict LOG_LEVEL to known values to avoid silent typos. */
function parseLogLevel(value: string): LogLevel {
  if (
    value === "debug" ||
    value === "info" ||
    value === "warn" ||
    value === "error"
  ) {
    return value;
  }
  throw new Error(
    `Invalid LOG_LEVEL: ${value} (expected debug|info|warn|error)`,
  );
}
