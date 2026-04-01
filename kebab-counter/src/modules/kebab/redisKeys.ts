export const REDIS_KEY_GLOBAL_LAST_KEBAB_TIMESTAMP =
  "global:last_kebab_timestamp";

export const PROCESSED_ITEM_TTL_SECONDS = 60 * 60 * 24 * 7;

export function normalizeUsernameForKey(username: string): string {
  return username.trim().toLowerCase();
}

export function userTotalKebabsKey(username: string): string {
  return `user:${normalizeUsernameForKey(username)}:total_kebabs`;
}

export function userLastKebabTimestampKey(username: string): string {
  return `user:${normalizeUsernameForKey(username)}:last_kebab_timestamp`;
}

export function userRatingSumKey(username: string): string {
  return `user:${normalizeUsernameForKey(username)}:rating_sum`;
}

export function userRatingCountKey(username: string): string {
  return `user:${normalizeUsernameForKey(username)}:rating_count`;
}

export function processedItemKey(itemId: string): string {
  return `processed:${itemId}`;
}
