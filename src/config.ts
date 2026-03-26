import { type LogLevel } from "./logger";
import * as z from "zod";

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
  kebabCooldownMs: number;
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

const EnvSchema = z.object({
  NODE_ENV: z.string().default("development"),
  SUBREDDIT_NAME: z.string().min(1),
  DB_PATH: z.string().default("./data/kebab.db"),
  KEBAB_COOLDOWN_HOURS: z.coerce
    .number()
    .positive()
    .default(4)
    .refine((n) => n <= 24 * 7, {
      message: "KEBAB_COOLDOWN_HOURS is too high (max 168 hours = 7 days)",
    }),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
  POLL_INTERVAL_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(15_000)
    .refine((n) => n >= 5_000, {
      message: "POLL_INTERVAL_MS is too low (minimum 5000)",
    }),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  REDDIT_CLIENT_ID: z.string().min(1),
  REDDIT_CLIENT_SECRET: z.string().min(1),
  REDDIT_USERNAME: z.string().min(1),
  REDDIT_PASSWORD: z.string().min(1),
  USER_AGENT: z.string().min(1),
});

/** Normalizes common subreddit inputs to a plain name (no leading `r/`). */
function normalizeSubredditName(raw: string): string {
  return raw
    .trim()
    .replace(/^\/?r\//i, "")
    .replace(/^r\//i, "")
    .replace(/^\//, "")
    .replace(/\/$/, "");
}

/**
 * Load and validate configuration using Zod.
 *
 * Converts empty strings to `undefined` so that Zod defaults apply.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const get = (key: string): string | undefined => {
    const v = env[key];
    if (v === undefined) return undefined;
    const t = v.trim();
    return t === "" ? undefined : t;
  };

  const raw = {
    NODE_ENV: get("NODE_ENV"),
    SUBREDDIT_NAME: get("SUBREDDIT_NAME"),
    DB_PATH: get("DB_PATH"),
    KEBAB_COOLDOWN_HOURS: get("KEBAB_COOLDOWN_HOURS"),
    LOG_LEVEL: get("LOG_LEVEL")?.toLowerCase(),
    POLL_INTERVAL_MS: get("POLL_INTERVAL_MS"),
    REQUEST_TIMEOUT_MS: get("REQUEST_TIMEOUT_MS"),
    REDDIT_CLIENT_ID: get("REDDIT_CLIENT_ID"),
    REDDIT_CLIENT_SECRET: get("REDDIT_CLIENT_SECRET"),
    REDDIT_USERNAME: get("REDDIT_USERNAME"),
    REDDIT_PASSWORD: get("REDDIT_PASSWORD"),
    USER_AGENT: get("USER_AGENT"),
  };

  const parsed = EnvSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }

  const cfg = parsed.data;
  const subredditName = normalizeSubredditName(cfg.SUBREDDIT_NAME);

  return {
    nodeEnv: cfg.NODE_ENV,
    subredditName,
    dbPath: cfg.DB_PATH,
    kebabCooldownMs: Math.round(cfg.KEBAB_COOLDOWN_HOURS * 60 * 60 * 1000),
    logLevel: cfg.LOG_LEVEL,
    polling: { pollIntervalMs: cfg.POLL_INTERVAL_MS },
    http: { requestTimeoutMs: cfg.REQUEST_TIMEOUT_MS },
    reddit: {
      clientId: cfg.REDDIT_CLIENT_ID,
      clientSecret: cfg.REDDIT_CLIENT_SECRET,
      username: cfg.REDDIT_USERNAME,
      password: cfg.REDDIT_PASSWORD,
      userAgent: cfg.USER_AGENT,
    },
  };
}
