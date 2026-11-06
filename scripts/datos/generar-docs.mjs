#!/usr/bin/env node
// Genera docs/datos/diccionario-generado.md y docs/datos/erd-generado.md DESDE LAS BASES REALES (PostgreSQL, DynamoDB, MongoDB).
// Uso: make datos-docs. La columna "sensible" sale de COMMENT ON COLUMN ... 'SENSIBLE: ...' (migraciones) y de SENSIBLES_EXTRA.
import { writeFile } from 'node:fs/promises';
import { DescribeTableCommand, DescribeTimeToLiveCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import pg from 'pg';
import { COLECCIONES } from '../mongo-init/esquema.mjs';

try { process.loadEnvFile(new URL('../../.env', import.meta.url)); } catch { /* sin .env */ }
const env = (k, d) => process.env[k] ?? d;

const BASES = [
  ['ms2_pacientes', 'MS2 Pacientes (catalogo clinico)'],
  ['ms4_historias', 'MS4 Historias clinicas'],
  ['ms6_facturacion', 'MS6 Facturacion'],
  ['ms7_inteligencia', 'MS7 Inteligencia'],
];
const IGNORAR = /^(flyway_schema_history|schema_migrations|migrations|users|cache|cache_locks|jobs|job_batches|failed_jobs|password_reset_tokens|sessions)$/;
// Sensibles que no se pueden anotar con COMMENT porque la migracion que crea la columna ya esta aplicada (inmutable).
const SENSIBLES_EXTRA = {
  'ms2_pacientes.outbox.payload': 'personal: el evento paciente.creado lleva nombre, documento y email (contrato)',
  'ms4_historias.outbox.payload': 'potencialmente clinico: no publicar datos clinicos en eventos',
  'ms6_facturacion.idempotency_keys.response': 'personal: respuesta cacheada 24 h',
  'ms2_pacientes.idempotency_keys.response_body': 'personal: respuesta cacheada 24 h',
  'ms4_historias.idempotency_keys.response_body': 'personal: respuesta cacheada 24 h',
};

const cliente = async (database) => {
  const c = new pg.Client({ host: env('POSTGRES_HOST', 'localhost'), port: Number(env('POSTGRES_PORT', env('POSTGRES_HOST_PORT', '5432'))), user: env('POSTGRES_USER', 'sigec'), password: env('POSTGRES_PASSWORD', ''), database });
  await c.connect();
  return c;
};
const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');

async function leerEsquema(db) {
  const c = await cliente(db);
  const cols = (await c.query(`
    SELECT c.relname AS tabla, a.attnum, a.attname AS campo, format_type(a.atttypid, a.atttypmod) AS tipo, NOT a.attnotnull AS nulo,
           pg_get_expr(d.adbin, d.adrelid) AS defecto, col_description(c.oid, a.attnum) AS comentario, obj_description(c.oid, 'pg_class') AS comentario_tabla
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum
    WHERE n.nspname = 'public' AND c.relkind IN ('r','p') ORDER BY c.relname, a.attnum`)).rows;
  const cons = (await c.query(`
    SELECT c.relname AS tabla, con.conname AS nombre, con.contype AS tipo, pg_get_constraintdef(con.oid) AS def,
           (SELECT array_agg(a.attname::text ORDER BY k.ord) FROM unnest(con.conkey) WITH ORDINALITY k(attnum, ord) JOIN pg_attribute a ON a.attrelid = con.conrelid AND a.attnum = k.attnum) AS columnas,
           (SELECT relname FROM pg_class WHERE oid = con.confrelid) AS destino
    FROM pg_constraint con JOIN pg_class c ON c.oid = con.conrelid JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public'`)).rows;
  const idx = (await c.query(`SELECT tablename AS tabla, indexname AS nombre, indexdef AS def FROM pg_indexes WHERE schemaname = 'public'`)).rows;
  await c.end();
  return { cols, cons, idx };
}

let dic = `# Diccionario de datos generado

> **Generado** por \`make datos-docs\` (\`scripts/datos/generar-docs.mjs\`) desde las bases reales. No editar a mano: edita la migracion (COMMENT ON COLUMN) o el generador.
> La politica y el tratamiento de los datos sensibles estan en [diccionario.md](diccionario.md). Columna **Sensible**: \`si\` + categoria cuando la columna lleva
> \`COMMENT ... 'SENSIBLE: ...'\`; \`no\` en caso contrario.

`;
let erd = `# Diagramas entidad-relacion generados\n\n> Generado por \`make datos-docs\` desde las bases reales (claves y claves foraneas de cada base; las referencias **entre** bases estan en [README.md](README.md)).\n\n`;

for (const [db, titulo] of BASES) {
  const { cols, cons, idx } = await leerEsquema(db);
  const tablas = [...new Set(cols.map((c) => c.tabla))].filter((t) => !IGNORAR.test(t));
  dic += `## ${db} — ${titulo}\n\n`;
  erd += `## ${db}\n\n\`\`\`mermaid\nerDiagram\n`;
  const rel = [];
  for (const t of tablas) {
    const cs = cols.filter((c) => c.tabla === t);
    const tc = cons.filter((x) => x.tabla === t);
    const ti = idx.filter((x) => x.tabla === t);
    dic += `### \`${t}\`\n\n${cs[0].comentario_tabla ? `${esc(cs[0].comentario_tabla)}\n\n` : ''}| Campo | Tipo | Nulo | Clave / indice | Descripcion | Sensible |\n|---|---|---|---|---|---|\n`;
    erd += `  ${t} {\n`;
    for (const c of cs) {
      const marcas = [];
      const pk = tc.find((x) => x.tipo === 'p' && x.columnas?.includes(c.campo));
      if (pk) marcas.push('PK');
      for (const u of tc.filter((x) => x.tipo === 'u' && x.columnas?.includes(c.campo))) marcas.push(u.columnas.length > 1 ? `UQ(${u.columnas.join(',')})` : 'UQ');
      for (const f of tc.filter((x) => x.tipo === 'f' && x.columnas?.includes(c.campo))) marcas.push(`FK→${f.destino}`);
      for (const i of ti.filter((x) => !tc.some((k) => k.nombre === x.nombre))) {
        const m = i.def.match(/USING (\w+) \((.*?)\)(?: WHERE (.*))?$/);
        if (m && new RegExp(`(^|[ ,(])${c.campo}([ ,)]|$)`).test(m[2])) marcas.push(`idx ${i.nombre}${m[1] !== 'btree' ? ` (${m[1]})` : ''}${m[3] ? ' parcial' : ''}`);
      }
      const checks = tc.filter((x) => x.tipo === 'c' && x.columnas?.includes(c.campo) && x.columnas.length === 1).map((x) => `CHECK ${x.def.replace(/^CHECK /, '')}`);
      const extra = SENSIBLES_EXTRA[`${db}.${t}.${c.campo}`];
      const sens = c.comentario?.startsWith('SENSIBLE:') ? `si — ${esc(c.comentario.replace('SENSIBLE:', '').trim())}` : extra ? `si — ${esc(extra)}` : 'no';
      const desc = c.comentario && !c.comentario.startsWith('SENSIBLE:') ? c.comentario : '';
      dic += `| \`${c.campo}\` | ${esc(c.tipo)} | ${c.nulo ? 'si' : 'no'} | ${esc([...marcas, ...checks].join('; ') || '—')} | ${esc(desc)}${c.defecto ? `${desc ? ' · ' : ''}defecto \`${esc(c.defecto)}\`` : ''} | ${sens} |\n`;
      const tipoErd = c.tipo.replace(/\(.*\)/, '').replace(/[^A-Za-z0-9_]/g, '_');
      erd += `    ${tipoErd} ${c.campo}${marcas.some((m) => m === 'PK') ? ' PK' : marcas.some((m) => m.startsWith('FK')) ? ' FK' : marcas.some((m) => m.startsWith('UQ')) ? ' UK' : ''}\n`;
    }
    for (const f of tc.filter((x) => x.tipo === 'f' && !IGNORAR.test(x.destino))) rel.push(`  ${f.destino} ||--o{ ${t} : "${(f.columnas ?? []).join(',')}"`);
    dic += `\n`;
    const otros = [...ti.filter((i) => !tc.some((k) => k.nombre === i.nombre) && /\(.*,.*\)|WHERE|USING (?!btree)/.test(i.def))];
    if (otros.length) dic += `Indices compuestos / parciales / especiales:\n\n${otros.map((i) => `- \`${i.nombre}\`: \`${esc(i.def.replace(/^CREATE (UNIQUE )?INDEX \S+ ON (public\.)?/, '$1'))}\``).join('\n')}\n\n`;
    erd += `  }\n`;
  }
  erd += `${rel.join('\n')}\n\`\`\`\n\n`;
}

// --- DynamoDB: estructura real (DescribeTable) + atributos documentados ---
const ddb = new DynamoDBClient({ endpoint: env('DYNAMODB_ENDPOINT', 'http://localhost:8000'), region: env('AWS_REGION', 'sa-east-1'), credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
dic += `## DynamoDB (estructura real)\n\n| Tabla | Clave | Indices (proyeccion) | TTL | Stream | Facturacion |\n|---|---|---|---|---|---|\n`;
for (const t of ['citas', 'idempotency_keys', 'outbox', 'processed_messages', 'ms5_idempotency_keys', 'notificaciones', 'ms8_idempotency_keys', 'ms8_outbox', 'ms8_processed_messages']) {
  try {
    const d = (await ddb.send(new DescribeTableCommand({ TableName: t }))).Table;
    const ttl = (await ddb.send(new DescribeTimeToLiveCommand({ TableName: t }))).TimeToLiveDescription;
    const clave = d.KeySchema.map((k) => `${k.AttributeName} (${k.KeyType === 'HASH' ? 'pk' : 'sk'})`).join(' + ');
    const gsis = (d.GlobalSecondaryIndexes ?? []).map((g) => `${g.IndexName} [${g.KeySchema.map((k) => k.AttributeName).join('+')}] ${g.Projection.ProjectionType}`).join('; ') || '—';
    dic += `| \`${t}\` | ${clave} | ${gsis} | ${ttl?.TimeToLiveStatus === 'ENABLED' || ttl?.TimeToLiveStatus === 'ENABLING' ? ttl.AttributeName : '—'} | ${d.StreamSpecification?.StreamEnabled ? d.StreamSpecification.StreamViewType : '—'} | ${d.BillingModeSummary?.BillingMode ?? 'PAY_PER_REQUEST'} |\n`;
  } catch (e) {
    dic += `| \`${t}\` | (no disponible: ${esc(e.name)}) | | | | |\n`;
  }
}
dic += `
### Atributos de los items (documentados desde el codigo: \`dynamo-cita.repository.ts\`, \`dynamo-notificaciones.repositories.ts\`)

| Tabla / item | Atributo | Tipo | Nulo | Descripcion | Sensible |
|---|---|---|---|---|---|
| citas · CITA#id/CITA | \`citaId\` | S | no | id de la cita | no |
| | \`input.pacienteId\` | S | no | ref MS2 pacientes.id | si — personal (id) |
| | \`input.medicoId\` | S | no | ref MS2 medicos.id | no |
| | \`input.especialidad\` | S | no | codigo (MS2 especialidades.codigo) | no |
| | \`input.fechaHora\` | S | no | ISO 8601 UTC | si — personal (cuando se atiende) |
| | \`estado\` | S | no | PENDIENTE, RESERVADA, COBRO_PROVISIONAL, CONFIRMADA, CANCELADA, ANULADA | no |
| | \`facturaId\` | S | si | ref MS6 facturas.id | no |
| | \`motivoFallo\` | S | si | motivo de cancelacion; **sin datos clinicos** | no |
| | \`notificacion\` | M | no | estado, intentos, proximoIntento | no |
| | \`saga\` | M | no | sagaId, estado, paso, intentos, deadline, compensaciones, historial | no |
| | \`asistencia\` | S | si | ASISTIO / NO_ASISTIO (nuevo, opcional) | si — personal (comportamiento) |
| | \`version\`, \`createdAt\`, \`updatedAt\` | N | no | optimista; epoch ms | no |
| | \`gsi1pk/gsi1sk\` ... \`gsi4pk/gsi4sk\` | S/N | si | claves de los indices | no |
| citas · HORARIO#medico/ISO | \`estado\` | S | no | LIBRE, RESERVADO, CONFIRMADO | no |
| | \`citaId\`, \`reservaExpiraEn\` | S, N | si | dueno de la reserva; vencimiento (epoch ms) | no |
| | \`expiresAt\` | N | si | TTL (epoch s) solo en horarios libres de semilla | no |
| notificaciones · PACIENTE#id/CONTACTO | \`nombre\`, \`email\` | S | si | contacto del paciente | si — personal |
| | \`canales\`, \`telegramChatId\` | L, S | si | preferencias y vinculo de Telegram | si — personal |
| notificaciones · CITA#id/NOTIF#tipo | \`estado\`, \`canalesEnviados\`, \`intentos\`, \`proximoIntento\`, \`ultimoError\` | | | seguimiento del envio | no |
| | \`fechaHora\`, \`motivo\` | S | si | datos para la plantilla; **sin datos clinicos** | si — personal |
| notificaciones · CITA#id/RECORDATORIO | \`citaId\`, \`pacienteId\`, \`fechaHora\`, \`marcado\` | | | recordatorio pendiente | si — personal |
| notificaciones · VINCULO#codigo | \`pacienteId\`, \`expiraEn\`, \`usado\`, \`expiresAt\` | | | codigo de un solo uso (10 min) | si — secreto |
| *_idempotency_keys | \`pk\`, \`requestHash\`, \`status\`, \`response\`, \`expiresAt\` | | | clave \`<sub>:<Idempotency-Key>\` | si — la respuesta cacheada puede ser personal |
| *_processed_messages | \`pk\`, \`status\`, \`lockedUntil\`, \`expiresAt\` | | | id del mensaje | no |
| *_outbox | \`pk\`, \`exchange\`, \`routingKey\`, \`envelope\`, \`createdAt\` | | | evento a publicar | potencialmente: sin datos clinicos |

`;

// --- MongoDB ---
const SENS_MONGO = { pacienteId: 'si — personal (id)', estudio: 'si — clinico', resultado: 'si — clinico (apoyo a decision, no diagnostico)', objectKey: 'si — secreto (nunca se expone)', bucket: 'no', usuarioId: 'si — personal (id)', hashSha256: 'no' };
dic += `## MongoDB — sigec_imagenes\n\n`;
for (const c of COLECCIONES) {
  const s = c.validator.$jsonSchema;
  dic += `### \`${c.name}\`\n\nValidador \`$jsonSchema\` (strict, error). Indices: ${c.indexes.map((i) => `\`${i.name}\`${i.unique ? ' (unico)' : ''}`).join(', ')}.\n\n| Campo | Tipo BSON | Requerido | Restricciones | Sensible |\n|---|---|---|---|---|\n`;
  for (const [k, v] of Object.entries(s.properties)) {
    const r = [v.enum && `enum ${v.enum.join('/')}`, v.pattern && `patron ${v.pattern}`, v.minimum !== undefined && `>= ${v.minimum}`, v.maximum !== undefined && `<= ${v.maximum}`, v.minLength && `minLength ${v.minLength}`].filter(Boolean).join('; ');
    dic += `| \`${k}\` | ${[v.bsonType ?? 'string'].flat().join(' / ')} | ${s.required.includes(k) ? 'si' : 'no'} | ${esc(r || '—')} | ${SENS_MONGO[k] ?? 'no'} |\n`;
  }
  dic += '\n';
}

await writeFile(new URL('../../docs/datos/diccionario-generado.md', import.meta.url), dic);
await writeFile(new URL('../../docs/datos/erd-generado.md', import.meta.url), erd);
console.log('docs/datos/diccionario-generado.md y erd-generado.md regenerados');
