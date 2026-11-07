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

export async function angular() {
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
