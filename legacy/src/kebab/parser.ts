/**
 * Tracker command parsing.
 *
 * Goals for the MVP:
 * - Detect the command anywhere in the comment body.
 * - Support flexible argument ordering.
 * - Keep parsing strict enough to avoid surprise inputs.
 */

export type ParsedKebabCommand = {
  /** Whether the comment contained a tracker command at all. */
  found: true;
  /** Optional rating 1..10 (e.g. `8/10`). */
  rating: number | null;
  /** Optional backdate argument. */
  backdate: {
    /** YYYY-MM-DD */
    date: string;
    /** HH:mm (24h) */
    time?: string;
    /** The exact substring we matched from the comment body. */
    raw: string;
  } | null;
};

export type KebabCommandParseError =
  | {
      found: true;
      ok: false;
      kind: "invalid_rating";
      raw: string;
      message: string;
    }
  | {
      found: true;
      ok: false;
      kind: "invalid_date";
      raw: string;
      message: string;
    };

export type ParseKebabCommandResult =
  | { found: false }
  | ({ found: true; ok: true } & ParsedKebabCommand)
  | KebabCommandParseError;

const RATING_RE = /\b(\d{1,2})\s*\/\s*10\b/i;
// `YYYY-MM-DD` with optional time `HH:mm` separated by whitespace or `T`.
const DATE_TIME_RE = /\b(\d{4}-\d{2}-\d{2})(?:[ T]+(\d{2}:\d{2}))?\b/;

const REGEX_SPECIALS_RE = /[.*+?^${}()|[\]\\]/g;

export function buildTrackerCommandRegex(trackerCommand: string): RegExp {
  const escaped = trackerCommand.replace(REGEX_SPECIALS_RE, "\\$&");
  return new RegExp(`${escaped}\\b`, "i");
}

/**
 * Parse a single tracker command from the comment body.
 *
 * Returns `{ found: false }` if the body doesn't contain the configured command.
 */
export function parseKebabCommand(
  body: string,
  trackerCommandRegex: RegExp,
): ParseKebabCommandResult {
  const match = trackerCommandRegex.exec(body);
  if (!match || match.index === undefined) return { found: false };

  // Only parse arguments after the first tracker command occurrence.
  const rest = body.slice(match.index + match[0].length);

  let rating: number | null = null;
  const ratingMatch = RATING_RE.exec(rest);
  if (ratingMatch) {
    const raw = ratingMatch[0];
    const n = Number.parseInt(ratingMatch[1] ?? "", 10);
    if (!Number.isFinite(n) || n < 1 || n > 10) {
      return {
        found: true,
        ok: false,
        kind: "invalid_rating",
        raw,
        message: "Ocjena mora biti između 1/10 i 10/10.",
      };
    }
    rating = n;
  }

  let backdate: ParsedKebabCommand["backdate"] = null;
  const dateMatch = DATE_TIME_RE.exec(rest);
  if (dateMatch) {
    const date = dateMatch[1] ?? "";
    const time = dateMatch[2] ?? undefined;

    // Quick sanity checks here; deeper validation happens when converting
    // to a real timestamp in the timezone helper.
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return {
        found: true,
        ok: false,
        kind: "invalid_date",
        raw: dateMatch[0],
        message: "Datum mora biti oblika YYYY-MM-DD (npr. 2026-03-15).",
      };
    }

    if (time !== undefined && !/^\d{2}:\d{2}$/.test(time)) {
      return {
        found: true,
        ok: false,
        kind: "invalid_date",
        raw: dateMatch[0],
        message: "Vrijeme mora biti oblika HH:mm (npr. 18:30).",
      };
    }

    backdate = {
      date,
      time,
      raw: dateMatch[0],
    };
  }

  return {
    found: true,
    ok: true,
    rating,
    backdate,
  };
}
