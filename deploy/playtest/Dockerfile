# The playtest server: the built game and the relay, in one small image. Built from the repo root:
#   docker build -f deploy/playtest/Dockerfile --build-arg BUILD=$(git rev-parse --short HEAD) .
FROM node:24-slim AS build
WORKDIR /repo
# The desktop shell is never built here: its Electron binary is not needed.
ENV ELECTRON_SKIP_BINARY_DOWNLOAD=1
RUN npm install --global pnpm@12.11.2
COPY . .
RUN pnpm install --frozen-lockfile
# Every page this server hands out is one build, named by the commit it was made from.
ARG BUILD=unknown
RUN STILLWAKE_BUILD=$BUILD pnpm --filter @stillwake/game build \
  && pnpm --filter @stillwake/relay build

FROM node:24-slim
WORKDIR /app
COPY --from=build /repo/apps/relay/dist/main.js ./main.js
COPY --from=build /repo/apps/game/dist ./game
ENV PORT=8080 GAME_DIR=/app/game
EXPOSE 8080
USER node
CMD ["node", "main.js"]
