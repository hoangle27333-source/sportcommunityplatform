# =============================================================================
# Content Automation Hub — multi-stage build (SPEC §3)
# Targets:
#   web    — Next.js standalone server
#   worker — BullMQ background worker (tsx)
# Shared base installs deps once; each target copies only what it needs.
# =============================================================================

# ---- deps: install node_modules once (cached on lockfile changes) ----------
FROM node:22-bookworm-slim AS deps
WORKDIR /app
# sharp needs libvips at runtime; build tools for any native deps.
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json ./
RUN npm ci

# ---- builder: compile Next.js standalone output ---------------------------
FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---- web: minimal runtime with Next standalone server ----------------------
FROM node:22-bookworm-slim AS web
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 \
    && rm -rf /var/lib/apt/lists/*
# Standalone output bundles a trimmed node_modules + server.js
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
EXPOSE 3000
CMD ["node", "server.js"]

# ---- worker: runs the BullMQ worker with tsx ------------------------------
FROM node:22-bookworm-slim AS worker
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends \
      libvips42 \
    && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app/node_modules ./node_modules
COPY package.json tsconfig.json ./
COPY src ./src
CMD ["npm", "run", "worker:start"]
