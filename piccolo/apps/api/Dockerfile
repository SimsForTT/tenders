# syntax=docker/dockerfile:1
FROM node:20-alpine AS base
WORKDIR /app

# poppler-utils: pdftoppm, used only as the OCR fallback for scanned PDFs
# with no text layer (see packages/extraction/src/rawText.ts). build-base
# + python3: argon2's native binding needs a compiler at install time only.
RUN apk add --no-cache poppler-utils build-base python3

FROM base AS deps
COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/extraction/package.json packages/extraction/package.json
# --omit=dev: the shipped image never needs vitest/vite/drizzle-kit/eslint
# etc. Those tools carry their own, separate CVE history (bundled esbuild
# dev-server issues, for one) that has no business being reachable code in
# a production container even if nothing ever invokes it.
RUN npm install --omit=dev --workspace=apps/api --workspace=packages/db --workspace=packages/shared --workspace=packages/extraction --include-workspace-root

FROM base AS runner
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY package.json ./
COPY apps/api ./apps/api
COPY packages/db ./packages/db
COPY packages/shared ./packages/shared
COPY packages/extraction ./packages/extraction

# Runs as an unprivileged user - never the container's root.
RUN addgroup -S piccolo && adduser -S piccolo -G piccolo \
  && mkdir -p /app/storage/documents && chown -R piccolo:piccolo /app/storage
USER piccolo

WORKDIR /app/apps/api
EXPOSE 4000
CMD ["node", "--import", "tsx", "src/index.ts"]
