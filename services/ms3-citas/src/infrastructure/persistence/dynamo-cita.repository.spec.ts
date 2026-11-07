import { randomUUID } from 'node:crypto';
import { CreateTableCommand, DeleteTableCommand, DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { createEnvelope } from '@sigec/messaging-nest';
import { CursorInvalidoError } from '../../application/saga/cita-repository.js';
import {
  ConcurrentUpdateError,
  HorarioNoDisponibleError,
  HorarioPerdidoError,
  type CitaAggregate,
  type OutboxMessage,
} from '../../domain/cita.js';
import { aplicar, iniciar } from '../../application/saga/saga-machine.js';
import { DEFAULT_POLICY } from '../../application/saga/saga-policy.js';
import { DynamoCitaRepository } from './dynamo-cita.repository.js';

// Integracion contra DynamoDB Local (docker compose up -d). Se omite si no responde.
const endpoint = process.env.DYNAMODB_ENDPOINT ?? 'http://localhost:8000';
const raw = new DynamoDBClient({ endpoint, region: 'sa-east-1', credentials: { accessKeyId: 'local', secretAccessKey: 'local' } });
const doc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
const suffix = randomUUID().slice(0, 8);
const tables = { citas: `test_citas_${suffix}`, outbox: `test_outbox_${suffix}` };

const available = await (async () => {
  try {
    await raw.send(
      new CreateTableCommand({
        TableName: tables.citas,
        AttributeDefinitions: [
          { AttributeName: 'pk', AttributeType: 'S' },
          { AttributeName: 'sk', AttributeType: 'S' },
          ...['gsi1', 'gsi2', 'gsi3', 'gsi4'].flatMap((n) => [
            { AttributeName: `${n}pk`, AttributeType: 'S' as const },
            { AttributeName: `${n}sk`, AttributeType: 'N' as const },
          ]),
        ],
        KeySchema: [
          { AttributeName: 'pk', KeyType: 'HASH' },
          { AttributeName: 'sk', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: ['gsi1', 'gsi2', 'gsi3', 'gsi4'].map((n) => ({
          IndexName: n,
          KeySchema: [
            { AttributeName: `${n}pk`, KeyType: 'HASH' as const },
            { AttributeName: `${n}sk`, KeyType: 'RANGE' as const },
          ],
          Projection: { ProjectionType: 'ALL' as const },
        })),
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    await raw.send(
      new CreateTableCommand({
        TableName: tables.outbox,
        AttributeDefinitions: [{ AttributeName: 'pk', AttributeType: 'S' }],
        KeySchema: [{ AttributeName: 'pk', KeyType: 'HASH' }],
        BillingMode: 'PAY_PER_REQUEST',
      }),
    );
    return true;
  } catch {
    return false;
  }
})();

const T0 = Date.UTC(2026, 11, 1, 8, 0, 0);
const policy = { ...DEFAULT_POLICY, jitterRatio: 0 };
const medico = () => randomUUID();
const fecha = (h = 2) => new Date(T0 + h * 3600_000).toISOString();
const input = (medicoId: string, fechaHora = fecha()) => ({ pacienteId: randomUUID(), medicoId, especialidad: 'general', fechaHora });
const deps = (now: number) => ({ now, policy, random: () => 0, newId: () => randomUUID() });
/** Mensajes validos segun el contrato (el outbox valida con Ajv). */
const PAYLOADS: Record<string, (a: CitaAggregate) => Record<string, unknown>> = {
  'facturacion.cobro-provisional.solicitar': (a) => ({ citaId: a.citaId, pacienteId: a.input.pacienteId, medicoId: a.input.medicoId, especialidad: a.input.especialidad, fechaHora: a.input.fechaHora }),
};
const msgs = (agg: CitaAggregate, types: string[]): OutboxMessage[] =>
  types.map((type) => ({ id: randomUUID(), exchange: 'sigec.saga', type, correlationId: agg.saga.sagaId, causationId: null, payload: PAYLOADS[type]?.(agg) ?? { citaId: agg.citaId, motivo: 'x' } }));

describe.skipIf(!available)('DynamoCitaRepository (DynamoDB Local)', () => {
  let now = T0;
  const repo = new DynamoCitaRepository(doc, tables, () => now);
  beforeEach(() => {
    now = T0;
  });
  const outboxCount = async () => (await doc.send(new ScanCommand({ TableName: tables.outbox }))).Count ?? 0;

  async function crear(medicoId = medico(), fechaHora = fecha()) {
    const t = iniciar(input(medicoId, fechaHora), deps(now));
    await repo.aplicar({ aggregate: t.aggregate, expectedVersion: null, horarioOps: t.horarioOps, messages: msgs(t.aggregate, t.commands.map((c) => c.type)) });
    return t.aggregate;
  }

  it('crea la cita, reserva el horario y escribe el outbox en una sola transaccion', async () => {
    const before = await outboxCount();
    const a = await crear();
    const cargada = (await repo.cargar(a.citaId))!;
    expect(cargada).toMatchObject({ citaId: a.citaId, estado: 'RESERVADA', version: 0 });
    expect(cargada.saga.sagaId).toBe(a.saga.sagaId);
    expect(await outboxCount()).toBe(before + 1);
  });

  it('impide la doble reserva del mismo horario y no deja nada a medias (ni cita ni outbox)', async () => {
    const m = medico();
    await crear(m);
    const before = await outboxCount();
    const t = iniciar(input(m), deps(now));
    await expect(
      repo.aplicar({ aggregate: t.aggregate, expectedVersion: null, horarioOps: t.horarioOps, messages: msgs(t.aggregate, ['facturacion.cobro-provisional.solicitar']) }),
    ).rejects.toBeInstanceOf(HorarioNoDisponibleError);
    expect(await repo.cargar(t.aggregate.citaId)).toBeNull();
    expect(await outboxCount()).toBe(before);
  });

  it('de 8 reservas simultaneas del mismo horario solo una gana', async () => {
    const m = medico();
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => crear(m)));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected' && r.reason instanceof HorarioNoDisponibleError)).toHaveLength(7);
  });

  it('una reserva vencida se puede volver a reservar sin esperar al TTL de DynamoDB', async () => {
    const m = medico();
    await crear(m);
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 1;
    await expect(crear(m)).resolves.toBeDefined();
  });

  it('CONFIRMAR deja el horario CONFIRMADO; si la reserva ya no es nuestra lanza HorarioPerdidoError', async () => {
    const m = medico();
    const a = await crear(m);
    const reg = aplicar(a, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 5 }, deps(now))!;
    await repo.aplicar({ aggregate: reg.aggregate, expectedVersion: 0, horarioOps: reg.horarioOps, messages: [] });
    expect((await repo.cargar(a.citaId))!.version).toBe(1);

    // otra cita toma el horario cuando la primera ya expiro... pero la primera esta CONFIRMADA: no se puede
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 1;
    await expect(crear(m)).rejects.toBeInstanceOf(HorarioNoDisponibleError);

    // caso de reserva perdida: B reserva otro horario, expira, C lo toma, y B intenta confirmar
    now = T0;
    const m2 = medico();
    const b = await crear(m2);
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 10;
    await crear(m2); // C
    const regB = aplicar(b, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 5 }, deps(now))!;
    await expect(repo.aplicar({ aggregate: regB.aggregate, expectedVersion: 0, horarioOps: regB.horarioOps, messages: [] })).rejects.toBeInstanceOf(HorarioPerdidoError);
  });

  it('LIBERAR libera el horario propio y se ignora si ya es de otra cita', async () => {
    const m = medico();
    const a = await crear(m);
    const rech = aplicar(a, { type: 'COBRO_RECHAZADO', motivo: 'x' }, deps(now))!;
    await repo.aplicar({ aggregate: rech.aggregate, expectedVersion: 0, horarioOps: rech.horarioOps, messages: [] });
    await expect(crear(m)).resolves.toBeDefined(); // volvio a estar libre

    // liberar un horario que ya no es nuestro no falla ni toca el de la otra cita
    const m2 = medico();
    const b = await crear(m2);
    now = T0 + DEFAULT_POLICY.reservaTtlMs + 10;
    await crear(m2); // C ocupa el horario de B
    const rechB = aplicar(b, { type: 'COBRO_RECHAZADO', motivo: 'x' }, deps(now))!;
    await expect(repo.aplicar({ aggregate: rechB.aggregate, expectedVersion: 0, horarioOps: rechB.horarioOps, messages: [] })).resolves.toBeUndefined();
    expect((await repo.cargar(b.citaId))!.estado).toBe('CANCELADA');
    await expect(crear(m2)).rejects.toBeInstanceOf(HorarioNoDisponibleError); // el de C sigue ocupado
  });

  it('el control de version optimista rechaza una escritura obsoleta', async () => {
    const a = await crear();
    const t = aplicar(a, { type: 'COBRO_RECHAZADO', motivo: 'x' }, deps(now))!;
    await repo.aplicar({ aggregate: t.aggregate, expectedVersion: 0, horarioOps: [], messages: [] });
    await expect(repo.aplicar({ aggregate: t.aggregate, expectedVersion: 0, horarioOps: [], messages: [] })).rejects.toBeInstanceOf(ConcurrentUpdateError);
  });

  it('el indice disperso devuelve SAGAs vencidas y notificaciones pendientes', async () => {
    const a = await crear();
    expect(await repo.sagasVencidas(T0 + DEFAULT_POLICY.stepTimeoutMs - 1000)).not.toContain(a.citaId);
    expect(await repo.sagasVencidas(T0 + DEFAULT_POLICY.stepTimeoutMs)).toContain(a.citaId);

    const conCobro = aplicar(a, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 5 }, deps(now))!;
    await repo.aplicar({ aggregate: conCobro.aggregate, expectedVersion: 0, horarioOps: conCobro.horarioOps, messages: [] });
    const fallida = aplicar(conCobro.aggregate, { type: 'NOTIFICACION_FALLIDA', motivo: 'x' }, deps(now))!;
    await repo.aplicar({ aggregate: fallida.aggregate, expectedVersion: 1, horarioOps: [], messages: [] });

    expect(await repo.sagasVencidas(T0 + 10 * 3600_000)).not.toContain(a.citaId); // ya no es una SAGA activa
    expect(await repo.notificacionesPendientes(T0 + DEFAULT_POLICY.notificacionReintentoMs)).toContain(a.citaId);
    expect(await repo.notificacionesPendientes(T0)).not.toContain(a.citaId);
  });

  it('el envelope del outbox cumple el sobre comun', async () => {
    const a = await crear();
    const items = (await doc.send(new QueryCommand({ TableName: tables.outbox, KeyConditionExpression: 'pk = :p', ExpressionAttributeValues: { ':p': (await doc.send(new ScanCommand({ TableName: tables.outbox, Limit: 1 }))).Items![0].pk } }))).Items!;
    const env = JSON.parse(items[0].envelope);
    expect(createEnvelope({ type: 'a.b', correlationId: randomUUID(), payload: {} })).toBeDefined();
    expect(env).toMatchObject({ version: 1, causationId: null });
    expect(a).toBeDefined();
  });

  describe('buscar (por indice, con cursor)', () => {
    const crearPara = async (pacienteId: string, medicoId: string, h: number) => {
      const t = iniciar({ pacienteId, medicoId, especialidad: 'general', fechaHora: fecha(h) }, deps(now));
      await repo.aplicar({ aggregate: t.aggregate, expectedVersion: null, horarioOps: t.horarioOps, messages: [] });
      now += 1; // createdAt distinto para ordenar
      return t.aggregate.citaId;
    };

    it('por paciente devuelve solo las suyas, mas recientes primero, y pagina con cursor sin repetir', async () => {
      const paciente = randomUUID();
      const otro = randomUUID();
      const ids = [];
      for (let i = 0; i < 5; i++) ids.push(await crearPara(paciente, medico(), 10 + i));
      await crearPara(otro, medico(), 30);

      const p1 = await repo.buscar({ pacienteId: paciente }, 2);
      expect(p1.items.map((c) => c.citaId)).toEqual([ids[4], ids[3]]);
      expect(p1.siguiente).not.toBeNull();
      const p2 = await repo.buscar({ pacienteId: paciente }, 2, p1.siguiente!);
      expect(p2.items.map((c) => c.citaId)).toEqual([ids[2], ids[1]]);
      const p3 = await repo.buscar({ pacienteId: paciente }, 2, p2.siguiente!);
      expect(p3.items.map((c) => c.citaId)).toEqual([ids[0]]);
      expect(p3.siguiente).toBeNull();
      expect(p1.items.every((c) => c.input.pacienteId === paciente)).toBe(true);
    });

    it('por medico devuelve la agenda en orden de fecha y respeta el rango', async () => {
      const m = medico();
      const a = await crearPara(randomUUID(), m, 50);
      const b = await crearPara(randomUUID(), m, 52);
      const c = await crearPara(randomUUID(), m, 54);
      const todas = await repo.buscar({ medicoId: m }, 10);
      expect(todas.items.map((x) => x.citaId)).toEqual([a, b, c]);
      const rango = await repo.buscar({ medicoId: m, desde: Date.parse(fecha(51)), hasta: Date.parse(fecha(53)) }, 10);
      expect(rango.items.map((x) => x.citaId)).toEqual([b]);
    });

    it('sin filtro usa el indice general', async () => {
      const id = await crearPara(randomUUID(), medico(), 60);
      const pagina = await repo.buscar({}, 100);
      expect(pagina.items.map((c) => c.citaId)).toContain(id);
    });

    it('un cursor manipulado hacia otra particion se rechaza (no se leen citas ajenas)', async () => {
      const ana = randomUUID();
      const luis = randomUUID();
      for (let i = 0; i < 3; i++) await crearPara(ana, medico(), 70 + i);
      await crearPara(luis, medico(), 80);
      const pagina = await repo.buscar({ pacienteId: ana }, 1);
      const key = JSON.parse(Buffer.from(pagina.siguiente!, 'base64url').toString());
      const manipulado = Buffer.from(JSON.stringify({ ...key, gsi2pk: `PACIENTE#${luis}` })).toString('base64url');
      await expect(repo.buscar({ pacienteId: ana }, 1, manipulado)).rejects.toBeInstanceOf(CursorInvalidoError);
      await expect(repo.buscar({ pacienteId: ana }, 1, 'basura')).rejects.toBeInstanceOf(CursorInvalidoError);
    });
  });

  describe('disponibilidad de horarios (Query por clave, con cursor)', () => {
    const slot = (m: string, h: number, extra: Record<string, unknown> = {}) =>
      doc.send(new PutCommand({ TableName: tables.citas, Item: { pk: `HORARIO#${m}`, sk: fecha(h), medicoId: m, fechaHora: fecha(h), estado: 'LIBRE', ...extra } }));

    it('devuelve los horarios del medico en orden cronologico, paginados, sin mezclar otros medicos', async () => {
      const m = medico();
      const otro = medico();
      for (const h of [104, 101, 103, 102, 100]) await slot(m, h);
      await slot(otro, 101);
      const rango = { medicoId: m, desde: fecha(100), hasta: fecha(110) };
      const p1 = await repo.disponibilidad(rango, 2);
      expect(p1.items.map((x) => x.fechaHora)).toEqual([fecha(100), fecha(101)]);
      expect(p1.siguiente).not.toBeNull();
      const p2 = await repo.disponibilidad(rango, 2, p1.siguiente!);
      expect(p2.items.map((x) => x.fechaHora)).toEqual([fecha(102), fecha(103)]);
      const p3 = await repo.disponibilidad(rango, 2, p2.siguiente!);
      expect(p3.items.map((x) => x.fechaHora)).toEqual([fecha(104)]);
      expect(p3.siguiente).toBeNull();
    });

    it('respeta el rango (limites inclusivos)', async () => {
      const m = medico();
      for (const h of [120, 121, 122, 123]) await slot(m, h);
      const r = await repo.disponibilidad({ medicoId: m, desde: fecha(121), hasta: fecha(122) }, 10);
      expect(r.items.map((x) => x.fechaHora)).toEqual([fecha(121), fecha(122)]);
    });

    it('una reserva vencida se muestra LIBRE y una vigente RESERVADO (sin depender del TTL)', async () => {
      const m = medico();
      await slot(m, 130, { estado: 'RESERVADO', citaId: randomUUID(), reservaExpiraEn: now - 1 });
      await slot(m, 131, { estado: 'RESERVADO', citaId: randomUUID(), reservaExpiraEn: now + 60_000 });
      await slot(m, 132, { estado: 'CONFIRMADO', citaId: randomUUID() });
      const r = await repo.disponibilidad({ medicoId: m, desde: fecha(130), hasta: fecha(132) }, 10);
      expect(r.items.map((x) => x.estado)).toEqual(['LIBRE', 'RESERVADO', 'CONFIRMADO']);
      expect(r.items[0]).not.toHaveProperty('citaId');
    });

    it('soloLibres llena la pagina aunque haya muchos ocupados entre medias y no se salta ninguno', async () => {
      const m = medico();
      // 1 libre, 6 confirmados, 1 libre, 1 reserva vencida, 1 libre
      await slot(m, 140);
      for (const h of [141, 142, 143, 144, 145, 146]) await slot(m, h, { estado: 'CONFIRMADO', citaId: randomUUID() });
      await slot(m, 147);
      await slot(m, 148, { estado: 'RESERVADO', citaId: randomUUID(), reservaExpiraEn: now - 1 });
      await slot(m, 149);
      const rango = { medicoId: m, desde: fecha(140), hasta: fecha(150), soloLibres: true };
      const p1 = await repo.disponibilidad(rango, 2);
      expect(p1.items.map((x) => x.fechaHora)).toEqual([fecha(140), fecha(147)]);
      const p2 = await repo.disponibilidad(rango, 2, p1.siguiente!);
      expect(p2.items.map((x) => x.fechaHora)).toEqual([fecha(148), fecha(149)]);
      if (p2.siguiente) expect((await repo.disponibilidad(rango, 2, p2.siguiente)).items).toEqual([]);
    });

    it('un cursor de otro medico o manipulado se rechaza', async () => {
      const ana = medico();
      const luis = medico();
      for (const h of [160, 161, 162]) await slot(ana, h);
      const p = await repo.disponibilidad({ medicoId: ana, desde: fecha(160), hasta: fecha(170) }, 1);
      await expect(repo.disponibilidad({ medicoId: luis, desde: fecha(160), hasta: fecha(170) }, 1, p.siguiente!)).rejects.toBeInstanceOf(CursorInvalidoError);
      await expect(repo.disponibilidad({ medicoId: ana, desde: fecha(160), hasta: fecha(170) }, 1, 'basura')).rejects.toBeInstanceOf(CursorInvalidoError);
    });
  });
});

// --- Ciclo de vida de la cita confirmada y horarios estrictos ---------------------------------
describe.skipIf(!available)('DynamoCitaRepository: cancelar, reprogramar, bloqueos y modo estricto', () => {
  let now = T0;
  const repo = new DynamoCitaRepository(doc, tables, () => now, false);
  const estricto = new DynamoCitaRepository(doc, tables, () => now, true);
  beforeEach(() => {
    now = T0;
  });

  type Efectos = { aggregate: CitaAggregate; horarioOps: Parameters<DynamoCitaRepository['aplicar']>[0]['horarioOps']; commands: { type: string; exchange?: string; payload: Record<string, unknown> }[] };
  /** Persiste una transicion tal cual la produce la maquina (mensajes con sus payloads reales, validados por Ajv). */
  async function persistir(r: DynamoCitaRepository, prev: CitaAggregate | null, t: Efectos) {
    await r.aplicar({
      aggregate: t.aggregate,
      expectedVersion: prev ? prev.version : null,
      horarioOps: t.horarioOps,
      messages: t.commands.map((c) => ({ id: randomUUID(), exchange: c.exchange ?? 'sigec.saga', type: c.type, correlationId: t.aggregate.saga.sagaId, causationId: null, payload: c.payload })),
    });
    return (await r.cargar(t.aggregate.citaId))!;
  }

  async function confirmada(r = repo, m = medico(), fechaHora = fecha(48)) {
    const ini = iniciar(input(m, fechaHora), deps(now));
    let agg = await persistir(r, null, ini);
    agg = await persistir(r, agg, aplicar(agg, { type: 'COBRO_REGISTRADO', facturaId: randomUUID(), monto: 180 }, deps(now))!);
    agg = await persistir(r, agg, aplicar(agg, { type: 'NOTIFICACION_ENVIADA' }, deps(now))!);
    expect(agg.estado).toBe('CONFIRMADA');
    return agg;
  }

  const horario = async (m: string, f: string) => (await repo.disponibilidad({ medicoId: m, desde: f, hasta: f }, 10)).items[0];

  it('cancelar libera el horario y publica el cobro a anular, el aviso y cita.cancelada en el mismo cambio', async () => {
    const { cancelar } = await import('../../application/saga/ciclo-vida.js');
    const a = await confirmada();
    expect((await horario(a.input.medicoId, a.input.fechaHora)).estado).toBe('CONFIRMADO');
    const antes = await outboxCount();
    const c = await persistir(repo, a, cancelar(a, 'Pedido del paciente', 'recepcion', deps(now)));
    expect(c).toMatchObject({ estado: 'CANCELADA_USUARIO', version: a.version + 1 });
    expect(c.cancelacion?.motivo).toBe('Pedido del paciente');
    expect((await horario(a.input.medicoId, a.input.fechaHora)).estado).toBe('LIBRE');
    expect(await outboxCount()).toBe(antes + 3);
    // el horario liberado se puede volver a reservar
    await expect(crear(a.input.medicoId, a.input.fechaHora)).resolves.toBeDefined();
  });

  it('reprogramar mueve la cita: el horario nuevo queda CONFIRMADO y el viejo LIBRE, con la misma cita y el mismo cargo', async () => {
    const { reprogramar } = await import('../../application/saga/ciclo-vida.js');
    const a = await confirmada();
    const nueva = fecha(72);
    const r = await persistir(repo, a, reprogramar(a, nueva, 'recepcion', deps(now)));
    expect(r).toMatchObject({ citaId: a.citaId, facturaId: a.facturaId, estado: 'CONFIRMADA' });
    expect(r.input.fechaHora).toBe(nueva);
    expect((await horario(a.input.medicoId, nueva)).estado).toBe('CONFIRMADO');
    expect((await horario(a.input.medicoId, a.input.fechaHora)).estado).toBe('LIBRE');
    // la agenda del medico (indice por fecha) ya refleja la nueva fecha
    const agenda = await repo.buscar({ medicoId: a.input.medicoId, desde: Date.parse(nueva) - 1, hasta: Date.parse(nueva) + 1 }, 10);
    expect(agenda.items.map((x) => x.citaId)).toEqual([a.citaId]);
  });

  it('reprogramar a un horario ocupado falla con HorarioNoDisponibleError y NO cambia nada', async () => {
    const { reprogramar } = await import('../../application/saga/ciclo-vida.js');
    const m = medico();
    const a = await confirmada(repo, m, fecha(48));
    const otra = await confirmada(repo, m, fecha(72));
    const antes = await outboxCount();
    await expect(persistir(repo, a, reprogramar(a, otra.input.fechaHora, 'u', deps(now)))).rejects.toBeInstanceOf(HorarioNoDisponibleError);
    expect((await repo.cargar(a.citaId))!.input.fechaHora).toBe(a.input.fechaHora);
    expect((await horario(m, a.input.fechaHora)).estado).toBe('CONFIRMADO');
    expect(await outboxCount()).toBe(antes);
  });

  it('dos reprogramaciones simultaneas de citas distintas al mismo horario: solo una gana', async () => {
    const { reprogramar } = await import('../../application/saga/ciclo-vida.js');
    const m = medico();
    const a = await confirmada(repo, m, fecha(48));
    const b = await confirmada(repo, m, fecha(49));
    const destino = fecha(96);
    const res = await Promise.allSettled([persistir(repo, a, reprogramar(a, destino, 'u', deps(now))), persistir(repo, b, reprogramar(b, destino, 'u', deps(now)))]);
    expect(res.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(res.filter((r) => r.status === 'rejected' && r.reason instanceof HorarioNoDisponibleError)).toHaveLength(1);
  });

  it('un horario BLOQUEADO no se puede reservar ni tomar, ni en modo estricto ni en el abierto', async () => {
    const m = medico();
    const f = fecha(30);
    await doc.send(new PutCommand({ TableName: tables.citas, Item: { pk: `HORARIO#${m}`, sk: f, medicoId: m, fechaHora: f, estado: 'BLOQUEADO', motivo: 'Congreso' } }));
    for (const r of [repo, estricto]) {
      const t = iniciar(input(m, f), deps(now));
      await expect(persistir(r, null, t)).rejects.toBeInstanceOf(HorarioNoDisponibleError);
    }
    const lista = await repo.disponibilidad({ medicoId: m, desde: f, hasta: f }, 10);
    expect(lista.items[0].estado).toBe('BLOQUEADO');
    expect((await repo.disponibilidad({ medicoId: m, desde: f, hasta: f, soloLibres: true }, 10)).items).toHaveLength(0);
  });

  it('modo estricto: solo se reservan horarios publicados (LIBRE); el abierto sigue aceptando fechas sin item', async () => {
    const m = medico();
    const f = fecha(31);
    await expect(persistir(estricto, null, iniciar(input(m, f), deps(now)))).rejects.toBeInstanceOf(HorarioNoDisponibleError);
    await doc.send(new PutCommand({ TableName: tables.citas, Item: { pk: `HORARIO#${m}`, sk: f, medicoId: m, fechaHora: f, estado: 'LIBRE' } }));
    await expect(persistir(estricto, null, iniciar(input(m, f), deps(now)))).resolves.toBeDefined();
    await expect(persistir(repo, null, iniciar(input(medico(), f), deps(now)))).resolves.toBeDefined();
  });

  it('buscar por estado llena la pagina aunque el filtro descarte items (cursor consistente)', async () => {
    const m = medico();
    // 3 canceladas intercaladas con 3 confirmadas, todas del mismo medico (indice por fecha)
    const { cancelar } = await import('../../application/saga/ciclo-vida.js');
    const confirmadas: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = await confirmada(repo, m, fecha(100 + i));
      if (i % 2 === 0) await persistir(repo, a, cancelar(a, 'x', 'u', deps(now)));
      else confirmadas.push(a.citaId);
    }
    const vistos: string[] = [];
    let cursor: string | undefined;
    let paginas = 0;
    do {
      const p = await repo.buscar({ medicoId: m, estado: 'CONFIRMADA', desde: 0, hasta: Number.MAX_SAFE_INTEGER }, 2, cursor);
      vistos.push(...p.items.map((x) => x.citaId));
      cursor = p.siguiente ?? undefined;
      paginas++;
    } while (cursor && paginas < 10);
    expect(vistos.sort()).toEqual([...confirmadas].sort());
  });

  async function crear(medicoId: string, fechaHora: string) {
    const t = iniciar(input(medicoId, fechaHora), deps(now));
    return persistir(repo, null, t);
  }
  const outboxCount = async () => (await doc.send(new ScanCommand({ TableName: tables.outbox }))).Count ?? 0;
});

// Las tablas de prueba se borran una sola vez, al terminar todos los bloques de este archivo.
afterAll(async () => {
  await raw.send(new DeleteTableCommand({ TableName: tables.citas })).catch(() => undefined);
  await raw.send(new DeleteTableCommand({ TableName: tables.outbox })).catch(() => undefined);
});
