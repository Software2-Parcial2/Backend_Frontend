import { Injectable } from '@nestjs/common';
import type { CitasGateway } from '../../application/ports.js';
import type { AgruparCitasPor, CitaResumen, Identidad, Pagina, ResumenCitas } from '../../domain/gestion.js';
import { getJson, type OpcionesHttp } from './http-json.js';

/** Adaptador hacia MS3. Propaga el token del usuario: MS3 vuelve a validarlo y aplica sus propias reglas por rol. */
@Injectable()
export class CitasHttpClient implements CitasGateway {
  private readonly op: OpcionesHttp = {
    servicio: 'MS3 (citas)',
    baseUrl: process.env.MS3_URL ?? 'http://localhost:3003',
    timeoutMs: Number(process.env.MS7_HTTP_TIMEOUT_MS ?? 8000),
  };

  listar(id: Identidad, q: { limite: number; cursor?: string; desde?: string; hasta?: string }): Promise<Pagina<CitaResumen>> {
    return getJson<Pagina<CitaResumen>>(this.op, '/api/citas', { limite: q.limite, cursor: q.cursor, desde: q.desde, hasta: q.hasta }, { Authorization: `Bearer ${id.token}` });
  }

  /** MS3 agrupa por `especialidad|medico|estado|mes`; aqui se conserva la forma que ya usaban GraphQL y MCP. */
  async resumen(id: Identidad, q: { desde: string; hasta: string; agruparPor: AgruparCitasPor }): Promise<ResumenCitas> {
    const r = await getJson<{ total: number; truncado: boolean; grupos: { clave: string; total: number; confirmadas: number; canceladas: number }[] }>(
      this.op,
      '/api/citas/resumen',
      { desde: q.desde, hasta: q.hasta, agruparPor: q.agruparPor.toLowerCase() },
      { Authorization: `Bearer ${id.token}` },
    );
    return {
      desde: q.desde,
      hasta: q.hasta,
      agrupadoPor: q.agruparPor,
      total: r.total,
      truncado: r.truncado,
      grupos: r.grupos.map((g) => ({ clave: g.clave, total: g.total, confirmadas: g.confirmadas, canceladas: g.canceladas })),
    };
  }
}
