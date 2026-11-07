// Escenarios del shell (React): inicio por rol, administracion de usuarios, seguridad y estado de servicios. Datos reales del gateway.
import { abrirNavegador, api, borrarUsuarioKeycloak, comprobar, dormir, SHELL, seccion, token } from './harness.mjs';

const sinProblemas = (p, nombre) => {
  const { consola, http } = p.problemas();
  comprobar(`${nombre}: sin errores de consola ni HTTP inesperado`, consola.length === 0 && http.length === 0, JSON.stringify({ consola: consola.slice(0, 2), http: http.slice(0, 3) }));
  p.limpiarProblemas();
};
const kpis = (p) => p.ev(`[...document.querySelectorAll('[data-testid=kpis] .kpi')].map(k=>[k.querySelector('.v').textContent, k.querySelector('.l').textContent])`);
const irMenu = async (p, texto) => {
  await p.clic('aside a', texto);
  await dormir(400);
};

export async function shell() {
  const sufijo = Math.random().toString(36).slice(2, 8);
  const usuarioNuevo = `e2e.shell.${sufijo}`;

  // ---------------------------------------------------------------- administrador
  seccion('Shell · administrador');
  const a = await abrirNavegador({ nombre: 'admin' });
  try {
    await a.ir(SHELL);
    await a.login('administrador');
    await a.esperar(`document.querySelectorAll('[data-testid=kpis] .kpi').length===3 && !document.querySelector('[data-testid=kpis]').innerText.includes('…')`, 20000, 'KPIs del administrador');
    const k = await kpis(a);
    comprobar('Inicio: 3 KPIs reales (citas atendidas, ingresos, alertas)', k.length === 3 && k[1][0].startsWith('Bs') && /^\d+\+?$/.test(k[2][0]), JSON.stringify(k));
    comprobar('Inicio: ya no dice «cifras de ejemplo»', !(await a.texto()).includes('Cifras de ejemplo'));
    comprobar('Menu: el contador de Alertas viene del servicio', await a.ev(`/Alertas\\s*\\d+/.test(document.querySelector('aside').innerText)`) || (k[2][0] === '0'));
    sinProblemas(a, 'Inicio');

    await irMenu(a, 'Usuarios y roles');
    await a.esperar(`document.querySelectorAll('[data-testid=fila-usuario]').length>=5`, 15000, 'usuarios');
    comprobar('Usuarios: lista los 5 usuarios del reino', (await a.cuenta('[data-testid=fila-usuario]')) >= 5);
    await a.escribir('input[aria-label="Buscar usuario"]', 'recepcion');
    await a.esperar(`document.querySelectorAll('[data-testid=fila-usuario]').length===1`, 8000, 'filtro por texto');
    comprobar('Usuarios: la busqueda filtra en el servidor', (await a.texto('[data-testid=fila-usuario]')).includes('Recepción'));
    await a.escribir('input[aria-label="Buscar usuario"]', '');
    await a.clic('.seg button', 'Pacientes');
    await a.esperar(`document.querySelectorAll('[data-testid=fila-usuario]').length===1`, 8000, 'solo pacientes');
    comprobar('Usuarios: el grupo «Pacientes» muestra solo el rol paciente', (await a.texto('[data-testid=fila-usuario]')).includes('Paciente'));
    await a.clic('.seg button', 'Personal');
    await a.esperar(`document.querySelectorAll('[data-testid=fila-usuario]').length===4`, 8000, 'personal');
    comprobar('Usuarios: «Personal» excluye pacientes', (await a.cuenta('[data-testid=fila-usuario]')) === 4);
    await a.clic('.seg button', 'Todos');
    await a.escribir('input[aria-label="Buscar usuario"]', 'medico');
    await a.esperar(`document.querySelectorAll('[data-testid=fila-usuario]').length===1`, 8000);
    await a.clic('[data-testid=fila-usuario]');
    await a.esperar(`!!document.querySelector('#esp')`, 8000, 'campos de medico');
    comprobar('Usuarios: un medico muestra especialidad y matricula', await a.existe('#mat'));
    sinProblemas(a, 'Usuarios');

    // Crear un usuario de verdad por la pantalla
    await a.clic('a', 'Nuevo usuario');
    await a.esperar(`!!document.querySelector('#u')`, 8000, 'formulario nuevo usuario');
    await a.escribir('#u', usuarioNuevo);
    await a.escribir('#n', 'Prueba');
    await a.escribir('#a', 'Shell');
    await a.escribir('#c', `${usuarioNuevo}@sigec.test`);
    await a.escribir('#r', 'caja');
    await a.escribir('#pw', 'Temporal12345');
    await a.clic('button[type=submit]');
    await a.esperar(`location.pathname==='/admin/usuarios' && document.body.innerText.includes('Usuario creado')`, 15000, 'redireccion con aviso');
    comprobar('Nuevo usuario: se crea en Keycloak y vuelve a la lista con aviso', true);
    // El mismo usuario otra vez: 409 mostrado en pantalla
    await a.clic('a', 'Nuevo usuario');
    await a.esperar(`!!document.querySelector('#u')`, 8000);
    await a.escribir('#u', usuarioNuevo);
    await a.escribir('#n', 'Otra');
    await a.escribir('#a', 'Vez');
    await a.escribir('#c', `otro.${usuarioNuevo}@sigec.test`);
    a.limpiarProblemas();
    await a.clic('button[type=submit]');
    await a.esperar(`!!document.querySelector('[role=alert]')`, 10000, 'error de duplicado');
    comprobar('Nuevo usuario: duplicado -> mensaje claro con codigo de soporte', (await a.texto('[role=alert]')).includes('Ya existe') && (await a.existe('[data-testid=correlation-id]')));
    comprobar('...fue un 409 (esperado) y nada mas fallo', a.problemas().http.every((h) => h.estado === 409) && a.problemas().consola.length === 0);
    a.limpiarProblemas();
    // Validacion por campo (rol paciente sin pacienteId)
    await a.escribir('#u', `${usuarioNuevo}.x`);
    await a.escribir('#r', 'paciente');
    await a.escribir('#p', 'no-es-uuid');
    await a.clic('button[type=submit]');
    await a.esperar(`document.querySelectorAll('[role=alert]').length>0`, 10000);
    comprobar('Nuevo usuario: un pacienteId invalido se rechaza', (await a.texto()).match(/UUID|vincul|paciente/i) !== null);
    a.limpiarProblemas();

    // Cambiar rol y deshabilitar al usuario creado, desde el panel de detalle
    await a.ir(SHELL + '/admin/usuarios');
    await a.esperar(`!!document.querySelector('input[aria-label="Buscar usuario"]')`, 15000);
    await a.escribir('input[aria-label="Buscar usuario"]', usuarioNuevo);
    await a.esperar(`document.querySelectorAll('[data-testid=fila-usuario]').length===1`, 10000, 'usuario creado en la lista');
    await a.clic('[data-testid=fila-usuario]');
    await a.esperar(`!!document.querySelector('[data-testid=detalle-usuario] #rol')`, 8000);
    await a.escribir('#rol', 'recepcion');
    await a.clic('button', 'Guardar cambios');
    await a.esperar(`document.body.innerText.includes('Cambios guardados')`, 10000, 'guardado');
    const tk = await token('administrador');
    const lista = (await api('GET', `/api/identidad/usuarios?q=${usuarioNuevo}`, tk)).datos;
    comprobar('Detalle: cambiar el rol llega a Keycloak (caja -> recepcion)', lista?.items?.[0]?.roles?.[0] === 'recepcion');
    await a.clic('button[role=switch]');
    await a.esperar(`document.body.innerText.includes('deshabilitada')`, 10000, 'deshabilitar');
    const tras = (await api('GET', `/api/identidad/usuarios?q=${usuarioNuevo}`, tk)).datos;
    comprobar('Detalle: deshabilitar la cuenta se refleja en Keycloak', tras?.items?.[0]?.activo === false);
    sinProblemas(a, 'Detalle de usuario');

    await irMenu(a, 'Sesiones y seguridad');
    await a.esperar(`document.querySelectorAll('[data-testid=fila-sesion]').length>=1`, 15000, 'sesiones');
    comprobar('Seguridad: lista sesiones reales con la propia marcada', (await a.texto('[data-testid=fila-sesion]')).length > 0 && (await a.ev(`document.body.innerText.includes('usted')`)));
    comprobar('Seguridad: KPIs numericos', (await kpis(a)).every(([v]) => /^\d+\+?$/.test(v)), JSON.stringify(await kpis(a)));
    await a.clic('.seg button', 'Fallidos');
    await dormir(800);
    comprobar('Seguridad: filtro «Fallidos» no rompe', !(await a.existe('[role=alert]')));
    await a.clic('.seg button', 'Cambios de rol');
    await a.esperar(`document.body.innerText.includes('Cambio de rol') || !!document.querySelector('[data-testid=vacio]')`, 10000);
    comprobar('Seguridad: «Cambios de rol» muestra el cambio recien hecho', (await a.texto()).includes('Cambio de rol'));
    sinProblemas(a, 'Seguridad');

    await irMenu(a, 'Estado de servicios');
    await a.esperar(`document.querySelectorAll('[data-testid=fila-servicio]').length>=9`, 20000, 'servicios');
    const filas = await a.ev(`[...document.querySelectorAll('[data-testid=fila-servicio]')].map(r=>[r.children[0].innerText, r.children[2].innerText])`);
    comprobar('Servicios: 9 componentes de la pila', filas.length === 9, String(filas.length));
    comprobar('Servicios: gateway y Keycloak operativos', filas.filter(([n]) => /Gateway|Keycloak/.test(n)).every(([, e]) => e === 'Operativo'), JSON.stringify(filas));
    sinProblemas(a, 'Servicios');

    await a.ir(SHELL + '/recuperar');
    await a.esperar(`document.body.innerText.includes('Ir a Keycloak')`, 10000);
    comprobar('Recuperar: explica el camino real por Keycloak (sin envio simulado)', !(await a.texto()).includes('rosa.mamani'));
  } finally {
    a.cerrar();
    await borrarUsuarioKeycloak(usuarioNuevo);
  }

  // ---------------------------------------------------------------- otros roles
  for (const [usuario, etiquetaKpi] of [['recepcion', 'Citas de hoy'], ['medico', 'Pacientes de hoy'], ['caja', 'Cargos pendientes']]) {
    seccion(`Shell · ${usuario}`);
    const p = await abrirNavegador({ nombre: usuario });
    try {
      await p.ir(SHELL);
      await p.login(usuario);
      await p.esperar(`document.querySelectorAll('[data-testid=kpis] .kpi').length===3 && !document.querySelector('[data-testid=kpis]').innerText.includes('…')`, 20000, 'KPIs');
      const k = await kpis(p);
      comprobar(`Inicio: KPIs reales de ${usuario}`, k.length === 3 && k[0][1].includes(etiquetaKpi.split(' ')[0]), JSON.stringify(k));
      sinProblemas(p, `Inicio de ${usuario}`);
      if (usuario === 'recepcion') {
        p.ir(SHELL + '/admin/usuarios');
        await p.esperar(`document.body.innerText.includes('No tiene permiso')`, 15000, 'sin permiso');
        comprobar('Recepcion no entra a administracion de usuarios (403 de pantalla)', true);
      }
    } finally {
      p.cerrar();
    }
  }
}
