/**
 * Time helpers for the kebab domain.
 *
 * Key constraints:
 * - Store timestamps in UTC (DB rows are ISO UTC strings).
 * - User input for backdates is interpreted in the Croatian locale timezone.
 *
 * We intentionally do NOT pull a heavy date library for the MVP.
 * Instead, we implement a small IANA-timezone conversion using `Intl`.
 */

export const HR_TIME_ZONE = "Europe/Zagreb";

export type LocalDateTimeParts = {
  year: number;
  month: number; // 1..12
  day: number; // 1..31 (validated via roundtrip)
  hour: number; // 0..23
  minute: number; // 0..59
};

const dtfCache = new Map<string, Intl.DateTimeFormat>();

function getFormatter(timeZone: string): Intl.DateTimeFormat {
  const cached = dtfCache.get(timeZone);
  if (cached) return cached;

  // Use a locale with stable numeric output; we still read via formatToParts.
  const dtf = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  dtfCache.set(timeZone, dtf);
  return dtf;
}

function getTimeZoneParts(
  dateUtc: Date,
  timeZone: string,
): LocalDateTimeParts & {
  second: number;
} {
  const parts = getFormatter(timeZone).formatToParts(dateUtc);

  // `formatToParts` returns a predictable set, but we still guard because
  // TypeScript can't know it.
  let year = "";
  let month = "";
  let day = "";
  let hour = "";
  let minute = "";
  let second = "";

  for (const p of parts) {
    if (p.type === "year") year = p.value;
    else if (p.type === "month") month = p.value;
    else if (p.type === "day") day = p.value;
    else if (p.type === "hour") hour = p.value;
    else if (p.type === "minute") minute = p.value;
    else if (p.type === "second") second = p.value;
  }

  return {
    year: Number.parseInt(year, 10),
    month: Number.parseInt(month, 10),
    day: Number.parseInt(day, 10),
    hour: Number.parseInt(hour, 10),
    minute: Number.parseInt(minute, 10),
    second: Number.parseInt(second, 10),
  };
}

/**
 * Returns the timezone offset at `dateUtc` for `timeZone`, in milliseconds.
 *
 * The sign convention matches date-fns-tz style:
 * - For CET (UTC+1), the offset is +3600000.
 */
function getTimeZoneOffsetMs(dateUtc: Date, timeZone: string): number {
  const p = getTimeZoneParts(dateUtc, timeZone);
  const asUtc = Date.UTC(
    p.year,
    p.month - 1,
    p.day,
    p.hour,
    p.minute,
    p.second,
  );
  return asUtc - dateUtc.getTime();
}

export type ZonedToUtcResult =
  | { ok: true; utc: Date }
  | { ok: false; message: string };

/**
 * Convert a local time in an IANA time zone (e.g. Europe/Zagreb) into a UTC Date.
 *
 * Handles DST by doing an offset round-trip check. If the input is an invalid
 * local time (e.g. during the spring-forward gap), we reject.
 *
 * For ambiguous local times (fall-back), the result picks one of the possible
 * instants (the one `Intl` resolves through our offset iteration).
 */
export function zonedLocalDateTimeToUtc(
  input: LocalDateTimeParts,
  timeZone: string,
): ZonedToUtcResult {
  if (!Number.isInteger(input.year) || input.year < 1970 || input.year > 2100) {
    return { ok: false, message: "Godina mora biti između 1970 i 2100." };
  }
  if (!Number.isInteger(input.month) || input.month < 1 || input.month > 12) {
    return { ok: false, message: "Mjesec mora biti 01-12." };
  }
  if (!Number.isInteger(input.day) || input.day < 1 || input.day > 31) {
    return { ok: false, message: "Dan mora biti 01-31." };
  }
  if (!Number.isInteger(input.hour) || input.hour < 0 || input.hour > 23) {
    return { ok: false, message: "Sat mora biti 00-23." };
  }
  if (
    !Number.isInteger(input.minute) ||
    input.minute < 0 ||
    input.minute > 59
  ) {
    return { ok: false, message: "Minute moraju biti 00-59." };
  }

  // First guess: interpret the given components as if they were UTC.
  const guessUtcMs = Date.UTC(
    input.year,
    input.month - 1,
    input.day,
    input.hour,
    input.minute,
    0,
    0,
  );

  // Iteratively adjust by timezone offset.
  let utcMs = guessUtcMs;
  const offset1 = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  utcMs = guessUtcMs - offset1;
  const offset2 = getTimeZoneOffsetMs(new Date(utcMs), timeZone);
  if (offset2 !== offset1) {
    utcMs = guessUtcMs - offset2;
  }

  const utc = new Date(utcMs);

  // Round-trip validation: format back in the timezone and ensure components match.
  const rt = getTimeZoneParts(utc, timeZone);
  if (
    rt.year !== input.year ||
    rt.month !== input.month ||
    rt.day !== input.day ||
    rt.hour !== input.hour ||
    rt.minute !== input.minute
  ) {
    return {
      ok: false,
      message:
        "Nevažeće lokalno vrijeme (moguće zbog pomaka sata / DST). Probaj drugi sat ili izostavi vrijeme.",
    };
  }

  return { ok: true, utc };
}

export function formatUtcInTimeZone(dateUtc: Date, timeZone: string): string {
  const p = getTimeZoneParts(dateUtc, timeZone);
  const yyyy = String(p.year).padStart(4, "0");
  const mm = String(p.month).padStart(2, "0");
  const dd = String(p.day).padStart(2, "0");
  const hh = String(p.hour).padStart(2, "0");
  const min = String(p.minute).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
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
