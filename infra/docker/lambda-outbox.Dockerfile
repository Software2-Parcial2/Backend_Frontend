# syntax=docker/dockerfile:1
# Poller local del outbox de DynamoDB (MS3/MS8) -> RabbitMQ. En AWS lo reemplaza la Lambda. Contexto: RAIZ del repo.
FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY services/ms3-citas/lambda-outbox/package.json services/ms3-citas/lambda-outbox/package-lock.json ./
RUN npm ci
COPY services/ms3-citas/lambda-outbox/ ./
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=build /app/dist ./dist
ENV OUTBOX_CHECKPOINT_DIR=/data
RUN mkdir /data && chown node /data
VOLUME /data
USER node
CMD ["node", "dist/poller.cjs"]
