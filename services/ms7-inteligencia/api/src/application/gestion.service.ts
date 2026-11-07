import { Inject, Injectable } from '@nestjs/common';
import {
  type AgruparCitasPor,
  type CitaConRiesgo,
  type CitaResumen,
  ConsultaInvalidaError,
  type DemandaEspecialidades,
  type Identidad,
  type IngresoPeriodo,
  type ModeloInfo,
  type Pagina,
  type ResumenCitas,
  type RiesgoInasistencia,
} from '../domain/gestion.js';
import { ASISTENCIA_REPO, type AsistenciaRepository } from './alertas/ports.js';
import { CITAS_GATEWAY, FACTURACION_GATEWAY, ML_GATEWAY, type AtributosNoShow, type CitasGateway, type FacturacionGateway, type MlGateway } from './ports.js';

/** Maximo de citas que se leen para un resumen (protege a MS3). */
export const MAX_CITAS_LEIDAS = 5000;
const POR_PAGINA = 100;
const CANCELADAS = new Set(['CANCELADA', 'ANULADA']);
/**
 * Atributos del modelo que SIGEC aun no tiene en MS7: se envian valores neutros y se avisa en la respuesta.
 * `inasistencias_previas` ya sale de la asistencia real (evento cita.asistencia-registrada de MS3).
 */
export const ATRIBUTOS_ESTIMADOS = ['edad', 'beca'];
const EDAD_NEUTRA = 35;
const DIA_MS = 86_400_000;

/**
 * Casos de uso de gestion. Los comparten GraphQL y las herramientas MCP (L3): ninguna logica vive en los adaptadores.
 */
@Injectable()
export class GestionService {
  constructor(
    @Inject(CITAS_GATEWAY) private readonly citas: CitasGateway,
    @Inject(FACTURACION_GATEWAY) private readonly facturacion: FacturacionGateway,
    @Inject(ML_GATEWAY) private readonly ml: MlGateway,
    @Inject(ASISTENCIA_REPO) private readonly asistencia: AsistenciaRepository,
  ) {}

  /** Reloj (sustituible en pruebas). */
  ahora: () => number = () => Date.now();

  listarCitas(id: Identidad, limite: number, cursor?: string): Promise<Pagina<CitaResumen>> {
    return this.citas.listar(id, { limite, cursor });
  }

  /** MS3 calcula el conteo (ya no se pagina todo el listado); aqui solo se valida el rango. */
  async resumenCitas(id: Identidad, desde: string, hasta: string, agruparPor: AgruparCitasPor): Promise<ResumenCitas> {
    this.rango(desde, hasta);
    return this.citas.resumen(id, { desde, hasta, agruparPor });
  }

  ingresos(id: Identidad, desde: string, hasta: string, agrupar: 'dia' | 'mes' | 'especialidad'): Promise<IngresoPeriodo[]> {
    this.rango(desde, hasta);
    return this.facturacion.ingresos(id, { desde: desde.slice(0, 10), hasta: hasta.slice(0, 10), agrupar });
  }

  demanda(): Promise<DemandaEspecialidades> {
    return this.ml.demanda();
  }

  modeloInfo(): Promise<ModeloInfo> {
    return this.ml.modelo();
  }

  /** Riesgo de inasistencia de un lote de citas (una sola llamada al servicio de ML). Es lo que usa el DataLoader. */
  async riesgoDeCitas(citas: CitaResumen[]): Promise<RiesgoInasistencia[]> {
    if (citas.length === 0) return [];
    const previas = await this.asistencia.inasistenciasPrevias([...new Set(citas.map((c) => c.pacienteId))]).catch(() => new Map<string, number>());
    const resultado = await this.ml.predecirNoShow(citas.map((c, _i, todas) => this.atributos(c, todas, previas.get(c.pacienteId) ?? 0)));
    return resultado.predicciones.map((p) => ({
      probabilidad: p.probabilidad_inasistencia,
      riesgo: p.riesgo,
      versionModelo: resultado.version_modelo,
      sintetico: resultado.sintetico,
      atributosEstimados: ATRIBUTOS_ESTIMADOS,
    }));
  }

  /** Citas de los proximos `dias` dias (no canceladas) ordenadas por riesgo de inasistencia descendente. */
  async riesgoProximasCitas(id: Identidad, dias: number, limite: number): Promise<CitaConRiesgo[]> {
    if (!Number.isInteger(dias) || dias < 1 || dias > 60) throw new ConsultaInvalidaError('dias debe estar entre 1 y 60');
    const ahora = this.ahora();
    const tope = ahora + dias * DIA_MS;
    const { items } = await this.leerCitas(
      id,
      (c) => {
        const t = Date.parse(c.fechaHora);
        return t > ahora && t <= tope && !CANCELADAS.has(c.estado);
      },
      { desde: new Date(ahora).toISOString(), hasta: new Date(tope).toISOString() },
    );
    const riesgos = await this.riesgoDeCitas(items);
    return items
      .map((c, i) => ({ ...c, riesgo: riesgos[i] ?? null }))
      .sort((a, b) => (b.riesgo?.probabilidad ?? 0) - (a.riesgo?.probabilidad ?? 0))
      .slice(0, limite);
  }

  // --- internos -------------------------------------------------------------------------------

  private atributos(c: CitaResumen, todas: CitaResumen[], inasistenciasPrevias: number): AtributosNoShow {
    const fecha = new Date(c.fechaHora);
    const creada = Date.parse(c.creadaEn);
    return {
      id: c.citaId,
      antelacion_dias: Math.max(0, Math.min(730, Math.floor((fecha.getTime() - creada) / DIA_MS))),
      dia_semana: (fecha.getUTCDay() + 6) % 7, // 0 = lunes
      edad: EDAD_NEUTRA,
      beca: false,
      sms_recibido: c.notificacion === 'ENVIADA',
      inasistencias_previas: Math.min(1000, inasistenciasPrevias),
      citas_previas: Math.min(1000, todas.filter((o) => o.pacienteId === c.pacienteId && Date.parse(o.creadaEn) < creada).length),
    };
  }

  private rango(desde: string, hasta: string): [number, number] {
    const d = Date.parse(desde);
    const h = Date.parse(hasta);
    if (Number.isNaN(d) || Number.isNaN(h)) throw new ConsultaInvalidaError('desde/hasta deben ser fechas ISO 8601');
    if (h < d) throw new ConsultaInvalidaError('hasta no puede ser anterior a desde');
    if (h - d > 366 * DIA_MS) throw new ConsultaInvalidaError('El rango maximo es de 366 dias');
    // Una fecha sin hora ("2026-03-31") incluye todo ese dia.
    return [d, /^\d{4}-\d{2}-\d{2}$/.test(hasta) ? h + DIA_MS - 1 : h];
  }

  private claveDe(c: CitaResumen, por: AgruparCitasPor): string {
    switch (por) {
      case 'ESPECIALIDAD': return c.especialidad;
      case 'MEDICO': return c.medicoId;
      case 'ESTADO': return c.estado;
      case 'MES': return c.fechaHora.slice(0, 7);
    }
  }

  private async leerCitas(id: Identidad, filtro: (c: CitaResumen) => boolean, rango: { desde?: string; hasta?: string } = {}): Promise<{ items: CitaResumen[]; truncado: boolean }> {
    const items: CitaResumen[] = [];
    let leidas = 0;
    let cursor: string | undefined;
    do {
      const pagina = await this.citas.listar(id, { limite: POR_PAGINA, cursor, ...rango });
      leidas += pagina.items.length;
      items.push(...pagina.items.filter(filtro));
      cursor = pagina.siguiente ?? undefined;
    } while (cursor && leidas < MAX_CITAS_LEIDAS);
    return { items, truncado: !!cursor };
  }
}
