# Implementation Roadmap (High-Level)

This document translates the product/spec and architecture notes into an execution plan for the MVP. It stays intentionally high level so details can be decided during implementation.

Inputs:

- `docs/01-product-spec.md`
- `docs/02-architecture-and-data.md`
- `docs/03-reddit-setup-and-ops.md`

## Current Implementation Snapshot

The current codebase already covers most of Phase 1:

- Entrypoint and process lifecycle live in `src/index.ts`.
- Configuration parsing and validation live in `src/config.ts`.
- Reddit OAuth and API access are split into `src/reddit/auth.ts` and
  `src/reddit/client.ts`.
- Polling and in-memory dedupe live in `src/poller/commentsPoller.ts`.
- Logging is handled by the small structured logger in `src/logger.ts`.

That means the roadmap should now focus less on "where should the app live?"
and more on the remaining hard problems: persistence, parser logic, reply
generation, and restart safety.

## Phase 1 — Project + Runtime Foundations

- Project layout is settled: the entrypoint lives in `src/index.ts`.
- Define the configuration contract (required environment variables, DB path, subreddit name, polling interval).
- Implement Reddit OAuth for a script app and a tiny API client that can:
  - fetch new comments for the subreddit
  - post a reply to a specific comment
- Add baseline operational behavior: structured logs, sensible error boundaries, graceful shutdown.

## Phase 2 — Persistence + Idempotency

- Implement SQLite initialization for the MVP schema (`users`, `kebab_logs`).
- Make processing restart-safe:
  - ensure comments are processed at-most-once (e.g., unique `comment_id` constraint)
  - decide how the “cursor”/last-seen comment is tracked (DB vs in-memory + rely on uniqueness)
- Implement the MVP rules that protect data integrity:
  - store all timestamps in UTC
  - reject future-dated logs
  - enforce the “one log per X hours” rule (except for backdates)

## Phase 3 — Domain Logic: Parse + Compute + Reply

- Implement the `!kebab` parser with flexible argument ordering:
  - optional rating (e.g., `8/10`)
  - optional date (e.g., `YYYY-MM-DD`)
- Implement the transaction that records a log and updates cached user totals.
- Compute the dashboard values needed for the reply:
  - global time-since-last-kebab (and reset behavior)
  - personal time-since-last-log
  - total logged count, level, and average rating
- Generate the unified “Dashboard” reply in Reddit-flavored Markdown.

## Phase 4 — Bot Loop + Deployment Hardening

- Implement the polling loop (interval, basic backoff on errors/rate limits, and minimal metrics via logs).
- Confirm behavior for MVP edge cases:
  - edited comments are ignored
  - deleted users / removed comments don’t crash the loop
- Containerize for Coolify in a way that preserves SQLite data via a mounted volume.
- Write a small runbook section (how to configure env vars, where the DB lives, what to check when it stops replying).

## Open Decisions (Defer Until Needed)

- Exact source of truth for “new comments” (OAuth listing vs public JSON; and how to choose `before/after` semantics).
- How to interpret a date-only backdate (e.g., assume midnight UTC vs something else) while keeping user expectations sensible.
- The exact definition of “level” thresholds (can be introduced once the base stats pipeline works).

## Testing Strategy (80/20)

If you only write a few tests before Phase 2, make them these:

1. `loadConfig` validates required env vars, normalizes `r/<name>`, and applies defaults.
2. `RedditAuth` caches tokens and handles `429` / `retry-after` cleanly.
3. `RedditClient.fetchSubredditComments` maps malformed listing JSON defensively, and `replyToComment` sends the expected request shape.
4. `runCommentsPoller` advances the cursor and avoids duplicate processing when listings overlap or the cursor is missing.
5. Once Phase 3 starts, parser, date, and rating validation becomes the next highest-value layer.
