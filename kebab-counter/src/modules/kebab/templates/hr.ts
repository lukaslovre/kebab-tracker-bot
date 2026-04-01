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

export function renderKebabSuccessDashboardReply(
  data: KebabDashboardReplyData,
): string {
  const headerParts: string[] = ["🌯 **Kebab zabilježen!**"];
  if (data.rating !== null) headerParts.push(`(Ocjena: ${data.rating}/10)`);

  const lines: string[] = [headerParts.join(" "), ""];

  if (data.globalDeltaMs === null) {
    lines.push(
      "🚀 **Sat subreddita:** Prvi kebab ikad ovdje. Sat je upravo pokrenut.",
    );
  } else {
    lines.push(
      `🚨 **Sat subreddita:** Niz je prekinut! Sub je bio bez kebaba \`${formatDurationHr(
        data.globalDeltaMs,
      )}\`. Sat je resetiran na 0.`,
    );
  }

  if (data.personalDeltaMs === null) {
    lines.push("⏱️ **Tvoj osobni niz:** Ovo ti je prvi zapis. Dobrodošao!");
  } else {
    lines.push(
      `⏱️ **Tvoj osobni niz:** Prošlo je \`${formatDurationHr(
        data.personalDeltaMs,
      )}\` od zadnjeg loga.`,
    );
  }

  const statParts: string[] = [
    `📈 **Tvoja statistika:** Razina **${data.level.level}** — ${data.level.title} (**${data.totalKebabs}** ukupno).`,
  ];

  if (data.avgRating !== null) {
    statParts.push(`Prosječna ocjena: \`${data.avgRating.toFixed(1)}/10\`.`);
  }

  lines.push(statParts.join(" "));

  return lines.join("\n");
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

export function renderKebabBackdatingNotSupportedReply(options: {
  trackerCommand: string;
}): string {
  return [
    "🚫 **Retro logovi više ne postoje.** Kebab se računa samo za \"sad\".",
    "",
    `Primjeri: \`${options.trackerCommand}\`, \`${options.trackerCommand} 8/10\``,
  ].join("\n");
}
