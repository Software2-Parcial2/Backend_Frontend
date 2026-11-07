import { ApiError } from './errores.js';
import type { ClienteApi } from './cliente.js';

/** Estados finales de la SAGA de una cita (docs/saga-citas.md). */
export const ESTADOS_FINALES_CITA = ['CONFIRMADA', 'CANCELADA', 'CANCELADA_USUARIO', 'ANULADA', 'EN_SALA', 'ATENDIDA', 'NO_ASISTIO'];

export interface CitaSeguimiento {
  citaId: string;
  estado: string;
  motivoFallo?: string | null;
  [campo: string]: unknown;
}

export interface OpcionesEspera {
  intervaloMs?: number;
  maxMs?: number;
  signal?: AbortSignal;
  /** Cada vez que la cita cambia de estado (para mostrar los pasos). */
  alCambio?: (c: CitaSeguimiento) => void;
}

/**
 * `POST /api/citas` responde 202 y la SAGA sigue en segundo plano (reserva -> cobro -> aviso). Esto consulta
 * `GET /api/citas/{id}` hasta que llega a un estado final. Si se agota el tiempo lanza ApiError `TIEMPO_AGOTADO`.
 */
export async function esperarCita(cliente: ClienteApi, citaId: string, op: OpcionesEspera = {}): Promise<CitaSeguimiento> {
  const { intervaloMs = 1000, maxMs = 60_000, signal, alCambio } = op;
  const fin = Date.now() + maxMs;
  let ultimo: string | undefined;
  for (;;) {
    const c = await cliente.get<CitaSeguimiento>(`/api/citas/${encodeURIComponent(citaId)}`, { signal });
    if (c.estado !== ultimo) {
      ultimo = c.estado;
      alCambio?.(c);
    }
    if (ESTADOS_FINALES_CITA.includes(c.estado)) return c;
    if (Date.now() >= fin) throw Object.assign(new ApiError(0, { code: 'TIEMPO_AGOTADO', detail: 'La cita sigue en proceso; consulta su estado en unos minutos.' }), { citaPendiente: c });
    await new Promise<void>((ok, no) => {
      const t = setTimeout(ok, intervaloMs);
      signal?.addEventListener('abort', () => (clearTimeout(t), no(new DOMException('Cancelado', 'AbortError'))), { once: true });
    });
  }
}
