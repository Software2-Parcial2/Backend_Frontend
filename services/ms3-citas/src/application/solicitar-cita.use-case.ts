import { randomUUID } from 'node:crypto';

export interface SolicitarCitaCommand {
  pacienteId: string;
  medicoId: string;
  especialidad: string;
  fechaHora: string;
}

export interface SolicitarCitaResult {
  citaId: string;
  sagaId: string;
}

/**
 * PROVISIONAL (Bloque G): solo genera los identificadores. El Bloque I lo sustituye por el inicio de la SAGA
 * (reserva de horario -> cobro provisional -> notificacion).
 */
export class SolicitarCitaUseCase {
  ejecutar(_command: SolicitarCitaCommand): SolicitarCitaResult {
    return { citaId: randomUUID(), sagaId: randomUUID() };
  }
}
