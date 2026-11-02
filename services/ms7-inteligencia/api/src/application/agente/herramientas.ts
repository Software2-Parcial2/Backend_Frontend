import { z } from 'zod';
import type { Identidad } from '../../domain/gestion.js';
import { GestionService } from '../gestion.service.js';
import { ReportesService } from '../reportes/reportes.service.js';
import { ReporteSpecSchema, type ReporteResultado } from '../reportes/spec.js';
import type { PoliticasPort } from './ports.js';

import { ROLES_GESTION, ROLES_INGRESOS } from '../roles.js';

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'AAAA-MM-DD');

export interface ContextoHerramienta {
  identidad: Identidad;
  gestion: GestionService;
  reportes: ReportesService;
  politicas: PoliticasPort;
  /** El ultimo reporte generado en esta consulta (el endpoint lo devuelve completo). */
  guardarReporte(r: ReporteResultado): void;
}

export interface DefinicionHerramienta {
  nombre: string;
  descripcion: string;
  roles: string[];
  /** Forma zod (se valida SIEMPRE al invocar; ademas se publica como JSON Schema al modelo). */
  forma: z.ZodRawShape;
  ejecutar(args: Record<string, unknown>, ctx: ContextoHerramienta): Promise<unknown>;
}

/**
 * Lista blanca de herramientas del agente. Todas son de SOLO LECTURA y llaman a los mismos casos de uso que GraphQL.
 * Ninguna recibe SQL, codigo o URLs: solo parametros acotados.
 */
export const HERRAMIENTAS: DefinicionHerramienta[] = [
  {
    nombre: 'obtener_resumen_citas',
    descripcion: 'Cuenta citas de un periodo agrupadas por especialidad, medico, estado o mes (totales, confirmadas, canceladas).',
    roles: ROLES_GESTION,
    forma: { desde: fecha, hasta: fecha, agruparPor: z.enum(['ESPECIALIDAD', 'MEDICO', 'ESTADO', 'MES']).default('ESPECIALIDAD') },
    ejecutar: (a, c) => c.gestion.resumenCitas(c.identidad, a.desde as string, a.hasta as string, a.agruparPor as 'ESPECIALIDAD'),
  },
  {
    nombre: 'consultar_ingresos',
    descripcion: 'Ingresos facturados por periodo (dia o mes): importe confirmado, provisional y numero de facturas.',
    roles: ROLES_INGRESOS,
    forma: { desde: fecha, hasta: fecha, agrupar: z.enum(['dia', 'mes']).default('mes') },
    ejecutar: (a, c) => c.gestion.ingresos(c.identidad, a.desde as string, a.hasta as string, a.agrupar as 'mes'),
  },
  {
    nombre: 'consultar_demanda_especialidades',
    descripcion: 'Segmentos de demanda por especialidad (K-means): citas por semana y segmento de cada especialidad.',
    roles: ROLES_GESTION,
    forma: {},
    ejecutar: (_a, c) => c.gestion.demanda(),
  },
  {
    nombre: 'consultar_prediccion_inasistencia',
    descripcion: 'Citas proximas con mayor riesgo de inasistencia (Random Forest). Es una estimacion con atributos administrativos, no clinica.',
    roles: ROLES_GESTION,
    forma: { dias: z.number().int().min(1).max(60).default(7), limite: z.number().int().min(1).max(50).default(10) },
    ejecutar: async (a, c) => {
      const citas = await c.gestion.riesgoProximasCitas(c.identidad, a.dias as number, a.limite as number);
      return citas.map((x) => ({ citaId: x.citaId, especialidad: x.especialidad, fechaHora: x.fechaHora, riesgo: x.riesgo }));
    },
  },
  {
    nombre: 'consultar_politicas',
    descripcion: 'Busca en los documentos administrativos (cancelacion, aranceles, horarios, protocolos). Devuelve fragmentos con documento y seccion para CITARLOS.',
    roles: ROLES_GESTION,
    forma: { pregunta: z.string().trim().min(3).max(300), maximo: z.number().int().min(1).max(8).default(4) },
    ejecutar: async (a, c) => {
      const fragmentos = await c.politicas.buscar(a.pregunta as string, a.maximo as number);
      return fragmentos.length === 0 ? { fragmentos: [], aviso: 'No se encontro informacion suficiente en los documentos.' } : { fragmentos };
    },
  },
  {
    nombre: 'generar_reporte',
    descripcion:
      'Genera un reporte a partir de una ESPECIFICACION JSON (no codigo): fuente (resumen_citas|ingresos|demanda|riesgo_inasistencia), parametros, columnas, filtros, orden y grafico. Devuelve un extracto; el usuario descarga el reporte completo.',
    roles: ROLES_GESTION,
    forma: { especificacion: ReporteSpecSchema },
    ejecutar: async (a, c) => {
      const spec = c.reportes.validar(a.especificacion);
      const r = await c.reportes.ejecutar(spec, c.identidad);
      c.guardarReporte(r);
      return { titulo: r.titulo, filas: r.filas.length, columnas: r.columnas.map((x) => x.clave), extracto: r.filas.slice(0, 10), aviso: r.nota };
    },
  },
];

export const NOMBRES_HERRAMIENTAS = HERRAMIENTAS.map((h) => h.nombre);
export { ReporteSpecSchema };
