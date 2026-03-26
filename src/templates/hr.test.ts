import { describe, expect, it } from "bun:test";
import { getKebabLevel } from "../kebab/levels";
import { formatDurationHr } from "../kebab/time";
import { renderKebabDashboardReply } from "./hr";

describe("renderKebabDashboardReply", () => {
  it("renders exact output for a first-time user", () => {
    const out = renderKebabDashboardReply({
      rating: null,
      isBackdated: false,
      eatenAtLocal: "2026-03-15 12:00",
      globalDeltaMs: null,
      personalDeltaMs: null,
      totalKebabs: 1,
      level: getKebabLevel(1),
      avgRating: null,
    });

    expect(out).toBe(
      [
        "🌯 **Kebab zabilježen!**",
        "",
        "🚨 **Sat subreddita:** Ovo je prvi zabilježeni kebab ovdje. Sat kreće od 0.",
        "⏱️ **Tvoj osobni niz:** Ovo ti je prvi zapis. Dobrodošao!",
        "📈 **Tvoja statistika:** Razina **1** — Doner početnik (**1** ukupno). Prosječna ocjena: `—`.",
        "",
        "^(_Za retroaktivni unos: `!kebab YYYY-MM-DD` ili `!kebab YYYY-MM-DD HH:mm`_)",
      ].join("\n"),
    );
  });

  it("renders exact output for a backdated entry (includes retro tags)", () => {
    const out = renderKebabDashboardReply({
      rating: 8,
      isBackdated: true,
      eatenAtLocal: "2026-03-15 12:00",
      globalDeltaMs: 2 * 86_400_000 + 4 * 3_600_000,
      personalDeltaMs: 14 * 86_400_000,
      totalKebabs: 14,
      level: getKebabLevel(14),
      avgRating: 7.2,
    });

    expect(out).toBe(
      [
        "🌯 **Kebab zabilježen!** (Ocjena: 8/10)",
        "📅 *Retroaktivno:* 2026-03-15 12:00 (CET/CEST)",
        "",
        "🚨 **Sat subreddita (retro):** Na taj datum sub je bio bez kebaba `2 dana, 4 sata`.",
        "⏱️ **Tvoj osobni niz (retro):** Tada je prošlo `14 dana` od tvog zadnjeg loga.",
        "📈 **Tvoja statistika:** Razina **3** — Döner znalac (**14** ukupno). Prosječna ocjena: `7.2/10`.",
        "",
        "^(_Za retroaktivni unos: `!kebab YYYY-MM-DD` ili `!kebab YYYY-MM-DD HH:mm`_)",
      ].join("\n"),
    );
  });
});

describe("formatDurationHr (pluralization)", () => {
  it("formats Croatian day plural forms", () => {
    expect(formatDurationHr(1 * 86_400_000)).toBe("1 dan");
    expect(formatDurationHr(2 * 86_400_000)).toBe("2 dana");
    expect(formatDurationHr(5 * 86_400_000)).toBe("5 dana");
  });
});
