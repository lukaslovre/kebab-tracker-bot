import { context, reddit, redis, settings } from "@devvit/web/server";
import type { T1, T3 } from "@devvit/shared-types/tid.js";

import { buildFlairText } from "./flair";
import { getKebabLevel } from "./levels";
import { buildTrackerCommandRegex, parseKebabCommand } from "./parser";
import {
  PROCESSED_ITEM_TTL_SECONDS,
  REDIS_KEY_GLOBAL_LAST_KEBAB_TIMESTAMP,
  normalizeUsernameForKey,
  processedItemKey,
  userLastKebabTimestampKey,
  userRatingCountKey,
  userRatingSumKey,
  userTotalKebabsKey,
} from "./redisKeys";
import {
  renderKebabCooldownReply,
  renderKebabInvalidRatingReply,
  renderKebabSuccessDashboardReply,
} from "./templates/hr";

type TriggerKind = "comment" | "post";

export type KebabTriggerInput = {
  kind: TriggerKind;
  itemId: string;
  authorName: string;
  text: string;
};

type KebabSettings = {
  trackerCommand: string;
  cooldownHours: number;
  itemsPerLevel: number;
};

const DEFAULT_TRACKER_COMMAND = "!kebab";
const DEFAULT_COOLDOWN_HOURS = 4;
const DEFAULT_ITEMS_PER_LEVEL = 5;

const BOT_REPLY_PREFIXES: string[] = [
  "🌯 **Kebab zabilježen!**",
  "⏳ **Polako!**",
  "❓ **Ne kužim.**",
];

let cachedAppUsernameNormalized: string | null | undefined;

async function getAppUsernameNormalized(): Promise<string | undefined> {
  if (cachedAppUsernameNormalized !== undefined) {
    return cachedAppUsernameNormalized ?? undefined;
  }

  const appUser = await reddit.getAppUser();
  cachedAppUsernameNormalized = appUser?.username
    ? normalizeUsernameForKey(appUser.username)
    : null;

  return cachedAppUsernameNormalized ?? undefined;
}

function looksLikeBotReply(text: string): boolean {
  const trimmed = text.trimStart();
  return BOT_REPLY_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
}

function toFiniteNumber(value: unknown): number | undefined {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseRedisNumber(value: string | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

async function getKebabSettings(): Promise<KebabSettings> {
  const trackerCommandRaw = await settings.get<string>("TRACKER_COMMAND");
  const trackerCommand = (trackerCommandRaw?.trim() || DEFAULT_TRACKER_COMMAND).trim();

  const cooldownHoursRaw = await settings.get<number>("COOLDOWN_HOURS");
  const cooldownHours = toFiniteNumber(cooldownHoursRaw) ?? DEFAULT_COOLDOWN_HOURS;

  const itemsPerLevelRaw = await settings.get<number>("ITEMS_PER_LEVEL");
  const itemsPerLevel = toFiniteNumber(itemsPerLevelRaw) ?? DEFAULT_ITEMS_PER_LEVEL;

  return { trackerCommand, cooldownHours, itemsPerLevel };
}

async function replyBestEffort(options: {
  parentId: string;
  markdown: string;
  meta: { kind: TriggerKind; itemId: string; authorName: string; reason: string };
}): Promise<void> {
  try {
    await reddit.submitComment({
      id: options.parentId as T1 | T3,
      text: options.markdown,
      runAs: "APP",
    });

    console.log("[kebab] Replied", options.meta);
  } catch (error) {
    console.error("[kebab] Failed to reply", { ...options.meta, error });
  }
}

export async function handleKebabTrigger(input: KebabTriggerInput): Promise<void> {
  const { kind, itemId, authorName, text } = input;

  const kebabSettings = await getKebabSettings();

  const trackerCommandRegex = buildTrackerCommandRegex(kebabSettings.trackerCommand);

  const parsed = parseKebabCommand(text, trackerCommandRegex);
  if (!parsed.found) return;

  // Our replies include command examples, so if the platform delivers triggers
  // for the app's own comments, we must ignore them to avoid loops.
  if (looksLikeBotReply(text)) {
    console.log("[kebab] Ignoring likely bot reply content", {
      kind,
      itemId,
      author: authorName,
    });
    return;
  }

  const authorNormalized = normalizeUsernameForKey(authorName);

  let appUsernameNormalized: string | undefined;
  try {
    appUsernameNormalized = await getAppUsernameNormalized();
  } catch (error) {
    console.error("[kebab] Failed to resolve app username", {
      kind,
      itemId,
      error,
    });
    // Continue without the author-name self check. `looksLikeBotReply()` above
    // is still a strong loop-prevention guard.
  }

  if (appUsernameNormalized && appUsernameNormalized === authorNormalized) {
    console.log("[kebab] Ignoring self-authored item", {
      kind,
      itemId,
      author: authorName,
    });
    return;
  }

  const processedKey = processedItemKey(itemId);
  const expiresAt = new Date(Date.now() + PROCESSED_ITEM_TTL_SECONDS * 1000);

  const processedSetResult = await redis.set(processedKey, "1", {
    nx: true,
    expiration: expiresAt,
  });

  if (processedSetResult !== "OK") {
    console.log("[kebab] Duplicate trigger delivery; skipping", { kind, itemId });
    return;
  }

  console.log("[kebab] Processing trigger", {
    kind,
    itemId,
    author: authorName,
    parseOk: parsed.ok ?? false,
    rating: parsed.found && parsed.ok ? parsed.rating : null,
  });

  if (!parsed.ok) {
    const markdown = renderKebabInvalidRatingReply({
      trackerCommand: kebabSettings.trackerCommand,
    });

    await replyBestEffort({
      parentId: itemId,
      markdown,
      meta: {
        kind,
        itemId,
        authorName,
        reason: parsed.kind,
      },
    });

    return;
  }

  const nowMs = Date.now();
  const cooldownMs = Math.max(0, kebabSettings.cooldownHours) * 60 * 60 * 1000;

  const userLastKey = userLastKebabTimestampKey(authorName);

  const [globalLastRaw, userLastRaw] = await redis.mGet([
    REDIS_KEY_GLOBAL_LAST_KEBAB_TIMESTAMP,
    userLastKey,
  ]);

  const globalLastMs = parseRedisNumber(globalLastRaw);
  const userLastMs = parseRedisNumber(userLastRaw);

  if (userLastMs !== undefined && cooldownMs > 0) {
    const elapsedMs = nowMs - userLastMs;

    if (elapsedMs < cooldownMs) {
      const remainingMs = cooldownMs - elapsedMs;

      console.log("[kebab] Cooldown hit", {
        kind,
        itemId,
        author: authorName,
        remainingMs,
      });

      const markdown = renderKebabCooldownReply({
        remainingMs,
        trackerCommand: kebabSettings.trackerCommand,
      });

      await replyBestEffort({
        parentId: itemId,
        markdown,
        meta: {
          kind,
          itemId,
          authorName,
          reason: "cooldown",
        },
      });

      return;
    }
  }

  const globalDeltaMs =
    globalLastMs === undefined ? null : Math.max(0, nowMs - globalLastMs);

  const personalDeltaMs =
    userLastMs === undefined ? null : Math.max(0, nowMs - userLastMs);

  const totalKey = userTotalKebabsKey(authorName);
  const ratingSumKey = userRatingSumKey(authorName);
  const ratingCountKey = userRatingCountKey(authorName);

  const totalKebabs = await redis.incrBy(totalKey, 1);

  await Promise.all([
    redis.set(userLastKey, nowMs.toString()),
    redis.set(REDIS_KEY_GLOBAL_LAST_KEBAB_TIMESTAMP, nowMs.toString()),
  ]);

  let avgRating: number | null = null;

  if (parsed.rating !== null) {
    const [sum, count] = await Promise.all([
      redis.incrBy(ratingSumKey, parsed.rating),
      redis.incrBy(ratingCountKey, 1),
    ]);

    if (count > 0) avgRating = sum / count;
  } else {
    const [sumRaw, countRaw] = await redis.mGet([ratingSumKey, ratingCountKey]);

    const sum = parseRedisNumber(sumRaw) ?? 0;
    const count = parseRedisNumber(countRaw) ?? 0;

    if (count > 0) avgRating = sum / count;
  }

  const level = getKebabLevel(totalKebabs, kebabSettings.itemsPerLevel);
  const flairText = buildFlairText(level);

  try {
    await reddit.setUserFlair({
      subredditName: context.subredditName,
      username: authorName,
      text: flairText,
    });

    console.log("[kebab] Flair updated", { author: authorName, flairText });
  } catch (error) {
    console.error("[kebab] Failed to set user flair", {
      author: authorName,
      error,
    });
  }

  const markdown = renderKebabSuccessDashboardReply({
    rating: parsed.rating,
    globalDeltaMs,
    personalDeltaMs,
    totalKebabs,
    level,
    avgRating,
  });

  await replyBestEffort({
    parentId: itemId,
    markdown,
    meta: {
      kind,
      itemId,
      authorName,
      reason: "success",
    },
  });
}
