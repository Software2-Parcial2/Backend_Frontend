import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { buildOutboxItem, createEnvelope } from '@sigec/messaging-nest';
import { CursorInvalidoError, type CitaChange, type CitaRepository, type FiltroCitas, type FiltroDisponibilidad, type PaginaCitas, type PaginaHorarios } from '../../application/saga/cita-repository.js';
import {
  ConcurrentUpdateError,
  estadoEfectivo,
  HorarioNoDisponibleError,
  HorarioPerdidoError,
  type CitaAggregate,
  type Horario,
  type HorarioOp,
} from '../../domain/cita.js';

type TransactItem = NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']>[number];

const horarioKey = (medicoId: string, fechaHora: string) => ({ pk: `HORARIO#${medicoId}`, sk: fechaHora });

/**
 * Persistencia de citas, SAGAs y horarios en DynamoDB (tabla `citas`, pk/sk). Cada cambio es UNA TransactWriteItems:
 * agregado (cita+saga, con version optimista) + operaciones del horario (escrituras condicionales) + mensajes del outbox.
 *
 *   CITA#<id>/CITA            agregado (gsi1pk/gsi1sk: indice disperso para plazos de SAGA y notificaciones pendientes)
 *   HORARIO#<medico>/<fecha>  horario: LIBRE | RESERVADO(reservaExpiraEn) | CONFIRMADO
 */
export class DynamoCitaRepository implements CitaRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tables: { citas: string; outbox: string } = { citas: 'citas', outbox: 'outbox' },
    private readonly now: () => number = Date.now,
    /**
     * Horarios estrictos (HORARIOS_ESTRICTOS=true): solo se puede reservar un horario PUBLICADO (item LIBRE creado desde la plantilla
     * del medico). Por defecto (false) una fecha sin item cuenta como libre, que es el comportamiento historico de la SAGA y del E2E.
     */
    private readonly estricto: boolean = process.env.HORARIOS_ESTRICTOS === 'true',
  ) {}

  async cargar(citaId: string): Promise<CitaAggregate | null> {
    const res = await this.doc.send(new GetCommand({ TableName: this.tables.citas, Key: { pk: `CITA#${citaId}`, sk: 'CITA' }, ConsistentRead: true }));
    return res.Item ? toAggregate(res.Item) : null;
  }

  async aplicar(change: CitaChange): Promise<void> {
    let ops = change.horarioOps;
    for (let attempt = 0; ; attempt++) {
      try {
        await this.doc.send(new TransactWriteCommand({ TransactItems: this.items(change, ops) }));
        return;
      } catch (e) {
        if (!(e instanceof TransactionCanceledException)) throw e;
        const reasons = e.CancellationReasons ?? [];
        const failed = reasons.map((r, i) => (r.Code === 'ConditionalCheckFailed' ? i : -1)).filter((i) => i >= 0);
        if (failed.includes(0)) throw new ConcurrentUpdateError(change.aggregate.citaId);
        // Los indices 1..ops.length son las operaciones de horario, en orden.
        const failedOps = failed.map((i) => ops[i - 1]).filter(Boolean);
        const reservar = failedOps.find((o) => o.op === 'RESERVAR' || o.op === 'TOMAR');
        if (reservar) throw new HorarioNoDisponibleError(reservar.medicoId, reservar.fechaHora);
        if (failedOps.some((o) => o.op === 'CONFIRMAR')) throw new HorarioPerdidoError(change.aggregate.citaId);
        if (failedOps.length > 0 && attempt === 0) {
          // LIBERAR sobre un horario que ya no es nuestro: no hay nada que liberar; se reintenta sin esas operaciones.
          ops = ops.filter((o) => !failedOps.includes(o));
          continue;
        }
        throw e;
      }
    }
  }

  private items(change: CitaChange, ops: HorarioOp[]): TransactItem[] {
    const agg = change.aggregate;
    const version = (change.expectedVersion ?? -1) + 1;
    const next: CitaAggregate = { ...agg, version };
    const items: TransactItem[] = [
      {
        Put: {
          TableName: this.tables.citas,
          Item: { pk: `CITA#${agg.citaId}`, sk: 'CITA', ...next, ...indexKeys(next) },
          ...(change.expectedVersion === null
            ? { ConditionExpression: 'attribute_not_exists(pk)' }
            : { ConditionExpression: '#v = :expected', ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':expected': change.expectedVersion } }),
        },
      },
    ];
    const now = this.now();
    for (const op of ops) items.push(this.horarioItem(op, now));
    for (const m of change.messages) {
      items.push(
        buildOutboxItem(
          this.tables.outbox,
          createEnvelope({ id: m.id, type: m.type, correlationId: m.correlationId, causationId: m.causationId, payload: m.payload }),
          m.exchange,
        ) as TransactItem,
      );
    }
    return items;
  }

  private horarioItem(op: HorarioOp, now: number): TransactItem {
    const Key = horarioKey(op.medicoId, op.fechaHora);
    switch (op.op) {
      case 'RESERVAR':
        return {
          Put: {
            TableName: this.tables.citas,
            Item: { ...Key, medicoId: op.medicoId, fechaHora: op.fechaHora, estado: 'RESERVADO', citaId: op.citaId, reservaExpiraEn: op.expiraEn },
            ConditionExpression: this.condicionLibre(),
            ExpressionAttributeValues: { ':libre': 'LIBRE', ':reservado': 'RESERVADO', ':now': now },
          },
        };
      case 'TOMAR':
        return {
          Put: {
            TableName: this.tables.citas,
            Item: { ...Key, medicoId: op.medicoId, fechaHora: op.fechaHora, estado: 'CONFIRMADO', citaId: op.citaId },
            ConditionExpression: this.condicionLibre(),
            ExpressionAttributeValues: { ':libre': 'LIBRE', ':reservado': 'RESERVADO', ':now': now },
          },
        };
      case 'CONFIRMAR':
        return {
          Update: {
            TableName: this.tables.citas,
            Key,
            UpdateExpression: 'SET estado = :confirmado REMOVE reservaExpiraEn',
            ConditionExpression: 'estado = :reservado AND citaId = :cita',
            ExpressionAttributeValues: { ':confirmado': 'CONFIRMADO', ':reservado': 'RESERVADO', ':cita': op.citaId },
          },
        };
      case 'LIBERAR':
        return {
          Update: {
            TableName: this.tables.citas,
            Key,
            UpdateExpression: 'SET estado = :libre REMOVE citaId, reservaExpiraEn',
            ConditionExpression: 'citaId = :cita',
            ExpressionAttributeValues: { ':libre': 'LIBRE', ':cita': op.citaId },
          },
        };
    }
  }

  /**
   * Libre si: esta LIBRE, o RESERVADO con la reserva vencida (la expiracion se comprueba aqui, no por TTL), o (si no hay modo estricto)
   * no existe el item. Un horario BLOQUEADO o CONFIRMADO nunca se puede tomar.
   */
  private condicionLibre(): string {
    const base = 'estado = :libre OR (estado = :reservado AND reservaExpiraEn < :now)';
    return this.estricto ? base : `attribute_not_exists(pk) OR ${base}`;
  }

  sagasVencidas(now: number, limit = 25): Promise<string[]> {
    return this.byIndex('SAGA#ACTIVA', now, limit);
  }

  notificacionesPendientes(now: number, limit = 25): Promise<string[]> {
    return this.byIndex('NOTIF#PENDIENTE', now, limit);
  }

  private async byIndex(partition: string, upTo: number, limit: number): Promise<string[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tables.citas,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :p AND gsi1sk <= :t',
        ExpressionAttributeValues: { ':p': partition, ':t': upTo },
        Limit: limit,
      }),
    );
    return (res.Items ?? []).map((i) => String(i.pk).replace('CITA#', ''));
  }

  /**
   * Horarios de un medico entre `desde` y `hasta` (Query sobre la clave base: pk = HORARIO#medico, sk ISO = orden cronologico).
   * El estado devuelto es el EFECTIVO (una reserva vencida se ve LIBRE). Con `soloLibres`, el filtro corre en DynamoDB tras leer
   * la pagina, asi que una consulta puede devolver menos de `limite`; se repite (hasta 10 veces) para llenar la pagina.
   * El cursor se valida contra la particion del medico consultado.
   */
  async disponibilidad(filtro: FiltroDisponibilidad, limite: number, cursor?: string): Promise<PaginaHorarios> {
    const partition = `HORARIO#${filtro.medicoId}`;
    let start: Record<string, unknown> | undefined = cursor ? decodeHorarioCursor(cursor, partition) : undefined;
    const now = this.now();
    const items: Horario[] = [];
    let last: { pk: string; sk: string } | undefined;
    let hayMas = false;
    let recortado = false;
    for (let i = 0; i < MAX_CONSULTAS_FILTRADAS && items.length < limite; i++) {
      const res = await this.doc.send(
        new QueryCommand({
          TableName: this.tables.citas,
          KeyConditionExpression: 'pk = :p AND sk BETWEEN :a AND :b',
          ...(filtro.soloLibres
            ? { FilterExpression: 'estado = :libre OR (estado = :reservado AND reservaExpiraEn < :now)' }
            : {}),
          ExpressionAttributeValues: {
            ':p': partition,
            ':a': filtro.desde,
            ':b': filtro.hasta,
            ...(filtro.soloLibres ? { ':libre': 'LIBRE', ':reservado': 'RESERVADO', ':now': now } : {}),
          },
          Limit: limite,
          ExclusiveStartKey: start,
        }),
      );
      for (const raw of res.Items ?? []) {
        if (items.length === limite) {
          recortado = true;
          break;
        }
        const h = raw as unknown as Horario;
        const estado = estadoEfectivo(h, now);
        items.push({
          medicoId: h.medicoId,
          fechaHora: h.fechaHora,
          estado,
          ...(estado === 'LIBRE' ? {} : { citaId: h.citaId, ...(h.reservaExpiraEn !== undefined ? { reservaExpiraEn: h.reservaExpiraEn } : {}), ...(h.motivo ? { motivo: h.motivo } : {}) }),
        });
        last = { pk: partition, sk: h.fechaHora };
      }
      if (recortado) break;
      start = res.LastEvaluatedKey;
      if (!start) {
        hayMas = false; // se llego al final del rango
        break;
      }
      hayMas = true; // quedan items por evaluar (si el bucle termina por limite, hay cursor)
    }
    const siguiente = (hayMas || recortado) && last ? Buffer.from(JSON.stringify(last)).toString('base64url') : null;
    return { items, siguiente };
  }

  /**
   * Consulta por indice: paciente (gsi2), medico+fecha (gsi3) o todas (gsi4), mas recientes primero.
   * El cursor es la LastEvaluatedKey codificada; se valida que pertenezca a la particion consultada para que un cursor
   * manipulado no permita leer las citas de otro paciente o medico.
   */
  async buscar(filtro: FiltroCitas, limite: number, cursor?: string): Promise<PaginaCitas> {
    let index: 'gsi2' | 'gsi3' | 'gsi4';
    let partition: string;
    let range: { lo: number; hi: number } | undefined;
    let forward = false;
    if (filtro.pacienteId) {
      [index, partition] = ['gsi2', `PACIENTE#${filtro.pacienteId}`];
    } else if (filtro.medicoId) {
      [index, partition] = ['gsi3', `MEDICO#${filtro.medicoId}`];
      if (filtro.desde !== undefined || filtro.hasta !== undefined) range = { lo: filtro.desde ?? 0, hi: filtro.hasta ?? Number.MAX_SAFE_INTEGER };
      forward = true; // agenda del medico: por fecha de la cita ascendente
    } else {
      [index, partition] = ['gsi4', 'CITA'];
    }
    let exclusiveStartKey: Record<string, unknown> | undefined = cursor ? decodeCursor(cursor, index, partition) : undefined;
    const base = {
      TableName: this.tables.citas,
      IndexName: index,
      KeyConditionExpression: range ? `${index}pk = :p AND ${index}sk BETWEEN :lo AND :hi` : `${index}pk = :p`,
      ScanIndexForward: forward,
      Limit: limite,
    };
    const valores = { ':p': partition, ...(range ? { ':lo': range.lo, ':hi': range.hi } : {}) };
    if (!filtro.estado) {
      const res = await this.doc.send(new QueryCommand({ ...base, ExpressionAttributeValues: valores, ExclusiveStartKey: exclusiveStartKey }));
      return {
        items: (res.Items ?? []).map(toAggregate),
        siguiente: res.LastEvaluatedKey ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64url') : null,
      };
    }
    // Con filtro por estado: DynamoDB filtra DESPUES de leer `Limit` items, asi que se repite (hasta 10 veces) para llenar la pagina.
    const items: Record<string, unknown>[] = [];
    let siguiente: Record<string, unknown> | undefined;
    for (let i = 0; i < MAX_CONSULTAS_FILTRADAS && items.length < limite; i++) {
      const res = await this.doc.send(
        new QueryCommand({
          ...base,
          FilterExpression: '#e = :estado',
          ExpressionAttributeNames: { '#e': 'estado' },
          ExpressionAttributeValues: { ...valores, ':estado': filtro.estado },
          ExclusiveStartKey: exclusiveStartKey,
        }),
      );
      items.push(...(res.Items ?? []));
      exclusiveStartKey = res.LastEvaluatedKey;
      siguiente = exclusiveStartKey;
      if (!exclusiveStartKey) break;
    }
    if (items.length > limite) {
      // La pagina se paso: el cursor debe apuntar al ultimo item DEVUELTO, no al ultimo evaluado.
      items.length = limite;
      const ultimo = items[limite - 1];
      siguiente = { pk: ultimo.pk, sk: ultimo.sk, [`${index}pk`]: ultimo[`${index}pk`], [`${index}sk`]: ultimo[`${index}sk`] };
    }
    return { items: items.map(toAggregate), siguiente: siguiente ? Buffer.from(JSON.stringify(siguiente)).toString('base64url') : null };
  }
}

/** Maximo de lecturas repetidas para llenar una pagina filtrada. */
const MAX_CONSULTAS_FILTRADAS = 10;

function decodeHorarioCursor(cursor: string, partition: string): { pk: string; sk: string } {
  try {
    const key = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (key.pk !== partition || typeof key.sk !== 'string' || Object.keys(key).length !== 2) throw new Error();
    return { pk: key.pk, sk: key.sk };
  } catch {
    throw new CursorInvalidoError();
  }
}

function decodeCursor(cursor: string, index: string, partition: string): Record<string, unknown> {
  try {
    const key = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (key[`${index}pk`] !== partition || typeof key.pk !== 'string' || !key.pk.startsWith('CITA#')) throw new Error();
    return key;
  } catch {
    throw new CursorInvalidoError();
  }
}

/** Indice disperso: solo las SAGAs en curso y las notificaciones pendientes tienen gsi1pk. */
function indexKeys(a: CitaAggregate): Record<string, string | number> {
  const comunes = {
    gsi2pk: `PACIENTE#${a.input.pacienteId}`,
    gsi2sk: a.createdAt,
    gsi3pk: `MEDICO#${a.input.medicoId}`,
    gsi3sk: Date.parse(a.input.fechaHora),
    gsi4pk: 'CITA',
    gsi4sk: a.createdAt,
  };
  return { ...comunes, ...sparse(a) };
}

function sparse(a: CitaAggregate): { gsi1pk?: string; gsi1sk?: number } {
  if (a.saga.estado === 'EN_CURSO' && a.saga.deadline !== null) return { gsi1pk: 'SAGA#ACTIVA', gsi1sk: a.saga.deadline };
  if (a.notificacion.estado === 'PENDIENTE' && a.notificacion.proximoIntento !== undefined)
    return { gsi1pk: 'NOTIF#PENDIENTE', gsi1sk: a.notificacion.proximoIntento };
  return {};
}

function toAggregate(item: Record<string, unknown>): CitaAggregate {
  const rest = Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'pk' && k !== 'sk' && !k.startsWith('gsi')));
  return rest as unknown as CitaAggregate;
}
