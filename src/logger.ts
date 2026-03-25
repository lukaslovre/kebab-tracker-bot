// TODO: How much would this be simplified by switching to Pino for example?

/**
 * Minimal structured logger for long-running services.
 *
 * - Writes one JSON object per line to stdout/stderr (nice for Docker/Coolify logs).
 * - Supports log levels.
 * - Supports `child()` loggers that attach context fields (e.g. `{ component: "reddit" }`).
 * - Provides `exception()` to serialize unknown thrown values consistently.
 *
 * This is intentionally dependency-free for the MVP.
 */

/** Allowed log levels. */
export type LogLevel = "debug" | "info" | "warn" | "error";

/** Extra key/value pairs to attach to each log line. */
export type LogFields = Record<string, unknown>;

/** Logger interface used across the app. */
export type Logger = {
  child(fields: LogFields): Logger;
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  exception(msg: string, error: unknown, fields?: LogFields): void;
};

type LoggerOptions = {
  level: LogLevel;
  base?: LogFields;
};

const LEVEL_ORDER: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

export function createLogger(options: LoggerOptions): Logger {
  const base = options.base ?? {};
  const min = LEVEL_ORDER[options.level];

  const make = (scope: LogFields): Logger => {
    const mergedBase = { ...base, ...scope };

    const write = (level: LogLevel, msg: string, fields?: LogFields, err?: unknown) => {
      if (LEVEL_ORDER[level] < min) return;

      const entry: Record<string, unknown> = {
        ts: new Date().toISOString(),
        level,
        msg,
        ...mergedBase,
        ...(fields ?? {}),
      };

      if (err !== undefined) {
        entry.err = serializeError(err);
      }

      const line = JSON.stringify(entry);
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.log(line);
    };

    return {
      child: (fields) => make({ ...mergedBase, ...fields }),
      debug: (msg, fields) => write("debug", msg, fields),
      info: (msg, fields) => write("info", msg, fields),
      warn: (msg, fields) => write("warn", msg, fields),
      error: (msg, fields) => write("error", msg, fields),
      exception: (msg, error, fields) => write("error", msg, fields, error),
    };
  };

  return make({});
}

function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const anyError = error as Error & { code?: unknown };
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
      code: anyError.code,
      cause: serializeCause(error.cause),
    };
  }

  if (typeof error === "string") {
    return { message: error };
  }

  if (typeof error === "object" && error !== null) {
    return { message: "Non-Error thrown", value: safeJson(error) };
  }

  return { message: "Non-Error thrown", value: String(error) };
}

function serializeCause(cause: unknown): unknown {
  if (cause === undefined) return undefined;
  if (cause instanceof Error) return serializeError(cause);
  if (typeof cause === "string") return cause;
  if (typeof cause === "object" && cause !== null) return safeJson(cause);
  return String(cause);
}

function safeJson(value: unknown): unknown {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return "[unserializable]";
  }
}
