# syntax=docker/dockerfile:1
# Tarea de inicializacion unica: tablas DynamoDB, topologia RabbitMQ, bucket S3 y coleccion Mongo. Contexto: RAIZ del repo.
FROM node:24-bookworm-slim
RUN npm install -g pnpm@12.16.1
WORKDIR /repo
COPY . .
RUN --mount=type=cache,target=/root/.local/share/pnpm/store pnpm install --frozen-lockfile --filter @sigec/scripts...
WORKDIR /repo/scripts
COPY infra/docker/init.sh /usr/local/bin/init.sh
RUN chmod +x /usr/local/bin/init.sh
CMD ["init.sh"]
