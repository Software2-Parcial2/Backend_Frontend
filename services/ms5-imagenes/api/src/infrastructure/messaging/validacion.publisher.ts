import { createHash } from 'node:crypto';
import { createEnvelope, EXCHANGE_EVENTOS, type RabbitPublisher } from '@sigec/messaging-nest';
import type { ValidacionPublisher } from '../../application/ports.js';
import type { Imagen } from '../../domain/imagen.js';

/** Publica imagen.informe-validado (evento de dominio): solo ids, decision y huella; nunca el texto del informe. */
/** UUID estable a partir de un texto: una republicacion lleva el mismo id y el consumidor la descarta. */
function uuidDe(texto: string): string {
  const h = createHash('sha256').update(texto).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

export class RabbitValidacionPublisher implements ValidacionPublisher {
  constructor(private readonly publisher: RabbitPublisher) {}

  publicar(i: Imagen): Promise<void> {
    const inf = i.informe;
    if (!inf) return Promise.reject(new Error('la imagen no tiene informe validado'));
    return this.publisher.publish(
      EXCHANGE_EVENTOS,
      createEnvelope({
        type: 'imagen.informe-validado',
        id: uuidDe(`${i.id}:${inf.huella}`),
        occurredAt: new Date(inf.validadoEn),
        // Mismo id de correlacion por imagen: la reentrega es detectable por el consumidor.
        correlationId: i.id,
        payload: {
          imagenId: i.id,
          pacienteId: i.pacienteId,
          estudio: i.estudio,
          decision: inf.decision,
          validacion: i.validacion,
          validadoPor: inf.validadoPor,
          medicoId: inf.medicoId,
          validadoEn: new Date(inf.validadoEn).toISOString(),
          huella: inf.huella,
          versionModelo: inf.versionModelo,
        },
      }),
    );
  }
}
