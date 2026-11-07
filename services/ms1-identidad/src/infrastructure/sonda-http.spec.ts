import { describe, expect, it } from 'vitest';
import { SondaHttp, sondasPorDefecto } from './sonda-http.js';

describe('SondaHttp', () => {
  const s = { nombre: 'x', url: 'http://x/health' };
  it('2xx es OK; otro estado y los fallos de red se reportan sin lanzar', async () => {
    expect(await new SondaHttp(async () => new Response('ok')).comprobar(s, 100)).toMatchObject({ ok: true, detalle: null });
    expect(await new SondaHttp(async () => new Response('', { status: 503 })).comprobar(s, 100)).toMatchObject({ ok: false, detalle: 'HTTP 503' });
    expect(await new SondaHttp(async () => { throw new Error('ECONNREFUSED'); }).comprobar(s, 100)).toMatchObject({ ok: false, detalle: 'no responde' });
    const lenta = new SondaHttp((_u, init) => new Promise((_ok, no) => init!.signal!.addEventListener('abort', () => no(init!.signal!.reason))));
    expect(await lenta.comprobar(s, 20)).toMatchObject({ ok: false, detalle: 'sin respuesta a tiempo' });
  });
  it('las sondas por defecto cubren la pila y se pueden sustituir por entorno', () => {
    const d = sondasPorDefecto({});
    expect(d.map((x) => x.nombre)).toEqual(['gateway', 'keycloak', 'ms2-pacientes', 'ms3-citas', 'ms4-historias', 'ms5-imagenes', 'ms6-facturacion', 'ms7-inteligencia', 'ms8-notificaciones']);
    expect(sondasPorDefecto({ SALUD_SERVICIOS: '[{"nombre":"a","url":"http://a"}]' })).toEqual([{ nombre: 'a', url: 'http://a' }]);
    expect(() => sondasPorDefecto({ SALUD_SERVICIOS: '[{"nombre":"a"}]' })).toThrow();
  });
});
