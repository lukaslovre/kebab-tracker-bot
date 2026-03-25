# Reddit API Setup & VPS Deployment (Coolify)

## 1. Reddit Setup

### 1.1 Acquiring API Credentials
To interact with Reddit programmatically, you need OAuth2 credentials.
1.  Log in to the bot's dedicated Reddit account (e.g., `u/KebabTrackerBot`).
2.  Navigate to [https://www.reddit.com/prefs/apps](https://www.reddit.com/prefs/apps).
3.  Click **"Create App"** or **"Create Another App"**.
4.  Select **"Script"** (This is crucial for bots running on a server).
5.  Name: `KebabTracker`. Description: `Subreddit utility bot`. Redirect URI: `http://localhost:8080` (Not used for script apps, but required by the form).
6.  Click **Create app**.
7.  Save the **Client ID** (under the app name) and the **Client Secret**.

### 1.2 Subreddit Configuration
1.  Create your subreddit (e.g., `r/KebabLog`).
2.  Invite the bot account (`u/KebabTrackerBot`) as a **Moderator**.
3.  While moderation permissions aren't strictly required to *reply* to comments, they bypass rate limits on new accounts and are required if you implement User Flairs in the future.

## 2. VPS Deployment (Coolify & Docker)

The bot will be hosted on a $5 VPS managed by Coolify. Because we are using SQLite (a file-based database), special care must be taken with Docker volumes.

### 2.1 The Ephemeral Storage Problem
By default, Docker containers are ephemeral. If Coolify redeploys the app (e.g., when you push new code to GitHub), the container is destroyed and rebuilt. **If the SQLite `.db` file is just inside the container, all user data will be permanently deleted on every update.**

**The Solution:** We must mount a Persistent Volume. In Coolify, when configuring the application, you will define a volume mapping (e.g., `/data/kebab-bot:/app/data`). The Bun application will be configured to save the `sqlite.db` file inside the `/app/data` directory.

### 2.2 Environment Variables (`.env`)
The application will require the following secrets configured in the Coolify dashboard:
*   `REDDIT_CLIENT_ID` (From step 1.1)
*   `REDDIT_CLIENT_SECRET` (From step 1.1)
*   `REDDIT_USERNAME` (The bot's username)
*   `REDDIT_PASSWORD` (The bot's password)
*   `USER_AGENT` (Reddit requires a descriptive User-Agent, e.g., `linux:kebabtracker:v1.0.0 (by /u/YourMainAccount)`)
*   `DB_PATH` (e.g., `/app/data/kebab.db`)

### 2.3 Containerization Strategy (Dockerfile Concept)
Coolify can build via Nixpacks automatically, but providing a `Dockerfile` ensures Bun is set up perfectly. The high-level Dockerfile steps will be:
1.  Use the official `oven/bun:latest` base image.
2.  Set the working directory to `/app`.
3.  Copy `package.json` and `bun.lockb` -> Run `bun install`.
4.  Copy the TypeScript source code.
5.  Ensure the `/app/data` directory exists and has the correct read/write permissions for the Bun process.
6.  Start the bot using `bun run src/index.ts`.