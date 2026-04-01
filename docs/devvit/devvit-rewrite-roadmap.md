# Devvit Rewrite Roadmap (3 Steps) — Kebab Tracker

## Context (What We’re Building Now)
We are rewriting **Kebab Tracker** as a **Reddit Devvit Web** app.

Key paradigm shifts and locked rules (from the Devvit migration docs):
- **Event-driven**: triggers (`onCommentSubmit`, `onPostSubmit`), no polling.
- **Redis aggregates** (KV) instead of SQLite rows.
- **No backdating**: every accepted log uses `Date.now()`.
- **Optional ratings**: only aggregate ratings when a rating is present; no defaults.
- **Cooldown is loud**: on cooldown, reply with a rejection message.
- **Global clock “Big Bang”**: first-ever log initializes `global:last_kebab_timestamp` and uses a special “clock started” reply.
- **Auto-flair**: on successful log, set subreddit flair to the user’s computed level.
- **Croatian templates**: keep user-facing strings simple and centralized (no i18n framework).

Where the new logic will live:
- The trigger endpoints already exist in the Devvit server entrypoint.
- We’ll keep the HTTP endpoints as the ingestion boundary and introduce small domain modules underneath (parser, redis gateway, templates, flair).

---

## Step 1 — Lock the Devvit Domain Contract (Data + UX)
Goal: agree on the exact “contract” before writing implementation.

Deliverables:
- **Redis key schema** (final names + semantics), including:
  - `global:last_kebab_timestamp`
  - `user:<username>:total_kebabs`
  - `user:<username>:last_kebab_timestamp`
  - `user:<username>:rating_sum` + `user:<username>:rating_count`
  - `processed:<item_id>` idempotency key strategy (TTL + what counts as an “item”) 
- **Parsing rules** for Devvit:
  - Detect the tracker command anywhere in comment body / post title+body.
  - Parse an optional `N/10` rating.
  - Explicitly reject/ignore backdate syntax (since it no longer exists).
- **Reply templates** (Croatian):
  - Success dashboard (with/without rating lines)
  - Cooldown rejection (includes “next allowed” computed from stored timestamp)
  - Parse error / invalid rating message
  - “Big Bang” first-ever global clock message
- **Leveling + flair contract**:
  - Confirm the level cadence input (likely via subreddit setting, or keep constant).
  - Confirm exact flair text format (e.g., `Razina 3 — Döner znalac`).

Acceptance criteria:
- All keys and messages are defined unambiguously, with examples.
- Edge cases are explicitly specified (first user ever, user’s first log, rating omitted, duplicate event).

---

## Step 2 — Implement the End-to-End Trigger Flow (Comments + Posts)
Goal: a single, consistent pipeline that runs on both triggers and produces the same behavior.

Execution flow (conceptual):
1. **Receive event** (`onCommentSubmit` / `onPostSubmit`) and extract: `itemId`, `author`, and text content.
2. **Idempotency guard** via Redis `processed:<item_id>` so duplicate deliveries don’t double-count.
3. **Parse** for command + optional rating. If no command, exit.
4. **Cooldown check** using `user:<username>:last_kebab_timestamp`. If on cooldown, reply with a rejection.
5. **Compute deltas** using:
   - `global:last_kebab_timestamp` for “subreddit clock”
   - `user:<username>:last_kebab_timestamp` for “personal streak”
6. **Write aggregates (on success)**:
   - Increment `total_kebabs`
   - Overwrite last timestamps (user + global)
   - If rating present, update rating sum/count
7. **Set flair** based on updated `total_kebabs`.
8. **Reply** to the triggering comment/post with the dashboard markdown.

Acceptance criteria:
- Both triggers behave identically and share the same core handler.
- No backdating paths exist.
- A repeated event does not change totals.
- Cooldown always produces a visible reply.

---

## Step 3 — Hardening + Playtest Verification
Goal: confirm correctness under real Devvit playtest conditions and lock operational behavior.

Deliverables:
- **Playtest checklist** (manual):
  - First-ever log initializes global clock
  - User’s first log messaging
  - Rating present vs omitted
  - Cooldown enforcement and messaging
  - Duplicate delivery safety (simulate by re-sending the same payload)
  - Flair updates as expected
- **Logging strategy**:
  - Minimal structured logs per event: parsed result, idempotency decision, cooldown decision, write success, reply success/failure.
- **Failure behavior** decisions:
  - If Reddit reply fails, decide whether to: (a) best-effort only, or (b) introduce a lightweight retry mechanism within Devvit constraints.

Acceptance criteria:
- Behavior matches the migration guide’s simplifications.
- Replies are stable and readable in Reddit markdown.
- No infrastructure from the legacy design (poller/SQLite/reply worker) is reintroduced.
