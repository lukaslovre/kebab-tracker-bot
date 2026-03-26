import { DateTime } from "luxon";

/**
 * Time helpers for the kebab domain.
 *
 * Key constraints:
 * - Store timestamps in UTC (DB rows are ISO UTC strings).
 * - User input for backdates is interpreted in the configured local timezone.
 */

export type ParseLocalTimeToUtcResult =
  | { ok: true; utc: Date }
  | { ok: false; message: string };

/**
 * Parse a local date/time in a specific IANA time zone and convert it to a UTC `Date`.
 *
 * DST handling:
 * - For invalid local times (spring-forward gap), Luxon may normalize; we
 *   detect this via round-trip formatting and reject with a helpful message.
 * - For ambiguous local times (fall-back), Luxon deterministically picks one
 *   of the two possible instants.
 */
export function parseLocalTimeToUtc(
  dateStr: string,
  timeStr: string | undefined,
  timeZone: string,
): ParseLocalTimeToUtcResult {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return {
      ok: false,
      message: "Datum mora biti oblika YYYY-MM-DD (npr. 2026-03-15).",
    };
  }

  const hasTime = timeStr !== undefined;
  if (hasTime && !/^\d{2}:\d{2}$/.test(timeStr)) {
    return {
      ok: false,
      message: "Vrijeme mora biti oblika HH:mm (npr. 18:30).",
    };
  }

  const format = hasTime ? "yyyy-MM-dd HH:mm" : "yyyy-MM-dd";
  const input = hasTime ? `${dateStr} ${timeStr}` : dateStr;

  const dt = DateTime.fromFormat(input, format, {
    zone: timeZone,
    locale: "hr",
  });

  if (!dt.isValid) {
    return { ok: false, message: "Neispravan datum ili vrijeme." };
  }

  if (dt.year < 1970 || dt.year > 2100) {
    return { ok: false, message: "Godina mora biti između 1970 i 2100." };
  }

  // Round-trip validation: catches DST gaps where Luxon normalizes to the next
  // valid time (and also protects against weird overflows).
  if (dt.toFormat(format) !== input) {
    return {
      ok: false,
      message:
        "Nevažeće lokalno vrijeme (moguće zbog pomaka sata / DST). Probaj drugi sat ili izostavi vrijeme.",
    };
  }

  return { ok: true, utc: dt.toUTC().toJSDate() };
}

export function formatUtcInTimeZone(dateUtc: Date, timeZone: string): string {
  return DateTime.fromJSDate(dateUtc, { zone: "utc" })
    .setZone(timeZone)
    .toFormat("yyyy-MM-dd HH:mm");
}

function croPlural(n: number, one: string, few: string, many: string): string {
  const mod10 = n % 10;
  const mod100 = n % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
  return many;
}

export function formatDurationHr(
  deltaMs: number,
  options: { maxParts?: number } = {},
): string {
  const maxParts = options.maxParts ?? 2;
  const clampedMs = Math.max(0, Math.floor(deltaMs));

  const totalSeconds = Math.floor(clampedMs / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const seconds = totalSeconds % 60;

  const parts: string[] = [];

  if (days > 0) {
    parts.push(`${days} ${croPlural(days, "dan", "dana", "dana")}`);
  }
  if (hours > 0 && parts.length < maxParts) {
    parts.push(`${hours} ${croPlural(hours, "sat", "sata", "sati")}`);
  }
  if (minutes > 0 && parts.length < maxParts) {
    parts.push(
      `${minutes} ${croPlural(minutes, "minuta", "minute", "minuta")}`,
    );
  }

  if (parts.length === 0) {
    parts.push(
      `${seconds} ${croPlural(seconds, "sekunda", "sekunde", "sekundi")}`,
    );
  }

  return parts.join(", ");
}
