import { type ParsedKebabCommand } from "./parser";
import { parseLocalTimeToUtc } from "./time";

export type ResolveEatenAtUtcResult =
  | { ok: true; eatenAtUtc: Date; isBackdated: boolean }
  | { ok: false; message: string };

/**
 * Domain adapter: resolve the kebab “eaten at” timestamp from a parsed command.
 *
 * Backdate rules (MVP):
 * - If the user provides only a date, default to 12:00 local time.
 * - If that would land in the future relative to the comment timestamp,
 *   fall back to 00:00 local for the same date.
 */
export function resolveEatenAtUtcFromCommand(options: {
  backdate: ParsedKebabCommand["backdate"];
  loggedAtUtc: Date;
  timeZone: string;
}): ResolveEatenAtUtcResult {
  const { backdate, loggedAtUtc, timeZone } = options;

  if (!backdate) {
    return { ok: true, eatenAtUtc: loggedAtUtc, isBackdated: false };
  }

  const parse = (time: string): ResolveEatenAtUtcResult => {
    const res = parseLocalTimeToUtc(backdate.date, time, timeZone);
    if (!res.ok) return res;

    const eatenAtUtc = res.utc;
    const isBackdated = eatenAtUtc.getTime() < loggedAtUtc.getTime() - 60_000;
    return { ok: true, eatenAtUtc, isBackdated };
  };

  // Exact time provided.
  if (backdate.time) return parse(backdate.time);

  // Date-only: default to 12:00 local.
  const noon = parse("12:00");
  if (!noon.ok) return noon;

  if (noon.eatenAtUtc.getTime() > loggedAtUtc.getTime()) {
    // If “today”, noon might be in the future early in the morning.
    return parse("00:00");
  }

  return noon;
}
