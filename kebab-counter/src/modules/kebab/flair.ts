import type { KebabLevel } from "./levels";

export function buildFlairText(level: KebabLevel): string {
  return `Razina ${level.level} — ${level.title}`;
}
