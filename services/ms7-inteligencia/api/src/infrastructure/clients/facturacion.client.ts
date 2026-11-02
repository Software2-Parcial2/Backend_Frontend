import { Injectable } from '@nestjs/common';
import type { FacturacionGateway } from '../../application/ports.js';
import type { Identidad, IngresoPeriodo } from '../../domain/gestion.js';
import { getJson, type OpcionesHttp } from './http-json.js';

/** Adaptador hacia MS6 (propaga el token; MS6 limita el endpoint a caja y administrador). */
@Injectable()
export class FacturacionHttpClient implements FacturacionGateway {
  private readonly op: OpcionesHttp = {
    servicio: 'MS6 (facturacion)',
    baseUrl: process.env.MS6_URL ?? 'http://localhost:8006',
    timeoutMs: Number(process.env.MS7_HTTP_TIMEOUT_MS ?? 8000),
  };

  ingresos(id: Identidad, q: { desde: string; hasta: string; agrupar: 'dia' | 'mes' }): Promise<IngresoPeriodo[]> {
    return getJson<IngresoPeriodo[]>(this.op, '/api/facturacion/facturas/ingresos', q, { Authorization: `Bearer ${id.token}` });
  }
}
