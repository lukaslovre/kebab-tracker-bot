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
    parts.push(`${minutes} ${croPlural(minutes, "minuta", "minute", "minuta")}`);
  }

  if (parts.length === 0) {
    parts.push(
      `${seconds} ${croPlural(seconds, "sekunda", "sekunde", "sekundi")}`,
    );
  }

  return parts.join(", ");
}
