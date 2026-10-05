# One image runs both the web app (default) and the notification worker:
#   docker run ... image                -> web on port 3000
#   docker run ... image pnpm --filter @al/web worker
FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
WORKDIR /app

FROM base AS build
COPY . .
RUN pnpm install --frozen-lockfile
RUN pnpm --filter @al/web build

FROM base AS run
ENV NODE_ENV=production PORT=3000
COPY --from=build /app /app
RUN groupadd --system app && useradd --system --gid app app && chown -R app:app /app/apps/web/.next
USER app
EXPOSE 3000
CMD ["pnpm", "--filter", "@al/web", "start"]
