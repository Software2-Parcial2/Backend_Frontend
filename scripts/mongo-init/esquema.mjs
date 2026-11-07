// Esquema de MongoDB de SIGEC: validadores $jsonSchema e indices por coleccion. Fuente de verdad (docs/datos/mongodb.md).
// Lo usan `scripts/mongo-init/index.mjs` (make mongo-init) y las pruebas de MS5, para que el repositorio y el validador no diverjan.

const num = ['int', 'long', 'double'];
const nn = { bsonType: 'string', minLength: 1 };

export const IMAGENES_VALIDATOR = {
  $jsonSchema: {
    bsonType: 'object',
    required: ['_id', 'pacienteId', 'estudio', 'estado', 'hashSha256', 'mime', 'bytes', 'bucket', 'objectKey', 'usuarioId', 'creadaEn', 'actualizadaEn'],
    additionalProperties: false,
    properties: {
      _id: nn,
      pacienteId: nn,
      estudio: nn,
      estado: { enum: ['SUBIDA', 'ANALIZANDO', 'ANALIZADA', 'FALLIDA'] },
      hashSha256: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
      mime: { enum: ['image/jpeg', 'image/png', 'application/dicom'] },
      bytes: { bsonType: num, minimum: 0 },
      bucket: nn,
      objectKey: nn,
      usuarioId: nn,
      resultado: {
        bsonType: 'object',
        required: ['probabilidad_neumonia', 'clase', 'modelo'],
        properties: {
          probabilidad_neumonia: { bsonType: [...num, 'decimal'], minimum: 0, maximum: 1 },
          clase: { enum: ['NEUMONIA', 'NORMAL'] },
          version_modelo: { bsonType: 'string' },
          modelo: { bsonType: 'string' },
          aviso: { bsonType: 'string' },
        },
      },
      error: { bsonType: 'string' },
      // Fase 5 (opcionales: los documentos anteriores no los traen; MS5 siempre escribe origen y validacion).
      origen: { enum: ['MEDICO', 'PACIENTE'] },
      validacion: { enum: ['PENDIENTE', 'VALIDADO', 'DESCARTADO'] },
      informe: {
        bsonType: 'object',
        required: ['decision', 'validadoPor', 'validadoEn', 'huella'],
        properties: {
          decision: { enum: ['CONFIRMA', 'MODIFICA', 'DESCARTA'] },
          texto: { bsonType: ['string', 'null'] },
          validadoPor: nn,
          medicoId: { bsonType: ['string', 'null'] },
          validadoEn: { bsonType: num, minimum: 0 },
          huella: { bsonType: 'string', pattern: '^[0-9a-f]{64}$' },
          versionModelo: { bsonType: ['string', 'null'] },
        },
      },
      eventoPendiente: { bsonType: 'bool' },
      observaciones: { bsonType: 'string' },
      pacienteNombre: { bsonType: 'string' },
      numeroHistoria: { bsonType: 'string' },
      gradcamKey: { bsonType: 'string' },
      intentosAnalisis: { bsonType: num, minimum: 0 },
      creadaEn: { bsonType: num, minimum: 0 },
      actualizadaEn: { bsonType: num, minimum: 0 },
    },
  },
};

export const COLECCIONES = [
  {
    name: 'imagenes',
    validator: IMAGENES_VALIDATOR,
    indexes: [
      // Listado por paciente (mas recientes primero) con cursor (creadaEn, _id).
      { key: { pacienteId: 1, creadaEn: -1, _id: -1 }, name: 'pacienteId_1_creadaEn_-1__id_-1' },
      // Barrido de imagenes atascadas.
      { key: { estado: 1, actualizadaEn: 1 }, name: 'estado_1_actualizadaEn_1' },
      // Bandeja de validacion (por estado de la validacion, mas recientes primero).
      { key: { validacion: 1, creadaEn: -1, _id: -1 }, name: 'validacion_1_creadaEn_-1__id_-1' },
      // Duplicado: misma huella para el mismo paciente (IMAGEN_DUPLICADA).
      { key: { pacienteId: 1, hashSha256: 1 }, name: 'pacienteId_1_hashSha256_1' },
      // Eventos de validacion por publicar.
      { key: { eventoPendiente: 1 }, name: 'eventoPendiente_1', sparse: true },
      // Mismo archivo subido mas de una vez (no unico: puede ser otro estudio).
      { key: { hashSha256: 1 }, name: 'hashSha256_1' },
      // Una clave de S3 = un documento.
      { key: { objectKey: 1 }, name: 'objectKey_1', unique: true },
    ],
    // Indice suelto que creaba Mongoose por `index: true`; lo cubre el compuesto.
    dropIndexes: ['pacienteId_1'],
  },
];
