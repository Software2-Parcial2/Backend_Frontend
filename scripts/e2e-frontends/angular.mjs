// Escenarios del remoto Angular (clinica) dentro del shell: cada modulo con datos reales del gateway.
import { abrirNavegador, api, comprobar, dormir, SHELL, seccion, token } from './harness.mjs';

const sinProblemas = (p, nombre, permitidos = []) => {
  const { consola, http } = p.problemas();
  const mal = http.filter((h) => !permitidos.includes(h.estado));
  comprobar(`${nombre}: sin errores de consola ni HTTP inesperado`, consola.length === 0 && mal.length === 0, JSON.stringify({ consola: consola.slice(0, 2), http: mal.slice(0, 3) }));
  p.limpiarProblemas();
};
/** Va a una ruta del remoto (hash) y espera a que pinte el titulo. */
async function irA(p, hash, esperaTexto) {
  if (!(await p.ev(`location.pathname==='/clinica'`))) {
    await p.ir(`${SHELL}/clinica#${hash}`);
  } else {
    await p.hash(hash);
  }
  if (esperaTexto) await p.esperar(`document.body.innerText.includes(${JSON.stringify(esperaTexto)})`, 20000, `«${esperaTexto}» en ${hash}`);
}
const filas = (p, sel) => p.cuenta(sel);

async function pacientes() {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const P_DEMO = 'a0000000-0000-4000-8000-000000000001';

  // ============================================================ recepcion: pacientes (MS2)
  seccion('Angular · Pacientes (recepcion)');
  const r = await abrirNavegador({ nombre: 'recepcion' });
  try {
    await r.ir(SHELL);
    await r.login('recepcion');
    await irA(r, '/pacientes', 'Registrar paciente');
    await r.esperar(`document.querySelectorAll('[data-testid=fila-paciente]').length>=6`, 20000, 'lista de pacientes');
    comprobar('Pacientes: lista los pacientes sembrados con N.° de historia', (await r.texto('[data-testid=fila-paciente]')).includes('HC-'));
    comprobar('Pacientes: ya no muestra los datos de ejemplo del diseno', !(await r.texto()).includes('Carlota Rojas Vaca'));
    await r.escribir('input[aria-label="Buscar paciente"]', 'Rohas');
    await r.esperar(`[...document.querySelectorAll('[data-testid=fila-paciente]')].every(f=>/Rojas/i.test(f.innerText)) && document.querySelectorAll('[data-testid=fila-paciente]').length>=1`, 10000, 'busqueda fonetica');
    comprobar('Pacientes: la busqueda fonetica del servidor encuentra «Rojas» al escribir «Rohas»', true);
    await r.clic('.seg button', 'Documento');
    await r.escribir('input[aria-label="Buscar paciente"]', 'SEED-P001');
    await r.esperar(`document.querySelectorAll('[data-testid=fila-paciente]').length===1`, 10000, 'busqueda por documento');
    comprobar('Pacientes: busqueda por documento exacto', (await r.texto('[data-testid=fila-paciente]')).includes('SEED-P001'));
    await r.escribir('input[aria-label="Buscar paciente"]', 'zzzz-no-existe');
    await r.esperar(`!!document.querySelector('[data-testid=vacio]')`, 10000, 'vacio');
    comprobar('Pacientes: sin resultados muestra el estado vacio con la accion de registrar', (await r.texto('[data-testid=vacio]')).includes('Registrar paciente'));
    sinProblemas(r, 'Lista de pacientes');

    // Ficha del paciente demo
    await irA(r, `/pacientes/ficha?id=${P_DEMO}`, 'Datos personales y de contacto');
    await r.esperar(`document.querySelector('h1')?.innerText.includes('Carla')`, 15000, 'ficha');
    comprobar('Ficha: nombre, historia y datos reales del paciente', (await r.texto()).includes('HC-000010') && (await r.texto()).includes('SEED-P001'));
    comprobar('Ficha: lista las citas del paciente con su medico', await r.intentar(`document.querySelectorAll('[data-testid=cita-paciente]').length>=1`, 10000));
    await r.clic('button', 'Agregar');
    await r.esperar(`!!document.querySelector('#cn')`, 5000);
    await r.escribir('#cn', `Contacto ${sufijo}`);
    await r.escribir('#cp', 'Hermano/a');
    await r.escribir('#ct', '70011223');
    await r.clic('form button[type=submit]');
    await r.esperar(`[...document.querySelectorAll('[data-testid=contacto]')].some(c=>c.innerText.includes(${JSON.stringify('Contacto ' + sufijo)}))`, 10000, 'contacto agregado');
    comprobar('Ficha: agrega un contacto de emergencia (MS2)', true);
    await r.ev(`[...document.querySelectorAll('[data-testid=contacto]')].find(c=>c.innerText.includes(${JSON.stringify('Contacto ' + sufijo)})).querySelector('button').click()`);
    await r.esperar(`![...document.querySelectorAll('[data-testid=contacto]')].some(c=>c.innerText.includes(${JSON.stringify('Contacto ' + sufijo)}))`, 10000, 'contacto quitado');
    comprobar('Ficha: quita el contacto', true);
    sinProblemas(r, 'Ficha del paciente');

    // Registrar un paciente nuevo
    const doc = `E2E-UI-${sufijo}`;
    await irA(r, '/pacientes/nuevo', 'Datos personales');
    await r.esperar(`!!document.querySelector('#nom')`, 10000);
    await r.clic('button[type=submit]');
    await dormir(400);
    comprobar('Nuevo paciente: sin llenar, marca los datos obligatorios', (await r.cuenta('[role=alert]')) >= 2);
    await r.escribir('#nom', `Paciente Prueba ${sufijo}`);
    await r.escribir('#doc', doc);
    await r.escribir('#fn', '1995-07-21');
    await r.escribir('#sx', 'F');
    await r.escribir('#tel', '71234567');
    await r.escribir('#co', `p.${sufijo}@sigec.test`);
    await r.escribir('#ce', 'Madre de prueba');
    await r.escribir('#ct', '70099887');
    const clave = await r.texto('[data-testid=clave]');
    comprobar('Nuevo paciente: muestra la Idempotency-Key real (UUID)', /^[0-9a-f-]{36}$/.test(clave.trim()), clave);
    await r.clic('button[type=submit]');
    await r.esperar(`location.hash.includes('/pacientes/guardado')`, 15000, 'guardado');
    await r.esperar(`document.body.innerText.includes('Paciente registrado')`, 15000);
    const guardado = await r.texto();
    comprobar('Guardado: confirma con nombre y N.° de historia reales', guardado.includes(`Paciente Prueba ${sufijo}`) && /HC-\d{6}/.test(guardado));
    comprobar('Guardado: muestra la misma clave de idempotencia que se envio', guardado.includes(clave.trim()));
    const tk = await token('recepcion');
    const creado = (await api('GET', `/api/pacientes?q=${doc}&tipo=documento`, tk)).datos?.items?.[0];
    comprobar('Guardado: el paciente existe en MS2 y su contacto de emergencia tambien', !!creado && (await api('GET', `/api/pacientes/${creado.id}/contactos`, tk)).datos?.items?.length === 1);
    sinProblemas(r, 'Registro de paciente');

    // Documento repetido -> 409 mostrado en el formulario
    await irA(r, '/pacientes/nuevo', 'Datos personales');
    await r.esperar(`!!document.querySelector('#nom')`, 10000);
    await r.escribir('#nom', 'Otro Paciente');
    await r.escribir('#doc', doc);
    await r.escribir('#fn', '1990-01-02');
    await r.esperar(`document.body.innerText.includes('Ya existe un paciente con este documento')`, 8000, 'aviso de documento repetido');
    comprobar('Nuevo paciente: avisa del documento repetido mientras se escribe', true);
    r.limpiarProblemas();
    await r.clic('button[type=submit]');
    await r.esperar(`document.querySelectorAll('.banner.err').length>0`, 10000, 'error 409');
    comprobar('Nuevo paciente: el servidor rechaza el duplicado (409) y la pantalla lo explica', (await r.texto('.banner.err')).match(/Ya existe|duplic/i) !== null);
    sinProblemas(r, 'Documento repetido', [409]);

    // Editar
    if (creado) {
      await irA(r, `/pacientes/nuevo?id=${creado.id}`, 'Editar paciente');
      await r.esperar(`document.querySelector('#tel')?.value==='71234567'`, 10000, 'formulario de edicion cargado');
      comprobar('Editar: el documento no se puede cambiar', await r.ev(`document.querySelector('#doc').disabled`));
      await r.escribir('#tel', '72223334');
      await r.clic('button[type=submit]');
      await r.esperar(`location.hash.includes('/pacientes/ficha')`, 15000, 'volver a la ficha');
      const tras = (await api('GET', `/api/pacientes/${creado.id}`, tk)).datos;
      comprobar('Editar: guarda con If-Match y sube la version', tras?.telefono === '72223334' && tras?.version === 1);
      sinProblemas(r, 'Edicion');
    }

    // Solicitudes de actualizacion: las pide el paciente por API, las resuelve recepcion en la pantalla
    const tp = await token('paciente');
    const s1 = await api('POST', `/api/pacientes/${P_DEMO}/solicitudes`, tp, { campo: 'TELEFONO', valorPropuesto: `7${Math.floor(1e7 + Math.random() * 8e6)}` });
    const s2 = await api('POST', `/api/pacientes/${P_DEMO}/solicitudes`, tp, { campo: 'DIRECCION', valorPropuesto: `Calle E2E ${sufijo}` });
    comprobar('Preparacion: el paciente crea dos solicitudes (API)', s1.estado === 201 && s2.estado === 201, `${s1.estado} ${s2.estado}`);
    await irA(r, '/pacientes/solicitudes', 'Solicitudes de actualización');
    await r.esperar(`document.querySelectorAll('[data-testid=fila-solicitud]').length>=2`, 15000, 'solicitudes');
    comprobar('Solicitudes: lista las pendientes con el dato propuesto', (await r.texto()).includes(s2.datos?.valorPropuesto ?? '???'));
    await r.ev(`[...document.querySelectorAll('[data-testid=fila-solicitud]')].find(f=>f.innerText.includes(${JSON.stringify(s2.datos?.valorPropuesto ?? '')})).querySelector('button.pri').click()`);
    await r.esperar(`[...document.querySelectorAll('[data-testid=fila-solicitud]')].some(f=>f.innerText.includes('Aprobada'))`, 10000, 'aprobada');
    const pdemo = (await api('GET', `/api/pacientes/${P_DEMO}`, tk)).datos;
    comprobar('Solicitudes: aprobar aplica el cambio en el paciente (MS2)', pdemo?.direccion === s2.datos?.valorPropuesto, String(pdemo?.direccion));
    await r.ev(`[...document.querySelectorAll('[data-testid=fila-solicitud]')].find(f=>f.innerText.includes(${JSON.stringify(s1.datos?.valorPropuesto ?? '')})).querySelector('button:not(.pri)').click()`);
    await r.esperar(`!!document.querySelector('input[aria-label="Motivo del rechazo"]')`, 5000);
    await r.escribir('input[aria-label="Motivo del rechazo"]', 'No coincide con el documento');
    await r.clic('button', 'Confirmar rechazo');
    await r.esperar(`[...document.querySelectorAll('[data-testid=fila-solicitud]')].some(f=>f.innerText.includes('Rechazada'))`, 10000, 'rechazada');
    comprobar('Solicitudes: rechazar con motivo', true);
    sinProblemas(r, 'Solicitudes');
  } finally {
    r.cerrar();
  }
}

// ============================================================ citas y agenda (MS3)
async function citas() {
  const P = 'a0000000-0000-4000-8000-000000000002'; // paciente sembrado
  const SOLIZ = 'd0000000-0000-4000-8000-000000000001'; // medico general (usuario Keycloak `medico`)
  const tk = await token('recepcion');
  // La semilla solo publica dias habiles: se buscan los dias con horarios libres de Soliz en los proximos 8 dias.
  const local = (iso) => new Date(Date.parse(iso) - 4 * 3600e3).toISOString().slice(0, 10);
  const hoyLocal = local(new Date().toISOString());
  const desdeISO = `${hoyLocal}T04:00:00.000Z`;
  const hastaISO = new Date(Date.parse(desdeISO) + 9 * 86_400_000).toISOString();
  // Se garantiza que el medico tenga plantilla semanal (lun-vie 08:00-12:00) y horarios publicados: las corridas repetidas consumen turnos.
  const ta0 = await token('administrador');
  const plantilla = (await api('GET', `/api/citas/medicos/${SOLIZ}/horario`, ta0)).datos;
  if (!plantilla?.dias?.some((d) => d.atiende)) {
    await api('PUT', `/api/citas/medicos/${SOLIZ}/horario`, ta0, { duracionMin: 30, dias: [1, 2, 3, 4, 5].map((dia) => ({ dia, atiende: true, desde: '08:00', hasta: '12:00' })) });
  }
  await api('POST', `/api/citas/medicos/${SOLIZ}/horario/generar`, ta0, { desde: hoyLocal, hasta: local(hastaISO) });
  const libres = ((await api('GET', `/api/citas/disponibilidad?medicoId=${SOLIZ}&desde=${desdeISO}&hasta=${hastaISO}&limite=100`, tk)).datos?.items ?? []).filter((x) => x.estado === 'LIBRE' && Date.parse(x.fechaHora) > Date.now() + 3600e3);
  const porDia = new Map();
  for (const x of libres) porDia.set(local(x.fechaHora), [...(porDia.get(local(x.fechaHora)) ?? []), x]);
  const diasLibres = [...porDia.entries()].filter(([, v]) => v.length >= 1).map(([d]) => d);
  const diaA = diasLibres[0];
  const diaB = diasLibres[1] ?? diasLibres[0];
  const indiceDia = (d) => Math.round((Date.parse(d) - Date.parse(hoyLocal)) / 86_400_000);
  comprobar('Preparacion: hay dias con horarios libres para el medico', !!diaA, JSON.stringify(diasLibres));

  seccion('Angular · Citas y agenda (recepcion)');
  const r = await abrirNavegador({ nombre: 'recepcion-citas' });
  let citaId = '';
  try {
    await r.ir(SHELL);
    await r.login('recepcion');

    // Agenda general: hoy no hay horarios publicados -> estado vacio; mañana si hay.
    await irA(r, '/agenda', 'Agenda general');
    await r.esperar(`!!document.querySelector('[data-testid=rejilla]') || !!document.querySelector('[data-testid=vacio]')`, 15000, 'agenda cargada');
    for (let i = 0; i < 8 && !(await r.existe('[data-testid=rejilla]')); i++) {
      await r.clic('button[aria-label="Día siguiente"]');
      await r.intentar(`!!document.querySelector('[data-testid=rejilla]')`, 2500);
    }
    await r.esperar(`!!document.querySelector('[data-testid=rejilla]')`, 15000, 'rejilla de un dia con horarios');
    comprobar('Agenda: muestra una columna por medico con horarios libres reales', (await r.cuenta('[data-testid=celda-libre]')) > 0 && (await r.texto('[data-testid=rejilla]')).includes('Dr'));
    await r.escribir('select[aria-label="Especialidad"]', 'cardiologia');
    await r.esperar(`!document.querySelector('[data-testid=rejilla]')?.innerText.includes('Soliz')`, 10000, 'filtro por especialidad');
    comprobar('Agenda: el filtro de especialidad deja solo esos medicos', (await r.texto('[data-testid=rejilla]')).includes('Cardiologia') || (await r.texto('[data-testid=rejilla]')).includes('Cardiología'));
    sinProblemas(r, 'Agenda general');

    // Reservar: paciente por busqueda, especialidad, medico, dia y hora
    await irA(r, '/reservar', 'Reservar cita');
    await r.escribir('input[aria-label="Buscar paciente"]', 'SEED-P002');
    await r.esperar(`document.querySelectorAll('[data-testid=candidato]').length>=1`, 10000, 'candidatos');
    await r.clic('[data-testid=candidato] button', 'Elegir');
    await r.esperar(`!!document.querySelector('[data-testid=paciente-elegido]')`, 5000);
    await r.escribir('#es', 'general');
    await r.esperar(`document.querySelectorAll('#md option').length>1`, 10000, 'medicos de la especialidad');
    await r.escribir('#md', SOLIZ);
    const dias = await r.cuenta('.day');
    comprobar('Reservar: ofrece 8 dias y los medicos de la especialidad', dias === 8);
    await r.ev(`document.querySelectorAll('.day')[${indiceDia(diaA)}].click()`);
    await r.esperar(`document.querySelectorAll('[data-testid=slot]:not(.off)').length>0`, 15000, 'horarios libres');
    comprobar('Reservar: lista los horarios reales y marca los ocupados', (await r.cuenta('[data-testid=slot]')) > 0);
    await r.ev(`document.querySelector('[data-testid=slot]:not(.off)').click()`);
    const resumen = await r.texto();
    comprobar('Reservar: el resumen muestra el cargo provisional de la tarifa vigente', /Bs\s*\d+/.test(resumen), resumen.slice(-300));
    const clave = (await r.texto('[data-testid=clave]')).trim();
    comprobar('Reservar: muestra la Idempotency-Key real', /^[0-9a-f-]{36}$/.test(clave));
    await r.clic('button.pri', 'Confirmar cita');
    await r.esperar(`location.hash.includes('/cita?id=')`, 15000, 'detalle de la cita');
    citaId = await r.ev(`new URLSearchParams(location.hash.split('?')[1]).get('id')`);
    comprobar('Reservar: crea la cita (202) y abre su detalle', /^[0-9a-f-]{36}$/.test(citaId));
    await r.esperar(`document.querySelector('[data-testid=estado-cita]')?.innerText==='Confirmada'`, 40000, 'SAGA completada');
    comprobar('Detalle: la SAGA real termina en «Confirmada» sin recargar la pagina', true);
    await r.esperar(`document.querySelectorAll('[data-testid=paso]').length===3 && [...document.querySelectorAll('[data-testid=paso]')].every(p=>/Completado/.test(p.innerText))`, 30000, 'tres pasos completados');
    comprobar('Detalle: los tres pasos (MS3, MS6, MS8) aparecen completados', true);
    comprobar('Detalle: muestra el cargo (MS6) y el medico por su nombre', (await r.texto()).includes('Soliz') && /Bs\s*\d+/.test(await r.texto()));
    sinProblemas(r, 'Reserva y detalle');

    // Asistencia desde el detalle
    await r.clic('button', 'Registrar llegada');
    await r.esperar(`document.querySelector('[data-testid=estado-cita]')?.innerText==='En sala'`, 15000, 'en sala');
    comprobar('Detalle: registrar la llegada pasa la cita a «En sala» (MS3)', true);

    // Reprogramar y cancelar otra cita (creada por API)
    const hDia = (n) => `${new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10)}`;
    const slotsLibres = ((await api('GET', `/api/citas/disponibilidad?medicoId=${SOLIZ}&desde=${desdeISO}&hasta=${hastaISO}&limite=100`, tk)).datos?.items ?? []).filter((x) => x.estado === 'LIBRE' && Date.parse(x.fechaHora) > Date.now() + 3600e3);
    comprobar('Preparacion: hay horarios libres para las siguientes pruebas', slotsLibres.length >= 3, String(slotsLibres.length));
    const crear = async (slot) => (await api('POST', '/api/citas', tk, { pacienteId: P, medicoId: SOLIZ, especialidad: 'general', fechaHora: slot.fechaHora })).datos?.citaId;
    const c2 = await crear(slotsLibres[1]);
    const c3 = await crear(slotsLibres[2]);
    for (const id of [c2, c3]) {
      for (let i = 0; i < 40; i++) {
        if ((await api('GET', `/api/citas/${id}`, tk)).datos?.estado === 'CONFIRMADA') break;
        await dormir(1000);
      }
    }
    await irA(r, `/cita/reprogramar?id=${c2}`, 'Reprogramar cita');
    await r.ev(`document.querySelector('#d').value`);
    await r.escribir('#d', diaB);
    await r.esperar(`document.querySelectorAll('[data-testid=slot]').length>0 || !!document.querySelector('[data-testid=vacio]')`, 15000);
    if ((await r.cuenta('[data-testid=slot]')) > 0) {
      const nuevaHora = await r.ev(`document.querySelector('[data-testid=slot]').innerText`);
      await r.ev(`document.querySelector('[data-testid=slot]').click()`);
      await r.clic('button.pri', 'Confirmar nuevo horario');
      await r.esperar(`location.hash.includes('/cita?id=')`, 15000, 'volver al detalle');
      await dormir(1500);
      const c2n = (await api('GET', `/api/citas/${c2}`, tk)).datos;
      comprobar('Reprogramar: la cita cambia de fecha en MS3 y sigue confirmada', c2n?.estado === 'CONFIRMADA' && local(c2n.fechaHora) === diaB, `${c2n?.estado} ${c2n?.fechaHora} (${nuevaHora})`);
    } else {
      comprobar('Reprogramar: hay horarios el dia elegido', false, 'sin horarios libres pasado manana');
    }
    sinProblemas(r, 'Reprogramar');

    await irA(r, `/cita/cancelar?id=${c3}`, 'Cancelar cita');
    await r.esperar(`!!document.querySelector('#m')`, 10000);
    await r.escribir('#m', 'Médico no disponible');
    await r.clic('button.dng', 'Cancelar cita');
    await r.esperar(`location.hash.includes('/cita?id=')`, 15000, 'detalle tras cancelar');
    await r.esperar(`document.querySelector('[data-testid=estado-cita]')?.innerText==='Cancelada'`, 20000, 'cancelada');
    comprobar('Cancelar: la cita queda «Cancelada» y el cargo se anula', true);
    const f = (await api('GET', `/api/facturacion/facturas?citaId=${c3}`, tk)).datos?.items?.[0];
    comprobar('Cancelar: el cargo (MS6) pasa a ANULADA', await (async () => { for (let i = 0; i < 20; i++) { const x = (await api('GET', `/api/facturacion/facturas?citaId=${c3}`, tk)).datos?.items?.[0]; if (x?.estado === 'ANULADA') return true; await dormir(800); } return false; })(), String(f?.estado));
    sinProblemas(r, 'Cancelar');

    // Cita inexistente
    await irA(r, '/cita?id=00000000-0000-4000-8000-00000000dead');
    await r.esperar(`!!document.querySelector('.banner.err')`, 10000);
    comprobar('Detalle: una cita inexistente muestra el error 404 con codigo de soporte', (await r.texto('.banner.err')).match(/No se encontr/i) !== null && (await r.existe('[data-testid=correlation-id]')));
    r.limpiarProblemas();
  } finally {
    r.cerrar();
  }

  // ------------------------------------------------------------ medico
  seccion('Angular · Mi agenda (medico)');
  const m = await abrirNavegador({ nombre: 'medico' });
  try {
    await m.ir(SHELL);
    await m.login('medico');
    await irA(m, '/agenda-medico', 'Mi agenda');
    await m.esperar(`document.querySelectorAll('.kpi').length===3`, 15000, 'KPIs de la agenda');
    comprobar('Mi agenda: resuelve al medico por su usuario (sin claim) y muestra su nombre', (await m.texto()).includes('Soliz'));
    for (let i = 0; i < indiceDia(diaA); i++) await m.clic('button[aria-label="Día siguiente"]');
    await m.esperar(`document.querySelectorAll('[data-testid=fila-cita]').length>=1`, 15000, 'citas del dia reservado');
    comprobar('Mi agenda: lista las citas del dia con paciente real', (await m.texto('[data-testid=fila-cita]')).length > 3);
    comprobar('Mi agenda: «Siguiente paciente» con su N.° de historia', await m.intentar(`document.body.innerText.includes('Siguiente paciente') && /HC-\\d+/.test(document.body.innerText)`, 8000));
    sinProblemas(m, 'Mi agenda', [404, 403]);
  } finally {
    m.cerrar();
  }

  // ------------------------------------------------------------ administrador: horarios
  seccion('Angular · Horarios (administrador)');
  const a = await abrirNavegador({ nombre: 'admin-horarios' });
  const ta = await token('administrador');
  const MED = 'd0000000-0000-4000-8000-000000000003'; // odontologia
  const original = (await api('GET', `/api/citas/medicos/${MED}/horario`, ta)).datos;
  try {
    await a.ir(SHELL);
    await a.login('administrador');
    await irA(a, '/horarios', 'Horarios médicos');
    await a.esperar(`document.querySelectorAll('[data-testid=medico]').length>=4`, 15000, 'medicos');
    comprobar('Horarios: lista los medicos del catalogo', (await a.cuenta('[data-testid=medico]')) >= 4);
    await a.ev(`[...document.querySelectorAll('[data-testid=medico]')].find(b=>b.innerText.includes('Antelo')).click()`);
    await a.esperar(`document.querySelectorAll('[data-testid=dia]').length===7 && document.body.innerText.includes('Horario semanal · Dr. Marcelo Antelo')`, 15000, 'plantilla semanal del medico elegido');
    // Lunes debe quedar «atiende»: si ya lo estaba, no se vuelve a alternar.
    if ((await a.ev(`document.querySelector('button[aria-label="Atiende el Lunes"]').getAttribute('aria-checked')`)) !== 'true') {
      await a.ev(`document.querySelector('button[aria-label="Atiende el Lunes"]').click()`);
    }
    await a.esperar(`!!document.querySelector('input[aria-label="Lunes desde"]')`, 5000);
    await a.escribir('input[aria-label="Lunes desde"]', '09:00');
    await a.escribir('input[aria-label="Lunes hasta"]', '13:00');
    await a.clic('button.pri', 'Guardar horarios');
    await a.esperar(`document.body.innerText.includes('Horario guardado')`, 10000, 'guardado');
    const tras = (await api('GET', `/api/citas/medicos/${MED}/horario`, ta)).datos;
    const lunes = tras?.dias?.find((d) => d.dia === 1);
    comprobar('Horarios: guardar la plantilla llega a MS3', lunes?.atiende === true && lunes.desde === '09:00' && lunes.hasta === '13:00', JSON.stringify(lunes));
    // Bloqueo
    await a.clic('button', 'Agregar bloqueo');
    await a.esperar(`!!document.querySelector('#bd')`, 5000);
    const f1 = `${hDiaFuturo(20)}T09:00`; const f2 = `${hDiaFuturo(20)}T12:00`;
    await a.escribir('#bd', f1); await a.escribir('#bh', f2); await a.escribir('#bm', `Congreso e2e ${Date.now() % 10000}`);
    await a.clic('button', 'Bloquear');
    await a.esperar(`document.querySelectorAll('[data-testid=bloqueo]').length>=1`, 10000, 'bloqueo creado');
    comprobar('Horarios: crea un bloqueo y lo lista', true);
    await a.ev(`document.querySelector('[data-testid=bloqueo] button').click()`);
    await a.esperar(`document.querySelectorAll('[data-testid=bloqueo]').length===0`, 10000, 'bloqueo quitado');
    comprobar('Horarios: quita el bloqueo', true);
    sinProblemas(a, 'Horarios');
  } finally {
    // Se devuelve la plantilla original del medico de pruebas.
    if (original?.dias) await api('PUT', `/api/citas/medicos/${MED}/horario`, ta, { duracionMin: original.duracionMin, dias: original.dias });
    a.cerrar();
  }
}
const hDiaFuturo = (n) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);

export async function angular() {
  await pacientes();
  await citas();
}
