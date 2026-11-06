# Modelo de datos de SIGEC

Auditoria y diseno del modelo de datos (Fase 1) y su implementacion (Fase 2). Todo lo descrito como "existente" se leyo de las migraciones, entidades,
repositorios y scripts del repo; lo nuevo esta marcado como **[nuevo]** y lo no construido como **[diseñado]**.

| Documento | Contenido |
|---|---|
| [auditoria.md](auditoria.md) | Inventario real por servicio y huecos del modelo, con dueno y decision |
| [postgresql.md](postgresql.md) | Diagramas ER (ms2, ms4, ms6, ms7), restricciones, indices, tipos, outbox/idempotencia, pgvector |
| [dynamodb.md](dynamodb.md) | Patrones de acceso, claves pk/sk, GSI, TTL, condiciones de escritura (MS3, MS5, MS8) |
| [mongodb.md](mongodb.md) | Coleccion `imagenes`: validador `$jsonSchema`, indices, justificacion |
| [diccionario.md](diccionario.md) | Diccionario de datos con columna **sensible** y tratamiento (generado desde las bases reales + notas) |
| [operacion.md](operacion.md) | Migraciones, datos semilla, copias de seguridad, retencion y limpieza |

## Mapa de bases por servicio

| Servicio | Tecnologia | Base / almacen | Por que |
|---|---|---|---|
| MS2 Pacientes (+ catalogo de especialidades y medicos **[nuevo]**) | PostgreSQL 16 | `ms2_pacientes` | Datos maestros, pocas escrituras, integridad referencial (medico -> especialidad), unicidad de documento |
| MS3 Citas | DynamoDB | `citas`, `idempotency_keys`, `outbox`, `processed_messages` | Reserva atomica de horarios con escrituras condicionales, SAGA con `TransactWriteItems`, acceso siempre por clave |
| MS4 Historias clinicas | PostgreSQL 16 | `ms4_historias` | Datos clinicos relacionales, versionado optimista, auditoria y restricciones fuertes |
| MS5 Imagenes | MongoDB 7 + S3 (SeaweedFS) | `sigec_imagenes.imagenes` | Documento con resultado de IA anidado y de forma variable (cambia con el modelo); el binario va a S3 |
| MS5 (idempotencia) | DynamoDB | `ms5_idempotency_keys` | Mismo patron que MS3, con TTL |
| MS6 Facturacion | PostgreSQL 16 | `ms6_facturacion` | Dinero (`numeric`), transacciones, ledger e informes por agregacion |
| MS7 Inteligencia | PostgreSQL 16 + pgvector | `ms7_inteligencia` | Vectores del RAG (HNSW) junto a los metadatos relacionales; auditoria del agente |
| MS8 Notificaciones | DynamoDB | `notificaciones`, `ms8_*` | Acceso por clave (cita, paciente, codigo), reintentos con indice disperso, TTL de codigos |
| Keycloak / n8n | PostgreSQL | `keycloak`, `n8n` | **No se tocan** |

Regla: una base por servicio, **sin claves foraneas entre bases**. Las referencias entre servicios son UUID "blandos" y la consistencia es eventual por eventos.

## Referencias entre servicios

| Desde (servicio.campo) | Hacia | Como se mantiene | Si el destino no existe |
|---|---|---|---|
| MS3 `cita.input.pacienteId` | MS2 `pacientes.id` | Validacion solo por claim/rol; no se verifica existencia | La cita se crea; MS6 puede rechazar el cobro |
| MS3 `cita.input.medicoId` | MS2 `medicos.id` **[nuevo]** | Sin verificacion en la reserva (modo abierto); el catalogo alimenta disponibilidad | La cita se acepta (comportamiento actual) |
| MS3 `cita.input.especialidad` | MS2 `especialidades.codigo` **[nuevo]** / MS6 `tarifas.especialidad` | Cadena en minusculas (`cardiologia`) | MS6 rechaza el cobro "sin tarifa" |
| MS3 `cita.facturaId` | MS6 `facturas.id` | Evento `cobro-provisional.registrado` | — |
| MS6 `facturas.cita_id` | MS3 `CITA#<id>` | Comando `cobro-provisional.solicitar` (unicidad por cita) | — |
| MS6 `facturas.paciente_id` | MS2 `pacientes.id` | Comando de la SAGA | Factura creada igualmente |
| MS4 `historias_clinicas.paciente_id` | MS2 `pacientes.id` | Por id; alta futura via `paciente.creado` | — |
| MS4 `consultas.medico_id` | MS2 `medicos.id` **[nuevo]** | Por id | — |
| MS4 `consultas.cita_id` **[nuevo]** | MS3 `CITA#<id>` | Por id (opcional) | Consulta sin cita (urgencias) |
| MS5 `imagenes.pacienteId` | MS2 `pacientes.id` | Verificacion HTTP al subir (`PacienteInexistenteError`) | 404/422 al subir |
| MS5 `imagenes.usuarioId` | Keycloak `sub` | Claim del JWT | — |
| MS8 `PACIENTE#<id>/CONTACTO` | MS2 `pacientes.id` | Evento `paciente.creado` (email, nombre) | Notificacion falla "sin canal de contacto" |
| MS8 `CITA#<id>/NOTIF#..` | MS3 `CITA#<id>` | Comando `cita-confirmada.enviar` | — |
| MS7 `agente_auditoria.usuario_id` **[nuevo]** | Keycloak `sub` | Claim del JWT | — |
| MS7 (lectura) | MS3, MS6 (HTTP) y MS2 **[diseñado]** | Propaga el token del usuario | — |
| MS2 `medicos.usuario_keycloak` **[nuevo]** | Keycloak `preferred_username` | Dato de semilla/alta; sin migrar el realm | Medico sin usuario |
| Keycloak `paciente_id` (claim) | MS2 `pacientes.id` | Atributo del usuario en el realm | Ver `docs/PENDIENTES.md` (bloque 0) |

## Diagrama de contexto

```mermaid
flowchart LR
  KC[(Keycloak<br/>sub, paciente_id, roles)]
  subgraph PG[PostgreSQL]
    MS2[(ms2_pacientes<br/>pacientes, medicos,<br/>especialidades)]
    MS4[(ms4_historias<br/>historias, consultas,<br/>antecedentes, auditoria)]
    MS6[(ms6_facturacion<br/>facturas, tarifas,<br/>ledger)]
    MS7[(ms7_inteligencia<br/>RAG pgvector,<br/>auditoria agente)]
  end
  subgraph DDB[DynamoDB]
    MS3[(citas<br/>CITA#, HORARIO#)]
    MS8[(notificaciones<br/>CONTACTO, NOTIF#)]
  end
  MG[(MongoDB<br/>imagenes)]
  S3[(S3 SeaweedFS<br/>binarios)]
  MQ{{RabbitMQ<br/>sigec.saga / sigec.eventos}}

  MS3 -- "pacienteId, medicoId, especialidad" -.-> MS2
  MS6 -- "cita_id / paciente_id" -.-> MS3
  MS4 -- "paciente_id, medico_id, cita_id" -.-> MS2
  MS4 -. "cita_id" .-> MS3
  MG -- "pacienteId" -.-> MS2
  MG --> S3
  MS8 -- "pacienteId (paciente.creado)" -.-> MS2
  MS3 <--> MQ
  MS6 <--> MQ
  MS8 <--> MQ
  MS2 --> MQ
  MS7 -. "HTTP con token del usuario" .-> MS3
  MS7 -. HTTP .-> MS6
  KC -. "JWT: sub, roles, paciente_id" .-> MS2
```

Las flechas punteadas son referencias por id, sin clave foranea.

## Principios

1. **Una base por servicio**; nadie lee la base de otro. Los datos viajan por API o por evento.
2. **Migraciones versionadas e inmutables** (Flyway V3, V4... en Spring; archivos nuevos en Laravel; `NNNN_*.sql` en MS7). Nunca se editan las ya aplicadas.
3. **Datos clinicos y personales**: marcados en el [diccionario](diccionario.md); jamas en eventos, notificaciones ni logs (los eventos llevan ids).
4. **Dinero** en `numeric(12,2)` con moneda; **fechas** en `timestamptz` (UTC); **ids** en `uuid` generados por la aplicacion.
5. **Lo minimo suficiente**: lo no implementado queda en la tabla "diseñado, no implementado" de [auditoria.md](auditoria.md).
