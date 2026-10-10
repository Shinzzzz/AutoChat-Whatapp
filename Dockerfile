# Single image that can run either the web app or the worker.
#   web:    pnpm --filter @autochat/web start   (default; CMD below)
#   worker: pnpm --filter @autochat/worker start
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml .npmrc* ./
COPY packages ./packages
COPY apps ./apps
RUN pnpm install --frozen-lockfile

# --- build ---
FROM deps AS build
RUN pnpm db:generate && pnpm --filter @autochat/web build

# --- runtime ---
FROM build AS runtime
ENV NODE_ENV=production
EXPOSE 3000
# Default to the web server; override `command` in ECS for the worker.
CMD ["pnpm", "--filter", "@autochat/web", "start"]
