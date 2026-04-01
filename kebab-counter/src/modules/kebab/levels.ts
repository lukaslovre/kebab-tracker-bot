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

export function getKebabLevel(
  totalKebabs: number,
  itemsPerLevel: number,
): KebabLevel {
  const safeTotal = Number.isFinite(totalKebabs)
    ? Math.max(0, Math.floor(totalKebabs))
    : 0;
  const safeItemsPerLevel = Number.isFinite(itemsPerLevel)
    ? Math.max(1, Math.floor(itemsPerLevel))
    : 1;

  const level = Math.floor(safeTotal / safeItemsPerLevel) + 1;

  const idx = Math.min(Math.max(level, 1), TITLES.length) - 1;
  const title = TITLES[idx] ?? TITLES[TITLES.length - 1] ?? "Kebab mit";

  return { level, title };
}
