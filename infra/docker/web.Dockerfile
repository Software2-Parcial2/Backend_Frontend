# syntax=docker/dockerfile:1
# Frontend estatico (shell, PWA, remote-vue) servido con nginx. Contexto: RAIZ del repo.
#   --build-arg APP_DIR=apps/shell --build-arg APP_PKG=shell --build-arg OUT_DIR=dist
FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
ARG APP_DIR
ARG APP_PKG
ARG OUT_DIR=dist
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile --config.strict-dep-builds=false --filter "${APP_PKG}..." \
 && pnpm --filter @sigec/api-client build \
 && pnpm --filter "${APP_PKG}" --config.enable-pre-post-scripts=false build \
 && mkdir /out && cp -r "${APP_DIR}/${OUT_DIR}/." /out/

FROM nginx:1.27-alpine
COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out /usr/share/nginx/html
