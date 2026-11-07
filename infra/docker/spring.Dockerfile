# syntax=docker/dockerfile:1
# Servicio Spring Boot (gateway, MS2, MS4). Contexto: la carpeta del servicio.
#   docker build -f infra/docker/spring.Dockerfile services/ms2-pacientes
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN --mount=type=cache,target=/root/.m2 sh mvnw -q -B dependency:go-offline
COPY src src
RUN --mount=type=cache,target=/root/.m2 sh mvnw -q -B -DskipTests package \
 && cp target/*.jar app.jar

FROM eclipse-temurin:21-jre
WORKDIR /app
RUN useradd --system --uid 10001 sigec
COPY --from=build /app/app.jar app.jar
USER sigec
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
