import { Injectable } from '@nestjs/common';
import type { AtributosNoShow, MlGateway, PrediccionNoShow } from '../../application/ports.js';
import type { DemandaEspecialidades, ModeloInfo } from '../../domain/gestion.js';
import { getJson, postJson, type OpcionesHttp } from './http-json.js';

interface SegmentosMl {
  k: number;
  silueta: number | null;
  fuente: string;
  sintetico: boolean;
  segmentos: { id: number; etiqueta: string; observaciones: number; especialidades: Record<string, number> }[];
  segmento_por_especialidad: Record<string, { segmento: number; etiqueta: string }>;
  demanda_por_especialidad: Record<string, { citas_total: number; citas_por_semana: number }>;
}

/** Adaptador hacia el servicio de ML (interno, no expuesto por el gateway). Autentica con X-Api-Key si ML_API_KEY esta definida. */
@Injectable()
export class MlHttpClient implements MlGateway {
  private readonly op: OpcionesHttp = {
    servicio: 'MS7 ML',
    baseUrl: process.env.ML_URL ?? 'http://localhost:8007',
    timeoutMs: Number(process.env.MS7_HTTP_TIMEOUT_MS ?? 8000),
  };

  private get cab(): Record<string, string> {
    return process.env.ML_API_KEY ? { 'X-Api-Key': process.env.ML_API_KEY } : {};
  }

  predecirNoShow(items: AtributosNoShow[]) {
    return postJson<{ predicciones: PrediccionNoShow[]; version_modelo: string; sintetico: boolean }>(this.op, '/predict/no-show', { citas: items }, this.cab);
  }

  async demanda(): Promise<DemandaEspecialidades> {
    const s = await getJson<SegmentosMl>(this.op, '/segments/demanda', {}, this.cab);
    return {
      k: s.k,
      silueta: s.silueta,
      fuente: s.fuente,
      sintetico: s.sintetico,
      segmentos: s.segmentos.map((g) => ({ id: g.id, etiqueta: g.etiqueta, observaciones: g.observaciones, especialidades: Object.keys(g.especialidades) })),
      especialidades: Object.entries(s.segmento_por_especialidad).map(([especialidad, v]) => ({
        especialidad,
        segmento: v.segmento,
        etiqueta: v.etiqueta,
        citasPorSemana: s.demanda_por_especialidad[especialidad]?.citas_por_semana ?? 0,
        citasTotal: s.demanda_por_especialidad[especialidad]?.citas_total ?? 0,
      })),
    };
  }

  async modelo(): Promise<ModeloInfo> {
    const r = await getJson<{ no_show?: Record<string, unknown>; aviso?: string }>(this.op, '/model/info', {}, this.cab);
    const m = r.no_show ?? {};
    const imp = (m.importancias ?? {}) as Record<string, number>;
    return {
      version: (m.version as string | undefined) ?? null,
      umbral: typeof m.umbral === 'number' ? m.umbral : null,
      metricas: (m.metricas as Record<string, unknown> | undefined) ?? {},
      features: (m.features as string[] | undefined) ?? [],
      entrenadoEn: (m.entrenado_en as string | null | undefined) ?? null,
      dataset: (m.dataset as string | null | undefined) ?? null,
      sintetico: m.sintetico === true,
      importancias: Object.entries(imp)
        .map(([variable, importancia]) => ({ variable, importancia: Math.round(Number(importancia) * 1000) / 1000 }))
        .sort((a, b) => b.importancia - a.importancia),
      parametros: (m.parametros as Record<string, unknown> | undefined) ?? {},
      aviso: (m.aviso as string | undefined) ?? r.aviso ?? '',
    };
  }
}
