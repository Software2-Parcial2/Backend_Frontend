import { createEnvelope, EXCHANGE_SAGA, type RabbitPublisher } from '@sigec/messaging-nest';
import type { AnalisisPublisher } from '../../application/ports.js';
import type { Imagen } from '../../domain/imagen.js';

/** Publica imagenes.analisis.solicitar (con confirms y validacion del contrato). correlationId = id de la imagen. */
export class RabbitAnalisisPublisher implements AnalisisPublisher {
  constructor(private readonly publisher: RabbitPublisher) {}

  solicitar(i: Imagen): Promise<void> {
    return this.publisher.publish(
      EXCHANGE_SAGA,
      createEnvelope({
        type: 'imagenes.analisis.solicitar',
        correlationId: i.id,
        payload: { imagenId: i.id, pacienteId: i.pacienteId, bucket: i.bucket, objectKey: i.objectKey, mime: i.mime, hashSha256: i.hashSha256 },
      }),
    );
  }
}
