# Container image for the scoreboard, so it can run on any host that takes a
# Dockerfile. The server serves the built client too, so this is the whole app
# in one process on one port.

# ---- build ----------------------------------------------------------------
FROM node:22-slim AS build
WORKDIR /app

# Copy manifests first so dependency layers cache across source-only changes.
COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --include=dev

COPY . .
RUN npm run build

# ---- runtime --------------------------------------------------------------
FROM node:22-slim
ENV NODE_ENV=production
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY packages/client/package.json packages/client/
RUN npm ci --omit=dev && npm cache clean --force

COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/packages/server/dist packages/server/dist
COPY --from=build /app/packages/client/dist packages/client/dist

# Hosts vary in what they let a container write to, and free hosting is
# ephemeral anyway, so keep the room snapshot somewhere always writable.
ENV QUIZZARDS_DATA=/tmp/quizzards-rooms.json
ENV PORT=4000
EXPOSE 4000

# Run as the image's non-root user rather than root.
USER node

CMD ["npm", "start"]
