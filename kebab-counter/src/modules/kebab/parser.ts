export type ParsedKebabCommand = {
  found: true;
  rating: number | null;
};

export type KebabCommandParseError =
  | {
      found: true;
      ok: false;
      kind: "invalid_rating";
      raw: string;
    }
  | {
      found: true;
      ok: false;
      kind: "backdating_not_supported";
      raw: string;
    };

export type ParseKebabCommandResult =
  | { found: false }
  | ({ found: true; ok: true } & ParsedKebabCommand)
  | KebabCommandParseError;

const RATING_RE = /\b(\d+)\s*\/\s*10\b/i;
const DATE_TIME_RE = /\b(\d{4}-\d{2}-\d{2})(?:[ T]+(\d{2}:\d{2}))?\b/;
const REGEX_SPECIALS_RE = /[.*+?^${}()|[\]\\]/g;

export function buildTrackerCommandRegex(trackerCommand: string): RegExp {
  const escaped = trackerCommand.replace(REGEX_SPECIALS_RE, "\\$&");
  return new RegExp(`${escaped}\\b`, "i");
}

export function parseKebabCommand(
  text: string,
  trackerCommandRegex: RegExp,
): ParseKebabCommandResult {
  const match = trackerCommandRegex.exec(text);
  if (!match || match.index === undefined) return { found: false };

  const rest = text.slice(match.index + match[0].length);

  const dateMatch = DATE_TIME_RE.exec(rest);
  if (dateMatch) {
    return {
      found: true,
      ok: false,
      kind: "backdating_not_supported",
      raw: dateMatch[0],
    };
  }

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
      };
    }
    rating = n;
  }

  return {
    found: true,
    ok: true,
    rating,
  };
}
