import { type KebabLevel } from "../kebab/levels";
import { formatDurationHr } from "../kebab/time";

export type KebabDashboardReplyData = {
  rating: number | null;
  isBackdated: boolean;
  /** Display timestamp in `Europe/Zagreb` as `YYYY-MM-DD HH:mm`. */
  eatenAtLocal: string;
  globalDeltaMs: number | null;
  personalDeltaMs: number | null;
  totalKebabs: number;
  level: KebabLevel;
  avgRating: number | null;
};

export function renderKebabDashboardReply(
  data: KebabDashboardReplyData,
): string {
  const headerParts: string[] = ["🌯 **Kebab zabilježen!**"];
  if (data.rating !== null) headerParts.push(`(Ocjena: ${data.rating}/10)`);
  const header = headerParts.join(" ");

  const lines: string[] = [header];

  if (data.isBackdated) {
    // Keep it explicit so users don't confuse a retro entry with “now”.
    lines.push(`📅 *Retroaktivno:* ${data.eatenAtLocal} (CET/CEST)`);
  }

  lines.push("");

  // Global streak (subreddit clock)
  if (data.globalDeltaMs === null) {
    lines.push(
      "🚨 **Sat subreddita:** Ovo je prvi zabilježeni kebab ovdje. Sat kreće od 0.",
    );
  } else if (data.isBackdated) {
    lines.push(
      `🚨 **Sat subreddita (retro):** Na taj datum sub je bio bez kebaba \`${formatDurationHr(
        data.globalDeltaMs,
      )}\`.`,
    );
  } else {
    lines.push(
      `🚨 **Sat subreddita:** Niz je prekinut! Sub je bio bez kebaba \`${formatDurationHr(
        data.globalDeltaMs,
      )}\`. Sat je resetiran na 0.`,
    );
  }

  // Personal streak
  if (data.personalDeltaMs === null) {
    lines.push("⏱️ **Tvoj osobni niz:** Ovo ti je prvi zapis. Dobrodošao!");
  } else if (data.isBackdated) {
    lines.push(
      `⏱️ **Tvoj osobni niz (retro):** Tada je prošlo \`${formatDurationHr(
        data.personalDeltaMs,
      )}\` od tvog zadnjeg loga.`,
    );
  } else {
    lines.push(
      `⏱️ **Tvoj osobni niz:** Prošlo je \`${formatDurationHr(
        data.personalDeltaMs,
      )}\` od zadnjeg loga.`,
    );
  }

  // Stats
  const avg =
    data.avgRating === null
      ? "—"
      : // One decimal keeps it readable and matches the spec example (7.2/10).
        `${data.avgRating.toFixed(1)}/10`;

  lines.push(
    `📈 **Tvoja statistika:** Razina **${data.level.level}** — ${data.level.title} (**${data.totalKebabs}** ukupno). Prosječna ocjena: \`${avg}\`.`,
  );

  lines.push("");
  lines.push(
    "^(_Za retroaktivni unos: `!kebab YYYY-MM-DD` ili `!kebab YYYY-MM-DD HH:mm`_)",
  );

  return lines.join("\n");
}

export function renderKebabCooldownReply(options: {
  nextAllowedAtLocal: string;
}): string {
  return [
    "⏳ **Polako!**",
    "",
    `Možeš logirati novi kebab nakon **${options.nextAllowedAtLocal}** (CET/CEST).`,
    "",
    "Primjeri:",
    "- `!kebab`",
    "- `!kebab 8/10`",
    "- `!kebab 2026-03-15`",
  ].join("\n");
}

export function renderKebabFutureDateReply(): string {
  return [
    "🚫 **Kebab iz budućnosti ne prolazi.**",
    "",
    "Datum mora biti danas ili u prošlosti.",
    "",
    "Primjeri:",
    "- `!kebab`",
    "- `!kebab 8/10`",
    "- `!kebab 2026-03-15`",
    "- `!kebab 8/10 2026-03-15 18:30`",
  ].join("\n");
}

export function renderKebabParseErrorReply(message: string): string {
  return [
    `❓ **Ne kužim.** ${message}`,
    "",
    "Primjeri:",
    "- `!kebab`",
    "- `!kebab 8/10`",
    "- `!kebab 2026-03-15`",
    "- `!kebab 8/10 2026-03-15 18:30`",
  ].join("\n");
}
