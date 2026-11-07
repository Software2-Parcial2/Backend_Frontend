import { Inject, Injectable } from '@nestjs/common';
import type { Salud, ServicioSalud } from '../domain/identidad.js';
import { SONDAS, type Sonda, type SondaPort } from './ports.js';

export const SONDA_PORT = Symbol('SONDA_PORT');
export const COMPONENTES_CRITICOS = ['gateway', 'keycloak'];

/** Estado de la pila: consulta el /health de cada servicio en paralelo con un plazo corto. */
@Injectable()
export class SaludService {
  ahora: () => Date = () => new Date();

  constructor(
    @Inject(SONDAS) private readonly sondas: Sonda[],
    @Inject(SONDA_PORT) private readonly sonda: SondaPort,
    private readonly timeoutMs = Number(process.env.SALUD_TIMEOUT_MS ?? 2000),
  ) {}

  async estado(): Promise<Salud> {
    const servicios: ServicioSalud[] = await Promise.all(
      this.sondas.map(async (s) => {
        const r = await this.sonda.comprobar(s, this.timeoutMs);
        return { nombre: s.nombre, estado: r.ok ? ('OK' as const) : ('CAIDO' as const), ms: r.ms, detalle: r.detalle };
      }),
    );
    const caidos = servicios.filter((s) => s.estado === 'CAIDO');
    const estado = caidos.length === 0 ? 'OK' : caidos.some((s) => COMPONENTES_CRITICOS.includes(s.nombre)) ? 'CAIDO' : 'DEGRADADO';
    return { estado, verificadoEn: this.ahora().toISOString(), servicios };
  }
}
