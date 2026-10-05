# One image runs both the web app (default) and the notification worker:
#   docker run ... image                -> web on port 3000
#   docker run ... image pnpm --filter @al/web worker
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1 COREPACK_HOME=/corepack
# Fetch pnpm at build time so the app never downloads it at runtime (or as the app user).
RUN corepack enable && corepack prepare pnpm@10.28.0 --activate && chmod -R a+rX /corepack
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @al/web build

FROM base AS run
ENV NODE_ENV=production PORT=3000
COPY --from=build /app /app
RUN groupadd --system app && useradd --system --gid app --home-dir /app app \
  && mkdir -p /data/storage && chown -R app:app /app/apps/web/.next /data
COPY deploy/entrypoint.sh /usr/local/bin/entrypoint
# The entrypoint drops from root to the "app" user after preparing the storage volume.
ENTRYPOINT ["entrypoint"]
EXPOSE 3000
CMD ["pnpm", "--filter", "@al/web", "start"]
