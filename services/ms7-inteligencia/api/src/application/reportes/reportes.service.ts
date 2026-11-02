import { Inject, Injectable } from '@nestjs/common';
import { AccesoDenegadoError, ConsultaInvalidaError, type AgruparCitasPor, type Identidad } from '../../domain/gestion.js';
import { GestionService } from '../gestion.service.js';
import { ROLES_INGRESOS } from '../roles.js';
import { FUENTES, ReporteSpecSchema, type ReporteResultado, type ReporteSpec } from './spec.js';

const MAX_FILAS = 1000;
type Fila = Record<string, string | number | null>;

/** Ejecuta una especificacion de reporte validada con los casos de uso reales. No interpreta codigo ni consultas del llamante. */
@Injectable()
export class ReportesService {
  constructor(@Inject(GestionService) private readonly gestion: GestionService) {}

  /** Valida (zod) una especificacion venida de un cliente o del agente. Lanza ConsultaInvalidaError con el detalle. */
  validar(entrada: unknown): ReporteSpec {
    const r = ReporteSpecSchema.safeParse(entrada);
    if (!r.success) throw new ConsultaInvalidaError(`Especificacion de reporte invalida: ${r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ')}`);
    return r.data;
  }

  async ejecutar(entrada: unknown, id: Identidad): Promise<ReporteResultado> {
    const spec = this.validar(entrada);
    if (spec.fuente === 'ingresos' && !id.roles.some((r) => ROLES_INGRESOS.includes(r))) throw new AccesoDenegadoError('Tu rol no permite reportes de ingresos');
    const hoy = new Date();
    const hasta = spec.parametros.hasta ?? hoy.toISOString().slice(0, 10);
    const desde = spec.parametros.desde ?? new Date(hoy.getTime() - 180 * 86_400_000).toISOString().slice(0, 10);
    let filas: Fila[];
    let sintetico = false;
    let nota: string | undefined;

    switch (spec.fuente) {
      case 'resumen_citas': {
        const r = await this.gestion.resumenCitas(id, desde, hasta, (spec.parametros.agruparPor ?? 'ESPECIALIDAD') as AgruparCitasPor);
        filas = r.grupos.map((g) => ({ ...g }));
        if (r.truncado) nota = 'Resumen parcial: se alcanzo el limite de citas leidas.';
        break;
      }
      case 'ingresos':
        filas = (await this.gestion.ingresos(id, desde, hasta, spec.parametros.agrupar ?? 'mes')).map((x) => ({ ...x }));
        break;
      case 'demanda': {
        const d = await this.gestion.demanda();
        sintetico = d.sintetico;
        filas = d.especialidades.map((e) => ({ ...e }));
        break;
      }
      case 'riesgo_inasistencia': {
        const citas = await this.gestion.riesgoProximasCitas(id, spec.parametros.dias ?? 7, spec.parametros.limite ?? 50);
        sintetico = citas.some((c) => c.riesgo?.sintetico);
        filas = citas.map((c) => ({
          citaId: c.citaId, especialidad: c.especialidad, medicoId: c.medicoId, fechaHora: c.fechaHora,
          probabilidad: c.riesgo?.probabilidad ?? null, riesgo: c.riesgo?.riesgo ?? null,
        }));
        nota = 'Estimacion con atributos neutros para edad, beca e historial (ver docs/inteligencia.md).';
        break;
      }
    }

    for (const f of spec.filtros) filas = filas.filter((fila) => cumple(fila[f.columna], f.operador, f.valor));
    if (spec.orden) {
      const { columna, direccion } = spec.orden;
      const signo = direccion === 'asc' ? 1 : -1;
      filas = [...filas].sort((a, b) => signo * comparar(a[columna], b[columna]));
    }
    const defs = FUENTES[spec.fuente];
    const columnas = spec.columnas.map((c) => defs.find((d) => d.clave === c)!);
    return {
      titulo: spec.titulo,
      fuente: spec.fuente,
      generadoEn: new Date().toISOString(),
      parametros: { ...spec.parametros, desde, hasta },
      columnas: columnas.map((c) => ({ ...c })),
      filas: filas.slice(0, MAX_FILAS).map((fila) => Object.fromEntries(spec.columnas.map((c) => [c, fila[c] ?? null]))),
      grafico: spec.grafico,
      especificacion: spec,
      sintetico,
      nota,
    };
  }
}

function comparar(a: unknown, b: unknown): number {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''));
}

function cumple(v: unknown, op: 'eq' | 'gte' | 'lte' | 'contiene', ref: string | number): boolean {
  switch (op) {
    case 'eq': return String(v) === String(ref);
    case 'contiene': return String(v ?? '').toLowerCase().includes(String(ref).toLowerCase());
    case 'gte': return Number(v) >= Number(ref);
    case 'lte': return Number(v) <= Number(ref);
  }
}
