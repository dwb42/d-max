FROM node:24 AS builder

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
  && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run web:build \
  && npm run build \
  && npm prune --omit=dev

FROM node:24-slim AS runner

WORKDIR /app

ARG OPENCLAW_VERSION=2026.5.12

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates lsof \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g openclaw@${OPENCLAW_VERSION} @openai/codex @openclaw/codex@${OPENCLAW_VERSION} \
  && npm cache clean --force \
  && rm -rf /root/.npm /usr/local/lib/node_modules/npm/docs /usr/local/lib/node_modules/npm/man

COPY --from=builder /app/package.json /app/package-lock.json ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/dist-web ./dist-web
COPY --from=builder /app/scripts ./scripts
COPY --from=builder /app/data/schema.sql ./schema.sql
COPY --from=builder /app/openclaw ./openclaw

ENV NODE_ENV=production
ENV DATABASE_PATH=/app/data/dmax.sqlite
ENV DMAX_API_PORT=3088
ENV DMAX_WEB_DIST_DIR=/app/dist-web
ENV DMAX_SCHEMA_PATH=/app/schema.sql
ENV DMAX_MEDIA_STORAGE_DIR=/app/data/media
ENV DMAX_OPENCLAW_CONFIG_PATH=/app/openclaw/config.production-512.json
ENV DMAX_OPENCLAW_STATE_DIR=/app/openclaw-state
ENV GOOGLE_CALENDAR_TOKEN_PATH=/app/data/google-calendar-oauth.json

CMD ["npm", "run", "api:prod"]
