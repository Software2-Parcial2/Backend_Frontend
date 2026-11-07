import { describe, expect, it, vi } from 'vitest';
import { ApiError, crearCliente, esConflictoVersion, esperarCita, nuevaIntencion, type OpcionesCliente } from '../src/index.js';

type Llamada = { url: string; init: RequestInit; cab: Record<string, string> };

function falso(respuestas: (Response | ((l: Llamada) => Response))[]) {
  const llamadas: Llamada[] = [];
  let i = 0;
  const fetchFn = (async (url: string, init: RequestInit = {}) => {
    const l = { url: String(url), init, cab: Object.fromEntries(Object.entries((init.headers ?? {}) as Record<string, string>)) };
    llamadas.push(l);
    const r = respuestas[Math.min(i++, respuestas.length - 1)]!;
    return typeof r === 'function' ? r(l) : r.clone(); // clon: el original nunca se lee, asi se puede repetir
  }) as unknown as typeof fetch;
  return { fetchFn, llamadas };
}
const json = (b: unknown, status = 200, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/json', ...h } });
const problema = (b: object, status: number, h: Record<string, string> = {}) =>
  new Response(JSON.stringify(b), { status, headers: { 'content-type': 'application/problem+json', ...h } });

function cliente(resp: Parameters<typeof falso>[0], extra: Partial<OpcionesCliente> = {}) {
  const f = falso(resp);
  const c = crearCliente({ baseUrl: 'http://gw/', token: () => 'T1', fetch: f.fetchFn, ...extra });
  return { c, ...f };
}

describe('cabeceras', () => {
  it('envia token en vivo, correlacion, idioma y consulta con query', async () => {
    let token = 'A';
    const { c, llamadas } = cliente([json({ ok: 1 })], { token: () => token });
    token = 'B'; // el token se lee en cada peticion, no al crear el cliente
    await c.get('/api/pacientes', { query: { q: 'Rojas', limite: 10, cursor: undefined, vacio: '' } });
    expect(llamadas[0]!.url).toBe('http://gw/api/pacientes?q=Rojas&limite=10');
    expect(llamadas[0]!.cab.Authorization).toBe('Bearer B');
    expect(llamadas[0]!.cab['X-Correlation-Id']).toMatch(/^[0-9a-f-]{36}$/);
    expect(llamadas[0]!.cab['Accept-Language']).toBe('es');
    expect(llamadas[0]!.cab['Idempotency-Key']).toBeUndefined(); // los GET no la llevan
  });

  it('POST/PUT/PATCH llevan Idempotency-Key; la clave indicada se reutiliza en el reintento', async () => {
    const { c, llamadas } = cliente([json({}, 201)]);
    const it = nuevaIntencion();
    await c.post('/api/citas', { a: 1 }, { clave: it.clave });
    await c.post('/api/citas', { a: 1 }, { clave: it.clave });
    expect(llamadas[0]!.cab['Idempotency-Key']).toBe(llamadas[1]!.cab['Idempotency-Key']);
    const anterior = it.clave;
    expect(it.renovar()).not.toBe(anterior);
    await c.put('/api/x', {});
    await c.patch('/api/x', {});
    expect(llamadas[2]!.cab['Idempotency-Key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(llamadas[2]!.cab['Idempotency-Key']).not.toBe(llamadas[3]!.cab['Idempotency-Key']); // sin clave dada: una por llamada
    await c.post('/api/identidad/usuarios', {}, { clave: false });
    expect(llamadas[4]!.cab['Idempotency-Key']).toBeUndefined();
    expect(llamadas[0]!.init.body).toBe('{"a":1}');
    expect(llamadas[0]!.cab['Content-Type']).toBe('application/json');
  });
});

describe('ETag e If-Match', () => {
  it('guarda el ETag de un GET y lo manda como If-Match al editar esa ruta', async () => {
    const { c, llamadas } = cliente([json({ id: 1 }, 200, { etag: '"4"' }), json({ id: 1 }, 200, { etag: '"5"' })]);
    const r = await c.leer('/api/pacientes/1');
    expect(r.etag).toBe('4');
    expect(c.etagDe('/api/pacientes/1')).toBe('4');
    await c.put('/api/pacientes/1', { nombre: 'x' }, { ifMatch: 'auto' });
    expect(llamadas[1]!.cab['If-Match']).toBe('"4"');
    expect(c.etagDe('/api/pacientes/1')).toBe('5'); // el PUT devuelve la version nueva
    await c.put('/api/pacientes/1', {}, { ifMatch: 9 });
    expect(llamadas[2]!.cab['If-Match']).toBe('"9"');
  });

  it('sin ETag conocido no inventa la cabecera', async () => {
    const { c, llamadas } = cliente([json({})]);
    await c.put('/api/algo/1', {}, { ifMatch: 'auto' });
    expect(llamadas[0]!.cab['If-Match']).toBeUndefined();
  });
});

describe('errores problem+json', () => {
  it('traduce el cuerpo a ApiError con code, errores por campo y correlationId', async () => {
    const { c } = cliente([problema({ title: 'Solicitud invalida', status: 400, detail: 'Hay campos que no cumplen las reglas', code: 'VALIDACION', errors: [{ campo: 'documento', mensaje: 'obligatorio' }], correlationId: 'abc' }, 400)]);
    const e = (await c.post('/api/pacientes', {}).catch((x) => x)) as ApiError;
    expect(e).toBeInstanceOf(ApiError);
    expect([e.estado, e.code, e.correlationId, e.mensajeDe('documento')]).toEqual([400, 'VALIDACION', 'abc', 'obligatorio']);
    expect(e.message).toBe('Hay campos que no cumplen las reglas');
  });

  it('409 VERSION_CONFLICTO expone la version vigente', async () => {
    const { c } = cliente([problema({ code: 'VERSION_CONFLICTO', detail: 'otro modifico', versionVigente: 7 }, 409)]);
    const e = await c.put('/api/historias/consultas/1', {}).catch((x) => x);
    expect(esConflictoVersion(e)).toBe(true);
    expect(e.versionVigente).toBe(7);
  });

  it('usa el code del estado si el servidor no manda uno, y soporta el formato {message}', async () => {
    const { c } = cliente([problema({}, 403), json({ statusCode: 404, message: ['no existe', 'otra cosa'] }, 404), new Response('<html>caido</html>', { status: 502, headers: { 'content-type': 'text/html' } })]);
    expect((await c.get('/a').catch((x) => x)).code).toBe('PROHIBIDO');
    const e404 = await c.get('/b').catch((x) => x);
    expect([e404.code, e404.message]).toEqual(['NO_ENCONTRADO', 'no existe; otra cosa']);
    const e502 = await c.get('/c').catch((x) => x);
    expect([e502.estado, e502.code, e502.detalle]).toEqual([502, 'ERROR_INTERNO', '<html>caido</html>']);
  });

  it('sin red: ApiError estado 0 SIN_CONEXION; un abort NO es ApiError', async () => {
    const c = crearCliente({ baseUrl: 'http://gw', token: () => 't', fetch: (async () => { throw new TypeError('Failed to fetch'); }) as typeof fetch });
    const e = await c.get('/x').catch((x) => x);
    expect([e.estado, e.code]).toEqual([0, 'SIN_CONEXION']);
    const abortado = crearCliente({ baseUrl: 'http://gw', token: () => 't', fetch: (async () => { throw new DOMException('x', 'AbortError'); }) as typeof fetch });
    const a = await abortado.get('/x').catch((x) => x);
    expect(a).not.toBeInstanceOf(ApiError);
    expect(a.name).toBe('AbortError');
  });
});

describe('401 y reintentos', () => {
  it('ante un 401 pide renovar y repite UNA vez con el token nuevo', async () => {
    let token = 'viejo';
    const alNoAutenticado = vi.fn(async () => void (token = 'nuevo'));
    const { c, llamadas } = cliente([problema({ code: 'NO_AUTENTICADO' }, 401), json({ ok: true })], { token: () => token, alNoAutenticado });
    expect(await c.get('/api/x')).toEqual({ ok: true });
    expect(llamadas.map((l) => l.cab.Authorization)).toEqual(['Bearer viejo', 'Bearer nuevo']);
    expect(alNoAutenticado).toHaveBeenCalledTimes(1);
  });

  it('si sigue el 401 tras renovar, el error sube (no hay bucle)', async () => {
    const { c, llamadas } = cliente([problema({}, 401)], { alNoAutenticado: async () => undefined });
    const e = await c.get('/api/x').catch((x) => x);
    expect(e.estado).toBe(401);
    expect(llamadas).toHaveLength(2);
  });

  it('alNoAutenticado devuelve false: no repite', async () => {
    const { c, llamadas } = cliente([problema({}, 401)], { alNoAutenticado: async () => false });
    await c.get('/api/x').catch(() => undefined);
    expect(llamadas).toHaveLength(1);
  });

  it('GET con Retry-After corto espera y repite una vez; los POST no se repiten solos', async () => {
    const { c, llamadas } = cliente([problema({}, 503, { 'retry-after': '1' }), json({ ok: 1 })]);
    const t0 = Date.now();
    expect(await c.get('/api/x')).toEqual({ ok: 1 });
    expect(Date.now() - t0).toBeGreaterThanOrEqual(900);
    expect(llamadas).toHaveLength(2);
    const p = cliente([problema({}, 503, { 'retry-after': '1' })]);
    await p.c.post('/api/x', {}).catch(() => undefined);
    expect(p.llamadas).toHaveLength(1);
  });
});

describe('respuestas', () => {
  it('201 con Location y Idempotent-Replay; 204 sin cuerpo', async () => {
    const { c } = cliente([json({ id: 'p1' }, 201, { location: '/api/pacientes/p1', 'idempotent-replay': 'true' }), new Response(null, { status: 204 })]);
    const r = await c.enviar<{ id: string }>('POST', '/api/pacientes', {});
    expect([r.estado, r.ubicacion, r.repetida, r.datos.id]).toEqual([201, '/api/pacientes/p1', true, 'p1']);
    expect(await c.delete('/api/x/1')).toBeUndefined();
  });

  it('subir envia el FormData sin forzar Content-Type', async () => {
    const { c, llamadas } = cliente([json({ id: 'i1' }, 201)]);
    const fd = new FormData();
    fd.set('pacienteId', 'p');
    await c.subir('/api/imagenes', fd);
    expect(llamadas[0]!.init.body).toBe(fd);
    expect(llamadas[0]!.cab['Content-Type']).toBeUndefined();
    expect(llamadas[0]!.cab['Idempotency-Key']).toBeDefined();
  });

  it('descargar devuelve el blob y el nombre de Content-Disposition', async () => {
    const { c } = cliente([new Response('PDF', { headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="reporte%20citas.pdf"' } })]);
    const d = await c.descargar('/api/inteligencia/reportes', { metodo: 'POST', cuerpo: { a: 1 } });
    expect([d.nombre, d.tipo, await d.blob.text()]).toEqual(['reporte citas.pdf', 'application/pdf', 'PDF']);
  });
});

describe('listas con cursor', () => {
  it('pagina() manda limite y cursor; todas() sigue el cursor hasta el final o hasta el tope', async () => {
    const { c, llamadas } = cliente([
      json({ items: [1, 2], siguiente: 'c1' }), json({ items: [3, 4], siguiente: 'c2' }), json({ items: [5], siguiente: null }),
    ]);
    const todas = await c.todas<number>('/api/x', { limite: 2 });
    expect(todas).toEqual({ items: [1, 2, 3, 4, 5], truncado: false });
    expect(llamadas.map((l) => new URL(l.url).searchParams.get('cursor'))).toEqual([null, 'c1', 'c2']);
    const tope = cliente([json({ items: [1, 2], siguiente: 'c1' }), json({ items: [3, 4], siguiente: 'c2' })]);
    expect(await tope.c.todas<number>('/api/x', { limite: 2, maximo: 3 })).toEqual({ items: [1, 2, 3], truncado: true });
    const p = cliente([json({ items: [], siguiente: null })]);
    expect(await p.c.pagina('/api/x', { limite: 5, cursor: 'zz' })).toEqual({ items: [], siguiente: null });
    expect(p.llamadas[0]!.url).toContain('limite=5&cursor=zz');
  });
});

describe('esperarCita', () => {
  it('consulta hasta un estado final y avisa de cada cambio', async () => {
    const estados = ['RESERVADA', 'COBRO_PROVISIONAL', 'COBRO_PROVISIONAL', 'CONFIRMADA'];
    const { c, llamadas } = cliente(estados.map((estado) => json({ citaId: 'c1', estado })));
    const vistos: string[] = [];
    const r = await esperarCita(c, 'c1', { intervaloMs: 1, alCambio: (x) => vistos.push(x.estado) });
    expect(r.estado).toBe('CONFIRMADA');
    expect(vistos).toEqual(['RESERVADA', 'COBRO_PROVISIONAL', 'CONFIRMADA']);
    expect(llamadas).toHaveLength(4);
  });

  it('una cita cancelada por la SAGA tambien es final; el tiempo agotado lanza TIEMPO_AGOTADO', async () => {
    const a = cliente([json({ citaId: 'c', estado: 'CANCELADA', motivoFallo: 'cobro rechazado' })]);
    expect((await esperarCita(a.c, 'c')).motivoFallo).toBe('cobro rechazado');
    const b = cliente([json({ citaId: 'c', estado: 'RESERVADA' })]);
    const e = await esperarCita(b.c, 'c', { intervaloMs: 1, maxMs: 20 }).catch((x) => x);
    expect(e.code).toBe('TIEMPO_AGOTADO');
  });

  it('se puede cancelar con AbortSignal', async () => {
    const b = cliente([json({ citaId: 'c', estado: 'RESERVADA' })]);
    const ac = new AbortController();
    const p = esperarCita(b.c, 'c', { intervaloMs: 50, signal: ac.signal });
    setTimeout(() => ac.abort(), 10);
    expect((await p.catch((x) => x)).name).toBe('AbortError');
  });
});
