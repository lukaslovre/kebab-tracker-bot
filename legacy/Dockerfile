# Bun-based container for running the Reddit bot in production (Coolify / Docker).
#
# Notes:
# - The SQLite DB must live on a mounted volume (configure `DB_PATH=/app/data/kebab.db`).
# - Logs are written as JSON lines to stdout/stderr (nice for container logs).

FROM oven/bun:1.3.1

WORKDIR /app

# Install deps first for better layer caching.
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy app source.
COPY . .

# Optional: create the data dir (the DB layer also creates it at runtime).
RUN mkdir -p /app/data

ENV NODE_ENV=production

CMD ["bun", "run", "src/index.ts"]
