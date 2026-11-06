# MongoDB: MS5 (metadatos de imagenes)

Base `sigec_imagenes` (variable `MONGO_URL`), una coleccion. El binario de la radiografia **no** esta en Mongo: va a S3 (SeaweedFS, bucket privado) y aqui solo queda su clave (`objectKey`, no adivinable y nunca expuesta por la API).

## Por que documentos aqui

- El **resultado del analisis** es un subdocumento cuya forma cambia con el modelo (hoy `probabilidad_neumonia`/`clase`; manana mas clases, mapas de calor, otro modelo). Anidarlo evita una tabla por version y un `JOIN`.
- El ciclo de vida (`SUBIDA -> ANALIZANDO -> ANALIZADA|FALLIDA`) se aplica con `findOneAndUpdate` condicional sobre **un solo documento**: es atomico sin transaccion y es lo que hace idempotentes las transiciones.
- Acceso siempre por id o por paciente; no hay relaciones que unir. (Si el esquema fuera estable y se cruzara con facturas o historias, iria en PostgreSQL.)

## Coleccion `imagenes`

| Campo | Tipo BSON | Req. | Notas |
|---|---|---|---|
| `_id` | string (uuid) | si | id de la imagen |
| `pacienteId` | string | si | ref MS2 (uuid) |
| `estudio` | string | si | tipo de estudio (p. ej. `torax-pa`) |
| `estado` | string enum | si | `SUBIDA`, `ANALIZANDO`, `ANALIZADA`, `FALLIDA` |
| `hashSha256` | string (64 hex) | si | integridad y deteccion de duplicados |
| `mime` | string enum | si | `image/jpeg`, `image/png`, `application/dicom` |
| `bytes` | number >= 0 | si | tamano |
| `bucket`, `objectKey` | string | si | ubicacion en S3 (**sensible**: no se expone) |
| `usuarioId` | string | si | `sub` de Keycloak de quien subio |
| `resultado` | object | no | `probabilidad_neumonia` (0..1), `clase` (`NEUMONIA`/`NORMAL`), `version_modelo`, `modelo`, `aviso`; se admiten campos adicionales |
| `error` | string | no | motivo si `FALLIDA` |
| `intentosAnalisis` | number >= 0 | no | reenvios al servicio de inferencia |
| `creadaEn`, `actualizadaEn` | number (epoch ms) | si | |

### Validador

`scripts/mongo-init` aplica `collMod`/`create` con `validationLevel: "strict"` y `validationAction: "error"`: Mongo rechaza un documento mal formado aunque lo escriba otro cliente.

```js
{ $jsonSchema: {
  bsonType: "object",
  required: ["_id","pacienteId","estudio","estado","hashSha256","mime","bytes","bucket","objectKey","usuarioId","creadaEn","actualizadaEn"],
  additionalProperties: false,
  properties: {
    _id: { bsonType: "string", minLength: 1 },
    pacienteId: { bsonType: "string", minLength: 1 },
    estudio: { bsonType: "string", minLength: 1 },
    estado: { enum: ["SUBIDA","ANALIZANDO","ANALIZADA","FALLIDA"] },
    hashSha256: { bsonType: "string", pattern: "^[0-9a-f]{64}$" },
    mime: { enum: ["image/jpeg","image/png","application/dicom"] },
    bytes: { bsonType: ["int","long","double"], minimum: 0 },
    bucket: { bsonType: "string", minLength: 1 },
    objectKey: { bsonType: "string", minLength: 1 },
    usuarioId: { bsonType: "string", minLength: 1 },
    resultado: { bsonType: "object", required: ["probabilidad_neumonia","clase","modelo"],
      properties: { probabilidad_neumonia: { bsonType: ["double","int","long","decimal"], minimum: 0, maximum: 1 },
                    clase: { enum: ["NEUMONIA","NORMAL"] }, version_modelo: { bsonType: "string" },
                    modelo: { bsonType: "string" }, aviso: { bsonType: "string" } } },
    error: { bsonType: "string" },
    intentosAnalisis: { bsonType: ["int","long","double"], minimum: 0 },
    creadaEn: { bsonType: ["int","long","double"], minimum: 0 },
    actualizadaEn: { bsonType: ["int","long","double"], minimum: 0 }
  } } }
```

La fuente de verdad del validador es `scripts/mongo-init/esquema.mjs` (la doc lo resume). MS5 no lo aplica por su cuenta: Mongoose solo crea indices; los validadores los pone `make mongo-init`.

### Indices

| Indice | Tipo | Para |
|---|---|---|
| `{pacienteId:1, creadaEn:-1, _id:-1}` | compuesto | `GET /api/imagenes?pacienteId=` ordenado, con cursor `(creadaEn, _id)` (existente) |
| `{estado:1, actualizadaEn:1}` | compuesto | barrido de imagenes atascadas (`SUBIDA`/`ANALIZANDO` antiguas) (existente) |
| `{hashSha256:1}` | simple, **no unico** [nuevo] | detectar el mismo archivo subido dos veces (puede ser legitimo: otro estudio) |
| `{objectKey:1}` | **unico** [nuevo] | una clave S3 = un documento; protege contra colisiones |

TTL: **ninguno**. Una imagen clinica y su resultado no caducan solos; la retencion es una decision clinica/legal (ver [operacion.md](operacion.md)). El indice suelto `{pacienteId:1}` que crea Mongoose por `index: true` queda redundante con el compuesto y se elimina en el script.
