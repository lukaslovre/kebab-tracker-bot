# Implementation Roadmap (High-Level)

This document translates the product/spec and architecture notes into an execution plan for the MVP. It stays intentionally high level so details can be decided during implementation.

Inputs:
- `docs/01-product-spec.md`
- `docs/02-architecture-and-data.md`
- `docs/03-reddit-setup-and-ops.md`

## Phase 1 — Project + Runtime Foundations
- Decide the project layout (keep `index.ts` at repo root vs move to `src/` and update docs/scripts accordingly).
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
