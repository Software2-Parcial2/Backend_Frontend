import type { ReporteResultado } from './api'

/** Opcion de ECharts a partir de un reporte (sin interpretar nada del servidor: solo columnas y filas ya validadas). */
/** Paleta del diseno SIGEC (packages/design-tokens): ECharts no lee variables CSS. */
export const PALETA = ['#0B6572', '#35A9B8', '#87490A', '#2C4C8A', '#1B6E46', '#A5251C']
const TEXTO = { color: '#41535D', fontFamily: "'Public Sans', system-ui, sans-serif" }

export function opcionGrafico(r: Pick<ReporteResultado, 'filas' | 'grafico' | 'columnas'>): Record<string, unknown> | null {
  const { tipo, x, y } = r.grafico
  if (tipo === 'ninguno' || !x || !y || r.filas.length === 0) return null
  const titulo = r.columnas.find((c) => c.clave === y)?.titulo ?? y
  const categorias = r.filas.map((f) => String(f[x] ?? ''))
  const valores = r.filas.map((f) => Number(f[y] ?? 0))
  if (tipo === 'torta') {
    return { color: PALETA, textStyle: TEXTO, tooltip: { trigger: 'item' }, legend: { type: 'scroll', bottom: 0 }, series: [{ name: titulo, type: 'pie', radius: ['35%', '65%'], data: categorias.map((name, i) => ({ name, value: valores[i] })) }] }
  }
  return {
    color: PALETA,
    textStyle: TEXTO,
    tooltip: { trigger: 'axis' },
    grid: { left: 48, right: 16, top: 24, bottom: 56 },
    xAxis: { type: 'category', data: categorias, axisLabel: { rotate: categorias.length > 6 ? 30 : 0 } },
    yAxis: { type: 'value', name: titulo },
    series: [{ name: titulo, type: tipo === 'lineas' ? 'line' : 'bar', data: valores, smooth: tipo === 'lineas' }],
  }
}

export function formatearCelda(v: string | number | null, tipo: ReporteResultado['columnas'][number]['tipo']): string {
  if (v === null || v === undefined) return '—'
  if (tipo === 'porcentaje' && typeof v === 'number') return `${(v * 100).toFixed(1)} %`
  if (tipo === 'moneda' && typeof v === 'number') return v.toLocaleString('es-BO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  if (tipo === 'numero' && typeof v === 'number') return v.toLocaleString('es-BO', { maximumFractionDigits: 2 })
  return String(v)
}
