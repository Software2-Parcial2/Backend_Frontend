import { TransactionCanceledException } from '@aws-sdk/client-dynamodb';
import {
  GetCommand,
  QueryCommand,
  ScanCommand,
  TransactWriteCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import { buildOutboxItem, createEnvelope } from '@sigec/messaging-nest';
import type { CitaChange, CitaRepository } from '../../application/saga/cita-repository.js';
import {
  ConcurrentUpdateError,
  HorarioNoDisponibleError,
  HorarioPerdidoError,
  type CitaAggregate,
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
        const reservar = failedOps.find((o) => o.op === 'RESERVAR');
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
            // Libre si: no existe, esta LIBRE, o esta RESERVADO con la reserva vencida (la expiracion se comprueba aqui, no por TTL).
            ConditionExpression: 'attribute_not_exists(pk) OR estado = :libre OR (estado = :reservado AND reservaExpiraEn < :now)',
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

  async listar(limit = 100): Promise<CitaAggregate[]> {
    const res = await this.doc.send(
      new ScanCommand({ TableName: this.tables.citas, FilterExpression: 'sk = :sk', ExpressionAttributeValues: { ':sk': 'CITA' } }),
    );
    return (res.Items ?? [])
      .map(toAggregate)
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, limit);
  }
}

/** Indice disperso: solo las SAGAs en curso y las notificaciones pendientes tienen gsi1pk. */
function indexKeys(a: CitaAggregate): { gsi1pk?: string; gsi1sk?: number } {
  if (a.saga.estado === 'EN_CURSO' && a.saga.deadline !== null) return { gsi1pk: 'SAGA#ACTIVA', gsi1sk: a.saga.deadline };
  if (a.notificacion.estado === 'PENDIENTE' && a.notificacion.proximoIntento !== undefined)
    return { gsi1pk: 'NOTIF#PENDIENTE', gsi1sk: a.notificacion.proximoIntento };
  return {};
}

function toAggregate(item: Record<string, unknown>): CitaAggregate {
  const { pk: _pk, sk: _sk, gsi1pk: _g1, gsi1sk: _g2, ...rest } = item;
  return rest as unknown as CitaAggregate;
}
