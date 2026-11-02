import { z } from 'zod';

export type TipoColumna = 'texto' | 'numero' | 'moneda' | 'fecha' | 'porcentaje';
export interface ColumnaDef { clave: string; titulo: string; tipo: TipoColumna }

/** Fuentes de datos permitidas y sus columnas. El agente solo puede elegir entre estas: nunca escribe consultas ni codigo. */
export const FUENTES = {
  resumen_citas: [
    { clave: 'clave', titulo: 'Grupo', tipo: 'texto' },
    { clave: 'total', titulo: 'Citas', tipo: 'numero' },
    { clave: 'confirmadas', titulo: 'Confirmadas', tipo: 'numero' },
    { clave: 'canceladas', titulo: 'Canceladas', tipo: 'numero' },
  ],
  ingresos: [
    { clave: 'periodo', titulo: 'Periodo', tipo: 'texto' },
    { clave: 'confirmado', titulo: 'Confirmado', tipo: 'moneda' },
    { clave: 'provisional', titulo: 'Provisional', tipo: 'moneda' },
    { clave: 'facturas', titulo: 'Facturas', tipo: 'numero' },
  ],
  demanda: [
    { clave: 'especialidad', titulo: 'Especialidad', tipo: 'texto' },
    { clave: 'etiqueta', titulo: 'Segmento', tipo: 'texto' },
    { clave: 'segmento', titulo: 'N.º segmento', tipo: 'numero' },
    { clave: 'citasPorSemana', titulo: 'Citas por semana', tipo: 'numero' },
    { clave: 'citasTotal', titulo: 'Citas totales', tipo: 'numero' },
  ],
  riesgo_inasistencia: [
    { clave: 'citaId', titulo: 'Cita', tipo: 'texto' },
    { clave: 'especialidad', titulo: 'Especialidad', tipo: 'texto' },
    { clave: 'medicoId', titulo: 'Medico', tipo: 'texto' },
    { clave: 'fechaHora', titulo: 'Fecha y hora', tipo: 'fecha' },
    { clave: 'probabilidad', titulo: 'Prob. de inasistencia', tipo: 'porcentaje' },
    { clave: 'riesgo', titulo: 'Riesgo', tipo: 'texto' },
  ],
} as const satisfies Record<string, readonly ColumnaDef[]>;

export type Fuente = keyof typeof FUENTES;
export const NOMBRES_FUENTE = Object.keys(FUENTES) as [Fuente, ...Fuente[]];

const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'usa el formato AAAA-MM-DD');

export const ReporteSpecSchema = z
  .object({
    titulo: z.string().trim().min(3).max(120),
    fuente: z.enum(NOMBRES_FUENTE),
    parametros: z
      .object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        agruparPor: z.enum(['ESPECIALIDAD', 'MEDICO', 'ESTADO', 'MES']).optional(),
        agrupar: z.enum(['dia', 'mes']).optional(),
        dias: z.number().int().min(1).max(60).optional(),
        limite: z.number().int().min(1).max(200).optional(),
      })
      .strict()
      .default({}),
    columnas: z.array(z.string()).min(1).max(8),
    filtros: z
      .array(z.object({ columna: z.string(), operador: z.enum(['eq', 'gte', 'lte', 'contiene']), valor: z.union([z.string().max(100), z.number()]) }).strict())
      .max(5)
      .default([]),
    orden: z.object({ columna: z.string(), direccion: z.enum(['asc', 'desc']).default('desc') }).strict().optional(),
    grafico: z
      .object({ tipo: z.enum(['barras', 'lineas', 'torta', 'ninguno']).default('ninguno'), x: z.string().optional(), y: z.string().optional() })
      .strict()
      .default({ tipo: 'ninguno' }),
  })
  .strict()
  .superRefine((s, ctx) => {
    const validas = new Set<string>(FUENTES[s.fuente].map((c) => c.clave));
    const revisar = (col: string | undefined, ruta: (string | number)[]) => {
      if (col !== undefined && !validas.has(col)) ctx.addIssue({ code: 'custom', path: ruta, message: `columna "${col}" no existe en ${s.fuente}; validas: ${[...validas].join(', ')}` });
    };
    s.columnas.forEach((c, i) => revisar(c, ['columnas', i]));
    s.filtros.forEach((f, i) => revisar(f.columna, ['filtros', i, 'columna']));
    revisar(s.orden?.columna, ['orden', 'columna']);
    revisar(s.grafico.x, ['grafico', 'x']);
    revisar(s.grafico.y, ['grafico', 'y']);
    if (s.grafico.tipo !== 'ninguno' && (!s.grafico.x || !s.grafico.y)) ctx.addIssue({ code: 'custom', path: ['grafico'], message: 'un grafico requiere x e y' });
  });

export type ReporteSpec = z.infer<typeof ReporteSpecSchema>;

export interface ReporteResultado {
  titulo: string;
  fuente: Fuente;
  generadoEn: string;
  parametros: Record<string, unknown>;
  columnas: ColumnaDef[];
  filas: Record<string, string | number | null>[];
  grafico: ReporteSpec['grafico'];
  /** Especificacion validada que produjo este reporte (permite re-ejecutarlo / exportarlo en otro formato). */
  especificacion: ReporteSpec;
  /** true si los datos provienen de modelos entrenados con datos sinteticos (se advierte en las exportaciones). */
  sintetico: boolean;
  nota?: string;
}
