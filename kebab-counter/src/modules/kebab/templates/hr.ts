import type { KebabLevel } from "../levels";
import { formatDurationHr } from "../time";

export type KebabDashboardReplyData = {
  rating: number | null;
  globalDeltaMs: number | null;
  personalDeltaMs: number | null;
  totalKebabs: number;
  level: KebabLevel;
  avgRating: number | null;
};

export function renderKebabSuccessDashboardReply(data: KebabDashboardReplyData): string {
  const header = [
    "🌯 **Kebab zabilježen!**",
    data.rating !== null ? `(Ocjena: ${data.rating}/10)` : null,
  ]
    .filter(Boolean)
    .join(" ");

  const globalLine =
    data.globalDeltaMs === null
      ? "🚀 **Sat subreddita:** Prvi kebab ikad ovdje. Sat je upravo pokrenut."
      : `🚨 **Sat subreddita:** Niz je prekinut! Sub je bio bez kebaba \`${formatDurationHr(
          data.globalDeltaMs,
        )}\`. Sat je resetiran na 0.`;

  const personalLine =
    data.personalDeltaMs === null
      ? "⏱️ **Tvoj osobni niz:** Ovo ti je prvi zapis. Dobrodošao!"
      : `⏱️ **Tvoj osobni niz:** Prošlo je \`${formatDurationHr(
          data.personalDeltaMs,
        )}\` od zadnjeg loga.`;

  let statLine = `📈 **Tvoja statistika:** Razina **${data.level.level}** — ${data.level.title} (**${data.totalKebabs}** ukupno).`;
  if (data.avgRating !== null) {
    statLine += ` Prosječna ocjena: \`${data.avgRating.toFixed(1)}/10\`.`;
  }

  // Join paragraphs with an explicit double-newline so Reddit shows clear
  // paragraph breaks regardless of surrounding content.
  return [header, globalLine, personalLine, statLine].join("\n\n");
}

export function renderKebabCooldownReply(options: {
  remainingMs: number;
  trackerCommand: string;
}): string {
  const remaining = formatDurationHr(options.remainingMs);

  return [
    "⏳ **Polako!**",
    "",
    `Možeš logirati novi kebab za \`${remaining}\`.`,
    "",
    `Probaj kasnije: \`${options.trackerCommand}\` ili \`${options.trackerCommand} 8/10\`.`,
  ].join("\n");
}

export function renderKebabInvalidRatingReply(options: {
  trackerCommand: string;
}): string {
  return [
    "❓ **Ne kužim.** Ocjena mora biti između 1/10 i 10/10 (npr. 8/10).",
    "",
    `Primjeri: \`${options.trackerCommand}\`, \`${options.trackerCommand} 8/10\``,
  ].join("\n");
}
