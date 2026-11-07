# ms1-identidad

Administracion de **usuarios, roles, sesiones y eventos de autenticacion** sobre la API de administracion de Keycloak, y el
estado de salud agregado de la pila (`/api/salud`). Solo el rol `administrador`. NestJS hexagonal, puerto **3001**.

- Habla con Keycloak con una **cuenta de servicio** (`client credentials`, cliente `sigec-identidad`); el secreto `MS1_CLIENT_SECRET`
  vive solo en `.env`. El cliente y los atributos nuevos se crean con `make keycloak-aplicar` (o al importar `infra/keycloak/realm-sigec.json`).
- Rutas (por el gateway): `/api/identidad/**` y `/api/salud`. Contrato: `contracts/openapi/ms1-identidad.json`; reglas generales en `docs/api.md`.
- Reglas de seguridad propias: nadie se deshabilita ni se quita el rol `administrador` a si mismo, y nunca se deja al sistema sin un administrador activo.
- Auditoria: cada cambio queda en el log estructurado y en un anillo en memoria (`GET /api/identidad/auditoria`); los cambios tambien los registra Keycloak como eventos de administracion.

```bash
pnpm --filter ms1-identidad test        # pruebas unitarias
pnpm --filter ms1-identidad test:e2e    # contrato OpenAPI
KEYCLOAK_URL=http://localhost:8080 MS1_CLIENT_SECRET=... pnpm --filter ms1-identidad start:dev
```
