# syntax=docker/dockerfile:1
# TrippleTone POS - multi-stage Docker build (monorepo: backend + frontend)
# The Express server serves the React build from the same container, so one image is enough.
#
# Layout this build relies on (verified in the repo):
#   backend/src/server.js          <- entrypoint (serves ../frontend/dist)
#   frontend/  -> npm run build   -> frontend/dist
# Runtime resolves that path as /app/backend/src -> /app/frontend/dist.

# --- Stage 1: build the React frontend ---
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# --- Stage 2: install backend production dependencies ---
FROM node:22-alpine AS backend-deps
WORKDIR /app/backend
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

# --- Stage 3: runtime image ---
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app/backend
COPY --from=backend-deps /app/backend/node_modules ./node_modules
COPY backend/src ./src
COPY --from=frontend-build /app/frontend/dist ../frontend/dist
EXPOSE 5000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD wget -qO- http://127.0.0.1:${PORT:-5000}/api/health || exit 1
USER node
CMD ["node", "src/server.js"]
