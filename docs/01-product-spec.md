# Product Specification: Kebab Tracker Bot

## 1. Overview
The Kebab Tracker is a Reddit-based community bot confined to a specific subreddit (e.g., `r/KebabLog`). It serves as a unified tracker for a niche community of kebab enthusiasts. The bot tracks both the "Global Subreddit Streak" (time since *anyone* in the sub ate a kebab) and "Personal Streaks/Stats" (individual user data).

## Localization & Target Locale

The project targets the Croatia / Balkan region. User-facing text (bot replies, messages, and any website copy) should default to Croatian or a regionally appropriate language. Backend storage should continue to use UTC for all timestamps; user-facing time displays may default to CET/CEST for Croatian users.

## 2. Core Usefulness (The MVP)
The core loop revolves around a single command: `!kebab`. When a user comments this command in the subreddit, the bot parses the request, updates the database, and replies with a unified "Dashboard" summarizing the event.

### 2.1 Command Syntax
The command supports optional arguments for backdating and rating.
*   **Basic:** `!kebab` (Logs a kebab for right now, no rating).
*   **With Rating:** `!kebab 8/10` (Logs a kebab for right now, with a rating out of 10).
*   **With Backdate:** `!kebab 2026-03-15` (Logs a kebab for a specific past date. Useful for first-time users setting their baseline).
*   **Combined:** `!kebab 8/10 2026-03-15` (Order of arguments should ideally be flexible, handled by the parser).

### 2.2 The Bot Reply (Unified Dashboard)
When a valid command is detected, the bot replies to the comment with a structured message combining 4 viral/retention elements:

> 🌯 **Kebab Logged!** (Rating: 8/10)
> 
> 🚨 **The Subreddit Clock:** You broke the streak! The sub went `2 days, 4 hours` without a kebab. The global clock is reset to 0.
> ⏱️ **Your Personal Streak:** It had been `14 days` since your last log.
> 📈 **Your Stats:** You are a **Level 3 Doner Novice** (14 total logged). Your average rating is `7.2/10`.
> 
> ^(*To backdate your first entry, use* `!kebab YYYY-MM-DD`)

## 3. Edge Cases & Rules
*   **Spam Prevention:** Users cannot log more than one kebab per X hours (e.g., 4 hours) unless they are specifically using the backdate argument for past dates.
*   **Future Dates:** If a user tries to backdate to a date in the future (e.g., `!kebab 2099-01-01`), the bot should reject it with a humorous error message.
*   **Edited Comments:** For the MVP, the bot only listens to *new* comments. If a user edits a comment to add `!kebab` later, it is ignored.
*   **Timezones:** All database times should be stored in UTC. The bot's replies calculate the relative time delta (e.g., "2 days, 4 hours"), which avoids timezone confusion for the end user.

*   **Display localization:** For Croatian/Balkan users, display times and human-facing text should default to CET/CEST and Croatian where practical; the DB retains UTC for correctness.

## 4. Extensibility (Future Scope)
The MVP is designed to be easily expanded. Future features could include:
*   Automatically assigning Reddit User Flairs based on their "Level".
*   Generating a weekly "Leaderboard" post of the longest streaks.
*   Requiring image recognition (AI) to verify a picture of a kebab is attached to the post.