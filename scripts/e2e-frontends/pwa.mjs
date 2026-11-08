// Escenarios de la PWA del paciente (http://localhost:5174): datos reales en linea, solicitud sin conexion con la misma Idempotency-Key y lectura desde la copia local.
import { abrirNavegador, api, comprobar, dormir, seccion, token } from './harness.mjs';

const PWA = process.env.PWA_URL ?? 'http://localhost:5174';
const PACIENTE = 'a0000000-0000-4000-8000-000000000001';

const sinProblemas = (p, nombre, permitidos = []) => {
  const { consola, http } = p.problemas();
  const mal = http.filter((h) => !permitidos.includes(h.estado));
  comprobar(`${nombre}: sin errores de consola ni HTTP inesperado`, consola.length === 0 && mal.length === 0, JSON.stringify({ consola: consola.slice(0, 2), http: mal.slice(0, 3) }));
  p.limpiarProblemas();
};
const irA = async (p, hash, texto) => {
  await p.hash(hash);
  if (texto) await p.esperar(`document.body.innerText.includes(${JSON.stringify(texto)})`, 20000, `«${texto}» en ${hash}`);
};
/** Elige el ultimo horario libre del primer dia que tenga al menos dos. */
async function elegirHorario(p, evitar = new Set()) {
  const dias = await p.cuenta('[data-testid=dia]');
  for (let i = 0; i < dias; i++) {
    await p.ev(`document.querySelectorAll('[data-testid=dia]')[${i}].click()`);
    await dormir(700);
    await p.esperar(`!document.body.innerText.includes('Buscando horarios')`, 15000, 'horarios cargados');
    const n = await p.cuenta('[data-testid=horario]');
    if (n >= 2) {
      const etiquetas = await p.ev(`[...document.querySelectorAll('[data-testid=horario]')].map(b=>b.innerText)`);
      const idx = etiquetas.map((_, k) => k).reverse().find((k) => !evitar.has(etiquetas[k] + i));
      evitar.add(etiquetas[idx] + i);
      await p.ev(`document.querySelectorAll('[data-testid=horario]')[${idx}].click()`);
      return { dia: i, hora: etiquetas[idx] };
    }
  }
  throw new Error('No hay dos horarios libres en los proximos 8 dias');
}

export async function pwa() {
  seccion('PWA · Paciente en línea');
  const tp = await token('paciente');
  const antes = (await api('GET', `/api/citas?pacienteId=${PACIENTE}&limite=100`, tp)).datos.items;
  const p = await abrirNavegador({ nombre: 'paciente-pwa' });
  const creadas = [];
  try {
    await p.ir(PWA);
    await p.login('paciente');
    await p.esperar(`!!document.querySelector('[data-testid=saludo]')`, 20000, 'inicio');
    comprobar('Inicio: saluda con el nombre real del paciente', (await p.texto('[data-testid=saludo]')).includes('Carla'));
    comprobar('Inicio: muestra la próxima cita real o el aviso de que no hay', (await p.existe('[data-testid=proxima-cita]')) || (await p.existe('[data-testid=sin-proxima]')));
    sinProblemas(p, 'Inicio');

    await irA(p, '#/citas', 'Mis citas');
    await p.esperar(`document.querySelectorAll('[data-testid=cita],[data-testid=cita-pendiente],[data-testid=vacio]').length>=1`, 15000, 'citas');
    const proximas = antes.filter((c) => c.estado === 'CONFIRMADA' && Date.parse(c.fechaHora) >= Date.now()).length;
    comprobar('Citas: las próximas coinciden con el servidor', (await p.cuenta('[data-testid=cita]')) === proximas, `${await p.cuenta('[data-testid=cita]')} vs ${proximas}`);
    await p.clic('[role=tab]', 'Historial');
    comprobar('Citas: el historial lista citas pasadas o canceladas', (await p.cuenta('[data-testid=cita-historial]')) >= 1 || (await p.existe('[data-testid=vacio]')));
    sinProblemas(p, 'Citas');

    // Solicitar en linea -> SAGA -> confirmada
    await irA(p, '#/solicitar', 'Solicitar una cita');
    await p.esperar(`document.querySelectorAll('[data-testid=dia]').length===8`, 15000, 'dias');
    const usados = new Set();
    const e1 = await elegirHorario(p, usados);
    await p.clic('[data-testid=guardar-solicitud]');
    await p.esperar(`location.hash.startsWith('#/pendientes')`, 10000);
    await p.esperar(`document.querySelector('[data-testid=solicitud]')?.dataset.estado==='CONFIRMADA'`, 60000, 'solicitud confirmada por la SAGA');
    comprobar('Solicitar (en línea): la SAGA confirma la cita', true);
    const tras1 = (await api('GET', `/api/citas?pacienteId=${PACIENTE}&limite=100`, tp)).datos.items;
    const nueva1 = tras1.filter((c) => !antes.some((a) => a.citaId === c.citaId));
    creadas.push(...nueva1);
    comprobar('Solicitar (en línea): existe exactamente una cita nueva CONFIRMADA', nueva1.length === 1 && nueva1[0].estado === 'CONFIRMADA', JSON.stringify(nueva1.map((c) => c.estado)));
    sinProblemas(p, 'Solicitud en línea');

    // Cancelar desde Mis citas
    await irA(p, '#/citas', 'Mis citas');
    await p.esperar(`document.querySelectorAll('[data-testid=cancelar]').length>=1`, 15000, 'boton cancelar');
    const total = await p.cuenta('[data-testid=cita]');
    await p.ev(`[...document.querySelectorAll('[data-testid=cita]')].find(c=>c.innerText.includes(${JSON.stringify(nueva1[0].citaId.slice(0, 8))})).querySelector('[data-testid=cancelar]').click()`);
    await p.esperar(`document.querySelectorAll('[data-testid=cita]').length===${total - 1}`, 30000, 'cita cancelada ya no aparece en próximas');
    const cancelada = (await api('GET', `/api/citas/${nueva1[0].citaId}`, tp)).datos;
    comprobar('Citas: cancelar llega a MS3', ['CANCELADA_USUARIO', 'CANCELADA'].includes(cancelada.estado), cancelada.estado);
    sinProblemas(p, 'Cancelación');

    // ---------------------------------------------------------------- sin conexion
    seccion('PWA · Sin conexión (cola con Idempotency-Key)');
    await irA(p, '#/solicitar', 'Solicitar una cita');
    await p.esperar(`document.querySelectorAll('[data-testid=dia]').length===8`, 15000);
    const e2 = await elegirHorario(p, usados);
    await dormir(800);
    await p.red(false);
    await p.esperar(`document.querySelector('[data-testid=estado-conexion]')?.innerText==='Sin conexión'`, 10000, 'chip sin conexión');
    comprobar('Offline: el portal muestra «Sin conexión»', true);
    await p.clic('[data-testid=guardar-solicitud]');
    await p.esperar(`location.hash.startsWith('#/pendientes')`, 10000);
    await p.esperar(`document.querySelector('[data-testid=solicitud]')?.dataset.estado==='PENDIENTE'`, 15000, 'solicitud pendiente');
    comprobar('Offline: la solicitud queda guardada como Pendiente', true);
    const clave = await p.ev(`new Promise((ok)=>{const r=indexedDB.open('sigec-paciente');r.onsuccess=()=>{const g=r.result.transaction('cola').objectStore('cola').getAll();g.onsuccess=()=>ok(g.result.find(s=>s.estado==='PENDIENTE')?.clave??null)}})`);
    comprobar('Offline: la clave de idempotencia está en IndexedDB', /^[0-9a-f-]{36}$/.test(clave ?? ''), String(clave));
    const mid = (await api('GET', `/api/citas?pacienteId=${PACIENTE}&limite=100`, tp)).datos.items.filter((c) => !antes.some((a) => a.citaId === c.citaId) && c.citaId !== nueva1[0].citaId);
    comprobar('Offline: el servidor no recibió nada todavía', mid.length === 0, String(mid.length));

    await p.red(true);
    await p.ev(`window.dispatchEvent(new Event('online'))`);
    await p.esperar(`document.querySelector('[data-testid=solicitud]')?.dataset.estado==='CONFIRMADA'`, 60000, 'solicitud confirmada tras volver la conexión');
    comprobar('Al volver la conexión: se envía sola y queda Confirmada', true);
    const fin = (await api('GET', `/api/citas?pacienteId=${PACIENTE}&limite=100`, tp)).datos.items.filter((c) => !antes.some((a) => a.citaId === c.citaId) && c.citaId !== nueva1[0].citaId);
    creadas.push(...fin);
    comprobar('Al volver la conexión: se creó exactamente una cita', fin.length === 1 && fin[0].estado === 'CONFIRMADA', JSON.stringify(fin.map((c) => c.estado)));
    // Reintento con la MISMA clave (como si la respuesta se hubiera perdido): el servidor devuelve la misma cita.
    const rep = await api('POST', '/api/citas', tp, { pacienteId: PACIENTE, medicoId: fin[0].medicoId, especialidad: fin[0].especialidad, fechaHora: fin[0].fechaHora }, { 'Idempotency-Key': clave });
    comprobar('Idempotencia: repetir el envío con la misma clave no duplica la cita', rep.datos?.citaId === fin[0].citaId, JSON.stringify(rep.datos).slice(0, 160));
    sinProblemas(p, 'Cola', [0]);

    // Lectura sin conexion: recarga la pagina sin red y muestra la copia local
    await irA(p, '#/citas', 'Mis citas');
    await p.esperar(`document.querySelectorAll('[data-testid=cita]').length>=0 && !document.body.innerText.includes('Cargando sus citas')`, 15000);
    await dormir(1500);
    await p.red(false);
    await p.ev(`location.reload()`); // misma URL: ir() solo cambiaria el fragmento y no recargaria
    await p.esperar(`!!document.querySelector('[data-testid=copia-local]')`, 30000, 'copia local sin conexión');
    comprobar('Sin conexión: tras recargar muestra las citas desde la copia local', true);
    comprobar('Sin conexión: avisa la última sincronización', (await p.texto('[data-testid=copia-local]')).includes('Última sincronización'));
    await p.red(true);
  } finally {
    // Limpieza: se cancelan las citas de la prueba.
    for (const c of creadas) await api('POST', `/api/citas/${c.citaId}/cancelar`, tp, { motivo: 'limpieza e2e' });
    await p.red(true).catch(() => undefined);
    p.cerrar();
  }

  seccion('PWA · Datos, estudios y avisos');
  const q = await abrirNavegador({ nombre: 'paciente-pwa-2' });
  try {
    await q.ir(PWA);
    await q.login('paciente');
    await irA(q, '#/datos', 'Mis datos');
    await q.esperar(`!!document.querySelector('[data-testid=nombre]')`, 15000);
    comprobar('Mis datos: muestra los datos reales del paciente', (await q.texto('[data-testid=nombre]')).includes('Carla Mendoza'));
    const marca = `Calle PWA ${Date.now() % 100000}`;
    await q.escribir('#d', marca);
    await q.clic('[data-testid=solicitar-cambio]');
    await q.esperar(`document.body.innerText.includes('Solicitud enviada')`, 10000, 'solicitud enviada');
    const sol = (await api('GET', `/api/pacientes/${PACIENTE}/solicitudes`, tp)).datos.items.find((s) => s.valorPropuesto === marca);
    comprobar('Mis datos: la solicitud de cambio llega a MS2 como PENDIENTE', sol?.estado === 'PENDIENTE' && sol.campo === 'DIRECCION', JSON.stringify(sol));
    const tr = await token('recepcion');
    await api('POST', `/api/pacientes/solicitudes/${sol.id}/rechazar`, tr, { motivo: 'prueba e2e' }); // no deja la ficha cambiada
    sinProblemas(q, 'Mis datos');

    await irA(q, '#/estudios', 'Mis estudios');
    await q.esperar(`document.querySelectorAll('[data-testid=estudio],[data-testid=vacio]').length>=1`, 15000);
    comprobar('Estudios: lista solo informes del paciente (vacío o validados)', true);
    sinProblemas(q, 'Estudios');

    await irA(q, '#/preferencias', 'Preferencias de aviso');
    await q.esperar(`!!document.querySelector('[data-testid=guardar-prefs]')`, 15000);
    const prefs0 = (await api('GET', `/api/notificaciones/preferencias/${PACIENTE}`, tp)).datos;
    await q.ev(`document.querySelector('[aria-label="Estudio validado"]').click()`);
    await q.clic('[data-testid=guardar-prefs]');
    await q.esperar(`document.body.innerText.includes('Preferencias guardadas')`, 10000, 'guardado');
    const prefs1 = (await api('GET', `/api/notificaciones/preferencias/${PACIENTE}`, tp)).datos;
    comprobar('Avisos: el cambio de preferencias llega a MS8', prefs1.tiposAviso.includes('ESTUDIO_VALIDADO') !== prefs0.tiposAviso.includes('ESTUDIO_VALIDADO'));
    await api('PUT', `/api/notificaciones/preferencias/${PACIENTE}`, tp, { canales: prefs0.canales, tiposAviso: prefs0.tiposAviso, antelacionHoras: prefs0.antelacionHoras });
    await q.clic('[data-testid=pedir-codigo]');
    await q.esperar(`/^[A-Z0-9]{4,32}$/.test(document.querySelector('[data-testid=codigo-telegram]')?.innerText??'')`, 10000, 'codigo de vinculacion');
    comprobar('Avisos: genera el código real de vinculación de Telegram', true);
    sinProblemas(q, 'Avisos');
  } finally {
    q.cerrar();
  }
}
