# syntax=docker/dockerfile:1

# ---- build stage ----
FROM node:22-alpine AS build
WORKDIR /app

# Install deps against the lockfile for reproducible builds.
COPY package.json package-lock.json ./
RUN npm ci

# Compile TypeScript -> dist/
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# Drop dev dependencies so we copy only production node_modules forward.
RUN npm prune --omit=dev

# ---- runtime stage ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production

# Default to the zero-dependency synthetic source; override at `docker run`.
ENV TOKENOMICS_DATA_SOURCE=synthetic

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./

# Run as the built-in non-root user.
USER node

# MCP stdio server: JSON-RPC over stdin/stdout. Run with `docker run -i --rm`.
ENTRYPOINT ["node", "dist/index.js"]
