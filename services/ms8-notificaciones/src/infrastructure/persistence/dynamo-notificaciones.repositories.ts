import { ConditionalCheckFailedException } from '@aws-sdk/client-dynamodb';
import { GetCommand, PutCommand, QueryCommand, TransactWriteCommand, UpdateCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildOutboxItem, createEnvelope } from '@sigec/messaging-nest';
import type { ContactoRepository, FiltroHistorial, NotificacionRepository, PaginaNotificaciones, PlantillaRepository, PreferenciasPersonalRepository, RecordatorioRepository } from '../../application/ports.js';
import { claveDe, ReglaNotificacionError, type Canal, type CitaRecordable, type Contacto, type Notificacion, type NotificacionTipo, type Plantilla, type PreferenciasPersonal, type RespuestaSaga } from '../../domain/notificacion.js';

export class CursorInvalidoError extends Error {}

export interface Tablas {
  notificaciones: string;
  outbox: string;
}
const DEFAULT_TABLAS: Tablas = { notificaciones: 'notificaciones', outbox: 'ms8_outbox' };
const strip = (item: Record<string, unknown>) => Object.fromEntries(Object.entries(item).filter(([k]) => k !== 'pk' && k !== 'sk' && !k.startsWith('gsi') && k !== 'expiresAt'));

/**
 * Tabla `notificaciones` (pk/sk) con dos indices dispersos:
 *   CITA#<id>/NOTIF#<clave>     notificacion (clave = tipo, o tipo@fecha en reprogramaciones); gsi1 = NOTIF#PENDIENTE por proximo intento;
 *                               gsi3 = PACIENTE#<id> por fecha de creacion (historial); gsi4 = NOTIF por fecha de creacion (resumen diario)
 *   NOTIF#<id>/PTR              puntero al item de arriba (para marcar leida / reenviar por id)
 *   PLANTILLA#<tipo>#<canal>/V#<n>  versiones de una plantilla editable
 *   USUARIO#<sub>/PREFERENCIAS  alertas internas del personal
 *   CITA#<id>/RECORDATORIO      cita confirmada pendiente de recordatorio; gsi2 = RECORDATORIO#PENDIENTE por fechaHora
 *   PACIENTE#<id>/CONTACTO      email, preferencias de canal y chat de Telegram
 *   VINCULO#<codigo>/VINCULO    codigo de un solo uso para vincular Telegram (TTL en expiresAt)
 */
export class DynamoNotificacionRepository implements NotificacionRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly t: Tablas = DEFAULT_TABLAS,
  ) {}

  async obtener(citaId: string, clave: string): Promise<Notificacion | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.t.notificaciones, Key: { pk: `CITA#${citaId}`, sk: `NOTIF#${clave}` }, ConsistentRead: true }));
    return r.Item ? (strip(r.Item) as unknown as Notificacion) : null;
  }

  private async clavesPorId(id: string): Promise<{ pk: string; sk: string } | null> {
    const p = await this.doc.send(new GetCommand({ TableName: this.t.notificaciones, Key: { pk: `NOTIF#${id}`, sk: 'PTR' } }));
    return p.Item ? { pk: String(p.Item.refPk), sk: String(p.Item.refSk) } : null;
  }

  async obtenerPorId(id: string): Promise<Notificacion | null> {
    const k = await this.clavesPorId(id);
    if (!k) return null;
    const r = await this.doc.send(new GetCommand({ TableName: this.t.notificaciones, Key: k, ConsistentRead: true }));
    return r.Item ? (strip(r.Item) as unknown as Notificacion) : null;
  }

  async historial(f: FiltroHistorial, limite: number, cursor?: string): Promise<PaginaNotificaciones> {
    const particion = `PACIENTE#${f.pacienteId}`;
    let inicio = decodificar(cursor, particion);
    const filtros: string[] = [];
    const valores: Record<string, unknown> = { ':p': particion };
    const nombres: Record<string, string> = {};
    if (f.estado) (filtros.push('#estado = :estado'), (valores[':estado'] = f.estado), (nombres['#estado'] = 'estado'));
    if (f.tipo) (filtros.push('tipo = :tipo'), (valores[':tipo'] = f.tipo));
    if (f.canal) (filtros.push('contains(canalesEnviados, :canal)'), (valores[':canal'] = f.canal));
    let cond = 'gsi3pk = :p';
    if (f.desde !== undefined) (cond += ' AND gsi3sk >= :desde', (valores[':desde'] = f.desde));
    const acumulado: Record<string, unknown>[] = [];
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.t.notificaciones,
          IndexName: 'gsi3',
          KeyConditionExpression: cond,
          ...(filtros.length ? { FilterExpression: filtros.join(' AND ') } : {}),
          ExpressionAttributeValues: valores,
          ...(Object.keys(nombres).length ? { ExpressionAttributeNames: nombres } : {}),
          ScanIndexForward: false,
          Limit: Math.max(limite + 1, 25),
          ExclusiveStartKey: inicio,
        }),
      );
      acumulado.push(...(r.Items ?? []));
      inicio = r.LastEvaluatedKey;
    } while (acumulado.length <= limite && inicio);
    const hayMas = acumulado.length > limite;
    const pagina = acumulado.slice(0, limite);
    const ultimo = pagina.at(-1);
    return {
      items: pagina.map((i) => strip(i) as unknown as Notificacion),
      siguiente: hayMas && ultimo ? Buffer.from(JSON.stringify({ pk: ultimo.pk, sk: ultimo.sk, gsi3pk: ultimo.gsi3pk, gsi3sk: ultimo.gsi3sk })).toString('base64url') : null,
    };
  }

  async entreFechas(desde: number, hasta: number, tope = 5000): Promise<Notificacion[]> {
    const out: Notificacion[] = [];
    let inicio: Record<string, unknown> | undefined;
    do {
      const r = await this.doc.send(
        new QueryCommand({
          TableName: this.t.notificaciones,
          IndexName: 'gsi4',
          KeyConditionExpression: 'gsi4pk = :p AND gsi4sk BETWEEN :a AND :b',
          ExpressionAttributeValues: { ':p': 'NOTIF', ':a': desde, ':b': hasta - 1 },
          ExclusiveStartKey: inicio,
        }),
      );
      out.push(...(r.Items ?? []).map((i) => strip(i) as unknown as Notificacion));
      inicio = r.LastEvaluatedKey;
    } while (inicio && out.length < tope);
    return out;
  }

  async marcarLeida(id: string, ahora: string, pacienteId?: string): Promise<Notificacion | null> {
    const k = await this.clavesPorId(id);
    if (!k) return null;
    try {
      const r = await this.doc.send(
        new UpdateCommand({
          TableName: this.t.notificaciones,
          Key: k,
          UpdateExpression: 'SET leida = :t, leidaEn = if_not_exists(leidaEn, :ahora)',
          ConditionExpression: pacienteId ? 'attribute_exists(pk) AND pacienteId = :pac' : 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':t': true, ':ahora': ahora, ...(pacienteId ? { ':pac': pacienteId } : {}) },
          ReturnValues: 'ALL_NEW',
        }),
      );
      return r.Attributes ? (strip(r.Attributes) as unknown as Notificacion) : null;
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) return null;
      throw e;
    }
  }

  async guardar(n: Notificacion, respuesta: RespuestaSaga | null): Promise<void> {
    const nueva: Notificacion = { ...n, version: n.version + 1 };
    const sk = `NOTIF#${claveDe(n.tipo, n.fechaHora)}`;
    const item: Record<string, unknown> = {
      pk: `CITA#${n.citaId}`,
      sk,
      ...nueva,
      gsi3pk: `PACIENTE#${n.pacienteId}`,
      gsi3sk: Date.parse(n.creadaEn),
      gsi4pk: 'NOTIF',
      gsi4sk: Date.parse(n.creadaEn),
    };
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
    if (n.version < 0) {
      items.push({ Put: { TableName: this.t.notificaciones, Item: { pk: `NOTIF#${n.id}`, sk: 'PTR', refPk: `CITA#${n.citaId}`, refSk: sk } } });
    }
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
    return (r.Items ?? []).map((i) => ({ citaId: String(i.pk).replace('CITA#', ''), tipo: String(i.sk).replace('NOTIF#', '') }));
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

  async desvincularTelegram(pacienteId: string): Promise<void> {
    await this.doc.send(new UpdateCommand({ TableName: this.t.notificaciones, Key: { pk: `PACIENTE#${pacienteId}`, sk: 'CONTACTO' }, UpdateExpression: 'REMOVE telegramChatId' }));
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

  async cancelar(citaId: string): Promise<void> {
    try {
      await this.doc.send(
        new UpdateCommand({
          TableName: this.t.notificaciones,
          Key: { pk: `CITA#${citaId}`, sk: 'RECORDATORIO' },
          UpdateExpression: 'SET marcado = :t, cancelada = :t REMOVE gsi2pk, gsi2sk',
          ConditionExpression: 'attribute_exists(pk)',
          ExpressionAttributeValues: { ':t': true },
        }),
      );
    } catch (e) {
      if (!(e instanceof ConditionalCheckFailedException)) throw e; // sin recordatorio registrado: nada que cancelar
    }
  }

  /** Vuelve a dejar la cita pendiente de recordatorio, ahora para la nueva fecha. */
  async reprogramar(c: CitaRecordable): Promise<void> {
    await this.registrar(c);
  }
}

export class DynamoPlantillaRepository implements PlantillaRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly t: Tablas = DEFAULT_TABLAS,
  ) {}

  async vigente(tipo: NotificacionTipo, canal: Canal): Promise<Plantilla | null> {
    const r = await this.doc.send(
      new QueryCommand({
        TableName: this.t.notificaciones,
        KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': `PLANTILLA#${tipo}#${canal}`, ':s': 'V#' },
        ScanIndexForward: false,
        Limit: 1,
        ConsistentRead: true,
      }),
    );
    return r.Items?.[0] ? (strip(r.Items[0]) as unknown as Plantilla) : null;
  }

  async guardar(p: Plantilla): Promise<void> {
    try {
      await this.doc.send(
        new PutCommand({
          TableName: this.t.notificaciones,
          Item: { pk: `PLANTILLA#${p.tipo}#${p.canal}`, sk: `V#${String(p.version).padStart(6, '0')}`, ...p },
          ConditionExpression: 'attribute_not_exists(pk)',
        }),
      );
    } catch (e) {
      if (e instanceof ConditionalCheckFailedException) {
        throw new ReglaNotificacionError('VERSION_CONFLICTO', 409, 'Otro administrador modifico esta plantilla; recargue', { versionVigente: (await this.vigente(p.tipo, p.canal))?.version ?? 0 });
      }
      throw e;
    }
  }
}

export class DynamoPreferenciasPersonalRepository implements PreferenciasPersonalRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly t: Tablas = DEFAULT_TABLAS,
  ) {}

  async obtener(usuarioId: string): Promise<PreferenciasPersonal | null> {
    const r = await this.doc.send(new GetCommand({ TableName: this.t.notificaciones, Key: { pk: `USUARIO#${usuarioId}`, sk: 'PREFERENCIAS' } }));
    return r.Item ? (strip(r.Item) as unknown as PreferenciasPersonal) : null;
  }

  async guardar(p: PreferenciasPersonal): Promise<void> {
    await this.doc.send(new PutCommand({ TableName: this.t.notificaciones, Item: { pk: `USUARIO#${p.usuarioId}`, sk: 'PREFERENCIAS', ...p } }));
  }
}

/** Cursor opaco = la clave del ultimo item devuelto. Debe pertenecer a la particion consultada (un cursor ajeno no se acepta). */
function decodificar(cursor: string | undefined, particion: string): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  try {
    const k = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as Record<string, unknown>;
    if (typeof k.pk !== 'string' || typeof k.sk !== 'string' || k.gsi3pk !== particion || typeof k.gsi3sk !== 'number') throw new Error();
    return { pk: k.pk, sk: k.sk, gsi3pk: k.gsi3pk, gsi3sk: k.gsi3sk };
  } catch {
    throw new CursorInvalidoError('cursor invalido');
  }
}
