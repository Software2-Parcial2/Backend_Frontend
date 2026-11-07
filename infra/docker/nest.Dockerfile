# syntax=docker/dockerfile:1
# Servicio NestJS del monorepo (MS3, MS5-api, MS7-api, MS8). Contexto de construccion: RAIZ del repo.
#   docker build -f infra/docker/nest.Dockerfile --build-arg SERVICE_DIR=services/ms3-citas --build-arg SERVICE_PKG=ms3-citas .
# El workspace usa injectWorkspacePackages: los paquetes @sigec/* se copian a node_modules, por eso se instala,
# se compilan los paquetes y se vuelve a instalar sin red (igual que hace "pnpm build:deps").
FROM node:24-bookworm-slim
RUN npm install -g pnpm@12.16.1
WORKDIR /repo

ARG SERVICE_DIR
ARG SERVICE_PKG
ENV NODE_ENV=development

COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --filter "${SERVICE_PKG}..." \
 && pnpm --filter "${SERVICE_PKG}^..." build \
 && pnpm install --offline --frozen-lockfile --filter "${SERVICE_PKG}..." \
 && pnpm --filter "${SERVICE_PKG}" exec nest build

ENV NODE_ENV=production
WORKDIR /repo/${SERVICE_DIR}
USER node
CMD ["node", "dist/main"]
