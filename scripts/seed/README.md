# Datos semilla (solo desarrollo)

`make seed` carga un conjunto **ficticio y coherente entre servicios**; `make seed-reset` borra solo lo sembrado. Ambos son repetibles y se niegan a correr con
`SIGEC_ENV=prod|production` o si PostgreSQL, DynamoDB o MongoDB no estan en `localhost`.

Requisitos: migraciones aplicadas (MS2/MS4 al arrancar el servicio por Flyway; MS6 con `php artisan migrate`; MS7 al arrancar), `make dynamodb-init` y MongoDB.
Si el puerto 5432/27017/8000 esta ocupado, pasa los puertos por variables (la semilla lee `.env` **sin pisar** lo ya definido):
`POSTGRES_PORT=5440 MONGO_URL=mongodb://localhost:27040/sigec_imagenes DYNAMODB_ENDPOINT=http://localhost:8040 make seed`.

| Servicio | Que se siembra |
|---|---|
| MS2 | 4 especialidades, 4 medicos (`medico` de Keycloak = Dr. Andres Soliz, via `usuario_keycloak`), 6 pacientes con `beca` y `tipo_seguro`. El paciente `a0000000-0000-4000-8000-000000000001` es el del claim `paciente_id` del usuario `paciente` |
| MS3 | ~72 citas pasadas (jul-oct 2026, ~26 % de inasistencia, distinta por paciente) con `asistencia`, 1 cita futura confirmada del paciente demo, ~160 horarios `LIBRE` para los proximos 14 dias (con TTL), y los `HORARIO#` confirmados de las citas |
| MS4 | 6 historias, 30 consultas (de las citas a las que se asistio, con `cita_id`), 5 antecedentes, consentimientos |
| MS5 | 3 documentos de metadatos de imagenes en Mongo. **No hay objeto en S3** (la URL prefirmada de esas imagenes no existe) |
| MS6 | 4 tarifas (las mismas de `config/facturacion.php`) y una factura por cita cobrada (`CONFIRMADA`/`ANULADA`; la cita futura `PROVISIONAL`), con su ledger |
| MS8 | contacto (email `*@example.test`) de cada paciente, 12 notificaciones `ENVIADA` y el recordatorio pendiente de la cita futura |

Ids fijos: `a0…` pacientes, `d0…` medicos, `e0…` especialidades, `c0…` citas, `f0…` facturas, `b0…` historias (ver `datos.mjs`). Los eventos **no** se publican: es carga directa a las bases (como `paciente-demo.sh`, que esta semilla reemplaza).
Los datos son inventados; no usar con informacion real.
