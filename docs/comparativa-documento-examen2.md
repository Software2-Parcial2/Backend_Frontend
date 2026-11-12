# Comparativa: documento «SIGEC – Segundo Parcial» vs. software

- **Documento analizado:** `sw2-examen2.pdf` (201 páginas, Grupo 20, ICONIX, fecha de las fichas 08/11/2026).
- **Software analizado:** este repositorio en el commit `d46d26e` (rama `main`).
- **Fecha del análisis:** 2026-11-11.
- **Páginas citadas:** son las del número impreso al pie del PDF (coinciden con el índice de páginas del visor).

> Este análisis es **de solo lectura**: no se modificó código ni el PDF. Cada hallazgo se contrastó con el código o la configuración
> del repo (no solo con `docs/PENDIENTES.md`). Lo que no pude comprobar (diagramas ilegibles, comportamiento que exige ejecutar la pila)
> está marcado como **«verificar»** o listado en la sección 9.

## Cómo leer los estados

| Estado | Significado |
|---|---|
| ✅ Cumple | El software hace lo que dice el documento. |
| 🟡 Parcial | Existe, pero falta una parte de lo que el documento promete. |
| ❌ Falta | El documento lo pide y el software no lo tiene. |
| ⚠️ Distinto | Existe, pero hecho de otra forma que la que describe el documento (hay que cambiar uno de los dos). |
| ➕ De más | Está en el software y el documento no lo menciona. |

---

## 1. Resumen ejecutivo

El núcleo funcional del documento **está implementado y verificado**: SSO con Keycloak, pacientes, agenda y citas con SAGA,
historias clínicas con auditoría, imágenes con IA, facturación interna, GraphQL + agente MCP + RAG + voz + ML, notificaciones con n8n,
PWA offline, microfrontends (React/Angular/Vue) y app móvil. Los 25 casos de uso tienen pantalla y API (o herramienta del agente); el E2E de flujos pasa 88/88
y el de frontends 199/199 (según `CLAUDE.md`).

Las brechas se concentran en **seis bloques**:

| # | Bloque | Gravedad | Dónde en el documento |
|---|---|---|---|
| 1 | **IA en el dispositivo (MobileNet TF.js/TFLite)** no existe; **Grad-CAM** existe en el servicio pero no está conectado al flujo | Alta | pp. 13, 15, 18, 68-73, 131, 156-157 |
| 2 | **Despliegue multi-cloud** (Azure + AWS + GCP), TLS/AMQPS, servicios gestionados: solo hay Docker local | Alta (declarado en el objetivo general) | pp. 11, 13, 14-17, 124, 201 |
| 3 | **Bot de Telegram interactivo** (botones confirmar/cancelar, reservar, OTP) y canales SMS/push: solo hay avisos y vinculación por código | Media-alta | pp. 15, 18-19, 107 |
| 4 | **Seguridad perimetral y calidad** del Anexo A (rate limiting, Helmet, MFA, cookies HttpOnly, Husky, CI, cobertura 80 %, etc.) | Media | pp. 17, 95, 197-199 |
| 5 | **Funciones puntuales de casos de uso**: alerta de alergia, exportar auditoría/movimientos, apertura de caja, edición de perfil, riesgo de inasistencia en la cita, TTS | Media | pp. 19, 95, 99-103, 135 |
| 6 | **Documento desactualizado/contradictorio** (versiones, React Native vs Flutter, «sin MS1» vs `ms1-identidad`, pruebas de caja negra casi todas «PENDIENTE») | Alta para la entrega | pp. 11-19, 148-187, 196-197 |

Conteo de los 25 casos de uso: **13 ✅ · 11 🟡 · 1 ⚠️** (ver sección 3). De los 20 requisitos funcionales: **16 ✅ · 4 🟡 · 0 ❌**.

---

## 2. Requisitos funcionales y no funcionales (pp. 36-38)

### 2.1 Requisitos funcionales

| RF | Requisito | Estado | Evidencia / brecha |
|---|---|---|---|
| RF-01 | SSO con Keycloak | ✅ | Shell React con OIDC + PKCE (`apps/shell/src/auth/oidc.ts`), realm `sigec`. |
| RF-02 | Usuarios, roles, permisos | ✅ | `services/ms1-identidad`, pantallas `apps/shell/src/pages/admin`. Roles reales: `administrador, medico, recepcion, caja, paciente` (faltan *director* y *radiólogo*, ver 5.1). |
| RF-03 | Registrar/consultar/actualizar pacientes | ✅ | MS2, búsqueda fonética (`pg_trgm`), `If-Match`/ETag. |
| RF-04 | Datos personales y contactos de emergencia | ✅ | `/api/pacientes/{id}/contactos`, solicitudes de actualización. |
| RF-05 | Agendas y disponibilidad | ✅ | MS3: horario semanal, bloqueos, generación de horarios, `/api/citas/disponibilidad`. |
| RF-06 | Reservar, reprogramar, cancelar | ✅ | SAGA orquestada por MS3 con compensaciones. |
| RF-07 | Sincronizar reservas hechas offline | 🟡 | PWA paciente y Flutter: cola en IndexedDB/SQLite con `Idempotency-Key` y caducidad de 24 h. **Falta:** Background Sync del Service Worker y offline para recepción (ver 4.1 #9-10). |
| RF-08 | Consultas, diagnósticos, tratamientos | ✅ | MS4: consultas, evoluciones inmutables, receta. |
| RF-09 | Consultar/actualizar historias | ✅ | MS4 con `If-Match` y `409 VERSION_CONFLICTO`; modal de conflicto en Angular (`consulta-conflicto.ts`). |
| RF-10 | Cargar y almacenar imágenes | ✅ | MS5: firma real del archivo (JPEG/PNG/DICOM), S3 (SeaweedFS), metadatos en MongoDB, huella SHA-256. |
| RF-11 | Analizar radiografías con Deep Learning | 🟡 | CNN MobileNetV2 entrenada (AUC 0.973). **Falta** Grad-CAM en el flujo y el E2E con el modelo real (ver 4.1 #2). |
| RF-12 | Revisión médica de resultados de IA | ✅ | `POST /api/imagenes/{id}/validacion` (PENDIENTE/VALIDADO/DESCARTADO, huella de firma); el paciente solo ve lo validado. |
| RF-13 | Cargos y pagos | ✅ | MS6: cargo provisional por SAGA, pagos (EFECTIVO/TRANSFERENCIA/POS), anulación con motivo. |
| RF-14 | Comprobantes y movimientos | 🟡 | Comprobante en JSON/HTML imprimible, **sin PDF** (faltan extensiones `gd`/`bcmath`); movimientos sí; **sin exportar** (ver 4.1 #5). |
| RF-15 | Dashboards por GraphQL | ✅ | `/graphql` en MS7 + dashboard Vue (Apollo + ECharts). |
| RF-16 | Agente con MCP y RAG | ✅ | Servidor MCP en memoria, 6 herramientas de solo lectura, RAG con pgvector (10/12 en top-1). Gemini verificado con prueba opcional; Claude **sin probar** (sin API key). |
| RF-17 | Predicciones y agrupaciones ML | ✅ | Random Forest (no-show) y K-means (demanda). `edad` y `beca` siguen neutras. |
| RF-18 | Reportes por texto o voz, exportables | ✅ | `xlsx/csv/pdf`; voz con Web Speech o grabación + Whisper. Micrófono real **sin probar**. |
| RF-19 | Confirmaciones y recordatorios por Telegram y correo | 🟡 | Funciona con proveedores simulados; **Mailtrap y Telegram reales sin verificar** (faltan credenciales). |
| RF-20 | Automatizar notificaciones con n8n | ✅ | 4 workflows (`infra/n8n/workflows`), 25 + 29 comprobaciones. |

### 2.2 Requisitos no funcionales

| RNF | Requisito | Estado | Observación |
|---|---|---|---|
| RNF-01 | Autenticación, roles y permisos | ✅ | JWT validado en cada servicio, roles por endpoint. |
| RNF-02 | Cifrar comunicaciones y proteger datos clínicos | 🟡 | Keycloak en `start-dev`, **sin TLS** en ningún servicio, **RabbitMQ sin AMQPS**. Hay redacción de datos clínicos en eventos, notificaciones y prompts. Sin cifrado a nivel de campo (diseñado, no implementado). |
| RNF-03 | Respuesta ≤ 3 s en consultas habituales | ❌ | **No hay pruebas de rendimiento** ni medición. Solo hay `EXPLAIN` de 5 consultas (`docs/datos/explain.md`). |
| RNF-04 | Escalado independiente | 🟡 | Cada servicio es un contenedor propio (`docker-compose.full.yml`), pero no hay réplicas/orquestador desplegado. |
| RNF-05 | Disponibilidad ante fallos de otros servicios | ✅ | Outbox + reintentos + DLQ; un fallo de notificación no anula la cita. |
| RNF-06 | Offline y sincronización | 🟡 | Ver RF-07. |
| RNF-07 | SAGA e idempotencia | ✅ | `Idempotency-Key` (TTL 24 h), SAGA con 10 min de reserva, 30 s por paso, 3 reintentos con backoff. |
| RNF-08 | REST, GraphQL, RabbitMQ y MCP | ✅ | |
| RNF-09 | Microservicios, DDD, Hexagonal, Clean | ✅ | ArchUnit en Spring; capas `domain/application/infrastructure`. |
| RNF-10 | Module Federation y Feature-Based | ✅ | Shell React + remotos Angular y Vue con MF2. |
| RNF-11 | Docker y despliegue en AWS, Azure y GCP | 🟡 | Docker completo (`make up-core`); **cero** infraestructura como código ni despliegue en nubes (ver 4.1 #1). |

---

## 3. Casos de uso (fichas pp. 92-107)

| CU | Caso de uso | Pág. | Estado | Qué falta o qué difiere |
|---|---|---|---|---|
| CU-01 | Iniciar sesión | 92 | 🟡 | Funciona con Keycloak. **Falta el bloqueo temporal tras varios intentos (flujo 3b):** el realm no activa `bruteForceProtected`. El diagrama de secuencia (p. 125) hace `POST /token` con usuario/contraseña (flujo *password*), pero el software usa *Authorization Code + PKCE* con redirección a Keycloak (el propio documento dice PKCE en pp. 13 y 17). |
| CU-02 | Recuperar contraseña | 93 | ✅ | Flujo `reset-credentials` de Keycloak (`apps/shell/src/pages/Recuperar.tsx`). Necesita SMTP configurado; sin verificar con correo real. |
| CU-03 | Gestionar usuarios y roles | 94 | ✅ | `ms1-identidad` + `Usuarios.tsx`. El paso 4b («revierte el cambio local») no aplica: ms1 no guarda copia local, Keycloak es la fuente. |
| CU-04 | Gestionar perfil y seguridad | 94 | 🟡 | La pantalla **«Mi perfil» es de solo lectura** (`Perfil.tsx`): no permite modificar datos de contacto (paso 2). Contraseña y MFA se delegan a la consola de cuenta de Keycloak (enlace «Abrir mi cuenta»); **no hay pantalla de MFA propia** como en el diagrama de la p. 126 (`/account/totp`). |
| CU-05 | Gestionar pacientes | 95 | 🟡 | Buscar/registrar/editar y duplicados por documento ✅. **Falta el modo offline de recepción (flujo 4b, p. 96):** el remoto Angular no tiene IndexedDB ni cola; solo la PWA del *paciente* es offline. |
| CU-06 | Solicitar actualización de datos | 96 | ✅ | `/api/pacientes/{id}/solicitudes` + aprobar/rechazar. |
| CU-07 | Consultar agenda médica | 96 | ✅ | `agenda-medico.ts`, `/api/citas/agenda/medico/me`. |
| CU-08 | Configurar horarios médicos | 97 | ✅ | `horarios.ts`; plantilla semanal, bloqueos y generación. Ojo: el documento dice actor *Médico* y el prototipo (p. 44) lo muestra en el menú de *Administración*. |
| CU-09 | Gestionar reservas y citas | 97 | ✅ | |
| CU-10 | Solicitar y consultar citas (paciente) | 98 | ✅ | PWA, Flutter y Angular. |
| CU-11 | Registrar consulta, historia y receta | 99 | 🟡 | **Falta la comprobación automática medicamento ↔ alergia y el «Modal de Alerta de Alergia»** (flujo 3a, p. 99; prototipo pp. 56-57). Hoy solo se *muestran* las alergias como chips (`consulta.ts`, `historia.ts`); nadie cruza la receta con los antecedentes. Además **no hay campos de anamnesis ni CIE-10/11** (el diseño los pide, pp. 18, 56); el software usa `motivo`, `diagnostico`, `tratamiento`, `indicaciones` y signos vitales. |
| CU-12 | Auditar cambios clínicos | 100 | 🟡 | Consulta y filtros ✅ (`GET /api/historias/{id}/auditoria`). **Falta «exportar la auditoría» (paso 4):** no hay endpoint ni botón; la acción `EXPORTAR` del dominio solo se usa al emitir la receta. |
| CU-13 | Gestionar estudios y procesar con IA | 100 | 🟡 | Flujo asíncrono por RabbitMQ (el documento dibuja uno síncrono `POST /api/imagenes/{id}/inferencia`, p. 131). **Falta Grad-CAM en el visor** (paso 4; prototipos pp. 70-71). Actor: el documento dice *Radiólogo*; el software no tiene ese rol. |
| CU-14 | Subir y consultar estudios | 101 | ⚠️ | El software sube el archivo **por la API** (multipart `POST /api/imagenes`, valida firma real). El documento dibuja otra mecánica: URL prefirmada de subida + `PUT` directo al bucket + `POST /confirmar` (p. 131). Faltan además las verificaciones previas en el cliente (MobileNet local, pp. 68-69, 72-73); la huella SHA-256 sí se calcula en el navegador. |
| CU-15 | Gestionar caja, cobros y anulaciones | 101 | 🟡 | Cobro, idempotencia, anulación por compensación ✅. **No hay apertura/cierre de caja** (precondición «caja abierta», p. 176). El texto de la ficha habla de «pasarela de pago» y «emitir factura», lo que **contradice la limitación 2 y 1** (p. 16) y el software (solo comprobante interno, sin pasarela): corregir la ficha. |
| CU-16 | Gestionar tarifario | 102 | ✅ | Una tarifa nueva cierra la anterior (conserva histórico). |
| CU-17 | Movimientos y balance | 102 | 🟡 | Movimientos y balance **por día y turno** (el documento dice «periodo»); **falta exportar** (paso 4, p. 103). Actor: la ficha dice *Administrador*, la tabla de actores (p. 36) dice *Cajero*. |
| CU-18 | Dashboard empresarial | 103 | 🟡 | KPI por GraphQL ✅. **No hay KPI de «ocupación de consultorios»** (pp. 19, 180) — no encontré ni la métrica ni el cálculo. Ventana fija de 90 días atrás y 30 adelante, sin filtro de fechas. |
| CU-19 | Alertas y monitoreo | 103 | ✅ | 4 agentes de monitoreo, reglas editables (`PUT /agentes/{id}`), aviso por n8n. Ojo: acceden `administrador` y `recepcion`; no existe el rol *director/dirección*. |
| CU-20 | Reportes con asistente | 104 | ✅ | Espec. JSON validada → JSON/xlsx/csv/pdf. Ruta real `/api/inteligencia/agente/consulta` (el diagrama de la p. 135 dibuja `/agente/chat`). |
| CU-21 | Modelos ML y predicciones | 105 | 🟡 | Vista ML en Vue ✅. **No hay endpoint REST `POST /api/inteligencia/ml/no-show/predecir`** ni el *badge* «Riesgo ALTO de inasistencia (78 %)» en el detalle de la cita (p. 135): hoy el riesgo solo sale por GraphQL (`riesgoInasistencia`) y en la vista ML de Vue. |
| CU-22 | Consultar políticas por RAG | 105 | ✅ | Solo vía agente (no hay REST directo). Auditoría del agente en memoria. |
| CU-23 | Plantillas de notificación | 106 | ✅ | Versionadas, validadas y con vista previa. |
| CU-24 | Historial de notificaciones | 106 | ✅ | Consulta por paciente; los KPI son del día en toda la clínica. |
| CU-25 | Preferencias de aviso | 107 | 🟡 | Canales reales: **EMAIL y TELEGRAM**. La ficha dice «correo, SMS, push». El documento se contradice: sus propias pruebas (p. 186) hablan de EMAIL/TELEGRAM. Decidir si se implementan SMS/push o se corrige la ficha. |

---

## 4. Qué falta implementar

### 4.1 Funcionalidad que el documento promete y el software no tiene

Ordenado por prioridad sugerida. «Qué agregar» es lo mínimo para cerrar la brecha.

| # | Faltante | Dónde lo pide el documento | Qué agregar |
|---|---|---|---|
| 1 | **Despliegue multi-cloud** (Azure Container Apps: Keycloak, shell, gateway, MS2/MS4/MS6, PostgreSQL, RabbitMQ; AWS App Runner/ECS: PWA, MS3/MS5/MS8, DynamoDB, MongoDB Atlas, S3 `sa-east-1`, n8n; GCP Cloud Run: MS7 + remoto Vue) | Objetivo general y específico 1 (p. 13), 1.7.2 (pp. 15-16), 1.8 (p. 17), tabla de módulos (p. 19), RNF-11 (p. 38), diagrama de despliegue (p. 124), cierre (p. 201) | Al menos un despliegue real (o IaC: Terraform/Bicep/`gcloud run deploy`) de un servicio por nube, más desplegar y probar la Lambda `lambda-outbox` (hoy solo se compila y corre con el *poller* local). Si no se va a desplegar, **bajar la afirmación del documento** a «preparado para» y quitar «desplegados en». |
| 2 | **Grad-CAM conectado al flujo** | pp. 13, 15, 18, 157; prototipos pp. 70-71; secuencia p. 131 | El servicio de inferencia ya sabe calcularlo (`predict?grad_cam=true`, `modelo.py`), pero el consumidor (`mensajeria.py`) no lo pide ni sube el PNG al bucket, y MS5 devuelve 404 en `/gradcam-url`. Pedirlo en el flujo, guardar `gradcamKey` y mostrarlo en `resultado.ts`. |
| 3 | **Validador local MobileNet** (TF.js en la PWA/web, TFLite en la app móvil): descarta no-radiografías antes de subir | pp. 13, 15, 18, 156; prototipos pp. 68-69, 72-73; RF-11 | Cargar un modelo liviano en el cliente (la PWA ya calcula SHA-256), mostrar el paso «¿es una radiografía de tórax?» y la pantalla de rechazo. En Flutter falta además el selector de imagen. |
| 4 | **Bot de Telegram interactivo**: botones confirmar/cancelar cita, reservar y reprogramar desde el bot, autenticación con **OTP** | 1.7.1-8 (p. 15), 1.9.3 (p. 18), 1.9.8 (p. 19) | Hoy el workflow `telegram-vinculacion` solo sondea `getUpdates` y entiende `/start <código>`. Agregar `inline_keyboard` + `callback_query` hacia endpoints de MS3 y un flujo OTP, o **retirar** esas frases del documento. |
| 5 | **Exportar** auditoría clínica (CU-12) y movimientos/balance (CU-17) | pp. 100, 103 | `GET …/auditoria?formato=csv` y `GET /api/facturacion/movimientos?formato=csv|xlsx` + botón en Angular. MS7 ya genera xlsx/csv/pdf: se puede reutilizar. |
| 6 | **Alerta de alergia** al recetar (cruce medicamento ↔ antecedentes `ALERGIA`) y modal que exija confirmar o cambiar | CU-11 3a (p. 99); prototipo pp. 56-57 | Validación en MS4 al guardar la receta (o al menos en el formulario) + modal en `consulta.ts`. Requiere decidir cómo se cruza el texto libre con la alergia. |
| 7 | **Rate limiting y cabeceras de seguridad** (Helmet/CSP/HSTS), 100 req/min público y 30 en autenticación | 1.8 (p. 17), A.5 (p. 198) | En el gateway Spring (p. ej. `RequestRateLimiter`/Bucket4j) y `helmet` en los servicios Nest. No hay nada de esto en el repo. |
| 8 | **Offline en recepción** (registro de pacientes y reservas) con IndexedDB | CU-05 4b (p. 96), 1.9.3 (p. 18), 1.9.2 | Cola con `Idempotency-Key` en el remoto Angular o una PWA de consultorio. Hoy solo la PWA del paciente y Flutter tienen cola. |
| 9 | **Background Sync** del Service Worker y estrategias *Cache First* / *Stale-While-Revalidate* | 5.7 (pp. 155-156) | `vite.config.ts` usa `generateSW` solo con *precache*: sin `runtimeCaching` y sin evento `sync`. El reintento hoy lo hace el código de la página al volver la red. Pasar a `injectManifest` o añadir `runtimeCaching` + `BackgroundSyncPlugin`. |
| 10 | **MFA** gestionable desde SIGEC | CU-04 (p. 95); secuencia p. 126 | Hoy se delega a la cuenta de Keycloak. Mínimo: activar la política OTP en el realm y probarla; ideal: pantalla propia o enlace directo a `/account/#/security/signing-in` con instrucciones. |
| 11 | **Bloqueo por intentos fallidos** | CU-01 3b (p. 93) | Activar `bruteForceProtected`, `failureFactor`, `waitIncrementSeconds` en `realm-sigec.json` y aplicar con `make keycloak-aplicar`. |
| 12 | **Edición de datos de contacto** en «Mi perfil» | CU-04 paso 2 (p. 95) | Formulario que use `PUT /api/pacientes/{id}` (paciente: vía solicitud, CU-06) o atributos de Keycloak (personal). |
| 13 | **Apertura/cierre de caja** | Prueba CU-15 (p. 176); 1.9.6 «balance diario por turno» | Entidad `caja` con apertura/cierre y monto inicial/final. El balance por turno ya existe. |
| 14 | **Roles *Director/Dirección* y *Radiólogo/Técnico*** | 1.7.1-1 (p. 14), actores (p. 36), CU-13 (p. 100), CU-18 a CU-22 («Dirección Médica») | Agregar ambos roles al realm y a `@Roles`. Hoy MS7 se abre a `administrador`/`recepcion`, y en MS5 el técnico radiólogo no existe como rol. |
| 15 | **KPI de ocupación de consultorios** | 1.9.7 (p. 19), prueba CU-18 (p. 180) | Métrica (citas ocupadas / horarios publicados por médico y consultorio) en MS3 + GraphQL + tarjeta en el dashboard. |
| 16 | **Riesgo de inasistencia en el detalle de la cita** y endpoint REST de predicción | Secuencia CU-21 (p. 135) | `POST /api/inteligencia/ml/no-show/predecir` (o consumir GraphQL) y *badge* en `cita-detalle.ts`. |
| 17 | **Campos de anamnesis y CIE-10/11** | 1.9.4 (p. 18), prototipo p. 56 | Columnas/VO en MS4 (con catálogo CIE) y campos en el formulario de consulta. |
| 18 | **Síntesis de voz (TTS)** de las respuestas del asistente | 1.9.7 (p. 19): «comandos de voz con síntesis de audio (TTS)» | `speechSynthesis` en el remoto Vue o un servicio TTS. No hay ni rastro en el código. |
| 19 | **Canales SMS y push** | CU-25 (p. 107) | Nuevos adaptadores en MS8 + n8n, o corregir la ficha a «correo y Telegram». |
| 20 | **TLS / AMQPS / servicios gestionados** (Postgres Flexible Server, MongoDB Atlas, S3 con SSE-S3, bucket `sa-east-1`) | 1.7.2 (pp. 15-16), 5.4 (p. 154) | Hoy: PostgreSQL, Mongo, DynamoDB local y SeaweedFS en Docker, sin TLS, sin cifrado en reposo configurado. URL prefirmadas: existen, pero el TTL configurable no es explícitamente 5-15 min (**verificar**). |
| 21 | **Pruebas de rendimiento** (≤ 3 s) | RNF-03 (p. 37) | Un script k6/Artillery sobre 3-5 consultas habituales por el gateway. |
| 22 | **Comprobante en PDF** | 1.9.6 (p. 19) | Instalar `php-gd`/`php-bcmath` (lo hace el usuario con `sudo dnf`) y activar dompdf; hoy HTML imprimible. |

### 4.2 Calidad y estándares del Anexo A (pp. 192-199)

El anexo describe prácticas «adoptadas» y «verificadas en el pipeline de CI/CD». En el repo:

| Práctica del anexo | Pág. | Estado real |
|---|---|---|
| CI/CD (GitHub Actions) que corre linter, formato, pruebas y cobertura en cada PR | 197-199 | ❌ No existe `.github/`. |
| Husky + lint-staged antes de cada commit | 198 | ❌ No existe. |
| ESLint (Airbnb) + Prettier en todo TypeScript, «el CI falla con advertencias» | 198 | 🟡 Solo hay `eslint.config.js` en la PWA (y falla con TS 7: `docs/PENDIENTES.md`). `.prettierrc` en ms1, ms3, ms8 y remoto Angular; no en el resto. |
| PHP CS Fixer (PSR-12), Google Java Format, Flake8 + Black | 198-199 | ❌ No hay configuración en MS6, MS2/MS4 ni en los servicios Python. |
| Cobertura mínima 80 % en dominio y aplicación | 198 | ❌ Solo existe el script `test:cov` en ms3; no hay umbral. |
| Storybook (Vue), Compodoc (Angular), Karma + Jasmine | 199 | ❌ No existen. El remoto Angular usa Vitest/Analog. |
| Swagger en `/api/docs` (Nest) y `/swagger-ui.html` (Spring) | 199 | 🟡 Nest lo expone en **`/docs`**, no `/api/docs`; Spring sí en `/swagger-ui.html`. **MS6 (Laravel) no tiene Swagger** (el contrato OpenAPI se escribe a mano; el anexo cita L5-Swagger). |
| Rama `develop`, ramas `feature/*`, PR revisado, prohibido push a `main` | 194 | ❌ Solo `main` (y la rama remota `fernando`); no hay `develop`. |
| `CHANGELOG.md` generado con `conventional-changelog` | 199 | ❌ No existe. Los commits sí siguen Conventional Commits en español (el anexo lista `perf`, que `AGENTS.md` no incluye; `AGENTS.md` incluye `build`, que el anexo no lista). |
| Validación de variables de entorno con `@nestjs/config` + Joi | 198 | ❌ No se usa Joi. |
| Tokens **no** en `localStorage`; cookies HttpOnly | 197 | ⚠️ El shell usa `react-oidc-context` (por defecto el almacén es `sessionStorage`) y no hay cookies HttpOnly ni BFF. |
| Refresh token de 8 h | 197 | ⚠️ El realm fija `accessTokenLifespan=900` (15 min ✔) y `ssoSessionIdleTimeout=1800`, sin 8 h de refresco. |
| Validación fallida → HTTP **422** | 198 | ⚠️ El software responde **400** para validación (y 422 para reglas de negocio). `docs/api.md` lo documenta así. |
| «CORS solo permite los orígenes de `CORS_ORIGINS`» | 198 | ✅ en el gateway (variable `CORS_ORIGINS`). Es **en el gateway, no en cada servicio** (regla del proyecto). |
| `contracts/events/` con **JSON Schema y Avro** + script `gen-contracts.mjs` | 196 | 🟡 Solo JSON Schema; no hay Avro ni ese script (existe `make openapi-update` para OpenAPI). |
| Migraciones con nombre `YYYY_MM_DD_HHMMSS_descripcion` | 193 | ⚠️ Solo Laravel; Flyway usa `V<n>`, MS7 `NNNN_*.sql`. |
| Comentario en la migración con el ticket de Jira/Linear | 199 | ❌ No se usa Jira/Linear. |

---

## 5. Qué no está acorde al documento (el software hace algo distinto)

### 5.1 Arquitectura, roles y tecnologías

| Punto | El documento dice | El software hace | Pág. | Acción |
|---|---|---|---|---|
| **MS1 / identidad** | «No requiere un microservicio intermedio de usuarios» | Existe `services/ms1-identidad` (NestJS, puerto 3001) que administra usuarios, roles, sesiones y la invitación de pacientes | 13, 17-18 | **Documento:** reconocer ms1 como «fachada de administración sobre Keycloak». (Además `AGENTS.md` aún dice «No existe un MS1»: está desactualizado.) |
| **Roles** | Administrador, Médico, Recepcionista, Cajero, Paciente (p. 14); actores también *Director* y *Radiólogo/Técnico* (pp. 36, 100) | `administrador, medico, recepcion, caja, paciente` | 14, 36, 100 | Código (agregar roles) o documento (unificar actores). |
| **Móvil** | App móvil en **React Native** (pp. 13, 15, 17, 155) y `apps/mobile` (p. 155) | La app real es **Flutter** (`apps/mobile_flutter`); `apps/mobile` (RN) sigue en el repo hasta confirmar la prueba en dispositivo. La tabla de entorno (p. 150) ya dice Flutter | 13, 15, 17, 155 vs 150 | **Documento:** Flutter en todas partes; TFLite en Flutter. |
| **Spring Boot / Java** | Java 17 / Spring Boot 3 (p. 15) | **Java 21 / Spring Boot 4.1.2** (la p. 151 ya dice «Java 21 / Spring Boot 4») | 15 vs 151 | Documento. |
| **Laravel / PHP** | PHP 8.2 (p. 15); «Laravel 11» (p. 151) | **PHP ^8.3 / Laravel 13** | 15, 151 | Documento. |
| **NestJS** | «NestJS 10» (pp. 151-152) | **NestJS 12** | 151-152 | Documento. |
| **Keycloak** | 24+ (p. 15); 26 (p. 150) | **26.0** | 15 vs 150 | Documento (unificar en 26). |
| **Angular / React** | Angular 17+ con *Native Federation* (pp. 15, 153: «18/19 … native-federation»); React 18 | **Angular 22** con **Module Federation 2** (`@module-federation/vite` + Analog; se retiró Native Federation); **React 19** | 15, 17, 153 | Documento. |
| **Python** | 3.10 | No fijado en el repo (verificar versión real de los `.venv`). | 15 | Verificar. |
| **PostgreSQL** | 16 | 16 (`pgvector/pgvector:pg16`) | 150 | ✅ (n8n avisa que conviene 17). |
| **Gemini** | «Gemini Flash» (pp. 11, 19, 151, 157) | Modelo por defecto `gemini-3.5-flash` configurable; el diagrama de la p. 135 rotula «Gemini 1.5 Pro / Claude» | 135 | Documento: unificar el nombre del modelo. |
| **Modelo de no-show** | Random Forest (pp. 11, 15, 19, 157); anexo dice **XGBoost** (p. 196); secuencia CU-21 dice **LightGBM** y `modelo_noshow.pkl` (p. 135) | **Random Forest** (scikit-learn); no hay XGBoost ni LightGBM | 135, 196 | Documento (dejar solo Random Forest). |
| **Variables del Random Forest** | Asistencias previas, cancelaciones anteriores, antelación, día de la semana; «se excluyen variables sensibles» (p. 157) | `FEATURES` = `antelacion_dias, dia_semana, edad, beca, sms_recibido, inasistencias_previas, citas_previas, tasa_inasistencia_previa` (`ml/app/features.py`). Incluye `edad` y `beca` (neutras en producción: `edad=35`, `beca=false`) y `sms_recibido`; **no** hay «cancelaciones anteriores». | 157 | Documento: alinear la lista de variables y justificar `edad`/`beca`. |
| **GraphQL «federado»** | «API analítica en GraphQL federada» (p. 19) | Un único GraphQL en MS7 (Apollo, *no* Apollo Federation) | 19 | Documento («GraphQL de agregación»). |
| **Bus de eventos y n8n** | n8n «disparado por eventos de RabbitMQ» (pp. 15, 19) | MS8 consume RabbitMQ y llama a n8n por **webhook**; n8n no se suscribe al bus (la p. 157 sí lo describe bien) | 15, 19 vs 157 | Documento. |
| **Almacenamiento de objetos** | Amazon S3 `sa-east-1`, SSE-S3; el prototipo habla de **MinIO** (pp. 69, 73) | **SeaweedFS** local (`s3`); sin SSE configurado | 69, 154 | Documento (MinIO → S3) y/o código (SSE-S3 en AWS). |
| **BD gestionadas** | Azure PostgreSQL Flexible Server, MongoDB Atlas, DynamoDB On-Demand | Contenedores locales (Postgres, MongoDB, DynamoDB Local) | 15-16, 124 | Ver 4.1 #1 y #20. |
| **Rutas de API en los diagramas de secuencia** | `/api/imagenes/{id}/inferencia`, `/api/imagenes/presigned-upload`, `/api/inteligencia/agente/chat`, `/api/inteligencia/ml/no-show/predecir`, `/api/auditoria/…`, `/api/cajas/{id}/balance`, `/api/horarios` … (ilustrativas) | Rutas reales: `/api/imagenes`, `/api/inteligencia/agente/consulta`, `/api/historias/{id}/auditoria`, `/api/facturacion/balance`, `/api/citas/medicos/{id}/horario`… (ver `contracts/openapi/*.json`) | 125-136 | Documento: regenerar los diagramas con las rutas de `contracts/openapi` (no pude leer todas las rutas en las capturas; las verificadas son las de CU-13/14/20/21). |
| **Monorepo (anexo)** | «`apps/` contiene los microservicios… (Angular Shell, Vue 3 Remote)»; «Angular Shell»; repositorio `Backend_Frontend` (p. 196); paquete Java `pe.sigec.<modulo>` (p. 193) y también `com.sigec.<ms>` (p. 194) | Microservicios en `services/`, `apps/` solo frontends; el **shell es React**; paquete real `com.sigec.ms2_pacientes…` | 193-196 | Documento. |
| **Estructura Git** | `develop`, `release/*`, `hotfix/*` (p. 194) | Solo `main` | 194 | Ver 4.2. |

### 5.2 Flujos y reglas de negocio

| Punto | El documento dice | El software hace | Pág. |
|---|---|---|---|
| **Subida de imágenes (CU-14)** | URL prefirmada de subida → `PUT` al bucket → confirmar | Multipart por la API con validación de firma real; la URL prefirmada solo se usa para *leer* | 131 |
| **Inferencia (CU-13)** | Síncrona: `POST …/inferencia` devuelve diagnóstico y mapa | Asíncrona por RabbitMQ (`imagenes.analisis.solicitar` → resultado) con estado `ANALIZADA` | 131, 157 |
| **Firma del médico** | «Firma digital del profesional» en cada lectura/modificación (p. 18); firma obligatoria | Guarda `sub` y fecha (*no* es firma electrónica avanzada). Aceptable para un prototipo, pero el texto del documento promete más | 18, 99 |
| **Reserva temporal** | Prototipo habla de «Redis y base de datos» al liberar (p. 47); 10 min en DynamoDB | 10 min en DynamoDB (TTL lógico, se comprueba al leer); **no hay Redis** | 45, 47 |
| **«Anulación por compensación» en caja** | Cobro «contra la pasarela de pago» con SAGA (CU-15) | No hay pasarela (la propia limitación 2, p. 16, lo excluye); el cobro es un `POST …/pagos` local idempotente | 102 vs 16 |
| **Vigencia de la clave de idempotencia** | 24 h | 24 h (✅). Matiz: si el proceso muere con la clave en `PROCESANDO`, queda bloqueada hasta expirar (`contracts/idempotency.md`) | 13, 15 |

---

## 6. Qué está de más (en el software, no en el documento)

| Elemento | Dónde | Comentario |
|---|---|---|
| **Proveedor Claude** para el agente (`LLM_PROVIDER=claude`, `claude-sonnet-5-5`) y el proveedor `simulated` | `services/ms7-inteligencia/api/src/infrastructure/llm/` | El documento solo menciona Gemini Flash (p. 135 dibuja «Gemini/Claude» pero el texto no). Útil para pruebas; documentarlo o quitarlo. |
| **`apps/mobile` (React Native)** completa | `apps/mobile` | Sustituida por Flutter; queda hasta confirmar la prueba en dispositivo (`CLAUDE.md`). Borrar tras confirmar. |
| **Servicio de embeddings separado** (puerto 8027) y **Whisper** (8017) | `services/ms7-inteligencia/{embeddings,whisper}` | El documento sí los nombra en 5.9 (p. 157) pero no en el diagrama de arquitectura (p. 122). Menor. |
| **Agentes de monitoreo programados** con identidad de servicio `sigec-ms7` | MS7 Fase 7 | CU-19 habla de «reglas de alerta» pero no de un planificador con cuenta de servicio en Keycloak. |
| **`ms1-identidad`**: sesiones, eventos de autenticación, `/api/salud`, invitación de pacientes por correo (`POST /api/identidad/pacientes/{id}/acceso`) | `services/ms1-identidad` | Ni el servicio ni la invitación están en el documento. |
| **Historial de la SAGA, cancelar/reprogramar atómico, bloqueos, `HORARIOS_ESTRICTOS`, asistencia (`ASISTIO`)** | MS3 Fase 2 | El prototipo muestra el monitor de la SAGA (pp. 47-50) pero no el registro de asistencia ni el modo estricto. |
| **Consentimientos** (`TRATAMIENTO_DATOS`, `IMAGENES_IA`, `NOTIFICACIONES`) en MS4 | `TipoConsentimiento.java` | El documento no define consentimientos. El de `IMAGENES_IA` ni se verifica al subir (decisión pendiente). |
| **Notificación `ESTUDIO_VALIDADO`**, recordatorio reforzado, antelación configurable (2/6/12/24/48 h) | MS8 | El documento solo habla de confirmaciones y recordatorios. |
| **Solicitudes de actualización con aprobación**, catálogo de especialidades y médicos en MS2 | MS2 | CU-06 las cubre; el catálogo no está en el modelo del documento. |
| **Herramientas de operación**: `make dlq-replay`, `seed`, `db-purge`, `db-backup`, `datos-docs`, `datos-explain`, E2E por flujo | `Makefile`, `scripts/` | Positivo; el documento solo cita tres scripts E2E (p. 198). |
| **Pila Docker completa** (`docker-compose.full.yml`, `make up-core/up-all`, `make dev-local`) | raíz | Es el único «despliegue» real; el documento no lo describe en 4.3.3. Conviene incluirlo como «entorno de desarrollo/demo». |
| **Paquetes compartidos** (`@sigec/auth-nest`, `messaging-nest`, `idempotency-nest`, `http-nest`, `api-client`, `api-types`, `mfe-contract`, `design-tokens`) | `packages/` | El anexo solo menciona `auth-nest` y `messaging-nest` (p. 196). |

---

## 7. Inconsistencias internas del documento (corregirlas aunque el software esté bien)

| Qué | Dónde | Detalle |
|---|---|---|
| Versiones contradictorias entre secciones | pp. 15 vs 150-153 | 1.7.2 (Java 17/Spring 3/Keycloak 24/Angular 17/React 18) vs 5.1-5.3 (Java 21/Spring 4/Keycloak 26/Angular 18-19). |
| React Native vs Flutter | pp. 13, 15, 17, 155 vs 150 | La tabla de entorno ya dice Flutter. |
| «Sin microservicio de usuarios» vs CU-03 «registra el usuario y sincroniza con Keycloak» | pp. 13, 17-18 vs 94 | CU-03 y la secuencia de la p. 126 suponen una capa que administra usuarios (es ms1). |
| Pasarela de pago/factura en CU-15 vs limitaciones | p. 101-102 vs 16 | Las limitaciones 1 y 2 excluyen factura fiscal y pasarela. |
| CU-17 actor: *Administrador* (p. 102) vs *Cajero* en la tabla de actores (p. 36) | | |
| CU-25 canales: «correo, SMS, push» (p. 107) vs EMAIL/TELEGRAM (p. 186) | | |
| CU-21: actor *Dirección Médica* (p. 105) vs secuencia con *Recepción/Médico* (p. 135) | | |
| Modelo de no-show: Random Forest (cuerpo) vs XGBoost (p. 196) vs LightGBM (p. 135) | | |
| Shell: React (cuerpo) vs «Angular Shell» (p. 196, A.4) | | |
| «El prototipo de auditoría es de **MS2**» (p. 62, «Bitácora Forense… (MS2)») | p. 62 | La auditoría clínica es de **MS4**. |
| Prototipo de imágenes habla de **MinIO** (pp. 69, 73); el cuerpo de S3/SeaweedFS | | |
| Pruebas con «Resultado de Prueba: Correcto» pero «Resultado Obtenido: Pendiente de ejecución y registro de evidencias» | pp. 159-178 | Ver sección 8. |
| Numeración de capítulos: «CAPÍTULO V» usa 4.3-4.5, «VI» usa 5.x, «VII» usa 6.x | pp. 122, 148, 187 | Los números de sección no coinciden con el capítulo. |
| Índice: «3.5.2 Mapa de contextos» y «3.5.5 Mapa de contextos» repetidos | pp. 5-6 | |
| Conclusión: «cuya efectividad deberá comprobarse mediante las pruebas correspondientes» | p. 188 | Las pruebas están casi todas sin ejecutar o sin evidencia. |
| CU-16 (tarifario): la ficha dice *Administrador*, la tabla de actores dice que el *Cajero* gestiona el tarifario | pp. 36, 102 | Unificar. |
| Ortografía en títulos: «Alcance functional», «Justificación operative» | p. 14 | |

---

## 8. Pruebas, diagramas y entregables del documento

### 8.1 Pruebas de caja negra (pp. 158-187)

| Caso | Resultado que registra el documento | Observación |
|---|---|---|
| CU-01, 03, 05, 06, 07, 08, 09, 10, 11, 15, 16 | «Correcto» | Pero el campo **«Resultado Obtenido» dice «Pendiente de ejecución y registro de evidencias»**: el resultado y la evidencia no concuerdan. En el texto extraído no se ven las capturas de pantalla (**verificar** si están como imagen en cada ficha). |
| CU-02, 04, 12, 13, 14, 18, 19, 20, 21, 23, 24, 25 | «PENDIENTE — No se ha ejecutado ni verificado» | 12 de 25 sin ejecutar. |
| **CU-17 y CU-22** | **No tienen ficha de prueba** | Faltan en la sección 5.11.1. |
| CU-04 aparece **después** de CU-05 | pp. 162-164 | Orden alterado. |

Qué software ya respalda esas pruebas (se pueden ejecutar y capturar): `scripts/e2e-flujos.sh` (88), `scripts/e2e-frontends` (199), `scripts/e2e-ms7.sh` (37), `scripts/e2e-saga.sh`,
`scripts/e2e-notificaciones.sh`. Las que **no** se pueden cerrar sin implementar algo: CU-04 (MFA), CU-12 (exportar), CU-13 (Grad-CAM), CU-14 (MobileNet), CU-25 (Telegram real).

### 8.2 Diagramas

- **Secuencia (pp. 125-136):** cubren CU-01 a CU-23. **Faltan CU-24 y CU-25.** Además las rutas son ilustrativas (ver 5.1).
- **Robustez (pp. 108-121):** CU-01 a CU-25, completos.
- **Clases (pp. 138-143) y datos (pp. 143-148):** no hay diagrama de clases ni de datos para **identidad/usuarios** (módulo M1/ms1); el modelo real está en `docs/datos/README.md` y `docs/datos/erd-generado.md` (se puede reutilizar).- **Diagrama de arquitectura (p. 122):** dibuja un «MS1 – Inteligencia Empresarial»; en el texto MS1 es identidad e Inteligencia es MS7 (**verificar la etiqueta** en la figura: la resolución es baja).
- **Casos de uso general (p. 91) y paquetes (p. 92, sección 3.8):** el diagrama de paquetes aparece solo como título; **verificar** si la figura está.
- **Página 190-191 (ANEXOS) y 201 (Qr):** hay hojas casi vacías / un QR con «Repositorio, Despliegue, Dynamo, Azure, GoogleCloud»; si el QR apunta a un despliegue, hoy **no existe** ninguno (ver 4.1 #1).
- **Docs ICONIX:** `docs/iconix/` está **vacío** en el repo; los diagramas viven solo en el PDF.

---

## 9. Dudas y supuestos (necesito tu confirmación)

1. **¿Se va a desplegar realmente en Azure/AWS/GCP?** Si la respuesta es no, conviene reescribir el documento («diseñado para…», «ejecutado en Docker») en lugar de implementar IaC. Esa decisión cambia ~6 de los hallazgos.
2. **Bot de Telegram interactivo y OTP:** ¿es requisito del parcial o texto aspiracional? Es el hueco funcional más grande de MS8.
3. **Fuente de verdad:** para las diferencias de la sección 5, ¿cambio el código al documento o el documento al código? Mi recomendación: **documento** para versiones, Flutter, MS1, XGBoost/LightGBM, MinIO, rutas; **código** para MobileNet local, Grad-CAM, alerta de alergia, exportar, bloqueo por intentos y rate limiting.
4. **Roles «Director» y «Radiólogo»:** ¿se crean o se mapean a `administrador` y `medico`?
5. **No pude leer** con resolución suficiente las rutas HTTP de algunos diagramas de secuencia ni la figura de la p. 91/92; comparé las de CU-13, 14, 20 y 21.
6. **Python 3.10** (p. 15) no se verificó contra los `.venv`.
7. **TTL de las URL prefirmadas** (5-15 min, p. 155): el código recibe `segundos` por parámetro (`s3-object-store.ts`); no confirmé el valor por defecto configurado.
8. **Lo que dependía de ejecutar la pila** (p. ej. el comportamiento real de n8n/Mailtrap/Telegram, el micrófono, la app Flutter en dispositivo) lo tomé de `docs/PENDIENTES.md` y `CLAUDE.md`, sin reejecutarlo.

---

## 10. Plan sugerido para cerrar las brechas

**Rápido (≤ 1 día cada uno, bajo riesgo)**
- Corregir el documento (sección 5.1 y 7) y completar CU-24/CU-25 en las secuencias.
- Activar protección por intentos en Keycloak y la política OTP (4.1 #10-11).
- Exportar CSV de auditoría y movimientos (4.1 #5).
- Rate limiting en el gateway + `helmet` en Nest (4.1 #7).
- Ejecutar y capturar las pruebas de caja negra que ya funcionan (CU-02, 12, 14, 17, 18-25) y crear las fichas de CU-17 y CU-22.

**Medio**
- Alerta de alergia en receta (4.1 #6) · campos anamnesis/CIE-10 (4.1 #17) · KPI de ocupación (4.1 #15) · riesgo de inasistencia en la cita (4.1 #16) · apertura/cierre de caja (4.1 #13) · roles Director/Radiólogo (4.1 #14).
- CI mínimo en GitHub Actions (lint + pruebas) y Husky: cierra la mayor parte del Anexo A (4.2).

**Grande**
- Grad-CAM conectado + MobileNet local en PWA/Flutter (4.1 #2-3).
- Bot de Telegram interactivo con OTP (4.1 #4).
- Despliegue en al menos una nube por servicio, TLS y AMQPS (4.1 #1, #20).
- Offline en recepción y Background Sync (4.1 #8-9).

---

## 11. Método

1. Leí el PDF completo: texto extraído con `pdftotext` (caps. I-IV, V implementación, pruebas, anexos) y **vi las figuras** clave: prototipos de reserva/SAGA (pp. 44-49), imágenes (pp. 67-70), arquitectura y despliegue (pp. 122-124), y los 12 diagramas de secuencia (pp. 125-136, con ampliación de pp. 131 y 135). No revisé uno por uno los demás prototipos (pp. 41-43, 50-66, 71-88) ni los de robustez y clases: el repo ya declara haberlos trasladado («todas las pantallas del diseño», `docs/PENDIENTES.md`) y no encontré discrepancias en los que sí vi.
2. Contrasté cada requisito, caso de uso y afirmación técnica con: `AGENTS.md`, `CLAUDE.md`, `docs/PENDIENTES.md`, `contracts/openapi/*.json` (todas las rutas), el realm de Keycloak, los `package.json`/`pom.xml`/`composer.json`, y búsquedas en el código (`rg`) de: rate limiting, Helmet, Swagger, MFA, TTS, MobileNet/TF.js/TFLite, Grad-CAM, botones de Telegram, canales, exportación, caja, CIE-10, alergias, ocupación, almacenamiento de tokens, CI y linters.
3. **No ejecuté** la pila ni las pruebas: no hay credenciales (Mailtrap, Telegram, Claude) ni dispositivo.
