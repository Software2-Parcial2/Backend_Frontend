import type { LlamadaHerramienta, LlmPort, MensajeAgente, RespuestaLlm } from '../../application/agente/ports.js';

/**
 * Proveedor SIMULADO y determinista (LLM_PROVIDER=simulated): elige herramientas por palabras clave y redacta la respuesta con los datos.
 * Sirve para desarrollo, pruebas E2E y demos sin gastar API. NO es un modelo de lenguaje.
 */
export class SimuladoLlm implements LlmPort {
  readonly proveedor = 'simulado';
  readonly modelo = 'reglas-por-palabras-clave';

  async generar(e: { mensajes: MensajeAgente[] }): Promise<RespuestaLlm> {
    const ultimo = e.mensajes[e.mensajes.length - 1];
    if (ultimo?.rol === 'herramientas') return { texto: redactar(ultimo.resultados), llamadas: [] };
    const q = (e.mensajes.find((m) => m.rol === 'usuario') as { texto: string } | undefined)?.texto.toLowerCase() ?? '';
    const llamada = elegir(q);
    return llamada ? { llamadas: [llamada] } : { texto: '(simulado) No reconoci la consulta. Prueba con citas, ingresos, demanda, inasistencia, politicas o reporte.', llamadas: [] };
  }
}

const hoy = () => new Date().toISOString().slice(0, 10);
const haceDias = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);
let n = 0;
const id = () => `sim_${++n}`;

function elegir(q: string): LlamadaHerramienta | null {
  const fuente = /ingres/.test(q) ? 'ingresos' : /demanda|especialidad/.test(q) ? 'demanda' : /inasisten|riesgo|no-show/.test(q) ? 'riesgo_inasistencia' : 'resumen_citas';
  if (/report|excel|xlsx|csv|pdf/.test(q)) {
    const cols = { ingresos: ['periodo', 'confirmado', 'provisional', 'facturas'], demanda: ['especialidad', 'etiqueta', 'citasPorSemana', 'citasTotal'],
      riesgo_inasistencia: ['citaId', 'especialidad', 'fechaHora', 'probabilidad', 'riesgo'], resumen_citas: ['clave', 'total', 'confirmadas', 'canceladas'] }[fuente];
    const x = cols[0]!, y = fuente === 'ingresos' ? 'confirmado' : fuente === 'demanda' ? 'citasPorSemana' : fuente === 'riesgo_inasistencia' ? 'probabilidad' : 'total';
    return { id: id(), nombre: 'generar_reporte', argumentos: { especificacion: { titulo: `Reporte de ${fuente.replace('_', ' ')}`, fuente, parametros: { desde: haceDias(180), hasta: hoy() }, columnas: cols, grafico: { tipo: 'barras', x, y } } } };
  }
  if (/ingres/.test(q)) return { id: id(), nombre: 'consultar_ingresos', argumentos: { desde: haceDias(180), hasta: hoy(), agrupar: 'mes' } };
  if (/inasisten|riesgo|no-show/.test(q)) return { id: id(), nombre: 'consultar_prediccion_inasistencia', argumentos: { dias: 7, limite: 10 } };
  if (/demanda/.test(q)) return { id: id(), nombre: 'consultar_demanda_especialidades', argumentos: {} };
  if (/politic|cancel|reprogram|arancel|precio|horario|protocolo|datos personales/.test(q)) return { id: id(), nombre: 'consultar_politicas', argumentos: { pregunta: q.slice(0, 300) } };
  if (/cita|resumen/.test(q)) return { id: id(), nombre: 'obtener_resumen_citas', argumentos: { desde: haceDias(90), hasta: hoy(), agruparPor: /medico/.test(q) ? 'MEDICO' : /estado/.test(q) ? 'ESTADO' : 'ESPECIALIDAD' } };
  return null;
}

function redactar(resultados: { nombre: string; contenido: string; error?: boolean }[]): string {
  return (
    '(simulado) ' +
    resultados
      .map((r) => {
        const cuerpo = /<datos_herramienta[^>]*>\n([\s\S]*?)\n<\/datos_herramienta>/.exec(r.contenido)?.[1] ?? '';
        if (r.error) return `La herramienta ${r.nombre} devolvio un error: ${cuerpo.slice(0, 200)}`;
        if (r.nombre === 'consultar_politicas') {
          try {
            const j = JSON.parse(cuerpo) as { fragmentos?: { fuente_titulo: string; seccion: string; texto: string }[] };
            if (!j.fragmentos?.length) return 'No hay informacion suficiente en los documentos para responder.';
            const f = j.fragmentos[0]!;
            return `Segun "${f.fuente_titulo}", seccion "${f.seccion}": ${f.texto.slice(0, 300)}`;
          } catch { /* cae al formato generico */ }
        }
        return `${r.nombre}: ${cuerpo.slice(0, 400)}`;
      })
      .join('\n')
  );
}
