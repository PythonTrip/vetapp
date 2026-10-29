FROM node:22-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
RUN corepack enable
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/clinic-web/package.json ./apps/clinic-web/package.json
COPY packages/api-contract/package.json ./packages/api-contract/package.json
COPY packages/api-client/package.json ./packages/api-client/package.json
RUN pnpm install --frozen-lockfile
COPY apps/clinic-web ./apps/clinic-web
COPY packages ./packages
ARG NEXT_PUBLIC_API_URL=/api
ARG API_INTERNAL_URL=http://vetapp-api:8000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    API_INTERNAL_URL=$API_INTERNAL_URL \
    DOCKER_BUILD=1
RUN pnpm build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    API_INTERNAL_URL=http://vetapp-api:8000
COPY --from=builder --chown=node:node /app/apps/clinic-web/.next/standalone ./
COPY --from=builder --chown=node:node /app/apps/clinic-web/.next/static ./apps/clinic-web/.next/static
COPY --from=builder --chown=node:node /app/apps/clinic-web/public ./apps/clinic-web/public
USER node
EXPOSE 3000
CMD ["node", "apps/clinic-web/server.js"]
