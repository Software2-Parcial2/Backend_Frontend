import { ServicioNoDisponibleError } from '../../domain/imagen.js';
import type { PacienteGateway, PacienteResumen } from '../../application/ports.js';

/** Comprueba en MS2 que el paciente existe, con el token del propio usuario (MS2 decide si puede leerlo). */
export class Ms2PacienteGateway implements PacienteGateway {
  constructor(
    private readonly baseUrl: string,
    private readonly timeoutMs = 5000,
    private readonly fetchFn: typeof fetch = fetch,
  ) {}

  async resumen(pacienteId: string, token: string): Promise<PacienteResumen | null> {
    let res: Response;
    try {
      res = await this.fetchFn(`${this.baseUrl.replace(/\/$/, '')}/api/pacientes/${encodeURIComponent(pacienteId)}`, {
        headers: { authorization: token.startsWith('Bearer ') ? token : `Bearer ${token}` },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch {
      throw new ServicioNoDisponibleError('no se pudo comprobar el paciente (MS2 no responde)');
    }
    if (res.status === 200) {
      const p = (await res.json().catch(() => ({}))) as { nombre?: string; numeroHistoria?: string | null };
      return { nombre: p.nombre ?? '', numeroHistoria: p.numeroHistoria ?? null };
    }
    if (res.status === 404) return null;
    throw new ServicioNoDisponibleError(`MS2 respondio ${res.status} al comprobar el paciente`);
  }
}
