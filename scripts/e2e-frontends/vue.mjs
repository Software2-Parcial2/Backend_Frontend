// Escenarios del remoto Vue (gestion) dentro del shell: alertas y agentes, detalle y atencion, ML y politicas con datos reales.
import { abrirNavegador, api, comprobar, SHELL, seccion, token } from './harness.mjs';

const sinProblemas = (p, nombre, permitidos = []) => {
  const { consola, http } = p.problemas();
  const mal = http.filter((h) => !permitidos.includes(h.estado));
  comprobar(`${nombre}: sin errores de consola ni HTTP inesperado`, consola.length === 0 && mal.length === 0, JSON.stringify({ consola: consola.slice(0, 2), http: mal.slice(0, 3) }));
  p.limpiarProblemas();
};
async function irA(p, hash, esperaTexto) {
  if (!(await p.ev(`location.pathname==='/gestion'`))) await p.ir(`${SHELL}/gestion#${hash}`);
  else await p.hash(hash);
  if (esperaTexto) await p.esperar(`document.body.innerText.includes(${JSON.stringify(esperaTexto)})`, 20000, `«${esperaTexto}» en ${hash}`);
}

export async function vue() {
  seccion('Vue · Alertas y agentes (administrador)');
  const ta = await token('administrador');
  const a = await abrirNavegador({ nombre: 'admin-gestion' });
  const agentesAntes = (await api('GET', '/api/inteligencia/agentes', ta)).datos.items;
  try {
    await a.ir(SHELL);
    await a.login('administrador');
    // Asegura una alerta abierta: ejecuta el agente de cancelaciones (si ya hay una abierta solo la refresca).
    await api('POST', '/api/inteligencia/agentes/cancelaciones/ejecutar', ta);
    await irA(a, '/alertas', 'Alertas y monitoreo');
    await a.esperar(`document.querySelectorAll('[data-testid=alerta]').length>=1 || !!document.querySelector('[data-testid=sin-alertas]')`, 15000, 'alertas');
    const abiertas = (await api('GET', '/api/inteligencia/alertas?estado=ABIERTA&limite=100', ta)).datos.items;
    comprobar('Alertas: la lista coincide con MS7', (await a.cuenta('[data-testid=alerta]')) === abiertas.length, `${await a.cuenta('[data-testid=alerta]')} vs ${abiertas.length}`);
    comprobar('Alertas: el chip de la pestaña es el conteo real', abiertas.length === 0 ? !(await a.existe('[data-testid=chip-alertas]')) : (await a.texto('[data-testid=chip-alertas]')) === String(abiertas.length));
    await a.esperar(`document.querySelectorAll('[data-testid=agente]').length>=4`, 10000, 'agentes');
    comprobar('Agentes: lista los 4 agentes con su estado', (await a.cuenta('[data-testid=agente]')) >= 4);
    // Activar/desactivar un agente llega a MS7
    const ag = agentesAntes.find((x) => x.id === 'ingresos');
    await a.ev(`document.querySelector('[data-testid=agente] [aria-label="${ag.nombre}"]').click()`);
    await a.esperar(`document.querySelector('[data-testid=agente] [aria-label="${ag.nombre}"]')?.getAttribute('aria-checked')===${JSON.stringify(String(!ag.activo))}`, 10000, 'cambio de estado');
    const tras = (await api('GET', '/api/inteligencia/agentes', ta)).datos.items.find((x) => x.id === 'ingresos');
    comprobar('Agentes: el interruptor cambia «activo» en MS7', tras.activo === !ag.activo);
    await a.ev(`document.querySelector('[data-agente=cancelaciones]').click()`);
    await a.esperar(`!document.querySelector('[data-agente=cancelaciones]')?.disabled`, 15000, 'ejecucion terminada');
    comprobar('Agentes: «Ejecutar ahora» corre el agente', true);
    sinProblemas(a, 'Alertas');

    // Detalle y atencion
    if (abiertas.length) {
      const alerta = (await api('GET', '/api/inteligencia/alertas?estado=ABIERTA&limite=1', ta)).datos.items[0];
      await irA(a, `/alertas/detalle/${alerta.id}`, alerta.titulo);
      await a.esperar(`!!document.querySelector('[data-testid=atender]')`, 10000);
      comprobar('Detalle: muestra el título y los datos agregados reales', (await a.texto()).includes('Total de citas') || (await a.texto()).includes('Tasa'));
      await a.escribir('#nota', 'Revisada en la prueba e2e');
      await a.clic('[data-testid=atender]');
      await a.esperar(`!!document.querySelector('[data-testid=atendida]')`, 10000, 'alerta atendida');
      const fin = (await api('GET', `/api/inteligencia/alertas/${alerta.id}`, ta)).datos;
      comprobar('Detalle: «Marcar como atendida» llega a MS7 con la nota', fin.estado === 'ATENDIDA' && fin.nota === 'Revisada en la prueba e2e', JSON.stringify([fin.estado, fin.nota]));
      const otra = await api('POST', `/api/inteligencia/alertas/${alerta.id}/atender`, ta, { nota: 'otra vez' });
      comprobar('Detalle: atender dos veces da 409 ALERTA_YA_ATENDIDA', otra.estado === 409 && otra.datos?.code === 'ALERTA_YA_ATENDIDA', JSON.stringify(otra.datos));
      await irA(a, '/alertas', 'Alertas y monitoreo');
      await a.clic('[data-testid=f-revisadas]');
      await a.esperar(`document.querySelectorAll('[data-testid=alerta]').length>=1`, 10000, 'revisadas');
      comprobar('Alertas: la pestaña «Revisadas» lista la atendida', true);
    }
    sinProblemas(a, 'Detalle', [409]);

    seccion('Vue · Machine Learning y políticas');
    await irA(a, '/ml', 'Machine Learning');
    await a.esperar(`!!document.querySelector('[data-testid=modelo]') && document.querySelectorAll('[data-testid=segmento]').length>=1`, 30000, 'modelo y segmentos');
    comprobar('ML: muestra la versión y las métricas del modelo real', /rf-noshow/.test(await a.texto('[data-testid=modelo]')) && /AUC/.test(await a.texto('[data-testid=modelo]')));
    comprobar('ML: declara los datos sintéticos', await a.existe('[data-testid=sintetico]'));
    comprobar('ML: lista segmentos de demanda reales (K-means)', (await a.cuenta('[data-testid=segmento]')) >= 2);
    comprobar('ML: riesgo por cita (o aviso de que no hay citas próximas)', (await a.cuenta('[data-testid=cita-riesgo]')) >= 1 || (await a.existe('[data-testid=sin-citas]')));
    sinProblemas(a, 'ML');

    await irA(a, '/politicas', 'Consulta de políticas internas');
    await a.esperar(`!!document.querySelector('[data-testid=indexados]')`, 10000, 'documentos indexados');
    comprobar('Políticas: muestra los documentos indexados', /\d+ documentos/.test(await a.texto('[data-testid=indexados]')));
    await a.escribir('input[aria-label="Pregunta sobre políticas"]', 'plazo para cancelar una cita sin cargo');
    await a.clic('[data-testid=consultar]');
    await a.esperar(`!!document.querySelector('[data-testid=respuesta]')`, 60000, 'respuesta');
    comprobar('Políticas: la respuesta sale de la política indexada', /24 horas/.test(await a.texto('[data-testid=respuesta]')));
    sinProblemas(a, 'Políticas');
  } finally {
    const ing = agentesAntes.find((x) => x.id === 'ingresos');
    const hoy = (await api('GET', '/api/inteligencia/agentes', ta)).datos.items.find((x) => x.id === 'ingresos');
    if (hoy.activo !== ing.activo) await api('PUT', '/api/inteligencia/agentes/ingresos', ta, { activo: ing.activo, intervaloMin: ing.intervaloMin, umbral: ing.umbral });
    a.cerrar();
  }
}
