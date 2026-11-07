# syntax=docker/dockerfile:1
# Remoto Angular (Native Federation). Tiene su propio lockfile (no esta en el workspace). Contexto: RAIZ del repo.
FROM node:24-bookworm-slim AS build
RUN npm install -g pnpm@12.16.1
WORKDIR /app
COPY apps/remote-angular/package.json apps/remote-angular/pnpm-lock.yaml ./
# pnpm 12 falla si hay scripts de instalacion sin aprobar: se aprueban los que necesita Angular (esbuild, lmdb, msgpackr, watcher).
RUN printf "allowBuilds:\n  '@parcel/watcher': true\n  esbuild: true\n  lmdb: true\n  msgpackr-extract: true\n" > pnpm-workspace.yaml
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile
COPY apps/remote-angular/ ./
RUN pnpm exec ng build --configuration production \
 && mkdir /out && cp -r dist/*/browser/. /out/ 2>/dev/null || cp -r dist/*/. /out/

FROM nginx:1.27-alpine
COPY infra/docker/nginx-web.conf /etc/nginx/conf.d/default.conf
COPY --from=build /out /usr/share/nginx/html
