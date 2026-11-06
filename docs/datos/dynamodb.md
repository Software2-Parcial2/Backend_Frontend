# DynamoDB: MS3 (citas), MS8 (notificaciones) y claves de idempotencia

Todas las tablas son **on-demand** (`PAY_PER_REQUEST`): trafico bajo e irregular, sin planificar capacidad. Creacion repetible: `make dynamodb-init`
(`scripts/dynamodb-init.mjs`); los nombres se leen de variables de entorno en cada servicio (`IDEMPOTENCY_TABLE`, `OUTBOX_TABLE`, `PROCESSED_TABLE`; tablas de dominio `citas` / `notificaciones`).
Frecuencia: **A** alta (cada peticion o ciclo), **M** media, **B** baja.

## Tabla `citas` (MS3)

### Claves

| Item | pk | sk | Atributos relevantes |
|---|---|---|---|
| Cita + SAGA | `CITA#<citaId>` | `CITA` | `input{pacienteId, medicoId, especialidad, fechaHora}`, `estado`, `notificacion`, `saga`, `facturaId`, `motivoFallo`, `asistencia` **[nuevo, opcional]**, `version`, `createdAt`, `updatedAt` (epoch ms), claves de indices |
| Horario | `HORARIO#<medicoId>` | `<fechaHora ISO UTC>` | `estado` (`LIBRE`/`RESERVADO`/`CONFIRMADO`), `citaId`, `reservaExpiraEn` (epoch ms), `expiresAt` **[nuevo, opcional]** (TTL de horarios libres antiguos) |

El `sk` del horario es ISO 8601 UTC normalizado (`2026-11-20T14:00:00.000Z`): ordena lexicograficamente = cronologicamente, de modo que `BETWEEN` sobre fechas funciona.

### Patrones de acceso

| # | Quien | Pregunta | Frecuencia | Operacion |
|---|---|---|---|---|
| 1 | API (`GET /api/citas/{id}`), SAGA | Cita por id | A | `GetItem` consistente `CITA#id/CITA` |
| 2 | SAGA | Reservar / confirmar / liberar horario atomicamente con el cambio de cita y el outbox | A | `TransactWriteItems` con condiciones (abajo) |
| 3 | API paciente (`GET /api/citas`) | Mis citas, mas recientes primero | M | `Query gsi2` (`PACIENTE#id`), orden descendente, `Limit` + cursor |
| 4 | API medico/recepcion | Agenda de un medico por rango de fechas | M | `Query gsi3` (`MEDICO#id`, `gsi3sk BETWEEN`), ascendente |
| 5 | API admin/recepcion | Listado general, recientes primero | B | `Query gsi4` (`CITA`), descendente |
| 6 | Barrido de SAGAs | SAGAs vencidas | A (cada 1 s) | `Query gsi1` (`SAGA#ACTIVA`, `gsi1sk <= ahora`) |
| 7 | Barrido de notificaciones | Notificaciones por reintentar | A | `Query gsi1` (`NOTIF#PENDIENTE`, `gsi1sk <= ahora`) |
| 8 | **Disponibilidad [nuevo]** (`GET /api/citas/disponibilidad`) | Horarios de un medico en un rango, con su estado | M | `Query` base `pk = HORARIO#medico AND sk BETWEEN :desde AND :hasta`, `Limit` + cursor, filtro opcional `soloLibres` |
| 9 | Estadistica de asistencia (MS7, **diseñado**) | Historial de asistencia de un paciente | B | `Query gsi2` del paciente (la proyeccion `ALL` ya incluye `asistencia`) |

### Indices

| Indice | Clave | Proyeccion | Justificacion |
|---|---|---|---|
| `gsi1` | `gsi1pk` (`SAGA#ACTIVA` / `NOTIF#PENDIENTE`) + `gsi1sk` (N, plazo) | KEYS_ONLY | **Disperso**: solo items con trabajo pendiente; el barrido lee solo lo vencido y luego carga el agregado |
| `gsi2` | `PACIENTE#<id>` + creacion (N) | ALL | Patron 3 y regla "el paciente solo ve lo suyo" (la clave de particion ES el filtro de seguridad) |
| `gsi3` | `MEDICO#<id>` + fecha de la cita (N) | ALL | Patron 4; ordenado por fecha para la agenda |
| `gsi4` | `CITA` + creacion (N) | ALL | Patron 5. **Una sola particion**: valida a este volumen (< ~1000 citas/s); ver "Particion de gsi4" |

No se usan LSI: los LSI exigen definirse al crear la tabla, limitan la particion a 10 GB y aqui ningun patron necesita otro orden sobre la misma `pk`.
`Scan`: **ninguno en el codigo de acceso** (el bloque 0 ya los reemplazo por `Query`). Solo `dynamodb-init` hace un `Scan` unico de relleno de indices para citas anteriores; es una migracion de datos, no un camino de peticion.

### Condiciones de escritura (doble reserva)

| Operacion | Condicion | Efecto si falla |
|---|---|---|
| Crear cita | `attribute_not_exists(pk)` | `ConcurrentUpdateError` |
| Actualizar cita | `version = :esperada` (optimista) | `ConcurrentUpdateError` |
| `RESERVAR` | `attribute_not_exists(pk) OR estado = 'LIBRE' OR (estado = 'RESERVADO' AND reservaExpiraEn < :ahora)` | `HorarioNoDisponibleError` (409) |
| `CONFIRMAR` | `estado = 'RESERVADO' AND citaId = :cita` | `HorarioPerdidoError` -> compensacion |
| `LIBERAR` | `citaId = :cita` | se ignora (el horario ya es de otra cita) |

Todas viajan en **una** `TransactWriteItems` junto al item `outbox`, asi que no hay doble reserva ni evento perdido. **La expiracion de una reserva NO usa el TTL de DynamoDB** (puede tardar hasta 48 h): se evalua con `reservaExpiraEn < :ahora` al leer y en la condicion.

### TTL

`citas` tiene TTL sobre `expiresAt` [nuevo] **solo** para horarios `LIBRE` generados por la semilla (fecha del horario + 7 dias): limpia agenda vieja sin tocar citas, sagas ni reservas (esos items no llevan `expiresAt`). Es limpieza de almacenamiento; ninguna regla de negocio depende de el.

### Particion de `gsi4` (diseñado, no implementado)

Para volumen alto: `gsi4pk = CITA#<aaaa-mm>` y el listado consulta el mes actual y retrocede por cursor compuesto `{mes, lastEvaluatedKey}`. Migracion: reescribir `gsi4pk` de los items existentes
(`UpdateItem` por item, idempotente, dirigido por `gsi4`). No se hace: cambiaria el cursor (contrato de la API) sin necesidad hoy.

## Tabla `notificaciones` (MS8)

| Item | pk | sk | Indice | Notas |
|---|---|---|---|---|
| Notificacion | `CITA#<id>` | `NOTIF#<tipo>` | `gsi1` = `NOTIF#PENDIENTE` por `proximoIntento` (disperso) | version optimista; `canalesEnviados`, `intentos`, `ultimoError` |
| Recordatorio | `CITA#<id>` | `RECORDATORIO` | `gsi2` = `RECORDATORIO#PENDIENTE` por fecha de la cita (disperso) | se quita del indice al marcarse |
| Contacto | `PACIENTE#<id>` | `CONTACTO` | — | email, canales preferidos, `telegramChatId` (**sensible**) |
| Vinculo Telegram | `VINCULO#<codigo>` | `VINCULO` | — | un solo uso, 10 min; TTL `expiresAt` |

| # | Quien | Pregunta | Frecuencia | Operacion |
|---|---|---|---|---|
| 1 | Consumidor SAGA | Notificacion de (cita, tipo) | A | `GetItem` consistente |
| 2 | Barrido | Notificaciones pendientes vencidas | A | `Query gsi1` |
| 3 | API `GET /api/notificaciones?citaId=` | Notificaciones de una cita | M | `Query pk = CITA#id AND begins_with(sk, 'NOTIF#')` |
| 4 | Workflow horario | Recordatorios en una ventana | M | `Query gsi2 BETWEEN` |
| 5 | Notificar / Telegram | Contacto del paciente | A | `GetItem` |
| 6 | Vinculacion | Consumir codigo (atomico) | B | `UpdateItem` con `usado = false AND expiraEn > :now` |
| 7 | Historial por paciente (**diseñado**) | Notificaciones de un paciente | B | `gsi3` `PACIENTE#id` por fecha; se anadira al crear el endpoint |

Condiciones: crear notificacion `attribute_not_exists(pk)` / actualizar por `version`; crear vinculo `attribute_not_exists(pk)`; consumir vinculo atomico (arriba).
TTL: solo `expiresAt` de los vinculos (codigo + 1 h). Las notificaciones **no** expiran por TTL: son registro de lo enviado (retencion: ver [operacion.md](operacion.md)).

## Tablas tecnicas (`outbox`, `idempotency_keys`, `processed_messages`, `ms5_/ms8_*`)

| Tabla | pk | TTL | Stream | Politica |
|---|---|---|---|---|
| `idempotency_keys`, `ms5_…`, `ms8_…` | `<sub>:<Idempotency-Key>` | `expiresAt` (epoch s) = creacion + 24 h | — | TTL; lo vencido se ignora al leer aunque siga en la tabla |
| `processed_messages`, `ms8_processed_messages` | `<id del mensaje>` | `expiresAt` | — | TTL (ventana de deduplicacion); `status`, `lockedUntil` |
| `outbox`, `ms8_outbox` | `<id del sobre>` | — | `NEW_IMAGE` | Atributos `exchange`, `routingKey`, `envelope` (JSON), `createdAt`. La Lambda/poller publica desde el stream; el item permanece como registro. TTL de `outbox` **[diseñado]**: anadir `expiresAt` al item y activar TTL |

## Migracion de datos de tablas existentes

Los cambios son **aditivos** (TTL sobre `citas`, atributo `asistencia` opcional, `expiresAt` opcional): no cambia ninguna clave ni indice, asi que **no hace falta migrar datos**. `make dynamodb-init` activa el TTL en
tablas existentes de forma idempotente (ya lo hacia para las demas).
