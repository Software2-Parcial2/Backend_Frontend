import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildOutboxItem, createEnvelope } from '@sigec/messaging-nest';
import type { ContactoRepository, NotificacionRepository, RecordatorioRepository } from '../../application/ports.js';
import type { CitaRecordable, Contacto, Notificacion, NotificacionTipo, RespuestaSaga } from '../../domain/notificacion.js';

export interface Tablas {
  notificaciones: string;
  outbox: string;
}
const DEFAULT_TABLAS: Tablas = { notificaciones: 'notificaciones', outbox: 'ms8_outbox' };
const strip = (item: Record<string, unknown>) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'pk' && k !== 'sk' && !k.startsWith('gsi') && k !== 'expiresAt'));

/**
 * Tabla `notificaciones` (pk/sk) con dos indices dispersos:
 *   CITA#<id>/NOTIF#<tipo>      notificacion; gsi1 = NOTIF#PENDIENTE por proximo intento (reintentos con backoff)
 *   CITA#<id>/RECORDATORIO      cita confirmada pendiente de recordatorio; gsi2 = RECORDATORIO#PENDIENTE por fechaHora
 *   PACIENTE#<id>/CONTACTO      email, preferencias de canal y chat de Telegram
 *   VINCULO#<codigo>/VINCULO    codigo de un solo uso para vincular Telegram (TTL en expiresAt)
 */
export class DynamoNotificacionRepository implements NotificacionRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly t: Tablas = DEFAULT_TABLAS,
  ) {}

  async obtener(citaId: string, tipo: NotificacionTipo): Promise<Notificacion | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.t.notificaciones, Key: { pk: `CITA#${citaId}`, sk: `NOTIF#${tipo}` }, ConsistentRead: true }));
    return r.Item ? (strip(r.Item) as unknown as Notificacion) : null;
  }

  async guardar(n: Notificacion, respuesta: RespuestaSaga | null): Promise<void> {
    const nueva: Notificacion = { ...n, version: n.version + 1 };
    const item: Record<string, unknown> = { pk: `CITA#${n.citaId}`, sk: `NOTIF#${n.tipo}`, ...nueva };
    if (nueva.estado === 'PENDIENTE' && nueva.proximoIntento !== undefined) {
      item.gsi1pk = 'NOTIF#PENDIENTE';
      item.gsi1sk = nueva.proximoIntento;
    }
    const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [
      {
        Put: {
          TableName: this.t.notificaciones,
          Item: item,
          ...(n.version < 0
            ? { ConditionExpression: 'attribute_not_exists(pk)' }
            : { ConditionExpression: '#v = :v', ExpressionAttributeNames: { '#v': 'version' }, ExpressionAttributeValues: { ':v': n.version } }),
        },
      },
    ];
    if (respuesta) {
      items.push(
        buildOutboxItem(
          this.t.outbox,
          createEnvelope({ id: respuesta.id, type: respuesta.type, correlationId: respuesta.correlationId, causationId: respuesta.causationId, payload: respuesta.payload }),
          'sigec.saga',
        ) as (typeof items)[number],
      );
    }
    await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
  }

  async vencidas(now: number, limite = 25) {
    const r = await this.doc.send(
      new QueryCommand({
        TableName: this.t.notificaciones,
        IndexName: 'gsi1',
        KeyConditionExpression: 'gsi1pk = :p AND gsi1sk <= :t',
        ExpressionAttributeValues: { ':p': 'NOTIF#PENDIENTE', ':t': now },
        Limit: limite,
      }),
    );
    return (r.Items ?? []).map((i) => ({ citaId: String(i.pk).replace('CITA#', ''), tipo: String(i.sk).replace('NOTIF#', '') as NotificacionTipo }));
  }

  async porCita(citaId: string): Promise<Notificacion[]> {
    const r = await this.doc.send(
      new QueryCommand({
        TableName: this.t.notificaciones,
        KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': `CITA#${citaId}`, ':s': 'NOTIF#' },
      }),
    );
    return (r.Items ?? []).map((i) => strip(i) as unknown as Notificacion);
  }
}

export class DynamoContactoRepository implements ContactoRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly t: Tablas = DEFAULT_TABLAS,
  ) {}

  async obtener(pacienteId: string): Promise<Contacto | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.t.notificaciones, Key: { pk: `PACIENTE#${pacienteId}`, sk: 'CONTACTO' }, ConsistentRead: true }));
    return r.Item ? (strip(r.Item) as unknown as Contacto) : null;
  }

  async guardar(c: Contacto): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.t.notificaciones, Item: { pk: `PACIENTE#${c.pacienteId}`, sk: 'CONTACTO', ...c } }));
  }

  async crearVinculo(codigo: string, pacienteId: string, expiraEn: number): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.t.notificaciones,
        Item: { pk: `VINCULO#${codigo}`, sk: 'VINCULO', pacienteId, expiraEn, usado: false, expiresAt: Math.ceil(expiraEn / 1000) + 3600 },
        ConditionExpression: 'attribute_not_exists(pk)', // un codigo repetido (improbable) se rechaza en vez de pisar otro
      }),
    );
  }

  async consumirVinculo(codigo: string, now: number): Promise<string | null> {
    try {
      const r = await this.doc.send(
        new UpdateCommand({
          TableName: this.t.notificaciones,
          Key: { pk: `VINCULO#${codigo}`, sk: 'VINCULO' },
          UpdateExpression: 'SET usado = :t',
          // Atomico: solo el primero que llega, y solo antes de expirar, consume el codigo.
          ConditionExpression: 'attribute_exists(pk) AND usado = :f AND expiraEn > :now',
          ExpressionAttributeValues: { ':t': true, ':f': false, ':now': now },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return (r.Attributes?.pacienteId as string | undefined) ?? null;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return null;
      throw e;
    }
  }
}

export class DynamoRecordatorioRepository implements RecordatorioRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly t: Tablas = DEFAULT_TABLAS,
  ) {}

  async registrar(c: CitaRecordable): Promise<void> {
    await this.doc.send(
      new PutCommand({
        TableName: this.t.notificaciones,
        Item: { pk: `CITA#${c.citaId}`, sk: 'RECORDATORIO', ...c, marcado: false, gsi2pk: 'RECORDATORIO#PENDIENTE', gsi2sk: Date.parse(c.fechaHora) },
      }),
    );
  }

  async pendientes(desde: number, hasta: number, limite = 100): Promise<CitaRecordable[]> {
    const r = await this.doc.send(
      new QueryCommand({
        TableName: this.t.notificaciones,
        IndexName: 'gsi2',
        KeyConditionExpression: 'gsi2pk = :p AND gsi2sk BETWEEN :a AND :b',
        ExpressionAttributeValues: { ':p': 'RECORDATORIO#PENDIENTE', ':a': desde, ':b': hasta },
        Limit: limite,
      }),
    );
    return (r.Items ?? []).map((i) => ({ citaId: i.citaId, pacienteId: i.pacienteId, fechaHora: i.fechaHora }));
  }

  async obtener(citaId: string): Promise<CitaRecordable | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.t.notificaciones, Key: { pk: `CITA#${citaId}`, sk: 'RECORDATORIO' } }));
    return r.Item ? { citaId: r.Item.citaId, pacienteId: r.Item.pacienteId, fechaHora: r.Item.fechaHora } : null;
  }

  async marcar(citaId: string): Promise<void> {
    await this.doc.send(
      new UpdateCommand({
        TableName: this.t.notificaciones,
        Key: { pk: `CITA#${citaId}`, sk: 'RECORDATORIO' },
        UpdateExpression: 'SET marcado = :t REMOVE gsi2pk, gsi2sk',
        ConditionExpression: 'attribute_exists(pk)',
        ExpressionAttributeValues: { ':t': true },
      }),
    );
  }
}
