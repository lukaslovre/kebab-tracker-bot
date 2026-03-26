/**
 * Lightweight “level” logic.
 *
 * The roadmap intentionally left level thresholds open.
 * For the MVP, we use a simple rule that matches the spec example:
 * - level increases every 5 logged kebabs
 *   (so 14 total => level 3)
 */

export type KebabLevel = {
  level: number;
  title: string;
};

const TITLES: string[] = [
  "Doner početnik",
  "Lepinja šegrt",
  "Döner znalac",
  "Majstor umaka",
  "Kebab veteran",
  "Kebab legenda",
  "Kebab mit",
];

export function getKebabLevel(totalKebabs: number): KebabLevel {
  const safeTotal = Number.isFinite(totalKebabs)
    ? Math.max(0, Math.floor(totalKebabs))
    : 0;

  const level = Math.floor(safeTotal / 5) + 1;

  const idx = Math.min(Math.max(level, 1), TITLES.length) - 1;
  const title = TITLES[idx] ?? TITLES[TITLES.length - 1] ?? "Kebab legenda";

  return { level, title };
}
