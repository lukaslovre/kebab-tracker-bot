# Devvit Migration Strategy: Kebab Tracker Bot

## 1. Context & Goal

We are migrating the Kebab Tracker bot from a standalone Bun/SQLite application to **Reddit Devvit**.
The goal is to bypass Reddit's strict API waitlists by building natively on their platform. This causes a massive architectural shift: we are moving from a **relational, pull-based server** to an **event-driven, serverless Key-Value architecture**.

This document outlines the paradigm shifts and product simplifications the coding agent must follow when rewriting the codebase.

**(Note: This document was written without access to the codebase. So some things might not make sense. If something doesn't make sense, try to extract "the point" based on how the old codebase actually is.)**

## 2. Infrastructure & Paradigm Shifts (What gets deleted)

Devvit abstracts away all infrastructure. The agent should aggressively delete old code.

- **No more Polling:** Delete `src/poller/`. We no longer poll Reddit for comments. Devvit uses Triggers (`onCommentSubmit`, `onPostSubmit`).
- **No more OAuth/HTTP Clients:** Delete `src/reddit/`. Devvit provides a native `context.reddit` client. No tokens, no rate-limit handling, no exponential backoff queues.
- **No more SQLite:** Delete `src/db/` and any SQL schemas. Devvit uses a built-in Redis plugin (Key-Value store).
- **No more Docker/Coolify:** Delete `Dockerfile`, `.env` files, and deployment scripts.

## 3. Product Rules & Simplifications

To fit the Devvit KV data model and streamline the "gag" nature of the bot, the following product rules are now locked in:

### A. The "Now-Only" Timeline (No Backdating)

- Backdating is not part of the new flow. The bot is a real-time referee.
- When the tracker command (`!kebab`) is parsed, the timestamp is _always_ the exact moment the event fired (`Date.now()`).
- Extra date-like text after the command is ignored, which keeps the parse contract simple.

### B. Trigger Scope (Posts + Comments)

- The bot must listen to **both** new Submissions (Posts) and new Comments.
- If the body or title of a post or a comment contains `!kebab`, the bot triggers. Depth does not matter.

### C. The "Big Bang" Clock Start

- The "Global Subreddit Clock" does not start on deployment.
- When the very first user triggers the bot, there is no previous `global:last_timestamp`. The bot should recognize this "Zero State", initialize the clock, and reply with a special message (e.g., "You are the first! The clock has started.").

### D. Ratings are Optional (No Defaults)

- The parser should look for an optional rating (e.g., `8/10`).
- If omitted, do _not_ assign a default. Simply skip rating aggregation for that specific log, and omit the average rating line from the dashboard reply if they don't have one.

### E. Cooldowns are Loud

- Users can only log once every X hours.
- If they trigger the bot while on cooldown, the bot **must** reply with an error/rejection message. Do not fail silently.

### F. Auto-Flairs (New Feature)

- Upon a successful log, calculate the user's level (based on `total_kebabs`).
- Immediately use the Devvit Reddit client to overwrite the user's Subreddit Flair with their new title/level.

### G. Simple Localization

- Ignore complex i18n libraries. Keep all Croatian strings in a simple `src/templates.ts` file.

## 4. The New Data Model (Redis Key-Value)

Because we are dropping SQLite, we no longer store individual rows for every kebab eaten. We calculate math _on write_ and store aggregates. The agent should structure the Devvit Redis keys roughly like this:

**Global State:**

- `global:last_kebab_timestamp` (Number) -> Used to calculate the "Subreddit Clock" delta.

**User State (Aggregates):**

- `user:<username>:total_kebabs` (Number) -> Used for Level calculation.
- `user:<username>:last_kebab_timestamp` (Number) -> Used for Cooldown enforcement and personal streak delta.
- `user:<username>:rating_sum` (Number) -> Running total of all ratings.
- `user:<username>:rating_count` (Number) -> Total number of logs _that included a rating_.
  - _Note:_ Average Rating = `rating_sum / rating_count`.

**Idempotency / State:**

- `processed:<item_id>` (Boolean/TTL) -> Short-lived key to ensure Devvit doesn't accidentally process the exact same post/comment twice if Reddit's event system hiccups.

## 5. Execution Flow (Agent Guide)

The new lifecycle for a single run of the Devvit app will look like this:

1.  **Event Fires:** `onCommentSubmit` or `onPostSubmit` wakes up the app.
2.  **Parse:** Check the text for `!kebab` and an optional rating. If no command, exit immediately.
3.  **Check Cooldown:** Read `user:<username>:last_kebab_timestamp`. If within X hours, reply with the Error Template and exit.
4.  **Calculate Deltas:** Read `global:last_kebab_timestamp` and user's last timestamp to calculate the "time since" strings.
5.  **Aggregate & Save:** Update all Redis keys (increment totals, add to rating sum, overwrite timestamps with `Date.now()`).
6.  **Flair:** Calculate the level and update the user's Reddit flair.
7.  **Reply:** Construct the Dashboard Markdown and reply to the post/comment.
