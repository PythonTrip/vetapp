FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/clinic-web/package.json ./apps/clinic-web/package.json
COPY apps/owner-web/package.json ./apps/owner-web/package.json
COPY packages/owner-features/package.json ./packages/owner-features/package.json
COPY packages/ui/package.json ./packages/ui/package.json
COPY packages/web-proxy/package.json ./packages/web-proxy/package.json
COPY packages/api-contract/package.json ./packages/api-contract/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN pnpm install --frozen-lockfile
COPY apps/owner-web ./apps/owner-web
COPY packages ./packages
ARG NEXT_PUBLIC_API_URL=/api
ARG API_INTERNAL_URL=http://vetapp-api:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    DOCKER_BUILD=1
RUN pnpm --filter vetdietderm-owner-web build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    API_INTERNAL_URL=http://vetapp-api:8000
COPY --from=builder --chown=node:node /app/apps/owner-web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/owner-web/.next/static ./apps/owner-web/.next/static
USER node
EXPOSE 3000
CMD ["node", "apps/owner-web/server.js"]
