# Diccionario de datos y tratamiento de datos sensibles

Dos partes: (1) la **politica** y la lista de campos sensibles (escrita a mano, aqui); (2) el **diccionario completo por tabla/coleccion**
(`tabla | campo | tipo | nulo | clave/indice | descripcion | sensible`), que se **genera** desde las bases reales en [diccionario-generado.md](diccionario-generado.md)
con `make datos-docs` (columna sensible tomada de `COMMENT ON COLUMN ... 'SENSIBLE: ...'` en PostgreSQL y de la lista de abajo en DynamoDB/Mongo).

## Categorias

| Categoria | Ejemplos | Tratamiento minimo |
|---|---|---|
| **P - personal** (identifica) | nombre, documento, telefono, email, fecha de nacimiento, `telegramChatId` | Cifrado en reposo del almacenamiento; acceso por rol; no en logs ni eventos (salvo el minimo acordado en el contrato) |
| **C - clinico** | motivo, diagnostico, tratamiento, antecedentes, evolucion, signos vitales, imagen y resultado de IA | Lo anterior + auditoria de lectura + minimizacion (nunca en eventos/notificaciones/logs/LLM) + consentimiento |
| **S - secreto/tecnico** | `objectKey` de S3, hashes de peticion, claves de idempotencia, codigos de vinculo | No exponer por API; no en logs |
| (ninguna) | ids, estados, montos, fechas de sistema | — |

## Campos sensibles por almacen

| Almacen | Campo | Cat. | Tratamiento propuesto |
|---|---|---|---|
| ms2 `pacientes` | `nombre`, `documento`, `telefono`, `email`, `fecha_nacimiento` | P | Disco cifrado; `documento` unico; el evento `paciente.creado` lleva solo lo necesario (nombre, documento, email del contrato) |
| ms2 `pacientes` | `beca`, `tipo_seguro` | P (socioeconomico) | Se usa para el modelo de inasistencia de MS7: solo como atributo agregado, nunca con nombre |
| ms2 `medicos` | `nombre`, `documento`, `matricula`, `email`, `telefono`, `usuario_keycloak` | P | Disco cifrado |
| ms4 `consultas` | `motivo`, `diagnostico`, `tratamiento`, `signos_vitales` | C | Disco cifrado; **cifrado a nivel de campo [diseñado]**: AES-256-GCM con clave por entorno (KMS/Vault), IV aleatorio por valor y `key_id` en un prefijo para rotar. No se implementa: impide buscar por esas columnas y exige gestion de claves; se decide cuando exista la API de MS4 |
| ms4 `antecedentes.descripcion`, `evoluciones.nota` | C | idem |
| ms4 `consentimientos` | `paciente_id`, `tipo`, fechas | P | Disco cifrado; conservar tras revocar (prueba legal) |
| ms4 `auditoria_accesos` | `usuario_id`, `paciente_id`, `accion` | P (traza) | Append-only; sin contenido clinico; retencion larga |
| ms6 `facturas` | `paciente_id`, `monto` | P | Sin datos clinicos: la factura **no** lleva diagnostico; solo `cita_id` |
| ms7 `agente_auditoria` | `usuario_id`, `parametros` | P | Parametros redactados; **sin** nombres/documentos de pacientes ni la pregunta en claro |
| ms7 `rag_*` | — | — | Documentos administrativos ficticios; sin datos de pacientes |
| DynamoDB `citas` | `input.pacienteId`, `input.fechaHora`, `asistencia` | P | Ids, no nombres. `motivoFallo` no debe incluir datos clinicos |
| DynamoDB `notificaciones` | `PACIENTE#/CONTACTO`: `email`, `nombre`, `telegramChatId` | P | Cifrado en reposo de DynamoDB (SSE; en AWS con clave KMS administrada). Las notificaciones no llevan datos clinicos (plantillas), Telegram menos que el correo |
| DynamoDB `notificaciones` | `VINCULO#codigo` | S | Un uso, 10 min, TTL |
| DynamoDB `*idempotency_keys` | respuesta cacheada | S/P | La respuesta puede incluir datos personales: TTL 24 h |
| MongoDB `imagenes` | `pacienteId`, `resultado`, `estudio` | C | Disco cifrado; el binario en S3 con bucket privado y URL prefirmada de corta vida; `objectKey` nunca se expone |
| S3 | binario de la radiografia | C | Cifrado en reposo del bucket (SSE) en produccion |

## Cifrado en reposo (por entorno)

- **Desarrollo local:** volumenes de Docker sin cifrado (datos ficticios). No se promete confidencialidad en local.
- **Produccion (propuesta):** PostgreSQL gestionado con cifrado de volumen (KMS) y TLS; DynamoDB cifra siempre en reposo (clave propiedad de AWS o KMS administrada); S3 con SSE-KMS; MongoDB con cifrado de almacenamiento (WiredTiger/Atlas) y TLS.
- **Cifrado a nivel de campo:** solo para columnas clinicas de texto libre (`diagnostico`, `tratamiento`, `nota`, `descripcion`), cuando MS4 tenga API. **Diseñado, no implementado** (motivos arriba).

## Minimizacion y retencion

| Dato | Retencion propuesta | Mecanismo |
|---|---|---|
| Historia clinica y consultas | 15 anos desde la ultima atencion (valor de referencia; confirmar con la normativa aplicable) | Archivado, no borrado automatico |
| `auditoria_accesos` | >= la de la historia | Particion mensual + archivado **[diseñado]** |
| `outbox` publicado, `idempotency_keys`, `processed_messages` | 7 dias / 24 h / ventana de deduplicacion | `purgar_tecnico()` y TTL |
| Notificaciones | 1 ano | **[diseñado]** (TTL cuando se decida) |
| Imagenes | igual que la historia | — |
| `agente_auditoria` | 1 ano | `DELETE` programado **[diseñado]** |

Regla de oro: **ningun dato clinico en eventos (RabbitMQ), notificaciones, logs ni prompts de LLM**. Los eventos llevan ids; el agente de MS7 pasa por `redaccion.ts`.
