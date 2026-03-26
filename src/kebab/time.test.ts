import { describe, expect, it } from "bun:test";
import { formatUtcInTimeZone, parseLocalTimeToUtc } from "./time";

const timeZone = "Europe/Zagreb";

describe("time helpers (Luxon)", () => {
  it("converts Croatia-local time to UTC (winter)", () => {
    const res = parseLocalTimeToUtc("2026-03-15", "12:00", timeZone);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 12:00 in Croatia on Mar 15 is CET (UTC+1) => 11:00Z.
    expect(res.utc.toISOString()).toBe("2026-03-15T11:00:00.000Z");
    expect(formatUtcInTimeZone(res.utc, timeZone)).toBe("2026-03-15 12:00");
  });

  it("converts Croatia-local time to UTC (summer)", () => {
    const res = parseLocalTimeToUtc("2026-04-15", "12:00", timeZone);
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // 12:00 in Croatia on Apr 15 is CEST (UTC+2) => 10:00Z.
    expect(res.utc.toISOString()).toBe("2026-04-15T10:00:00.000Z");
    expect(formatUtcInTimeZone(res.utc, timeZone)).toBe("2026-04-15 12:00");
  });

  it("rejects spring-forward gap times (DST)", () => {
    // Europe/Zagreb DST starts on 2026-03-29: 02:00 -> 03:00.
    // 02:30 local does not exist.
    const res = parseLocalTimeToUtc("2026-03-29", "02:30", timeZone);
    expect(res.ok).toBe(false);
  });

  it("resolves fall-back ambiguous times consistently (DST)", () => {
    // Europe/Zagreb DST ends on 2026-10-25: 03:00 -> 02:00.
    // 02:30 local happens twice (once in CEST and once in CET).
    const a = parseLocalTimeToUtc("2026-10-25", "02:30", timeZone);
    const b = parseLocalTimeToUtc("2026-10-25", "02:30", timeZone);

    expect(a.ok).toBe(true);
    expect(b.ok).toBe(true);
    if (!a.ok || !b.ok) return;

    const iso = a.utc.toISOString();

    // Accept either disambiguation as long as it is deterministic.
    expect(["2026-10-25T00:30:00.000Z", "2026-10-25T01:30:00.000Z"]).toContain(
      iso,
    );
    expect(b.utc.toISOString()).toBe(iso);
  });
});
