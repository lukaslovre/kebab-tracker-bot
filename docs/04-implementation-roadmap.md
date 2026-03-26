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

## Confirmed MVP Decisions

- Store user identity by `username` rather than `reddit_user_id` to avoid extra API calls.
- Keep the first release focused on **comments only**; submissions/posts are future scope.
- Default user-facing text to Croatian.
- Keep templates in `src/templates/` with a locale-focused structure, such as `src/templates/hr.ts` for the MVP.
- Use a **sliding-window cooldown** rather than a strict one-log-per-X-hours rule.
- Accept backdated logs as `YYYY-MM-DD HH:mm` with the time part optional; if omitted, use a sensible default time in the Croatian locale and store the final timestamp in UTC.
- Use a single-instance SQLite deployment for the MVP.
- Track reply status with `reply_status` on the log row rather than a separate outbox table.

## Phase 1 — Project + Runtime Foundations

- Project layout is settled: the entrypoint lives in `src/index.ts`.
- Define the configuration contract (required environment variables, DB path, subreddit name, polling interval).
- Implement Reddit OAuth for a script app and a tiny API client that can:
  - fetch new comments for the subreddit
  - post a reply to a specific comment
- Add baseline operational behavior: structured logs, sensible error boundaries, graceful shutdown.

## Phase 2 — Persistence + Idempotency

- Implement SQLite initialization for the MVP schema (`users`, `kebab_logs`).
- Add a small metadata table for bot state if needed, including the persisted comment cursor.
- Make processing restart-safe:
  - ensure comments are processed at-most-once (e.g., unique `comment_id` constraint)
  - persist the cursor rather than relying only on in-memory state
- Implement the MVP rules that protect data integrity:
  - store all timestamps in UTC
  - reject future-dated logs
  - enforce the sliding-window cooldown rule for rapid repeat logs, except for approved backdates

## Phase 3 — Domain Logic: Parse + Compute + Reply

- Implement the `!kebab` parser with flexible argument ordering:
  - optional rating (e.g., `8/10`)
  - optional date/time (e.g., `YYYY-MM-DD HH:mm`)
- Implement the transaction that records a log and updates cached user totals.
- Compute the dashboard values needed for the reply:
  - global time-since-last-kebab (and reset behavior)
  - personal time-since-last-log
  - total logged count, level, and average rating
- Generate the unified “Dashboard” reply in Reddit-flavored Markdown.

### Parsing / UX notes that remain intentionally flexible

- The MVP accepts the date/time format above, but the parser can become looser later if the community wants it.
- Future UX ideas such as `YYYY.MM.DD` or year-optional shorthand are explicitly deferred until the core flow is stable.

## Phase 4 — Bot Loop + Deployment Hardening

- Implement the polling loop (interval, basic backoff on errors/rate limits, and minimal metrics via logs).
- Confirm behavior for MVP edge cases:
  - edited comments are ignored
  - deleted users / removed comments don’t crash the loop
- Containerize for Coolify in a way that preserves SQLite data via a mounted volume.
- Write a small runbook section (how to configure env vars, where the DB lives, what to check when it stops replying).

### Reply retry policy

- The exact retry strategy for failed replies is still open.
- The current preferred direction is a simple exponential backoff with a small maximum attempt count, but the final choice should be made before implementing the reply worker.
- If the retry strategy becomes more complex later, it can be revisited without changing the rest of the data model.

## Open Decisions (Defer Until Needed)

- Exact source of truth for “new comments” (OAuth listing vs public JSON; and how to choose `before/after` semantics).
- The exact definition of “level” thresholds (can be introduced once the base stats pipeline works).
- Final retry policy for failed Reddit replies beyond the simple backoff direction noted above.
