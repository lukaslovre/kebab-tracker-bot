# Reddit API Setup & VPS Deployment (Coolify)

## 1. Reddit Infrastructure Setup

In the current API landscape (2026), obtaining keys requires a "Trust-First" approach. You must establish the community before the API access is granted.

### 1.1 Subreddit Configuration (The Prerequisite)

Reddit's "Responsible Builder Policy" favors moderators building tools for their own communities.

1.  **Create the Subreddit:** Using your **Main Account**, create the target community (e.g., `r/KebabLog`).
2.  **Invite the Bot:** Invite your dedicated bot account (`u/KebabTrackerBot`) as a Moderator with **Full Permissions**.
3.  **Accept Invite:** Log in as the bot and accept the moderator invitation.
4.  **Seed the Sub:** Add a description and a "Welcome" post. A "live" subreddit is more likely to be approved for API access than an empty one.

### 1.2 Developer Registration & Approval

You cannot create an "App" until your account is registered in the Reddit Developer Portal.

1.  **Register:** Log in to your **Main Account** and navigate to the "Register to use the API" link on the `prefs/apps` page or `developers.reddit.com`.
2.  **The "Devvit" Bypass:** Reddit will push you toward "Devvit" (their hosted serverless platform). Since this project requires **Bun** and **Persistent SQLite storage**, you must submit a request for "Data API Access" (External Hosting).
3.  **Justification for Approval:** When asked why Devvit is insufficient, specify:
    - **Runtime:** Requirement for the Bun runtime for native TypeScript performance.
    - **Storage:** Requirement for a persistent, relational SQLite database for complex user streaks and historical logging.
    - **Ownership:** Requirement for full data lifecycle management on a private VPS.

### 1.3 Acquiring API Credentials

Once your Developer Profile is approved:

1.  Navigate to [https://old.reddit.com/prefs/apps](https://old.reddit.com/prefs/apps).
2.  Click **"Create App"** -> Select **"Script"**.
3.  **Redirect URI:** Use `http://localhost:8080`.
4.  **About URL:** **LEAVE BLANK** (to avoid validation/security flags).
5.  Save the **Client ID** and **Client Secret**.

---

## 2. VPS Deployment (Coolify & Docker)

The bot is hosted on a $5 VPS using **Coolify**. This setup ensures the bot stays online 24/7 and restarts automatically if it crashes.

### 2.1 Persistent Storage (Docker Volumes)

Because Docker containers are ephemeral, the SQLite database must be stored in a persistent volume to prevent data loss during redeployments.

- **Coolify Config:** In the "Storage" or "Volumes" section of your Coolify app, map a host path to the container path.
- **Mapping:** `/data/kebab-bot:/app/data`
- **Result:** The file at `/app/data/kebab.db` inside the container will actually be stored on the VPS hard drive at `/data/kebab-bot/kebab.db`.

### 2.2 Environment Variables (`.env`)

Configure these in the Coolify "Variables" tab. **Never commit these to GitHub.**

- `REDDIT_CLIENT_ID`: (From step 1.3)
- `REDDIT_CLIENT_SECRET`: (From step 1.3)
- `REDDIT_USERNAME`: `KebabTrackerBot`
- `REDDIT_PASSWORD`: (Bot account password)
- `USER_AGENT`: `linux:kebab-tracker:v1.0.0 (by /u/YourMainAccount)`
- `DB_PATH`: `/app/data/kebab.db`
- `SUBREDDIT_NAME`: `KebabLog`

### 2.3 Containerization (Dockerfile)

Since we are using **Bun**, the Dockerfile is significantly simpler and faster than a standard Node.js image.

```dockerfile
# Use the official Bun image
FROM oven/bun:latest

# Set working directory
WORKDIR /app

# Copy dependency files first (for caching)
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source code
COPY . .

# Ensure the data directory exists for SQLite
RUN mkdir -p /app/data

# Start the bot
CMD ["bun", "run", "src/index.ts"]
```

### 2.4 Deployment Flow

1.  Push code to your private GitHub/GitLab repo.
2.  Connect the repo to Coolify.
3.  Coolify detects the `Dockerfile`, builds the image, mounts the volume, and starts the Bun process.
4.  Monitor logs via the Coolify dashboard to ensure the "Listener" is polling Reddit successfully.
