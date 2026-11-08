#!/usr/bin/env node
// Datos semilla coherentes entre servicios (solo desarrollo). Repetible: cada escritura es un upsert por id fijo.
//   make seed          crea/actualiza
//   make seed-reset    borra SOLO lo sembrado (ids de scripts/seed/datos.mjs)
// Requisitos: migraciones aplicadas (ms2/ms4 por Flyway al arrancar el servicio, ms6 con `php artisan migrate`),
// DynamoDB con las tablas (`make dynamodb-init`) y MongoDB. Los datos son ficticios.
import { BatchWriteCommand, DeleteCommand, DynamoDBDocumentClient, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { MongoClient } from 'mongodb';
import pg from 'pg';
import { aplicar as aplicarMongo } from '../mongo-init/index.mjs';
import { ESPECIALIDADES, MEDICOS, PACIENTES, generar, uid } from './datos.mjs';

try {
  process.loadEnvFile(new URL('../../.env', import.meta.url)); // no pisa variables ya definidas
} catch {
  /* sin .env */
}
const env = (k, d) => process.env[k] ?? d;
const reset = process.argv.includes('--reset');

// --- Proteccion: solo desarrollo local ---
const entorno = env('SIGEC_ENV', 'development').toLowerCase();
const pgHost = env('POSTGRES_HOST', 'localhost');
const ddbEndpoint = env('DYNAMODB_ENDPOINT', 'http://localhost:8000');
const mongoUrl = env('MONGO_URL', 'mongodb://localhost:27017/sigec_imagenes');
const local = (u) => /(localhost|127\.0\.0\.1|\[::1\])/.test(u);
if (['prod', 'production', 'produccion'].includes(entorno) || !local(pgHost) || !local(ddbEndpoint) || !local(mongoUrl)) {
  console.error(`Rechazado: la semilla solo corre en desarrollo local (SIGEC_ENV=${entorno}, postgres=${pgHost}, dynamodb=${ddbEndpoint}, mongo=${mongoUrl}).`);
  process.exit(1);
}

const D = generar(new Date());
const NUMERO_HC = new Map();
const pgConfig = (database) => ({
  host: pgHost, port: Number(env('POSTGRES_PORT', env('POSTGRES_HOST_PORT', '5432'))), user: env('POSTGRES_USER', 'sigec'), password: env('POSTGRES_PASSWORD', ''), database,
});
const ddb = DynamoDBDocumentClient.from(
  new DynamoDBClient({ endpoint: ddbEndpoint, region: env('AWS_REGION', 'sa-east-1'), credentials: { accessKeyId: env('AWS_ACCESS_KEY_ID', 'local'), secretAccessKey: env('AWS_SECRET_ACCESS_KEY', 'local') } }),
  { marshallOptions: { removeUndefinedValues: true } },
);
const T = { citas: env('CITAS_TABLE', 'citas'), notificaciones: env('NOTIFICACIONES_TABLE', 'notificaciones') };

async function conBase(database, fn) {
  const c = new pg.Client(pgConfig(database));
  await c.connect();
  try {
    await c.query('BEGIN');
    if (reset) await c.query('SET LOCAL session_replication_role = replica'); // permite borrar tablas de solo anadir (ledger, evoluciones)
    await fn(c);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    if (e.code === '42P01') throw new Error(`Falta una tabla en ${database} (${e.message}). Aplica las migraciones: arranca el servicio (Flyway) o ejecuta "php artisan migrate" en MS6.`);
    throw e;
  } finally {
    await c.end();
  }
}
const ids = (xs) => xs.map((x) => x.id);

async function lote(tabla, items, operacion) {
  for (let i = 0; i < items.length; i += 25) {
    let pendientes = items.slice(i, i + 25).map(operacion);
    for (let intento = 0; pendientes.length && intento < 6; intento++) {
      const r = await ddb.send(new BatchWriteCommand({ RequestItems: { [tabla]: pendientes } }));
      pendientes = r.UnprocessedItems?.[tabla] ?? [];
      if (pendientes.length) await new Promise((res) => setTimeout(res, 100 * 2 ** intento));
    }
  }
}
const put = (Item) => ({ PutRequest: { Item } });
const del = (Key) => ({ DeleteRequest: { Key } });

// ---------------------------------------------------------------- items de DynamoDB
const MS = 86_400_000;
function itemCita(c) {
  const fecha = Date.parse(c.fechaHora);
  const creada = c.futura ? Date.now() : fecha - 3 * MS;
  const sagaId = uid('c1', Number.parseInt(c.id.slice(-12), 16));
  const compensada = c.estado === 'CANCELADA' || c.estado === 'ANULADA';
  const compensaciones = c.estado === 'CANCELADA' ? ['LIBERAR_HORARIO', 'NOTIFICAR_CANCELACION'] : c.estado === 'ANULADA' ? ['ANULAR_COBRO', 'LIBERAR_HORARIO', 'NOTIFICAR_CANCELACION'] : [];
  return {
    pk: `CITA#${c.id}`, sk: 'CITA', citaId: c.id,
    input: { pacienteId: c.pacienteId, medicoId: c.medicoId, especialidad: c.especialidad, fechaHora: c.fechaHora },
    estado: c.estado,
    ...(c.facturaId && c.estado !== 'CANCELADA' ? { facturaId: c.facturaId } : {}),
    ...(c.estado === 'CANCELADA' ? { motivoFallo: 'cobro rechazado: paciente bloqueado para facturacion' } : {}),
    notificacion: { estado: compensada ? 'NO_APLICA' : 'ENVIADA', intentos: compensada ? 0 : 1 },
    saga: {
      sagaId, estado: compensada ? 'COMPENSADA' : 'COMPLETADA', paso: 'FIN', intentos: 1, deadline: null, cobroSolicitado: c.estado !== 'CANCELADA',
      compensaciones, ...(c.estado === 'ANULADA' ? { anulacionCobro: 'CONFIRMADA' } : {}),
      historial: [{ at: creada, paso: 'RESERVA', evento: 'horario reservado (semilla)' }, { at: creada + 60_000, paso: 'FIN', evento: compensada ? 'compensada (semilla)' : 'completada (semilla)' }],
    },
    ...(c.asistencia ? { asistencia: c.asistencia } : {}),
    createdAt: creada, updatedAt: creada + 60_000, version: 3,
    // Indices (mismo calculo que DynamoCitaRepository.indexKeys; la SAGA esta cerrada, asi que no hay gsi1).
    gsi2pk: `PACIENTE#${c.pacienteId}`, gsi2sk: creada, gsi3pk: `MEDICO#${c.medicoId}`, gsi3sk: fecha, gsi4pk: 'CITA', gsi4sk: creada,
  };
}
const itemHorarioCita = (c) =>
  c.estado === 'CONFIRMADA'
    ? { pk: `HORARIO#${c.medicoId}`, sk: c.fechaHora, medicoId: c.medicoId, fechaHora: c.fechaHora, estado: 'CONFIRMADO', citaId: c.id }
    : { pk: `HORARIO#${c.medicoId}`, sk: c.fechaHora, medicoId: c.medicoId, fechaHora: c.fechaHora, estado: 'LIBRE', expiresAt: Math.floor(Date.parse(c.fechaHora) / 1000) + 7 * 86_400 };

// ---------------------------------------------------------------- semilla
async function sembrar() {
  await conBase('ms2_pacientes', async (c) => {
    for (const e of ESPECIALIDADES)
      await c.query('INSERT INTO especialidades (id, codigo, nombre) VALUES ($1,$2,$3) ON CONFLICT (id) DO UPDATE SET codigo = EXCLUDED.codigo, nombre = EXCLUDED.nombre', [e.id, e.codigo, e.nombre]);
    for (const m of MEDICOS) {
      const esp = ESPECIALIDADES.find((e) => e.codigo === m.esp);
      await c.query(
        `INSERT INTO medicos (id, nombre, documento, matricula, especialidad_id, email, telefono, usuario_keycloak) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, especialidad_id = EXCLUDED.especialidad_id, email = EXCLUDED.email, telefono = EXCLUDED.telefono, usuario_keycloak = EXCLUDED.usuario_keycloak`,
        [m.id, m.nombre, m.documento, m.matricula, esp.id, m.email, m.telefono, m.usuario],
      );
    }
    for (const p of PACIENTES)
      await c.query(
        `INSERT INTO pacientes (id, nombre, documento, fecha_nacimiento, telefono, email, beca, tipo_seguro) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (id) DO UPDATE SET nombre = EXCLUDED.nombre, documento = EXCLUDED.documento, fecha_nacimiento = EXCLUDED.fecha_nacimiento, telefono = EXCLUDED.telefono, email = EXCLUDED.email, beca = EXCLUDED.beca, tipo_seguro = EXCLUDED.tipo_seguro`,
        [p.id, p.nombre, p.documento, p.nacimiento, p.telefono, p.email, p.beca, p.seguro],
      );
    // El N.° de historia lo asigna MS2 (secuencia): MS4 y la proyeccion de MS3 usan ese mismo valor.
    for (const r of (await c.query('SELECT id, numero_historia FROM pacientes WHERE id = ANY($1)', [PACIENTES.map((p) => p.id)])).rows) NUMERO_HC.set(r.id, r.numero_historia);
  });

  await conBase('ms4_historias', async (c) => {
    for (const h of D.historias) await c.query('INSERT INTO historias_clinicas (id, paciente_id, numero_historia, paciente_nombre) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET numero_historia = EXCLUDED.numero_historia, paciente_nombre = EXCLUDED.paciente_nombre', [h.id, h.pacienteId, NUMERO_HC.get(h.pacienteId) ?? h.numero, h.nombre]);
    for (const k of D.consultas)
      await c.query('INSERT INTO consultas (id, historia_id, medico_id, cita_id, fecha, motivo, diagnostico, tratamiento, estado, firmada_en, firmada_por) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT (id) DO UPDATE SET estado = EXCLUDED.estado, firmada_en = EXCLUDED.firmada_en, firmada_por = EXCLUDED.firmada_por', [k.id, k.historiaId, k.medicoId, k.citaId, k.fecha, k.motivo, k.diagnostico, k.tratamiento, k.firmada ? 'FIRMADA' : 'BORRADOR', k.firmada ? k.fecha : null, k.firmada ? k.medicoId : null]);
    for (const a of D.antecedentes) await c.query('INSERT INTO antecedentes (id, historia_id, tipo, descripcion) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [a.id, a.historiaId, a.tipo, a.descripcion]);
    for (const k of D.consentimientos) await c.query('INSERT INTO consentimientos (id, paciente_id, tipo, version_texto) VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING', [k.id, k.pacienteId, k.tipo, k.version]);
  });

  await conBase('ms6_facturacion', async (c) => {
    for (const t of D.tarifas)
      await c.query('INSERT INTO tarifas (id, especialidad, monto, vigente_desde) VALUES ($1,$2,$3,$4) ON CONFLICT (id) DO UPDATE SET monto = EXCLUDED.monto', [t.id, t.especialidad, t.monto, t.desde]);
    for (const f of D.facturas) {
      const r = await c.query(
        `INSERT INTO facturas (id, cita_id, paciente_id, monto, estado, created_at, updated_at) VALUES ($1,$2,$3,$4,'PROVISIONAL',$5,$5) ON CONFLICT DO NOTHING RETURNING id`,
        [f.id, f.citaId, f.pacienteId, f.estado === 'ANULADA' ? 100 : f.monto, f.creada],
      );
      // Segundo paso: el ledger (trigger) registra PROVISIONAL -> estado final.
      if (r.rowCount && f.estado !== 'PROVISIONAL') await c.query('UPDATE facturas SET estado = $2, monto = $3 WHERE id = $1', [f.id, f.estado, f.monto]);
    }
  });

  await lote(T.citas, D.citas, (c) => put(itemCita(c)));
  await lote(T.citas, D.citas, (c) => put(itemHorarioCita(c)));
  await lote(T.citas, D.horarios, (h) => put({ pk: `HORARIO#${h.medicoId}`, sk: h.fechaHora, medicoId: h.medicoId, fechaHora: h.fechaHora, estado: 'LIBRE', expiresAt: h.expiresAt }));
  // Proyecciones de la agenda de MS3 (en produccion las alimentan los eventos medico.* y paciente.* de MS2).
  await lote(T.citas, MEDICOS, (m) => {
    const esp = ESPECIALIDADES.find((e) => e.codigo === m.esp);
    return put({ pk: `MEDICO#${m.id}`, sk: 'PERFIL', medicoId: m.id, nombre: m.nombre, especialidad: m.esp, especialidadNombre: esp.nombre, activo: true, usuarioKeycloak: m.usuario, ocurridoEn: 0, gsi4pk: 'MEDICO', gsi4sk: 0 });
  });
  await lote(T.citas, PACIENTES, (p) => put({ pk: `PACIENTE#${p.id}`, sk: 'PERFIL', pacienteId: p.id, nombre: p.nombre, numeroHistoria: NUMERO_HC.get(p.id) ?? '', ocurridoEn: 0 }));

  await lote(T.notificaciones, D.contactos, (c) => put({ pk: `PACIENTE#${c.pacienteId}`, sk: 'CONTACTO', ...c }));
  await lote(T.notificaciones, D.notificaciones, (n) => {
    const t = Date.parse(n.enviada);
    return put({
      pk: `CITA#${n.citaId}`, sk: 'NOTIF#CITA_CONFIRMADA', id: uid('c2', Number.parseInt(n.citaId.slice(-12), 16)), citaId: n.citaId, pacienteId: n.pacienteId, tipo: 'CITA_CONFIRMADA',
      estado: 'ENVIADA', canalesEnviados: ['EMAIL'], intentos: 1, fechaHora: n.fechaHora, motivo: n.motivo, creadaEn: n.enviada, actualizadaEn: new Date(t + 5000).toISOString(), version: 1,
    });
  });
  await ddb.send(new PutCommand({
    TableName: T.notificaciones,
    Item: { pk: `CITA#${D.futura.id}`, sk: 'RECORDATORIO', citaId: D.futura.id, pacienteId: D.futura.pacienteId, fechaHora: D.futura.fechaHora, marcado: false, gsi2pk: 'RECORDATORIO#PENDIENTE', gsi2sk: Date.parse(D.futura.fechaHora) },
  }));

  const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 5000 });
  try {
    await mongo.connect();
    const db = mongo.db();
    await aplicarMongo(db);
    for (const i of D.imagenes) {
      const doc = {
        _id: i.id, pacienteId: i.pacienteId, estudio: 'torax-pa', estado: 'ANALIZADA', hashSha256: i.hash, mime: 'image/png', bytes: 20480, bucket: env('S3_BUCKET_RADIOGRAFIAS', 'radiografias'), objectKey: `seed/${i.id}.png`,
        usuarioId: 'seed', resultado: { probabilidad_neumonia: i.probabilidad, clase: i.clase, version_modelo: 'seed', modelo: 'stub-no-clinico', aviso: 'Dato de ejemplo de la semilla: no es un diagnostico.' },
        intentosAnalisis: 1, creadaEn: i.creadaEn, actualizadaEn: i.creadaEn + 5000,
      };
      await db.collection('imagenes').replaceOne({ _id: i.id }, doc, { upsert: true });
    }
  } finally {
    await mongo.close();
  }
  console.log(`Semilla aplicada: ${PACIENTES.length} pacientes, ${MEDICOS.length} medicos, ${ESPECIALIDADES.length} especialidades, ${D.citas.length} citas (${D.citas.filter((c) => c.asistencia === 'NO_ASISTIO').length} inasistencias), ` +
    `${D.horarios.length} horarios libres, ${D.facturas.length} facturas, ${D.consultas.length} consultas, ${D.imagenes.length} imagenes.`);
}

// ---------------------------------------------------------------- limpieza
async function limpiar() {
  await conBase('ms6_facturacion', async (c) => {
    await c.query('DELETE FROM factura_movimientos WHERE factura_id = ANY($1)', [ids(D.facturas)]);
    await c.query('DELETE FROM facturas WHERE id = ANY($1)', [ids(D.facturas)]);
    await c.query('DELETE FROM tarifas WHERE id = ANY($1)', [ids(D.tarifas)]);
  });
  await conBase('ms4_historias', async (c) => {
    const h = ids(D.historias);
    await c.query('DELETE FROM evoluciones WHERE consulta_id IN (SELECT id FROM consultas WHERE historia_id = ANY($1))', [h]);
    await c.query('DELETE FROM antecedentes WHERE historia_id = ANY($1)', [h]);
    await c.query('DELETE FROM consultas WHERE historia_id = ANY($1)', [h]);
    await c.query('DELETE FROM consentimientos WHERE id = ANY($1)', [ids(D.consentimientos)]);
    await c.query('DELETE FROM auditoria_accesos WHERE paciente_id = ANY($1)', [PACIENTES.map((p) => p.id)]);
    await c.query('DELETE FROM historias_clinicas WHERE id = ANY($1)', [h]);
  });
  await conBase('ms2_pacientes', async (c) => {
    await c.query('DELETE FROM medicos WHERE id = ANY($1)', [MEDICOS.map((m) => m.id)]);
    await c.query('DELETE FROM especialidades WHERE id = ANY($1)', [ESPECIALIDADES.map((e) => e.id)]);
    await c.query('DELETE FROM pacientes WHERE id = ANY($1)', [PACIENTES.map((p) => p.id)]);
  });

  await lote(T.citas, D.citas, (c) => del({ pk: `CITA#${c.id}`, sk: 'CITA' }));
  await lote(T.citas, MEDICOS, (m) => del({ pk: `MEDICO#${m.id}`, sk: 'PERFIL' }));
  await lote(T.citas, PACIENTES, (p) => del({ pk: `PACIENTE#${p.id}`, sk: 'PERFIL' }));
  // Horarios de los medicos sembrados: se consultan por clave (Query), no con Scan.
  for (const m of MEDICOS) {
    let start;
    do {
      const r = await ddb.send(new QueryCommand({ TableName: T.citas, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': `HORARIO#${m.id}` }, ProjectionExpression: 'pk, sk', ExclusiveStartKey: start }));
      await lote(T.citas, r.Items ?? [], (i) => del({ pk: i.pk, sk: i.sk }));
      start = r.LastEvaluatedKey;
    } while (start);
  }
  await lote(T.notificaciones, D.contactos, (c) => del({ pk: `PACIENTE#${c.pacienteId}`, sk: 'CONTACTO' }));
  await lote(T.notificaciones, D.notificaciones, (n) => del({ pk: `CITA#${n.citaId}`, sk: 'NOTIF#CITA_CONFIRMADA' }));
  await ddb.send(new DeleteCommand({ TableName: T.notificaciones, Key: { pk: `CITA#${D.futura.id}`, sk: 'RECORDATORIO' } }));

  const mongo = new MongoClient(mongoUrl, { serverSelectionTimeoutMS: 5000 });
  try {
    await mongo.connect();
    await mongo.db().collection('imagenes').deleteMany({ _id: { $in: ids(D.imagenes) } });
  } finally {
    await mongo.close();
  }
  console.log('Semilla eliminada (solo los ids sembrados).');
}

await (reset ? limpiar() : sembrar());
