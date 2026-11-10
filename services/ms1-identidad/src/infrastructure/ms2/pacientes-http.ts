import type { PacientesPort } from '../../application/ports.js';
import { PacientesNoDisponibleError, type FichaPaciente } from '../../domain/identidad.js';

export interface PacientesHttpOpciones {
  /** Base de MS2, p. ej. http://localhost:8082 */
  url: string;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

/** Lee la ficha de MS2 reenviando el token de quien hace la peticion: MS2 decide si puede verla. */
export class PacientesHttp implements PacientesPort {
  private readonly f: typeof fetch;

  constructor(private readonly o: PacientesHttpOpciones) {
    this.f = o.fetchFn ?? fetch;
  }

  async obtener(pacienteId: string, autorizacion: string): Promise<FichaPaciente | null> {
    let r: Response;
    try {
      r = await this.f(`${this.o.url.replace(/\/$/, '')}/api/pacientes/${encodeURIComponent(pacienteId)}`, {
        headers: { authorization: autorizacion, accept: 'application/json' },
        signal: AbortSignal.timeout(this.o.timeoutMs ?? 5000),
      });
    } catch (e) {
      throw new PacientesNoDisponibleError(`MS2 no responde: ${(e as Error).message}`);
    }
    if (r.status === 404) return null;
    if (r.status === 401 || r.status === 403) throw new PacientesNoDisponibleError(`MS2 rechazo la consulta del paciente (${r.status})`);
    if (!r.ok) throw new PacientesNoDisponibleError(`MS2 respondio ${r.status} al leer el paciente`);
    const p = (await r.json()) as { id: string; nombre: string; documento: string; email?: string | null };
    return { id: p.id, nombre: p.nombre, documento: p.documento, email: p.email?.trim() || null };
  }
}
