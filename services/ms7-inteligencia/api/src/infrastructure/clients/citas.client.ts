import { Injectable } from '@nestjs/common';
import type { CitasGateway } from '../../application/ports.js';
import type { CitaResumen, Identidad, Pagina } from '../../domain/gestion.js';
import { getJson, type OpcionesHttp } from './http-json.js';

/** Adaptador hacia MS3. Propaga el token del usuario: MS3 vuelve a validarlo y aplica sus propias reglas por rol. */
@Injectable()
export class CitasHttpClient implements CitasGateway {
  private readonly op: OpcionesHttp = {
    servicio: 'MS3 (citas)',
    baseUrl: process.env.MS3_URL ?? 'http://localhost:3003',
    timeoutMs: Number(process.env.MS7_HTTP_TIMEOUT_MS ?? 8000),
  };

  listar(id: Identidad, q: { limite: number; cursor?: string }): Promise<Pagina<CitaResumen>> {
    return getJson<Pagina<CitaResumen>>(this.op, '/api/citas', { limite: q.limite, cursor: q.cursor }, { Authorization: `Bearer ${id.token}` });
  }
}
