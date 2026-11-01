import { QueryCommand, TransactWriteCommand, type DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';
import { buildOutboxItem, createEnvelope } from '@sigec/messaging-nest';
import type { NotificacionRepository } from '../../application/enviar-notificacion.use-case.js';
import type { Notificacion, RespuestaSaga } from '../../domain/notificacion.js';

/**
 * Tabla `notificaciones` (pk CITA#<id>, sk NOTIF#<fecha>#<id>). El registro y la respuesta de la SAGA se escriben en
 * UNA TransactWriteItems (la respuesta va al outbox `ms8_outbox`, exchange sigec.saga).
 */
export class DynamoNotificacionRepository implements NotificacionRepository {
  constructor(
    private readonly doc: DynamoDBDocumentClient,
    private readonly tables = { notificaciones: 'notificaciones', outbox: 'ms8_outbox' },
  ) {}

  async registrar(n: Notificacion, respuesta: RespuestaSaga | null): Promise<void> {
    const items: NonNullable<ConstructorParameters<typeof TransactWriteCommand>[0]['TransactItems']> = [
      { Put: { TableName: this.tables.notificaciones, Item: { pk: `CITA#${n.citaId}`, sk: `NOTIF#${n.creadaEn}#${n.id}`, ...n } } },
    ];
    if (respuesta) {
      items.push(
        buildOutboxItem(
          this.tables.outbox,
          createEnvelope({ id: respuesta.id, type: respuesta.type, correlationId: respuesta.correlationId, causationId: respuesta.causationId, payload: respuesta.payload }),
          'sigec.saga',
        ) as (typeof items)[number],
      );
    }
    await this.doc.send(new TransactWriteCommand({ TransactItems: items }));
  }

  async porCita(citaId: string): Promise<Notificacion[]> {
    const res = await this.doc.send(
      new QueryCommand({
        TableName: this.tables.notificaciones,
        KeyConditionExpression: 'pk = :p AND begins_with(sk, :s)',
        ExpressionAttributeValues: { ':p': `CITA#${citaId}`, ':s': 'NOTIF#' },
      }),
    );
    return (res.Items ?? []).map(({ pk: _pk, sk: _sk, ...n }) => n as unknown as Notificacion);
  }
}
